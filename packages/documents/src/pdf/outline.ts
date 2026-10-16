/**
 * PDF bookmarks (the /Outlines tree).
 *
 * pdf-lib has no outline API, so the dictionary tree is assembled directly. Judges
 * navigate a bundle by its bookmark pane, so a bundle without bookmarks is materially
 * harder to use in court even when it is otherwise compliant.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef } from 'pdf-lib';

export interface OutlineEntry {
  title: string;
  /** Zero-based index into the document's pages. */
  pageIndex: number;
  children?: OutlineEntry[];
}

interface Built {
  ref: PDFRef;
  /** Count of this node's visible descendants, per the PDF spec's /Count rules. */
  descendants: number;
}

/**
 * Attaches an outline tree to the document.
 *
 * Top-level entries are shown expanded (positive /Count) so the structure of the
 * bundle is visible the moment the file opens.
 */
export function addOutline(pdf: PDFDocument, entries: OutlineEntry[]): void {
  if (entries.length === 0) return;

  const context = pdf.context;
  const pages = pdf.getPages();
  const outlinesRef = context.nextRef();

  const buildLevel = (items: OutlineEntry[], parent: PDFRef): { first: PDFRef; last: PDFRef; total: number } => {
    const built: Built[] = items.map(() => ({ ref: context.nextRef(), descendants: 0 }));
    let total = 0;

    items.forEach((item, index) => {
      const self = built[index]!;
      const page = pages[Math.min(item.pageIndex, pages.length - 1)];

      const dict = new Map<PDFName, unknown>();
      const entries: Array<[string, unknown]> = [
        // PDFString encodes as PDFDocEncoding, which cannot represent curly quotes or
        // an em dash — “Annexure “D” — Payslip” came out as mojibake in the bookmark
        // pane. Hex strings are UTF-16BE and render correctly in every viewer.
        ['Title', PDFHexString.fromText(item.title)],
        ['Parent', parent],
      ];

      if (index > 0) entries.push(['Prev', built[index - 1]!.ref]);
      if (index < items.length - 1) entries.push(['Next', built[index + 1]!.ref]);

      // /Dest as [page /XYZ left top zoom] — null zoom keeps the reader's zoom level.
      if (page) {
        const dest = PDFArray.withContext(context);
        dest.push(page.ref);
        dest.push(PDFName.of('XYZ'));
        dest.push(context.obj(null));
        dest.push(PDFNumber.of(page.getSize().height));
        dest.push(context.obj(null));
        entries.push(['Dest', dest]);
      }

      let childCount = 0;
      if (item.children && item.children.length > 0) {
        const child = buildLevel(item.children, self.ref);
        entries.push(['First', child.first]);
        entries.push(['Last', child.last]);
        childCount = child.total;
        // Negative /Count renders the node collapsed; annexure lists are long, so
        // sections open collapsed and the top level stays expanded.
        entries.push(['Count', PDFNumber.of(-childCount)]);
      }

      self.descendants = childCount;
      total += 1 + childCount;

      const obj = context.obj(Object.fromEntries(entries) as Record<string, never>);
      context.assign(self.ref, obj as PDFDict);
      void dict;
    });

    return { first: built[0]!.ref, last: built[built.length - 1]!.ref, total };
  };

  const top = buildLevel(entries, outlinesRef);

  context.assign(
    outlinesRef,
    context.obj({
      Type: 'Outlines',
      First: top.first,
      Last: top.last,
      Count: top.total,
    }) as PDFDict,
  );

  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
  // Open the bookmark pane by default so the structure is immediately visible.
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}
