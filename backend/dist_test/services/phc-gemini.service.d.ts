export interface PhcLeadData {
    name: string;
    cpf?: string | null;
    rg?: string | null;
    marital_status?: string | null;
    nationality?: string | null;
    occupation?: string | null;
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
    sections: Array<{
        heading?: string;
        text: string;
        bold?: boolean;
    }>;
    localData: string;
    clienteName: string;
    lawyerName: string;
    lawyerOab: string;
    docType: DocType;
}
export declare function generateDocumentText(docType: DocType, lead: PhcLeadData, lawyer: PhcLawyerData): Promise<string>;
//# sourceMappingURL=phc-gemini.service.d.ts.map