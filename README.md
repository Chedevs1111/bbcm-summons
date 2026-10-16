# BBCM Summons v2

South African divorce document automation for law firms. A rebuild of the
`bbcmlegal.net` prototype ("DivorceSummons AI") as an owned, access-controlled
application.

## Why this exists

The original was a client-side React app talking straight to a shared Postgres
instance with a public key and no row-level gate. Browsing it with **no login**
listed 8 law firms with real contact details, 11 users, and offered working
"Delete firm" buttons. This rebuild puts a Worker between the browser and the
database, and every query is scoped to the caller's firm.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, Tailwind 4, TanStack Query → Cloudflare Pages |
| API | Hono on Cloudflare Workers |
| Data | D1 (SQLite) |
| Files | R2, keyed `firms/<firm>/matters/<matter>/<id>` |
| Sessions | KV, 8-hour TTL |
| Extraction | Claude vision (`claude-opus-5`), structured output with confidence |

```
packages/schema      domain constants, zod schemas, SA ID validation
packages/documents   marker grammar, templates, clause library, assembly, DOCX
apps/api             Hono worker — every route firm-scoped
apps/web             the SPA
```

## Running it

```bash
npm install
npx wrangler d1 migrations apply bbcm-summons --local --config apps/api/wrangler.toml
node apps/api/scripts/seed.mjs
```

Then start both servers (`npx wrangler dev --config apps/api/wrangler.toml --port 8787`
and `npm run dev --workspace=apps/web`) and sign in at http://localhost:5173 with:

```
demo@vdm-law.co.za / bbcm-demo-password-2026
```

For document extraction, set the API key:

```bash
npx wrangler secret put ANTHROPIC_API_KEY --config apps/api/wrangler.toml
```

## Court bundle (Court Online / CaseLines)

`GET /api/matters/:id/bundle` returns a manifest; `GET /api/matters/:id/bundle/:volume`
returns the PDF. The **Court Bundle** screen shows both.

Implements the structural requirements of the Gauteng
[Consolidated Practice Directive 1 of 2024](https://www.lssa.org.za/wp-content/uploads/2024/01/CONSOLIDATED-PRACTICE-DIRECTIVE-1-OF-2024.pdf):

| Requirement | Where |
|---|---|
| All documents in PDF (para 19) | `pdf/bundle.ts` |
| Record indexed and paginated (33.17.1) | generated index, running page numbers on every page |
| Volumes ≤ 120 pages, never splitting a document (33.25) | `packVolumes()` |
| Per-volume cover sheet: case number, parties, volume count, court, legal reps (33.25.1–.6) | `buildCoverAst()` |
| Combined index in volume 1 (33.26) | `buildIndexAst()` |

Plus PDF bookmarks per section and annexure, and PDF/A-2b conformance markers.

**Why the PDF is laid out by hand rather than rendered from HTML:** the index has to
cite the page each document actually starts on. Cover sheets and the index are
themselves paginated, so their size feeds back into the numbers the index prints —
`buildCourtBundle` iterates the page plan to a fixed point before drawing anything.
Rendering HTML would only reveal pagination after the fact.

> ⚠️ **The PDF/A claim is not validated.** The required structures (XMP with
> `pdfaid:part 2`/`conformance B`, sRGB OutputIntent with an embedded ICC profile,
> document `/ID`, all fonts embedded) are built to spec and asserted structurally in
> `test/pdfa.test.ts`, but no validator (veraPDF) was available here. **Run veraPDF
> against a real bundle before telling anyone the output is PDF/A.**

Fonts and the ICC profile are checked in under `packages/documents/src/pdf/assets/`
because a Worker has no filesystem. Regenerate with:

```bash
node packages/documents/scripts/build-fonts.mjs
```

## Firm operations

Three practice-management features, on the **Service & Fees** screen:

| Feature | What it does |
|---|---|
| **Sheriff service** | Records the instruction, the manner of service under Uniform Rule 4(1)(a), who accepted it, and the return of service. Status only moves forward — a return cannot be filed for service never instructed — and the matter shows "not proved" until a return is filed, because default judgment cannot be sought before then. |
| **Fee notes** | Fees vs disbursements, each tagged to the **business or trust ledger** as the Legal Practice Act requires. VAT is per line, so a Sheriff's fee (non-vendor) carries none. Lines freeze once a note is issued, and an issued note cannot be deleted. |
| **Client access** | A magic link giving one client read access to one matter. |

Both the fee note and the instruction to the Sheriff download as one-page PDF/A
documents, rendered through the same pipeline as the court bundle.

Money is formatted explicitly as `R5 400,00` rather than via `toLocaleString('en-ZA')`:
workerd resolved that locale to US formatting while Node and browsers gave SA
formatting, so the same fee note read differently on screen and in the PDF.

### Client portal security

The portal is the only surface that grants access without a session, so it is the one
worth being careful about:

- the token is 256 bits of randomness, stored **only as a SHA-256 hash** — a database
  read cannot be replayed as portal access
- the plaintext token is shown **once**, at creation; nothing stores it afterwards
- unknown, malformed, revoked and expired tokens all return the **same 404**, so the
  endpoint cannot confirm whether a token ever existed
- the response is assembled field by field — the matter row is never spread into it,
  so a future column cannot leak by accident. Tests assert that no ID number, full
  name or password hash appears in the payload
- a token grants the portal and nothing else; every other route still 401s

Attorneys send the link through whatever channel they already use with that client.
Nothing here emails it.

## Look and motion

Identity is navy `#0f172a` chrome with a struck-gold accent. Gold is always a gradient
(`#f7e7ad → #c9a227 → #8a6a15`), never a flat fill — one yellow reads as highlighter,
three stops read as metal. The `BS` monogram and the `BBCM Summons` wordmark both use it
via the `goldtext` utility.

Two scales, and they are not interchangeable:

| Scale | Means | Used for |
|---|---|---|
| `gold-*` | brand | buttons, tabs, focus rings, logo, active nav |
| `amber-*` | **caution** | needs-review, low confidence, unsaved changes, validation notices |

While the accent was itself amber these were the same colour by coincidence, so a
warning carried no more signal than a primary button. Anything decorative or
brand-coloured belongs in `gold-*`; reach for `amber-*` only when the interface is
asking someone to look at something.

Motion lives in [apps/web/src/lib/motion.ts](apps/web/src/lib/motion.ts): reveal on
scroll, a gold scroll-progress hairline, and count-up figures. Two rules there are about
failure modes rather than easing, and both are load-bearing:

- **Reveals use a geometry check on scroll, not `IntersectionObserver`.** A reveal starts
  at `opacity: 0`, and IO does not fire at all in some embedded and offscreen browsing
  contexts — the page would simply stay blank. A timeout also forces the end state inline,
  because a CSS transition cannot run if the frame clock is stalled.
- **A counter never renders a number that is not true.** The real figure is what sits in
  the DOM and the animation plays over it; count-up is skipped entirely when the tab is
  hidden, since a throttled frame loop stalls after its first tick and would strand the
  tile showing the opening frame of the count.

Everything collapses under `prefers-reduced-motion`.

## Rate limiting

The three endpoints reachable without a session are bounded (`apps/api/src/lib/rateLimit.ts`):

| Endpoint | Limit | Keyed on |
|---|---|---|
| `POST /api/auth/login` | 10 per 15 min | caller IP |
| `POST /api/auth/login` | 30 per 15 min | email address |
| `GET /api/portal/:token` | 120 per min | caller IP |
| `POST /api/portal/:token/uploads` | 30 per hour | the invite |

Login is checked **before** the password is verified. PBKDF2 at 210 000 iterations is
the expensive part of that request, so checking afterwards would leave an attacker able
to burn Worker CPU at will even while being refused.

The per-account limit is deliberately looser than the per-IP one. A tight per-account
limit is itself an attack: anyone who knows an attorney's email could lock them out of
their own files by failing logins against it. A successful sign-in clears the IP
counter, so an honest user who mistyped twice is not throttled afterwards.

Known limits of the fixed-window-in-KV approach are in [BACKLOG.md](BACKLOG.md) item 13.

## Verifying

```bash
npm test              # 236 tests
npm run typecheck
```

`apps/api/test/authorisation.test.ts` is the important one: it seeds two firms and
asserts that every route returns 401 unauthenticated and 404 (never 403) when firm A
reaches for firm B's data — 404 so the endpoint can't be used to enumerate matter ids.

## The document engine

Templates use the marker grammar recovered from the original bundle:

```
{{B}}…{{/B}}  bold        {{C}}…{{/C}}  centre the line
{{I}}…{{/I}}  italic      {{R}}…{{/R}}  push to the right margin
{{U}}…{{/U}}  underline
{{TABLE}}{{TR}}{{TD}}…{{/TD}}{{/TR}}{{/TABLE}}   signature blocks
```

`{{R}}` mid-line is a tab stop, not a block alignment — that is what puts the party
name left and "PLAINTIFF" flush right on the same line of a summons heading.

Template selection: a template matches when `document_type` matches and each of
`marriage_regime` / `is_contested` / `has_children` is either null (any) or equal to
the matter's value. The most specific match wins, `is_default` breaks ties. When
nothing matches, generation **skips** that document and tells you, rather than
producing something wrong.

### Deliberate deviations from the original

- **Children sentence agreement.** The original template read `There are
  {{NUMBER_OF_CHILDREN}} minor children`, which files as "There are one minor
  children". Templates now use `{{CHILDREN_VERB}}` / `{{CHILDREN_NOUN}}`.
- **`{{CLAUSES}}`** is available in the palette so a firm can drop the conditional
  clause library into a template. The eight seeded templates stay verbatim otherwise.

## Not yet done

See **[BACKLOG.md](BACKLOG.md)** for the full list with context — what is blocked on an
account you must obtain, what needs a person rather than a model, and what is simply
next.


- **WhatsApp notifications, ZAR billing (Paystack/PayFast) and multi-language client
  output** — the remaining firm-operations items. The first two need merchant and Meta
  Business accounts that do not exist yet, so they were not built blind. Translating
  legal text by machine is its own risk and needs a human translator, not a model.
- **The full POPIA programme** — auth, per-firm scoping, encryption in transit and an
  audit trail are in place, but the Information Officer register, data-subject
  access/erasure workflows and a retention policy are not.
- **The live Claude extraction call has not been exercised** — the code path is
  written and typechecked, but no `ANTHROPIC_API_KEY` was configured during
  development, so no real document has been through it.
- **PDF/A conformance is unvalidated** — see the warning above. Structurally correct,
  but no validator was available to confirm it.
- **Per-document upload to Court Online is manual** — the bundle is produced as a file
  to upload; there is no API integration with Court Online itself.
