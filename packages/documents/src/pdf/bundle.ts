/**
 * Court bundle assembly for Court Online / CaseLines.
 *
 * Implements the structural requirements of the Gauteng Consolidated Practice
 * Directive 1 of 2024:
 *
 *   - all documents in PDF (para 19)
 *   - the record indexed and paginated (33.17.1)
 *   - volumes of no more than 120 pages, extended only to avoid splitting a document,
 *     each consecutively numbered and paginated with a cover sheet carrying the case
 *     number, party names, total volume count, volume number, court, and the legal
 *     representatives' contact details (33.25)
 *   - a combined index in the first volume identifying every document and exhibit (33.26)
 *
 * The index cites real page numbers, which is why layout is computed before anything
 * is drawn. Cover sheets and the index are themselves paginated, so adding them shifts
 * the numbers they contain — the page plan is therefore iterated to a fixed point
 * before a single page is emitted.
 */

import { PDFDocument } from 'pdf-lib';
import { parseDocument, type DocumentAst } from '../markers.js';
import { embedFonts, measurerFor, type FontSet } from './fonts.js';
import { A4, countPages, layoutDocument, type PageGeometry, type TextMeasurer } from './layout.js';
import { addOutline, type OutlineEntry } from './outline.js';
import { PDFA_SAVE_OPTIONS, applyPdfaConformance } from './pdfa.js';
import { drawFittedImage, renderPagesInto } from './render.js';

/** Directive 33.25. A volume may exceed this only to avoid splitting a document. */
export const MAX_PAGES_PER_VOLUME = 120;

export interface BundleDocument {
  document_type: string;
  title: string;
  /** Template body after variable substitution. */
  body: string;
}

export interface BundleAnnexure {
  label: string;
  description: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface BundleParty {
  name: string;
  role: string;
}

export interface BundleMeta {
  caseNumber: string;
  caseReference: string;
  courtHeading: string;
  parties: BundleParty[];
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  attorneyName: string;
}

export interface BundleInput {
  meta: BundleMeta;
  documents: BundleDocument[];
  annexures: BundleAnnexure[];
  geometry?: PageGeometry;
  now?: Date;
  /** Split into volumes per directive 33.25. Off produces one continuous PDF. */
  splitIntoVolumes?: boolean;
}

export interface BundleIndexEntry {
  number: number;
  title: string;
  /** Bundle page the item starts on. */
  startPage: number;
  pageCount: number;
  kind: 'document' | 'annexure';
  annexureLabel?: string;
}

export interface BundleVolume {
  volumeNumber: number;
  /** Bundle page numbers, inclusive. */
  firstPage: number;
  lastPage: number;
  pageCount: number;
  entries: BundleIndexEntry[];
  bytes: Uint8Array;
}

export interface BundleResult {
  volumes: BundleVolume[];
  index: BundleIndexEntry[];
  totalPages: number;
  /** Annexures that could not be read and were replaced by a placeholder page. */
  unreadableAnnexures: string[];
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

/** Page count of one annexure, and whether it could be read at all. */
interface AnnexureMeasurement {
  pageCount: number;
  readable: boolean;
  source?: PDFDocument;
}

async function measureAnnexure(annexure: BundleAnnexure): Promise<AnnexureMeasurement> {
  try {
    if (IMAGE_TYPES.has(annexure.contentType)) {
      // One page per image, scaled to fit inside the margins.
      return { pageCount: 1, readable: true };
    }
    // ignoreEncryption lets us page through documents that carry an owner password
    // but no user password, which is common for bank and pension statements.
    const source = await PDFDocument.load(annexure.bytes, { ignoreEncryption: true });
    const pageCount = source.getPageCount();
    if (pageCount === 0) return { pageCount: 1, readable: false };
    return { pageCount, readable: true, source };
  } catch {
    // A corrupt annexure must not sink the whole bundle — it becomes a placeholder
    // page so the filing is still complete and the gap is visible.
    return { pageCount: 1, readable: false };
  }
}

function buildCoverAst(
  meta: BundleMeta,
  volumeNumber: number,
  totalVolumes: number,
): DocumentAst {
  const parties = meta.parties
    .map((party) => `{{B}}${party.name}{{/B}}{{R}}{{B}}${party.role}{{/B}}{{/R}}`)
    .join('\n\n');

  const body = [
    `{{C}}{{B}}${meta.courtHeading.split('\n').join('{{/B}}{{/C}}\n{{C}}{{B}}')}{{/B}}{{/C}}`,
    '',
    `{{R}}CASE NO: ${meta.caseNumber}{{/R}}`,
    '',
    'In the matter between:',
    '',
    parties,
    '',
    '══════════════════════════════════════════',
    totalVolumes > 1
      ? `{{C}}{{B}}{{U}}VOLUME ${volumeNumber} OF ${totalVolumes}{{/U}}{{/B}}{{/C}}`
      : '{{C}}{{B}}{{U}}COURT BUNDLE{{/U}}{{/B}}{{/C}}',
    '══════════════════════════════════════════',
    '',
    `{{B}}Court:{{/B}} ${meta.courtHeading.replace(/\n/g, ' ')}`,
    `{{B}}Case number:{{/B}} ${meta.caseNumber}`,
    `{{B}}Firm reference:{{/B}} ${meta.caseReference || '—'}`,
    `{{B}}Volume:{{/B}} ${volumeNumber} of ${totalVolumes}`,
    '',
    '{{B}}Legal representatives{{/B}}',
    '',
    meta.firmName,
    meta.attorneyName,
    meta.firmAddress,
    meta.firmPhone,
    meta.firmEmail,
  ].join('\n');

  return parseDocument(body);
}

function buildIndexAst(meta: BundleMeta, entries: BundleIndexEntry[]): DocumentAst {
  const rows = entries.map((entry) => {
    const label =
      entry.kind === 'annexure'
        ? `${entry.number}. Annexure “${entry.annexureLabel}” — ${entry.title}`
        : `${entry.number}. ${entry.title}`;
    const pages =
      entry.pageCount > 1
        ? `${entry.startPage}–${entry.startPage + entry.pageCount - 1}`
        : `${entry.startPage}`;
    return `${label}{{R}}${pages}{{/R}}`;
  });

  const body = [
    `{{C}}{{B}}${meta.courtHeading.split('\n').join('{{/B}}{{/C}}\n{{C}}{{B}}')}{{/B}}{{/C}}`,
    '',
    `{{R}}CASE NO: ${meta.caseNumber}{{/R}}`,
    '',
    '══════════════════════════════════════════',
    '{{C}}{{B}}{{U}}INDEX{{/U}}{{/B}}{{/C}}',
    '══════════════════════════════════════════',
    '',
    `{{B}}Description{{/B}}{{R}}{{B}}Page{{/B}}{{/R}}`,
    '──────────────────────────────────────────',
    '',
    ...rows,
    '',
    '──────────────────────────────────────────',
    `{{R}}Total pages: ${entries.length > 0 ? entries[entries.length - 1]!.startPage + entries[entries.length - 1]!.pageCount - 1 : 0}{{/R}}`,
  ].join('\n');

  return parseDocument(body);
}

interface SectionPlan {
  title: string;
  kind: 'document' | 'annexure';
  annexureLabel?: string;
  pageCount: number;
  documentIndex?: number;
  annexureIndex?: number;
}

/**
 * Packs sections into volumes without splitting a section.
 *
 * Directive 33.25 caps a volume at 120 pages but explicitly permits a longer volume
 * where that is the only way to keep a document whole, so an oversized section simply
 * takes a volume of its own.
 */
function packVolumes(
  sections: SectionPlan[],
  coverPages: number,
  frontMatterPages: number,
  maxPages: number,
): SectionPlan[][] {
  const volumes: SectionPlan[][] = [];
  let current: SectionPlan[] = [];
  // The first volume also carries the index, so it starts with less room.
  let used = coverPages + frontMatterPages;

  for (const section of sections) {
    if (current.length > 0 && used + section.pageCount > maxPages) {
      volumes.push(current);
      current = [];
      used = coverPages;
    }
    current.push(section);
    used += section.pageCount;
  }
  if (current.length > 0) volumes.push(current);
  return volumes.length > 0 ? volumes : [[]];
}

/**
 * Builds the paginated court bundle.
 *
 * Documents of type `index_page` are dropped from the body: the bundle generates its
 * own index with real page references, and a second index without them would only
 * confuse the reader.
 */
export async function buildCourtBundle(input: BundleInput): Promise<BundleResult> {
  const geometry = input.geometry ?? A4;
  const now = input.now ?? new Date();
  const documents = input.documents.filter((doc) => doc.document_type !== 'index_page');

  // A throwaway document supplies font metrics for the measuring pass.
  const probe = await PDFDocument.create();
  const probeFonts = await embedFonts(probe);
  const measurer = measurerFor(probeFonts);

  // --- Measure every section ---
  const documentAsts = documents.map((doc) => parseDocument(doc.body));
  const documentPageCounts = documentAsts.map((ast) => countPages(ast, measurer, geometry));

  const annexureMeasurements: AnnexureMeasurement[] = [];
  const unreadableAnnexures: string[] = [];
  for (const annexure of input.annexures) {
    const measurement = await measureAnnexure(annexure);
    if (!measurement.readable) unreadableAnnexures.push(annexure.fileName);
    annexureMeasurements.push(measurement);
  }

  const sections: SectionPlan[] = [
    ...documents.map((doc, index) => ({
      title: doc.title,
      kind: 'document' as const,
      pageCount: documentPageCounts[index]!,
      documentIndex: index,
    })),
    ...input.annexures.map((annexure, index) => ({
      title: annexure.description,
      kind: 'annexure' as const,
      annexureLabel: annexure.label,
      pageCount: annexureMeasurements[index]!.pageCount,
      annexureIndex: index,
    })),
  ];

  // --- Iterate the page plan to a fixed point ---
  // Cover sheets and the index are paginated too, so their own size feeds back into
  // the page numbers the index prints. Two or three passes always settle it.
  const splitIntoVolumes = input.splitIntoVolumes ?? true;
  let indexPages = 1;
  let volumeGroups: SectionPlan[][] = [sections];
  let entries: BundleIndexEntry[] = [];

  for (let pass = 0; pass < 6; pass += 1) {
    volumeGroups = splitIntoVolumes
      ? packVolumes(sections, 1, indexPages, MAX_PAGES_PER_VOLUME)
      : [sections];

    // Walk the volumes in order assigning bundle-wide page numbers.
    entries = [];
    let page = 1;
    let entryNumber = 1;
    volumeGroups.forEach((group, volumeIndex) => {
      page += 1; // cover sheet
      if (volumeIndex === 0) page += indexPages;
      for (const section of group) {
        entries.push({
          number: entryNumber++,
          title: section.title,
          startPage: page,
          pageCount: section.pageCount,
          kind: section.kind,
          annexureLabel: section.annexureLabel,
        });
        page += section.pageCount;
      }
    });

    const nextIndexPages = countPages(buildIndexAst(input.meta, entries), measurer, geometry);
    if (nextIndexPages === indexPages) break;
    indexPages = nextIndexPages;
  }

  // --- Emit ---
  const totalVolumes = volumeGroups.length;
  const volumes: BundleVolume[] = [];
  let runningPage = 1;

  for (let volumeIndex = 0; volumeIndex < totalVolumes; volumeIndex += 1) {
    const group = volumeGroups[volumeIndex]!;
    const pdf = await PDFDocument.create();
    const fonts = await embedFonts(pdf);
    const outline: OutlineEntry[] = [];
    const firstPage = runningPage;

    const header = input.meta.caseNumber ? `Case No: ${input.meta.caseNumber}` : undefined;

    // Cover sheet (directive 33.25)
    const coverAst = buildCoverAst(input.meta, volumeIndex + 1, totalVolumes);
    renderPagesInto(pdf, fonts, layoutDocument(coverAst, measurerFor(fonts), geometry).pages, {
      geometry,
      firstPageNumber: runningPage,
      header,
    });
    outline.push({
      title: totalVolumes > 1 ? `Cover — Volume ${volumeIndex + 1} of ${totalVolumes}` : 'Cover',
      pageIndex: pdf.getPageCount() - 1,
    });
    runningPage += 1;

    // Combined index, first volume only (directive 33.26)
    if (volumeIndex === 0) {
      const indexAst = buildIndexAst(input.meta, entries);
      const laidOut = layoutDocument(indexAst, measurerFor(fonts), geometry).pages;
      const indexPageIndex = pdf.getPageCount();
      renderPagesInto(pdf, fonts, laidOut, {
        geometry,
        firstPageNumber: runningPage,
        header,
      });
      outline.push({ title: 'Index', pageIndex: indexPageIndex });
      runningPage += laidOut.length;
    }

    const documentBookmarks: OutlineEntry[] = [];
    const annexureBookmarks: OutlineEntry[] = [];

    for (const section of group) {
      const pageIndexBefore = pdf.getPageCount();

      if (section.kind === 'document') {
        const ast = documentAsts[section.documentIndex!]!;
        renderPagesInto(pdf, fonts, layoutDocument(ast, measurerFor(fonts), geometry).pages, {
          geometry,
          firstPageNumber: runningPage,
          header,
        });
        documentBookmarks.push({ title: section.title, pageIndex: pageIndexBefore });
      } else {
        const annexure = input.annexures[section.annexureIndex!]!;
        const measurement = annexureMeasurements[section.annexureIndex!]!;
        await emitAnnexure(pdf, fonts, geometry, annexure, measurement, runningPage);
        annexureBookmarks.push({
          title: `Annexure “${annexure.label}” — ${annexure.description}`,
          pageIndex: pageIndexBefore,
        });
      }

      runningPage += section.pageCount;
    }

    if (documentBookmarks.length > 0) {
      outline.push({
        title: 'Pleadings',
        pageIndex: documentBookmarks[0]!.pageIndex,
        children: documentBookmarks,
      });
    }
    if (annexureBookmarks.length > 0) {
      outline.push({
        title: 'Annexures',
        pageIndex: annexureBookmarks[0]!.pageIndex,
        children: annexureBookmarks,
      });
    }

    addOutline(pdf, outline);

    const title =
      totalVolumes > 1
        ? `${input.meta.caseNumber || input.meta.caseReference} — Court Bundle Volume ${volumeIndex + 1} of ${totalVolumes}`
        : `${input.meta.caseNumber || input.meta.caseReference} — Court Bundle`;

    applyPdfaConformance(pdf, {
      title,
      author: input.meta.firmName,
      subject: input.meta.parties.map((party) => party.name).join(' // '),
      created: now,
    });

    const bytes = await pdf.save(PDFA_SAVE_OPTIONS);
    const lastPage = runningPage - 1;

    volumes.push({
      volumeNumber: volumeIndex + 1,
      firstPage,
      lastPage,
      pageCount: lastPage - firstPage + 1,
      entries: entries.filter(
        (entry) => entry.startPage >= firstPage && entry.startPage <= lastPage,
      ),
      bytes,
    });
  }

  return {
    volumes,
    index: entries,
    totalPages: runningPage - 1,
    unreadableAnnexures,
  };
}

/** Copies an annexure's pages in, stamping each with its bundle page number. */
async function emitAnnexure(
  pdf: PDFDocument,
  fonts: FontSet,
  geometry: PageGeometry,
  annexure: BundleAnnexure,
  measurement: AnnexureMeasurement,
  startPageNumber: number,
): Promise<void> {
  const { drawPageNumber } = await import('./render.js');

  if (!measurement.readable) {
    const notice = parseDocument(
      [
        `{{C}}{{B}}{{U}}ANNEXURE “${annexure.label}”{{/U}}{{/B}}{{/C}}`,
        '',
        `{{C}}${annexure.description}{{/C}}`,
        '',
        '',
        `{{C}}{{B}}This annexure could not be included automatically.{{/B}}{{/C}}`,
        '',
        `{{C}}The file “${annexure.fileName}” could not be read as a PDF or image.{{/C}}`,
        '{{C}}It must be re-uploaded or filed separately before this bundle is served.{{/C}}',
      ].join('\n'),
    );
    renderPagesInto(pdf, fonts, layoutDocument(notice, measurerFor(fonts), geometry).pages, {
      geometry,
      firstPageNumber: startPageNumber,
    });
    return;
  }

  if (IMAGE_TYPES.has(annexure.contentType)) {
    const image =
      annexure.contentType === 'image/png'
        ? await pdf.embedPng(annexure.bytes)
        : await pdf.embedJpg(annexure.bytes);
    const page = pdf.addPage([geometry.width, geometry.height]);
    page.drawImage(image, drawFittedImage(page, image, geometry));
    drawPageNumber(page, fonts, geometry, startPageNumber);
    return;
  }

  const source = measurement.source!;
  const copied = await pdf.copyPages(source, source.getPageIndices());
  copied.forEach((page, index) => {
    pdf.addPage(page);
    // Uploaded pages carry their own numbering, if any; the bundle number is what the
    // index cites, so every page gets one regardless of what is already printed.
    drawPageNumber(page, fonts, geometry, startPageNumber + index);
  });
}
