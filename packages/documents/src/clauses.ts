/**
 * The system clause library.
 *
 * Each clause carries a `condition` key. A clause is included in a generated document
 * only when its condition evaluates true against the matter — this is what makes the
 * output regime-aware (accrual vs in-community), children-aware and relief-aware.
 *
 * Clause bodies use the same {{VARIABLE}} palette as templates and are statute-cited
 * per the Divorce Act 70 of 1979, the Matrimonial Property Act 88 of 1984 and the
 * Children's Act 38 of 2005.
 */

import type { MatterContext } from './types.js';
import { formatRands } from './variables.js';

export type ClauseCondition =
  | 'always'
  | 'in_community'
  | 'out_of_community'
  | 'accrual'
  | 'no_accrual'
  | 'customary'
  | 'civil_union'
  | 'has_children'
  | 'no_children'
  | 'child_maintenance_claimed'
  | 'spousal_maintenance_claimed'
  | 'pension_claimed'
  | 'has_property'
  | 'has_vehicles'
  | 'has_business'
  | 'has_bank_accounts'
  | 'has_liabilities'
  | 'forfeiture_claimed'
  | 'costs_sought'
  | 'is_contested';

export interface SystemClause {
  key: string;
  title: string;
  category: 'Property' | 'Children' | 'Maintenance' | 'Pension' | 'Relief' | 'General';
  condition: ClauseCondition;
  sort_order: number;
  body: string;
}

/** Evaluates a clause condition against the matter. */
export function evaluateCondition(condition: string, ctx: MatterContext): boolean {
  const m = ctx.matter;
  const hasCategory = (category: string) => ctx.assets.some((a) => a.category === category);

  switch (condition as ClauseCondition) {
    case 'always':
      return true;
    case 'in_community':
      return m.marriage_regime === 'in_community';
    case 'out_of_community':
      return m.marriage_regime.startsWith('out_of_community');
    case 'accrual':
      return m.marriage_regime === 'out_of_community_with_accrual';
    case 'no_accrual':
      return m.marriage_regime === 'out_of_community_without_accrual';
    case 'customary':
      return m.marriage_type === 'customary' || m.marriage_regime === 'customary';
    case 'civil_union':
      return m.marriage_type === 'civil_union';
    case 'has_children':
      return ctx.children.length > 0;
    case 'no_children':
      return ctx.children.length === 0;
    case 'child_maintenance_claimed':
      return m.child_maintenance_claimed > 0;
    case 'spousal_maintenance_claimed':
      return m.spousal_maintenance_claimed > 0;
    case 'pension_claimed':
      return m.pension_interest_claimed === 1;
    case 'has_property':
      return hasCategory('immovable');
    case 'has_vehicles':
      return hasCategory('vehicle');
    case 'has_business':
      return hasCategory('business');
    case 'has_bank_accounts':
      return hasCategory('investment');
    case 'has_liabilities':
      return ctx.liabilities.length > 0;
    case 'forfeiture_claimed':
      return m.forfeiture_claimed === 1;
    case 'costs_sought':
      return m.costs_sought === 1;
    case 'is_contested':
      return m.is_contested === 1;
    default:
      return false;
  }
}

export const SYSTEM_CLAUSES: SystemClause[] = [
  {
    key: 'joint_estate_dissolution',
    title: 'Joint Estate Dissolution',
    category: 'Property',
    condition: 'in_community',
    sort_order: 10,
    body: 'The parties are married to each other in community of property. Upon dissolution of the marriage the joint estate shall be divided equally between the parties, each party being entitled to one half share of the nett value of the joint estate.',
  },
  {
    key: 'accrual_calculation',
    title: 'Accrual Calculation',
    category: 'Property',
    condition: 'accrual',
    sort_order: 11,
    body: 'The parties are married out of community of property with the inclusion of the accrual system in terms of Chapter 1 of the Matrimonial Property Act 88 of 1984. At the dissolution of the marriage the party whose estate shows the smaller accrual is entitled to claim from the other party an amount equal to one half of the difference between the accrual of the respective estates, calculated in accordance with section 4 of the said Act.',
  },
  {
    key: 'no_accrual_separation',
    title: 'Complete Separation of Estates',
    category: 'Property',
    condition: 'no_accrual',
    sort_order: 12,
    body: 'The parties are married out of community of property with the exclusion of the accrual system by virtue of an antenuptial contract duly registered in the Deeds Office. Each party shall retain his or her own separate estate and neither party shall have any claim against the estate of the other.',
  },
  {
    key: 'customary_marriage',
    title: 'Customary Marriage Provisions',
    category: 'General',
    condition: 'customary',
    sort_order: 13,
    body: 'The parties entered into and concluded a customary marriage in terms of the Recognition of Customary Marriages Act 120 of 1998, which marriage was entered into in accordance with the customs and usages traditionally observed among the communities to which the parties belong, and which marriage continues to subsist between the parties as at the date of the institution of this action.',
  },
  {
    key: 'civil_union',
    title: 'Civil Union Provisions',
    category: 'General',
    condition: 'civil_union',
    sort_order: 14,
    body: 'The parties concluded a civil union in terms of the Civil Union Act 17 of 2006, which civil union has the same legal consequences as a marriage contemplated in the Marriage Act 25 of 1961 and continues to subsist between the parties.',
  },
  {
    key: 'children_details',
    title: 'Children Details',
    category: 'Children',
    condition: 'has_children',
    sort_order: 20,
    body: 'There {{CHILDREN_VERB}} {{NUMBER_OF_CHILDREN}} minor {{CHILDREN_NOUN}} born of the marriage between the parties, namely:\n{{CHILDREN_LIST}}',
  },
  {
    key: 'parental_responsibilities',
    title: 'Parental Responsibilities and Rights',
    category: 'Children',
    condition: 'has_children',
    sort_order: 21,
    body: 'Both parties shall retain full parental responsibilities and rights in respect of the minor children as contemplated in section 18 of the Children’s Act 38 of 2005, including the responsibility and right to care for the children, to maintain contact with them, to act as their guardian and to contribute to their maintenance.',
  },
  {
    key: 'primary_residence',
    title: 'Primary Residence',
    category: 'Children',
    condition: 'has_children',
    sort_order: 22,
    body: 'The primary residence of the minor children shall vest with the Plaintiff, subject to the Defendant’s rights of reasonable contact as set out below, it being recorded that this arrangement is in the best interests of the minor children as contemplated in section 7 of the Children’s Act 38 of 2005.',
  },
  {
    key: 'contact_rights',
    title: 'Contact Rights',
    category: 'Children',
    condition: 'has_children',
    sort_order: 23,
    body: 'The Defendant shall be entitled to reasonable contact with the minor children, which contact shall include every alternate weekend from Friday at 18h00 until Sunday at 18h00, alternate short school holidays, one half of every long school holiday, and reasonable telephonic and electronic contact at all reasonable times.',
  },
  {
    key: 'family_advocate',
    title: 'Family Advocate Referral',
    category: 'Children',
    condition: 'has_children',
    sort_order: 24,
    body: 'The arrangements set out herein regarding the care of and contact with the minor children shall be referred to the Office of the Family Advocate for investigation and report in terms of section 4 of the Mediation in Certain Divorce Matters Act 24 of 1987.',
  },
  {
    key: 'child_maintenance',
    title: 'Child Maintenance',
    category: 'Maintenance',
    condition: 'child_maintenance_claimed',
    sort_order: 30,
    body: 'The Defendant shall pay maintenance in respect of each minor child in the sum of {{CHILD_MAINTENANCE_AMOUNT}} per month per child, payable on or before the first day of each month, free of deduction or set-off, into a bank account nominated by the Plaintiff, such maintenance to escalate annually on the anniversary of the date of divorce by a percentage equal to the Consumer Price Index as published by Statistics South Africa.',
  },
  {
    key: 'child_maintenance_ancillary',
    title: 'Ancillary Child Expenses',
    category: 'Maintenance',
    condition: 'child_maintenance_claimed',
    sort_order: 31,
    body: 'In addition to the cash maintenance payable above, the Defendant shall retain the minor children as dependants on a registered medical aid scheme and shall be liable for all reasonable medical, dental, ophthalmic, orthodontic, pharmaceutical, hospital and surgical expenses not covered by such scheme, together with all school fees, prescribed school uniforms, books and reasonable extra-mural expenses.',
  },
  {
    key: 'spousal_maintenance',
    title: 'Spousal Maintenance',
    category: 'Maintenance',
    condition: 'spousal_maintenance_claimed',
    sort_order: 32,
    body: 'The Defendant shall pay maintenance to the Plaintiff in the sum of {{SPOUSAL_MAINTENANCE_AMOUNT}} per month, payable on or before the first day of each month, such maintenance to terminate upon the death or remarriage of the Plaintiff, whichever occurs first, as contemplated in section 7(2) of the Divorce Act 70 of 1979.',
  },
  {
    key: 'pension_interest',
    title: 'Pension Interest (s7(7)(a))',
    category: 'Pension',
    condition: 'pension_claimed',
    sort_order: 40,
    body: 'The pension interest of the Defendant in the {{DEFENDANT_PENSION_FUND}} shall, for the purposes of determining the patrimonial benefits to which the parties may be entitled, be deemed to be part of the assets of the Defendant’s estate in terms of section 7(7)(a) of the Divorce Act 70 of 1979.',
  },
  {
    key: 'pension_endorsement',
    title: 'Pension Fund Endorsement (s7(8)(a))',
    category: 'Pension',
    condition: 'pension_claimed',
    sort_order: 41,
    body: 'The Plaintiff is awarded {{PENSION_SHARE_PCT}} of the Defendant’s pension interest as at the date of divorce, and the said fund is ordered in terms of section 7(8)(a) of the Divorce Act 70 of 1979 to endorse its records accordingly and to pay such amount directly to the Plaintiff upon the Plaintiff electing to receive payment thereof.',
  },
  {
    key: 'immovable_property',
    title: 'Immovable Property',
    category: 'Property',
    condition: 'has_property',
    sort_order: 50,
    body: 'The immovable property registered in the names of the parties shall be dealt with as set out in the schedule of assets annexed hereto. The party to whom such property is awarded shall be liable for all costs of transfer and shall take all steps necessary to procure the release of the other party from any mortgage bond registered over the property.',
  },
  {
    key: 'bond_cancellation',
    title: 'Bond Cancellation and Settlement',
    category: 'Property',
    condition: 'has_property',
    sort_order: 51,
    body: 'The party retaining the immovable property shall, within six (6) months of the date of divorce, procure the substitution of the mortgage bond into his or her sole name, failing which the property shall be sold on the open market and the nett proceeds divided in accordance with the matrimonial property regime applicable to the parties.',
  },
  {
    key: 'vehicle_allocation',
    title: 'Vehicle Allocation',
    category: 'Property',
    condition: 'has_vehicles',
    sort_order: 52,
    body: 'Each party shall retain as his or her sole and exclusive property the motor vehicle presently in his or her possession, together with the liability for any instalment sale or finance agreement in respect thereof, and shall take all steps necessary to effect the transfer of registration into his or her name.',
  },
  {
    key: 'business_interest',
    title: 'Business Interest',
    category: 'Property',
    condition: 'has_business',
    sort_order: 53,
    body: 'The business interests held by either party, whether as a sole proprietor, partner, member of a close corporation or shareholder in a company, shall be valued as at the date of divorce by an independent valuer agreed upon between the parties, and shall be dealt with in accordance with the matrimonial property regime applicable to the parties.',
  },
  {
    key: 'bank_accounts',
    title: 'Bank Accounts and Investments',
    category: 'Property',
    condition: 'has_bank_accounts',
    sort_order: 54,
    body: 'Each party shall retain as his or her sole property the bank accounts, investments, policies and other financial instruments held in his or her own name, subject to any adjustment necessary to give effect to the division of the joint estate or the accrual claim, as the case may be.',
  },
  {
    key: 'household_contents',
    title: 'Household Contents',
    category: 'Property',
    condition: 'always',
    sort_order: 55,
    body: 'The parties have already divided the movable household contents and furniture between themselves to their mutual satisfaction, and neither party shall have any further claim against the other in respect thereof.',
  },
  {
    key: 'liabilities',
    title: 'Liabilities',
    category: 'Property',
    condition: 'has_liabilities',
    sort_order: 56,
    body: 'The liabilities of the parties shall be discharged as set out in the schedule of liabilities annexed hereto, and each party indemnifies the other against any claim arising from a liability for which he or she has accepted responsibility.',
  },
  {
    key: 'forfeiture',
    title: 'Forfeiture of Benefits (s9(1))',
    category: 'Relief',
    condition: 'forfeiture_claimed',
    sort_order: 60,
    body: 'The Plaintiff claims an order that the Defendant forfeit the patrimonial benefits of the marriage in community of property in terms of section 9(1) of the Divorce Act 70 of 1979, on the grounds that the Defendant will, if such an order is not made, be unduly benefited having regard to the duration of the marriage, the circumstances which gave rise to its breakdown and any substantial misconduct on the part of the Defendant.',
  },
  {
    key: 'cost_order',
    title: 'Cost Order',
    category: 'Relief',
    condition: 'costs_sought',
    sort_order: 61,
    body: 'The Defendant shall be liable for the costs of this action on the party and party scale, save in the event that the action becomes unopposed, in which event each party shall bear his or her own costs.',
  },
  {
    key: 'irretrievable_breakdown',
    title: 'Irretrievable Breakdown',
    category: 'General',
    condition: 'always',
    sort_order: 70,
    body: 'The marriage relationship between the parties has irretrievably broken down as contemplated in section 4 of the Divorce Act 70 of 1979, in that there is no longer a normal marriage relationship between them and there is no reasonable prospect of the restoration of such a relationship.',
  },
  {
    key: 'consent_clause',
    title: 'Consent to Divorce Provisions',
    category: 'General',
    condition: 'always',
    sort_order: 71,
    body: 'The parties confirm that they have entered into this agreement freely and voluntarily, without any undue influence or duress, that they have each had the opportunity to obtain independent legal advice, and that this agreement shall be made an order of court upon the granting of the decree of divorce.',
  },
];

/** Extra variables that only clause bodies use. */
export function buildClauseVariables(ctx: MatterContext): Record<string, string> {
  const m = ctx.matter;
  const pensionShare = m.defendant_pension_share_pct || m.plaintiff_pension_share_pct;
  return {
    CHILD_MAINTENANCE_AMOUNT: formatRands(m.child_maintenance_claimed),
    SPOUSAL_MAINTENANCE_AMOUNT: formatRands(m.spousal_maintenance_claimed),
    DEFENDANT_PENSION_FUND: m.defendant_pension_fund_name || 'the relevant pension fund',
    PLAINTIFF_PENSION_FUND: m.plaintiff_pension_fund_name || 'the relevant pension fund',
    PENSION_SHARE_PCT: `${pensionShare}%`,
  };
}

/** Returns the clauses applicable to a matter, in sort order. */
export function selectClauses(ctx: MatterContext): typeof ctx.clauses {
  return ctx.clauses
    .filter((clause) => clause.is_active === 1 && evaluateCondition(clause.condition, ctx))
    .sort((a, b) => a.sort_order - b.sort_order);
}
