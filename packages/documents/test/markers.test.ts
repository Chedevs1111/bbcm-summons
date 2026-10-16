import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  renderHtml,
  renderPlainText,
  substituteVariables,
} from '../src/markers.js';

describe('substituteVariables', () => {
  it('replaces known tokens and leaves structural tags alone', () => {
    const out = substituteVariables('{{B}}{{PLAINTIFF_SURNAME}}{{/B}}', {
      PLAINTIFF_SURNAME: 'Mokoena',
    });
    expect(out).toBe('{{B}}Mokoena{{/B}}');
  });

  it('leaves unknown tokens in place so template authors can see them', () => {
    expect(substituteVariables('{{NOT_A_VARIABLE}}', {})).toBe('{{NOT_A_VARIABLE}}');
  });

  it('strips marker delimiters from injected values', () => {
    // Party names come from user input and OCR — they must not be able to inject markers.
    const out = substituteVariables('{{PLAINTIFF_NAMES}}', {
      PLAINTIFF_NAMES: 'Eve {{B}}INJECTED{{/B}}',
    });
    expect(out).toBe('Eve BINJECTED/B');
    expect(out).not.toContain('{{');
  });
});

describe('parseDocument', () => {
  it('parses nested inline marks', () => {
    const ast = parseDocument('{{C}}{{B}}{{U}}SUMMONS{{/U}}{{/B}}{{/C}}');
    const block = ast.blocks[0]!;
    expect(block).toMatchObject({ type: 'paragraph', align: 'center' });
    expect(block.type === 'paragraph' && block.runs[0]).toEqual({
      text: 'SUMMONS',
      marks: ['bold', 'underline'],
    });
  });

  it('treats a whole-line {{R}} as a right-aligned paragraph', () => {
    const ast = parseDocument('{{R}}CASE NO: 12345/2026{{/R}}');
    expect(ast.blocks[0]).toMatchObject({ type: 'paragraph', align: 'right' });
  });

  it('treats a mid-line {{R}} as a right tab stop, keeping both sides', () => {
    // The Summons heading puts the party name left and "PLAINTIFF" right on one line.
    const ast = parseDocument('{{B}}T MOKOENA{{/B}}{{R}}{{B}}PLAINTIFF{{/B}}{{/R}}');
    const block = ast.blocks[0]!;
    expect(block.type).toBe('paragraph');
    if (block.type !== 'paragraph') return;
    expect(block.runs[0]!.text).toBe('T MOKOENA');
    expect(block.rightRuns[0]!.text).toBe('PLAINTIFF');
  });

  it('recognises double, single and signature rules', () => {
    const ast = parseDocument(['═'.repeat(10), '─'.repeat(10), '_'.repeat(10)].join('\n'));
    expect(ast.blocks.map((b) => (b.type === 'rule' ? b.style : b.type))).toEqual([
      'double',
      'single',
      'signature',
    ]);
  });

  it('parses the two-cell signature table', () => {
    const ast = parseDocument('{{TABLE}}{{TR}}{{TD}}LEFT{{/TD}}{{TD}}RIGHT{{/TD}}{{/TR}}{{/TABLE}}');
    const table = ast.blocks[0]!;
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]!.cells).toHaveLength(2);
  });
});

describe('renderHtml', () => {
  it('escapes HTML in content', () => {
    const html = renderHtml(parseDocument('Smith & Co <script>alert(1)</script>'));
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders a split line as two spans', () => {
    const html = renderHtml(parseDocument('NAME{{R}}PLAINTIFF{{/R}}'));
    expect(html).toContain('line--split');
    expect(html).toContain('<span>NAME</span>');
  });
});

describe('renderPlainText', () => {
  it('pads a split line out to the page width', () => {
    const text = renderPlainText(parseDocument('NAME{{R}}PLAINTIFF{{/R}}'), 40);
    expect(text).toBe('NAME'.padEnd(40 - 'PLAINTIFF'.length) + 'PLAINTIFF');
    expect(text).toHaveLength(40);
  });

  it('centres a centred line', () => {
    const text = renderPlainText(parseDocument('{{C}}SUMMONS{{/C}}'), 21);
    expect(text).toBe('       SUMMONS');
  });
});

/**
 * {{COURT_HEADING}} expands to two lines inside one {{C}}…{{/C}} wrapper. Before
 * markers carried across line breaks, the division line dropped to the left margin
 * while the court name stayed centred — visible in every generated pleading.
 */
describe('markers spanning line breaks', () => {
  it('centres every line inside a multi-line {{C}} block', () => {
    const ast = parseDocument(
      '{{C}}{{B}}IN THE HIGH COURT OF SOUTH AFRICA\n(GAUTENG DIVISION, PRETORIA){{/B}}{{/C}}',
    );
    const paragraphs = ast.blocks.filter((b) => b.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);
    for (const block of paragraphs) {
      if (block.type !== 'paragraph') continue;
      expect(block.align).toBe('center');
      expect(block.runs[0]!.marks).toContain('bold');
    }
  });

  it('stops applying a marker once it is closed', () => {
    const ast = parseDocument('{{C}}CENTRED{{/C}}\nBACK TO LEFT');
    const [first, second] = ast.blocks;
    expect(first).toMatchObject({ align: 'center' });
    expect(second).toMatchObject({ align: 'left' });
  });

  it('does not leak bold past its closing tag', () => {
    const ast = parseDocument('{{B}}BOLD\nSTILL BOLD{{/B}}\nPLAIN');
    const blocks = ast.blocks.filter((b) => b.type === 'paragraph');
    expect(blocks[0]!.type === 'paragraph' && blocks[0]!.runs[0]!.marks).toContain('bold');
    expect(blocks[1]!.type === 'paragraph' && blocks[1]!.runs[0]!.marks).toContain('bold');
    expect(blocks[2]!.type === 'paragraph' && blocks[2]!.runs[0]!.marks).toEqual([]);
  });
});
