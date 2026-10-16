import { describe, expect, it } from 'vitest';
import { assembleDocument } from '../src/assemble.js';
import { FIXED_NOW, baseMatter, child, makeContext } from './fixtures.js';

/**
 * The original template read "There are {{NUMBER_OF_CHILDREN}} minor children",
 * which renders "There are one minor children" for a single child — a grammatical
 * error in a filed pleading. The seeded templates now use CHILDREN_VERB/CHILDREN_NOUN.
 */
describe('children sentence agreement', () => {
  const particularsFor = (count: number) => {
    const children = Array.from({ length: count }, (_, i) =>
      child({ id: `child-${i}`, full_name: `Child ${i + 1}`, sort_order: i }),
    );
    const ctx = makeContext({
      matter: baseMatter({ marriage_regime: 'in_community' }),
      children,
    });
    return assembleDocument(ctx, 'particulars_of_claim', { now: FIXED_NOW })!.text;
  };

  it('uses singular agreement for one child', () => {
    const text = particularsFor(1);
    expect(text).toContain('There is one minor child born of the marriage');
    expect(text).not.toContain('one minor children');
  });

  it('uses plural agreement for two children', () => {
    expect(particularsFor(2)).toContain('There are two minor children born of the marriage');
  });

  it('uses plural agreement for none', () => {
    expect(particularsFor(0)).toContain('There are no minor children born of the marriage');
  });

  it('agrees in the settlement agreement too', () => {
    const ctx = makeContext({ children: [child()] });
    const text = assembleDocument(ctx, 'settlement_agreement', { now: FIXED_NOW })!.text;
    expect(text).toContain('There is one minor child of the marriage');
  });
});
