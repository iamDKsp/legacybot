import PDFDocument from 'pdfkit';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';
import { buildCtx } from './gender-detect';
import {
  getAcaoContrato, getAcaoProcuracao, clienteQual,
  buildContrato, buildProcuracao, buildDeclaracaoHipo,
  ContratoData, ProcuracaoData, HipoData,
} from './phc-templates';

const _genAI = new GoogleGenerativeAI(config.googleAi.apiKey);

/**
 * Aplica os argumentos do usuário ao texto do documento via Gemini.
 * Os argumentos têm prioridade absoluta sobre o template.
 */
async function applyArguments(docText: string, userArgs: string): Promise<string> {
  try {
    const model = _genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Você é um assistente jurídico especialista em documentos brasileiros.
Abaixo está um documento jurídico já redigido. Aplique EXATAMENTE as instruções do usuário ao documento.
As instruções têm prioridade absoluta — elas sobrepõem qualquer padrão do documento.
Mantém a estrutura, formatação e termos jurídicos. Retorne SOMENTE o texto do documento modificado, sem explicações.

INSTRUÇÕES DO USUÁRIO:
${userArgs}

DOCUMENTO:
${docText}`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.error('[PHC] applyArguments error:', e);
    return docText; // fallback: usa original
  }
}

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
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function cityState(city?: string|null, state?: string|null): string {
  return [city, state].filter(Boolean).join('/') || 'Local não informado';
}
function localData(city?: string|null, state?: string|null): string {
  return `${cityState(city, state)}, ${todayBR()}.`;
}
function lawyerFullAddr(l: LawyerData): string {
  const parts = [l.street||l.address, l.street_number, l.neighborhood, l.complement].filter(Boolean).join(', ');
  const cidade = cityState(l.city, l.state);
  const cep    = l.cep ? `, CEP ${l.cep}` : '';
  return `${parts || 'endereço não informado'}, na cidade de ${cidade}${cep}`;
}

// --- PDF core ----------------------------------------------------------------
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REG  = path.join(FONT_DIR, 'Arial-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Arial-Bold.ttf');

/** Only draws lines — safe inside pageAdded (no doc.text which can recurse) */
function decoratePageLines(doc: PDFKit.PDFDocument) {
  const w = doc.page.width, h = doc.page.height;
  doc.save().moveTo(50, 46).lineTo(w - 50, 46).lineWidth(1.5).strokeColor('#B8860B').stroke().restore();
  doc.save().moveTo(50, h - 36).lineTo(w - 50, h - 36).lineWidth(0.35).strokeColor('#ccc').stroke().restore();
}

/**
 * Footer text — temporarily removes the bottom margin so PDFKit never triggers
 * continueOnNewPage when writing near the bottom of the page.
 */
function addFooter(doc: PDFKit.PDFDocument) {
  const w = doc.page.width, h = doc.page.height;
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font('MyFont').fontSize(7).fillColor('#bbb')
     .text('Documento gerado pelo Sistema Legacy.', 50, h - 33,
           { align: 'center', width: w - 100, lineBreak: false });
  doc.page.margins.bottom = origBottom;
}

/** top=78 so content starts well below the decorative bar at y=46 */
function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 78, bottom: 45, left: 48, right: 48 } });
  doc.registerFont('MyFont',      FONT_REG);
  doc.registerFont('MyFont-Bold', FONT_BOLD);
  doc.on('pageAdded', () => decoratePageLines(doc));
  decoratePageLines(doc);
  return doc;
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((res, rej) => {
    const c: Buffer[] = [];
    doc.on('data', (b: Buffer) => c.push(b));
    doc.on('end', () => res(Buffer.concat(c)));
    doc.on('error', rej);
  });
}

// --- Shared layout helpers ---------------------------------------------------

/**
 * Renderiza texto com marcadores [[BOLD]]...[[/BOLD]] alternando fonte.
 * O texto fora das tags usa MyFont, dentro usa MyFont-Bold.
 */
function renderWithBold(
    doc: PDFKit.PDFDocument,
    text: string,
    options: { fontSize: number; lineGap: number; align?: string }
) {
    const parts = text.split(/\[\[BOLD\]\]|\[\[\/BOLD\]\]/g);
    let isBold = false;

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const lineBuffer: { text: string; bold: boolean }[] = [];
    for (const part of parts) {
        if (part) lineBuffer.push({ text: part, bold: isBold });
        isBold = !isBold;
    }

    // Renderiza segmentos em sequência com continued=true para evitar overflow
    for (let i = 0; i < lineBuffer.length; i++) {
        const seg = lineBuffer[i];
        const font = seg.bold ? 'MyFont-Bold' : 'MyFont';
        const isLast = i === lineBuffer.length - 1;

        doc.font(font).fontSize(options.fontSize);
        doc.text(seg.text, {
            continued: !isLast,
            lineGap: options.lineGap,
            width: pageW,
            align: (options.align as 'left' | 'justify' | 'center' | 'right') || 'justify',
        });
    }
}

function sig(doc: PDFKit.PDFDocument, label: string, name: string, extra?: string) {
  doc.moveDown(5); // espaço generoso antes da assinatura
  const x0 = 80, x1 = doc.page.width - 80;
  doc.save().moveTo(x0, doc.y).lineTo(x1, doc.y).lineWidth(0.45).strokeColor('#555').stroke().restore();
  doc.moveDown(0.4).font('MyFont').fontSize(9).fillColor('#666').text(label, { align: 'center' });
  doc.font('MyFont-Bold').fontSize(9.5).fillColor('#111').text(name, { align: 'center' });
  if (extra) doc.font('MyFont').fontSize(8.5).fillColor('#666').text(extra, { align: 'center' });
}

function witness(doc: PDFKit.PDFDocument) {
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
async function genContrato(lead: LeadData, lawyer: LawyerData, notes?: string|null, docArguments?: string|null): Promise<Buffer> {
  const doc = createDoc(), buf = collectBuffer(doc);
  const g    = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const slug = lead.funnel_slug || lead.funnel_name || 'geral';
  const acao = getAcaoContrato(slug);
  const foro = cityState(lawyer.city, lawyer.state);

  // Contrato: fonte 10.5pt, lineGap 5 — boa legibilidade com respiro
  const FS = 10.5;
  const LG = 5;
  const MD = 0.9;

  const advStr = `${lawyer.name}, advogado inscrit${g.o_a} na ${lawyer.oab}, com escritório profissional localizado à ${lawyerFullAddr(lawyer)}`;
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: ContratoData = {
    advQualificacao: advStr, clienteQualificacao: cliStr, g, acao, foro,
    localData: localData(lead.city, lead.state),
    advNome: lawyer.name, advOab: lawyer.oab,
    clienteNome: lead.name.toUpperCase(), clienteCpf: lead.cpf,
  };
  const p = buildContrato(data);

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
  const sec = (t: string) => {
    doc.moveDown(0.65).font('MyFont-Bold').fontSize(10).fillColor('#8B6914').text(t.toUpperCase());
    const y = doc.y + 2;
    doc.save().moveTo(52, y).lineTo(doc.page.width - 52, y).lineWidth(0.3).strokeColor('#C9A227').stroke().restore();
    doc.moveDown(0.5);
  };
  const cl = (t: string) => {
    doc.font('MyFont').fontSize(FS).fillColor('#111').text(t, { align: 'left', lineGap: LG });
    doc.moveDown(MD);
  };

  sec(p[2]);  
  // cláusula 1.1 com o nome da ação em negrito
  renderWithBold(doc, p[3], { fontSize: FS, lineGap: LG, align: 'left' });
  doc.moveDown(MD);
  sec(p[4]);  for (let i = 5; i <= 13; i++) cl(p[i]);
  sec(p[14]); for (let i = 15; i <= 17; i++) cl(p[i]);
  sec(p[18]); cl(p[19]);

  // Se houver argumentos, reescreve o conteúdo via Gemini antes de renderizar
  let p2 = p;
  if (docArguments) {
    const fullText = p.join('\n\n');
    const modified = await applyArguments(fullText, docArguments);
    // split back into same number of parts (best-effort)
    const parts = modified.split(/\n{2,}/);
    p2 = p.map((_, i) => parts[i] ?? p[i]);
  }

  if (notes) { sec('OBSERVAÇÕES'); cl(notes); }

  // local e data centralizado
  doc.moveDown(0.4).font('MyFont').fontSize(FS).fillColor('#111').text(p[20], { align: 'center' });

  sig(doc, 'Contratado', lawyer.name, `OAB ${lawyer.oab}`);
  sig(doc, `Contratante${lead.cpf ? ' — CPF: ' + lead.cpf : ''}`, lead.name.toUpperCase());
  witness(doc);
  addFooter(doc);
  doc.end();
  return buf;
}

// --- Procuracao (meta: 1 pagina) ---------------------------------------------
async function genProcuracao(lead: LeadData, lawyer: LawyerData, notes?: string|null, docArguments?: string|null): Promise<Buffer> {
  const doc = createDoc(), buf = collectBuffer(doc);
  const g    = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
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

  // Titulo maior — 13pt
  doc.font('MyFont-Bold').fontSize(13).fillColor('#1a1a1a').text(p[0], { align: 'center' });
  doc.moveDown(0.9);

  // Aplica argumentos via Gemini (override absoluto)
  let finalBody = p[1];
  if (docArguments) {
    finalBody = await applyArguments(p[1], docArguments);
  }

  doc.font('MyFont').fontSize(10).fillColor('#111').text(finalBody, { align: 'justify', lineGap: 4.5 });
  doc.moveDown(0.8);

  if (notes) {
    doc.moveDown(0.3).font('MyFont-Bold').fontSize(10).fillColor('#8B6914').text('OBSERVAÇÕES:');
    doc.font('MyFont').fontSize(10).fillColor('#111').text(notes, { align: 'justify', lineGap: 4.5 });
    doc.moveDown(0.6);
  }

  // local e data centralizado
  doc.font('MyFont').fontSize(10).fillColor('#111').text(p[2], { align: 'center' });

  sig(doc, 'Outorgante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
  addFooter(doc);
  doc.end();
  return buf;
}

// --- Declaracao de Hipossuficiencia (meta: 1 pagina) -------------------------
async function genHipo(lead: LeadData, notes?: string|null, docArguments?: string|null): Promise<Buffer> {
  const doc = createDoc(), buf = collectBuffer(doc);
  const g    = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: HipoData = {
    clienteQualificacao: cliStr, g,
    localData: localData(lead.city, lead.state),
    clienteNome: lead.name.toUpperCase(),
  };
  const p = buildDeclaracaoHipo(data);

  // Titulo grande 14pt — documento curto tem muito espaco para respirar
  doc.font('MyFont-Bold').fontSize(14).fillColor('#1a1a1a').text(p[0], { align: 'center' });
  doc.moveDown(1.5);

  // Aplica argumentos via Gemini
  let finalBody = p[1];
  if (docArguments) {
    finalBody = await applyArguments(p[1], docArguments);
  }

  doc.font('MyFont').fontSize(12).fillColor('#111').text(finalBody, { align: 'justify', lineGap: 16 });
  doc.moveDown(2);

  if (notes) {
    doc.font('MyFont-Bold').fontSize(12).fillColor('#8B6914').text('OBSERVAÇÕES:');
    doc.moveDown(0.4);
    doc.font('MyFont').fontSize(12).fillColor('#111').text(notes, { align: 'justify', lineGap: 16 });
    doc.moveDown(1.5);
  }

  // local e data centralizado
  doc.font('MyFont').fontSize(12).fillColor('#111').text(p[2], { align: 'center' });
  doc.moveDown(0.5);
  sig(doc, 'Declarante', lead.name.toUpperCase(), lead.cpf ? 'CPF: ' + lead.cpf : undefined);
  addFooter(doc);
  doc.end();
  return buf;
}

// --- Public API --------------------------------------------------------------
export async function generatePhcPdfBuffer(
  docType: DocType, lead: LeadData, lawyer: LawyerData, notes?: string|null, docArguments?: string|null
): Promise<Buffer> {
  switch (docType) {
    case 'procuracao':      return genProcuracao(lead, lawyer, notes, docArguments);
    case 'declaracao_hipo': return genHipo(lead, notes, docArguments);
    case 'contrato':        return genContrato(lead, lawyer, notes, docArguments);
    default: throw new Error('Unknown docType: ' + docType);
  }
}
