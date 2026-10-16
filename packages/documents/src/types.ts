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
} from '@bbcm/schema';

/** Everything the document engine needs to assemble a document. Pure data — no I/O. */
export interface MatterContext {
  matter: Matter;
  firm: LawFirm;
  branch: Branch | null;
  attorney: { full_name: string; lpc_number: string; email: string; phone: string } | null;
  children: MatterChild[];
  assets: MatterAsset[];
  liabilities: MatterLiability[];
  attachments: MatterAttachment[];
  clauses: ClauseLibraryEntry[];
  templates: FirmTemplate[];
}

export interface AssembledDocument {
  document_type: string;
  title: string;
  /** Template body after variable substitution — the stored canonical form. */
  body: string;
  html: string;
  text: string;
  template_id: string | null;
}
