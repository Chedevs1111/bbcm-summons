/**
 * Fee notes.
 *
 * The Legal Practice Act requires a firm to keep client money in a trust account
 * separate from its own. Every line therefore records which ledger it belongs to:
 * professional fees are earned by the firm (business), while disbursements are money
 * laid out on the client's behalf (trust). Getting that split wrong is a
 * disciplinary matter, not a bookkeeping inconvenience.
 */

import {
  feeNoteSchema,
  totalFeeNote,
  type FeeNote,
  type FeeNoteLine,
  type Matter,
} from '@bbcm/schema';
import { buildFeeNoteDocument, renderDocumentPdf } from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { buildMatterContext } from '../lib/matters.js';

export const feeNoteRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
feeNoteRoutes.use('*', requireAuth);

async function loadLines(env: Env, feeNoteId: string): Promise<FeeNoteLine[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM fee_note_lines WHERE fee_note_id = ?1 ORDER BY sort_order',
  )
    .bind(feeNoteId)
    .all<FeeNoteLine>();
  return results;
}

function withTotals(note: FeeNote, lines: FeeNoteLine[]) {
  return {
    ...note,
    lines,
    totals: totalFeeNote(lines, note.vat_rate, note.vat_registered === 1),
  };
}

/** Sequential per firm and year, which is what an auditor expects to see. */
async function nextNoteNumber(env: Env, firmId: string): Promise<string> {
  const year = new Date().getFullYear();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM fee_notes f
     JOIN matters m ON m.id = f.matter_id
     WHERE m.firm_id = ?1 AND f.note_number LIKE ?2`,
  )
    .bind(firmId, `FN${year}-%`)
    .first<{ n: number }>();
  return `FN${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

feeNoteRoutes.get('/:matterId/fee-notes', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM fee_notes WHERE matter_id = ?1 ORDER BY created_at DESC',
  )
    .bind(matter.id)
    .all<FeeNote>();

  const notes = await Promise.all(
    results.map(async (note) => withTotals(note, await loadLines(c.env, note.id))),
  );

  return c.json({
    fee_notes: notes,
    summary: {
      // Only issued notes represent money actually claimed from the client.
      billed: notes
        .filter((note) => note.status !== 'draft')
        .reduce((sum, note) => sum + note.totals.total, 0),
      outstanding: notes
        .filter((note) => note.status === 'issued')
        .reduce((sum, note) => sum + note.totals.total, 0),
      trust_held: notes.reduce((sum, note) => sum + note.totals.trust, 0),
    },
  });
});

feeNoteRoutes.post('/:matterId/fee-notes', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const parsed = feeNoteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const id = crypto.randomUUID();
  const noteNumber = data.note_number || (await nextNoteNumber(c.env, matter.firm_id));

  await c.env.DB.prepare(
    `INSERT INTO fee_notes
      (id, matter_id, note_number, status, issued_at, due_at, paid_at,
       vat_rate, vat_registered, notes, created_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  )
    .bind(
      id, matter.id, noteNumber, data.status, data.issued_at, data.due_at, data.paid_at,
      data.vat_rate, data.vat_registered ? 1 : 0, data.notes, c.get('user').id,
    )
    .run();

  await replaceLines(c.env, id, data.lines ?? []);

  await audit(c, {
    action: 'fee_note.create',
    entity: 'fee_notes',
    entity_id: id,
    matter_id: matter.id,
    detail: noteNumber,
  });

  const note = await c.env.DB.prepare('SELECT * FROM fee_notes WHERE id = ?1')
    .bind(id)
    .first<FeeNote>();

  return c.json({ fee_note: withTotals(note!, await loadLines(c.env, id)) }, 201);
});

feeNoteRoutes.patch('/:matterId/fee-notes/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const existing = await c.env.DB.prepare(
    'SELECT * FROM fee_notes WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<FeeNote>();

  if (!existing) throw new HTTPException(404, { message: 'Fee note not found' });

  const parsed = feeNoteSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  // An issued note has gone to the client. Amending the amounts afterwards would
  // leave the client holding a document that no longer matches the record, so the
  // lines freeze once it is issued — a correction is a new note or a credit.
  if (existing.status !== 'draft' && data.lines) {
    throw new HTTPException(422, {
      message: 'This fee note has been issued. Raise a new note rather than changing its lines.',
    });
  }

  const columns = (['note_number', 'status', 'issued_at', 'due_at', 'paid_at', 'vat_rate', 'notes'] as const)
    .filter((column) => data[column] !== undefined);

  const assignments = columns.map((column, index) => `${column} = ?${index + 1}`);
  const values: unknown[] = columns.map((column) => data[column] as never);

  if (data.vat_registered !== undefined) {
    assignments.push(`vat_registered = ?${values.length + 1}`);
    values.push(data.vat_registered ? 1 : 0);
  }

  // Issuing stamps the date if the caller did not supply one.
  if (data.status === 'issued' && !data.issued_at && !existing.issued_at) {
    assignments.push(`issued_at = ?${values.length + 1}`);
    values.push(new Date().toISOString().slice(0, 10));
  }

  if (assignments.length > 0) {
    await c.env.DB.prepare(
      `UPDATE fee_notes SET ${assignments.join(', ')}, updated_at = datetime('now')
       WHERE id = ?${values.length + 1}`,
    )
      .bind(...(values as never[]), existing.id)
      .run();
  }

  if (data.lines) await replaceLines(c.env, existing.id, data.lines);

  await audit(c, {
    action: data.status ? `fee_note.${data.status}` : 'fee_note.update',
    entity: 'fee_notes',
    entity_id: existing.id,
    matter_id: matter.id,
    detail: existing.note_number,
  });

  const note = await c.env.DB.prepare('SELECT * FROM fee_notes WHERE id = ?1')
    .bind(existing.id)
    .first<FeeNote>();

  return c.json({ fee_note: withTotals(note!, await loadLines(c.env, existing.id)) });
});

feeNoteRoutes.delete('/:matterId/fee-notes/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const existing = await c.env.DB.prepare(
    'SELECT * FROM fee_notes WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<FeeNote>();

  if (!existing) throw new HTTPException(404, { message: 'Fee note not found' });
  if (existing.status !== 'draft') {
    throw new HTTPException(422, {
      message: 'An issued fee note is part of the accounting record and cannot be deleted.',
    });
  }

  await c.env.DB.prepare('DELETE FROM fee_notes WHERE id = ?1').bind(existing.id).run();
  await audit(c, {
    action: 'fee_note.delete',
    entity: 'fee_notes',
    entity_id: existing.id,
    matter_id: matter.id,
    detail: existing.note_number,
  });

  return c.json({ ok: true });
});

async function replaceLines(
  env: Env,
  feeNoteId: string,
  lines: Array<Record<string, unknown>>,
): Promise<void> {
  await env.DB.prepare('DELETE FROM fee_note_lines WHERE fee_note_id = ?1')
    .bind(feeNoteId)
    .run();
  if (lines.length === 0) return;

  await env.DB.batch(
    lines.map((line, index) =>
      env.DB.prepare(
        `INSERT INTO fee_note_lines
          (id, fee_note_id, description, kind, account, service_date, quantity,
           unit_amount, vatable, sort_order)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        crypto.randomUUID(), feeNoteId, line.description, line.kind ?? 'fee',
        line.account ?? 'business', line.service_date ?? '', line.quantity ?? 1,
        line.unit_amount ?? 0, line.vatable === false ? 0 : 1, index,
      ),
    ),
  );
}

/**
 * The fee note as a PDF the client can be sent.
 *
 * Rendered on demand rather than stored: the note's own status guarantees the content
 * cannot drift, because lines freeze the moment it is issued.
 */
feeNoteRoutes.get('/:matterId/fee-notes/:id/pdf', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const note = await c.env.DB.prepare(
    'SELECT * FROM fee_notes WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<FeeNote>();

  if (!note) throw new HTTPException(404, { message: 'Fee note not found' });

  const lines = await loadLines(c.env, note.id);
  const ctx = await buildMatterContext(c.env, matter);
  const totals = totalFeeNote(lines, note.vat_rate, note.vat_registered === 1);

  const ast = buildFeeNoteDocument(
    { matter, firm: ctx.firm, attorney: ctx.attorney },
    note,
    lines,
    totals,
  );

  const bytes = await renderDocumentPdf(ast, {
    title: `Fee note ${note.note_number}`,
    author: ctx.firm.name,
    subject: `${matter.plaintiff_surname} v ${matter.defendant_surname}`,
    header: matter.case_number ? `Case No: ${matter.case_number}` : undefined,
  });

  await audit(c, {
    action: 'fee_note.export',
    entity: 'fee_notes',
    entity_id: note.id,
    matter_id: matter.id,
    detail: note.note_number,
  });

  const fileName = `${note.note_number} Fee Note.pdf`.replace(/[\\/:*?"<>|]/g, '-');

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
