/**
 * Sheriff service tracking.
 *
 * A summons has no legal effect until it is served, and the Sheriff's return of
 * service is the proof. Until that return is filed the matter cannot proceed to
 * default judgment, so this is the record the action depends on.
 */

import {
  SERVICE_STATUSES,
  serviceEventSchema,
  type Matter,
  type ServiceEvent,
  type ServiceStatus,
} from '@bbcm/schema';
import { buildSheriffInstruction, renderDocumentPdf } from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { buildMatterContext } from '../lib/matters.js';

export const serviceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
serviceRoutes.use('*', requireAuth);

/**
 * Permitted status moves.
 *
 * Service is a chain of real-world events, so the record should only move forward:
 * a return cannot be filed for service that was never instructed, and a matter that
 * has already been served should not silently revert. `not_served` loops back to
 * `instructed` because re-instruction after a failed attempt is routine.
 */
const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  instructed: ['served', 'not_served'],
  served: ['return_filed'],
  not_served: ['instructed', 'return_filed'],
  return_filed: [],
};

const WRITABLE = [
  'document_id', 'sheriff_office', 'sheriff_reference', 'service_address',
  'manner', 'manner_detail', 'served_on', 'instructed_at', 'served_at',
  'return_received_at', 'non_service_reason', 'fee', 'notes',
] as const;

serviceRoutes.get('/:matterId/service', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM service_events WHERE matter_id = ?1 ORDER BY created_at DESC',
  )
    .bind(matter.id)
    .all<ServiceEvent>();

  // A matter is served once any event has a filed return.
  const proved = results.some((event) => event.status === 'return_filed');

  return c.json({
    events: results,
    summary: {
      total: results.length,
      service_proved: proved,
      awaiting_return: results.some((event) => event.status === 'served'),
      failed_attempts: results.filter((event) => event.status === 'not_served').length,
    },
  });
});

serviceRoutes.post('/:matterId/service', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const parsed = serviceEventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const id = crypto.randomUUID();
  const data = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO service_events
      (id, matter_id, document_id, status, sheriff_office, sheriff_reference,
       service_address, manner, manner_detail, served_on, instructed_at, served_at,
       return_received_at, non_service_reason, fee, notes, created_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
  )
    .bind(
      id, matter.id, data.document_id ?? null, data.status, data.sheriff_office,
      data.sheriff_reference, data.service_address, data.manner, data.manner_detail,
      data.served_on, data.instructed_at || new Date().toISOString().slice(0, 10),
      data.served_at, data.return_received_at, data.non_service_reason, data.fee,
      data.notes, c.get('user').id,
    )
    .run();

  await audit(c, {
    action: 'service.instruct',
    entity: 'service_events',
    entity_id: id,
    matter_id: matter.id,
    detail: `${data.sheriff_office || 'Sheriff'} — ${data.service_address}`,
  });

  const created = await c.env.DB.prepare('SELECT * FROM service_events WHERE id = ?1')
    .bind(id)
    .first<ServiceEvent>();

  return c.json({ event: created }, 201);
});

serviceRoutes.patch('/:matterId/service/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const existing = await c.env.DB.prepare(
    'SELECT * FROM service_events WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<ServiceEvent>();

  if (!existing) throw new HTTPException(404, { message: 'Service record not found' });

  const parsed = serviceEventSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  if (data.status && data.status !== existing.status) {
    if (!TRANSITIONS[existing.status].includes(data.status)) {
      throw new HTTPException(422, {
        message: `A record that is "${existing.status}" cannot move to "${data.status}".`,
      });
    }
    // A return is proof of what happened; it needs a date to be worth anything.
    if (data.status === 'return_filed' && !(data.return_received_at || existing.return_received_at)) {
      throw new HTTPException(422, {
        message: 'Record the date the return of service was received before filing it.',
      });
    }
    if (data.status === 'served' && !(data.served_at || existing.served_at)) {
      throw new HTTPException(422, { message: 'Record the date service was effected.' });
    }
    if (data.status === 'not_served' && !(data.non_service_reason || existing.non_service_reason)) {
      throw new HTTPException(422, { message: 'Record why service could not be effected.' });
    }
  }

  const columns = WRITABLE.filter((column) => data[column] !== undefined);
  const assignments = [...columns.map((c2, i) => `${c2} = ?${i + 1}`)];
  const values: unknown[] = columns.map((column) => data[column] as never);

  if (data.status) {
    assignments.push(`status = ?${values.length + 1}`);
    values.push(data.status);
  }

  if (assignments.length > 0) {
    await c.env.DB.prepare(
      `UPDATE service_events SET ${assignments.join(', ')}, updated_at = datetime('now')
       WHERE id = ?${values.length + 1}`,
    )
      .bind(...(values as never[]), existing.id)
      .run();
  }

  await audit(c, {
    action: data.status ? `service.${data.status}` : 'service.update',
    entity: 'service_events',
    entity_id: existing.id,
    matter_id: matter.id,
    detail: data.status ?? columns.join(','),
  });

  const updated = await c.env.DB.prepare('SELECT * FROM service_events WHERE id = ?1')
    .bind(existing.id)
    .first<ServiceEvent>();

  return c.json({ event: updated });
});

serviceRoutes.delete('/:matterId/service/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const result = await c.env.DB.prepare(
    'DELETE FROM service_events WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .run();

  if (result.meta.changes === 0) {
    throw new HTTPException(404, { message: 'Service record not found' });
  }

  await audit(c, {
    action: 'service.delete',
    entity: 'service_events',
    entity_id: c.req.param('id'),
    matter_id: matter.id,
  });

  return c.json({ ok: true });
});

export { SERVICE_STATUSES };

/**
 * The written instruction to the Sheriff, as a PDF.
 *
 * The Sheriff acts on a written instruction identifying the process, the person to be
 * served and the address — so recording the instruction without producing one left the
 * attorney to write it by hand.
 */
serviceRoutes.get('/:matterId/service/:id/instruction', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const event = await c.env.DB.prepare(
    'SELECT * FROM service_events WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<ServiceEvent>();

  if (!event) throw new HTTPException(404, { message: 'Service record not found' });

  const ctx = await buildMatterContext(c.env, matter);

  // Name the process being served, falling back to the generic term when the
  // instruction was recorded before any document was generated.
  let documentTitle = 'Combined Summons and Particulars of Claim';
  if (event.document_id) {
    const document = await c.env.DB.prepare(
      'SELECT title FROM generated_documents WHERE id = ?1',
    )
      .bind(event.document_id)
      .first<{ title: string }>();
    if (document?.title) documentTitle = document.title;
  }

  const ast = buildSheriffInstruction(
    { matter, firm: ctx.firm, attorney: ctx.attorney },
    event,
    documentTitle,
  );

  const bytes = await renderDocumentPdf(ast, {
    title: `Instruction to Sheriff — ${matter.case_reference || matter.id.slice(0, 8)}`,
    author: ctx.firm.name,
    subject: `${matter.plaintiff_surname} v ${matter.defendant_surname}`,
  });

  await audit(c, {
    action: 'service.instruction_export',
    entity: 'service_events',
    entity_id: event.id,
    matter_id: matter.id,
    detail: event.sheriff_office,
  });

  const reference = (matter.case_number || matter.case_reference || matter.id.slice(0, 8))
    .replace(/[\\/:*?"<>|]/g, '-');
  const fileName = `${reference} Instruction to Sheriff.pdf`;

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
