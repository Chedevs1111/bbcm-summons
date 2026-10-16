/**
 * The formatting-marker grammar used by BBCM Summons templates.
 *
 * Recovered verbatim from the original DivorceSummons AI bundle so the eight seeded
 * firm templates parse unchanged:
 *
 *   {{B}}…{{/B}}   bold          {{C}}…{{/C}}   centre the line
 *   {{I}}…{{/I}}   italic        {{R}}…{{/R}}   push to the right margin
 *   {{U}}…{{/U}}   underline
 *   {{TABLE}}{{TR}}{{TD}}…{{/TD}}{{/TR}}{{/TABLE}}   signature blocks
 *
 * A line consisting only of ═ becomes a double rule, only of ─ a single rule, and
 * only of _ a signature line — matching the Template Designer's rule buttons.
 *
 * {{R}} is a tab stop rather than a block alignment: in the Summons heading the same
 * line carries the party name on the left and "PLAINTIFF" on the right. Parsing keeps
 * left and right runs separate so both that case and a whole-line right alignment work.
 */

export type Mark = 'bold' | 'italic' | 'underline';
export type Align = 'left' | 'center' | 'right';

export interface Run {
  text: string;
  marks: Mark[];
}

export interface Paragraph {
  type: 'paragraph';
  align: Align;
  /** Content before any {{R}}. */
  runs: Run[];
  /** Content inside {{R}}…{{/R}}, rendered flush right on the same line. */
  rightRuns: Run[];
}

export interface Rule {
  type: 'rule';
  style: 'single' | 'double' | 'signature';
}

export interface TableCell {
  blocks: Block[];
}

export interface TableRow {
  cells: TableCell[];
}

export interface Table {
  type: 'table';
  rows: TableRow[];
}

export type Block = Paragraph | Rule | Table;

export interface DocumentAst {
  blocks: Block[];
}

const MARK_TAGS: Record<string, Mark> = { B: 'bold', I: 'italic', U: 'underline' };

/** Tags that are structure, not data — variable substitution must never touch these. */
export const STRUCTURAL_TAGS = new Set([
  'B', '/B', 'I', '/I', 'U', '/U', 'C', '/C', 'R', '/R',
  'TABLE', '/TABLE', 'TR', '/TR', 'TD', '/TD',
]);

const TAG_RE = /\{\{(\/?[A-Z_]+)\}\}/g;

/**
 * Substitutes {{VARIABLE}} tokens from `values`.
 *
 * Values are sanitised of `{{`/`}}` before insertion: party names and addresses come
 * from user input and OCR, and must not be able to inject formatting markers into a
 * court document. Unknown tokens are left in place so template authors can see them.
 */
export function substituteVariables(body: string, values: Record<string, string>): string {
  return body.replace(TAG_RE, (match, tag: string) => {
    if (STRUCTURAL_TAGS.has(tag)) return match;
    if (!(tag in values)) return match;
    return String(values[tag] ?? '').replace(/\{\{|\}\}/g, '');
  });
}

function isRuleLine(line: string): Rule | null {
  const t = line.trim();
  if (t.length < 3) return null;
  if (/^═+$/.test(t)) return { type: 'rule', style: 'double' };
  if (/^[─—-]+$/.test(t)) return { type: 'rule', style: 'single' };
  if (/^_+$/.test(t)) return { type: 'rule', style: 'signature' };
  return null;
}

/**
 * Formatting state that survives a line break.
 *
 * A marker opened on one line and closed on a later one must apply to everything in
 * between. This matters in practice because {{COURT_HEADING}} expands to two lines
 * inside a single {{C}}…{{/C}} wrapper — without carrying state, the division line
 * ("(GAUTENG DIVISION, PRETORIA)") fell back to the left margin instead of sitting
 * centred under the court name.
 */
interface MarkerState {
  marks: Mark[];
  align: Align;
  inRight: boolean;
}

function freshState(): MarkerState {
  return { marks: [], align: 'left', inRight: false };
}

/** Parses one line's inline markers, mutating the carried state as it goes. */
function parseLine(line: string, state: MarkerState): Paragraph {
  const left: Run[] = [];
  const right: Run[] = [];
  const marks: Mark[] = state.marks;
  let align: Align = state.align;
  let inRight = state.inRight;
  let buffer = '';
  // The alignment in force when this line's content was written. Reading `align` at
  // the end would misread "{{C}}X{{/C}}" as left-aligned, because {{/C}} has already
  // restored the default by then.
  let contentAlign: Align | null = null;

  const flush = () => {
    if (!buffer) return;
    if (contentAlign === null) contentAlign = align;
    (inRight ? right : left).push({ text: buffer, marks: [...marks] });
    buffer = '';
  };

  let i = 0;
  while (i < line.length) {
    const match = /^\{\{(\/?[A-Z_]+)\}\}/.exec(line.slice(i));
    if (match && STRUCTURAL_TAGS.has(match[1]!)) {
      const tag = match[1]!;
      flush();
      if (tag === 'C') align = 'center';
      else if (tag === '/C') align = 'left';
      else if (tag === 'R') inRight = true;
      else if (tag === '/R') inRight = false;
      else if (tag in MARK_TAGS) marks.push(MARK_TAGS[tag]!);
      else if (tag.startsWith('/') && MARK_TAGS[tag.slice(1)]) {
        const m = MARK_TAGS[tag.slice(1)]!;
        const idx = marks.lastIndexOf(m);
        if (idx !== -1) marks.splice(idx, 1);
      }
      i += match[0].length;
      continue;
    }
    buffer += line[i];
    i += 1;
  }
  flush();

  state.marks = marks;
  state.align = align;
  state.inRight = inRight;

  // A line that is nothing but {{R}}…{{/R}} is a right-aligned paragraph.
  if (left.length === 0 && right.length > 0) {
    return { type: 'paragraph', align: 'right', runs: right, rightRuns: [] };
  }
  return { type: 'paragraph', align: contentAlign ?? align, runs: left, rightRuns: right };
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const state = freshState();
  for (const line of source.split('\n')) {
    const rule = isRuleLine(line);
    if (rule) {
      blocks.push(rule);
      continue;
    }
    blocks.push(parseLine(line, state));
  }
  return blocks;
}

/** Parses a template body (after variable substitution) into a renderable AST. */
export function parseDocument(body: string): DocumentAst {
  const blocks: Block[] = [];
  const tableRe = /\{\{TABLE\}\}([\s\S]*?)\{\{\/TABLE\}\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tableRe.exec(body)) !== null) {
    if (match.index > cursor) {
      blocks.push(...parseBlocks(body.slice(cursor, match.index)));
    }
    blocks.push(parseTable(match[1]!));
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    blocks.push(...parseBlocks(body.slice(cursor)));
  }

  return { blocks: trimBlankEdges(blocks) };
}

function parseTable(inner: string): Table {
  const rows: TableRow[] = [];
  const rowRe = /\{\{TR\}\}([\s\S]*?)\{\{\/TR\}\}/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(inner)) !== null) {
    const cells: TableCell[] = [];
    const cellRe = /\{\{TD\}\}([\s\S]*?)\{\{\/TD\}\}/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]!)) !== null) {
      cells.push({ blocks: trimBlankEdges(parseBlocks(cellMatch[1]!)) });
    }
    if (cells.length > 0) rows.push({ cells });
  }
  return { type: 'table', rows };
}

function isBlank(block: Block): boolean {
  return (
    block.type === 'paragraph' &&
    block.runs.every((r) => r.text.trim() === '') &&
    block.rightRuns.every((r) => r.text.trim() === '')
  );
}

function trimBlankEdges(blocks: Block[]): Block[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && isBlank(blocks[start]!)) start += 1;
  while (end > start && isBlank(blocks[end - 1]!)) end -= 1;
  return blocks.slice(start, end);
}

/** Flattens an AST back to plain text — used for copy-to-clipboard and golden tests. */
export function renderPlainText(ast: DocumentAst, width = 80): string {
  const lines: string[] = [];

  const runsText = (runs: Run[]) => runs.map((r) => r.text).join('');

  const renderBlock = (block: Block) => {
    if (block.type === 'rule') {
      const char = block.style === 'double' ? '═' : block.style === 'single' ? '─' : '_';
      lines.push(char.repeat(width));
      return;
    }
    if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) cell.blocks.forEach(renderBlock);
        lines.push('');
      }
      return;
    }
    const leftText = runsText(block.runs);
    const rightText = runsText(block.rightRuns);
    if (rightText) {
      const gap = Math.max(1, width - leftText.length - rightText.length);
      lines.push(leftText + ' '.repeat(gap) + rightText);
      return;
    }
    if (block.align === 'center') {
      const pad = Math.max(0, Math.floor((width - leftText.length) / 2));
      lines.push(' '.repeat(pad) + leftText);
      return;
    }
    if (block.align === 'right') {
      const pad = Math.max(0, width - leftText.length);
      lines.push(' '.repeat(pad) + leftText);
      return;
    }
    lines.push(leftText);
  };

  ast.blocks.forEach(renderBlock);
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runsHtml(runs: Run[]): string {
  if (runs.length === 0) return '&nbsp;';
  return runs
    .map((run) => {
      let html = escapeHtml(run.text).replace(/ {2}/g, ' &nbsp;');
      if (run.marks.includes('bold')) html = `<strong>${html}</strong>`;
      if (run.marks.includes('italic')) html = `<em>${html}</em>`;
      if (run.marks.includes('underline')) html = `<u>${html}</u>`;
      return html;
    })
    .join('');
}

/** Renders the AST to A4 HTML — used for the live preview, printing and PDF export. */
export function renderHtml(ast: DocumentAst): string {
  const renderBlock = (block: Block): string => {
    if (block.type === 'rule') {
      return `<hr class="rule rule--${block.style}" />`;
    }
    if (block.type === 'table') {
      const rows = block.rows
        .map((row) => {
          const cells = row.cells
            .map((cell) => `<td>${cell.blocks.map(renderBlock).join('')}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table class="sig-table">${rows}</table>`;
    }
    if (block.rightRuns.length > 0 && block.runs.length > 0) {
      return `<p class="line line--split"><span>${runsHtml(block.runs)}</span><span>${runsHtml(
        block.rightRuns,
      )}</span></p>`;
    }
    return `<p class="line line--${block.align}">${runsHtml(block.runs)}</p>`;
  };

  return ast.blocks.map(renderBlock).join('\n');
}

/** Convenience: substitute, parse and render in one call. */
export function renderTemplate(
  body: string,
  values: Record<string, string>,
): { ast: DocumentAst; html: string; text: string } {
  const ast = parseDocument(substituteVariables(body, values));
  return { ast, html: renderHtml(ast), text: renderPlainText(ast) };
}
