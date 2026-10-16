import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assembleBundle } from '../src/assemble.js';
import { buildCourtBundle, type BundleMeta } from '../src/pdf/bundle.js';
import { FIXED_NOW, baseMatter, child, makeContext } from './fixtures.js';

/**
 * Structural checks on the PDF/A-2b markers.
 *
 * ⚠️ These assert that the required objects are present and well-formed. They are NOT
 * a conformance verdict — no PDF/A validator (veraPDF) was available in this
 * environment. Run one against a real bundle before advertising PDF/A compliance.
 */

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

async function buildOnce() {
  const ctx = makeContext({
    matter: baseMatter({ marriage_regime: 'in_community' }),
    children: [child()],
  });
  const documents = assembleBundle(
    ctx,
    ['summons', 'particulars_of_claim', 'settlement_agreement'],
    FIXED_NOW,
  ).map((doc) => ({ document_type: doc.document_type, title: doc.title, body: doc.body }));

  const result = await buildCourtBundle({ meta: META, documents, annexures: [], now: FIXED_NOW });
  const bytes = result.volumes[0]!.bytes;
  return { bytes, raw: new TextDecoder('latin1').decode(bytes) };
}

/** The raw bytes of the XMP packet, between the xpacket header and trailer. */
function extractXmp(bytes: Uint8Array): Uint8Array {
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const start = latin1.indexOf('<?xpacket begin=');
  const end = latin1.indexOf('<?xpacket end="w"?>');
  expect(start, 'xpacket header must be present').toBeGreaterThan(-1);
  expect(end, 'xpacket trailer must be present').toBeGreaterThan(start);
  // latin1 is one char per byte, so these indices are byte offsets.
  return bytes.slice(start, end + '<?xpacket end="w"?>'.length);
}

describe('PDF/A-2b structures', () => {
  it('is a valid PDF that reloads', async () => {
    const { bytes } = await buildOnce();
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
  });

  it('declares PDF/A part 2 conformance B in XMP', async () => {
    const { raw } = await buildOnce();
    expect(raw).toContain('http://www.aiim.org/pdfa/ns/id/');
    expect(raw).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(raw).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    // The XMP packet must be present uncompressed for a validator to read it.
    expect(raw).toContain('<?xpacket begin=');
    expect(raw).toContain('<?xpacket end="w"?>');
  });

  /**
   * The XMP packet is defined as UTF-8. pdf-lib writes a stream given as a *string* in
   * PDFDocEncoding — one byte per character — which turns the em dash in a bundle title
   * into 0x14, a C0 control byte that is not legal anywhere in XML. That produces a
   * malformed metadata packet: the first thing a PDF/A validator parses.
   *
   * These assertions read the bytes. The other tests in this file decode with latin1,
   * which round-trips any byte at all and so cannot see an encoding fault.
   */
  it('writes the XMP packet as UTF-8', async () => {
    const { bytes } = await buildOnce();
    const xmp = extractXmp(bytes);

    // Decoding strictly: a fatal decoder throws rather than substituting U+FFFD.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(xmp);

    // The title carries an em dash, so this fails on any single-byte encoding.
    expect(text).toContain('45678/2026 — Court Bundle');
  });

  it('puts no XML-illegal control bytes in the metadata packet', async () => {
    const { bytes } = await buildOnce();
    const xmp = extractXmp(bytes);

    // XML 1.0 permits only tab, LF and CR below 0x20. Anything else makes the packet
    // unparseable, which is how a mis-encoded character shows up in practice.
    const illegal = [...xmp].filter((b) => b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);
    expect(illegal, `control bytes in XMP: ${illegal.map((b) => b.toString(16))}`).toEqual([]);
  });

  it('opens the xpacket header with a real byte-order mark', async () => {
    const { bytes } = await buildOnce();
    const xmp = extractXmp(bytes);
    const bom = xmp.indexOf(0xef);
    // U+FEFF as UTF-8, not the 0xFE byte a single-byte encoding would leave behind.
    expect([xmp[bom], xmp[bom + 1], xmp[bom + 2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('marks the metadata stream as XML metadata', async () => {
    const { bytes } = await buildOnce();
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const metadata = pdf.catalog.get(PDFName.of('Metadata'));
    expect(metadata, 'catalog must reference a /Metadata stream').toBeDefined();
    const { raw } = await buildOnce();
    expect(raw).toContain('/Subtype /XML');
  });

  it('carries an OutputIntent with an embedded destination profile', async () => {
    const { bytes, raw } = await buildOnce();
    expect(raw).toContain('/GTS_PDFA1');
    expect(raw).toContain('/DestOutputProfile');
    expect(raw).toContain('/OutputIntent');

    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const intents = pdf.catalog.get(PDFName.of('OutputIntents'));
    expect(intents, 'catalog must carry /OutputIntents').toBeDefined();
  });

  it('declares three colour components on the ICC stream', async () => {
    const { raw } = await buildOnce();
    // sRGB is a three-component space; a validator rejects a mismatched /N.
    expect(raw).toMatch(/\/N 3/);
  });

  it('embeds every font rather than referencing standard-14 by name', async () => {
    const { raw } = await buildOnce();
    // Embedded TrueType programs appear as FontFile2.
    expect(raw).toContain('/FontFile2');
    // None of the standard-14 names may be referenced.
    for (const base14 of ['/Helvetica', '/Times-Roman', '/Courier', '/Symbol', '/ZapfDingbats']) {
      expect(raw, `${base14} must not be referenced`).not.toContain(base14);
    }
  });

  it('sets a document /ID in the trailer', async () => {
    const { raw } = await buildOnce();
    expect(raw).toMatch(/\/ID \[ <[0-9A-F]+> <[0-9A-F]+> \]/);
  });

  it('is not encrypted', async () => {
    const { raw } = await buildOnce();
    expect(raw).not.toContain('/Encrypt');
  });

  it('records document info that agrees with the XMP', async () => {
    const { bytes, raw } = await buildOnce();
    // updateMetadata defaults to true on load and would rewrite /Producer with
    // pdf-lib's own string, hiding what the file actually says.
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(pdf.getTitle()).toContain('Court Bundle');
    expect(pdf.getProducer()).toBe('BBCM Summons');
    expect(pdf.getCreator()).toBe('BBCM Summons');

    // DocInfo strings are written as UTF-16BE hex, so check the bytes decode back to
    // the same value the XMP advertises — PDF/A requires the two to agree.
    const hex = /\/Producer <([0-9A-Fa-f]+)>/.exec(raw)?.[1] ?? '';
    const decoded = Buffer.from(hex, 'hex').toString('utf16le').replace(/￾|﻿/g, '');
    const swapped = Buffer.from(hex, 'hex').swap16().toString('utf16le').replace(/﻿/g, '');
    expect(decoded === 'BBCM Summons' || swapped === 'BBCM Summons').toBe(true);

    expect(raw).toContain('<pdf:Producer>BBCM Summons</pdf:Producer>');
    expect(raw).toContain('<xmp:CreatorTool>BBCM Summons</xmp:CreatorTool>');
  });
});

/** Bookmark titles are UTF-16BE hex strings; decode them the way a viewer would. */
function outlineTitles(raw: string): string[] {
  return [...raw.matchAll(/\/Title <([0-9A-Fa-f]+)>/g)].map((match) => {
    const hex = match[1]!;
    const bytes = Buffer.from(hex, 'hex');
    // Strip the UTF-16BE byte-order mark, then swap to little-endian for Node.
    const body = bytes.subarray(0, 2).toString('hex').toUpperCase() === 'FEFF' ? bytes.subarray(2) : bytes;
    return Buffer.from(body).swap16().toString('utf16le');
  });
}

describe('bookmarks', () => {
  it('adds an outline tree covering the cover, index and pleadings', async () => {
    const { bytes, raw } = await buildOnce();
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.catalog.get(PDFName.of('Outlines')), 'catalog must carry /Outlines').toBeDefined();
    expect(raw).toContain('/Type /Outlines');

    const titles = outlineTitles(raw);
    expect(titles).toEqual(expect.arrayContaining(['Cover', 'Index', 'Pleadings']));

    // Opens with the bookmark pane showing so a judge sees the structure at once.
    expect(raw).toContain('/PageMode /UseOutlines');
  });

  /**
   * PDFString encodes as PDFDocEncoding and turned “Annexure “D” — Payslip” into
   * mojibake in the bookmark pane. Titles are hex strings now.
   */
  it('keeps curly quotes and em dashes intact in annexure bookmark titles', async () => {
    const { assembleBundle: assemble } = await import('../src/assemble.js');
    const ctx = makeContext({ matter: baseMatter({ marriage_regime: 'in_community' }) });
    const documents = assemble(ctx, ['summons'], FIXED_NOW).map((doc) => ({
      document_type: doc.document_type,
      title: doc.title,
      body: doc.body,
    }));

    const blank = await PDFDocument.create();
    blank.addPage([595.28, 841.89]);

    const result = await buildCourtBundle({
      meta: META,
      documents,
      annexures: [
        {
          label: 'D',
          description: 'Payslip',
          fileName: 'payslip.pdf',
          contentType: 'application/pdf',
          bytes: await blank.save(),
        },
      ],
      now: FIXED_NOW,
    });

    const raw = new TextDecoder('latin1').decode(result.volumes[0]!.bytes);
    expect(outlineTitles(raw)).toContain('Annexure “D” — Payslip');
  });
});
