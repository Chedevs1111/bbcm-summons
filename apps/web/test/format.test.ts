import { describe, expect, it } from 'vitest';
import { count, pageRange, statLabel } from '../src/lib/format';

describe('count', () => {
  it('uses the singular for exactly one', () => {
    expect(count(1, 'field')).toBe('1 field');
    expect(count(1, 'document')).toBe('1 document');
  });

  it('uses the plural for everything else', () => {
    expect(count(0, 'field')).toBe('0 fields');
    expect(count(2, 'field')).toBe('2 fields');
    expect(count(12, 'page')).toBe('12 pages');
  });

  /** Adding `s` to "branch" gives "branchs" — the reason the override exists. */
  it('takes an explicit plural for irregular nouns', () => {
    expect(count(1, 'branch', 'branches')).toBe('1 branch');
    expect(count(3, 'branch', 'branches')).toBe('3 branches');
  });
});

describe('statLabel', () => {
  it('uses the singular for exactly one', () => {
    expect(statLabel(1, 'Volumes', 'Volume')).toBe('Volume');
    expect(statLabel(1, 'Items indexed', 'Item indexed')).toBe('Item indexed');
  });

  it('uses the plural for everything else', () => {
    expect(statLabel(0, 'Volumes', 'Volume')).toBe('Volumes');
    expect(statLabel(12, 'Volumes', 'Volume')).toBe('Volumes');
  });

  /**
   * Plenty of tile labels are states, not nouns. Defaulting to the plural means a
   * label with no singular form is left alone instead of growing a stray "s".
   */
  it('leaves a label with no singular form untouched', () => {
    expect(statLabel(1, 'Confirmed')).toBe('Confirmed');
    expect(statLabel(1, 'High confidence')).toBe('High confidence');
    expect(statLabel(3, 'Failed')).toBe('Failed');
  });

  /** The plural goes on the head noun, not the end of the phrase. */
  it('does not assume the s belongs at the end', () => {
    expect(statLabel(2, 'Items indexed', 'Item indexed')).toBe('Items indexed');
    expect(statLabel(2, 'Attempts recorded', 'Attempt recorded')).toBe('Attempts recorded');
  });
});

describe('pageRange', () => {
  it('collapses to a single page when first and last match', () => {
    expect(pageRange(3, 3)).toBe('Page 3');
  });

  it('reads as a range otherwise', () => {
    expect(pageRange(1, 12)).toBe('Pages 1–12');
    expect(pageRange(5, 7)).toBe('Pages 5–7');
  });

  it('uses an en dash, as the bundle index does', () => {
    expect(pageRange(1, 12)).toContain('–');
    expect(pageRange(1, 12)).not.toContain('-');
  });
});
