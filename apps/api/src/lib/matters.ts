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
  MatterInput,
} from '@bbcm/schema';
import type { MatterContext } from '@bbcm/documents';
import type { Env } from './context.js';

/** Flattens the nested wizard payload into the flat `matters` row shape. */
export function flattenMatterInput(input: Partial<MatterInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  const scalar: Array<keyof MatterInput> = [
    'branch_id', 'attorney_id', 'case_reference', 'case_number', 'province',
    'court_type', 'court_name', 'marriage_date', 'marriage_place', 'marriage_type',
    'marriage_regime', 'marriage_certificate_annexure_ref', 'status',
  ];
  for (const key of scalar) {
    if (input[key] !== undefined) row[key] = input[key];
  }

  const booleans: Array<keyof MatterInput> = [
    'is_contested', 'marriage_certificate_attached', 'pension_interest_claimed',
    'forfeiture_claimed', 'costs_sought',
  ];
  for (const key of booleans) {
    if (input[key] !== undefined) row[key] = input[key] ? 1 : 0;
  }

  const numbers: Array<keyof MatterInput> = [
    'child_maintenance_claimed', 'spousal_maintenance_claimed',
  ];
  for (const key of numbers) {
    if (input[key] !== undefined) row[key] = Number(input[key] ?? 0);
  }

  for (const side of ['plaintiff', 'defendant'] as const) {
    const party = input[side];
    if (!party) continue;
    for (const [field, value] of Object.entries(party)) {
      row[`${side}_${field}`] = typeof value === 'number' ? value : (value ?? '');
    }
  }

  return row;
}

/** Rebuilds the nested shape the wizard expects from a flat row. */
export function expandMatterRow(row: Matter) {
  const party = (side: 'plaintiff' | 'defendant') => ({
    full_names: row[`${side}_full_names`],
    surname: row[`${side}_surname`],
    id_number: row[`${side}_id_number`],
    passport: row[`${side}_passport`],
    dob: row[`${side}_dob`],
    gender: row[`${side}_gender`],
    occupation: row[`${side}_occupation`],
    employer: row[`${side}_employer`],
    employee_number: row[`${side}_employee_number`],
    income: row[`${side}_income`],
    monthly_expenses: row[`${side}_monthly_expenses`],
    physical_address: row[`${side}_physical_address`],
    postal_address: row[`${side}_postal_address`],
    phone: row[`${side}_phone`],
    email: row[`${side}_email`],
    pension_fund_name: row[`${side}_pension_fund_name`],
    pension_share_pct: row[`${side}_pension_share_pct`],
  });

  return { ...row, plaintiff: party('plaintiff'), defendant: party('defendant') };
}

/**
 * Loads everything the document engine needs for a matter in one batch.
 * Caller is responsible for having already checked firm ownership.
 */
export async function buildMatterContext(env: Env, matter: Matter): Promise<MatterContext> {
  const [firm, branch, attorney, children, assets, liabilities, attachments, templates, clauses] =
    await Promise.all([
      env.DB.prepare('SELECT * FROM law_firms WHERE id = ?1').bind(matter.firm_id).first<LawFirm>(),
      matter.branch_id
        ? env.DB.prepare('SELECT * FROM branches WHERE id = ?1').bind(matter.branch_id).first<Branch>()
        : Promise.resolve(null),
      env.DB.prepare('SELECT full_name, lpc_number, email, phone FROM app_users WHERE id = ?1')
        .bind(matter.attorney_id)
        .first<{ full_name: string; lpc_number: string; email: string; phone: string }>(),
      env.DB.prepare('SELECT * FROM matter_children WHERE matter_id = ?1 ORDER BY sort_order')
        .bind(matter.id)
        .all<MatterChild>(),
      env.DB.prepare('SELECT * FROM matter_assets WHERE matter_id = ?1 ORDER BY sort_order')
        .bind(matter.id)
        .all<MatterAsset>(),
      env.DB.prepare('SELECT * FROM matter_liabilities WHERE matter_id = ?1 ORDER BY sort_order')
        .bind(matter.id)
        .all<MatterLiability>(),
      env.DB.prepare('SELECT * FROM matter_attachments WHERE matter_id = ?1 ORDER BY sort_order')
        .bind(matter.id)
        .all<MatterAttachment>(),
      env.DB.prepare('SELECT * FROM firm_templates WHERE firm_id = ?1')
        .bind(matter.firm_id)
        .all<FirmTemplate>(),
      // Firm-specific clauses override system clauses of the same key.
      env.DB.prepare(
        `SELECT * FROM clause_library
         WHERE firm_id IS NULL OR firm_id = ?1
         ORDER BY sort_order`,
      )
        .bind(matter.firm_id)
        .all<ClauseLibraryEntry>(),
    ]);

  if (!firm) throw new Error(`Matter ${matter.id} references a firm that no longer exists`);

  const clauseByKey = new Map<string, ClauseLibraryEntry>();
  for (const clause of clauses.results) {
    const existing = clauseByKey.get(clause.key);
    if (!existing || clause.firm_id !== null) clauseByKey.set(clause.key, clause);
  }

  return {
    matter,
    firm,
    branch: branch ?? null,
    attorney: attorney ?? null,
    children: children.results,
    assets: assets.results,
    liabilities: liabilities.results,
    attachments: attachments.results,
    templates: templates.results,
    clauses: [...clauseByKey.values()].sort((a, b) => a.sort_order - b.sort_order),
  };
}
