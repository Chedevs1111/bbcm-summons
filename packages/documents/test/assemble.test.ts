import { describe, expect, it } from 'vitest';
import { assembleBundle, assembleDocument, selectTemplate } from '../src/assemble.js';
import { selectClauses } from '../src/clauses.js';
import { STRUCTURAL_TAGS } from '../src/markers.js';
import {
  FIXED_NOW,
  asset,
  attachment,
  baseMatter,
  child,
  liability,
  makeContext,
} from './fixtures.js';

/**
 * Returns any {{TOKEN}} left in a body that is NOT a formatting marker — i.e. a
 * variable that failed to resolve. Structural tags ({{B}}, {{C}}, {{R}} …) are
 * expected to survive substitution; they are consumed later by the parser.
 */
function unresolvedVariables(body: string): string[] {
  return [...body.matchAll(/\{\{(\/?[A-Z_]+)\}\}/g)]
    .map((m) => m[1]!)
    .filter((tag) => !STRUCTURAL_TAGS.has(tag));
}

describe('selectTemplate', () => {
  it('picks the in-community particulars for an in-community marriage', () => {
    const ctx = makeContext({ matter: baseMatter({ marriage_regime: 'in_community' }) });
    expect(selectTemplate(ctx, 'particulars_of_claim')?.name).toBe('In Community Particulars');
  });

  it('picks the accrual particulars for an accrual marriage', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'out_of_community_with_accrual' }),
    });
    expect(selectTemplate(ctx, 'particulars_of_claim')?.name).toBe('Accrual Particulars');
  });

  it('picks the contested summons when the matter is contested', () => {
    const ctx = makeContext({ matter: baseMatter({ is_contested: 1 }) });
    expect(selectTemplate(ctx, 'summons')?.name).toBe('Contested Summons');
  });

  it('picks the uncontested summons otherwise', () => {
    const ctx = makeContext({ matter: baseMatter({ is_contested: 0 }) });
    expect(selectTemplate(ctx, 'summons')?.name).toBe('Standard Combined Summons');
  });

  it('switches settlement template on whether there are children', () => {
    const withKids = makeContext({ children: [child()] });
    const withoutKids = makeContext({ children: [] });
    expect(selectTemplate(withKids, 'settlement_agreement')?.name).toBe(
      'Standard Settlement (Children)',
    );
    expect(selectTemplate(withoutKids, 'settlement_agreement')?.name).toBe(
      'Standard Settlement (No Children)',
    );
  });

  it('returns null when no template matches, rather than guessing', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'out_of_community_without_accrual' }),
    });
    // No particulars template is seeded for the no-accrual regime.
    expect(selectTemplate(ctx, 'particulars_of_claim')).toBeNull();
  });

  it('prefers the more specific template over a general one', () => {
    const ctx = makeContext({ matter: baseMatter({ marriage_regime: 'in_community' }) });
    const templates = [
      ...ctx.templates,
      {
        ...ctx.templates[0]!,
        id: 'tpl-generic',
        name: 'Generic Particulars',
        document_type: 'particulars_of_claim' as const,
        marriage_regime: null,
        is_contested: null,
        has_children: null,
        is_default: 1,
      },
    ];
    expect(selectTemplate({ ...ctx, templates }, 'particulars_of_claim')?.name).toBe(
      'In Community Particulars',
    );
  });
});

describe('clause selection', () => {
  it('includes the joint estate clause only for in-community marriages', () => {
    const inCommunity = selectClauses(makeContext()).map((c) => c.key);
    const accrual = selectClauses(
      makeContext({ matter: baseMatter({ marriage_regime: 'out_of_community_with_accrual' }) }),
    ).map((c) => c.key);

    expect(inCommunity).toContain('joint_estate_dissolution');
    expect(inCommunity).not.toContain('accrual_calculation');
    expect(accrual).toContain('accrual_calculation');
    expect(accrual).not.toContain('joint_estate_dissolution');
  });

  it('gates children clauses on there being children', () => {
    expect(selectClauses(makeContext({ children: [] })).map((c) => c.key)).not.toContain(
      'primary_residence',
    );
    expect(selectClauses(makeContext({ children: [child()] })).map((c) => c.key)).toContain(
      'primary_residence',
    );
  });

  it('gates relief clauses on the relief actually being claimed', () => {
    const claimed = selectClauses(
      makeContext({
        matter: baseMatter({ forfeiture_claimed: 1, costs_sought: 1, pension_interest_claimed: 1 }),
      }),
    ).map((c) => c.key);
    expect(claimed).toEqual(expect.arrayContaining(['forfeiture', 'cost_order', 'pension_interest']));

    const notClaimed = selectClauses(makeContext()).map((c) => c.key);
    expect(notClaimed).not.toContain('forfeiture');
    expect(notClaimed).not.toContain('cost_order');
  });

  it('gates asset clauses on the asset categories present', () => {
    const keys = selectClauses(
      makeContext({ assets: [asset({ category: 'immovable' }), asset({ id: 'a2', category: 'vehicle' })] }),
    ).map((c) => c.key);
    expect(keys).toContain('immovable_property');
    expect(keys).toContain('vehicle_allocation');
    expect(keys).not.toContain('business_interest');
  });

  it('gates the liabilities clause on there being liabilities', () => {
    expect(selectClauses(makeContext({ liabilities: [liability()] })).map((c) => c.key)).toContain(
      'liabilities',
    );
    expect(selectClauses(makeContext()).map((c) => c.key)).not.toContain('liabilities');
  });
});

describe('assembleDocument', () => {
  it('produces a summons with parties, case number and court heading resolved', () => {
    const doc = assembleDocument(makeContext(), 'summons', { now: FIXED_NOW })!;
    expect(doc.title).toBe('Combined Summons');
    expect(doc.text).toContain('IN THE HIGH COURT OF SOUTH AFRICA');
    expect(doc.text).toContain('(GAUTENG DIVISION, PRETORIA)');
    expect(doc.text).toContain('CASE NO: 12345/2026');
    expect(doc.text).toContain('THANDIWE GRACE MOKOENA');
    expect(doc.text).toContain('SIPHO DANIEL MOKOENA');
    expect(doc.text).toContain('VAN DER MERWE & ASSOCIATES');
    expect(doc.text).toContain('3rd day of August 2026');
    // No unresolved variable may reach a court document.
    expect(unresolvedVariables(doc.body)).toEqual([]);
  });

  it('renders the regional court heading differently', () => {
    const ctx = makeContext({
      matter: baseMatter({
        court_type: 'regional_court',
        court_name: 'Pretoria Regional Court',
        province: 'Gauteng',
      }),
    });
    const doc = assembleDocument(ctx, 'summons', { now: FIXED_NOW })!;
    expect(doc.text).toContain('IN THE REGIONAL COURT FOR THE REGIONAL DIVISION OF GAUTENG');
    expect(doc.text).toContain('HELD AT PRETORIA');
  });

  it('lists children with ages in the particulars', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'in_community' }),
      children: [
        child({ full_name: 'Lerato', dob: '2017-03-20' }),
        child({ id: 'child-2', full_name: 'Kabelo', dob: '2020-11-05', sort_order: 1 }),
      ],
    });
    const doc = assembleDocument(ctx, 'particulars_of_claim', { now: FIXED_NOW })!;
    expect(doc.text).toContain('two minor children');
    expect(doc.text).toContain('Lerato Mokoena');
    expect(doc.text).toContain('born on 20 March 2017');
    expect(doc.text).toContain('presently 9 years of age');
    expect(doc.text).toContain('Kabelo Mokoena');
  });

  it('states "no" children when there are none', () => {
    const doc = assembleDocument(makeContext(), 'particulars_of_claim', { now: FIXED_NOW })!;
    expect(doc.text).toContain('no minor children');
  });

  it('cites the Matrimonial Property Act for an accrual marriage', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'out_of_community_with_accrual' }),
    });
    const doc = assembleDocument(ctx, 'particulars_of_claim', { now: FIXED_NOW })!;
    expect(doc.text).toContain('Matrimonial Property Act 88 of 1984');
    expect(doc.text).toContain('out of community of property with the inclusion of the accrual');
  });

  it('numbers annexures from D in the annexure schedule', () => {
    const ctx = makeContext({
      attachments: [
        attachment({ id: 'a1', document_type: 'payslip', file_name: 'payslip.pdf', sort_order: 0 }),
        attachment({ id: 'a2', document_type: 'title_deed', file_name: 'deed.pdf', sort_order: 1 }),
        attachment({ id: 'a3', document_type: 'pension_document', file_name: 'pension.pdf', sort_order: 2 }),
      ],
    });
    const doc = assembleDocument(ctx, 'annexure_schedule', { now: FIXED_NOW })!;
    expect(doc.text).toContain('"D"');
    expect(doc.text).toContain('"E"');
    expect(doc.text).toContain('"F"');
    expect(doc.text).toContain('Total Annexures: 3');
  });

  it('says so when there are no annexures', () => {
    const doc = assembleDocument(makeContext(), 'annexure_schedule', { now: FIXED_NOW })!;
    expect(doc.text).toContain('[No annexures attached]');
  });

  it('builds an index covering pleadings then annexures', () => {
    const ctx = makeContext({
      children: [child({ birth_cert_attached: 1 })],
      attachments: [attachment({ document_type: 'payslip' })],
    });
    const doc = assembleDocument(ctx, 'index_page', {
      includedDocuments: ['index_page', 'summons', 'particulars_of_claim', 'settlement_agreement'],
      now: FIXED_NOW,
    })!;
    expect(doc.text).toContain('1. Combined Summons');
    expect(doc.text).toContain('2. Particulars of Claim');
    expect(doc.text).toContain('3. Settlement Agreement');
    expect(doc.text).toContain('Annexure "A" — Marriage Certificate');
    expect(doc.text).toContain('Annexure "B" — Identity Documents');
    expect(doc.text).toContain('Annexure "C" — Birth Certificates');
    expect(doc.text).toContain('Annexure "D" — Payslip');
  });

  it('returns null rather than a half-built document when no template matches', () => {
    const ctx = makeContext({ templates: [] });
    expect(assembleDocument(ctx, 'summons', { now: FIXED_NOW })).toBeNull();
  });
});

describe('assembleBundle', () => {
  it('assembles the full uncontested bundle in filing order', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'in_community' }),
      children: [child()],
      attachments: [attachment()],
    });
    const bundle = assembleBundle(
      ctx,
      ['index_page', 'summons', 'particulars_of_claim', 'settlement_agreement', 'annexure_schedule'],
      FIXED_NOW,
    );
    expect(bundle.map((d) => d.document_type)).toEqual([
      'index_page',
      'summons',
      'particulars_of_claim',
      'settlement_agreement',
      'annexure_schedule',
    ]);
    for (const doc of bundle) {
      expect(unresolvedVariables(doc.body), `${doc.document_type} has unresolved variables`).toEqual([]);
      expect(doc.html.length).toBeGreaterThan(0);
    }
  });

  it('skips document types with no matching template instead of failing the bundle', () => {
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'out_of_community_without_accrual' }),
    });
    const bundle = assembleBundle(ctx, ['summons', 'particulars_of_claim'], FIXED_NOW);
    expect(bundle.map((d) => d.document_type)).toEqual(['summons']);
  });
});

/**
 * Golden-file coverage across the selection matrix the original app supported:
 * regime × contested × children.
 */
describe('template selection matrix', () => {
  const regimes = [
    'in_community',
    'out_of_community_with_accrual',
    'out_of_community_without_accrual',
    'customary',
  ] as const;

  for (const regime of regimes) {
    for (const contested of [0, 1] as const) {
      for (const hasChildren of [false, true]) {
        it(`${regime} / ${contested ? 'contested' : 'uncontested'} / ${
          hasChildren ? 'children' : 'no children'
        } assembles without unresolved tokens`, () => {
          const ctx = makeContext({
            matter: baseMatter({ marriage_regime: regime, is_contested: contested }),
            children: hasChildren ? [child()] : [],
          });
          const bundle = assembleBundle(
            ctx,
            ['summons', 'particulars_of_claim', 'settlement_agreement'],
            FIXED_NOW,
          );
          // A summons always exists; particulars depend on a regime template being seeded.
          expect(bundle.length).toBeGreaterThan(0);
          for (const doc of bundle) {
            expect(unresolvedVariables(doc.body)).toEqual([]);
            expect(doc.text.trim().length).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
