/**
 * South African legal domain constants.
 *
 * Ported verbatim from the original DivorceSummons AI bundle (bbcmlegal.net) so that
 * the eight seeded firm templates and their variable palette keep working unchanged.
 */

export const PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
] as const;
export type Province = (typeof PROVINCES)[number];

export const COURT_TYPES = ['high_court', 'regional_court'] as const;
export type CourtType = (typeof COURT_TYPES)[number];

/** High Court divisions, keyed by province. Seat names per the Superior Courts Act 10 of 2013. */
export const HIGH_COURT_DIVISIONS: Record<Province, string[]> = {
  Gauteng: ['Gauteng Division, Pretoria', 'Gauteng Local Division, Johannesburg'],
  'Western Cape': ['Western Cape Division, Cape Town'],
  'KwaZulu-Natal': ['KwaZulu-Natal Division, Pietermaritzburg', 'KwaZulu-Natal Local Division, Durban'],
  'Eastern Cape': ['Eastern Cape Division, Makhanda'],
  'Free State': ['Free State Division, Bloemfontein'],
  Limpopo: ['Limpopo Division, Polokwane'],
  Mpumalanga: ['Mpumalanga Division, Mbombela'],
  'North West': ['North West Division, Mahikeng'],
  'Northern Cape': ['Northern Cape Division, Kimberley'],
};

/**
 * Regional Courts with divorce jurisdiction under s29(1B) of the
 * Magistrates' Courts Act 32 of 1944.
 */
export const REGIONAL_COURTS: Record<Province, string[]> = {
  Gauteng: [
    'Pretoria Regional Court',
    'Johannesburg Regional Court',
    'Germiston Regional Court',
  ],
  'Western Cape': ['Cape Town Regional Court', 'Wynberg Regional Court'],
  'KwaZulu-Natal': ['Durban Regional Court', 'Pietermaritzburg Regional Court'],
  'Eastern Cape': ['Port Elizabeth Regional Court', 'East London Regional Court'],
  'Free State': ['Bloemfontein Regional Court'],
  Limpopo: ['Polokwane Regional Court'],
  Mpumalanga: ['Nelspruit Regional Court'],
  'North West': ['Mahikeng Regional Court', 'Rustenburg Regional Court'],
  'Northern Cape': ['Kimberley Regional Court'],
};

export function courtsFor(province: Province, courtType: CourtType): string[] {
  return courtType === 'high_court'
    ? (HIGH_COURT_DIVISIONS[province] ?? [])
    : (REGIONAL_COURTS[province] ?? []);
}

/** Matrimonial property regimes — Matrimonial Property Act 88 of 1984. */
export const MARRIAGE_REGIMES = [
  'in_community',
  'out_of_community_with_accrual',
  'out_of_community_without_accrual',
  'customary',
] as const;
export type MarriageRegime = (typeof MARRIAGE_REGIMES)[number];

export const MARRIAGE_REGIME_LABELS: Record<MarriageRegime, string> = {
  in_community: 'In community of property',
  out_of_community_with_accrual: 'Out of community of property with accrual',
  out_of_community_without_accrual: 'Out of community of property without accrual',
  customary: 'Customary marriage',
};

/** Prose used inside pleadings, e.g. "which marriage is <phrase>". */
export const MARRIAGE_REGIME_PHRASES: Record<MarriageRegime, string> = {
  in_community: 'in community of property',
  out_of_community_with_accrual:
    'out of community of property with the inclusion of the accrual system in terms of the Matrimonial Property Act 88 of 1984',
  out_of_community_without_accrual:
    'out of community of property with the exclusion of the accrual system in terms of an antenuptial contract',
  customary:
    'a customary marriage in terms of the Recognition of Customary Marriages Act 120 of 1998',
};

/** Marriage types — the statute under which the marriage was concluded. */
export const MARRIAGE_TYPES = ['civil', 'customary', 'civil_union', 'religious'] as const;
export type MarriageType = (typeof MARRIAGE_TYPES)[number];

export const MARRIAGE_TYPE_LABELS: Record<MarriageType, string> = {
  civil: 'Civil marriage (Marriage Act 25 of 1961)',
  customary: 'Customary marriage (Recognition of Customary Marriages Act 120 of 1998)',
  civil_union: 'Civil union (Civil Union Act 17 of 2006)',
  religious: 'Religious marriage',
};

/** Attachment document types recognised by the extraction pipeline. */
export const DOCUMENT_TYPES = [
  'marriage_certificate',
  'id_document',
  'birth_certificate',
  'payslip',
  'pension_document',
  'title_deed',
  'bank_account',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  marriage_certificate: 'Marriage Certificate',
  id_document: 'Identity Document',
  birth_certificate: 'Birth Certificate',
  payslip: 'Payslip',
  pension_document: 'Pension Fund Statement',
  title_deed: 'Title Deed',
  bank_account: 'Bank Statement',
  other: 'Other Document',
};

/** Document types the generator can produce. */
export const GENERATED_DOCUMENT_TYPES = [
  'summons',
  'particulars_of_claim',
  'settlement_agreement',
  'index_page',
  'annexure_schedule',
  'notice_set_down',
  'notice_no_objection',
] as const;
export type GeneratedDocumentType = (typeof GENERATED_DOCUMENT_TYPES)[number];

export const GENERATED_DOCUMENT_LABELS: Record<GeneratedDocumentType, string> = {
  summons: 'Combined Summons',
  particulars_of_claim: 'Particulars of Claim',
  settlement_agreement: 'Settlement Agreement',
  index_page: 'Index',
  annexure_schedule: 'Annexure Schedule',
  notice_set_down: 'Notice of Set Down',
  notice_no_objection: 'Notice of No Objection',
};

/** Filing order for court bundles — drives the Index and Annexure Schedule. */
export const FILING_ORDER: GeneratedDocumentType[] = [
  'index_page',
  'summons',
  'particulars_of_claim',
  'settlement_agreement',
  'annexure_schedule',
  'notice_set_down',
  'notice_no_objection',
];

export const USER_ROLES = [
  'super_admin',
  'firm_admin',
  'attorney',
  'candidate_attorney',
  'paralegal',
  'secretary',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  firm_admin: 'Firm Admin',
  attorney: 'Attorney',
  candidate_attorney: 'Candidate Attorney',
  paralegal: 'Paralegal',
  secretary: 'Secretary',
};

/** Roles permitted to administer their firm. */
export const ADMIN_ROLES: UserRole[] = ['super_admin', 'firm_admin'];

export const MATTER_STATUSES = ['draft', 'active', 'review', 'generated', 'archived'] as const;
export type MatterStatus = (typeof MATTER_STATUSES)[number];

export const MATTER_STATUS_LABELS: Record<MatterStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  review: 'In Review',
  generated: 'Generated',
  archived: 'Archived',
};

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Annexures A–C are reserved for the standard bundle (marriage certificate, IDs,
 * birth certificates). Uploaded annexures are auto-lettered from D onward, matching
 * the original app's behaviour.
 */
export const ANNEXURE_START_INDEX = 3; // 0=A, so 3=D

export function annexureLabel(index: number): string {
  const n = ANNEXURE_START_INDEX + index;
  let label = '';
  let i = n;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}
