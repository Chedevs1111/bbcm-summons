import { totalFeeNote, type FeeNote, type FeeNoteLine, type ServiceEvent } from '@bbcm/schema';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderPlainText } from '../src/markers.js';
import { buildFeeNoteDocument, buildSheriffInstruction } from '../src/practice.js';
import { renderDocumentPdf } from '../src/pdf/document.js';
import { FIRM, FIXED_NOW, baseMatter } from './fixtures.js';

const CTX = {
  matter: baseMatter(),
  firm: { ...FIRM, vat_number: '4123456789', lpc_number: 'LPC12345' },
  attorney: { full_name: 'Adv. Bongani Chauke', lpc_number: 'LPC99887' },
};

function line(over: Partial<FeeNoteLine> = {}): FeeNoteLine {
  return {
    id: crypto.randomUUID(),
    fee_note_id: 'note-1',
    description: 'Consultation',
    kind: 'fee',
    account: 'business',
    service_date: '',
    quantity: 1,
    unit_amount: 1500,
    vatable: 1,
    sort_order: 0,
    ...over,
  };
}

const NOTE: FeeNote = {
  id: 'note-1',
  matter_id: 'matter-1',
  note_number: 'FN2026-0001',
  status: 'issued',
  issued_at: '2026-08-03',
  due_at: '2026-09-02',
  paid_at: '',
  vat_rate: 15,
  vat_registered: 1,
  notes: '',
  created_by: 'user-1',
  created_at: '2026-08-03 09:00:00',
  updated_at: '2026-08-03 09:00:00',
};

/**
 * Amounts render in South African convention — a comma decimal separator and a
 * non-breaking space between thousands. The NBSP is normalised here so the
 * expectations below stay readable.
 */
function feeNoteText(lines: FeeNoteLine[], note: FeeNote = NOTE): string {
  const totals = totalFeeNote(lines, note.vat_rate, note.vat_registered === 1);
  return renderPlainText(buildFeeNoteDocument(CTX, note, lines, totals, FIXED_NOW), 100)
    .replace(/\u00A0/g, ' ');
}

describe('fee note document', () => {
  it('carries the firm letterhead and statutory numbers', () => {
    const text = feeNoteText([line()]);
    expect(text).toContain('VAN DER MERWE & ASSOCIATES');
    // Letterhead is compact: contact details and statutory numbers share a line.
    expect(text).toContain('VAT 4123456789');
    expect(text).toContain('LPC LPC12345');
    expect(text).toContain('FEE NOTE');
    expect(text).toContain('FN2026-0001');
  });

  it('addresses the client and identifies the matter', () => {
    const text = feeNoteText([line()]);
    expect(text).toContain('Thandiwe Grace Mokoena');
    expect(text).toContain('Mokoena v Mokoena');
    expect(text).toContain('12345/2026');
  });

  /**
   * A client reading one total cannot tell which part is the firm's income and which
   * was paid out on their behalf. The note has to say so.
   */
  it('separates professional fees from disbursements', () => {
    const text = feeNoteText([
      line({ description: 'Drafting summons', unit_amount: 2000 }),
      line({
        description: "Sheriff's fee",
        kind: 'disbursement',
        account: 'trust',
        unit_amount: 350,
        vatable: 0,
      }),
    ]);

    expect(text).toContain('PROFESSIONAL FEES');
    expect(text).toContain('DISBURSEMENTS');
    expect(text).toContain('Amounts paid on your behalf');
    expect(text).toContain('Total professional fees');
    expect(text).toContain('Total disbursements');
  });

  it('shows VAT only on the vatable base, and the correct total', () => {
    const text = feeNoteText([
      line({ unit_amount: 2000 }),
      line({ kind: 'disbursement', account: 'trust', unit_amount: 350, vatable: 0 }),
    ]);
    // 2000 fee + 350 disbursement, VAT 15% on 2000 only = 300 → total 2650
    expect(text).toContain('VAT at 15%');
    expect(text).toContain('R300,00');
    expect(text).toContain('TOTAL DUE');
    expect(text).toContain('R2 650,00');
  });

  it('explains what was drawn from trust', () => {
    const text = feeNoteText([
      line({ unit_amount: 2000 }),
      line({ kind: 'disbursement', account: 'trust', unit_amount: 350, vatable: 0 }),
    ]);
    expect(text).toContain('Trust account');
    expect(text).toContain('R350,00 was paid from funds held in trust');
  });

  it('omits VAT entirely for a firm that is not registered', () => {
    const text = feeNoteText([line({ unit_amount: 1000 })], {
      ...NOTE,
      vat_registered: 0,
    });
    expect(text).not.toContain('VAT at');
    expect(text).toContain('R1 000,00');
  });

  it('shows the unit breakdown when a line is billed by quantity', () => {
    const text = feeNoteText([line({ quantity: 3, unit_amount: 1800 })]);
    expect(text).toContain('3 × R1 800,00');
    expect(text).toContain('R5 400,00');
  });

  it('renders to a valid PDF', async () => {
    const lines = [line({ unit_amount: 2000 })];
    const totals = totalFeeNote(lines, NOTE.vat_rate, true);
    const bytes = await renderDocumentPdf(
      buildFeeNoteDocument(CTX, NOTE, lines, totals, FIXED_NOW),
      { title: 'Fee note FN2026-0001', author: FIRM.name },
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toContain('FN2026-0001');
    // Same PDF/A machinery as the court bundle.
    expect(new TextDecoder('latin1').decode(bytes)).toContain('<pdfaid:part>2</pdfaid:part>');
  });
});

// ---------------------------------------------------------------------------

function serviceEvent(over: Partial<ServiceEvent> = {}): ServiceEvent {
  return {
    id: 'svc-1',
    matter_id: 'matter-1',
    document_id: null,
    status: 'instructed',
    sheriff_office: 'Sheriff Pretoria East',
    sheriff_reference: 'SPE/2026/443',
    service_address: '12 Protea Road, Centurion',
    manner: 'domicilium',
    manner_detail: '',
    served_on: '',
    instructed_at: '2026-08-03',
    served_at: '',
    return_received_at: '',
    non_service_reason: '',
    fee: 350,
    notes: '',
    created_by: 'user-1',
    created_at: '2026-08-03 09:00:00',
    updated_at: '2026-08-03 09:00:00',
    ...over,
  };
}

describe('Sheriff instruction', () => {
  const text = (event = serviceEvent()) =>
    renderPlainText(
      buildSheriffInstruction(CTX, event, 'Combined Summons', FIXED_NOW),
      100,
    ).replace(/\u00A0/g, ' ');

  it('is addressed to the Sheriff and identifies the matter', () => {
    const out = text();
    expect(out).toContain('Sheriff Pretoria East');
    expect(out).toContain('INSTRUCTION TO SERVE');
    expect(out).toContain('12345/2026');
    expect(out).toContain('SPE/2026/443');
  });

  it('names the defendant and the address for service', () => {
    const out = text();
    expect(out).toContain('Sipho Daniel Mokoena');
    expect(out).toContain('12 Protea Road, Centurion');
  });

  it('states the manner of service and cites Rule 4', () => {
    const out = text();
    expect(out).toContain('domicilium citandi et executandi');
    expect(out).toContain('Rule 4 of the Uniform Rules of Court');
  });

  /** The return is what proves service, so the letter must ask for it. */
  it('asks for the return of service', () => {
    expect(text()).toContain('return of service');
  });

  it('uses the free-text description when the manner is "other"', () => {
    const out = text(
      serviceEvent({ manner: 'other', manner_detail: 'By agreement with the attorney of record' }),
    );
    expect(out).toContain('by agreement with the attorney of record');
  });

  it('still produces a usable letter when the manner was never recorded', () => {
    const out = text(serviceEvent({ manner: '', manner_detail: '' }));
    expect(out).toContain('INSTRUCTION TO SERVE');
    expect(out).toContain('12 Protea Road, Centurion');
    // No dangling reference to a rule when no manner was chosen.
    expect(out).not.toContain('Rule 4 of the Uniform Rules of Court');
  });

  it('falls back to a placeholder when no address was recorded', () => {
    expect(text(serviceEvent({ service_address: '' }))).toContain('[address for service]');
  });

  it('renders to a valid PDF', async () => {
    const bytes = await renderDocumentPdf(
      buildSheriffInstruction(CTX, serviceEvent(), 'Combined Summons', FIXED_NOW),
      { title: 'Instruction to Sheriff', author: FIRM.name },
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    // A letter to the Sheriff belongs on one page.
    expect(pdf.getPageCount()).toBe(1);
    expect(new TextDecoder('latin1').decode(bytes)).toContain('<pdfaid:conformance>B');
  });
});

/**
 * A fee note whose total sits alone on page two looks like a mistake to the client
 * receiving it. A note of ordinary length belongs on one page.
 */
describe('fee note pagination', () => {
  it('fits a typical note on a single page', async () => {
    const lines = [
      line({ description: 'Consultation and drafting of summons', quantity: 3, unit_amount: 1800 }),
      line({
        description: "Sheriff's fee — service on defendant",
        kind: 'disbursement',
        account: 'trust',
        unit_amount: 350,
        vatable: 0,
      }),
    ];
    const totals = totalFeeNote(lines, NOTE.vat_rate, true);
    const bytes = await renderDocumentPdf(
      buildFeeNoteDocument(CTX, NOTE, lines, totals, FIXED_NOW),
      { title: 'Fee note', author: FIRM.name },
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
  });

  it('still paginates a long note rather than truncating it', async () => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      line({ description: `Attendance on file, item ${i + 1}`, unit_amount: 450 }),
    );
    const totals = totalFeeNote(lines, NOTE.vat_rate, true);
    const bytes = await renderDocumentPdf(
      buildFeeNoteDocument(CTX, NOTE, lines, totals, FIXED_NOW),
      { title: 'Fee note', author: FIRM.name },
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
