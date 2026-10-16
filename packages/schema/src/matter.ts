import { z } from 'zod';
import {
  COURT_TYPES,
  DOCUMENT_TYPES,
  GENDERS,
  MARRIAGE_REGIMES,
  MARRIAGE_TYPES,
  MATTER_STATUSES,
  PROVINCES,
} from './constants.js';

/**
 * SA ID number validation — 13 digits with a Luhn check digit.
 * YYMMDD SSSS C A Z: date, sequence (gender), citizenship, race (legacy), checksum.
 */
export function isValidSaIdNumber(id: string): boolean {
  const digits = id.replace(/\s/g, '');
  if (!/^\d{13}$/.test(digits)) return false;

  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  // Luhn checksum over the 13 digits.
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(digits[i]);
    if ((12 - i) % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Derives date of birth and gender from a valid SA ID number. */
export function parseSaIdNumber(id: string): { dob: string; gender: 'male' | 'female' } | null {
  if (!isValidSaIdNumber(id)) return null;
  const digits = id.replace(/\s/g, '');
  const yy = Number(digits.slice(0, 2));
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  // Two-digit years: assume anyone born in a year later than the current one is from 1900s.
  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const sequence = Number(digits.slice(6, 10));
  return {
    dob: `${century + yy}-${mm}-${dd}`,
    gender: sequence < 5000 ? 'female' : 'male',
  };
}

const saIdNumber = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidSaIdNumber(v), {
    message: 'Not a valid South African ID number (13 digits, checksum must pass)',
  });

const optionalString = z.string().trim().optional().default('');
const money = z.coerce.number().nonnegative().optional().default(0);

/**
 * An enum field that may legitimately be left unanswered.
 *
 * HTML selects submit an empty string for "not selected", which is not the same as
 * `undefined` — a plain `.optional()` enum rejects it. Gender in particular is often
 * unknown until an ID document is uploaded, so blank has to be a valid answer.
 */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), z.literal('')]).optional().default('');
}

/** One party (plaintiff or defendant). Field names mirror the original DB columns. */
export const partySchema = z.object({
  full_names: z.string().trim().min(1, 'Full names are required'),
  surname: z.string().trim().min(1, 'Surname is required'),
  id_number: saIdNumber.optional().default(''),
  passport: optionalString,
  dob: optionalString,
  gender: optionalEnum(GENDERS),
  occupation: optionalString,
  employer: optionalString,
  employee_number: optionalString,
  income: money,
  monthly_expenses: money,
  physical_address: z.string().trim().min(1, 'Physical address is required'),
  postal_address: optionalString,
  phone: optionalString,
  email: z.string().trim().email().or(z.literal('')).optional().default(''),
  pension_fund_name: optionalString,
  pension_share_pct: z.coerce.number().min(0).max(100).optional().default(0),
});
export type Party = z.infer<typeof partySchema>;

export const childSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1, 'Child name is required'),
  surname: optionalString,
  id_number: saIdNumber.optional().default(''),
  dob: optionalString,
  gender: optionalEnum(GENDERS),
  birth_cert_attached: z.boolean().optional().default(false),
  maintenance_claimed: money,
});
export type Child = z.infer<typeof childSchema>;

export const assetSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  category: z
    .enum(['immovable', 'vehicle', 'business', 'investment', 'household', 'other'])
    .optional()
    .default('other'),
  value: money,
  /** Which party the asset is allocated to in the settlement. */
  allocated_to: z.enum(['plaintiff', 'defendant', 'joint', 'unallocated']).optional().default('unallocated'),
  commencement_value: money,
  notes: optionalString,
});
export type Asset = z.infer<typeof assetSchema>;

export const liabilitySchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  creditor: optionalString,
  amount: money,
  responsible_party: z.enum(['plaintiff', 'defendant', 'joint']).optional().default('joint'),
});
export type Liability = z.infer<typeof liabilitySchema>;

/** Step 1 of the wizard — firm and court. */
export const courtStepSchema = z.object({
  // No firm_id: the server takes it from the session. See routes/matters.ts.
  branch_id: z.string().uuid().optional().nullable(),
  attorney_id: z.string().uuid('Select the attorney handling the matter'),
  case_reference: optionalString,
  case_number: optionalString,
  province: z.enum(PROVINCES, { errorMap: () => ({ message: 'Select a province' }) }),
  court_type: z.enum(COURT_TYPES, { errorMap: () => ({ message: 'Select a court type' }) }),
  court_name: z.string().trim().min(1, 'Select a court division'),
  is_contested: z.boolean().optional().default(false),
});

/** Step 3 of the wizard — marriage and consequences. */
export const marriageStepSchema = z.object({
  marriage_date: z.string().trim().min(1, 'Marriage date is required'),
  marriage_place: z.string().trim().min(1, 'Place of marriage is required'),
  marriage_type: z.enum(MARRIAGE_TYPES),
  marriage_regime: z.enum(MARRIAGE_REGIMES),
  marriage_certificate_attached: z.boolean().optional().default(false),
  marriage_certificate_annexure_ref: optionalString,
  child_maintenance_claimed: money,
  spousal_maintenance_claimed: money,
  pension_interest_claimed: z.boolean().optional().default(false),
  forfeiture_claimed: z.boolean().optional().default(false),
  costs_sought: z.boolean().optional().default(false),
});

/** Full matter payload. Party fields are flattened to `plaintiff_` / `defendant_` columns on write. */
export const matterInputSchema = courtStepSchema.merge(marriageStepSchema).extend({
  plaintiff: partySchema,
  defendant: partySchema,
  children: z.array(childSchema).optional().default([]),
  assets: z.array(assetSchema).optional().default([]),
  liabilities: z.array(liabilitySchema).optional().default([]),
  status: z.enum(MATTER_STATUSES).optional().default('draft'),
});
export type MatterInput = z.infer<typeof matterInputSchema>;

export const matterUpdateSchema = matterInputSchema.partial();

export const attachmentSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  file_name: z.string().trim().min(1),
  annexure_label: optionalString,
  sort_order: z.coerce.number().int().nonnegative().optional().default(0),
});

/** A single field extracted by the vision model, with its confidence. */
export const extractedFieldSchema = z.object({
  field: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const ocrOverrideSchema = z.object({
  field_name: z.string().trim().min(1),
  value: z.string(),
  confirmed: z.boolean().optional().default(true),
});
