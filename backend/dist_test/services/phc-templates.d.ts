import type { GenderCtx } from './gender-detect';
export type FunnelSlug = 'golpe-cibernetico' | 'golpe_cibernetico' | 'conta-hackeada' | 'conta_hackeada' | 'golpe-do-pix' | 'golpe_do_pix' | 'nome-negativado' | 'nome_negativado' | 'trabalhista' | 'geral';
export declare function getAcaoContrato(slug: string): string;
export declare function getAcaoProcuracao(slug: string): string;
export declare function advQual(adv: {
    name: string;
    oab: string;
    city?: string | null;
    state?: string | null;
    street?: string | null;
    street_number?: string | null;
    cep?: string | null;
}): string;
export declare function clienteQual(g: GenderCtx, name: string, rg?: string | null, cpf?: string | null, addr?: string | null, city?: string | null, state?: string | null, cep?: string | null): string;
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
    clienteCpf?: string | null;
}
export declare function buildContrato(d: ContratoData): string[];
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
export declare function buildProcuracao(d: ProcuracaoData): string[];
export interface HipoData {
    clienteQualificacao: string;
    g: GenderCtx;
    localData: string;
    clienteNome: string;
}
export declare function buildDeclaracaoHipo(d: HipoData): string[];
//# sourceMappingURL=phc-templates.d.ts.map