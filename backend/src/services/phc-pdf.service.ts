import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeadData {
    name:            string;
    cpf?:            string | null;
    rg?:             string | null;
    marital_status?: string | null;
    nationality?:    string | null;
    address?:        string | null;
    city?:           string | null;
    state?:          string | null;
    phone?:          string | null;
    email?:          string | null;
    description?:    string | null;
    funnel_name?:    string | null;
    birthdate?:      string | null;
}

interface LawyerData {
    name:             string;
    oab:              string;
    cpf?:             string | null;
    address?:         string | null;
    city?:            string | null;
    state?:           string | null;
    additional_info?: string | null;
}

type DocType = 'procuracao' | 'declaracao_hipo' | 'contrato';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayBR(): string {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function cityStateBR(city?: string | null, state?: string | null): string {
    const parts = [city, state].filter(Boolean);
    return parts.length > 0 ? parts.join('/') : 'Local nao informado';
}

function maritalLabel(status?: string | null): string {
    const map: Record<string, string> = {
        solteiro:   'solteiro(a)',
        casado:     'casado(a)',
        divorciado: 'divorciado(a)',
        viuvo:      'viuvo(a)',
        outro:      'estado civil nao declarado',
    };
    return status ? (map[status] ?? status) : 'estado civil nao declarado';
}

function fullAddress(lead: LeadData): string {
    return [lead.address, lead.city, lead.state].filter(Boolean).join(', ') || 'Nao informado';
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────

/** Draw horizontal rule only — NO .text() calls inside pageAdded handler */
function drawPageLines(doc: PDFKit.PDFDocument): void {
    const w = doc.page.width;
    const h = doc.page.height;
    // Top gold rule
    doc.save()
        .moveTo(60, 75).lineTo(w - 60, 75)
        .lineWidth(1.5).strokeColor('#B8860B').stroke()
        .restore();
    // Bottom gray rule
    doc.save()
        .moveTo(60, h - 55).lineTo(w - 60, h - 55)
        .lineWidth(0.5).strokeColor('#888888').stroke()
        .restore();
}

/** Write footer text AFTER content is done — never inside pageAdded */
function drawFooter(doc: PDFKit.PDFDocument): void {
    const w = doc.page.width;
    const h = doc.page.height;
    doc.save()
        .font('Helvetica').fontSize(8).fillColor('#888888')
        .text(
            'Documento gerado pelo Sistema Legacy.',
            60, h - 45,
            { align: 'center', width: w - 120, lineBreak: false }
        )
        .restore();
}

function sectionHeader(doc: PDFKit.PDFDocument, text: string): void {
    doc.moveDown(0.8)
        .font('Helvetica-Bold').fontSize(10).fillColor('#B8860B')
        .text(text.toUpperCase(), { align: 'left' })
        .moveDown(0.3);
    doc.save()
        .moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y)
        .lineWidth(0.4).strokeColor('#B8860B').stroke()
        .restore();
    doc.moveDown(0.5);
}

function dataRow(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333')
        .text(label + ': ', { continued: true })
        .font('Helvetica').fillColor('#111111')
        .text(value || 'Nao informado');
}

function signatureBlock(doc: PDFKit.PDFDocument, label: string, name: string, extra?: string): void {
    doc.moveDown(2);
    doc.save()
        .moveTo(110, doc.y).lineTo(doc.page.width - 110, doc.y)
        .lineWidth(0.5).strokeColor('#333333').stroke()
        .restore();
    doc.moveDown(0.3)
        .font('Helvetica').fontSize(9).fillColor('#555555')
        .text(label, { align: 'center' })
        .font('Helvetica-Bold').fontSize(10).fillColor('#111111')
        .text(name, { align: 'center' });
    if (extra) {
        doc.font('Helvetica').fontSize(9).fillColor('#555555').text(extra, { align: 'center' });
    }
}

function writeTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string): void {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#B8860B')
        .text('LEGACY ASSESSORIA JURIDICA', { align: 'center' });
    doc.moveDown(0.3)
        .font('Helvetica-Bold').fontSize(12).fillColor('#222222')
        .text(title, { align: 'center' });
    if (subtitle) {
        doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#555555')
            .text(subtitle, { align: 'center' });
    }
    doc.moveDown(1);
}

/** Create a PDFDocument with ONLY line drawing in pageAdded (no text calls) */
function createDoc(): PDFKit.PDFDocument {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 90, bottom: 80, left: 60, right: 60 },
        bufferPages: false,
    });
    // SAFE: only draw lines, never call .text() inside pageAdded
    doc.on('pageAdded', () => drawPageLines(doc));
    // Draw lines on the first page too
    drawPageLines(doc);
    return doc;
}

/** Collect PDF buffer via Promise */
function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
}

function ensurePhcDir(): string {
    const dir = path.resolve(process.cwd(), 'uploads', 'phc');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// ─── Template: Procuracao ────────────────────────────────────────────────────

async function generateProcuracao(lead: LeadData, lawyer: LawyerData, notes?: string | null): Promise<Buffer> {
    const doc = createDoc();
    const buf = collectBuffer(doc);

    writeTitle(doc, 'INSTRUMENTO PARTICULAR DE PROCURACAO');

    sectionHeader(doc, 'Outorgante (Cliente)');
    dataRow(doc, 'Nome',          lead.name);
    dataRow(doc, 'Nacionalidade', lead.nationality ?? 'brasileiro(a)');
    dataRow(doc, 'Estado Civil',  maritalLabel(lead.marital_status));
    dataRow(doc, 'CPF',           lead.cpf ?? 'Nao informado');
    dataRow(doc, 'RG',            lead.rg  ?? 'Nao informado');
    dataRow(doc, 'Endereco',      fullAddress(lead));

    sectionHeader(doc, 'Outorgado (Advogado)');
    dataRow(doc, 'Nome', lawyer.name);
    dataRow(doc, 'OAB',  lawyer.oab);
    if (lawyer.cpf) dataRow(doc, 'CPF', lawyer.cpf);
    if (lawyer.city || lawyer.state) dataRow(doc, 'Cidade/UF', cityStateBR(lawyer.city, lawyer.state));

    sectionHeader(doc, 'Poderes Outorgados');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(
            'Pelo presente instrumento particular, o(a) Outorgante nomeia e constitui o(a) Outorgado(a) '
            + 'como seu(ua) bastante procurador(a), com poderes para representa-lo(a) em juizo ou fora dele, '
            + 'podendo propor acoes, requerer, recorrer, desistir, transigir, receber e dar quitacao, '
            + 'realizar todos os atos necessarios a defesa dos interesses do(a) Outorgante, '
            + 'alem de substabelecer esta com ou sem reservas de iguais poderes.',
            { align: 'left' }
        );

    if (notes) {
        sectionHeader(doc, 'Observacoes');
        doc.font('Helvetica').fontSize(10).fillColor('#333333').text(notes, { align: 'left' });
    }

    sectionHeader(doc, 'Local e Data');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(cityStateBR(lead.city, lead.state) + ', ' + todayBR() + '.');

    signatureBlock(doc, 'Outorgante', lead.name, lead.cpf ? 'CPF: ' + lead.cpf : undefined);
    signatureBlock(doc, 'Outorgado(a) - OAB ' + lawyer.oab, lawyer.name);

    drawFooter(doc);
    doc.end();
    return buf;
}

// ─── Template: Declaracao de Hipossuficiencia ────────────────────────────────

async function generateDeclaracaoHipo(lead: LeadData, notes?: string | null): Promise<Buffer> {
    const doc = createDoc();
    const buf = collectBuffer(doc);

    writeTitle(
        doc,
        'DECLARACAO DE HIPOSSUFICIENCIA ECONOMICA',
        'Nos termos do art. 99 do CPC e Lei n. 1.060/1950'
    );

    sectionHeader(doc, 'Identificacao do Declarante');
    dataRow(doc, 'Nome',          lead.name);
    dataRow(doc, 'Nacionalidade', lead.nationality ?? 'brasileiro(a)');
    dataRow(doc, 'Estado Civil',  maritalLabel(lead.marital_status));
    dataRow(doc, 'CPF',           lead.cpf ?? 'Nao informado');
    dataRow(doc, 'RG',            lead.rg  ?? 'Nao informado');
    dataRow(doc, 'Endereco',      fullAddress(lead));

    sectionHeader(doc, 'Declaracao');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(
            'Eu, ' + lead.name + ', portador(a) do CPF n. ' + (lead.cpf ?? 'nao informado')
            + ', residente em ' + fullAddress(lead)
            + ', DECLARO, sob as penas da lei, que nao possuo condicoes de arcar com as custas e despesas '
            + 'processuais sem prejuizo do sustento proprio e de minha familia, razao pela qual requeiro '
            + 'os beneficios da assistencia judiciaria gratuita, nos termos do art. 99 do CPC '
            + 'e da Lei n. 1.060/1950.',
            { align: 'left' }
        );

    doc.moveDown(0.8).font('Helvetica').fontSize(10).fillColor('#111111')
        .text(
            'Declaro ainda que as informacoes prestadas sao verdadeiras, estando ciente de que '
            + 'a falsidade desta declaracao configura crime previsto no art. 299 do Codigo Penal.',
            { align: 'left' }
        );

    if (notes) {
        sectionHeader(doc, 'Observacoes');
        doc.font('Helvetica').fontSize(10).fillColor('#333333').text(notes, { align: 'left' });
    }

    sectionHeader(doc, 'Local e Data');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(cityStateBR(lead.city, lead.state) + ', ' + todayBR() + '.');

    signatureBlock(doc, 'Declarante', lead.name, lead.cpf ? 'CPF: ' + lead.cpf : undefined);

    drawFooter(doc);
    doc.end();
    return buf;
}

// ─── Template: Contrato de Honorarios ────────────────────────────────────────

async function generateContrato(lead: LeadData, lawyer: LawyerData, notes?: string | null): Promise<Buffer> {
    const doc = createDoc();
    const buf = collectBuffer(doc);

    writeTitle(
        doc,
        'CONTRATO DE HONORARIOS ADVOCATICIOS',
        'Prestacao de Servicos Juridicos - Ad Exitum'
    );

    sectionHeader(doc, 'Contratante (Cliente)');
    dataRow(doc, 'Nome',     lead.name);
    dataRow(doc, 'CPF',      lead.cpf ?? 'Nao informado');
    dataRow(doc, 'Endereco', fullAddress(lead));
    if (lead.phone) dataRow(doc, 'Telefone', lead.phone);

    sectionHeader(doc, 'Contratado (Advogado)');
    dataRow(doc, 'Nome', lawyer.name);
    dataRow(doc, 'OAB',  lawyer.oab);
    if (lawyer.city || lawyer.state) dataRow(doc, 'Cidade/UF', cityStateBR(lawyer.city, lawyer.state));

    sectionHeader(doc, 'Objeto do Contrato');
    const caseDesc = lead.description
        ? lead.description.substring(0, 300)
        : 'Prestacao de servicos juridicos na area de ' + (lead.funnel_name ?? 'Direito Geral') + '.';
    doc.font('Helvetica').fontSize(10).fillColor('#111111').text(caseDesc, { align: 'left' });

    sectionHeader(doc, 'Honorarios');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(
            'Os honorarios advocaticios serao devidos exclusivamente em caso de exito na demanda. '
            + 'Nao havendo exito, nenhum valor sera cobrado do Contratante a titulo de honorarios.',
            { align: 'left' }
        );

    // Write each clause as separate .text() — never use \n inside .text()
    sectionHeader(doc, 'Clausulas Gerais');
    doc.font('Helvetica').fontSize(10).fillColor('#111111');
    doc.text('1. O Contratado se compromete a manter o Contratante informado sobre o andamento do processo.', { align: 'left' });
    doc.moveDown(0.3);
    doc.text('2. O presente contrato e celebrado em carater irrevogavel e irretratavel.', { align: 'left' });
    doc.moveDown(0.3);
    doc.text(
        '3. Eventuais litigios serao dirimidos no foro da comarca de '
        + cityStateBR(lawyer.city ?? lead.city, lawyer.state ?? lead.state) + '.',
        { align: 'left' }
    );

    if (notes) {
        sectionHeader(doc, 'Observacoes');
        doc.font('Helvetica').fontSize(10).fillColor('#333333').text(notes, { align: 'left' });
    }

    sectionHeader(doc, 'Local e Data');
    doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(cityStateBR(lead.city ?? lawyer.city, lead.state ?? lawyer.state) + ', ' + todayBR() + '.');

    signatureBlock(doc, 'Contratante', lead.name, lead.cpf ? 'CPF: ' + lead.cpf : undefined);
    signatureBlock(doc, 'Contratado - OAB ' + lawyer.oab, lawyer.name);

    drawFooter(doc);
    doc.end();
    return buf;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Gera o PDF em memória e retorna como Buffer.
 * Use esta função em produção (Railway/Vercel) — não salva em disco.
 */
export async function generatePhcPdfBuffer(
    docType: DocType,
    lead:     LeadData,
    lawyer:   LawyerData,
    notes?:   string | null
): Promise<Buffer> {
    switch (docType) {
        case 'procuracao':      return generateProcuracao(lead, lawyer, notes);
        case 'declaracao_hipo': return generateDeclaracaoHipo(lead, notes);
        case 'contrato':        return generateContrato(lead, lawyer, notes);
        default: throw new Error('Unknown docType: ' + docType);
    }
}

/**
 * Gera o PDF e salva em disco. Mantido para compatibilidade com Docker local.
 * No Railway, prefira generatePhcPdfBuffer() para evitar o filesystem efêmero.
 */
export async function generateAndSavePhcPdf(
    docType:  DocType,
    docId:    number,
    lead:     LeadData,
    lawyer:   LawyerData,
    notes?:   string | null
): Promise<string> {
    const buffer = await generatePhcPdfBuffer(docType, lead, lawyer, notes);

    const dir      = ensurePhcDir();
    const fileName = 'phc_' + docId + '_' + docType + '_' + Date.now() + '.pdf';
    const filePath = path.join(dir, fileName);

    fs.writeFileSync(filePath, buffer);
    return filePath;
}
