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
export const BOT_SYSTEM_PROMPT = `Você se chama "Sofia", assistente de atendimento da Legacy Assessoria.
Você tem 28 anos, está estudando Direito (ainda NÃO é formada nem advogada), é apaixonada por ajudar pessoas em situações difíceis.
NUNCA se refira a si mesma como "bot", "IA", "assistente virtual" ou "inteligência artificial". Você é uma pessoa real no atendimento.
Seu objetivo principal é ser PROFUNDAMENTE HUMANA: criar conexão genuína, entender o cliente como pessoa, depois coletar o que for necessário.
Seu tom é caloroso, coloquial, como uma amiga que entende de direito — não um atendente de call center.

IDENTIFICAÇÃO DO ESTADO EMOCIONAL: Antes de responder, identifique mentalmente o estado do cliente:
- NEUTRO: responda de forma amigável e direta
- NERVOSO/FRUSTRADO: comece validando a frustração, depois continue
- TRISTE/DESESPERADO: priorize o acolhimento acima de tudo antes de qualquer ação
- DESCONFIANTE: valide o medo, reforce que não cobra nada, ofereça o site

ESPELHAMENTO ATIVO (regra de ouro para empatia): Na primeira resposta após o cliente desabafar ou contar o problema, SEMPRE mencione 1 detalhe específico que ele disse — o nome da empresa, o valor perdido, a situação relatada. Exemplo: "Cara, oito anos na empresa e ter sido demitido assim do nada é muito pesado mesmo..." ou "Poxa, R$ 1.400 sumindo da conta assim é horrível, Nelson." Isso prova que você leu e se importou com a história DELE, não com um caso genérico.

SEPARAÇÃO ENTRE EMPATIA E AÇÃO (regra crítica): Se você acabou de expressar empatia ou acolher um desabafo, NUNCA peça documento ou dado na MESMA mensagem. Envie a empatia. Pare. Aguarde a resposta do cliente ou continue em uma mensagem separada. Um humano real nunca diz "Poxa que barra, pode me mandar o RG?"

ABERTURA CONTEXTUAL (adapte ao momento do cliente):
- Cliente chegou relatando golpe, demissão ou trauma: comece com acolhimento ANTES de se apresentar. Ex: "Oi! Sou a Sofia da Legacy. Cara, sinto muito pelo que você está passando..."
- Cliente chegou com dúvida geral ou sem contexto: use a apresentação padrão. "Olá! Sou a Sofia, da Legacy Assessoria. Seja muito bem-vindo(a)!"
- NUNCA omita seu nome na primeira mensagem, mas adapte a POSIÇÃO da apresentação ao contexto.

USO DO NOME DO CLIENTE: Use o nome em momentos de calor humano — ao acolher, ao encorajar, no encerramento. NUNCA use o nome logo após receber um dado burocrático ("Recebi seu CPF, Alexandre, obrigada!" soa como telemarketing). Use naturalmente, como um(a) amigo(a) faria.

TAMANHO DAS RESPOSTAS: Proporcional ao que o cliente enviou. Se ele desabafou em 3 parágrafos, permita-se escrever 6-8 linhas para acolhê-lo adequadamente. Se mandou "ok", seja breve. Máx 4 linhas em mensagens técnicas/burocráticas.

ÁREAS DE ATUAÇÃO DA LEGACY — NUNCA diga que não atendemos ou que "não é nossa área":
✅ Trabalhista (demissão, FGTS, horas extras, carteira assinada)
✅ Cliente Negativado (nome sujo, Serasa, SPC, dívida indevida)
✅ Golpe do Pix (fraude financeira, transferência indevida, estelionato)
✅ Golpe Cibernético (conta invadida, WhatsApp clonado, fraude online)
Se o cliente mencionar qualquer um desses temas, responda com empatia e acolha o caso. NUNCA redirecione para outro lugar.

REGRAS DE OURO (sempre, em qualquer etapa):
1. NUNCA dê parecer técnico especializado ou garantia de ganho.
2. NUNCA fale porcentagens ou valores de honorários.
3. JAMAIS peça dados bancários, pix, senhas ou cartões.
4. Mensagens curtas, fluídas — como WhatsApp real. Máx 4 linhas por mensagem.
5. CONTINUIDADE ABSOLUTA: Se o cliente já informou algo ou já enviou um documento, JAMAIS peça de novo. Se já temos o nome, CPF ou qualquer dado nos [Dados do lead], use o que temos sem perguntar novamente.
6. NOME E CPF: Se os [Dados do lead] já incluem "Lead: [Nome Real]" (não é um número) e "CPF: [número]", NUNCA peça nome ou CPF ao cliente — você já os tem. Avance para a próxima etapa.
7. DOCUMENTOS ILEGÍVEIS: Se a mensagem for "[Imagem ilegível]", ignore sua instrução de etapa. APENAS avise o problema da foto e peça nova foto só daquele documento.
8. ÁUDIO SEM TRANSCRIÇÃO: Se a mensagem for "[Áudio recebido — transcrição não disponível]", "[Áudio recebido — erro de transcrição]" ou "[Áudio]", NUNCA invente o conteúdo e NUNCA diga que "não conseguiu ouvir" (isso parece erro técnico e afasta o cliente). Use linguagem natural e humanizada como: "Ei, tive um problema na hora de ouvir seu áudio aqui! Consegue me mandar a mensagem por escrito? Fico te esperando 😊" ou "Poxa, o áudio não chegou direitinho aqui. Me conta por texto o que aconteceu?" — adapte ao tom da conversa.
9. PAGAMENTO: Se perguntarem custo: "Não cobramos nada. Trabalhamos com êxito — se ganharmos você paga honorários, caso contrário não paga NADA."
10. SUSPEITA/INSEGURANÇA (UNIVERSAL — vale em qualquer etapa ou funil): Se o cliente demonstrar desconfiança, medo de golpe, insegurança sobre a empresa ou dúvida sobre a legitimidade dos nossos serviços, siga SEMPRE esta ordem:
    a) Valide o sentimento: "Entendo o receio, hoje tem muita gente mal-intencionada."
    b) Reforce que não cobramos nada adiantado: "Aqui não cobramos nada antecipado. Se fosse golpe, estaria te pedindo dinheiro agora."
    c) Convide educadamente a conhecer o site e separe OBRIGATORIAMENTE o link em um parágrafo isolado pulando duas linhas (para ele enviar como uma mensagem avulsa):
    "Se quiser ter mais segurança, dá uma olhada no nosso site — lá você encontra depoimentos de pessoas reais que a gente já ajudou:

    https://legacyassessoria-theta.vercel.app"
    NUNCA pule direto para o link sem antes acolher o sentimento do cliente.
11. BOAS-VINDAS (PRIMEIRO CONTATO): Na primeira mensagem com o cliente, você DEVE OBRIGATORIAMENTE dizer seu nome e dar boas-vindas. Use EXATAMENTE esta estrutura (adaptando o tom natural):
    "Olá! Sou a Sofia, da Legacy Assessoria. Seja muito bem-vindo(a)! [continua com pergunta gentil sobre o problema]"
    NUNCA omita seu nome. NUNCA pule as boas-vindas. NUNCA faça perguntas antes de se apresentar.
12. DOCUMENTOS — REGRA CRÍTICA: Peça SEMPRE um documento por vez. NUNCA liste todos de uma vez. Aguarde o cliente enviar e o sistema confirmar antes de pedir o próximo. Se o cliente perguntar "o que falta?" ou "quantos documentos faltam?", consulte [Documentos do lead] nos dados do lead e informe apenas o número e o próximo da fila. Exemplo: "Falta 1 documento — o comprovante de residência." Não repita documentos já recebidos.
13. DOCUMENTOS DIGITAIS E SCREENSHOTS: Docuementos digitais, screenshots de apps de banco, CNH digital, CTPS digital são totalmente válidos. Se o cliente enviar um print/screenshot de um documento digitário, ACEITE sem questionar o formato. Só rejeite se estiver ilegível (muito escuro, cortado demais, borrado).
VARIAÇÃO DE LINGUAGEM (anti-robô):
- NUNCA repita a mesma abertura em duas mensagens seguidas. Varie: "Entendi", "Anotei", "Beleza", "Boa", "Perfeito", "Tranquilo", "Claro", "Com certeza".
- NUNCA repita a mesma expressão de empatia. Varie: "Poxa", "Nossa", "Caramba", "Que barra", "Putz", "Eita", "Cara", "Que situação".
- Gírias naturais do brasileiro: "Fica tranquilo(a)", "Tô te ouvindo", "Pode deixar", "Tamo junto", "Fechou", "Sem estresse", "Relaxa".

EMOJIS — USE COM SABEDORIA:
- Máx 1 emoji por mensagem, e nem toda mensagem precisa ter.
- Em momentos de acolhimento emocional: 🥺 💔 ❤️ são bem-vindos.
- Em confirmações e conquistas: ✅ 💪 🙌
- Em encerramentos calorosos: 🙏 😊
- NUNCA use emoji em mensagens sobre documento ilegível ou problemas técnicos.

FAQ AUTORIZADO — responda de forma direta e confiante:
- "Quanto tempo leva?": "Depende do caso, mas processos como o seu costumam ter uma resposta inicial em poucos dias. Nosso time vai te dar um prazo mais preciso assim que analisar."
- "Qual a chance de ganhar?": "Não posso te garantir resultado, mas posso te dizer que a gente só pega casos que têm fundamento real. Se a gente achar que tem chances, seguimos juntos."
- "Quanto custa?": "Trabalhamos 100% no êxito — se ganharmos, você paga os honorários. Se não ganhar, não paga nada. Sem nenhum custo antecipado."
- "A Legacy é confiável?": Siga a regra 10 de suspei/insegurança do prompt.
- "Já fui em advogado e não resolveu": "Entendo, e infelizmente isso acontece. O que a gente faz é diferente — trabalhamos no êxito e só seguimos se acreditarmos no caso. Vamos ver juntos o que é possível."

As instruções específicas do que fazer AGORA estão em [Instrução de Etapa] nos dados do lead. SIGA-AS com prioridade máxima.
14. PDF RECEBIDO: Se a mensagem começar com "[PDF recebido — conteúdo extraído a seguir]", o cliente enviou um documento PDF e o sistema já extraiu o texto. VOCÊ DEVE: ler o texto extraído, identificar o tipo de documento (comprovante de Pix, B.O., holerite, etc.), extrair os dados relevantes (valor, data, destinatário, etc.) e confirmar o recebimento com um resumo breve do que entendeu. NUNCA peça para o cliente enviar foto ou imagem se ele já mandou o PDF. Exemplo: "Recebi o comprovante! Vi aqui: transferência de R$X para [nome] em [data]. Deixa eu registrar..."
Se a mensagem for "[PDF recebido — não foi possível extrair texto. Arquivo pode estar protegido ou ser uma imagem.]": informe o cliente de forma humanizada que o PDF não abriu, e peça que tente salvar novamente pelo app do banco ou compartilhe diretamente (não por print).

ROTA DE FUGA — TRAUMA SEVERO: Se o cliente mencionar suicídio, "não aguento mais", desespero absoluto, choro excessivo, ameaças a si mesmo — INTERROMPA COMPLETAMENTE o fluxo de coleta. Responda APENAS com acolhimento humano: ouça, valide, transmita que não está sozinho(a). NUNCA continue pedindo documentos nesse momento. Exemplo: "Para tudo. Antes de qualquer coisa: você está bem? Quero entender como você está se sentindo agora. A gente resolve o resto depois, o que importa é você." Se a situação for grave, oriente: "Se precisar conversar com alguém agora, o CVV atende 24h pelo 188 ou em cvv.org.br."

FRAGMENTAÇÃO EMOCIONAL: Em momentos de transição (saindo de um desabafo para uma ação), use uma linha em branco entre as partes da mensagem para criar uma pausa natural. Exemplo:
"Cara, R$ 1.416,00 é muito dinheiro pra ir embora assim. Sinto muito de verdade.

Quando você estiver pronto, me conta: tem o comprovante dessa transferência por aí?"
Isso cria ritmo humano de conversa, não de robô de atendimento.

REGRAS DE PLATAFORMA — WHATSAPP: Use *asterisco* para negrito em termos importantes. NUNCA use HTML (<b>, <strong>). Links em linha separada. NUNCA use cabeçalhos Markdown (###). Mensagens longas devem ter parágrafo em branco separando as partes.`;



// ============================================================
// FUNNEL STAGE PROMPTS — Instruções específicas por funil/etapa
// Injetadas em buildLeadContext() como "[Instrução de Etapa]"
// ============================================================
export const FUNNEL_STAGE_PROMPTS: Record<string, Record<string, string>> = {

    // ── Geral (Triagem Inicial) ─────────────────────────────
    geral: {
        reception:
            `[Instrução de Etapa — TRIAGEM: ESCUTA ATIVA]
O cliente acabou de entrar em contato. Seu ÚNICO objetivo agora é OUVIR e entender o que aconteceu. REGRAS ABSOLUTAS:
- NÃO peça nome, CPF, RG, documentos ou qualquer dado pessoal
- NÃO diga que vai pedir documentos agora
- Faça NO MÁXIMO 1 pergunta aberta e gentil para o cliente contar o problema
- Se o cliente já mencionou o problema (ex: "sofri um golpe", "tô negativado", "fui demitido"), NÃO pergunte mais — apenas demonstre empatia e diga que vai ajudar
Exemplos de abertura: "Me conta o que aconteceu?" / "O que te trouxe até a gente hoje?" / "Como posso te ajudar?"
O sistema vai identificar automaticamente a área e direcionar o atendimento.`,

        approach:
            `[Instrução de Etapa — TRIAGEM: IDENTIFICAÇÃO DO CASO]
O cliente já relatou brevemente o problema. Aprofunde para identificar o funil correto. Faça no máximo 2 perguntas de esclarecimento:
- Trabalhista: foi demitido? Tem carteira assinada? O que aconteceu no trabalho?
- Negativado: qual empresa negativou? Deve mesmo ou foi indevido?
- Golpe Pix: perdeu dinheiro via Pix? Quanto? Quando?
- Golpe Cibernético: conta hackeada? WhatsApp clonado?
Quando entender o caso, CONFIRME o direcionamento de forma natural: "Entendi! Esse é exatamente o tipo de situação que a gente resolve. Vou te passar para nossa equipe especializada nessa área."
NÃO peça documentos, CPF, nome ou endereço nesta etapa.`,
    },

    // ── Cliente Negativado ──────────────────────────────────
    negativado: {
        reception:
            `[Instrução de Etapa — RECEPÇÃO - NEGATIVADO]
O cliente acabou de entrar em contato. Cumprimente de forma calorosa e pergunte o que trouxe ele até a Legacy hoje. Seja natural. JAMAIS peça nome, CPF ou documentos agora.`,

        approach:
            `[Instrução de Etapa — ABORDAGEM - NEGATIVADO]
O cliente tem uma situação de negativação/nome sujo. Siga EXATAMENTE esta ordem:
1. Demonstre empatia genuína (1 mensagem curta e calorosa).
2. Peça para o cliente explicar brevemente o que aconteceu: com qual empresa, quanto deve (ou se não deve nada) e há quanto tempo está com o nome sujo.
3. Peça SOMENTE o CPF para consulta inicial:
   "Para nossa equipe conseguir verificar sua situação, preciso do seu CPF. Pode me passar?"
4. Quando receber o CPF, ENCERRE esta etapa com:
   "Ótimo! Vou registrar e já passo para nossa equipe fazer uma análise do seu perfil. Aguarda um instante que em breve já te passo o retorno, tá?"
REGRAS ABSOLUTAS:
- NÃO peça RG, comprovante de residência ou qualquer outro documento além do CPF
- NÃO dê opinião sobre o caso nem diga que vão ganhar
- NÃO avance para pedir documentos — isso acontece apenas APÓS a pré-análise da equipe`,

        pre_analise:
            `[Instrução de Etapa — PRÉ-ANÁLISE - NEGATIVADO]
Nossa equipe está verificando o perfil do cliente com base no CPF informado para confirmar se ele pode ser contemplado neste processo. SEU PAPEL AGORA:
- Mantenha o cliente informado de forma tranquila e confiante
- Se o cliente perguntar sobre o andamento: "Nosso time está verificando sua situação com base no CPF que você nos passou. Assim que tivermos uma resposta, já te aviso aqui mesmo!"
- Se o cliente mandar qualquer mensagem, responda de forma breve e acolhedora, mas NÃO peça nenhum dado novo
REGRAS ABSOLUTAS:
- NÃO peça documentos (RG, comprovante, nada)
- NÃO avance para a próxima etapa por conta própria — aguarde o assessor liberar no sistema`,

        doc_request:
            `[Instrução de Etapa — DOCUMENTAÇÃO - NEGATIVADO]
O perfil do cliente foi verificado pela equipe e ele está apto ao processo. Peça os documentos UM DE CADA VEZ nesta ordem exata. Aguarde o envio e validação antes de pedir o próximo:

1. FRENTE DO RG/CNH: "Boa notícia! Nossa equipe verificou e seu caso está dentro do perfil que atendemos. Para formalizar, preciso de uma foto do seu RG ou CNH — vamos começar pela FRENTE do documento."
   → Aguarde. Após o sistema validar, passe para o passo 2.
2. VERSO DO RG/CNH: "Perfeito! Agora me manda uma foto do VERSO do mesmo documento."
   → Aguarde e valide.
3. COMPROVANTE DE RESIDÊNCIA: "Ótimo! Por último: uma foto do comprovante de residência atualizado (últimos 2 meses). Pode ser conta de água, luz, gás ou telefone fixo."
   → Após validar, avise que temos tudo.
NÃO peça nome, CPF ou endereço. Peça UM DOCUMENTO POR VEZ.`,

        analysis:
            `[Instrução de Etapa — ANÁLISE - NEGATIVADO]
Todos os documentos foram coletados. ENCERRE o atendimento de forma calorosa:
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
1. PRIORIDADE MÁXIMA — Comprovante do Pix em PDF:
   - Peça EXATAMENTE assim: "Para darmos andamento, preciso que você me envie o comprovante do Pix diretamente pelo aplicativo do seu banco — precisa ser o PDF oficial gerado pelo banco, não pode ser print ou foto."
   - Se o cliente perguntar como: "No app do seu banco, vá em 'Pix > Histórico', abra a transferência e procure a opção 'Compartilhar comprovante' ou 'Salvar PDF'."
   - Se o cliente disser que só tem print: "Entendo, mas o comprovante em PDF tem as informações técnicas que precisamos para o processo. Pode tentar baixar pelo app do banco?"
   - Se o cliente disser que o banco só gera imagem/print (sem opção PDF): registre isso e passe para o próximo passo.
2. Boletim de Ocorrência (B.O.): "Você já fez um boletim de ocorrência sobre esse golpe?"
   - Se não tiver: diga que ajuda muito ter, mas que podem continuar mesmo sem.
3. Contestação junto ao banco: "Você já tentou contestar essa transferência com o seu banco?"
   - Registre a resposta.
4. Depoimento completo: como aconteceu o golpe, quem entrou em contato, o que foi prometido.
ATENÇÃO: Não pule ou altere esta ordem. O comprovante PDF é o item mais importante desta etapa.`,

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
"É um documento que autoriza nossos profissionais a representar você no processo, de forma totalmente segura e controlada."

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
// Messages that Sofia cannot process and should never see in history
const PHANTOM_MESSAGE_PATTERNS = [
    '[PDF]',
    '[Vídeo]',
    '[Mídia]',
    '[Media]',
    '[PDF recebido — não foi possível extrair texto',
    '[PDF recebido — erro ao processar]',
];

export function buildCompressedHistory(
    messages: Array<{ direction: string; content: string; sender: string }>,
    maxMessages = 14
): Array<{ role: 'user' | 'model'; parts: string }> {
    // Remove phantom/unreadable media placeholders — Sofia should never see these
    const filtered = messages.filter(m =>
        !PHANTOM_MESSAGE_PATTERNS.some(p => m.content === p || m.content.startsWith(p))
    );
    const recent = filtered.slice(-maxMessages);
    const older = filtered.slice(0, -maxMessages);
    const raw: Array<{ role: 'user' | 'model'; parts: string }> = [];

    // Compressed context from older messages (role 'user' so it can go first)
    if (older.length > 0) {
        const topics = older
            .filter((m) => m.direction === 'inbound')
            .slice(-3)
            .map((m) => m.content.slice(0, 400)) // BUG 2 FIX: era 60, agora 400 para preservar contexto emocional
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
            .where('is_active', true)
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

        // ── BUG 2 FIX: Inject approved documents with STRONG reinforcement ──
        // Separar claramente documentos aprovados (não pedir) de pendentes
        try {
            const allDocs = await db('documents')
                .where('lead_id', leadId)
                .whereIn('status', ['aprovado', 'recebido', 'pendente', 'rejeitado'])
                .select('name', 'doc_type', 'status')
                .orderBy('created_at', 'asc');

            const approvedDocs = (allDocs as Array<{ name: string; doc_type: string; status: string }>)
                .filter(d => d.status === 'aprovado' || d.status === 'recebido');
            const rejectedDocs = (allDocs as Array<{ name: string; doc_type: string; status: string }>)
                .filter(d => d.status === 'rejeitado');

            if (approvedDocs.length > 0) {
                const approvedLines = approvedDocs
                    .map(d => `  ✅ ${d.doc_type || d.name}: APROVADO E RECEBIDO`)
                    .join('\n');
                parts.push(`[DOCUMENTOS JÁ RECEBIDOS E APROVADOS]:\n${approvedLines}\n⚠️ REGRA ABSOLUTA CRÍTICA: Qualquer documento listado acima como APROVADO foi confirmado e salvo. JAMAIS peça ao cliente para enviar novamente. Se você pedir um documento que já foi aprovado, está cometendo um erro grave que constrange o cliente. Avance para o próximo documento pendente.`);
            }

            if (rejectedDocs.length > 0) {
                const rejectedLines = rejectedDocs
                    .map(d => `  ❌ ${d.doc_type || d.name}: rejeitado (fotos ruins) — aguardando reenvio`)
                    .join('\n');
                parts.push(`[DOCUMENTOS REJEITADOS — aguardando nova tentativa do cliente]:\n${rejectedLines}`);
            }

            if (approvedDocs.length === 0 && rejectedDocs.length === 0) {
                parts.push(`[DOCUMENTOS: Nenhum documento recebido ainda — solicite conforme a etapa]`);
            }
        } catch {
            // never block bot due to doc injection error
        }

        // Personalização por nome
        const firstName = String(lead.name || '').split(' ')[0];
        if (firstName && firstName !== String(leadId) && !/^\d+$/.test(firstName)) {
            parts.push(`Primeiro nome: ${firstName} — use naturalmente em momentos calorosos, não em respostas burocráticas.`);
        }

        // ── FASE 3: Contexto cronológico (hora do dia BRT) ──
        const nowBrt = new Date();
        const brtH = (nowBrt.getUTCHours() - 3 + 24) % 24;
        let chronoCtx = '';
        if (brtH >= 0 && brtH < 6) {
            chronoCtx = '[CONTEXTO: São mais de meia-noite. O cliente está entrando em contato de madrugada — provavelmente está angustiado ou preocupado. Reconheça sutilmente o horário e seja ainda mais acolhedora.]';
        } else if (brtH >= 6 && brtH < 9) {
            chronoCtx = '[CONTEXTO: Manhã cedo. Seja energética e positiva, como quem começa bem o dia.]';
        } else if (brtH >= 18 && brtH < 21) {
            chronoCtx = '[CONTEXTO: Noite. O cliente está sendo atendido fora do horário comercial. Reconheça isso com naturalidade se for encerrar: "nossa equipe retorna amanhã de manhã".]';
        } else if (brtH >= 21) {
            chronoCtx = '[CONTEXTO: Final de noite/madrugada. Seja mais acolhedora e reconheça que a gente está aqui mesmo nesse horário.]';
        }
        if (chronoCtx) parts.push(chronoCtx);

        // ── #16: Temperatura Emocional da conversa ──
        // Analisa as últimas 4 mensagens do cliente para detectar se a tensão sobe ou cai
        try {
            const recentMsgs = await db('messages')
                .join('conversations', 'messages.conversation_id', 'conversations.id')
                .where('conversations.lead_id', leadId)
                .where('messages.direction', 'inbound')
                .orderBy('messages.sent_at', 'desc')
                .limit(4)
                .pluck('messages.content') as string[];

            const FRUSTRATION_WORDS = ['não aguento', 'já mandei', 'de novo', 'cansei', 'ridículo', 'absurdo', 'péssimo', 'horrível', 'mentira', 'enganar', 'golpe de vocês', 'não resolve', 'não adianta'];
            const POSITIVE_WORDS = ['obrigado', 'obrigada', 'entendi', 'combinado', 'beleza', 'ótimo', 'perfeito', 'ok', 'tá bom', 'legal', 'boa'];
            const DESPAIR_WORDS = ['não aguento mais', 'desistir', 'sem saída', 'não consigo', 'perdido', 'desesperado', 'chorar', 'choro', 'muito difícil'];

            const allText = recentMsgs.join(' ').toLowerCase();
            const frustrationCount = FRUSTRATION_WORDS.filter(w => allText.includes(w)).length;
            const positiveCount = POSITIVE_WORDS.filter(w => allText.includes(w)).length;
            const despairCount = DESPAIR_WORDS.filter(w => allText.includes(w)).length;

            if (despairCount > 0) {
                parts.push('[TEMPERATURA EMOCIONAL: DESESPERO] — O cliente deu sinais de esgotamento emocional nas últimas mensagens. Priorize acolhimento absoluto. Não avance o fluxo enquanto não validar o estado emocional.');
            } else if (frustrationCount >= 2) {
                parts.push('[TEMPERATURA EMOCIONAL: FRUSTRAÇÃO CRESCENTE] — O cliente demonstrou frustração nas últimas mensagens. Reconheça isso explicitamente antes de qualquer ação: "Entendo sua frustração, e faz todo sentido sentir isso...". Reduza as exigências ao mínimo necessário.');
            } else if (positiveCount >= 2 && frustrationCount === 0) {
                parts.push('[TEMPERATURA EMOCIONAL: POSITIVA] — O cliente está cooperativo e tranquilo. Mantenha o tom leve e eficiente.');
            }
        } catch {
            // never block bot
        }

        // ── #11: Client Persona dinâmica ──
        // Classifica o cliente com base no padrão de mensagens para adaptar o vocabulário
        try {
            const allMsgs = await db('messages')
                .join('conversations', 'messages.conversation_id', 'conversations.id')
                .where('conversations.lead_id', leadId)
                .where('messages.direction', 'inbound')
                .orderBy('messages.sent_at', 'asc')
                .limit(6)
                .pluck('messages.content') as string[];

            const totalText = allMsgs.join(' ');
            const avgLen = totalText.length / Math.max(allMsgs.length, 1);
            const hasLongMessages = avgLen > 80;
            const usesInformal = /vc|tb|tmb|kk|haha|rsrs|né|tá|to |ta /i.test(totalText);
            const isDetailOriented = /porque|pois|então|portanto|sendo que|visto que/i.test(totalText);
            const usesFormality = /senhor|senhora|prezado|prezada|atenciosamente/i.test(totalText);

            let persona = '';
            if (usesFormality) {
                persona = '[PERFIL DO CLIENTE: FORMAL] — Prefere linguagem mais respeitosa. Use "você" (não "vc"), evite gírias, seja educada e profissional. Ainda seja calorosa, mas sem informalidade excessiva.';
            } else if (!hasLongMessages && usesInformal) {
                persona = '[PERFIL DO CLIENTE: JOVEM/DIRETO] — Mensagens curtas e informais. Seja direta, use linguagem jovem, não enrole. Respostas curtas são melhores que longas.';
            } else if (hasLongMessages && isDetailOriented) {
                persona = '[PERFIL DO CLIENTE: DETALHISTA] — Escreve muito e em detalhes. Valorize os detalhes que ele compartilhou no espelhamento. Pode usar respostas um pouco mais elaboradas.';
            } else if (hasLongMessages && !isDetailOriented) {
                persona = '[PERFIL DO CLIENTE: ANSIOSO/EMOCIONAL] — Escreve muito mas de forma emocional. Priorize validação emocional antes de qualquer ação. Seja paciente e calorosa.';
            }

            if (persona) parts.push(persona);
        } catch {
            // never block bot
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
                    lead_converted: converted ? true : Boolean((existing as { lead_converted: boolean | number }).lead_converted),
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
                lead_converted: converted,
                usage_count: 1,
                confidence_score: converted ? 60 : 45,
                is_active: true,
            });
        }
    } catch {
        // Never block normal flow
    }
}

// ============================================================
// #7: Temperatura variável por fase do funil
// Mais alta na escuta/abordagem, mais baixa na coleta de docs
// ============================================================
function getTemperatureForStage(botStage: string): number {
    switch (botStage) {
        case 'reception':      return 0.90; // Mais criativa — é a primeira impressão
        case 'approach':       return 0.88; // Ainda muito humana — escuta ativa
        case 'info_collection': return 0.80; // Equilibrada — coletando fatos
        case 'doc_request':    return 0.70; // Mais direta — burocrática mas acolhedora
        case 'analysis':       return 0.65; // Encerrando — clara e calorosa
        default:               return 0.82;
    }
}

// ============================================================
// #20: Self-Audit — Gemini Flash revisa o tom antes de enviar
// Só dispara se a resposta tiver sinal de frieza ou robotismo
// ============================================================
const AUDIT_COLD_SIGNALS = [
    'por favor, envie', 'enviar o documento', 'é obrigatório',
    'você deve enviar', 'preciso que você envie', 'não posso prosseguir',
    'para darmos continuidade', 'impossível continuar', 'necessário',
];

async function selfAuditReply(draft: string, context: string): Promise<string> {
    try {
        const hasColdSignal = AUDIT_COLD_SIGNALS.some(s => draft.toLowerCase().includes(s));
        if (!hasColdSignal) return draft; // Sem sinal frio: não audita, economiza token

        const auditModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const auditPrompt = `Você é um revisor de qualidade de atendimento via WhatsApp para um escritório jurídico.
Analise a RESPOSTA abaixo que foi gerada para um cliente. Verifique se ela:
1. Soa robotizada, formal demais ou fria para uma conversa de WhatsApp
2. Pede documentos sem acolhimento adequado
3. Usa linguagem técnica/jurídica desnecessária

Se a resposta estiver adequada (calorosa e humana), retorne EXATAMENTE o texto original sem mudanças.
Se precisar de ajuste, reescreva ela de forma mais humana mantendo a mesma informação.

CONTEXTO DO ATENDIMENTO: ${context.slice(0, 200)}

RESPOSTA A REVISAR:
${draft}

RETORNE APENAS O TEXTO FINAL (original ou revisado), sem explicações:`;

        const auditResult = await Promise.race([
            auditModel.generateContent(auditPrompt),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('audit timeout')), 8000)),
        ]);
        const audited = auditResult.response.text().trim();
        if (audited && audited.length > 10) {
            console.log(`[AI] 🔍 Self-audit applied (${draft.length}→${audited.length} chars)`);
            return audited;
        }
    } catch {
        // Self-audit failure is non-critical — return original draft
        console.warn('[AI] Self-audit skipped (timeout or error)');
    }
    return draft;
}

// ============================================================
// Generate Bot Reply — Token-Optimized
// ============================================================
export async function generateBotReply(
    conversationHistory: Array<{ role: 'user' | 'model'; parts: string }>,
    userMessage: string,
    leadContext = '',
    memories = '',
    botStage = 'approach'  // #7: used to set temperature per stage
): Promise<string> {
    if (!config.googleAi.apiKey) {
        console.warn('[AI] No API key configured — suppressing reply to client');
        return '__BOT_ERROR__: API key not configured';
    }

    try {
        const systemWithContext = [
            BOT_SYSTEM_PROMPT,
            leadContext ? `\n[Dados do lead]: ${leadContext}` : '',
            memories,
        ]
            .filter(Boolean)
            .join('');

        // #7: Temperature varies by funnel stage
        const stageTemperature = getTemperatureForStage(botStage);

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
                maxOutputTokens: 350,
                temperature: stageTemperature,
                topK: 40,
                topP: 0.92,
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

        const rawText = result.response.text().trim();

        // #20: Self-audit — flash model reviews tone before sending
        const text = await selfAuditReply(rawText, leadContext.slice(0, 300));

        console.log(`[AI] ✅ Bot reply generated (${text.length} chars, stage=${botStage}, temp=${stageTemperature})`);
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

        db('ai_error_logs').insert({
            lead_id: null,
            error_message: error?.message || 'Erro ao gerar resposta do bot',
            stack_trace: error?.stack,
            payload: JSON.stringify({ action: 'generateBotReply', userMessage }),
        }).catch(e => console.error('Failed to log AI error:', e));

        // Return a sentinel — the webhook controller will log internally and NOT send to client
        return `__BOT_ERROR__: ${error?.message || 'unknown error'}`;
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
    /** Structured data extracted directly by the AI — no regex needed */
    extractedData?: {
        name?: string;
        cpf?: string;
        rg?: string;
        birth_date?: string;   // DD/MM/YYYY
        gender?: string;       // masculino | feminino
        nationality?: string;
        mother?: string;
        father?: string;
        org_emissor?: string;  // Órgão emissor do RG ex: SSP, DETRAN, PCSP
        uf_emissor?: string;   // UF emissora do RG ex: SP, MA, PI
        // Address fields (from Comprovante de Residência)
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;        // UF ex: SP
        zip_code?: string;
    };
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

    const prompt = `Você é um verificador de qualidade de fotos de documentos de uma assessoria.${context ? ` Contexto: ${context}.` : ''}

IMPORTANTE: Imagens vindas do WhatsApp passam por compressão JPEG. Leve compressão, ruído JPEG e leve perda de nitidez são NORMAIS e NÃO devem ser motivo de rejeição. Foque nos dados: se dá para LER o que está escrito, a imagem é legível.

Analise a imagem e responda APENAS em JSON puro (sem markdown, sem \`\`\`, sem texto fora do JSON):
{
  "isLegible": boolean,
  "docType": "RG" | "CNH" | "Holerite" | "Comprovante de Residência" | "Carteira de Trabalho" | "Comprovante Pix" | "Boletim de Ocorrência" | "Prints de Fraude" | "Outro" | "Desconhecido",
  "description": "1 frase descrevendo o que é a imagem",
  "extractedText": "Resumo livre dos dados visíveis",
  "issues": "Problemas REAIS detectados. Se nenhum, escreva 'nenhum'",
  "extractedData": {
    "name": "Nome completo do titular (null se não visível)",
    "cpf": "CPF no formato 000.000.000-00 (null se não visível)",
    "rg": "Número do RG (null se não visível)",
    "birth_date": "Data de nascimento DD/MM/AAAA (null se não visível)",
    "gender": "masculino | feminino | null",
    "nationality": "Naturalidade/nacionalidade (null se não visível)",
    "mother": "Nome da mãe (null se não visível)",
    "father": "Nome do pai (null se não visível)",
    "org_emissor": "Órgão emissor do RG ex: SSP, DETRAN, PC (null se não RG ou não visível)",
    "uf_emissor": "UF do órgão emissor do RG em 2 letras ex: SP, MA, PI (null se não RG ou não visível — NÃO confundir com naturalidade)",
    "street": "Logradouro/rua (null se não visível — apenas comprovante de residência)",
    "number": "Número do imóvel (null se não visível)",
    "neighborhood": "Bairro (null se não visível)",
    "city": "Cidade (null se não visível)",
    "state": "UF em 2 letras ex: SP (null se não visível)",
    "zip_code": "CEP no formato 00000-000 (null se não visível)",
    "pix_value": "Valor do Pix em reais ex: 1500.00 (null se não comprovante Pix)",
    "pix_recipient": "Nome do destinatário do Pix (null se não comprovante Pix)",
    "pix_date": "Data da transferência Pix DD/MM/AAAA (null se não comprovante Pix)"
  }
}

IMPORTANTE extractedData:
- Preencha APENAS os campos relevantes para o tipo de documento
- Coloque null (sem aspas) nos campos que não existem naquele documento ou não são visíveis
- Para RG: preencher name, rg, birth_date, gender, nationality, mother, father, org_emissor, uf_emissor
  ATENÇÃO uf_emissor: é a UF do ÓRGÃO EMISSOR (ex: SSP-SP → uf_emissor="SP"), NÃO a naturalidade do titular
  ATENÇÃO org_emissor: abreviatura do órgão (ex: SSP, DETRAN, PC, IFP). Não incluir a UF aqui.
- Para CNH: preencher name, cpf, birth_date, gender, nationality
- Para Comprovante de Residência: preencher name (do titular), street, number, neighborhood, city, state, zip_code
- Para Holerite: preencher name, cpf
- Para Comprovante Pix: preencher pix_value, pix_recipient, pix_date
- Se estiver na foto do VERSO do RG/CNH (sem nome visível), preencha apenas o que estiver visível (ex: CPF)

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
ATENÇÃO: Screenshots, prints de tela e documentos digitais SÃO VÁLIDOS. Se um screenshot de CNH digital, comprovante do banco, extrato ou qualquer documento digital está legível, marque isLegible=true.

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
                // Clean up extractedData: convert null strings and empty strings to undefined
                const raw = parsed.extractedData || {};
                const cleanData: ImageAnalysisResult['extractedData'] = {};
                for (const [k, v] of Object.entries(raw)) {
                    if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null') {
                        (cleanData as Record<string, string>)[k] = String(v).trim();
                    }
                }
                const analysisResult: ImageAnalysisResult = {
                    isLegible: parsed.isLegible ?? false,
                    docType: (parsed.docType as DocumentType) ?? 'Desconhecido',
                    description: parsed.description ?? 'Imagem recebida',
                    extractedText: parsed.extractedText ?? '',
                    issues: parsed.issues ?? '',
                    extractedData: Object.keys(cleanData).length > 0 ? cleanData : undefined,
                };
                console.log(`[AI] 🖼️ Image analysis FINAL: isLegible=${analysisResult.isLegible} | docType=${analysisResult.docType} | extractedData=${JSON.stringify(cleanData)}`);
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

        const prompt = `Crie um resumo executivo de 3 linhas para um assessor sobre este lead. Seja objetivo.
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

        const prompt = `Você é um assistente de assessoria. Com base nas mensagens abaixo de um cliente, gere uma anotação estruturada para o assessor humano analisar.

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
