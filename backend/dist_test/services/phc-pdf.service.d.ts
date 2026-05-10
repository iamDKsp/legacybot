export interface LeadData {
    name: string;
    cpf?: string | null;
    rg?: string | null;
    marital_status?: string | null;
    occupation?: string | null;
    nationality?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    phone?: string | null;
    email?: string | null;
    description?: string | null;
    funnel_name?: string | null;
    funnel_slug?: string | null;
    birthdate?: string | null;
    gender?: 'F' | 'M' | null;
}
export interface LawyerData {
    name: string;
    oab: string;
    cpf?: string | null;
    address?: string | null;
    street?: string | null;
    street_number?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    additional_info?: string | null;
}
type DocType = 'procuracao' | 'declaracao_hipo' | 'contrato';
export declare function generatePhcPdfBuffer(docType: DocType, lead: LeadData, lawyer: LawyerData, notes?: string | null): Promise<Buffer>;
export {};
//# sourceMappingURL=phc-pdf.service.d.ts.map