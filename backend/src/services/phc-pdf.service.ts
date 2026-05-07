import PDFDocument from 'pdfkit';
import * as path from 'path';
import { buildCtx } from './gender-detect';
import {
  getAcaoContrato, getAcaoProcuracao, advQual, clienteQual,
  buildContrato, buildProcuracao, buildDeclaracaoHipo,
  ContratoData, ProcuracaoData, HipoData,
} from './phc-templates';

// --- Types --------------------------------------------------------------------
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

// --- PDF Layout Helpers -------------------------------------------------------
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REG  = path.join(FONT_DIR, 'Arial-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Arial-Bold.ttf');

// Layout constants — tweak these to control density vs breathing room
const MARGIN   = 55;   // page margins (left/right/top/bottom)
const SZ_BODY  = 9.5;  // main body text size
const SZ_HEAD  = 11.5; // document title
const SZ_SUB   = 9;    // subtitle / section
const SZ_FOOT  = 8;    // footer
const LINE_GAP = 4;    // extra gap between lines inside a paragraph
const PARA_GAP = 0.7;  // moveDown after each paragraph/clause
const SEC_PRE  = 0.6;  // moveDown before a section heading
const SEC_POST = 0.5;  // moveDown after section rule

function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size:'A4', margins:{top:MARGIN, bottom:MARGIN, left:MARGIN, right:MARGIN} });
  doc.registerFont('MyFont',      FONT_REG);
  doc.registerFont('MyFont-Bold', FONT_BOLD);
  const drawLines = () => {
    const w = doc.page.width, h = doc.page.height;
    doc.save().moveTo(MARGIN, 68).lineTo(w-MARGIN, 68).lineWidth(1.5).strokeColor('#B8860B').stroke().restore();
    doc.save().moveTo(MARGIN, h-42).lineTo(w-MARGIN, h-42).lineWidth(0.5).strokeColor('#aaa').stroke().restore();
  };
  doc.on('pageAdded', drawLines); drawLines(); return doc;
}

function collectBuffer(doc:PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve,reject) => {
    const c:Buffer[]=[];
    doc.on('data',(b:Buffer)=>c.push(b));
    doc.on('end',()=>resolve(Buffer.concat(c)));
    doc.on('error',reject);
  });
}

/** Bold centered title */
function header(doc:PDFKit.PDFDocument, title:string, sub?:string) {
  doc.moveDown(0.4)
     .font('MyFont-Bold').fontSize(SZ_HEAD).fillColor('#1a1a1a')
     .text(title, { align:'center' });
  if (sub) {
    doc.moveDown(0.25)
       .font('MyFont').fontSize(SZ_SUB).fillColor('#555')
       .text(sub, { align:'center' });
  }
  doc.moveDown(1);
}

/** Golden section heading with underline rule */
function section(doc:PDFKit.PDFDocument, t:string) {
  doc.moveDown(SEC_PRE)
     .font('MyFont-Bold').fontSize(SZ_SUB).fillColor('#8B6914')
     .text(t.toUpperCase());
  doc.moveDown(0.25);
  const x0 = MARGIN + 4, x1 = doc.page.width - MARGIN - 4;
  doc.save().moveTo(x0, doc.y).lineTo(x1, doc.y).lineWidth(0.4).strokeColor('#B8860B').stroke().restore();
  doc.moveDown(SEC_POST);
}

/** Justified paragraph with breathing room */
function body(doc:PDFKit.PDFDocument, text:string) {
  doc.font('MyFont').fontSize(SZ_BODY).fillColor('#111')
     .text(text, { align:'justify', lineGap: LINE_GAP });
  doc.moveDown(PARA_GAP);
}

/** Left-aligned clause (numbered items) */
function clause(doc:PDFKit.PDFDocument, text:string) {
  doc.font('MyFont').fontSize(SZ_BODY).fillColor('#111')
     .text(text, { align:'left', lineGap: LINE_GAP });
  doc.moveDown(PARA_GAP - 0.15);
}

/** Signature block */
function sig(doc:PDFKit.PDFDocument, label:string, name:string, extra?:string) {
  doc.moveDown(1.8);
  const x0 = MARGIN + 40, x1 = doc.page.width - MARGIN - 40;
  doc.save().moveTo(x0, doc.y).lineTo(x1, doc.y).lineWidth(0.5).strokeColor('#444').stroke().restore();
  doc.moveDown(0.35)
     .font('MyFont').fontSize(SZ_FOOT + 1).fillColor('#666')
     .text(label, { align:'center' });
  doc.font('MyFont-Bold').fontSize(SZ_BODY).fillColor('#111')
     .text(name, { align:'center' });
  if (extra) doc.font('MyFont').fontSize(SZ_FOOT).fillColor('#666').text(extra, { align:'center' });
}

/** Two-column witness block */
function witness(doc:PDFKit.PDFDocument) {
  doc.moveDown(1.8);
  const mid = doc.page.width / 2;
  const y   = doc.y;
  doc.save().moveTo(MARGIN+30, y).lineTo(mid-15, y).lineWidth(0.5).strokeColor('#444').stroke().restore();
  doc.save().moveTo(mid+15, y).lineTo(doc.page.width-MARGIN-30, y).lineWidth(0.5).strokeColor('#444').stroke().restore();
  const lw = mid - 15 - (MARGIN + 30);
  const rw = doc.page.width - MARGIN - 30 - mid - 15;
  doc.moveDown(0.35).font('MyFont').fontSize(SZ_FOOT).fillColor('#666');
  doc.text('Testemunha 1', MARGIN+30, doc.y, { width: lw, align:'center' });
  doc.text('Testemunha 2', mid+15, doc.y - doc.currentLineHeight(), { width: rw, align:'center' });
}

/** Footer text */
function footer(doc:PDFKit.PDFDocument) {
  const w = doc.page.width, h = doc.page.height;
  doc.save().font('MyFont').fontSize(SZ_FOOT).fillColor('#aaa')
     .text('Documento gerado pelo Sistema Legacy.', MARGIN, h - 42, { align:'center', width: w - MARGIN*2 })
     .restore();
}

// --- Geração: Contrato --------------------------------------------------------
async function genContrato(lead:LeadData, lawyer:LawyerData, notes?:string|null): Promise<Buffer> {
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

  section(doc, p[2]);   // 1 - DO OBJETO
  body(doc, p[3]);

  section(doc, p[4]);   // 2 - DOS HONORÁRIOS
  for (let i=5; i<=13; i++) clause(doc, p[i]);

  section(doc, p[14]);  // 3 - DAS OBRIGAÇÕES
  for (let i=15; i<=17; i++) clause(doc, p[i]);

  section(doc, p[18]);  // 4 - DAS CONSIDERAÇÕES
  clause(doc, p[19]);

  if (notes) { section(doc,'OBSERVAÇÕES'); body(doc, notes); }

  body(doc, p[20]);

  sig(doc, 'Contratado', lawyer.name, `OAB ${lawyer.oab}`);
  sig(doc, `Contratante${lead.cpf ? ' — CPF: '+lead.cpf : ''}`, lead.name.toUpperCase());
  witness(doc);
  footer(doc);
  doc.end();
  return buf;
}

// --- Geração: Procuração -----------------------------------------------------
async function genProcuracao(lead:LeadData, lawyer:LawyerData, notes?:string|null): Promise<Buffer> {
  const doc = createDoc();
  const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const slug = lead.funnel_slug || lead.funnel_name || 'geral';
  const acao = getAcaoProcuracao(slug);
  const advEndStr = lawyerFullAddr(lawyer);
  const cliStr    = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: ProcuracaoData = {
    clienteQualificacao: cliStr, advNome: lawyer.name, advOab: lawyer.oab,
    advEndereco: advEndStr, g, acao,
    localData: localData(lead.city, lead.state),
    clienteNome: lead.name.toUpperCase(),
  };
  const p = buildProcuracao(data);

  header(doc, p[0]);
  body(doc, p[1]);
  if (notes) { section(doc,'OBSERVAÇÕES'); body(doc, notes); }
  doc.moveDown(1).font('MyFont').fontSize(SZ_BODY).fillColor('#111').text(p[2]);
  doc.moveDown(3);
  sig(doc, 'Outorgante', lead.name.toUpperCase(), lead.cpf ? 'CPF: '+lead.cpf : undefined);
  footer(doc);
  doc.end();
  return buf;
}

// --- Geração: Declaração de Hipossuficiência ----------------------------------
async function genHipo(lead:LeadData, notes?:string|null): Promise<Buffer> {
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

  header(doc, p[0]);
  body(doc, p[1]);
  if (notes) { section(doc,'OBSERVAÇÕES'); body(doc, notes); }
  body(doc, p[2]);
  sig(doc, 'Declarante', lead.name.toUpperCase(), lead.cpf ? 'CPF: '+lead.cpf : undefined);
  footer(doc);
  doc.end();
  return buf;
}

// --- Public API ---------------------------------------------------------------
export async function generatePhcPdfBuffer(
  docType: DocType, lead: LeadData, lawyer: LawyerData, notes?: string|null
): Promise<Buffer> {
  switch (docType) {
    case 'procuracao':      return genProcuracao(lead, lawyer, notes);
    case 'declaracao_hipo': return genHipo(lead, notes);
    case 'contrato':        return genContrato(lead, lawyer, notes);
    default: throw new Error('Unknown docType: '+docType);
  }
}
