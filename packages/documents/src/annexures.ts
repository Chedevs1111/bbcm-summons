/**
 * Annexure numbering and schedule rendering.
 *
 * Ported from the original app: annexures A, B and C are reserved for the standard
 * bundle (marriage certificate, identity documents, birth certificates) and uploaded
 * attachments are auto-lettered from D onward in sort order. Renumbering reassigns
 * both the letter and the ordinal in one pass.
 */

import { DOCUMENT_TYPE_LABELS, annexureLabel, type MatterAttachment } from '@bbcm/schema';
import type { MatterContext } from './types.js';

export interface NumberedAnnexure {
  id: string;
  /** Ordinal within the bundle — starts at 4, after the three reserved annexures. */
  number: number;
  /** Letter label, D onward. */
  label: string;
  description: string;
  file_name: string;
  attached: boolean;
}

/** Assigns labels and ordinals to attachments in sort order. */
export function numberAnnexures(attachments: MatterAttachment[]): NumberedAnnexure[] {
  return [...attachments]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((attachment, index) => ({
      id: attachment.id,
      number: index + 4,
      label: attachment.annexure_label || annexureLabel(index),
      description:
        DOCUMENT_TYPE_LABELS[attachment.document_type] ?? attachment.document_type,
      file_name: attachment.file_name,
      attached: true,
    }));
}

/** Recomputes sort_order, label and number after a drag-reorder in the Annexure Manager. */
export function renumberAnnexures(
  attachments: MatterAttachment[],
): Array<{ id: string; sort_order: number; annexure_label: string; annexure_number: number }> {
  return attachments.map((attachment, index) => ({
    id: attachment.id,
    sort_order: index,
    annexure_label: annexureLabel(index),
    annexure_number: index + 1,
  }));
}

/** Renders the {{ANNEXURE_ITEMS}} body of the Annexure Schedule. */
export function buildAnnexureItems(ctx: MatterContext): string {
  const annexures = numberAnnexures(ctx.attachments);
  if (annexures.length === 0) return '[No annexures attached]';

  const header = `{{B}}Annexure     Description                                    File{{/B}}`;
  const rows = annexures.map((annexure) => {
    const label = `"${annexure.label}"`.padEnd(9);
    const description = annexure.description.substring(0, 43).padEnd(43);
    return `${annexure.number}.   ${label}${description}${annexure.file_name}`;
  });

  return [header, '', ...rows, '', `{{B}}Total Annexures: ${annexures.length}{{/B}}`].join('\n');
}

/**
 * Renders the {{INDEX_ITEMS}} body of the Index page: the pleadings in filing order
 * followed by every annexure.
 */
export function buildIndexItems(ctx: MatterContext, includedDocuments: string[]): string {
  const labels: Record<string, string> = {
    summons: 'Combined Summons',
    particulars_of_claim: 'Particulars of Claim',
    settlement_agreement: 'Settlement Agreement',
    annexure_schedule: 'Annexure Schedule',
    notice_set_down: 'Notice of Set Down',
    notice_no_objection: 'Notice of No Objection',
  };

  const lines: string[] = [];
  let n = 1;

  for (const documentType of includedDocuments) {
    if (documentType === 'index_page') continue;
    lines.push(`${n}. ${labels[documentType] ?? documentType}`);
    n += 1;
  }

  if (ctx.matter.marriage_certificate_attached === 1) {
    lines.push(`${n}. Annexure "A" — Marriage Certificate`);
    n += 1;
  }
  lines.push(`${n}. Annexure "B" — Identity Documents`);
  n += 1;

  if (ctx.children.some((child) => child.birth_cert_attached === 1)) {
    lines.push(`${n}. Annexure "C" — Birth Certificates`);
    n += 1;
  }

  for (const annexure of numberAnnexures(ctx.attachments)) {
    lines.push(`${n}. Annexure "${annexure.label}" — ${annexure.description}`);
    n += 1;
  }

  return lines.join('\n');
}
