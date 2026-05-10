export declare function detectGender(fullName: string): 'F' | 'M';
export interface GenderCtx {
    gender: 'F' | 'M';
    O_A: 'O' | 'A';
    o_a: 'o' | 'a';
    do_da: 'do' | 'da';
    lo_la: 'lo' | 'la';
    no_na: 'no' | 'na';
    CONTRATANTE: string;
    OUTORGANTE: string;
    nacional: string;
    marital: string;
    declaracaoTitulo: string;
    qualificacao: string;
}
export declare function buildCtx(name: string, maritalStatus?: string | null, occupation?: string | null, override?: 'F' | 'M' | null): GenderCtx;
//# sourceMappingURL=gender-detect.d.ts.map