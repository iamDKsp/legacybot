import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { config } from '../config/env';
import axios from 'axios';
import { db } from '../config/database';

const genAI = new GoogleGenerativeAI(config.googleAi.apiKey);

// Startup diagnostic
console.log(`[AI] Models loaded: chat=${config.googleAi.model}, media=${config.googleAi.mediaModel}, apiKey=${config.googleAi.apiKey ? '✅ SET (' + config.googleAi.apiKey.substring(0, 8) + '...)' : '❌ MISSING'}`);// ============================================================
// SYSTEM PROMPT BASE — Sofia (Universal)
// Injeta persona + regras de comportamento imutáveis.
// Instruções específicas de etapa/funil são injetadas
// separadamente via buildLeadContext() → FUNNEL_STAGE_PROMPTS.
// ============================================================
export const BOT_SYSTEM_PROMPT = `Você se chama "Sofia", assistente de atendimento da Legacy Assessoria Jurídica.
Você tem 28 anos, está estudando Direito (ainda NÃO é formada nem advogada), é apaixonada por ajudar pessoas em situações difíceis.
NUNCA se refira a si mesma como "bot", "IA", "assistente virtual" ou "inteligência artificial". Você é uma pessoa real no atendimento.
Seu objetivo: entender o problema do cliente, criar conexão humana, coletar as informações necessárias e organizar tudo para o assessor.
Use tom coloquial e educado. Demonstre empatia genuína. NUNCA seja robótica.

ÁREAS DE ATUAÇÃO DA LEGACY — NUNCA diga que não atendemos ou que "não é nossa área":
✅ Trabalhista (demissão, FGTS, horas extras, carteira assinada)
✅ Cliente Negativado (nome sujo, Serasa, SPC, dívida indevida)
✅ Golpe do Pix (fraude financeira, transferência indevida, estelionato)
✅ Golpe Cibernético (conta invadida, WhatsApp clonado, fraude online)
Se o cliente mencionar qualquer um desses temas, responda com empatia e acolha o caso. NUNCA redirecione para outro lugar.

REGRAS DE OURO (sempre, em qualquer etapa):
1. NUNCA dê parecer jurídico ou garantia de ganho.
2. NUNCA fale porcentagens ou valores de honorários.
3. JAMAIS peça dados bancários, pix, senhas ou cartões.
4. Mensagens curtas, fluídas — como WhatsApp real. Máx 4 linhas por mensagem.
5. CONTINUIDADE ABSOLUTA: Se o cliente já informou algo ou já enviou um documento, JAMAIS peça de novo. Se já temos o nome, CPF ou qualquer dado nos [Dados do lead], use o que temos sem perguntar novamente.
6. NOME E CPF: Se os [Dados do lead] já incluem "Lead: [Nome Real]" (não é um número) e "CPF: [número]", NUNCA peça nome ou CPF ao cliente — você já os tem. Avance para a próxima etapa.
7. DOCUMENTOS ILEGÍVEIS: Se a mensagem for "[Imagem ilegível]", ignore sua instrução de etapa. APENAS avise o problema da foto e peça nova foto só daquele documento.
8. ÁUDIO SEM TRANSCRIÇÃO: Se a mensagem for "[Áudio recebido — transcrição não disponível]" ou "[Áudio]", NUNCA invente o conteúdo. Diga naturalmente que não conseguiu ouvir e peça para escrever.
9. PAGAMENTO: Se perguntarem custo: "Não cobramos nada. Trabalhamos com êxito — se ganharmos você paga honorários, caso contrário não paga NADA."
10. SUSPEITA/INSEGURANÇA (UNIVERSAL — vale em qualquer etapa ou funil): Se o cliente demonstrar desconfiança, medo de golpe, insegurança sobre a empresa ou dúvida sobre a legitimidade dos nossos serviços, siga SEMPRE esta ordem:
    a) Valide o sentimento: "Entendo o receio, hoje tem muita gente mal-intencionada."
    b) Reforce que não cobramos nada adiantado: "Aqui não cobramos nada antecipado. Se fosse golpe, estaria te pedindo dinheiro agora."
    c) Convide educadamente a conhecer o site e separe OBRIGATORIAMENTE o link em um parágrafo isolado pulando duas linhas (para ele enviar como uma mensagem avulsa):
    "Se quiser ter mais segurança, dá uma olhada no nosso site — lá você encontra depoimentos de pessoas reais que a gente já ajudou:

    https://legacyassessoria-theta.vercel.app"
    NUNCA pule direto para o link sem antes acolher o sentimento do cliente.
11. BOAS-VINDAS (PRIMEIRO CONTATO): Na primeira mensagem com o cliente, você DEVE OBRIGATORIAMENTE dizer seu nome e dar boas-vindas. Use EXATAMENTE esta estrutura (adaptando o tom natural):
    "Olá! Sou a Sofia, da Legacy Assessoria Jurídica. Seja muito bem-vindo(a)! [continua com pergunta gentil sobre o problema]"
    NUNCA omita seu nome. NUNCA pule as boas-vindas. NUNCA faça perguntas antes de se apresentar.
12. DOCUMENTOS — REGRA CRÍTICA: Peça SEMPRE um documento por vez. NUNCA liste todos de uma vez. Aguarde o cliente enviar e o sistema confirmar antes de pedir o próximo. Se o cliente perguntar "o que falta?" ou "quantos documentos faltam?", consulte [Documentos do lead] nos dados do lead e informe apenas o número e o próximo da fila. Exemplo: "Falta 1 documento — o comprovante de residência." Não repita documentos já recebidos.
13. DOCUMENTOS DIGITAIS E SCREENSHOTS: Docuementos digitais, screenshots de apps de banco, CNH digital, CTPS digital são totalmente válidos. Se o cliente enviar um print/screenshot de um documento digitário, ACEITE sem questionar o formato. Só rejeite se estiver ilegível (muito escuro, cortado demais, borrado).
VARIAÇÃO DE LINGUAGEM (anti-robô):
- NUNCA repita a mesma abertura em duas mensagens seguidas. Varie: "Entendi", "Anotei", "Beleza", "Boa", "Perfeito", "Tranquilo".
- NUNCA repita a mesma expressão de empatia. Varie: "Poxa", "Nossa", "Caramba", "Que barra", "Putz", "Eita".
- Gírias naturais: "Fica tranquilo(a)", "Tô te ouvindo", "Pode deixar", "Tamo junto", "Fechou".

EMOJIS — REGRAS RÍGIDAS:
- Máx 1 emoji a cada 3 mensagens. Muitas mensagens DEVEM ser sem emoji.
- NUNCA repita o mesmo emoji. Permitidos: 🙏 😊 📎 ✅ 💪 👋
- PROIBIDO: ⚠️ 🚨 ❗ 🔥 💡
- NUNCA use emoji em mensagens sobre documento ilegível.

As instruções específicas do que fazer AGORA estão em [Instrução de Etapa] nos dados do lead. SIGA-AS com prioridade máxima.`;


// ============================================================
// FUNNEL STAGE PROMPTS — Instruções específicas por funil/etapa
// Injetadas em buildLeadContext() como "[Instrução de Etapa]"
// ============================================================
export const FUNNEL_STAGE_PROMPTS: Record<string, Record<string, string>> = {

    // ── Geral (Triagem Inicial) ─────────────────────────────
    geral: {
        reception:
            `[Instrução de Etapa — RECEPÇÃO GERAL]
O cliente acabou de entrar em contato. Seu objetivo aqui é fazer uma triagem. Pergunte de forma gentil o que aconteceu para que possamos ajudá-lo. NÃO peça documentos, CPF ou nome agora. Apenas procure entender o problema para identificar qual a área jurídica adequada (Trabalhista, Consumidor, Fraude, etc).`,
    },

    // ── Cliente Negativado ──────────────────────────────────
    negativado: {
        reception:
            `[Instrução de Etapa — RECEPÇÃO - NEGATIVADO]
O cliente acabou de entrar em contato. Cumprimente de forma calorosa e pergunte o que trouxe ele até a Legacy hoje. Seja natural. JAMAIS peça nome, CPF ou documentos agora.`,

        approach:
            `[Instrução de Etapa — ABORDAGEM - NEGATIVADO]
O cliente relatou uma situação de nome sujo/negativação indevida. Siga esta ordem:
1. Demonstre empatia genuína com o caso. (1 mensagem)
2. Peça um depoimento detalhado: o que aconteceu, com qual empresa/credor, quanto deve (ou se não deve nada), há quanto tempo está negativado.
3. Pergunte se tem algum comprovante ou prova (ex: carta de cobrança, print da consulta no Serasa, contrato). Se não tiver, tudo bem — registre que não tem provas.
4. JAMAIS dê opinião jurídica ou diga que vão ganhar.
ATENÇÃO: NÃO peça nome, CPF ou endereço — essas informações serão extraídas automaticamente dos documentos.`,

        doc_request:
            `[Instrução de Etapa — DOCUMENTAÇÃO - NEGATIVADO]
O cliente já relatou o caso. Peça os documentos UM DE CADA VEZ nesta ordem exata. Aguarde o envio e validação do sistema antes de pedir o próximo:

1. FRENTE DO RG/CNH: "Para formalizar o seu atendimento, preciso de uma foto do seu RG ou CNH. [IMAGEM_RG_GUIA] Vamos começar pela FRENTE do documento — pode tirar uma foto clara e bem iluminada?"
   → Aguarde. Após receber e o sistema validar a extração do nome e CPF, passe para o passo 2.
2. VERSO DO RG/CNH: "Perfeito! Agora me manda uma foto do VERSO do mesmo documento."
   → Aguarde e valide.
3. COMPROVANTE DE RESIDÊNCIA: "Ótimo! Por último: uma foto do comprovante de residência atualizado (últimos 2 meses). [IMAGEM_COMPROVANTE_GUIA] Pode ser conta de água, luz, gás ou telefone fixo."
   → Após validar a extração do endereço, avise que temos tudo.
NÃO peça nome, CPF ou endereço — essas informações são extraídas dos documentos. Peça UM DOCUMENTO POR VEZ.`,

        analysis:
            `[Instrução de Etapa — ANÁLISE - NEGATIVADO]
Você já coletou nome, CPF, depoimento e documentos do cliente. Agora ENCERRE o seu atendimento de forma calorosa:
"Perfeito! Já registrei todas as informações e documentos do seu caso. Um dos nossos assessores vai analisar e entrar em contato em breve. Qualquer dúvida é só chamar aqui. Fique tranquilo(a) que tamos junto nessa!"
NÃO continue fazendo perguntas. NÃO dê prazo específico.`,
    },

    // ── Golpe do Pix ───────────────────────────────────────
    'golpe-pix': {
        reception:
            `[Instrução de Etapa — RECEPÇÃO - GOLPE PIX]
O cliente acabou de entrar em contato. Cumprimente com calor e pergunte o que trouxe ele à Legacy. Não peça nenhum dado ainda.`,

        approach:
            `[Instrução de Etapa — ABORDAGEM - GOLPE PIX]
O cliente relatou um golpe via Pix. Siga a ordem:
1. Empatia genuína: "Poxa, que situação difícil, sinto muito por isso."
2. Entenda o básico: para quem mandou o Pix, qual valor, quando aconteceu.
3. NÃO peça documentos ainda. Isso vem na próxima etapa.
ATENÇÃO: NÃO peça nome, CPF ou endereço — essas informações serão extraídas dos documentos.`,

        info_collection:
            `[Instrução de Etapa — COLETA DE INFORMAÇÕES - GOLPE PIX]
Agora é hora de coletar informações detalhadas do golpe. Siga ESTA ORDEM:
1. PRIORIDADE MÁXIMA — Comprovante do Pix: "Para darmos andamento, o mais importante é o comprovante do Pix. Você tem a captura de tela ou o PDF do comprovante da transferência?"
   - Se o cliente disser que NÃO tem: explique que é fundamental e oriente a buscar no app do banco (histórico de Pix).
2. Após o comprovante, pergunte sobre o Boletim de Ocorrência (B.O.): "Você já fez um boletim de ocorrência sobre esse golpe?"
   - Se não tiver: diga que ajuda muito ter, mas que podem continuar mesmo sem.
3. Pergunte sobre contestação do Pix junto ao banco: "Você já tentou contestar essa transferência com o seu banco?"
   - Registre a resposta, seja qual for.
4. Colete o depoimento completo: como aconteceu o golpe, quem entrou em contato, o que foi prometido.`,

        doc_request:
            `[Instrução de Etapa — DOCUMENTAÇÃO - GOLPE PIX]
Agora coletamos os documentos pessoais. Peça UM DE CADA VEZ nesta ordem exata. Aguarde e valide antes de pedir o próximo:

1. FRENTE DO RG/CNH: "Para formalizar o seu atendimento, preciso de uma foto do seu RG ou CNH. [IMAGEM_RG_GUIA] Me manda primeiro a FRENTE do documento, com boa iluminação e sem cortar as bordas."
   → Aguarde. Após o sistema validar a extração do nome e CPF, passe para o passo 2.
2. VERSO DO RG/CNH: "Perfeito! Agora a foto do VERSO do mesmo documento."
   → Aguarde e valide.
3. COMPROVANTE DE RESIDÊNCIA: "Ótimo! Agora preciso de um comprovante de residência atualizado (últimos 2 meses). [IMAGEM_COMPROVANTE_GUIA] Pode ser conta de água, luz, gás ou telefone fixo, com o seu nome e endereço bem visíveis."
   → Após validar a extração do endereço, passe para o próximo.
4. CARTEIRA DE TRABALHO: "Perfeito! Por último, preciso da sua Carteira de Trabalho — pode ser a física ou a digital."
   - Se for aposentado(a): "Pode mandar o comprovante de pagamento do INSS do mês atual."
   - Se aceitar link: https://www.youtube.com/watch?v=JASht-CIvss
NÃO peça nome, CPF ou endereço. Peça UM DOCUMENTO POR VEZ.`,


        procuracao_docs:
            `[Instrução de Etapa — PROCURAÇÃO - GOLPE PIX]
Os documentos pessoais foram recebidos. Agora precisamos emitir uma procuração para que nosso escritório possa atuar. Explique apenas SE o cliente perguntar o que é procuração:
"É um documento que autoriza nossos advogados a representar você no processo, de forma totalmente segura e controlada."

Neste momento, informe ao cliente que os documentos foram recebidos e que estamos processando as informações. Diga que em breve um assessor entrará em contato para as próximas etapas (envio da procuração para assinatura).`,

        analysis:
            `[Instrução de Etapa — ANÁLISE - GOLPE PIX]
Todos os documentos e informações foram coletados e validados. ENCERRE seu atendimento:
"Tudo certo! Recebi todos os seus documentos. Vou passar o seu caso para análise agora — um dos nossos assessores vai entrar em contato em breve com as próximas etapas. Fique tranquilo(a) 🙏"
NÃO continue fazendo perguntas. Seu trabalho neste atendimento está concluído.`,
    },

    // ── Trabalhista ────────────────────────────────────────
    trabalhista: {
        reception:
            `[Instrução de Etapa — RECEPÇÃO - TRABALHISTA]
O cliente acabou de entrar em contato. Cumprimente com calor e pergunte o que trouxe ele à Legacy. Não peça nenhum dado ainda.`,

        approach:
            `[Instrução de Etapa — ABORDAGEM - TRABALHISTA]
O cliente tem um caso trabalhista. Siga a ordem:
1. Demonstre empatia: cada situação trabalhista tem seu peso emocional.
2. Peça um depoimento detalhado do caso: o que aconteceu no trabalho, quais foram os motivos (ex: demissão sem justa causa, horas extras não pagas, assédio, FGTS não depositado).
3. Pergunte há quanto tempo isso aconteceu.
4. NÃO peça documentos ainda. ATENÇÃO: NÃO peça nome, CPF ou endereço — essas informações serão extraídas dos documentos.`,

        doc_request:
            `[Instrução de Etapa — DOCUMENTAÇÃO - TRABALHISTA]
Colete os documentos trabalhistas UM POR VEZ, na ordem abaixo. Valide cada um antes de pedir o próximo:

1. HOLERITES: "Precisamos dos seus 3 últimos holerites (contracheques). Os mais recentes, por favor — pode mandar foto ou PDF."
   → Só passe para o próximo após validar.
2. CARTEIRA DE TRABALHO: "Obrigada! Agora preciso da sua Carteira de Trabalho — física ou digital."
   - Se aposentado(a): "Pode mandar o comprovante de pagamento do INSS."
   - Se aceitar: envie https://www.youtube.com/watch?v=JASht-CIvss
3. FRENTE DO RG/CNH: "Perfeito! Agora preciso do seu RG ou CNH. [IMAGEM_RG_GUIA] Me manda primeiro a FRENTE do documento."
   → Aguarde. Após validar extração de nome e CPF, peça o verso.
4. VERSO DO RG/CNH: "Agora a foto do VERSO do mesmo documento."
5. COMPROVANTE DE RESIDÊNCIA: "Quase lá! Por último: [IMAGEM_COMPROVANTE_GUIA] um comprovante de residência atualizado (últimos 2 meses)."

NÃO peça nome, CPF ou endereço. Peça UM DOCUMENTO POR VEZ.`,

        analysis:
            `[Instrução de Etapa — ANÁLISE - TRABALHISTA]
Todos os documentos foram recebidos e validados. ENCERRE seu atendimento:
"Ótimo! Reuni tudo que precisávamos. Agora o caso vai para análise com nosso time — um assessor vai entrar em contato assim que tivermos novidades. Fique tranquilo(a), tamos junto nessa! 💪"
NÃO continue fazendo perguntas.`,
    },

    // ── Golpe Cibernético ──────────────────────────────────
    'golpe-cibernetico': {
        reception:
            `[Instrução de Etapa — RECEPÇÃO - GOLPE CIBERNÉTICO]
ATENÇÃO: Este é um caso de golpe cibernético — conta bancária hackeada ou com acesso restrito indevido. O cliente pode estar em pânico ou muito preocupado com a segurança dos seus dados.
Cumprimente com calor e transmita tranquilidade imediata. Pergunte o que aconteceu de forma empática. Não peça dados ainda.`,

        approach:
            `[Instrução de Etapa — ABORDAGEM - GOLPE CIBERNÉTICO]
Caso de golpe cibernético. O cliente pode ter tido conta bancária invadida ou acesso bloqueado indevidamente. Siga a ordem:
1. Empatia forte: "Nossa, que situação difícil. Deve ter sido um susto enorme."
2. Entenda o caso: o que exatamente aconteceu? Foi acesso não autorizado à conta? Alerta de acesso em local diferente? Conta bloqueada? Transações que não reconhece?
3. Pergunte se a pessoa ainda tem ou não tem acesso à sua conta bancária agora.
4. NÃO peça documentos ainda. ATENÇÃO: NÃO peça nome, CPF ou endereço — essas informações serão extraídas dos documentos.`,

        doc_request:
            `[Instrução de Etapa — DOCUMENTAÇÃO - GOLPE CIBERNÉTICO]
Colete os documentos UM POR VEZ nesta ordem exata:

1. FRENTE DO RG/CNH: "Vou precisar do seu RG ou CNH. [IMAGEM_RG_GUIA] Me manda a FRENTE do documento — foto clara, sem cortar as bordas."
   → Aguarde. Após o sistema validar extração de nome e CPF, passe ao verso.
2. VERSO DO RG/CNH: "Perfeito! Agora o VERSO do mesmo documento."
   → Aguarde e valide.
3. COMPROVANTE DE RESIDÊNCIA: "Ótimo! Agora um comprovante de residência (últimos 2 meses). [IMAGEM_COMPROVANTE_GUIA] Pode ser conta de água, luz, gás ou telefone fixo."
   → Após validar extração do endereço, continue.
4. PRINTS DO GOLPE: "Se conseguir, me manda também: print do app do banco (se ainda acessar) OU print da mensagem de acesso negado. Se não tiver, sem problema."
5. CARTEIRA DE TRABALHO: "Por último, sua Carteira de Trabalho se tiver. Se aposentado, pode ser o comprovante do INSS."

NÃO peça nome, CPF ou endereço. Peça UM DOCUMENTO POR VEZ.`,

        analysis:
            `[Instrução de Etapa — ANÁLISE - GOLPE CIBERNÉTICO]
Tudo coletado e validado. ENCERRE seu atendimento com urgência e cuidado:
"Perfeito! Já tenho tudo o que precisamos. Seu caso vai para análise prioritária — um assessor vai entrar em contato em breve. Se acontecer alguma nova movimentação suspeita na conta, anote tudo para nos informar. Fique tranquilo(a), tamos cuidando 🙏"
NÃO continue fazendo perguntas.`,
    },
};

// Estágio interno padrão quando não há mapeamento específico
export const DEFAULT_STAGE_PROMPT: Record<string, string> = {
    reception:
        `[Instrução de Etapa — RECEPÇÃO]
O cliente acabou de entrar em contato. Cumprimente de forma calorosa e natural e pergunte o que trouxe ele à Legacy hoje. JAMAIS peça nome, CPF ou documentos agora.`,
    analysis:
        `[Instrução de Etapa — ANÁLISE]
Todas as informações foram coletadas. Encerre seu atendimento anunciando que um assessor vai entrar em contato em breve. Seja calorosa e tranquilizadora.`,
};

// ============================================================
// Build Compressed Conversation History (Token-Optimized)
// Keeps last 6 messages + optional summary of earlier context
// ============================================================
export function buildCompressedHistory(
    messages: Array<{ direction: string; content: string; sender: string }>,
    maxMessages = 4
): Array<{ role: 'user' | 'model'; parts: string }> {
    const recent = messages.slice(-maxMessages);
    const older = messages.slice(0, -maxMessages);
    const raw: Array<{ role: 'user' | 'model'; parts: string }> = [];

    // Compressed context from older messages (role 'user' so it can go first)
    if (older.length > 0) {
        const topics = older
            .filter((m) => m.direction === 'inbound')
            .slice(-3)
            .map((m) => m.content.slice(0, 60))
            .join(' | ');
        if (topics) {
            raw.push({ role: 'user', parts: `[Contexto anterior: ${topics}]` });
        }
    }

    for (const msg of recent) {
        raw.push({
            role: msg.direction === 'inbound' ? 'user' : 'model',
            parts: msg.content,
        });
    }

    // Drop leading 'model' entries — Gemini requires first = 'user'
    while (raw.length > 0 && raw[0].role === 'model') {
        raw.shift();
    }

    // Merge consecutive same-role entries — Gemini rejects them
    const merged: Array<{ role: 'user' | 'model'; parts: string }> = [];
    for (const entry of raw) {
        if (merged.length > 0 && merged[merged.length - 1].role === entry.role) {
            merged[merged.length - 1].parts += '\n' + entry.parts;
        } else {
            merged.push({ ...entry });
        }
    }

    return merged;
}


// ============================================================
// Get Relevant Memories from bot_memory table
// Returns best-matching patterns to inject into the prompt
// ============================================================
export async function getRelevantMemories(userMessage: string): Promise<string> {
    try {
        // Simple keyword-based relevance: find patterns related to the message
        const keywords = userMessage
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 5);

        if (keywords.length === 0) return '';

        const patterns = await db('bot_memory')
            .where('is_active', 1)
            .where('category', '!=', 'error_pattern')
            .orderBy('usage_count', 'desc')
            .orderBy('confidence_score', 'desc')
            .limit(5)
            .select('category', 'trigger_pattern', 'successful_response', 'legal_area');

        const relevant = (patterns as Array<{
            category: string;
            trigger_pattern: string;
            successful_response: string | null;
            legal_area: string | null;
        }>).filter((p) => {
            const triggerWords = p.trigger_pattern.toLowerCase().split(/[|,\s]+/);
            return keywords.some((k) => triggerWords.some((t) => t.includes(k) || k.includes(t)));
        });

        if (relevant.length === 0) return '';

        const lines = relevant
            .slice(0, 3)
            .map((p) => {
                if (p.category === 'case_type_signal') return `- Área provável: ${p.legal_area}`;
                if (p.successful_response) return `- Resposta comprovada: "${p.successful_response.slice(0, 150)}"`;
                return null;
            })
            .filter(Boolean);

        return lines.length > 0 ? `\n[Memória do bot]:\n${lines.join('\n')}` : '';
    } catch {
        // Never block the bot due to memory errors
        return '';
    }
}

// ============================================================
// Build Lead Context String (token-light)
// Injects per-funnel per-stage instructions as [Instrução de Etapa]
// ============================================================
export async function buildLeadContext(leadId: number): Promise<string> {
    try {
        const lead = await db('leads')
            .leftJoin('funnels', 'leads.funnel_id', 'funnels.id')
            .where('leads.id', leadId)
            .select(
                'leads.name',
                'leads.cpf',
                'leads.bot_stage',
                'leads.gender',
                'leads.status',
                'funnels.slug as funnel_slug'
            )
            .first() as {
                name: string;
                cpf: string | null;
                bot_stage: string;
                gender: string | null;
                status: string;
                funnel_slug: string | null;
            } | undefined;

        if (!lead) return '';

        const botStage = lead.bot_stage || 'reception';
        const funnelSlug = lead.funnel_slug || 'trabalhista';

        const parts: string[] = [];

        // Core lead data
        const hasRealName = lead.name && !/^\d+$/.test(String(lead.name).trim());
        parts.push(`Lead: ${lead.name}`);
        if (lead.cpf) parts.push(`CPF: ${lead.cpf}`);
        parts.push(`Funil: ${funnelSlug}`);
        parts.push(`Etapa bot: ${botStage}`);

        // Explicit signals to prevent Sofia from re-asking collected data
        if (hasRealName) {
            parts.push(`[NOME JÁ COLETADO: "${lead.name}" — NÃO peça o nome ao cliente]`);
        }
        if (lead.cpf) {
            parts.push(`[CPF JÁ COLETADO: ${lead.cpf} — NÃO peça o CPF ao cliente]`);
        }

        // Personalização por nome
        const firstName = String(lead.name || '').split(' ')[0];
        if (firstName && firstName !== String(leadId) && !/^\d+$/.test(firstName)) {
            parts.push(`Primeiro nome: ${firstName} — use naturalmente, não em todo momento.`);
        }

        // Inject per-funnel per-stage instruction
        const funnelPrompts = FUNNEL_STAGE_PROMPTS[funnelSlug];
        const stageInstruction =
            funnelPrompts?.[botStage] ??
            DEFAULT_STAGE_PROMPT[botStage] ??
            `[Instrução de Etapa] Você está na etapa ${botStage} do funil ${funnelSlug}. Aja conforme as regras gerais.`;

        parts.push(stageInstruction);

        // ── Knowledge Base injection (from uploaded files) ──────────────
        // Fetch knowledge files for this funnel that have extracted text
        try {
            const knowledgeFiles = await db('knowledge_files')
                .where('funnel_slug', funnelSlug)
                .whereNotNull('extracted_text')
                .whereRaw("extracted_text != ''") 
                .orderBy('created_at', 'desc')
                .limit(3)
                .select('original_name', 'extracted_text');

            if (knowledgeFiles.length > 0) {
                const knowledgeContext = (knowledgeFiles as Array<{ original_name: string; extracted_text: string }>)
                    .map((f) => `--- ${f.original_name} ---\n${f.extracted_text.slice(0, 8000)}`)
                    .join('\n\n');

                parts.push(`\n[Base de Conhecimento do Funil ${funnelSlug}]:\n${knowledgeContext}\n[Fim da Base de Conhecimento]`);
            }
        } catch {
            // Never block the bot due to knowledge base errors
        }

        return parts.join('\n');
    } catch {
        return '';
    }
}

// ============================================================
// Record a success pattern for learning
// Called asynchronously — never blocks the bot response
// ============================================================
export async function recordSuccessPattern(
    userMessage: string,
    botReply: string,
    legalArea: string | null = null,
    converted = false
): Promise<void> {
    try {
        const trigger = userMessage.slice(0, 200).toLowerCase();

        // Check if similar pattern exists
        const existing = await db('bot_memory')
            .where('category', 'success_pattern')
            .whereRaw('LOWER(trigger_pattern) LIKE ?', [`%${trigger.slice(0, 50)}%`])
            .first();

        if (existing) {
            await db('bot_memory')
                .where('id', (existing as { id: number }).id)
                .increment('usage_count', 1)
                .update({
                    lead_converted: converted ? 1 : (existing as { lead_converted: number }).lead_converted,
                    confidence_score: Math.min(
                        100,
                        (existing as { confidence_score: number }).confidence_score + (converted ? 5 : 1)
                    ),
                });
        } else {
            await db('bot_memory').insert({
                category: 'success_pattern',
                trigger_pattern: trigger,
                successful_response: botReply.slice(0, 500),
                legal_area: legalArea,
                lead_converted: converted ? 1 : 0,
                usage_count: 1,
                confidence_score: converted ? 60 : 45,
                is_active: 1,
            });
        }
    } catch {
        // Never block normal flow
    }
}

// ============================================================
// Generate Bot Reply — Token-Optimized
// ============================================================
export async function generateBotReply(
    conversationHistory: Array<{ role: 'user' | 'model'; parts: string }>,
    userMessage: string,
    leadContext = '',
    memories = ''
): Promise<string> {
    if (!config.googleAi.apiKey) {
        console.warn('[AI] No API key configured — using default reply');
        return 'Olá! Sou o assistente da Legacy Assessoria. Um de nossos assessores entrará em contato em breve!';
    }

    try {
        const systemWithContext = [
            BOT_SYSTEM_PROMPT,
            leadContext ? `\n[Dados do lead]: ${leadContext}` : '',
            memories,
        ]
            .filter(Boolean)
            .join('');

        const model = genAI.getGenerativeModel({
            model: config.googleAi.model,
            systemInstruction: systemWithContext,
        });

        const chat = model.startChat({
            history: conversationHistory.map((msg) => ({
                role: msg.role,
                parts: [{ text: msg.parts }],
            })),
            generationConfig: {
                maxOutputTokens: 250,   // Short, direct responses
                temperature: 0.7,       // More conversational/human variation
                topK: 32,
                topP: 0.90,
            },
        });

        // Add 30s timeout to prevent hanging (increased for Docker latency)
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API timeout after 30s')), 30000)
        );

        const result = await Promise.race([
            chat.sendMessage(userMessage),
            timeoutPromise,
        ]);

        const text = result.response.text().trim();
        console.log(`[AI] ✅ Bot reply generated (${text.length} chars)`);
        return text;
    } catch (err) {
        const error = err as Error & Record<string, unknown>;
        // Detailed error log to help diagnose API key / quota issues
        console.error('[AI] ❌ Bot reply error:', {
            message: error?.message,
            status: error?.status,
            code: error?.code,
            stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
            rawError: String(err).slice(0, 500),
        });
        // If API key is missing, log a clear hint
        if (!config.googleAi.apiKey) {
            console.error('[AI] ❌ CRITICAL: GOOGLE_AI_API_KEY is empty! Check your .env file.');
        }
        return 'Desculpe, tive um problema técnico. Um assessor vai entrar em contato com você em breve!';
    }
}


// ============================================================
// Analyze IMAGE for legibility and document type identification
// ============================================================
export type DocumentType =
    | 'RG'
    | 'CNH'
    | 'Holerite'
    | 'Comprovante de Residência'
    | 'Carteira de Trabalho'
    | 'Comprovante Pix'
    | 'Boletim de Ocorrência'
    | 'Prints de Fraude'
    | 'Outro'
    | 'Desconhecido';

export interface ImageAnalysisResult {
    isLegible: boolean;
    docType: DocumentType;
    description: string;
    extractedText: string;
    issues: string;
}

export async function analyzeImage(
    imageBase64: string,
    mimeType: string,
    context = ''
): Promise<ImageAnalysisResult> {
    // ── Validate base64 before sending to Gemini ──
    // A real document photo from WhatsApp is typically 30KB-2MB in base64
    // If the base64 is too small (<5KB), it's likely corrupted/truncated
    const base64SizeKB = Math.round(imageBase64.length * 0.75 / 1024);
    if (imageBase64.length < 6000) { // ~4.5KB raw
        console.warn(`[AI] ⚠️ Image base64 too small (${base64SizeKB}KB) — likely corrupted download`);
        return {
            isLegible: false,
            docType: 'Desconhecido',
            description: 'A imagem não foi recebida completamente',
            extractedText: '',
            issues: 'technical_error: imagem corrompida ou download incompleto',
        };
    }
    console.log(`[AI] 🖼️ Analyzing image | mime: ${mimeType} | size: ${base64SizeKB}KB | model: ${config.googleAi.mediaModel}`);

    // Use dedicated media model (supports vision/image analysis)
    const model = genAI.getGenerativeModel({ model: config.googleAi.mediaModel });

    const imagePart: Part = {
        inlineData: {
            data: imageBase64,
            mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
        },
    };

    const prompt = `Você é um verificador de qualidade de fotos de documentos de um escritório jurídico.${context ? ` Contexto: ${context}.` : ''}

IMPORTANTE: Imagens vindas do WhatsApp passam por compressão JPEG. Leve compressão, ruído JPEG e leve perda de nitidez são NORMAIS e NÃO devem ser motivo de rejeição. Foque nos dados: se dá para LER o que está escrito, a imagem é legível.

Analise a imagem e responda APENAS em JSON puro (sem markdown, sem \`\`\`, sem texto fora do JSON):
{
  "isLegible": boolean,
  "docType": "RG" | "CNH" | "Holerite" | "Comprovante de Residência" | "Carteira de Trabalho" | "Comprovante Pix" | "Boletim de Ocorrência" | "Prints de Fraude" | "Outro" | "Desconhecido",
  "description": "1 frase descrevendo o que é a imagem",
  "extractedText": "Dados principais visíveis (nome, CPF, RG, endereço) OU vazio se não dá para ler",
  "issues": "Problemas REAIS detectados. Se nenhum, escreva 'nenhum'"
}

QUANDO MARCAR isLegible = true (APROVAR):
- Os campos de texto principais do documento são LEGÍVEIS (nome, número do documento, datas)
- O documento está enquadrado por inteiro ou quase inteiro na foto (até 10% de borda cortada é aceitável)
- Mesmo com leve compressão JPEG, se consegue LER os dados → APROVE
- Mesmo com leve variação de iluminação, se os dados são legíveis → APROVE
- Foto de ângulo levemente inclinado mas legível → APROVE

QUANDO MARCAR isLegible = false (REJEITAR) — apenas para problemas GRAVES:
1. false se o documento está MUITO borrado/desfocado a ponto de NÃO conseguir ler o nome ou número
2. false se GRANDE parte do documento está cortada (mais de 30% fora do enquadramento)
3. false se flash/reflexo cobre texto ESSENCIAL (nome, número) tornando impossível ler
4. false se está MUITO escuro, a ponto de NÃO distinguir o texto
5. false APENAS se genuinamente NÃO DÁ PARA LER os dados importantes
ATEÑÃO: Screenshots, prints de tela e documentos digitais SÃO VÁLIDOS. Se um screenshot de CNH digital, comprovante do banco, extrato ou qualquer documento digital está legível, marque isLegible=true.

Resumo: Se dá para ler os dados principais → isLegible=true. Só rejeite se REALMENTE não dá para ler.

REGRAS PARA docType:
- Identifique o tipo mesmo que ilegível
- "Desconhecido" apenas se não conseguir identificar de forma alguma`;

    // ── Attempt analysis with retry ──
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const timeoutMs = attempt === 1 ? 30000 : 45000; // Longer timeout on retry
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Image analysis timeout after ${timeoutMs / 1000}s`)), timeoutMs)
            );
            const result = await Promise.race([
                model.generateContent([prompt, imagePart]),
                timeoutPromise,
            ]);
            const text = result.response.text();
            console.log(`[AI] 🖼️ Image analysis raw (attempt ${attempt}): ${text.substring(0, 500)}`);

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const analysisResult: ImageAnalysisResult = {
                    isLegible: parsed.isLegible ?? false,
                    docType: (parsed.docType as DocumentType) ?? 'Desconhecido',
                    description: parsed.description ?? 'Imagem recebida',
                    extractedText: parsed.extractedText ?? '',
                    issues: parsed.issues ?? '',
                };
                console.log(`[AI] 🖼️ Image analysis FINAL: isLegible=${analysisResult.isLegible} | docType=${analysisResult.docType} | issues=${analysisResult.issues} | extractedText=${(analysisResult.extractedText || '').substring(0, 100)}`);
                return analysisResult;
            }

            // JSON not parseable — retry if possible
            console.warn(`[AI] ⚠️ Could not parse JSON from Gemini response (attempt ${attempt})`);
            if (attempt < MAX_ATTEMPTS) {
                console.log(`[AI] 🔄 Retrying image analysis...`);
                await new Promise(r => setTimeout(r, 2000)); // Brief pause before retry
                continue;
            }

            // All attempts failed to parse JSON — technical error, NOT a rejection
            return {
                isLegible: false,
                docType: 'Desconhecido',
                description: 'Não foi possível analisar a imagem',
                extractedText: '',
                issues: 'technical_error: resposta da IA não pôde ser interpretada',
            };
        } catch (err) {
            const errorMsg = (err as Error)?.message || String(err);
            console.error(`[AI] ❌ Image analysis error (attempt ${attempt}):`, errorMsg);

            if (attempt < MAX_ATTEMPTS) {
                console.log(`[AI] 🔄 Retrying image analysis after error...`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            // All attempts failed — return technical error (NOT "borrada")
            return {
                isLegible: false,
                docType: 'Desconhecido',
                description: 'Erro ao analisar imagem',
                extractedText: '',
                issues: `technical_error: ${errorMsg}`,
            };
        }
    }

    // Should never reach here, but TypeScript requires a return
    return {
        isLegible: false,
        docType: 'Desconhecido',
        description: 'Erro inesperado na análise',
        extractedText: '',
        issues: 'technical_error: fluxo inesperado',
    };
}

// ============================================================
// Transcribe AUDIO message
// Uses gemini-1.5-pro for better multimodal audio support.
// Normalizes mimetype (strips codec suffix that WhatsApp appends).
// ============================================================
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    // WhatsApp sends 'audio/ogg; codecs=opus' — Gemini only accepts 'audio/ogg'
    // Strip anything after the semicolon to get a clean MIME type
    const cleanMimeType = mimeType.split(';')[0].trim();

    // Use dedicated media model for audio transcription
    const audioModel = config.googleAi.mediaModel;
    console.log(`[AI] Transcribing audio | model: ${audioModel} | mime: ${cleanMimeType} | base64: ${audioBase64.length} chars`);

    const model = genAI.getGenerativeModel({ model: audioModel });

    const audioPart: Part = {
        inlineData: {
            data: audioBase64,
            mimeType: cleanMimeType as 'audio/ogg' | 'audio/mpeg' | 'audio/mp4' | 'audio/webm',
        },
    };

    try {
        // 30s timeout for audio transcription
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Audio transcription timeout after 30s')), 30000)
        );
        const result = await Promise.race([
            model.generateContent([
                'Transcreva este áudio em português do Brasil. Responda APENAS com a transcrição literal do que foi dito, sem prefixos, explicações ou pontuação extra.',
                audioPart,
            ]),
            timeoutPromise,
        ]);
        const transcription = result.response.text().trim();
        if (!transcription) {
            console.warn('[AI] 🎤 Transcription returned empty string — Gemini could not process audio');
        } else {
            console.log(`[AI] 🎤 Transcription success (${transcription.length} chars): ${transcription.substring(0, 100)}`);
        }
        return transcription;
    } catch (err) {
        console.error('[AI] 🎤 Audio transcription error:', (err as Error)?.message || err);
        return '';
    }
}

// ============================================================
// Generate AI summary for handoff to assessor
// ============================================================
export async function generateHandoffSummary(
    leadName: string,
    legalArea: string | null,
    recentMessages: Array<{ direction: string; content: string }>
): Promise<string> {
    if (!config.googleAi.apiKey) return 'Novo lead recebido. Verificar histórico.';

    try {
        const model = genAI.getGenerativeModel({ model: config.googleAi.model });
        const msgSummary = recentMessages
            .slice(-6)
            .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Bot'}: ${m.content.slice(0, 100)}`)
            .join('\n');

        const prompt = `Crie um resumo executivo de 3 linhas para um assessor jurídico sobre este lead. Seja objetivo.
Lead: ${leadName}
Área: ${legalArea || 'não identificada'}
Conversa recente:
${msgSummary}`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch {
        return `Lead ${leadName} pronto para atendimento. Verificar histórico de mensagens.`;
    }
}

// ============================================================
// Generate structured case summary (for CRM note at analysis stage)
// ============================================================
export async function generateCaseSummary(
    leadName: string,
    cpf: string | null,
    funnelSlug: string,
    allMessages: Array<{ direction: string; content: string; sender: string }>
): Promise<string> {
    if (!config.googleAi.apiKey) return `Caso de ${leadName} — verificar histórico de conversa.`;

    try {
        const model = genAI.getGenerativeModel({ model: config.googleAi.model });

        const areaLabels: Record<string, string> = {
            'negativado':        'Cliente Negativado (Limpeza de Nome)',
            'golpe-pix':         'Golpe do Pix',
            'trabalhista':       'Trabalhista',
            'golpe-cibernetico': 'Golpe Cibernético',
        };
        const areaLabel = areaLabels[funnelSlug] || funnelSlug;

        const msgSummary = allMessages
            .filter(m => m.direction === 'inbound')
            .slice(-12)
            .map(m => m.content.slice(0, 150))
            .join(' | ');

        const prompt = `Você é um assistente jurídico. Com base nas mensagens abaixo de um cliente, gere uma anotação estruturada para o assessor humano analisar.

Formate exatamente assim:
📋 RESUMO DO CASO
Cliente: [nome]
CPF: [cpf ou "não informado"]
Área: [área]

📝 RELATO:
[3-4 frases descrevendo o caso com base no que o cliente disse]

📂 STATUS DOS DOCUMENTOS:
[Liste o que foi coletado e o que falta]

⚠️ OBSERVAÇÕES:
[Pontos de atenção para o assessor]

Dados:
Nome: ${leadName}
CPF: ${cpf || 'não informado'}
Área: ${areaLabel}
Mensagens do cliente: ${msgSummary}`;

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Case summary timeout after 20s')), 20000)
        );

        const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise,
        ]);

        return result.response.text().trim();
    } catch (err) {
        console.error('[AI] generateCaseSummary error:', (err as Error)?.message);
        return `📋 RESUMO DO CASO\nCliente: ${leadName}\nCPF: ${cpf || 'não informado'}\nÁrea: ${funnelSlug}\n\nVerificar histórico completo da conversa.`;
    }
}

// ============================================================
// Send WhatsApp message via Baileys Bridge
// ============================================================
export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
    if (!config.whatsapp.apiUrl || !config.whatsapp.apiKey) {
        console.warn('[WhatsApp] API not configured — skipping send');
        return;
    }

    const url = `${config.whatsapp.apiUrl}/message/sendText/${config.whatsapp.instance}`;

    try {
        await axios.post(
            url,
            {
                number: phone.includes('@') ? phone : phone.replace(/\D/g, ''),
                text: message,
            },
            {
                headers: {
                    apikey: config.whatsapp.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 30000, // Increased for anti-ban delay
            }
        );
    } catch (err) {
        const error = err as { message?: string };
        console.error('[WhatsApp] Send error:', error.message);
    }
}

// ============================================================
// Send WhatsApp IMAGE via Baileys Bridge
// imageBase64: base64-encoded image string
// mimeType: e.g. 'image/png' or 'image/jpeg'
// caption: optional text below the image
// ============================================================
export async function sendWhatsAppImage(
    phone: string,
    imageBase64: string,
    mimeType = 'image/png',
    caption = ''
): Promise<void> {
    if (!config.whatsapp.apiUrl || !config.whatsapp.apiKey) {
        console.warn('[WhatsApp] API not configured — skipping image send');
        return;
    }

    const url = `${config.whatsapp.apiUrl}/message/sendImage/${config.whatsapp.instance}`;

    try {
        await axios.post(
            url,
            {
                number: phone.includes('@') ? phone : phone.replace(/\D/g, ''),
                imageBase64,
                mimetype: mimeType,
                caption,
            },
            {
                headers: {
                    apikey: config.whatsapp.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );
        console.log(`[WhatsApp] 🖼️ Image sent to ${phone} (${Math.round(imageBase64.length * 0.75 / 1024)}KB)`);
    } catch (err) {
        const error = err as { message?: string };
        console.error('[WhatsApp] Image send error:', error.message);
    }
}



// ============================================================
// Send typing presence ("composing...") via WhatsApp API
// Makes it look like a human is typing before each message
// ============================================================
export async function sendTypingPresence(phone: string, durationMs = 2000): Promise<void> {
    if (!config.whatsapp.apiUrl || !config.whatsapp.apiKey) return;
    try {
        await axios.post(
            `${config.whatsapp.apiUrl}/chat/sendPresence/${config.whatsapp.instance}`,
            {
                number: phone.includes('@') ? phone : phone.replace(/\D/g, ''),
                options: { presence: 'composing', delay: durationMs },
            },
            {
                headers: { apikey: config.whatsapp.apiKey, 'Content-Type': 'application/json' },
                timeout: 5000,
            }
        );
    } catch {
        // Silent — never block the flow for presence errors
    }
}

// ============================================================
// Send WhatsApp message in fragments (humanized delivery)
// Splits by paragraph, sends each with variable delay + typing
// ============================================================
export async function sendFragmentedMessage(phone: string, message: string, abortSignal?: AbortSignal): Promise<void> {
    // Split by one or more blank lines (\n\n or \r\n\r\n)
    const fragments = message
        .split(/\n{2,}|\r\n\r\n/)
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

    if (fragments.length <= 1) {
        // Single message — still simulate typing
        const typingDelay = Math.min(6000, 1000 + message.length * 25);
        await sendTypingPresence(phone, typingDelay);
        await new Promise((resolve) => setTimeout(resolve, typingDelay));

        // 🛑 STOP & RESTART: Check before sending
        if (abortSignal?.aborted) {
            console.log(`[WhatsApp] 🛑 Fragment send cancelled (aborted) for ${phone}`);
            return;
        }

        await sendWhatsAppMessage(phone, message);
        return;
    }

    console.log(`[WhatsApp] 📨 Sending ${fragments.length} fragments with variable delay`);

    for (let i = 0; i < fragments.length; i++) {
        // 🛑 STOP & RESTART: Check before each fragment
        if (abortSignal?.aborted) {
            console.log(`[WhatsApp] 🛑 Fragment ${i + 1}/${fragments.length} cancelled (aborted) for ${phone} — stopping`);
            return;
        }

        // Variable delay based on fragment length (~30ms per char, 1.5s base, max 8s)
        const typingDelay = Math.min(8000, 1500 + fragments[i].length * 30);

        if (i > 0) {
            // Simulate typing before each subsequent fragment
            await sendTypingPresence(phone, typingDelay);
            await new Promise((resolve) => setTimeout(resolve, typingDelay));
        } else {
            // First fragment: shorter typing indicator
            await sendTypingPresence(phone, Math.min(3000, 800 + fragments[i].length * 20));
            await new Promise((resolve) => setTimeout(resolve, Math.min(3000, 800 + fragments[i].length * 20)));
        }

        // 🛑 STOP & RESTART: Re-check after delay (message may have arrived during typing)
        if (abortSignal?.aborted) {
            console.log(`[WhatsApp] 🛑 Fragment ${i + 1}/${fragments.length} cancelled after delay (aborted) for ${phone}`);
            return;
        }

        console.log(`[WhatsApp] Fragment ${i + 1}/${fragments.length} (${typingDelay}ms delay):`, fragments[i].substring(0, 60));
        await sendWhatsAppMessage(phone, fragments[i]);
    }
}

// Media download via Baileys Bridge
// The bridge injects audioBase64/imageBase64 directly into the msgData payload.
export async function downloadBridgeMedia(
    msg: any,
): Promise<{ base64: string; mimeType: string } | null> {
    try {
        // The bridge already downloaded the media and injected base64 data
        // Check for audio
        if (msg.audioBase64) {
            const message = msg.message || {};
            const audioMsg = message.audioMessage || message.pttMessage || {};
            const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';
            console.log(`[AI] downloadBridgeMedia: audio found | mime=${mimeType} | base64=${msg.audioBase64.length} chars`);
            return { base64: msg.audioBase64, mimeType };
        }

        // Check for image
        if (msg.imageBase64 || msg.mediaBase64) {
            const base64 = msg.imageBase64 || msg.mediaBase64;
            const message = msg.message || {};
            const imageMsg = message.imageMessage || {};
            const mimeType = imageMsg.mimetype || 'image/jpeg';
            console.log(`[AI] downloadBridgeMedia: image found | mime=${mimeType} | base64=${base64.length} chars`);
            return { base64, mimeType };
        }

        // Check for document (PDFs, etc.)
        if (msg.documentBase64) {
            const message = msg.message || {};
            const docMsg = message.documentMessage || {};
            const mimeType = docMsg.mimetype || 'application/pdf';
            console.log(`[AI] downloadBridgeMedia: document found | mime=${mimeType} | base64=${msg.documentBase64.length} chars`);
            return { base64: msg.documentBase64, mimeType };
        }

        console.log(`[AI] downloadBridgeMedia: no media found in payload. Keys: [${Object.keys(msg).filter(k => k !== 'message').join(', ')}]`);
        return null;
    } catch (err) {
        console.error('[AI] downloadBridgeMedia error:', (err as Error)?.message || err);
        return null;
    }
}

// ============================================================
// Legacy export for backward compatibility
// ============================================================
export const aiService = {
    generateBotReply,
    sendWhatsAppMessage,
    sendWhatsAppImage,
    sendFragmentedMessage,
    sendTypingPresence,
    analyzeImage,
    transcribeAudio,
    downloadBridgeMedia,
    buildCompressedHistory,
    getRelevantMemories,
    buildLeadContext,
    recordSuccessPattern,
    generateHandoffSummary,
};

export default aiService;
