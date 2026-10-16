import type {
  Branch,
  ClauseLibraryEntry,
  FirmTemplate,
  LawFirm,
  Matter,
  MatterAsset,
  MatterAttachment,
  MatterChild,
  MatterLiability,
  OcrFieldOverride,
  UserRole,
} from '@bbcm/schema';

export type {
  Branch, ClauseLibraryEntry, FirmTemplate, LawFirm, Matter,
  MatterAsset, MatterAttachment, MatterChild, MatterLiability, OcrFieldOverride, UserRole,
};

export interface SessionUser {
  id: string;
  firm_id: string | null;
  branch_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  lpc_number: string;
}

export interface Party {
  full_names: string;
  surname: string;
  id_number: string;
  passport: string;
  dob: string;
  gender: string;
  occupation: string;
  employer: string;
  employee_number: string;
  income: number;
  monthly_expenses: number;
  physical_address: string;
  postal_address: string;
  phone: string;
  email: string;
  pension_fund_name: string;
  pension_share_pct: number;
}

export type MatterDetail = Matter & { plaintiff: Party; defendant: Party };

export interface MatterListResponse {
  matters: Matter[];
  stats: { total: number; active: number; review: number; complete: number };
}

export interface MatterDetailResponse {
  matter: MatterDetail;
  children: MatterChild[];
  assets: MatterAsset[];
  liabilities: MatterLiability[];
  attachments: MatterAttachment[];
  documents: GeneratedDocumentSummary[];
}

export interface GeneratedDocumentSummary {
  id: string;
  document_type: string;
  title: string;
  version: number;
  created_at: string;
}

export interface ReviewResponse {
  fields: OcrFieldOverride[];
  summary: { total: number; confirmed: number; high_confidence: number; needs_review: number };
}

export interface ExtractionResponse {
  extraction: {
    document_type_detected: string;
    legible: boolean;
    fields: Array<{ field: string; value: string; confidence: number }>;
    raw_text: string;
    notes: string;
    overall_confidence: number;
  };
  applied_fields: Array<{ field: string; value: string; confidence: number }>;
}

export interface PreviewResponse {
  documents: Array<{ document_type: string; title: string; html: string; text: string }>;
  skipped: string[];
}

export const emptyParty: Party = {
  full_names: '', surname: '', id_number: '', passport: '', dob: '', gender: '',
  occupation: '', employer: '', employee_number: '', income: 0, monthly_expenses: 0,
  physical_address: '', postal_address: '', phone: '', email: '',
  pension_fund_name: '', pension_share_pct: 0,
};
