/**
 * Firm operations: Sheriff service, fee notes and client portal access.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sheriff service
// ---------------------------------------------------------------------------

export const SERVICE_STATUSES = ['instructed', 'served', 'not_served', 'return_filed'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  instructed: 'Instructed',
  served: 'Served',
  not_served: 'Not served',
  return_filed: 'Return filed',
};

/**
 * Manners of service under Uniform Rule 4(1)(a).
 *
 * ⚠️ Transcribed from working knowledge — the Rules PDF could not be retrieved to
 * verify against, so check this list against the current Uniform Rules before relying
 * on it. `other` exists precisely so an unlisted manner never blocks a record: the
 * attorney describes what the Sheriff actually did.
 */
export const SERVICE_MANNERS = [
  'personal',
  'residence',
  'place_of_business',
  'place_of_employment',
  'domicilium',
  'agent',
  'corporate',
  'affixing',
  'edictal',
  'other',
] as const;
export type ServiceManner = (typeof SERVICE_MANNERS)[number];

export const SERVICE_MANNER_LABELS: Record<ServiceManner, string> = {
  personal: 'Personally on the defendant',
  residence: 'At the residence, on a person apparently 16 or older',
  place_of_business: 'At the place of business, on a person apparently 16 or older',
  place_of_employment: 'At the place of employment, on a person apparently in authority',
  domicilium: 'At the domicilium citandi et executandi',
  agent: 'On an agent authorised in writing to accept service',
  corporate: 'At the registered office or principal place of business',
  affixing: 'By affixing to the principal door or security gate',
  edictal: 'By edictal citation or substituted service, per court order',
  other: 'Other — described below',
};

export const serviceEventSchema = z.object({
  document_id: z.string().uuid().nullable().optional(),
  sheriff_office: z.string().trim().optional().default(''),
  sheriff_reference: z.string().trim().optional().default(''),
  service_address: z.string().trim().optional().default(''),
  manner: z.union([z.enum(SERVICE_MANNERS), z.literal('')]).optional().default(''),
  manner_detail: z.string().trim().optional().default(''),
  served_on: z.string().trim().optional().default(''),
  instructed_at: z.string().trim().optional().default(''),
  served_at: z.string().trim().optional().default(''),
  return_received_at: z.string().trim().optional().default(''),
  non_service_reason: z.string().trim().optional().default(''),
  fee: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().optional().default(''),
  status: z.enum(SERVICE_STATUSES).optional().default('instructed'),
});

export interface ServiceEvent {
  id: string;
  matter_id: string;
  document_id: string | null;
  status: ServiceStatus;
  sheriff_office: string;
  sheriff_reference: string;
  service_address: string;
  manner: string;
  manner_detail: string;
  served_on: string;
  instructed_at: string;
  served_at: string;
  return_received_at: string;
  non_service_reason: string;
  fee: number;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fee notes
// ---------------------------------------------------------------------------

export const FEE_NOTE_STATUSES = ['draft', 'issued', 'paid'] as const;
export type FeeNoteStatus = (typeof FEE_NOTE_STATUSES)[number];

export const FEE_LINE_KINDS = ['fee', 'disbursement'] as const;
export type FeeLineKind = (typeof FEE_LINE_KINDS)[number];

export const LEDGER_ACCOUNTS = ['business', 'trust'] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export const FEE_LINE_KIND_LABELS: Record<FeeLineKind, string> = {
  fee: 'Professional fee',
  disbursement: 'Disbursement',
};

/** Standard South African VAT rate. Stored per note so history does not re-price. */
export const DEFAULT_VAT_RATE = 15;

export const feeNoteLineSchema = z.object({
  description: z.string().trim().min(1, 'Describe the fee or disbursement'),
  kind: z.enum(FEE_LINE_KINDS).optional().default('fee'),
  account: z.enum(LEDGER_ACCOUNTS).optional().default('business'),
  service_date: z.string().trim().optional().default(''),
  quantity: z.coerce.number().positive().optional().default(1),
  unit_amount: z.coerce.number().nonnegative().optional().default(0),
  vatable: z.boolean().optional().default(true),
});

export const feeNoteSchema = z.object({
  note_number: z.string().trim().optional().default(''),
  status: z.enum(FEE_NOTE_STATUSES).optional().default('draft'),
  issued_at: z.string().trim().optional().default(''),
  due_at: z.string().trim().optional().default(''),
  paid_at: z.string().trim().optional().default(''),
  vat_rate: z.coerce.number().min(0).max(100).optional().default(DEFAULT_VAT_RATE),
  vat_registered: z.boolean().optional().default(true),
  notes: z.string().trim().optional().default(''),
  lines: z.array(feeNoteLineSchema).optional().default([]),
});

export interface FeeNoteLine {
  id: string;
  fee_note_id: string;
  description: string;
  kind: FeeLineKind;
  account: LedgerAccount;
  service_date: string;
  quantity: number;
  unit_amount: number;
  vatable: number;
  sort_order: number;
}

export interface FeeNote {
  id: string;
  matter_id: string;
  note_number: string;
  status: FeeNoteStatus;
  issued_at: string;
  due_at: string;
  paid_at: string;
  vat_rate: number;
  vat_registered: number;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FeeNoteTotals {
  fees: number;
  disbursements: number;
  /** Split by ledger, which is what the trust reconciliation needs. */
  business: number;
  trust: number;
  vatable_base: number;
  vat: number;
  total: number;
}

/**
 * A line as this function needs it.
 *
 * `vatable` accepts either form because the same totals are computed from stored
 * rows, where SQLite gives 0/1, and from API input, where it is a boolean.
 */
export interface TotallableLine {
  kind: FeeLineKind;
  account: LedgerAccount;
  quantity: number;
  unit_amount: number;
  vatable: boolean | number;
}

/**
 * Totals a fee note.
 *
 * VAT applies only to vatable lines and only where the firm is VAT-registered.
 * Disbursements paid to a non-vendor (Sheriff's fees, for instance) carry no VAT,
 * which is why `vatable` is per line rather than per note.
 */
export function totalFeeNote(
  lines: TotallableLine[],
  vatRate: number,
  vatRegistered: boolean,
): FeeNoteTotals {
  let fees = 0;
  let disbursements = 0;
  let business = 0;
  let trust = 0;
  let vatableBase = 0;

  for (const line of lines) {
    const amount = round2(line.quantity * line.unit_amount);
    if (line.kind === 'fee') fees += amount;
    else disbursements += amount;
    if (line.account === 'trust') trust += amount;
    else business += amount;
    if (line.vatable) vatableBase += amount;
  }

  const vat = vatRegistered ? round2((vatableBase * vatRate) / 100) : 0;

  return {
    fees: round2(fees),
    disbursements: round2(disbursements),
    business: round2(business),
    trust: round2(trust),
    vatable_base: round2(vatableBase),
    vat,
    total: round2(fees + disbursements + vat),
  };
}

/** Money must not accumulate binary drift across many lines. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------

export const portalInviteSchema = z.object({
  party: z.enum(['plaintiff', 'defendant']).optional().default('plaintiff'),
  label: z.string().trim().optional().default(''),
  /** Days until the link stops working. */
  expires_in_days: z.coerce.number().int().min(1).max(365).optional().default(30),
  can_upload: z.boolean().optional().default(true),
});

export interface PortalInvite {
  id: string;
  matter_id: string;
  token_hash: string;
  party: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  can_upload: number;
  created_by: string;
  created_at: string;
}

/**
 * Formats an amount in South African convention: a space between thousands and a
 * comma before the cents — R5 400,00.
 *
 * Deliberately does not use `toLocaleString('en-ZA')`. Locale data differs between
 * environments: workerd resolved it to US formatting ("R5,400.00") while Node and
 * browsers gave SA formatting ("R5 400,00"), so the same fee note read differently on
 * screen and in the PDF. Formatting explicitly makes it identical everywhere.
 */
export function formatRands(amount: number): string {
  const negative = amount < 0;
  // The epsilon nudge matches round2 above: 1.005 is stored as 1.00499999…, and a
  // fee note that rounded a half-cent down would not reconcile against the totals.
  const cents = Math.round((Math.abs(amount) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');

  // Group thousands with a plain space; a non-breaking space renders identically here
  // and only complicates text extraction and search.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return `${negative ? '-' : ''}R${grouped},${fraction}`;
}
