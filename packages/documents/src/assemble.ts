/**
 * Template selection and document assembly.
 *
 * Pure functions: `(MatterContext) → AssembledDocument`. No database or network access,
 * which is what makes the golden-file tests in ../test possible.
 */

import type { FirmTemplate, GeneratedDocumentType } from '@bbcm/schema';
import { GENERATED_DOCUMENT_LABELS } from '@bbcm/schema';
import { buildAnnexureItems, buildIndexItems } from './annexures.js';
import { buildClauseVariables, selectClauses } from './clauses.js';
import { renderHtml, parseDocument, renderPlainText, substituteVariables } from './markers.js';
import type { AssembledDocument, MatterContext } from './types.js';
import { buildVariables } from './variables.js';

/**
 * Picks the best template for a document type.
 *
 * A template is eligible when each of marriage_regime / is_contested / has_children is
 * either null (applies to any) or equal to the matter's value. Among eligible templates
 * the most specific wins — i.e. the one with the most non-null constraints — with
 * is_default breaking ties.
 */
export function selectTemplate(
  ctx: MatterContext,
  documentType: GeneratedDocumentType,
): FirmTemplate | null {
  const hasChildren = ctx.children.length > 0 ? 1 : 0;
  const isContested = ctx.matter.is_contested;

  const eligible = ctx.templates.filter((template) => {
    if (template.document_type !== documentType) return false;
    if (template.is_active !== 1) return false;
    if (template.marriage_regime !== null && template.marriage_regime !== ctx.matter.marriage_regime) {
      return false;
    }
    if (template.is_contested !== null && template.is_contested !== isContested) return false;
    if (template.has_children !== null && template.has_children !== hasChildren) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const specificity = (t: FirmTemplate) =>
    (t.marriage_regime !== null ? 1 : 0) +
    (t.is_contested !== null ? 1 : 0) +
    (t.has_children !== null ? 1 : 0);

  return eligible.sort((a, b) => {
    const diff = specificity(b) - specificity(a);
    if (diff !== 0) return diff;
    return b.is_default - a.is_default;
  })[0]!;
}

/** Renders the applicable clause library entries as a numbered block. */
export function buildClauseBlock(ctx: MatterContext, startNumber = 1): string {
  const clauses = selectClauses(ctx);
  if (clauses.length === 0) return '';
  return clauses
    .map((clause, index) => `${startNumber + index}. ${clause.body}`)
    .join('\n\n');
}

/**
 * Builds the complete variable map, including the document-specific tokens
 * ({{INDEX_ITEMS}}, {{ANNEXURE_ITEMS}}, {{CLAUSES}}).
 */
export function buildAllVariables(
  ctx: MatterContext,
  documentType: GeneratedDocumentType,
  includedDocuments: GeneratedDocumentType[],
  now = new Date(),
): Record<string, string> {
  return {
    ...buildVariables(ctx, now),
    ...buildClauseVariables(ctx),
    INDEX_ITEMS: buildIndexItems(ctx, includedDocuments),
    ANNEXURE_ITEMS: buildAnnexureItems(ctx),
    CLAUSES: buildClauseBlock(ctx),
    DOCUMENT_TITLE: GENERATED_DOCUMENT_LABELS[documentType],
  };
}

/**
 * Assembles one document. Clause variables are resolved in a second pass because
 * clause bodies themselves contain {{VARIABLE}} tokens.
 */
export function assembleDocument(
  ctx: MatterContext,
  documentType: GeneratedDocumentType,
  options: { includedDocuments?: GeneratedDocumentType[]; now?: Date } = {},
): AssembledDocument | null {
  const template = selectTemplate(ctx, documentType);
  if (!template) return null;

  const includedDocuments = options.includedDocuments ?? [documentType];
  const now = options.now ?? new Date();
  const variables = buildAllVariables(ctx, documentType, includedDocuments, now);

  // First pass expands the template's own tokens (including {{CLAUSES}}); the second
  // resolves tokens that came in from clause bodies.
  const firstPass = substituteVariables(template.body, variables);
  const body = substituteVariables(firstPass, variables);

  const ast = parseDocument(body);

  return {
    document_type: documentType,
    title: GENERATED_DOCUMENT_LABELS[documentType],
    body,
    html: renderHtml(ast),
    text: renderPlainText(ast),
    template_id: template.id,
  };
}

/** Assembles every document a matter is ready for, in filing order. */
export function assembleBundle(
  ctx: MatterContext,
  documentTypes: GeneratedDocumentType[],
  now = new Date(),
): AssembledDocument[] {
  const results: AssembledDocument[] = [];
  for (const documentType of documentTypes) {
    const document = assembleDocument(ctx, documentType, {
      includedDocuments: documentTypes,
      now,
    });
    if (document) results.push(document);
  }
  return results;
}
