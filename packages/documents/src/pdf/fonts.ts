/**
 * Font embedding for generated PDFs.
 *
 * All four faces are embedded as subsets. PDF/A forbids relying on the viewer having
 * a font, including the standard-14 faces an ordinary PDF may reference by name, so
 * even plain body text needs real embedded font data.
 */

import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import {
  TINOS_BOLDITALIC_BASE64,
  TINOS_BOLD_BASE64,
  TINOS_ITALIC_BASE64,
  TINOS_REGULAR_BASE64,
} from './assets/fonts.js';
import type { FontStyle, TextMeasurer } from './layout.js';

/** Works in both workerd and Node without Buffer. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type FontSet = Record<FontStyle, PDFFont>;

const SOURCES: Record<FontStyle, string> = {
  regular: TINOS_REGULAR_BASE64,
  bold: TINOS_BOLD_BASE64,
  italic: TINOS_ITALIC_BASE64,
  boldItalic: TINOS_BOLDITALIC_BASE64,
};

/**
 * Embeds the four faces.
 *
 * `subset: false` looks wasteful but is deliberate: the shipped files are already
 * subset to Latin-1 plus the punctuation pleadings use, and pdf-lib's re-subsetting
 * has produced font programs that trip PDF/A font-descriptor checks. ~18 KB a face
 * is a fair price for output that validators accept.
 */
export async function embedFonts(pdf: PDFDocument): Promise<FontSet> {
  pdf.registerFontkit(fontkit);
  const entries = await Promise.all(
    (Object.keys(SOURCES) as FontStyle[]).map(
      async (style) =>
        [style, await pdf.embedFont(base64ToBytes(SOURCES[style]), { subset: false })] as const,
    ),
  );
  return Object.fromEntries(entries) as FontSet;
}

/** Adapts an embedded font set to the layout engine's measuring interface. */
export function measurerFor(fonts: FontSet): TextMeasurer {
  return {
    widthOf(text, style, size) {
      return fonts[style].widthOfTextAtSize(text, size);
    },
  };
}

/**
 * Replaces characters the subset cannot encode.
 *
 * A single unmappable glyph makes pdf-lib throw mid-render, which would fail the whole
 * bundle. Party names and addresses come from user input and OCR, so that risk is real:
 * substituting is far better than refusing to produce the document.
 */
export function sanitiseForFont(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–]/g, '-')
    .replace(/[—]/g, '—')
    .replace(/[…]/g, '...')
    .replace(/[   ]/g, ' ')
    // Box-drawing and anything else outside Latin-1 Supplement / Latin Extended-A.
    .replace(/[^ -~ -ſ—§°×÷]/g, '?');
}
