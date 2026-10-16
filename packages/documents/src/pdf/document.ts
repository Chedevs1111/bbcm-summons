/**
 * Renders one document to a standalone PDF/A.
 *
 * The bundle assembler already knew how to do this for many documents at once; this
 * exposes the same pipeline for a single one — a fee note going to a client, a letter
 * going to the Sheriff — without the cover sheet, index and volume machinery.
 */

import { PDFDocument } from 'pdf-lib';
import type { DocumentAst } from '../markers.js';
import { embedFonts, measurerFor } from './fonts.js';
import { A4, layoutDocument, type PageGeometry } from './layout.js';
import { PDFA_SAVE_OPTIONS, applyPdfaConformance } from './pdfa.js';
import { renderPagesInto } from './render.js';

export interface SingleDocumentOptions {
  title: string;
  author: string;
  subject?: string;
  geometry?: PageGeometry;
  /** Drawn top-right on every page, e.g. a case number. */
  header?: string;
  /** Off for correspondence, which is not paginated like a court bundle. */
  pageNumbers?: boolean;
  now?: Date;
}

export async function renderDocumentPdf(
  ast: DocumentAst,
  options: SingleDocumentOptions,
): Promise<Uint8Array> {
  const geometry = options.geometry ?? A4;
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);

  const laidOut = layoutDocument(ast, measurerFor(fonts), geometry).pages;

  // A one-page letter needs no running number; anything longer gets one so the reader
  // can see no page is missing. An explicit setting always wins.
  const numbered = options.pageNumbers ?? laidOut.length > 1;

  renderPagesInto(pdf, fonts, laidOut, {
    geometry,
    header: options.header,
    firstPageNumber: numbered ? 1 : undefined,
  });

  applyPdfaConformance(pdf, {
    title: options.title,
    author: options.author,
    subject: options.subject,
    created: options.now ?? new Date(),
  });

  return pdf.save(PDFA_SAVE_OPTIONS);
}
