import { isValidSaIdNumber, parseSaIdNumber } from '@bbcm/schema';
import { describe, expect, it } from 'vitest';
import { baseMatter, child } from './fixtures.js';

/**
 * The fixtures stand in for real SA identity documents. If one stops being a
 * structurally valid ID the wizard would reject it in the browser while the unit
 * tests kept passing, which is exactly how the first bad fixture slipped through.
 */
describe('fixture ID numbers are structurally valid', () => {
  const matter = baseMatter();

  it('the plaintiff ID passes the Luhn check', () => {
    expect(isValidSaIdNumber(matter.plaintiff_id_number)).toBe(true);
  });

  it('the defendant ID passes the Luhn check', () => {
    expect(isValidSaIdNumber(matter.defendant_id_number)).toBe(true);
  });

  it('each ID encodes the gender and date of birth the fixture claims', () => {
    expect(parseSaIdNumber(matter.plaintiff_id_number)).toEqual({
      dob: matter.plaintiff_dob,
      gender: matter.plaintiff_gender,
    });
    expect(parseSaIdNumber(matter.defendant_id_number)).toEqual({
      dob: matter.defendant_dob,
      gender: matter.defendant_gender,
    });
  });

  it('rejects an ID with a bad check digit', () => {
    expect(isValidSaIdNumber('8801015009087')).toBe(false);
  });

  it('leaves the child fixture ID blank rather than inventing one', () => {
    expect(child().id_number).toBe('');
  });
});
