import PDFDocument from 'pdfkit';
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
  return [city, state].filter(Boolean).join('/') || 'Local n�o informado';
}
function localData(city?:string|null, state?:string|null): string {
  return `${cityState(city,state)}, ${todayBR()}.`;
}
function lawyerFullAddr(l:LawyerData): string {
  const parts = [l.street||l.address, l.street_number, l.neighborhood, l.complement].filter(Boolean).join(', ');
  const cidade = cityState(l.city, l.state);
  const cep    = l.cep ? `, CEP ${l.cep}` : '';
  return `${parts||'endere�o n�o informado'}, na cidade de ${cidade}${cep}`;
}

// --- PDF Layout Helpers -------------------------------------------------------
function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size:'A4', margins:{top:50,bottom:50,left:50,right:50} });
  const drawLines = () => {
    const w=doc.page.width, h=doc.page.height;
    doc.save().moveTo(60,75).lineTo(w-60,75).lineWidth(1.5).strokeColor('#B8860B').stroke().restore();
    doc.save().moveTo(60,h-55).lineTo(w-60,h-55).lineWidth(0.5).strokeColor('#888').stroke().restore();
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
function header(doc:PDFKit.PDFDocument, title:string, sub?:string) {
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(12).fillColor('#222').text(title,{align:'center'});
  if(sub) doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#555').text(sub,{align:'center'});
  doc.moveDown(1);
}
function section(doc:PDFKit.PDFDocument, t:string) {
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).fillColor('#B8860B').text(t.toUpperCase());
  doc.moveDown(0.3);
  doc.save().moveTo(60,doc.y).lineTo(doc.page.width-60,doc.y).lineWidth(0.4).strokeColor('#B8860B').stroke().restore();
  doc.moveDown(0.5);
}
function body(doc:PDFKit.PDFDocument, text:string) {
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(text,{align:'justify',lineGap:2});
  doc.moveDown(0.5);
}
function clause(doc:PDFKit.PDFDocument, text:string) {
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(text,{align:'left',lineGap:2});
  doc.moveDown(0.4);
}
function sig(doc:PDFKit.PDFDocument, label:string, name:string, extra?:string) {
  doc.moveDown(1.5);
  doc.save().moveTo(100,doc.y).lineTo(doc.page.width-100,doc.y).lineWidth(0.5).strokeColor('#333').stroke().restore();
  doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#555').text(label,{align:'center'});
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(name,{align:'center'});
  if(extra) doc.font('Helvetica').fontSize(9).fillColor('#555').text(extra,{align:'center'});
}
function witness(doc:PDFKit.PDFDocument) {
  doc.moveDown(1.5);
  const mid = (doc.page.width)/2;
  const y   = doc.y;
  doc.save().moveTo(80,y).lineTo(mid-20,y).lineWidth(0.5).strokeColor('#333').stroke().restore();
  doc.save().moveTo(mid+20,y).lineTo(doc.page.width-80,y).lineWidth(0.5).strokeColor('#333').stroke().restore();
  doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#555');
  doc.text('Testemunha 1', 80, doc.y, {width:(mid-20-80), align:'center'});
  doc.text('Testemunha 2', mid+20, doc.y-doc.currentLineHeight(), {width:(doc.page.width-80-mid-20), align:'center'});
}
function footer(doc:PDFKit.PDFDocument) {
  const w=doc.page.width, h=doc.page.height;
  doc.save().font('Helvetica').fontSize(8).fillColor('#888')
    .text('Documento gerado pelo Sistema Legacy.',60,h-45,{align:'center',width:w-120}).restore();
}

// --- Gera��o: Contrato --------------------------------------------------------
async function genContrato(lead:LeadData, lawyer:LawyerData, notes?:string|null): Promise<Buffer> {
  const doc = createDoc(); const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const slug = lead.funnel_slug || lead.funnel_name || 'geral';
  const acao = getAcaoContrato(slug);
  const foro = cityState(lawyer.city, lawyer.state);

  const advStr = `${lawyer.name}, advogado inscrit${g.o_a} na ${lawyer.oab}, com escrit�rio profissional localizado � ${lawyerFullAddr(lawyer)}`;
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);
  const loc    = localData(lead.city, lead.state);

  const data: ContratoData = {
    advQualificacao: advStr, clienteQualificacao: cliStr, g, acao, foro,
    localData: loc, advNome: lawyer.name, advOab: lawyer.oab,
    clienteNome: lead.name.toUpperCase(), clienteCpf: lead.cpf,
  };
  const paragraphs = buildContrato(data);

  header(doc, 'INSTRUMENTO PARTICULAR DE PRESTA��O DE SERVI�OS ADVOCAT�CIOS', '"CONTRATO DE RISCO"');

  // Cabe�alho do contrato (quem faz entre si)
  body(doc, paragraphs[0]);
  body(doc, paragraphs[1]);
  doc.moveDown(0.5);

  // Cap 1
  section(doc, paragraphs[2]);
  body(doc, paragraphs[3]);

  // Cap 2
  section(doc, paragraphs[4]);
  for(let i=5;i<=13;i++) clause(doc, paragraphs[i]);

  // Cap 3
  section(doc, paragraphs[14]);
  for(let i=15;i<=17;i++) clause(doc, paragraphs[i]);

  // Cap 4
  section(doc, paragraphs[18]);
  clause(doc, paragraphs[19]);

  if(notes){ section(doc,'OBSERVA��ES'); body(doc,notes); }

  body(doc, paragraphs[20]);

  sig(doc, 'Contratado', lawyer.name, `OAB ${lawyer.oab}`);
  sig(doc, `Contratante${lead.cpf?' - CPF: '+lead.cpf:''}`, lead.name.toUpperCase());
  witness(doc);
  footer(doc); doc.end(); return buf;
}

// --- Gera��o: Procura��o -----------------------------------------------------
async function genProcuracao(lead:LeadData, lawyer:LawyerData, notes?:string|null): Promise<Buffer> {
  const doc = createDoc(); const buf = collectBuffer(doc);
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
  const paragraphs = buildProcuracao(data);

  header(doc, paragraphs[0]);
  body(doc, paragraphs[1]);
  if(notes){ section(doc,'OBSERVA��ES'); body(doc,notes); }
  doc.moveDown(1).font('Helvetica').fontSize(10).fillColor('#111').text(paragraphs[2]);
  doc.moveDown(3);
  sig(doc, 'Outorgante', lead.name.toUpperCase(), lead.cpf ? 'CPF: '+lead.cpf : undefined);
  footer(doc); doc.end(); return buf;
}

// --- Gera��o: Declara��o de Hipossufici�ncia ----------------------------------
async function genHipo(lead:LeadData, notes?:string|null): Promise<Buffer> {
  const doc = createDoc(); const buf = collectBuffer(doc);
  const g   = buildCtx(lead.name, lead.marital_status, lead.occupation, lead.gender as 'F'|'M'|null);
  const cliStr = clienteQual(g, lead.name.toUpperCase(), lead.rg, lead.cpf, lead.address, lead.city, lead.state, lead.cep);

  const data: HipoData = {
    clienteQualificacao: cliStr, g,
    localData: localData(lead.city, lead.state),
    clienteNome: lead.name.toUpperCase(),
  };
  const paragraphs = buildDeclaracaoHipo(data);

  header(doc, paragraphs[0]);
  body(doc, paragraphs[1]);
  if(notes){ section(doc,'OBSERVA��ES'); body(doc,notes); }
  body(doc, paragraphs[2]);
  sig(doc, 'Declarante', lead.name.toUpperCase(), lead.cpf ? 'CPF: '+lead.cpf : undefined);
  footer(doc); doc.end(); return buf;
}

// --- Public API ---------------------------------------------------------------
export async function generatePhcPdfBuffer(
  docType: DocType, lead: LeadData, lawyer: LawyerData, notes?: string|null
): Promise<Buffer> {
  switch(docType) {
    case 'procuracao':      return genProcuracao(lead, lawyer, notes);
    case 'declaracao_hipo': return genHipo(lead, notes);
    case 'contrato':        return genContrato(lead, lawyer, notes);
    default: throw new Error('Unknown docType: '+docType);
  }
}
