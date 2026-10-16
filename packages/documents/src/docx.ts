/**
 * Word export.
 *
 * Renders the document AST to a .docx laid out for South African court filing:
 * A4, 2.54 cm margins, 12 pt serif, 1.5 line spacing.
 */

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Block, DocumentAst, Run } from './markers.js';

const TWIPS_PER_CM = 567;

function toTextRuns(runs: Run[]): TextRun[] {
  if (runs.length === 0) return [new TextRun('')];
  return runs.map(
    (run) =>
      new TextRun({
        text: run.text,
        bold: run.marks.includes('bold'),
        italics: run.marks.includes('italic'),
        underline: run.marks.includes('underline') ? {} : undefined,
      }),
  );
}

const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
} as const;

function renderBlock(block: Block): Paragraph | Table {
  if (block.type === 'rule') {
    const char = block.style === 'double' ? '═' : block.style === 'single' ? '─' : '_';
    return new Paragraph({ children: [new TextRun(char.repeat(60))] });
  }

  if (block.type === 'table') {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: 'none', size: 0, color: 'FFFFFF' },
        bottom: { style: 'none', size: 0, color: 'FFFFFF' },
        left: { style: 'none', size: 0, color: 'FFFFFF' },
        right: { style: 'none', size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: 'none', size: 0, color: 'FFFFFF' },
        insideVertical: { style: 'none', size: 0, color: 'FFFFFF' },
      },
      rows: block.rows.map(
        (row) =>
          new TableRow({
            children: row.cells.map(
              (cell) =>
                new TableCell({
                  children: cell.blocks.map(renderBlock) as (Paragraph | Table)[],
                }),
            ),
          }),
      ),
    });
  }

  // A split line (name left, "PLAINTIFF" right) becomes a right tab stop.
  if (block.rightRuns.length > 0 && block.runs.length > 0) {
    return new Paragraph({
      tabStops: [{ type: 'right', position: 9000 }],
      children: [...toTextRuns(block.runs), new TextRun({ text: '\t' }), ...toTextRuns(block.rightRuns)],
    });
  }

  return new Paragraph({
    alignment: ALIGNMENT[block.align],
    children: toTextRuns(block.runs),
  });
}

/** Builds a .docx as a byte array, ready to stream to the browser. */
export async function renderDocx(ast: DocumentAst, title: string): Promise<Uint8Array> {
  const document = new Document({
    creator: 'BBCM Summons',
    title,
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 }, // 24 half-points = 12pt
          paragraph: { spacing: { line: 360 } }, // 1.5 line spacing
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
            margin: {
              top: Math.round(2.54 * TWIPS_PER_CM),
              bottom: Math.round(2.54 * TWIPS_PER_CM),
              left: Math.round(2.54 * TWIPS_PER_CM),
              right: Math.round(2.54 * TWIPS_PER_CM),
            },
          },
        },
        children: ast.blocks.map(renderBlock),
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(document));
}
