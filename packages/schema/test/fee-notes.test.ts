import { describe, expect, it } from 'vitest';
import { DEFAULT_VAT_RATE, formatRands, totalFeeNote } from '../src/operations.js';

/**
 * Fee note arithmetic.
 *
 * The trust/business split is a Legal Practice Act requirement, not a presentation
 * choice: client money laid out on disbursements is trust money, professional fees
 * are the firm's own. Getting it wrong is a disciplinary matter.
 */

const line = (over: Partial<Parameters<typeof totalFeeNote>[0][number]> = {}) => ({
  kind: 'fee' as const,
  account: 'business' as const,
  quantity: 1,
  unit_amount: 0,
  vatable: true,
  ...over,
});

describe('totalFeeNote', () => {
  it('adds VAT at the note rate to vatable lines', () => {
    const totals = totalFeeNote([line({ unit_amount: 1000 })], DEFAULT_VAT_RATE, true);
    expect(totals.fees).toBe(1000);
    expect(totals.vat).toBe(150);
    expect(totals.total).toBe(1150);
  });

  it('charges no VAT when the firm is not registered', () => {
    const totals = totalFeeNote([line({ unit_amount: 1000 })], DEFAULT_VAT_RATE, false);
    expect(totals.vat).toBe(0);
    expect(totals.total).toBe(1000);
  });

  it('leaves non-vatable disbursements out of the VAT base', () => {
    // The Sheriff is not a vendor, so their fee carries no VAT output.
    const totals = totalFeeNote(
      [
        line({ unit_amount: 2000 }),
        line({ kind: 'disbursement', account: 'trust', unit_amount: 350, vatable: false }),
      ],
      DEFAULT_VAT_RATE,
      true,
    );
    expect(totals.vatable_base).toBe(2000);
    expect(totals.vat).toBe(300);
    expect(totals.total).toBe(2650);
  });

  it('separates the trust and business ledgers', () => {
    const totals = totalFeeNote(
      [
        line({ unit_amount: 5000 }),
        line({ kind: 'disbursement', account: 'trust', unit_amount: 350, vatable: false }),
        line({ kind: 'disbursement', account: 'trust', unit_amount: 1200, vatable: false }),
      ],
      DEFAULT_VAT_RATE,
      true,
    );
    expect(totals.business).toBe(5000);
    expect(totals.trust).toBe(1550);
    expect(totals.fees).toBe(5000);
    expect(totals.disbursements).toBe(1550);
    // Every line lands in exactly one ledger.
    expect(totals.business + totals.trust).toBe(totals.fees + totals.disbursements);
  });

  it('multiplies quantity by unit amount', () => {
    const totals = totalFeeNote(
      [line({ quantity: 3.5, unit_amount: 1200 })],
      DEFAULT_VAT_RATE,
      true,
    );
    expect(totals.fees).toBe(4200);
  });

  it('does not accumulate floating-point drift across many lines', () => {
    const lines = Array.from({ length: 100 }, () => line({ unit_amount: 0.07 }));
    const totals = totalFeeNote(lines, DEFAULT_VAT_RATE, true);
    expect(totals.fees).toBe(7);
    expect(totals.total).toBe(8.05);
  });

  it('totals an empty note to zero rather than NaN', () => {
    const totals = totalFeeNote([], DEFAULT_VAT_RATE, true);
    expect(totals).toMatchObject({ fees: 0, disbursements: 0, vat: 0, total: 0 });
  });

  it('honours a rate other than the current 15%', () => {
    // The SA rate has changed before; historical notes must keep their own rate.
    const totals = totalFeeNote([line({ unit_amount: 1000 })], 14, true);
    expect(totals.vat).toBe(140);
  });
});

/**
 * Money formatting must not depend on the runtime's locale data. `toLocaleString`
 * resolved 'en-ZA' to US formatting inside workerd while giving SA formatting in Node
 * and browsers, so the same fee note read "R5,400.00" in the PDF and "R5 400,00" on
 * screen.
 */
describe('formatRands', () => {
  it('uses South African convention: space thousands, comma cents', () => {
    expect(formatRands(5400)).toBe('R5 400,00');
    expect(formatRands(350)).toBe('R350,00');
    expect(formatRands(6560)).toBe('R6 560,00');
  });

  it('groups every three digits', () => {
    expect(formatRands(1234567.89)).toBe('R1 234 567,89');
  });

  it('always shows cents', () => {
    expect(formatRands(0)).toBe('R0,00');
    expect(formatRands(7)).toBe('R7,00');
    expect(formatRands(7.5)).toBe('R7,50');
  });

  it('rounds to the cent rather than truncating', () => {
    expect(formatRands(0.005)).toBe('R0,01');
    expect(formatRands(1.005)).toBe('R1,01');
  });

  it('handles a negative amount, as a credit note would carry', () => {
    expect(formatRands(-1500)).toBe('-R1 500,00');
  });

  it('uses a plain space, not a non-breaking one, so text stays searchable', () => {
    expect(formatRands(5400)).not.toContain(' ');
  });
});
