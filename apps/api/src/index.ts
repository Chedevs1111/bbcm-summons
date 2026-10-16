import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, Variables } from './lib/context.js';
import { adminRoutes } from './routes/admin.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { bundleRoutes } from './routes/bundle.js';
import { documentRoutes } from './routes/documents.js';
import { feeNoteRoutes } from './routes/feeNotes.js';
import { lookupRoutes } from './routes/lookups.js';
import { matterRoutes } from './routes/matters.js';
import { portalAdminRoutes, portalPublicRoutes } from './routes/portal.js';
import { reviewRoutes } from './routes/review.js';
import { serviceRoutes } from './routes/service.js';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', secureHeaders());

/*
 * CORS, only for a SPA hosted on a different origin than this Worker.
 *
 * Same-origin serving (the Worker's own URL) needs no CORS and gets none. When WEB_ORIGIN
 * is set — the app's front-end lives on shared hosting, say — this allows exactly that
 * one origin, with credentials, and answers its preflights. The allow-list is a single
 * exact string: never a wildcard, and never reflected from the request, so no other site
 * can borrow the session cookie.
 */
app.use('*', async (c, next) => {
  const allowed = c.env.WEB_ORIGIN;
  const origin = c.req.header('Origin');

  if (allowed && origin === allowed) {
    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    await next();
    c.header('Access-Control-Allow-Origin', allowed);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
    return;
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT ?? 'unknown' }));

app.route('/api/auth', authRoutes);
app.route('/api/lookups', lookupRoutes);
app.route('/api/matters', matterRoutes);
app.route('/api/matters', attachmentRoutes);
app.route('/api/matters', reviewRoutes);
app.route('/api/matters', documentRoutes);
app.route('/api/matters', bundleRoutes);
app.route('/api/matters', serviceRoutes);
app.route('/api/matters', feeNoteRoutes);
app.route('/api/matters', portalAdminRoutes);

// Client portal: token-scoped, no session. Mounted apart from everything above so it
// can never inherit an authenticated route by accident.
app.route('/api/portal', portalPublicRoutes);
app.route('/api/admin', adminRoutes);

/**
 * An unmatched path is either a missing endpoint or a client-side route.
 *
 * API paths answer with JSON so a caller gets a real 404. Everything else is handed the
 * SPA shell, because react-router owns those URLs — without this, refreshing the page on
 * /matters/<id>/bundle returns `{"error":"Not found"}` instead of the application.
 */
app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);

  // Fetch the shell by URL rather than rebuilding the request — the incoming headers are
  // immutable and copying them into a new Request throws. The response is copied for the
  // same reason: an asset response is immutable, and the secureHeaders middleware above
  // sets headers on the way out.
  const shell = await c.env.ASSETS.fetch(new URL('/', c.req.url));
  return new Response(shell.body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  // Never leak an internal error message or stack to the client.
  console.error('Unhandled error:', error);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

export default app;
