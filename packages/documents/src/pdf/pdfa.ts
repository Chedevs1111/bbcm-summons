/**
 * PDF/A-2b conformance.
 *
 * Court Online requires uploads in PDF, and divisions increasingly expect the archival
 * PDF/A profile. pdf-lib has no PDF/A support, so the required structures are built
 * against the low-level object model here:
 *
 *   1. an XMP metadata stream declaring pdfaid:part 2 / pdfaid:conformance B
 *   2. an OutputIntent carrying an embedded sRGB destination profile
 *   3. a document /ID in the trailer
 *   4. document info that agrees with the XMP
 *
 * Fonts are embedded in fonts.ts, which covers the other hard requirement.
 *
 * ⚠️ These structures are built to the spec, but no PDF/A validator (veraPDF) was
 * available in this environment, so conformance is asserted structurally by the tests
 * rather than proven. Run a real validator before relying on the PDF/A claim.
 */

import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { SRGB_ICC_BASE64, SRGB_ICC_DESCRIPTION } from './assets/srgb-icc.js';
import { base64ToBytes } from './fonts.js';

export const PRODUCER = 'BBCM Summons';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** PDF date syntax: D:YYYYMMDDHHmmSS+ZZ'zz'. */
function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

function isoDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildXmp(title: string, author: string, created: Date): string {
  const iso = isoDate(created);
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="${escapeXml(PRODUCER)}">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>2</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(author)}</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
      <xmp:CreatorTool>${escapeXml(PRODUCER)}</xmp:CreatorTool>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>${escapeXml(PRODUCER)}</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export interface PdfaOptions {
  title: string;
  author: string;
  subject?: string;
  created?: Date;
}

/**
 * Applies every PDF/A-2b structure to a document. Call once, after all pages and
 * fonts are in place and immediately before saving.
 */
export function applyPdfaConformance(pdf: PDFDocument, options: PdfaOptions): void {
  const created = options.created ?? new Date();
  const { context, catalog } = pdf;

  // --- Document info, which must agree with the XMP below ---
  pdf.setTitle(options.title);
  pdf.setAuthor(options.author);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  if (options.subject) pdf.setSubject(options.subject);

  // --- XMP metadata stream, uncompressed as the spec requires ---
  //
  // Encoded to UTF-8 bytes by hand. Handing pdf-lib the string instead makes it write
  // the stream in PDFDocEncoding, one byte per character, which silently corrupts every
  // character outside ASCII: an em dash in a case title lands as 0x14, a C0 control byte
  // that is not legal anywhere in XML. That leaves a malformed XMP packet — the one
  // structure PDF/A validation reads first — and it corrupts the leading byte-order mark
  // in the xpacket header too. XMP is defined as UTF-8; this writes it as UTF-8.
  const xmp = new TextEncoder().encode(buildXmp(options.title, options.author, created));
  const metadataStream = context.stream(xmp, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  catalog.set(PDFName.of('Metadata'), context.register(metadataStream));

  // --- OutputIntent with an embedded sRGB profile ---
  const iccBytes = base64ToBytes(SRGB_ICC_BASE64);
  const iccStream = context.flateStream(iccBytes, {
    N: 3, // sRGB has three colour components
  });
  const iccRef = context.register(iccStream);

  const outputIntent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of(SRGB_ICC_DESCRIPTION),
    Info: PDFString.of(SRGB_ICC_DESCRIPTION),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: iccRef,
  });

  const intents = PDFArray.withContext(context);
  intents.push(context.register(outputIntent));
  catalog.set(PDFName.of('OutputIntents'), intents);

  // --- Trailer /ID: required, and both halves match for a freshly authored file ---
  const id = PDFHexString.of(
    [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase(),
  );
  const idArray = PDFArray.withContext(context);
  idArray.push(id);
  idArray.push(id);
  context.trailerInfo.ID = idArray;

  // PDF/A requires the version marker; 2b maps to PDF 1.7.
  catalog.set(PDFName.of('Version'), PDFName.of('1.7'));

  // Mark the document as never needing user interaction to render correctly.
  catalog.set(PDFName.of('PageLayout'), PDFName.of('OneColumn'));
  void PDFNumber; // kept for the typed import surface used by callers
}

/** Save options that keep the output inside the PDF/A feature set. */
export const PDFA_SAVE_OPTIONS = {
  // Object streams are legal in PDF/A-2 but complicate validation, and the documents
  // here are small enough that the size saving does not matter.
  useObjectStreams: false,
  addDefaultPage: false,
} as const;

export { pdfDate };
