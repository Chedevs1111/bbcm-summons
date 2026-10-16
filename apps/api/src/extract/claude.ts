/**
 * Document extraction with Claude vision.
 *
 * Replaces the original app's `ocr-extract` edge function. Documents are sent to Claude
 * directly — no separate OCR pass — because SA source documents (green barcoded ID books,
 * smart ID cards, DHA marriage certificates, handwritten annotations) lose too much in a
 * text-only OCR step. The model returns structured fields with per-field confidence, which
 * feeds the Review & Confirm and Detailed OCR screens.
 */

import Anthropic from '@anthropic-ai/sdk';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@bbcm/schema';

/** Field names must match `matters` columns so Review & Confirm can apply them directly. */
const FIELDS_BY_DOCUMENT_TYPE: Record<DocumentType, string[]> = {
  marriage_certificate: [
    'marriage_date', 'marriage_place', 'marriage_type', 'marriage_regime',
    'plaintiff_full_names', 'plaintiff_surname', 'plaintiff_id_number',
    'defendant_full_names', 'defendant_surname', 'defendant_id_number',
  ],
  id_document: [
    'full_names', 'surname', 'id_number', 'dob', 'gender',
  ],
  birth_certificate: [
    'child_full_name', 'child_surname', 'child_id_number', 'child_dob', 'child_gender',
    'mother_full_names', 'father_full_names',
  ],
  payslip: [
    'employer', 'employee_number', 'occupation', 'income',
  ],
  pension_document: [
    'pension_fund_name', 'employee_number', 'pension_value',
  ],
  title_deed: [
    'property_description', 'erf_number', 'title_deed_number', 'property_value',
  ],
  bank_account: [
    'bank_name', 'account_number', 'account_balance',
  ],
  other: [],
};

const SYSTEM_PROMPT = `You are a document data extraction system for a South African divorce law practice.

You extract structured field values from scanned documents: Department of Home Affairs marriage certificates and abridged/unabridged birth certificates, green barcoded ID books, smart ID cards, payslips, pension fund statements, title deeds and bank statements.

Rules:
- Extract only what is legibly present in the document. Never infer, complete or guess a value.
- If a field is not present or not legible, omit it entirely rather than returning an empty or placeholder value.
- South African ID numbers are exactly 13 digits. Return digits only, no spaces.
- Return dates in ISO format (YYYY-MM-DD). Interpret ambiguous numeric dates as DD/MM/YYYY, which is South African convention.
- Names: return given names and surname separately. Preserve the spelling and diacritics exactly as printed.
- Monetary amounts: return the number only, no currency symbol or thousands separator.
- marriage_regime must be one of: in_community, out_of_community_with_accrual, out_of_community_without_accrual, customary.
- marriage_type must be one of: civil, customary, civil_union, religious.
- gender must be one of: male, female.

Confidence must reflect how legible the source is, not how plausible the value looks. Use below 0.6 when the text is blurred, cropped, handwritten or partially obscured — the attorney reviews anything under 0.8 before it reaches a court document.`;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    document_type_detected: {
      type: 'string',
      description: 'The kind of document you actually see, which may differ from what was claimed.',
    },
    legible: {
      type: 'boolean',
      description: 'False if the document is too blurred, dark or cropped to read reliably.',
    },
    fields: {
      type: 'array',
      description: 'One entry per field you could read. Omit fields that are absent or illegible.',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'The field name.' },
          value: { type: 'string', description: 'The value exactly as it appears.' },
          confidence: {
            type: 'number',
            description: 'Legibility confidence from 0 to 1.',
          },
        },
        required: ['field', 'value', 'confidence'],
        additionalProperties: false,
      },
    },
    raw_text: {
      type: 'string',
      description: 'Full transcription of readable text, for the Detailed OCR view.',
    },
    notes: {
      type: 'string',
      description: 'Anything the reviewing attorney should know, e.g. an amendment or an unclear digit.',
    },
  },
  required: ['document_type_detected', 'legible', 'fields', 'raw_text', 'notes'],
  additionalProperties: false,
} as const;

export interface ExtractionResult {
  document_type_detected: string;
  legible: boolean;
  fields: Array<{ field: string; value: string; confidence: number }>;
  raw_text: string;
  notes: string;
  /** Mean confidence across extracted fields — shown in the Confidence Summary. */
  overall_confidence: number;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Extracts fields from one uploaded document.
 *
 * @param apiKey  Anthropic API key (Worker secret).
 * @param file    Raw bytes from R2.
 * @param contentType MIME type — decides between an image block and a PDF document block.
 * @param documentType What the user said this is; used to target the field list.
 */
export async function extractDocument(
  apiKey: string,
  file: Uint8Array,
  contentType: string,
  documentType: DocumentType,
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey });
  const data = toBase64(file);
  const expectedFields = FIELDS_BY_DOCUMENT_TYPE[documentType];

  const source = IMAGE_TYPES.has(contentType)
    ? ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: contentType as 'image/jpeg', data },
      })
    : ({
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data },
      });

  const instruction = [
    `This document was uploaded as: ${DOCUMENT_TYPE_LABELS[documentType]}.`,
    expectedFields.length > 0
      ? `Extract these fields where legibly present: ${expectedFields.join(', ')}.`
      : 'Extract whatever identifying or financial fields are legibly present.',
    'If the document is not what it was claimed to be, say so in document_type_detected and extract what is actually there.',
  ].join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Effort medium: transcription accuracy comes from the vision pass, not from
    // extended deliberation, and every uploaded page runs through this path.
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    },
    messages: [{ role: 'user', content: [source, { type: 'text', text: instruction }] }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The document could not be processed. Please review it manually.');
  }

  const textBlock = response.content.find(
    (block: Anthropic.ContentBlock) => block.type === 'text',
  );
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Extraction returned no result');
  }

  const parsed = JSON.parse(textBlock.text) as Omit<ExtractionResult, 'overall_confidence'>;

  // Drop anything the model returned with an empty value despite the instruction.
  const fields = (parsed.fields ?? []).filter((f) => f.value?.trim());
  const overall =
    fields.length === 0
      ? 0
      : fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length;

  return { ...parsed, fields, overall_confidence: Number(overall.toFixed(3)) };
}

/**
 * Maps an extracted field onto the matter column it belongs to.
 *
 * ID documents and payslips are party-agnostic in the source document, so the caller
 * tells us which party the upload was filed against.
 */
export function mapFieldToColumn(
  field: string,
  party: 'plaintiff' | 'defendant' | null,
): string | null {
  const partyScoped = new Set([
    'full_names', 'surname', 'id_number', 'dob', 'gender',
    'occupation', 'employer', 'employee_number', 'income',
    'pension_fund_name',
  ]);

  if (partyScoped.has(field)) {
    return party ? `${party}_${field}` : null;
  }
  if (field.startsWith('plaintiff_') || field.startsWith('defendant_')) return field;
  if (field.startsWith('marriage_')) return field;
  return null;
}
