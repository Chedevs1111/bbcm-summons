import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assembleBundle } from '../src/assemble.js';
import {
  MAX_PAGES_PER_VOLUME,
  buildCourtBundle,
  type BundleAnnexure,
  type BundleMeta,
} from '../src/pdf/bundle.js';
import { FIXED_NOW, baseMatter, child, makeContext } from './fixtures.js';

const META: BundleMeta = {
  caseNumber: '45678/2026',
  caseReference: 'VDM/2026/D/007',
  courtHeading: 'IN THE HIGH COURT OF SOUTH AFRICA\n(GAUTENG DIVISION, PRETORIA)',
  parties: [
    { name: 'THANDIWE GRACE MOKOENA', role: 'PLAINTIFF' },
    { name: 'SIPHO DANIEL MOKOENA', role: 'DEFENDANT' },
  ],
  firmName: 'VAN DER MERWE & ASSOCIATES',
  firmAddress: '123 Church Street, Pretoria',
  firmPhone: '012 345 6789',
  firmEmail: 'info@vdm-law.co.za',
  attorneyName: 'Adv. Bongani Chauke',
};

/** The pleadings a real uncontested in-community matter produces. */
function documentsForMatter() {
  const ctx = makeContext({
    matter: baseMatter({ marriage_regime: 'in_community' }),
    children: [child()],
  });
  return assembleBundle(
    ctx,
    ['index_page', 'summons', 'particulars_of_claim', 'settlement_agreement', 'annexure_schedule'],
    FIXED_NOW,
  ).map((doc) => ({ document_type: doc.document_type, title: doc.title, body: doc.body }));
}

/** A real multi-page PDF to stand in for an uploaded annexure. */
async function makePdfAnnexure(
  label: string,
  description: string,
  pages: number,
): Promise<BundleAnnexure> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) pdf.addPage([595.28, 841.89]);
  return {
    label,
    description,
    fileName: `${description.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    contentType: 'application/pdf',
    bytes: await pdf.save(),
  };
}

describe('court bundle', () => {
  it('produces a single volume for a small matter', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [],
      now: FIXED_NOW,
    });

    expect(result.volumes).toHaveLength(1);
    expect(result.totalPages).toBeGreaterThan(0);
    expect(result.unreadableAnnexures).toEqual([]);

    const pdf = await PDFDocument.load(result.volumes[0]!.bytes);
    expect(pdf.getPageCount()).toBe(result.totalPages);
  });

  it('drops the template index in favour of the generated one', async () => {
    const documents = documentsForMatter();
    expect(documents.some((d) => d.document_type === 'index_page')).toBe(true);

    const result = await buildCourtBundle({
      meta: META,
      documents,
      annexures: [],
      now: FIXED_NOW,
    });

    // The generated index carries page numbers; the template one cannot.
    expect(result.index.some((entry) => entry.title === 'Index')).toBe(false);
    expect(result.index.map((entry) => entry.title)).toContain('Combined Summons');
  });

  /**
   * The whole reason layout runs before rendering: every index entry has to name the
   * page the document really starts on, counting the cover sheet and the index itself.
   */
  it('cites page numbers that match where sections actually begin', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        await makePdfAnnexure('D', 'Payslip', 3),
        await makePdfAnnexure('E', 'Pension Fund Statement', 2),
      ],
      now: FIXED_NOW,
    });

    // Entries are contiguous: each one starts where the previous ended.
    for (let i = 1; i < result.index.length; i += 1) {
      const previous = result.index[i - 1]!;
      const current = result.index[i]!;
      expect(current.startPage).toBe(previous.startPage + previous.pageCount);
    }

    // The first entry sits after the cover sheet and the index pages.
    expect(result.index[0]!.startPage).toBeGreaterThanOrEqual(3);

    // The last entry ends exactly on the final page of the bundle.
    const last = result.index[result.index.length - 1]!;
    expect(last.startPage + last.pageCount - 1).toBe(result.totalPages);

    const pdf = await PDFDocument.load(result.volumes[0]!.bytes);
    expect(pdf.getPageCount()).toBe(result.totalPages);
  });

  it('preserves the page count of an uploaded annexure', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [await makePdfAnnexure('D', 'Bank Statement', 7)],
      now: FIXED_NOW,
    });

    const entry = result.index.find((e) => e.annexureLabel === 'D');
    expect(entry?.pageCount).toBe(7);
  });

  it('numbers annexures in the index by their letter', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        await makePdfAnnexure('D', 'Payslip', 1),
        await makePdfAnnexure('E', 'Title Deed', 1),
      ],
      now: FIXED_NOW,
    });
    expect(result.index.filter((e) => e.kind === 'annexure').map((e) => e.annexureLabel)).toEqual([
      'D',
      'E',
    ]);
  });
});

describe('volume splitting (directive 33.25)', () => {
  it('splits into volumes of no more than 120 pages', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        await makePdfAnnexure('D', 'Discovery Bundle A', 90),
        await makePdfAnnexure('E', 'Discovery Bundle B', 90),
        await makePdfAnnexure('F', 'Discovery Bundle C', 90),
      ],
      now: FIXED_NOW,
    });

    expect(result.volumes.length).toBeGreaterThan(1);
    for (const volume of result.volumes) {
      expect(volume.pageCount).toBeLessThanOrEqual(MAX_PAGES_PER_VOLUME);
    }
  });

  it('never splits a single document across two volumes', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        await makePdfAnnexure('D', 'Discovery Bundle A', 80),
        await makePdfAnnexure('E', 'Discovery Bundle B', 80),
      ],
      now: FIXED_NOW,
    });

    // Every index entry must sit wholly inside one volume.
    for (const entry of result.index) {
      const endPage = entry.startPage + entry.pageCount - 1;
      const volume = result.volumes.find(
        (v) => entry.startPage >= v.firstPage && entry.startPage <= v.lastPage,
      );
      expect(volume, `${entry.title} has no volume`).toBeDefined();
      expect(endPage, `${entry.title} spills past its volume`).toBeLessThanOrEqual(volume!.lastPage);
    }
  });

  it('lets a volume exceed 120 pages rather than split an oversized document', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [await makePdfAnnexure('D', 'Transcript', 200)],
      now: FIXED_NOW,
    });

    const oversized = result.volumes.find((v) => v.pageCount > MAX_PAGES_PER_VOLUME);
    expect(oversized, 'the 200-page annexure should occupy an over-length volume').toBeDefined();

    const entry = result.index.find((e) => e.annexureLabel === 'D')!;
    expect(entry.pageCount).toBe(200);
  });

  it('gives every volume a cover sheet and continuous numbering', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        await makePdfAnnexure('D', 'Discovery Bundle A', 100),
        await makePdfAnnexure('E', 'Discovery Bundle B', 100),
      ],
      now: FIXED_NOW,
    });

    let expectedFirst = 1;
    for (const volume of result.volumes) {
      expect(volume.firstPage).toBe(expectedFirst);
      const pdf = await PDFDocument.load(volume.bytes);
      // Cover sheet plus the volume's content.
      expect(pdf.getPageCount()).toBe(volume.pageCount);
      expectedFirst = volume.lastPage + 1;
    }
    expect(expectedFirst - 1).toBe(result.totalPages);
  });

  it('can be asked for one continuous PDF instead of volumes', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [await makePdfAnnexure('D', 'Discovery', 200)],
      splitIntoVolumes: false,
      now: FIXED_NOW,
    });
    expect(result.volumes).toHaveLength(1);
  });
});

describe('robustness', () => {
  it('replaces an unreadable annexure with a placeholder instead of failing', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [
        {
          label: 'D',
          description: 'Corrupt Scan',
          fileName: 'corrupt.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([1, 2, 3, 4, 5]),
        },
      ],
      now: FIXED_NOW,
    });

    expect(result.unreadableAnnexures).toEqual(['corrupt.pdf']);
    // Still occupies exactly one page, so the index stays accurate.
    expect(result.index.find((e) => e.annexureLabel === 'D')?.pageCount).toBe(1);
    const pdf = await PDFDocument.load(result.volumes[0]!.bytes);
    expect(pdf.getPageCount()).toBe(result.totalPages);
  });

  it('produces a bundle even with no annexures at all', async () => {
    const result = await buildCourtBundle({
      meta: META,
      documents: documentsForMatter(),
      annexures: [],
      now: FIXED_NOW,
    });
    expect(result.volumes).toHaveLength(1);
    expect(result.index.every((e) => e.kind === 'document')).toBe(true);
  });
});
