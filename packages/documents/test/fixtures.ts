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
import { SYSTEM_CLAUSES } from '../src/clauses.js';
import { STARTER_TEMPLATES } from '../src/templates.js';
import type { MatterContext } from '../src/types.js';

export const FIRM: LawFirm = {
  id: 'firm-1',
  name: 'Van der Merwe & Associates',
  province: 'Gauteng',
  city: 'Pretoria',
  phone: '012 345 6789',
  email: 'info@vdm-law.co.za',
  address: '123 Church Street',
  registration_number: '2011/123456/21',
  lpc_number: 'LPC12345',
  vat_number: '4123456789',
  logo_url: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

export const BRANCH: Branch = {
  id: 'branch-1',
  firm_id: 'firm-1',
  name: 'Pretoria Main',
  city: 'Pretoria',
  address: '123 Church Street',
  phone: '012 345 6789',
  created_at: '2026-01-01 00:00:00',
};

/** A blank matter with every column present, so tests can override only what they need. */
export function baseMatter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: 'matter-1',
    firm_id: 'firm-1',
    branch_id: 'branch-1',
    attorney_id: 'user-1',
    case_reference: 'VDM/2026/D/005',
    case_number: '12345/2026',
    province: 'Gauteng',
    court_type: 'high_court',
    court_name: 'Gauteng Division, Pretoria',
    is_contested: 0,
    status: 'active',

    plaintiff_full_names: 'Thandiwe Grace',
    plaintiff_surname: 'Mokoena',
    plaintiff_id_number: '8801010509084',
    plaintiff_passport: '',
    plaintiff_dob: '1988-01-01',
    plaintiff_gender: 'female',
    plaintiff_occupation: 'teacher',
    plaintiff_employer: 'Department of Education',
    plaintiff_employee_number: 'E12345',
    plaintiff_income: 32000,
    plaintiff_monthly_expenses: 21000,
    plaintiff_physical_address: '45 Jacaranda Avenue, Arcadia, Pretoria',
    plaintiff_postal_address: 'PO Box 100, Pretoria',
    plaintiff_phone: '082 111 2222',
    plaintiff_email: 'thandiwe@example.co.za',
    plaintiff_pension_fund_name: 'GEPF',
    plaintiff_pension_share_pct: 0,

    defendant_full_names: 'Sipho Daniel',
    defendant_surname: 'Mokoena',
    defendant_id_number: '8506155048083',
    defendant_passport: '',
    defendant_dob: '1985-06-15',
    defendant_gender: 'male',
    defendant_occupation: 'engineer',
    defendant_employer: 'Eskom',
    defendant_employee_number: 'E98765',
    defendant_income: 58000,
    defendant_monthly_expenses: 30000,
    defendant_physical_address: '12 Protea Road, Centurion',
    defendant_postal_address: '',
    defendant_phone: '083 333 4444',
    defendant_email: 'sipho@example.co.za',
    defendant_pension_fund_name: 'Eskom Pension and Provident Fund',
    defendant_pension_share_pct: 50,

    marriage_date: '2015-02-14',
    marriage_place: 'Pretoria',
    marriage_type: 'civil',
    marriage_regime: 'in_community',
    marriage_certificate_attached: 1,
    marriage_certificate_annexure_ref: 'A',

    child_maintenance_claimed: 0,
    spousal_maintenance_claimed: 0,
    pension_interest_claimed: 0,
    forfeiture_claimed: 0,
    costs_sought: 0,

    ocr_data_applied: 0,
    created_at: '2026-08-01 09:00:00',
    updated_at: '2026-08-01 09:00:00',
    ...overrides,
  };
}

export function child(overrides: Partial<MatterChild> = {}): MatterChild {
  return {
    id: 'child-1',
    matter_id: 'matter-1',
    full_name: 'Lerato',
    surname: 'Mokoena',
    id_number: '',
    dob: '2017-03-20',
    gender: 'female',
    birth_cert_attached: 1,
    maintenance_claimed: 0,
    sort_order: 0,
    ...overrides,
  };
}

export function asset(overrides: Partial<MatterAsset> = {}): MatterAsset {
  return {
    id: 'asset-1',
    matter_id: 'matter-1',
    description: 'Erf 123, Centurion',
    category: 'immovable',
    value: 1850000,
    allocated_to: 'joint',
    commencement_value: 0,
    notes: '',
    sort_order: 0,
    ...overrides,
  };
}

export function liability(overrides: Partial<MatterLiability> = {}): MatterLiability {
  return {
    id: 'liability-1',
    matter_id: 'matter-1',
    description: 'Mortgage bond',
    creditor: 'ABSA',
    amount: 900000,
    responsible_party: 'joint',
    sort_order: 0,
    ...overrides,
  };
}

export function attachment(overrides: Partial<MatterAttachment> = {}): MatterAttachment {
  return {
    id: 'att-1',
    matter_id: 'matter-1',
    document_type: 'payslip',
    file_name: 'payslip-june.pdf',
    storage_key: 'matters/matter-1/payslip-june.pdf',
    content_type: 'application/pdf',
    size_bytes: 12345,
    annexure_label: '',
    annexure_number: 0,
    sort_order: 0,
    ocr_text: '',
    ocr_confidence: 0,
    ocr_extracted: 0,
    uploaded_by: 'user-1',
    created_at: '2026-08-01 10:00:00',
    ...overrides,
  };
}

/** The seeded templates, as they are stored per firm. */
export function seededTemplates(): FirmTemplate[] {
  return STARTER_TEMPLATES.map((template, index) => ({
    id: `tpl-${index}`,
    firm_id: 'firm-1',
    name: template.name,
    document_type: template.document_type,
    marriage_regime: template.marriage_regime,
    is_contested: template.is_contested === null ? null : template.is_contested ? 1 : 0,
    has_children: template.has_children === null ? null : template.has_children ? 1 : 0,
    body: template.body,
    is_active: 1,
    is_default: template.is_default ? 1 : 0,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
  }));
}

export function seededClauses(): ClauseLibraryEntry[] {
  return SYSTEM_CLAUSES.map((clause, index) => ({
    id: `clause-${index}`,
    firm_id: null,
    key: clause.key,
    title: clause.title,
    category: clause.category,
    condition: clause.condition,
    body: clause.body,
    sort_order: clause.sort_order,
    is_active: 1,
  }));
}

export function makeContext(overrides: Partial<MatterContext> = {}): MatterContext {
  return {
    matter: baseMatter(),
    firm: FIRM,
    branch: BRANCH,
    attorney: {
      full_name: 'Adv. Bongani Chauke',
      lpc_number: 'LPC99887',
      email: 'bongani@vdm-law.co.za',
      phone: '012 345 6789',
    },
    children: [],
    assets: [],
    liabilities: [],
    attachments: [],
    clauses: seededClauses(),
    templates: seededTemplates(),
    ...overrides,
  };
}

/** Fixed date so golden output is deterministic. */
export const FIXED_NOW = new Date('2026-08-03T10:00:00Z');
