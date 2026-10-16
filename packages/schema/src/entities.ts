import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  GENERATED_DOCUMENT_TYPES,
  MARRIAGE_REGIMES,
  MATTER_STATUSES,
  PROVINCES,
  USER_ROLES,
} from './constants.js';

/** Row shapes as stored in D1. Column names ported from the original Supabase schema. */

export interface LawFirm {
  id: string;
  name: string;
  province: string;
  city: string;
  phone: string;
  email: string;
  address: string;
  registration_number: string;
  /** Legal Practice Council firm reference. */
  lpc_number: string;
  vat_number: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  firm_id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  firm_id: string | null;
  branch_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  role: (typeof USER_ROLES)[number];
  /** Legal Practice Council practitioner number. */
  lpc_number: string;
  password_hash: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  firm_id: string;
  branch_id: string | null;
  attorney_id: string;
  case_reference: string;
  case_number: string;
  province: string;
  court_type: string;
  court_name: string;
  is_contested: number;
  status: (typeof MATTER_STATUSES)[number];

  plaintiff_full_names: string;
  plaintiff_surname: string;
  plaintiff_id_number: string;
  plaintiff_passport: string;
  plaintiff_dob: string;
  plaintiff_gender: string;
  plaintiff_occupation: string;
  plaintiff_employer: string;
  plaintiff_employee_number: string;
  plaintiff_income: number;
  plaintiff_monthly_expenses: number;
  plaintiff_physical_address: string;
  plaintiff_postal_address: string;
  plaintiff_phone: string;
  plaintiff_email: string;
  plaintiff_pension_fund_name: string;
  plaintiff_pension_share_pct: number;

  defendant_full_names: string;
  defendant_surname: string;
  defendant_id_number: string;
  defendant_passport: string;
  defendant_dob: string;
  defendant_gender: string;
  defendant_occupation: string;
  defendant_employer: string;
  defendant_employee_number: string;
  defendant_income: number;
  defendant_monthly_expenses: number;
  defendant_physical_address: string;
  defendant_postal_address: string;
  defendant_phone: string;
  defendant_email: string;
  defendant_pension_fund_name: string;
  defendant_pension_share_pct: number;

  marriage_date: string;
  marriage_place: string;
  marriage_type: string;
  marriage_regime: string;
  marriage_certificate_attached: number;
  marriage_certificate_annexure_ref: string;

  child_maintenance_claimed: number;
  spousal_maintenance_claimed: number;
  pension_interest_claimed: number;
  forfeiture_claimed: number;
  costs_sought: number;

  ocr_data_applied: number;
  created_at: string;
  updated_at: string;
}

export interface MatterChild {
  id: string;
  matter_id: string;
  full_name: string;
  surname: string;
  id_number: string;
  dob: string;
  gender: string;
  birth_cert_attached: number;
  maintenance_claimed: number;
  sort_order: number;
}

export interface MatterAsset {
  id: string;
  matter_id: string;
  description: string;
  category: string;
  value: number;
  allocated_to: string;
  commencement_value: number;
  notes: string;
  sort_order: number;
}

export interface MatterLiability {
  id: string;
  matter_id: string;
  description: string;
  creditor: string;
  amount: number;
  responsible_party: string;
  sort_order: number;
}

export interface MatterAttachment {
  id: string;
  matter_id: string;
  document_type: (typeof DOCUMENT_TYPES)[number];
  file_name: string;
  /** R2 object key. */
  storage_key: string;
  content_type: string;
  size_bytes: number;
  annexure_label: string;
  annexure_number: number;
  sort_order: number;
  ocr_text: string;
  ocr_confidence: number;
  ocr_extracted: number;
  uploaded_by: string;
  created_at: string;
}

export interface OcrFieldOverride {
  id: string;
  matter_id: string;
  attachment_id: string | null;
  field_name: string;
  extracted_value: string;
  value: string;
  confidence: number;
  confirmed: number;
  overridden: number;
  created_at: string;
  updated_at: string;
}

export interface FirmTemplate {
  id: string;
  firm_id: string;
  name: string;
  document_type: (typeof GENERATED_DOCUMENT_TYPES)[number];
  /** Null means the template applies to any regime. */
  marriage_regime: (typeof MARRIAGE_REGIMES)[number] | null;
  /** Null means either contested state. */
  is_contested: number | null;
  /** Null means either children state. */
  has_children: number | null;
  body: string;
  is_active: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface ClauseLibraryEntry {
  id: string;
  firm_id: string | null;
  key: string;
  title: string;
  category: string;
  condition: string;
  body: string;
  sort_order: number;
  is_active: number;
}

export interface GeneratedDocument {
  id: string;
  matter_id: string;
  document_type: (typeof GENERATED_DOCUMENT_TYPES)[number];
  template_id: string | null;
  title: string;
  body: string;
  storage_key: string | null;
  version: number;
  generated_by: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  firm_id: string | null;
  user_id: string | null;
  matter_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: string;
  ip: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
}

/** Auth payloads. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerFirmSchema = z.object({
  name: z.string().trim().min(2, 'Firm name is required'),
  province: z.enum(PROVINCES),
  city: z.string().trim().min(1, 'City is required'),
  phone: z.string().trim().optional().default(''),
  email: z.string().trim().email().or(z.literal('')).optional().default(''),
  address: z.string().trim().optional().default(''),
  registration_number: z.string().trim().optional().default(''),
  lpc_number: z.string().trim().optional().default(''),
  vat_number: z.string().trim().optional().default(''),
});

export const createUserSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().optional().default(''),
  role: z.enum(USER_ROLES),
  lpc_number: z.string().trim().optional().default(''),
  branch_id: z.string().uuid().nullable().optional(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

export const branchSchema = z.object({
  name: z.string().trim().min(1, 'Branch name is required'),
  city: z.string().trim().optional().default(''),
  address: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required'),
  document_type: z.enum(GENERATED_DOCUMENT_TYPES),
  marriage_regime: z.enum(MARRIAGE_REGIMES).nullable().optional(),
  is_contested: z.boolean().nullable().optional(),
  has_children: z.boolean().nullable().optional(),
  body: z.string(),
  is_active: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
});
