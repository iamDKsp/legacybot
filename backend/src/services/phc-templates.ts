import type { GenderCtx } from './gender-detect';

export type FunnelSlug = 'golpe-cibernetico'|'golpe_cibernetico'|'conta-hackeada'|'conta_hackeada'|'golpe-do-pix'|'golpe_do_pix'|'nome-negativado'|'nome_negativado'|'trabalhista'|'geral';

function norm(s:string):string{ return s.toLowerCase().replace(/[\s_]+/g,'-'); }

// -- Objetos por funil ------------------------------------------
export function getAcaoContrato(slug:string):string {
  const s = norm(slug);
  if (s.includes('trabalhista')) return 'RECLAMAÇÃO TRABALHISTA C/C VERBAS RESCISÓRIAS';
  if (s.includes('negativado') || s.includes('negativada')) return 'AÇÃO DE DANOS MORAIS C.C. INEXISTÊNCIA DE DÉBITOS COM PEDIDO DE TUTELA DE URGÊNCIA';
  // golpe pix, conta hackeada, golpe cibernetico, geral
  return 'AÇÃO DE RESTITUIÇÃO DE QUANTIA PAGA C/C INDENIZAÇÃO POR DANOS MORAIS';
}

export function getAcaoProcuracao(slug:string):string {
  const s = norm(slug);
  if (s.includes('trabalhista')) return 'Reclamação Trabalhista c/c Verbas Rescisórias';
  if (s.includes('negativado') || s.includes('negativada')) return 'Ação de Danos Morais C.C. Inexistência de Débitos com Pedido de Tutela de Urgência';
  return 'Ação de Restituição de Quantia Paga C/C Indenização por Danos Morais';
}

// -- Helper: montar qualificação do advogado --------------------
export function advQual(adv:{name:string;oab:string;city?:string|null;state?:string|null;street?:string|null;street_number?:string|null;cep?:string|null}):string {
  const local = [adv.street, adv.street_number].filter(Boolean).join(', ');
  const cidade = [adv.city, adv.state].filter(Boolean).join('/');
  const cep = adv.cep ? `, CEP: ${adv.cep}` : '';
  return `${adv.name}, advogado inscrito na ${adv.oab}, com escritório profissional localizado à ${local||'endereço não informado'}, na cidade de ${cidade||'cidade não informada'}${cep}`;
}

// Normaliza o RG para o formato 'nº XXXXX SSP/SP' sem 'ORG EMISSOR:' nem 'UF:'
// Aceita formatos: '42.362.711-1 SSP/SP', '7275710-6', 'SSP UF: SP 1234567'
function formatRg(rg: string): string {
    // Remove labels que a IA coloca
    let clean = rg
        .replace(/\bORG\.?\s*EMISSOR\s*:?\s*/gi, '')
        .replace(/\bUF\s*:?\s*/gi, '')
        .trim();

    // Tenta extrair numéro e órgão no formato 'NUMERO ORGAO/UF'
    // Ex: '42.362.711-1 SSP/SP' ou '7275710-6 SSP SP' ou '7275710-6\nSSP SP'
    const match = clean.match(/^([\d.\-]+)\s+([A-Z]{2,4})\s*[/\s]?\s*([A-Z]{2})?/i);
    if (match) {
        const num = match[1].trim();
        const org = match[2].trim().toUpperCase();
        const uf  = match[3] ? match[3].trim().toUpperCase() : '';
        return uf ? `${num} ${org}/${uf}` : `${num} ${org}`;
    }
    return clean;
}

export function clienteQual(g:GenderCtx, name:string, rg?:string|null, cpf?:string|null, addr?:string|null, city?:string|null, state?:string|null, cep?:string|null, occupation?:string|null):string {
  const rgFormatted = rg ? formatRg(rg) : null;
  const rgStr  = rgFormatted ? `inscrit${g.o_a} no RG nº ${rgFormatted}` : '';
  const cpfStr = cpf ? `CPF nº ${cpf}` : '';
  const id     = [rgStr, cpfStr].filter(Boolean).join(' e ');
  const end    = [addr, city && state ? `${city}/${state}` : city||state].filter(Boolean).join(', ');
  const cepStr = cep ? `, CEP ${cep}` : '';
  const occStr = occupation ? `, ${occupation}` : '';
  return `${name}, ${g.qualificacao}${occStr}${id ? ', ' + id : ''}${end ? ', residente e domiciliad' + g.o_a + ' à ' + end + cepStr : ''}`;
}

// -- Template: CONTRATO -----------------------------------------
export interface ContratoData {
  advQualificacao: string;
  clienteQualificacao: string;
  g: GenderCtx;
  acao: string;
  foro: string;
  localData: string;
  advNome: string;
  advOab: string;
  clienteNome: string;
  clienteCpf?: string|null;
}

export function buildContrato(d:ContratoData): string[] {
  const C = d.g.CONTRATANTE;
  const o = d.g.o_a;
  const do_ = d.g.do_da;
  return [
    `INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS "CONTRATO DE RISCO"\nque fazem entre si:`,
    `${d.advQualificacao}, doravante unicamente denominado de [[BOLD]]CONTRATADO[[/BOLD]] e de outro lado, ${d.clienteQualificacao}, doravante denominad${o} [[BOLD]]CONTRATANTE[[/BOLD]]; os quais pactuam o presente contrato conforme as cláusulas abaixo:`,
    `1 - DO OBJETO`,
    `1.1. O presente instrumento tem por objeto propor [[BOLD]]${d.acao}[[/BOLD]], com atuação até eventual recurso perante o Tribunal de Justiça.`,
    `2 - DOS HONORÁRIOS E DO VENCIMENTO`,
    `2.1. ${C} se obriga a pagar como honorários contratados em relação às ações descritas na cláusula 1.2 a quantia de 50% (cinquenta por cento), sobre o valor total da condenação em fase de liquidação, bem como, sobre o valor de eventual multa cominatória. Ainda que exista acordo entre as partes, a porcentagem continua inalterada.`,
    `2.2. Ficará por conta ${do_} CONTRATANTE as despesas relativas às custas iniciais, preparo, taxa de procuração, honorários de sucumbência e demais taxas oriundas da referida ação;`,
    `2.3. ${C} autoriza de livre e espontânea vontade que o CONTRATADO faça levantamento de qualquer depósito judicial nos autos, abatendo honorários contratuais e sucumbenciais, repassando o remanescente.`,
    `2.4. ${C} fica ciente de que em caso de destituição ou revogação de poderes, deve pagar na integralidade os honorários contratados na cláusula 2.1, podendo o CONTRATADO, a seu critério, compensar tal percentual com eventual indenização concedida no processo.`,
    `2.5. Eventuais honorários de sucumbência pertencerão ao CONTRATADO os quais não possuem vínculo com os honorários contratados.`,
    `2.6. Em caso de improcedência da ação, ${C} estará isent${o} do pagamento de honorários advocatícios ao CONTRATADO, com exceção de eventuais custas finais, sucumbência ou litigância de má-fé, haja vista tratar-se de "CONTRATO DE RISCO".`,
    `2.7. ${C} confere ao CONTRATADO o direito de preferência para aquisição de eventual crédito judicial oriundo de ação proposta pelo CONTRATADO, caso queira ceder, negociar ou transferir o referido crédito, no todo ou em parte, a terceiros. Para tanto, obriga-se a notificar previamente o CONTRATADO, por escrito, informando os termos da proposta recebida, conferindo-lhe o prazo de 5 (cinco) dias úteis para manifestação quanto ao exercício de seu direito de preferência, em igualdade de valores e condições, sob pena de nulidade do negócio. A ausência de manifestação do CONTRATADO autoriza a cessão a terceiros nos mesmos valores e condições comunicadas.`,
    `2.8. Em caso de cessão de crédito judicial, ficam desde já resguardados os direitos do CONTRATADO quanto à reserva e ao levantamento autônomo dos honorários contratuais e sucumbenciais, nos termos da quantia estipulada na cláusula 2.1.`,
    `3 - DAS OBRIGAÇÕES, DA RESCISÃO E DA MULTA`,
    `3.1. Em caso de violação contratual, destituição do defensor ou inadimplemento, ${C} pagará multa de 30% (trinta por cento) sobre o valor atualizado da causa, sem prejuízo de eventual ação por perdas e danos.`,
    `3.2. Ficam estipulados ainda juros de mora de 1% (um por cento) ao mês, mais atualização monetária de acordo com a tabela do Tribunal de Justiça a contar do inadimplemento contratual.`,
    `3.3. ${C} obriga-se a atualizar seu endereço e números de telefone junto ao CONTRATADO, sempre que houver alteração.`,
    `4 - DAS CONSIDERAÇÕES FINAIS`,
    `4.1. Fica eleito o Foro da Comarca de ${d.foro}, para apreciar todas as questões decorrentes do presente contrato.`,
    `Por ser verdade, firmo o presente.\n\n${d.localData}`,
  ];
}

// -- Template: PROCURAÇÃO ---------------------------------------
export interface ProcuracaoData {
  clienteQualificacao: string;
  advNome: string;
  advOab: string;
  advEndereco: string;
  g: GenderCtx;
  acao: string;
  localData: string;
  clienteNome: string;
}

export function buildProcuracao(d:ProcuracaoData): string[] {
  const G = d.g; const o = G.o_a; const O = G.O_A;
  return [
    `PROCURAÇÃO AD JUDICIA ET EXTRA`,
    `${d.clienteQualificacao}.\n\nConstitui seu bastante procurador [[BOLD]]${d.advNome}[[/BOLD]], advogado inscrito na ${d.advOab}, com escritório profissional à ${d.advEndereco}, a quem confere os mais amplos e gerais poderes das cláusulas ad juditia et extra, para o foro em geral, não importando qual o Juízo, Instância ou Tribunal, (inclusive, instância administrativa ou fiscal), podendo propor contra qualquer pessoa física ou jurídica de direito público ou privado as ações que julgar necessárias à defesa de seus direitos, e defendê-l${o} nas que contra el${o} for proposta, seguindo-as até final liquidação, podendo, ainda e da mesma forma, intervir em qualquer caso judicial ou extra judicial de interesse ${G.do_da} outorgante, fazer chamamento à autoria, abrir inventários segui-los até final partilha, requerer abertura de sindicâncias administrativas e defender ${G.o_a} outorgante, nas que contra el${o} forem abertas, fazer a defesa ${G.do_da} outorgante em processo e inquéritos criminais, transigir, desistir, receber e dar quitações de qualquer espécie, pagar, assinar termos de levantamento e depósito, firmar compromissos, fazer acordos, concordar e discordar de quaisquer declarações, representá-l${o} perante repartições públicas, autarquias ou de economia mista e substabelecer esta no todo ou em parte, com ou sem reservas de poderes, principalmente para representá-l${o} na [[BOLD]]${d.acao}[[/BOLD]]. ${G.O_A} outorgante, ainda, confere ao seu procurador o direito de preferência para aquisição de eventual crédito judicial oriundo de ação por este proposta, obrigando-se a notificá-lo previamente sobre qualquer proposta de cessão, em igualdade de condições com terceiros, no prazo de 5 (cinco) dias úteis para manifestação.`,
    d.localData,
  ];
}

// -- Template: DECLARAÇÃO DE HIPOSSUFICIÊNCIA -------------------
export interface HipoData {
  clienteQualificacao: string;
  g: GenderCtx;
  localData: string;
  clienteNome: string;
}

export function buildDeclaracaoHipo(d:HipoData): string[] {
  const G = d.g;
  return [
    G.declaracaoTitulo,
    `${d.clienteQualificacao}, DECLARO sob as penas da lei, que não tenho condições de arcar com as custas judiciais de qualquer natureza, pois isso implicaria em prejuízo à minha própria subsistência e à de meus familiares.\n\nDiante do meu atual estado de hipossuficiência econômica, requeiro a concessão dos benefícios da ASSISTÊNCIA JUDICIÁRIA GRATUITA, nos termos do artigo 5º, inciso LXXIV, da Constituição Federal, artigo 98 do Código de Processo Civil, bem como da legislação aplicável (Lei nº 1.060/50, Lei nº 5.584/70 e Lei nº 7.510/86), por não poder arcar com as despesas processuais sem prejuízo do sustento próprio e de minha família.`,
    `Por ser verdade, firmo a presente.\n\n${d.localData}`,
  ];
}
