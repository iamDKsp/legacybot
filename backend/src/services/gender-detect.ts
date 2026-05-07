const FEMALE = new Set(['ANA','MARIA','JOANA','JULIA','JULIANA','JESSICA','JANAINA','JUSSARA','LAYSE','LAYLA','LAURA','LETICIA','LUCIA','LUCIANA','LUIZA','LUANA','PATRICIA','PAULA','PRISCILA','PAMELA','CARLA','CAROLINA','CAMILA','CLAUDIA','CRISTINA','CRISTIANE','SANDRA','SARAH','SABRINA','SIMONE','SILVANA','RENATA','ROBERTA','RAFAELA','ROSANA','ROSA','TATIANA','TAMARA','TANIA','THAIS','BEATRIZ','BRENDA','BRUNA','DANIELA','DEBORA','DIANA','ELISABETE','ELAINE','ELISA','ELZA','GABRIELA','GISELE','GIOVANA','HELENA','HELOISA','INGRID','ISABELA','ISABELLE','ISADORA','KATIA','KARINE','KELLY','MARCIA','MARIANA','MARINA','MARTA','MIRIAM','MICHELLE','NATHALIA','NATALIA','NADIA','VIVIANE','VIVIAN','VANESSA','VERONICA','VALERIA','VIRGINIA','YASMIN','YARA','ALINE','ALICE','AMANDA','ANDREIA','ANGELA','APARECIDA','EDNA','SOLANGE','SONIA','IVONE','IVANA','IRENE','REGIANE','REJANE','NILZA','NILCE','FERNANDA','FABIANA','FLAVIA','FRANCIELE','ZILMA','ZENAIDE','ZELIA','SUELI','SUELY','WENDY','WANDA']);
const MALE   = new Set(['JOAO','JOSE','JORGE','JULIO','LUCAS','LUIS','LUIZ','LEANDRO','LEONARDO','PEDRO','PAULO','CARLOS','CAIO','CASSIO','CLAUDIO','MARCOS','MARIO','MATEUS','MATHEUS','MARCELO','MAURICIO','FELIPE','FABIO','FABRICIO','FERNANDO','RAFAEL','RODRIGO','ROBERTO','RONALDO','RENAN','THIAGO','TIAGO','DANIEL','DAVID','DIEGO','DOUGLAS','GABRIEL','GUSTAVO','GUILHERME','HENRIQUE','HUGO','IGOR','IVAN','JONATHAN','JUNIOR','MARCIO','NELSON','OTAVIO','VINICIUS','VICTOR','VITOR','ANDERSON','ANDRE','ANTONIO','ALEX','ALISSON','BRENO','BRUNO','BERNARDO','EDSON','EDUARDO','ELTON','EMERSON','EVERTON','FLAVIO','FRANCISCO','GIOVANI','SAMUEL','SERGIO','SANDRO','SIDNEI','REGIS','ROGERIO','JARISSON','WAGNER','WILLIAN','WILLIAM','XAVIER','ITALO','LUAN','KAYQUE','TARCISIO','TARCIZIO']);

function guessByEnding(n: string): 'F'|'M' {
  if (/A$/.test(n)) return 'F';
  if (/(INA|ENA|ELA|ILA|OLA|ULA|ELLE|ETTE|ISSA)$/.test(n)) return 'F';
  if (/(ON|OR|OS|IM|EM|SON|TON|ANDO|ALDO)$/.test(n)) return 'M';
  return 'M';
}

export function detectGender(fullName: string): 'F'|'M' {
  if (!fullName) return 'M';
  const parts = fullName.trim().toUpperCase().split(/\s+/);
  if (FEMALE.has(parts[0])) return 'F';
  if (MALE.has(parts[0]))   return 'M';
  if (parts[1] && FEMALE.has(parts[1])) return 'F';
  if (parts[1] && MALE.has(parts[1]))   return 'M';
  return guessByEnding(parts[0]);
}

const M_MAP: Record<string,string> = { solteiro:'solteiro', casado:'casado', divorciado:'divorciado', viuvo:'vi\u00FAvo' };
const F_MAP: Record<string,string> = { solteiro:'solteira', casado:'casada', divorciado:'divorciada', viuvo:'vi\u00FAva' };

export interface GenderCtx {
  gender: 'F'|'M';
  O_A: 'O'|'A'; o_a: 'o'|'a'; do_da: 'do'|'da'; lo_la: 'lo'|'la'; no_na: 'no'|'na';
  CONTRATANTE: string; OUTORGANTE: string;
  nacional: string; marital: string;
  declaracaoTitulo: string;
  qualificacao: string;
}

export function buildCtx(
  name: string, maritalStatus?: string|null, occupation?: string|null, override?: 'F'|'M'|null
): GenderCtx {
  const g = override ?? detectGender(name);
  const F = g === 'F';
  const m = maritalStatus ?? 'solteiro';
  const marital  = F ? (F_MAP[m]??m) : (M_MAP[m]??m);
  const nacional = F ? 'brasileira' : 'brasileiro';
  const occ      = occupation ?? 'desempregad'+(F?'a':'o');
  return {
    gender: g,
    O_A: F?'A':'O', o_a: F?'a':'o', do_da: F?'da':'do', lo_la: F?'la':'lo', no_na: F?'na':'no',
    CONTRATANTE: F?'A CONTRATANTE':'O CONTRATANTE',
    OUTORGANTE:  F?'A outorgante':'O outorgante',
    nacional, marital,
    declaracaoTitulo: F ? 'DECLARA\u00C7\u00C3O' : 'DECLARA\u00C7\u00C3O DE POBREZA',
    qualificacao: `${nacional}, ${marital}, ${occ}`,
  };
}