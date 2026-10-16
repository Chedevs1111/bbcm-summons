import { describe, expect, it } from 'vitest';
import { matterInputSchema } from '../src/matter.js';

/**
 * These two cases both came out of the first end-to-end run of the New Matter
 * wizard, where the browser sent exactly what the form holds and the API rejected it.
 */

/** What the wizard actually posts with every optional field left alone. */
function wizardPayload(overrides: Record<string, unknown> = {}) {
  return {
    attorney_id: '00000000-0000-4000-8000-000000000003',
    branch_id: null,
    case_reference: 'VDM/2026/D/007',
    province: 'Gauteng',
    court_type: 'high_court',
    court_name: 'Gauteng Division, Pretoria',
    marriage_date: '2015-02-14',
    marriage_place: 'Pretoria',
    marriage_type: 'civil',
    marriage_regime: 'in_community',
    plaintiff: {
      full_names: 'Thandiwe Grace',
      surname: 'Mokoena',
      physical_address: '45 Jacaranda Avenue, Arcadia, Pretoria',
    },
    defendant: {
      full_names: 'Sipho Daniel',
      surname: 'Mokoena',
      physical_address: '12 Protea Road, Centurion',
    },
    ...overrides,
  };
}

describe('matterInputSchema', () => {
  it('accepts the wizard payload without a client-supplied firm_id', () => {
    // firm_id comes from the session; requiring it here made the wizard unusable.
    const result = matterInputSchema.safeParse(wizardPayload());
    expect(result.success).toBe(true);
  });

  it('ignores a firm_id the client tries to supply', () => {
    const result = matterInputSchema.parse(
      wizardPayload({ firm_id: '22222222-2222-2222-2222-222222222222' }),
    );
    expect(result).not.toHaveProperty('firm_id');
  });

  it('accepts a blank gender on a party, as an unselected HTML select sends', () => {
    const result = matterInputSchema.safeParse(
      wizardPayload({
        plaintiff: {
          full_names: 'Thandiwe Grace',
          surname: 'Mokoena',
          physical_address: '45 Jacaranda Avenue',
          gender: '',
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a blank gender on a child', () => {
    const result = matterInputSchema.safeParse(
      wizardPayload({
        children: [{ full_name: 'Lerato', surname: 'Mokoena', dob: '2017-03-20', gender: '' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('still rejects a gender that is neither blank nor a known value', () => {
    const result = matterInputSchema.safeParse(
      wizardPayload({
        children: [{ full_name: 'Lerato', gender: 'not-a-gender' }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('still rejects an ID number that fails the checksum', () => {
    const result = matterInputSchema.safeParse(
      wizardPayload({
        plaintiff: {
          full_names: 'Thandiwe Grace',
          surname: 'Mokoena',
          physical_address: '45 Jacaranda Avenue',
          id_number: '8801015009087',
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('still requires the fields a pleading cannot be drafted without', () => {
    for (const missing of ['attorney_id', 'court_name', 'marriage_date', 'marriage_place']) {
      const payload = wizardPayload();
      delete (payload as Record<string, unknown>)[missing];
      expect(matterInputSchema.safeParse(payload).success, `${missing} should be required`).toBe(
        false,
      );
    }
  });
});
