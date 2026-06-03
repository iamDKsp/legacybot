import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';

const genAI = new GoogleGenerativeAI(config.googleAi.apiKey);

// ─── Tipos ───────────────────────────────────────────────────
export interface PhcLeadData {
  name: string;
  cpf?: string | null;
  rg?: string | null;
  marital_status?: string | null;
  nationality?: string | null;
  occupation?: string | null;
  employment_status?: string | null;
  occupation_detail?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  funnel_slug?: string | null;
  funnel_name?: string | null;
}

export interface PhcLawyerData {
  name: string;
  oab: string;
  street?: string | null;
  street_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}

export type DocType = 'contrato' | 'procuracao' | 'declaracao_hipo';

export interface GeneratedDoc {
  title: string;
  sections: Array<{ heading?: string; text: string; bold?: boolean }>;
  localData: string;
  clienteName: string;
  lawyerName: string;
  lawyerOab: string;
  docType: DocType;
}

// ─── Helper: acao juridica por funil ─────────────────────────
function getAcaoByFunnel(slug?: string | null): string {
  const s = (slug || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (s.includes('trabalhista')) return 'Reclamacao Trabalhista c/c Verbas Rescisorias';
  if (s.includes('negativado') || s.includes('negativada'))
    return 'Acao de Danos Morais C.C. Inexistencia de Debitos com Pedido de Tutela de Urgencia';
  return 'Acao de Restituicao de Quantia Paga C/C Indenizacao por Danos Morais';
}

// ─── Helper: data formatada ───────────────────────────────────
function todayFormatted(city?: string | null, state?: string | null): string {
  const loc = [city, state].filter(Boolean).join('/') || 'Local nao informado';
  return `${loc}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
}

// ─── Prompt por tipo de documento ────────────────────────────
function buildPrompt(docType: DocType, lead: PhcLeadData, lawyer: PhcLawyerData): string {
  const acao = getAcaoByFunnel(lead.funnel_slug || lead.funnel_name);
  const isFemale = (lead.gender || '').toLowerCase() === 'f' ||
    (lead.occupation || '').toLowerCase().endsWith('a');
  const artigo = isFemale ? 'a' : 'o';
  const contratante = isFemale ? 'CONTRATANTE' : 'CONTRATANTE';
  const declarante = isFemale ? 'DECLARANTE' : 'DECLARANTE';

  const lawyerAddr = [
    lawyer.street, lawyer.street_number, lawyer.neighborhood,
    lawyer.city, lawyer.state, lawyer.cep ? `CEP ${lawyer.cep}` : null
  ].filter(Boolean).join(', ');

  const occupationStr = [lead.employment_status || null, (lead.occupation_detail || lead.occupation) ? `(${lead.occupation_detail || lead.occupation})` : null].filter(Boolean).join(' ') || null;

  const clienteQual = [
    lead.name.toUpperCase(),
    lead.nationality || 'brasileiro',
    lead.marital_status || null,
    occupationStr,
    lead.rg ? `inscrit${artigo} no RG no ${lead.rg}` : null,
    lead.cpf ? `CPF no ${lead.cpf}` : null,
    lead.address && lead.city
      ? `residente e domiciliad${artigo} a ${lead.address}, ${lead.city}/${lead.state || 'SP'}${lead.cep ? `, CEP ${lead.cep}` : ''}`
      : null
  ].filter(Boolean).join(', ');

  const foro = [lead.city, lead.state].filter(Boolean).join('/') || 'Sao Paulo/SP';

  if (docType === 'contrato') {
    return `Voce e um redator juridico brasileiro especializado em contratos advocaticios.
Gere um INSTRUMENTO PARTICULAR DE PRESTACAO DE SERVICOS ADVOCATICIOS "CONTRATO DE RISCO" completo e formal.

DADOS DO CONTRATADO (ADVOGADO):
- Nome: ${lawyer.name}
- OAB: ${lawyer.oab}
- Endereco: ${lawyerAddr}

DADOS DO CONTRATANTE (CLIENTE):
- Qualificacao completa: ${clienteQual}

OBJETO: ${acao}
FORO: Comarca de ${foro}

INSTRUCOES OBRIGATORIAS:
1. Use linguagem juridica formal e correta em portugues brasileiro com todos os acentos.
2. O contrato deve ter EXATAMENTE estas clausulas: 1 - DO OBJETO, 2 - DOS HONORARIOS E DO VENCIMENTO (com itens 2.1 a 2.8), 3 - DAS OBRIGACOES, DA RESCISAO E DA MULTA (com itens 3.1 a 3.3), 4 - DAS CONSIDERACOES FINAIS (com item 4.1).
3. Honorarios: 50% sobre condenacao em fase de liquidacao.
4. Multa por violacao: 30% sobre valor atualizado da causa.
5. Juros de mora: 1% ao mes + correcao monetaria TJSP.
6. Clausula de preferencia para aquisicao de credito judicial (prazo 5 dias uteis).
7. Use "CONTRATADO" para o advogado e "CONTRATANTE" para o cliente.
8. Termine com: "Por ser verdade, firmo o presente."
9. Escreva APENAS o corpo do contrato, sem titulo separado, comecando pela introducao das partes.
10. NUNCA use placeholders como [XXX] ou campos em branco. Use os dados fornecidos.

Retorne SOMENTE o texto do contrato, sem comentarios ou explicacoes adicionais.`;
  }

  if (docType === 'procuracao') {
    return `Voce e um redator juridico brasileiro especializado em documentos advocaticios.
Gere uma PROCURACAO AD JUDICIA ET EXTRA completa e formal.

OUTORGANTE (CLIENTE):
- Qualificacao completa: ${clienteQual}

OUTORGADO (ADVOGADO):
- Nome: ${lawyer.name}
- OAB: ${lawyer.oab}
- Endereco profissional: ${lawyerAddr}

OBJETO: ${acao}

INSTRUCOES OBRIGATORIAS:
1. Use linguagem juridica formal e correta em portugues brasileiro com todos os acentos.
2. Inclua poderes amplos e gerais: ad judicia et extra, para foro em geral, todos os Juizos, Instancias e Tribunais.
3. Inclua poderes especificos: propor acoes, transigir, desistir, receber e dar quitacoes, assinar termos de levantamento, firmar compromissos, acordos, substabelecer com ou sem reservas.
4. Inclua representacao perante reparticoes publicas e autarquias.
5. Inclua clausula de preferencia para aquisicao de credito judicial (prazo 5 dias uteis).
6. Comece com "PROCURACAO AD JUDICIA ET EXTRA" como titulo, depois a qualificacao do outorgante.
7. NUNCA use placeholders como [XXX] ou campos em branco.

Retorne SOMENTE o texto da procuracao, sem comentarios adicionais.`;
  }

  // declaracao_hipo
  const tituloBR = isFemale ? 'DECLARACAO DE HIPOSSUFICIENCIA' : 'DECLARACAO DE HIPOSSUFICIENCIA';
  return `Voce e um redator juridico brasileiro.
Gere uma DECLARACAO DE HIPOSSUFICIENCIA completa e formal.

DECLARANTE:
- Qualificacao completa: ${clienteQual}

INSTRUCOES OBRIGATORIAS:
1. Use linguagem juridica formal e correta em portugues brasileiro com todos os acentos.
2. O declarante declara nao ter condicoes de arcar com custas judiciais sem prejuizo da propria subsistencia e de sua familia.
3. Requerer a concessao dos beneficios da ASSISTENCIA JUDICIARIA GRATUITA.
4. Citar: artigo 5o, inciso LXXIV da Constituicao Federal; artigo 98 do CPC; Lei no 1.060/50; Lei no 5.584/70; Lei no 7.510/86.
5. Termine com: "Por ser verdade, firmo a presente."
6. NUNCA use placeholders como [XXX] ou campos em branco.

Retorne SOMENTE o texto da declaracao, sem comentarios adicionais.`;
}

// ─── Funcao principal ─────────────────────────────────────────
export async function generateDocumentText(
  docType: DocType,
  lead: PhcLeadData,
  lawyer: PhcLawyerData
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });

  const prompt = buildPrompt(docType, lead, lawyer);

  console.log(`[PHC-Gemini] Gerando ${docType} para ${lead.name}...`);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  console.log(`[PHC-Gemini] Documento gerado: ${text.length} chars`);

  return text;
}
