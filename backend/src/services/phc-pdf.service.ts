import PDFDocument from 'pdfkit';
import * as path from 'path';
import { buildCtx } from './gender-detect';
import {
  getAcaoContrato, getAcaoProcuracao, clienteQual,
  buildContrato, buildProcuracao, buildDeclaracaoHipo,
  ContratoData, ProcuracaoData, HipoData,
} from './phc-templates';

// --- Types -------------------------------------------------------------------
export interface LeadData {
  name: string; cpf?: string|null; rg?: string|null;
  marital_status?: string|null; occupation?: string|null;
  nationality?: string|null; address?: string|null;
  city?: string|null; state?: string|null; cep?: string|null;
  phone?: string|null; email?: string|null;
  description?: string|null; funnel_name?: string|null;
  funnel_slug?: string|null; birthdate?: string|null;
  gender?: 'F'|'M'|null;
}

export interface LawyerData {
  name: string; oab: string; cpf?: string|null;
  address?: string|null; street?: string|null; street_number?: string|null;
  neighborhood?: string|null; complement?: string|null;
  city?: string|null; state?: string|null; cep?: string|null;
  additional_info?: string|null;
}

type DocType = 'procuracao'|'declaracao_hipo'|'contrato';

// --- Helpers -----------------------------------------------------------------
function todayBR(): string {
  return new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
}
function cityState(city?:string|null, state?:string|null): string {
  return [city, state].filter(Boolean).join('/') || 'Local não informado';
}
function localData(city?:string|null, state?:string|null): string {
  return `${cityState(city,state)}, ${todayBR()}.`;
}
function lawyerFullAddr(l:LawyerData): string {
  const parts = [l.street||l.address, l.street_number, l.neighborhood, l.complement].filter(Boolean).join(', ');
  const cidade = cityState(l.city, l.state);
  const cep    = l.cep ? `, CEP ${l.cep}` : '';
  return `${parts||'endereço não informado'}, na cidade de ${cidade}${cep}`;
}

// --- PDF Factory -------------------------------------------------------------
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REG  = path.join(FONT_DIR, 'Arial-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Arial-Bold.ttf');

/**
 * Creates a PDFDocument with:
 * - top margin = 85 so content always starts BELOW the golden header bar
 * - bottom margin = 50
 * - side margins = 50
 * The decorative bar is drawn at y=48 (top of page), safely above content.
 */
/**
 * Draws golden top bar + bottom rule on the current page.
 * Safe to call from pageAdded — no doc.text() to avoid infinite recursion.
 */
function decoratePageLines(doc: PDFKit.PDFDocument) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save()
     .moveTo(50, 48).lineTo(w - 50, 48)
     .lineWidth(1.5).strokeColor('#B8860B').stroke()
     .restore();
  doc.save()
     .moveTo(50, h - 38).lineTo(w - 50, h - 38)
     .lineWidth(0.4).strokeColor('#bbb').stroke()
     .restore();
}

/**
 * Draws footer text at an absolute position.
 * Must be called EXPLICITLY before doc.end() — NEVER inside pageAdded,
 * because doc.text() can trigger a new page which re-fires pageAdded → stack overflow.
 */
function addFooter(doc: PDFKit.PDFDocument) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save()
     .font('MyFont').fontSize(7.5).fillColor('#bbb')
     .text('Documento gerado pelo Sistema Legacy.', 50, h - 35, { align: 'center', width: w - 100, lineBreak: false })
     .restore();
}

function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 85, bottom: 50, left: 50, right: 50 },
  });
  doc.registerFont('MyFont',      FONT_REG);
  doc.registerFont('MyFont-Bold', FONT_BOLD);
  // Only draw lines (no text) in pageAdded to avoid recursion
  doc.on('pageAdded', () => decoratePageLines(doc));
  decoratePageLines(doc);
  return doc;
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// --- Layout helpers ----------------------------------------------------------

/** Bold centered title */
function header(doc: PDFKit.PDFDocument, title: string, sub?: string) {
  doc.font('MyFont-Bold').fontSize(11).fillColor('#1a1a1a')
     .text(title, { align: 'center' });
  if (sub) {
    doc.moveDown(0.2)
       .font('MyFont').fontSize(8.5).fillColor('#555')
       .text(sub, { align: 'center' });
  }
  doc.moveDown(0.8);
}

/** Golden section heading with thin underline */
function section(doc: PDFKit.PDFDocument, t: string) {
  doc.moveDown(0.5)
     .font('MyFont-Bold').fontSize(9).fillColor('#8B6914')
     .text(t.toUpperCase());
  const y = doc.y + 2;
  doc.save()
     .moveTo(54, y).lineTo(doc.page.width - 54, y)
     .lineWidth(0.35).strokeColor('#C9A227').stroke()
     .restore();
  doc.moveDown(0.4);
}

/** Justified body paragraph */
function body(doc: PDFKit.PDFDocument, text: string, lineGap = 3.5) {
  doc.font('MyFont').fontSize(9).fillColor('#111')
     .text(text, { align: 'justify', lineGap });
  doc.moveDown(0.55);
}

/** Left-aligned numbered clause — tighter than body */
function clause(doc: PDFKit.PDFDocument, text: string) {
  doc.font('MyFont').fontSize(9).fillColor('#111')
     .text(text, { align: 'left', lineGap: 2.5 });
  doc.moveDown(0.4);
}

/** Signature block */
function sig(doc: PDFKit.PDFDocument, label: string, name: string, extra?: string) {
  doc.moveDown(1.4);
  const x0 = 80, x1 = doc.page.width - 80;
  doc.save()
     .moveTo(x0, doc.y).lineTo(x1, doc.y)
     .lineWidth(0.5).strokeColor('#555').stroke()
     .restore();
  doc.moveDown(0.3)
     .font('MyFont').fontSize(8.5).fillColor('#666')
     .text(label, { align: 'center' });
  doc.font('MyFont-Bold').fontSize(9).fillColor('#111')
     .text(name, { align: 'center' });
  if (extra) {
    doc.font('MyFont').fontSize(8).fillColor('#666')
       .text(extra, { align: 'center' });
  }
}

/** Two-column witness block */
function witness(doc: PDFKit.PDFDocument) {
  doc.moveDown(1.4);
  const mid = doc.page.width / 2;
  const y   = doc.y;
  doc.save().moveTo(70, y).lineTo(mid - 12, y).lineWidth(0.5).strokeColor('#555').stroke().restore();
  doc.save().moveTo(mid + 12, y).lineTo(doc.page.width - 70, y).lineWidth(0.5).strokeColor('#555').stroke().restore();
  const lw = mid - 12 - 70;
  const rw = doc.page.width - 70 - (mid + 12);
  doc.moveDown(0.3).font('MyFont').fontSize(8.5).fillColor('#666');
  doc.text('Testemunha 1', 70, doc.y, { width: lw, align: 'center' });
  doc.text('Testemunha 2', mid + 12, doc.y - doc.currentLineHeight(), { width: rw, align: 'center' });
}

// --- Geração: Contrato (2 páginas) -------------------------------------------
async function genContrato(lead: LeadData, lawyer: LawyerData, notes?: string|null): Promise<Buffer> {
  const doc = createDoc();
  const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const slug = lead.funnel_slug || lead.funnel_name || 'geral';
  const acao = getAcaoContrato(slug);
  const foro = cityState(lawyer.city, lawyer.state);

  const advStr = `${lawyer.name}, advogado inscrit${g.o_a} na ${lawyer.oab}, com escritório profissional localizado à ${lawyerFullAddr(lawyer)}`;
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);
  const loc    = localData(lead.city, lead.state);

  const data: ContratoData = {
    advQualificacao: advStr, clienteQualificacao: cliStr, g, acao, foro,
    localData: loc, advNome: lawyer.name, advOab: lawyer.oab,
    clienteNome: lead.name.toUpperCase(), clienteCpf: lead.cpf,
  };
  const p = buildContrato(data);

  header(doc, 'INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS', '"CONTRATO DE RISCO"');
  body(doc, p[0]);
  body(doc, p[1]);

  section(doc, p[2]);  // 1 - DO OBJETO
  clause(doc, p[3]);

  section(doc, p[4]);  // 2 - DOS HONORÁRIOS
  for (let i = 5; i <= 13; i++) clause(doc, p[i]);

  section(doc, p[14]); // 3 - DAS OBRIGAÇÕES
  for (let i = 15; i <= 17; i++) clause(doc, p[i]);

  section(doc, p[18]); // 4 - DAS CONSIDERAÇÕES FINAIS
  clause(doc, p[19]);

  if (notes) { section(doc, 'OBSERVAÇÕES'); body(doc, notes); }

  doc.moveDown(0.3)
     .font('MyFont').fontSize(9).fillColor('#111')
     .text(p[20], { align: 'left' });

  sig(doc, 'Contratado', lawyer.name, `OAB ${lawyer.oab}`);
  sig(doc, `Contratante${lead.cpf ? ' — CPF: ' + lead.cpf : ''}`, lead.name.toUpperCase());
  witness(doc);
  addFooter(doc);

  doc.end();
  return buf;
}

// --- Geração: Procuração (1 página) ------------------------------------------
async function genProcuracao(lead: LeadData, lawyer: LawyerData, notes?: string|null): Promise<Buffer> {
  const doc = createDoc();
  const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const slug = lead.funnel_slug || lead.funnel_name || 'geral';
  const acao = getAcaoProcuracao(slug);
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: ProcuracaoData = {
    clienteQualificacao: cliStr, advNome: lawyer.name, advOab: lawyer.oab,
    advEndereco: lawyerFullAddr(lawyer), g, acao,
    localData: localData(lead.city, lead.state),
    clienteNome: lead.name.toUpperCase(),
  };
  const p = buildProcuracao(data);

  header(doc, p[0]);  // PROCURAÇÃO AD JUDICIA ET EXTRA
  // Long body — use slightly tighter line gap to fit on 1 page
  body(doc, p[1], 2.5);
  if (notes) { section(doc, 'OBSERVAÇÕES'); body(doc, notes, 2.5); }
  doc.moveDown(0.4)
     .font('MyFont').fontSize(9).fillColor('#111')
     .text(p[2], { align: 'left' });

  sig(doc, 'Outorgante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
  addFooter(doc);

  doc.end();
  return buf;
}

// --- Geração: Declaração de Hipossuficiência (1 página) ----------------------
async function genHipo(lead: LeadData, notes?: string|null): Promise<Buffer> {
  const doc = createDoc();
  const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: HipoData = {
    clienteQualificacao: cliStr, g,
    localData: localData(lead.city, lead.state),
    clienteNome: lead.name.toUpperCase(),
  };
  const p = buildDeclaracaoHipo(data);

  header(doc, p[0]);   // DECLARAÇÃO DE POBREZA / DECLARAÇÃO
  body(doc, p[1], 4);  // 2 paragraphs (qualification + request) — more breathing room
  if (notes) { section(doc, 'OBSERVAÇÕES'); body(doc, notes); }
  doc.moveDown(0.4)
     .font('MyFont').fontSize(9).fillColor('#111')
     .text(p[2], { align: 'left' });

  sig(doc, 'Declarante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
  addFooter(doc);

  doc.end();
  return buf;
}

// --- Public API --------------------------------------------------------------
export async function generatePhcPdfBuffer(
  docType: DocType, lead: LeadData, lawyer: LawyerData, notes?: string|null
): Promise<Buffer> {
  switch (docType) {
    case 'procuracao':      return genProcuracao(lead, lawyer, notes);
    case 'declaracao_hipo': return genHipo(lead, notes);
    case 'contrato':        return genContrato(lead, lawyer, notes);
    default: throw new Error('Unknown docType: ' + docType);
  }
}
