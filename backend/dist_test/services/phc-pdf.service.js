"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePhcPdfBuffer = generatePhcPdfBuffer;
const pdfkit_1 = __importDefault(require("pdfkit"));
const path = __importStar(require("path"));
const gender_detect_1 = require("./gender-detect");
const phc_templates_1 = require("./phc-templates");
// --- Helpers -----------------------------------------------------------------
function todayBR() {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function cityState(city, state) {
    return [city, state].filter(Boolean).join('/') || 'Local não informado';
}
function localData(city, state) {
    return `${cityState(city, state)}, ${todayBR()}.`;
}
function lawyerFullAddr(l) {
    const parts = [l.street || l.address, l.street_number, l.neighborhood, l.complement].filter(Boolean).join(', ');
    const cidade = cityState(l.city, l.state);
    const cep = l.cep ? `, CEP ${l.cep}` : '';
    return `${parts || 'endereço não informado'}, na cidade de ${cidade}${cep}`;
}
// --- PDF core ----------------------------------------------------------------
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REG = path.join(FONT_DIR, 'Arial-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Arial-Bold.ttf');
/** Only draws lines — safe inside pageAdded (no doc.text which can recurse) */
function decoratePageLines(doc) {
    const w = doc.page.width, h = doc.page.height;
    doc.save().moveTo(50, 46).lineTo(w - 50, 46).lineWidth(1.5).strokeColor('#B8860B').stroke().restore();
    doc.save().moveTo(50, h - 36).lineTo(w - 50, h - 36).lineWidth(0.35).strokeColor('#ccc').stroke().restore();
}
/**
 * Footer text — temporarily removes the bottom margin so PDFKit never triggers
 * continueOnNewPage when writing near the bottom of the page.
 */
function addFooter(doc) {
    const w = doc.page.width, h = doc.page.height;
    const origBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('MyFont').fontSize(7).fillColor('#bbb')
        .text('Documento gerado pelo Sistema Legacy.', 50, h - 33, { align: 'center', width: w - 100, lineBreak: false });
    doc.page.margins.bottom = origBottom;
}
/** top=78 so content starts well below the decorative bar at y=46 */
function createDoc() {
    const doc = new pdfkit_1.default({ size: 'A4', margins: { top: 78, bottom: 45, left: 48, right: 48 } });
    doc.registerFont('MyFont', FONT_REG);
    doc.registerFont('MyFont-Bold', FONT_BOLD);
    doc.on('pageAdded', () => decoratePageLines(doc));
    decoratePageLines(doc);
    return doc;
}
function collectBuffer(doc) {
    return new Promise((res, rej) => {
        const c = [];
        doc.on('data', (b) => c.push(b));
        doc.on('end', () => res(Buffer.concat(c)));
        doc.on('error', rej);
    });
}
// --- Shared layout helpers ---------------------------------------------------
function sig(doc, label, name, extra) {
    doc.moveDown(1.5);
    const x0 = 80, x1 = doc.page.width - 80;
    doc.save().moveTo(x0, doc.y).lineTo(x1, doc.y).lineWidth(0.45).strokeColor('#555').stroke().restore();
    doc.moveDown(0.4).font('MyFont').fontSize(9).fillColor('#666').text(label, { align: 'center' });
    doc.font('MyFont-Bold').fontSize(9.5).fillColor('#111').text(name, { align: 'center' });
    if (extra)
        doc.font('MyFont').fontSize(8.5).fillColor('#666').text(extra, { align: 'center' });
}
function witness(doc) {
    doc.moveDown(1.5);
    const mid = doc.page.width / 2, y = doc.y;
    doc.save().moveTo(68, y).lineTo(mid - 10, y).lineWidth(0.45).strokeColor('#555').stroke().restore();
    doc.save().moveTo(mid + 10, y).lineTo(doc.page.width - 68, y).lineWidth(0.45).strokeColor('#555').stroke().restore();
    const lw = mid - 10 - 68, rw = doc.page.width - 68 - (mid + 10);
    doc.moveDown(0.4).font('MyFont').fontSize(9).fillColor('#666');
    doc.text('Testemunha 1', 68, doc.y, { width: lw, align: 'center' });
    doc.text('Testemunha 2', mid + 10, doc.y - doc.currentLineHeight(), { width: rw, align: 'center' });
}
// --- Contrato (meta: 2 paginas) ----------------------------------------------
async function genContrato(lead, lawyer, notes) {
    const doc = createDoc(), buf = collectBuffer(doc);
    const g = (0, gender_detect_1.buildCtx)(lead.name, lead.marital_status, lead.occupation, lead.gender);
    const slug = lead.funnel_slug || lead.funnel_name || 'geral';
    const acao = (0, phc_templates_1.getAcaoContrato)(slug);
    const foro = cityState(lawyer.city, lawyer.state);
    // Contrato: fonte 10.5pt, lineGap 3.5 — preenche bem 2 paginas
    const FS = 10.5;
    const LG = 3.5;
    const MD = 0.55;
    const advStr = `${lawyer.name}, advogado inscrit${g.o_a} na ${lawyer.oab}, com escritório profissional localizado à ${lawyerFullAddr(lawyer)}`;
    const cliStr = (0, phc_templates_1.clienteQual)(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);
    const data = {
        advQualificacao: advStr, clienteQualificacao: cliStr, g, acao, foro,
        localData: localData(lead.city, lead.state),
        advNome: lawyer.name, advOab: lawyer.oab,
        clienteNome: lead.name.toUpperCase(), clienteCpf: lead.cpf,
    };
    const p = (0, phc_templates_1.buildContrato)(data);
    // Titulo
    doc.font('MyFont-Bold').fontSize(12).fillColor('#1a1a1a')
        .text('INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS', { align: 'center' });
    doc.moveDown(0.3).font('MyFont').fontSize(9.5).fillColor('#555')
        .text('"CONTRATO DE RISCO"', { align: 'center' });
    doc.moveDown(1);
    // Introducao
    doc.font('MyFont').fontSize(FS).fillColor('#111').text(p[0], { align: 'left', lineGap: LG });
    doc.moveDown(MD);
    doc.font('MyFont').fontSize(FS).fillColor('#111').text(p[1], { align: 'justify', lineGap: LG });
    doc.moveDown(MD);
    // Helper de secao local
    const sec = (t) => {
        doc.moveDown(0.65).font('MyFont-Bold').fontSize(10).fillColor('#8B6914').text(t.toUpperCase());
        const y = doc.y + 2;
        doc.save().moveTo(52, y).lineTo(doc.page.width - 52, y).lineWidth(0.3).strokeColor('#C9A227').stroke().restore();
        doc.moveDown(0.5);
    };
    const cl = (t) => {
        doc.font('MyFont').fontSize(FS).fillColor('#111').text(t, { align: 'left', lineGap: LG });
        doc.moveDown(MD);
    };
    sec(p[2]);
    cl(p[3]);
    sec(p[4]);
    for (let i = 5; i <= 13; i++)
        cl(p[i]);
    sec(p[14]);
    for (let i = 15; i <= 17; i++)
        cl(p[i]);
    sec(p[18]);
    cl(p[19]);
    if (notes) {
        sec('OBSERVAÇÕES');
        cl(notes);
    }
    doc.moveDown(0.4).font('MyFont').fontSize(FS).fillColor('#111').text(p[20], { align: 'left' });
    sig(doc, 'Contratado', lawyer.name, `OAB ${lawyer.oab}`);
    sig(doc, `Contratante${lead.cpf ? ' — CPF: ' + lead.cpf : ''}`, lead.name.toUpperCase());
    witness(doc);
    addFooter(doc);
    doc.end();
    return buf;
}
// --- Procuracao (meta: 1 pagina) ---------------------------------------------
async function genProcuracao(lead, lawyer, notes) {
    const doc = createDoc(), buf = collectBuffer(doc);
    const g = (0, gender_detect_1.buildCtx)(lead.name, lead.marital_status, lead.occupation, lead.gender);
    const slug = lead.funnel_slug || lead.funnel_name || 'geral';
    const acao = (0, phc_templates_1.getAcaoProcuracao)(slug);
    const cliStr = (0, phc_templates_1.clienteQual)(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);
    const data = {
        clienteQualificacao: cliStr, advNome: lawyer.name, advOab: lawyer.oab,
        advEndereco: lawyerFullAddr(lawyer), g, acao,
        localData: localData(lead.city, lead.state),
        clienteNome: lead.name.toUpperCase(),
    };
    const p = (0, phc_templates_1.buildProcuracao)(data);
    // Titulo maior — 13pt
    doc.font('MyFont-Bold').fontSize(13).fillColor('#1a1a1a').text(p[0], { align: 'center' });
    doc.moveDown(0.9);
    // Procuracao: fonte 10pt, lineGap 4.5 — preenche a pagina com boa leiturabilidade
    doc.font('MyFont').fontSize(10).fillColor('#111').text(p[1], { align: 'justify', lineGap: 4.5 });
    doc.moveDown(0.8);
    if (notes) {
        doc.moveDown(0.3).font('MyFont-Bold').fontSize(10).fillColor('#8B6914').text('OBSERVAÇÕES:');
        doc.font('MyFont').fontSize(10).fillColor('#111').text(notes, { align: 'justify', lineGap: 4.5 });
        doc.moveDown(0.6);
    }
    doc.font('MyFont').fontSize(10).fillColor('#111').text(p[2], { align: 'left' });
    sig(doc, 'Outorgante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
    addFooter(doc);
    doc.end();
    return buf;
}
// --- Declaracao de Hipossuficiencia (meta: 1 pagina) -------------------------
async function genHipo(lead, notes) {
    const doc = createDoc(), buf = collectBuffer(doc);
    const g = (0, gender_detect_1.buildCtx)(lead.name, lead.marital_status, lead.occupation, lead.gender);
    const cliStr = (0, phc_templates_1.clienteQual)(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);
    const data = {
        clienteQualificacao: cliStr, g,
        localData: localData(lead.city, lead.state),
        clienteNome: lead.name.toUpperCase(),
    };
    const p = (0, phc_templates_1.buildDeclaracaoHipo)(data);
    // Titulo grande 14pt — documento curto tem muito espaco para respirar
    doc.font('MyFont-Bold').fontSize(14).fillColor('#1a1a1a').text(p[0], { align: 'center' });
    doc.moveDown(1.5);
    // Declaracao: fonte 12pt, lineGap 16 — preenche elegantemente a pagina
    doc.font('MyFont').fontSize(12).fillColor('#111').text(p[1], { align: 'justify', lineGap: 16 });
    doc.moveDown(2);
    if (notes) {
        doc.font('MyFont-Bold').fontSize(12).fillColor('#8B6914').text('OBSERVAÇÕES:');
        doc.moveDown(0.4);
        doc.font('MyFont').fontSize(12).fillColor('#111').text(notes, { align: 'justify', lineGap: 16 });
        doc.moveDown(1.5);
    }
    doc.font('MyFont').fontSize(12).fillColor('#111').text(p[2], { align: 'left' });
    doc.moveDown(0.5);
    sig(doc, 'Declarante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
    addFooter(doc);
    doc.end();
    return buf;
}
// --- Public API --------------------------------------------------------------
async function generatePhcPdfBuffer(docType, lead, lawyer, notes) {
    switch (docType) {
        case 'procuracao': return genProcuracao(lead, lawyer, notes);
        case 'declaracao_hipo': return genHipo(lead, notes);
        case 'contrato': return genContrato(lead, lawyer, notes);
        default: throw new Error('Unknown docType: ' + docType);
    }
}
//# sourceMappingURL=phc-pdf.service.js.map