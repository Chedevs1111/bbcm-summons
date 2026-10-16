/**
 * Draws laid-out pages into a pdf-lib document.
 *
 * Layout has already decided where every line sits, so this module only converts
 * positions into drawing operations. Horizontal rules are drawn as vector lines
 * rather than repeated box-drawing characters, which is both better typography and
 * avoids depending on glyphs the embedded subset does not carry.
 */

import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import type { FontSet } from './fonts.js';
import { sanitiseForFont } from './fonts.js';
import { A4, type LaidOutPage, type PageGeometry, type PositionedRun } from './layout.js';

const INK = rgb(0, 0, 0);

/**
 * Merges adjacent runs that share a style into one drawing operation.
 *
 * Layout works word by word so it can wrap, but emitting one text operator per word
 * makes extractors treat every word as its own line — a bundle where searching for
 * "Combined Summons" finds nothing is a bundle nobody can use. Joining contiguous
 * same-styled runs restores sentence-level text extraction, and shrinks the file.
 */
function coalesce(runs: PositionedRun[]): PositionedRun[] {
  const merged: PositionedRun[] = [];

  for (const run of runs) {
    const previous = merged[merged.length - 1];
    const contiguous =
      previous !== undefined &&
      previous.style === run.style &&
      previous.underline === run.underline &&
      // Allow a hair of rounding drift before treating runs as separate.
      Math.abs(previous.x + previous.width - run.x) < 0.05;

    if (contiguous) {
      previous.text += run.text;
      previous.width += run.width;
      continue;
    }
    merged.push({ ...run });
  }

  return merged;
}

export interface RenderOptions {
  geometry?: PageGeometry;
  /** Running number printed on the first rendered page; omit to suppress footers. */
  firstPageNumber?: number;
  /** Drawn at the top-right of every page, e.g. the case number. */
  header?: string;
}

/**
 * Renders pages into an existing document and returns them.
 *
 * Returning the created pages lets the bundle assembler record exactly which page
 * index each document starts on, which is what the index and bookmarks are built from.
 */
export function renderPagesInto(
  pdf: PDFDocument,
  fonts: FontSet,
  laidOut: LaidOutPage[],
  options: RenderOptions = {},
): PDFPage[] {
  const geometry = options.geometry ?? A4;
  const created: PDFPage[] = [];

  laidOut.forEach((laidOutPage, index) => {
    const page = pdf.addPage([geometry.width, geometry.height]);
    created.push(page);

    for (const line of laidOutPage.lines) {
      if (line.kind === 'rule') {
        const thickness = line.double ? 1 : 0.75;
        page.drawLine({
          start: { x: line.x1, y: line.y },
          end: { x: line.x2, y: line.y },
          thickness,
          color: INK,
        });
        if (line.double) {
          page.drawLine({
            start: { x: line.x1, y: line.y - 2.5 },
            end: { x: line.x2, y: line.y - 2.5 },
            thickness,
            color: INK,
          });
        }
        continue;
      }

      for (const run of coalesce(line.runs)) {
        const text = sanitiseForFont(run.text);
        if (text.trim() === '') continue;

        page.drawText(text, {
          x: run.x,
          y: line.y,
          size: geometry.fontSize,
          font: fonts[run.style],
          color: INK,
        });

        if (run.underline) {
          page.drawLine({
            start: { x: run.x, y: line.y - 1.8 },
            end: { x: run.x + run.width, y: line.y - 1.8 },
            thickness: 0.6,
            color: INK,
          });
        }
      }
    }

    if (options.header) {
      const header = sanitiseForFont(options.header);
      const width = fonts.regular.widthOfTextAtSize(header, 9);
      page.drawText(header, {
        x: geometry.width - geometry.margin - width,
        y: geometry.height - geometry.margin * 0.6,
        size: 9,
        font: fonts.regular,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    if (options.firstPageNumber !== undefined) {
      drawPageNumber(page, fonts, geometry, options.firstPageNumber + index);
    }
  });

  return created;
}

/**
 * Stamps the running bundle page number, centred in the footer.
 *
 * Directive 33.25 requires each volume to be consecutively numbered and paginated,
 * and the index cites these numbers, so every page in the bundle carries one —
 * including pages copied in from uploaded annexures.
 */
export function drawPageNumber(
  page: PDFPage,
  fonts: FontSet,
  geometry: PageGeometry,
  pageNumber: number,
): void {
  const label = String(pageNumber);
  const width = fonts.regular.widthOfTextAtSize(label, 10);
  const { width: pageWidth } = page.getSize();
  page.drawText(label, {
    x: (pageWidth - width) / 2,
    y: geometry.margin * 0.45,
    size: 10,
    font: fonts.regular,
    color: INK,
  });
}

/** Places a full-page image, scaled to fit inside the margins. */
export function drawFittedImage(
  page: PDFPage,
  image: { width: number; height: number },
  geometry: PageGeometry,
): { x: number; y: number; width: number; height: number } {
  const maxWidth = geometry.width - geometry.margin * 2;
  const maxHeight = geometry.height - geometry.margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (geometry.width - width) / 2,
    y: (geometry.height - height) / 2,
    width,
    height,
  };
}
