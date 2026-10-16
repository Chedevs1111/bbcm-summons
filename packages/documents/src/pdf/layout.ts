/**
 * Page layout for court documents.
 *
 * Pure geometry: this module takes a DocumentAst and a text-measuring function and
 * returns positioned lines grouped into pages. It never touches pdf-lib, which keeps
 * it unit-testable and — more importantly — means page breaks are known *before*
 * anything is drawn.
 *
 * That ordering is the whole reason this exists rather than rendering HTML to PDF:
 * the bundle index has to cite the page a document actually starts on, so pagination
 * has to be computable up front rather than discovered after the fact.
 */

import type { Block, DocumentAst, Mark, Run } from '../markers.js';

export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

/** Injected so layout can measure text without depending on a PDF library. */
export interface TextMeasurer {
  widthOf(text: string, style: FontStyle, size: number): number;
}

export interface PageGeometry {
  width: number;
  height: number;
  margin: number;
  fontSize: number;
  /** Baseline-to-baseline distance. */
  lineHeight: number;
}

/** A4 at 12pt with 25.4 mm margins and 1.5 line spacing. */
export const A4: PageGeometry = {
  width: 595.28,
  height: 841.89,
  margin: 72,
  fontSize: 12,
  lineHeight: 18,
};

export interface PositionedRun {
  text: string;
  style: FontStyle;
  underline: boolean;
  x: number;
  width: number;
}

export interface TextLine {
  kind: 'text';
  y: number;
  runs: PositionedRun[];
}

export interface RuleLine {
  kind: 'rule';
  y: number;
  x1: number;
  x2: number;
  /** A double rule draws two hairlines a couple of points apart. */
  double: boolean;
}

export type LaidOutLine = TextLine | RuleLine;

export interface LaidOutPage {
  lines: LaidOutLine[];
}

export function styleFor(marks: Mark[]): FontStyle {
  const bold = marks.includes('bold');
  const italic = marks.includes('italic');
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

interface WordPiece {
  text: string;
  style: FontStyle;
  underline: boolean;
  width: number;
}

/** Splits runs into whitespace-delimited pieces so lines can wrap between words. */
function toPieces(runs: Run[], measurer: TextMeasurer, size: number): WordPiece[] {
  const pieces: WordPiece[] = [];
  for (const run of runs) {
    const style = styleFor(run.marks);
    const underline = run.marks.includes('underline');
    for (const word of run.text.split(/(\s+)/)) {
      if (word === '') continue;
      pieces.push({ text: word, style, underline, width: measurer.widthOf(word, style, size) });
    }
  }
  return pieces;
}

/** Greedy word wrap. Returns one array of pieces per visual line. */
function wrap(pieces: WordPiece[], maxWidth: number): WordPiece[][] {
  const lines: WordPiece[][] = [];
  let current: WordPiece[] = [];
  let width = 0;

  for (const piece of pieces) {
    const isSpace = /^\s+$/.test(piece.text);
    // Never begin a line with the space that followed the previous line's last word.
    if (isSpace && current.length === 0) continue;

    if (width + piece.width > maxWidth && current.length > 0 && !isSpace) {
      lines.push(current);
      current = [piece];
      width = piece.width;
      continue;
    }
    current.push(piece);
    width += piece.width;
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [[]];
}

function totalWidth(pieces: WordPiece[]): number {
  return pieces.reduce((sum, piece) => sum + piece.width, 0);
}

/** Places wrapped pieces at an x offset, producing positioned runs. */
function position(pieces: WordPiece[], startX: number): PositionedRun[] {
  const runs: PositionedRun[] = [];
  let x = startX;
  for (const piece of pieces) {
    runs.push({
      text: piece.text,
      style: piece.style,
      underline: piece.underline,
      x,
      width: piece.width,
    });
    x += piece.width;
  }
  return runs;
}

interface Cursor {
  pages: LaidOutPage[];
  page: LaidOutPage;
  y: number;
}

export interface LayoutResult {
  pages: LaidOutPage[];
}

/**
 * Lays out a parsed document into pages.
 *
 * `reservedTop` leaves room on the first page for a caller-drawn heading (used by the
 * volume cover sheets), and never applies to continuation pages.
 */
export function layoutDocument(
  ast: DocumentAst,
  measurer: TextMeasurer,
  geometry: PageGeometry = A4,
  reservedTop = 0,
): LayoutResult {
  const contentWidth = geometry.width - geometry.margin * 2;
  const top = geometry.height - geometry.margin;
  // The footer carries the running page number, so content stops above it.
  const bottom = geometry.margin * 0.75 + geometry.lineHeight;

  const cursor: Cursor = { pages: [], page: { lines: [] }, y: top - reservedTop };
  cursor.pages.push(cursor.page);

  const newPage = () => {
    cursor.page = { lines: [] };
    cursor.pages.push(cursor.page);
    cursor.y = top;
  };

  const ensureRoom = (needed: number) => {
    if (cursor.y - needed < bottom) newPage();
  };

  const emitTextLine = (runs: PositionedRun[]) => {
    ensureRoom(geometry.lineHeight);
    cursor.y -= geometry.lineHeight;
    cursor.page.lines.push({ kind: 'text', y: cursor.y, runs });
  };

  const layoutParagraph = (block: Extract<Block, { type: 'paragraph' }>, offsetX: number, width: number) => {
    const left = toPieces(block.runs, measurer, geometry.fontSize);
    const right = toPieces(block.rightRuns, measurer, geometry.fontSize);

    // A split line puts content at both margins — the party name and "PLAINTIFF".
    if (right.length > 0 && left.length > 0) {
      ensureRoom(geometry.lineHeight);
      cursor.y -= geometry.lineHeight;
      const rightWidth = totalWidth(right);
      cursor.page.lines.push({
        kind: 'text',
        y: cursor.y,
        runs: [
          ...position(left, offsetX),
          ...position(right, offsetX + width - rightWidth),
        ],
      });
      return;
    }

    const pieces = right.length > 0 ? right : left;
    if (pieces.length === 0) {
      // A blank line still advances the cursor; that is how template spacing survives.
      emitTextLine([]);
      return;
    }

    const align = right.length > 0 && left.length === 0 ? 'right' : block.align;
    for (const line of wrap(pieces, width)) {
      const lineWidth = totalWidth(line);
      const x =
        align === 'center' ? offsetX + (width - lineWidth) / 2
        : align === 'right' ? offsetX + width - lineWidth
        : offsetX;
      emitTextLine(position(line, x));
    }
  };

  const layoutBlock = (block: Block, offsetX: number, width: number) => {
    if (block.type === 'paragraph') {
      layoutParagraph(block, offsetX, width);
      return;
    }

    if (block.type === 'rule') {
      ensureRoom(geometry.lineHeight);
      cursor.y -= geometry.lineHeight;
      // A signature rule is a short line to sign above, not a full-width divider.
      const ruleWidth = block.style === 'signature' ? width * 0.6 : width;
      cursor.page.lines.push({
        kind: 'rule',
        y: cursor.y + geometry.lineHeight * 0.3,
        x1: offsetX,
        x2: offsetX + ruleWidth,
        double: block.style === 'double',
      });
      return;
    }

    // Signature tables: lay each cell out into its own column, then advance past the
    // tallest cell so the columns stay side by side.
    for (const row of block.rows) {
      const columns = Math.max(1, row.cells.length);
      const gutter = 24;
      const columnWidth = (width - gutter * (columns - 1)) / columns;

      const startPageIndex = cursor.pages.length - 1;
      const startY = cursor.y;
      let lowestY = cursor.y;
      let deepestPageIndex = startPageIndex;

      row.cells.forEach((cell, index) => {
        cursor.page = cursor.pages[startPageIndex]!;
        cursor.y = startY;
        const columnX = offsetX + index * (columnWidth + gutter);
        for (const cellBlock of cell.blocks) layoutBlock(cellBlock, columnX, columnWidth);

        const endPageIndex = cursor.pages.length - 1;
        if (endPageIndex > deepestPageIndex || (endPageIndex === deepestPageIndex && cursor.y < lowestY)) {
          deepestPageIndex = endPageIndex;
          lowestY = cursor.y;
        }
      });

      cursor.page = cursor.pages[deepestPageIndex]!;
      cursor.y = lowestY;
    }
  };

  for (const block of ast.blocks) layoutBlock(block, geometry.margin, contentWidth);

  return { pages: cursor.pages };
}

/** Convenience for callers that only need the page count. */
export function countPages(
  ast: DocumentAst,
  measurer: TextMeasurer,
  geometry: PageGeometry = A4,
  reservedTop = 0,
): number {
  return layoutDocument(ast, measurer, geometry, reservedTop).pages.length;
}
