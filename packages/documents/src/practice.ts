/**
 * Practice documents: the fee note a client is sent, and the letter instructing the
 * Sheriff to serve.
 *
 * Both were data-only until now — the firm could record a fee note but not send one,
 * and could record an instruction to the Sheriff that existed nowhere as a document.
 * Both are built from the same marker grammar as the pleadings, so they render through
 * the existing PDF pipeline.
 */

import type {
  FeeNote,
  FeeNoteLine,
  FeeNoteTotals,
  LawFirm,
  Matter,
  ServiceEvent,
  ServiceManner,
} from '@bbcm/schema';
import { SERVICE_MANNER_LABELS } from '@bbcm/schema';
import { parseDocument, type DocumentAst } from './markers.js';
import { buildCourtHeading, formatLongDate, formatRands } from './variables.js';

/** Width of the description column before amounts are pushed to the right margin. */
function moneyLine(label: string, amount: number, bold = false): string {
  const text = bold ? `{{B}}${label}{{/B}}` : label;
  const value = bold ? `{{B}}${formatRands(amount)}{{/B}}` : formatRands(amount);
  return `${text}{{R}}${value}{{/R}}`;
}

/**
 * The firm's letterhead, in three lines rather than five.
 *
 * Compact by design: a fee note whose total is pushed onto a second page by an
 * over-tall letterhead looks like an error to the client receiving it.
 */
function letterhead(firm: LawFirm): string[] {
  const address = [firm.address, firm.city, firm.province].filter(Boolean).join(', ');
  const contact = [firm.phone, firm.email].filter(Boolean).join('  ·  ');
  const registrations = [
    firm.vat_number ? `VAT ${firm.vat_number}` : '',
    firm.lpc_number ? `LPC ${firm.lpc_number}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return [
    `{{C}}{{B}}${firm.name.toUpperCase()}{{/B}}{{/C}}`,
    address ? `{{C}}${address}{{/C}}` : '',
    [contact, registrations].filter(Boolean).join('  ·  ')
      ? `{{C}}${[contact, registrations].filter(Boolean).join('  ·  ')}{{/C}}`
      : '',
  ].filter(Boolean);
}

export interface PracticeContext {
  matter: Matter;
  firm: LawFirm;
  attorney: { full_name: string; lpc_number: string } | null;
}

/**
 * The fee note as the client receives it.
 *
 * Fees and disbursements are listed separately because they are different things in
 * law: fees are the firm's own income, disbursements are money laid out on the
 * client's behalf and drawn from trust. The note says so explicitly, since a client
 * reading a single total has no way to tell.
 */
export function buildFeeNoteDocument(
  ctx: PracticeContext,
  note: FeeNote,
  lines: FeeNoteLine[],
  totals: FeeNoteTotals,
  now = new Date(),
): DocumentAst {
  const { firm, matter } = ctx;
  const client = `${matter.plaintiff_full_names} ${matter.plaintiff_surname}`.trim();

  const fees = lines.filter((line) => line.kind === 'fee');
  const disbursements = lines.filter((line) => line.kind === 'disbursement');

  const renderLines = (rows: FeeNoteLine[]) =>
    rows.map((row) => {
      const amount = row.quantity * row.unit_amount;
      const quantity = row.quantity !== 1 ? ` (${row.quantity} × ${formatRands(row.unit_amount)})` : '';
      const date = row.service_date ? `${row.service_date}  ` : '';
      return moneyLine(`${date}${row.description}${quantity}`, amount);
    });

  const body: string[] = [...letterhead(firm)];

  body.push(
    '',
    '══════════════════════════════════════════',
    '{{C}}{{B}}{{U}}FEE NOTE{{/U}}{{/B}}{{/C}}',
    '══════════════════════════════════════════',
    '',
    `{{B}}Fee note number:{{/B}} ${note.note_number}{{R}}${
      note.issued_at ? formatLongDate(note.issued_at) : formatLongDate(now.toISOString().slice(0, 10))
    }{{/R}}`,
    '',
    `{{B}}To:{{/B}} ${client || 'The client'}`,
    matter.plaintiff_physical_address,
    '',
    [
      `{{B}}Matter:{{/B}} ${matter.plaintiff_surname} v ${matter.defendant_surname}`,
      matter.court_name ? `{{B}}Court:{{/B}} ${matter.court_name}` : '',
    ]
      .filter(Boolean)
      .join('     '),
    [
      `{{B}}Our reference:{{/B}} ${matter.case_reference || '—'}`,
      matter.case_number ? `{{B}}Case number:{{/B}} ${matter.case_number}` : '',
    ]
      .filter(Boolean)
      .join('     '),
    '──────────────────────────────────────────',
  );

  if (fees.length > 0) {
    body.push('{{B}}PROFESSIONAL FEES{{/B}}', ...renderLines(fees));
    body.push(moneyLine('Total professional fees', totals.fees), '');
  }

  if (disbursements.length > 0) {
    body.push(
      '{{B}}DISBURSEMENTS{{/B}}',
      '{{I}}Amounts paid on your behalf and drawn from our trust account.{{/I}}',
      ...renderLines(disbursements),
      moneyLine('Total disbursements', totals.disbursements),
      '',
    );
  }

  body.push('──────────────────────────────────────────');

  if (note.vat_registered === 1 && totals.vat > 0) {
    body.push(moneyLine(`VAT at ${note.vat_rate}%`, totals.vat));
  }
  body.push(moneyLine('TOTAL DUE', totals.total, true), '');

  if (totals.trust > 0) {
    body.push(
      '{{B}}Trust account{{/B}}',
      `Of the total above, ${formatRands(totals.trust)} was paid from funds held in trust on your behalf. The balance is for the account of this firm.`,
      '',
    );
  }

  if (note.due_at) {
    body.push(`{{B}}Payable by:{{/B}} ${formatLongDate(note.due_at)}`, '');
  }

  if (note.notes) body.push(note.notes, '');

  body.push(
    '_______________________________________',
    [ctx.attorney?.full_name ?? '', ctx.attorney?.lpc_number ? `(LPC ${ctx.attorney.lpc_number})` : '']
      .filter(Boolean)
      .join('  '),
    firm.name.toUpperCase(),
  );

  return parseDocument(body.join('\n'));
}

/**
 * The letter instructing the Sheriff to serve.
 *
 * The Sheriff acts on a written instruction identifying the process, the person to be
 * served and the address. It closes by asking for the return of service, because the
 * return is what proves service and the matter cannot move without it.
 */
export function buildSheriffInstruction(
  ctx: PracticeContext,
  event: ServiceEvent,
  documentTitle: string,
  now = new Date(),
): DocumentAst {
  const { firm, matter } = ctx;
  const defendant = `${matter.defendant_full_names} ${matter.defendant_surname}`.trim();
  const mannerLabel =
    event.manner === 'other'
      ? event.manner_detail || 'as directed'
      : SERVICE_MANNER_LABELS[event.manner as ServiceManner] ?? '';

  const body = [
    ...letterhead(firm),
    '',
    `{{B}}${event.sheriff_office || 'THE SHERIFF OF THE COURT'}{{/B}}{{R}}${formatLongDate(
      event.instructed_at || now.toISOString().slice(0, 10),
    )}{{/R}}`,
    '',
    'Dear Sir / Madam',
    '',
    `{{C}}{{B}}{{U}}INSTRUCTION TO SERVE{{/U}}{{/B}}{{/C}}`,
    '',
    `{{B}}${buildCourtHeading(matter).replace(/\n/g, ' — ')}{{/B}}`,
    `{{B}}Case number:{{/B}} ${matter.case_number || '______________'}`,
    // References share a line; a letter to the Sheriff should not run to a second page.
    [
      `{{B}}Our reference:{{/B}} ${matter.case_reference || '—'}`,
      event.sheriff_reference ? `{{B}}Your reference:{{/B}} ${event.sheriff_reference}` : '',
    ]
      .filter(Boolean)
      .join('     '),
    '',
    `{{B}}${matter.plaintiff_full_names} ${matter.plaintiff_surname}{{/B}}{{R}}{{B}}PLAINTIFF{{/B}}{{/R}}`,
    'and',
    `{{B}}${defendant}{{/B}}{{R}}{{B}}DEFENDANT{{/B}}{{/R}}`,
    '',
    `We enclose the ${documentTitle} in the above matter and instruct you to serve it upon the Defendant, ${defendant}, at:`,
    '',
    `{{B}}${event.service_address || '[address for service]'}{{/B}}`,
    '',
    mannerLabel
      ? `Service is to be effected ${mannerLabel.toLowerCase()}, in accordance with Rule 4 of the Uniform Rules of Court.`
      : '',
    '',
    'Kindly furnish us with your return of service as soon as service has been effected, together with your account.',
    '',
    'Yours faithfully',
    '',
    '_______________________________________',
    [ctx.attorney?.full_name ?? '', ctx.attorney?.lpc_number ? `(LPC ${ctx.attorney.lpc_number})` : '']
      .filter(Boolean)
      .join('  '),
    `${firm.name.toUpperCase()} — Attorneys for the Plaintiff`,
  ];

  return parseDocument(body.join('\n'));
}
