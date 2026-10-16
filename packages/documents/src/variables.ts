import {
  MARRIAGE_REGIME_PHRASES,
  MARRIAGE_TYPE_LABELS,
  type MarriageRegime,
  type MarriageType,
} from '@bbcm/schema';
import type { MatterContext } from './types.js';

/** Formats an ISO date as the long form used in SA pleadings: "14 February 2015". */
export function formatLongDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "this 3rd day of August 2026" — the DATED-at form. */
export function formatDatedAt(date = new Date()): string {
  const day = date.getUTCDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd'
    : 'th';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${day}${suffix} day of ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function ageFrom(dob: string, at = new Date()): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = at.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

// Re-exported so document code keeps a local name, with one definition behind it.
export { formatRands } from '@bbcm/schema';

const NUMBER_WORDS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
];

export function numberToWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Builds the court heading block.
 *
 * High Court:      IN THE HIGH COURT OF SOUTH AFRICA
 *                  (GAUTENG DIVISION, PRETORIA)
 *
 * Regional Court:  IN THE REGIONAL COURT FOR THE REGIONAL DIVISION OF GAUTENG
 *                  HELD AT PRETORIA
 */
export function buildCourtHeading(matter: MatterContext['matter']): string {
  if (matter.court_type === 'regional_court') {
    const seat = matter.court_name.replace(/\s*Regional Court\s*$/i, '').trim();
    return [
      `IN THE REGIONAL COURT FOR THE REGIONAL DIVISION OF ${matter.province.toUpperCase()}`,
      `HELD AT ${seat.toUpperCase()}`,
    ].join('\n');
  }
  return ['IN THE HIGH COURT OF SOUTH AFRICA', `(${matter.court_name.toUpperCase()})`].join('\n');
}

/** The in-sentence court reference, e.g. "the above Honourable High Court…". */
export function buildCourtCitation(matter: MatterContext['matter']): string {
  if (matter.court_type === 'regional_court') {
    return `the above Honourable Regional Court for the Regional Division of ${matter.province}`;
  }
  const division = matter.court_name.replace(/,.*$/, '').trim();
  return `the above Honourable High Court of South Africa, ${division}`;
}

/** The town the document is signed at — the court seat. */
export function courtLocation(matter: MatterContext['matter']): string {
  const parts = matter.court_name.split(',');
  const last = parts[parts.length - 1] ?? '';
  return last.replace(/Regional Court/i, '').trim() || matter.province;
}

function fullName(names: string, surname: string): string {
  return [names, surname].filter(Boolean).join(' ').trim();
}

function genderNoun(gender: string): string {
  if (gender === 'female') return 'female';
  if (gender === 'male') return 'male';
  return 'adult person';
}

/** Renders the numbered list of minor children used by {{CHILDREN_LIST}}. */
export function buildChildrenList(ctx: MatterContext, clauseNumber = 4): string {
  if (ctx.children.length === 0) return '   None.';
  return ctx.children
    .map((child, index) => {
      const name = fullName(child.full_name, child.surname || ctx.matter.plaintiff_surname);
      const age = ageFrom(child.dob);
      const bits = [`${clauseNumber}.${index + 1} ${name}`];
      if (child.dob) bits.push(`born on ${formatLongDate(child.dob)}`);
      if (child.id_number) bits.push(`ID No ${child.id_number}`);
      if (age !== null) bits.push(`presently ${age} years of age`);
      return `   ${bits.join(', ')};`;
    })
    .join('\n');
}

/**
 * Builds the full {{VARIABLE}} substitution map for a matter.
 * Keys match the Template Designer's variable palette exactly.
 */
export function buildVariables(ctx: MatterContext, now = new Date()): Record<string, string> {
  const { matter, firm } = ctx;
  const regime = matter.marriage_regime as MarriageRegime;
  const marriageType = matter.marriage_type as MarriageType;

  return {
    // Court & case
    COURT_HEADING: buildCourtHeading(matter),
    COURT_NAME: matter.court_name,
    COURT_LOCATION: courtLocation(matter),
    CASE_NUMBER: matter.case_number || '______________',
    PROVINCE: matter.province,
    CITE: buildCourtCitation(matter),

    // Plaintiff
    PLAINTIFF_FULL_NAME: fullName(matter.plaintiff_full_names, matter.plaintiff_surname).toUpperCase(),
    PLAINTIFF_SURNAME: matter.plaintiff_surname,
    PLAINTIFF_NAMES: matter.plaintiff_full_names,
    PLAINTIFF_ID: matter.plaintiff_id_number || matter.plaintiff_passport,
    PLAINTIFF_ADDRESS: matter.plaintiff_physical_address,
    PLAINTIFF_OCCUPATION: matter.plaintiff_occupation,
    PLAINTIFF_GENDER: genderNoun(matter.plaintiff_gender),

    // Defendant
    DEFENDANT_FULL_NAME: fullName(matter.defendant_full_names, matter.defendant_surname).toUpperCase(),
    DEFENDANT_SURNAME: matter.defendant_surname,
    DEFENDANT_NAMES: matter.defendant_full_names,
    DEFENDANT_ID: matter.defendant_id_number || matter.defendant_passport,
    DEFENDANT_ADDRESS: matter.defendant_physical_address,
    DEFENDANT_OCCUPATION: matter.defendant_occupation,
    DEFENDANT_GENDER: genderNoun(matter.defendant_gender),

    // Marriage
    MARRIAGE_DATE: formatLongDate(matter.marriage_date),
    MARRIAGE_PLACE: matter.marriage_place,
    MARRIAGE_REGIME: MARRIAGE_REGIME_PHRASES[regime] ?? matter.marriage_regime,
    MARRIAGE_TYPE: MARRIAGE_TYPE_LABELS[marriageType] ?? matter.marriage_type,

    // Children & date
    NUMBER_OF_CHILDREN: numberToWords(ctx.children.length),
    // The original template read "There are {{NUMBER_OF_CHILDREN}} minor children",
    // which produces "There are one minor children" for a single child. These two
    // tokens let a template stay grammatical at any count without hard-coding it.
    CHILDREN_VERB: ctx.children.length === 1 ? 'is' : 'are',
    CHILDREN_NOUN: ctx.children.length === 1 ? 'child' : 'children',
    CHILDREN_LIST: buildChildrenList(ctx),
    TODAY: formatDatedAt(now),

    // Firm
    FIRM_NAME: firm.name.toUpperCase(),
    FIRM_ADDRESS: [firm.address, firm.city, firm.province].filter(Boolean).join('\n'),
  };
}
