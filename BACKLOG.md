# Backlog

Work that is deliberately not done, with enough context to pick it up cold. Ordered
roughly by what would matter most to a working firm.

---

## Blocked on something you must obtain

### 1. Run veraPDF against a generated court bundle
**Blocked on:** a machine with Java.

The bundle declares PDF/A-2b: XMP with `pdfaid:part 2` / `conformance B`, an sRGB
OutputIntent with an embedded ICC profile, a document `/ID`, and all four font faces
embedded with no standard-14 references. Every one of those is asserted structurally in
`packages/documents/test/pdfa.test.ts`. **None of it is a conformance verdict** — no
validator was available here.

```bash
brew install verapdf     # or download from verapdf.org
verapdf -f 2b --format text court-bundle.pdf
```

Until that passes, do not describe the output as PDF/A to a court or a client. If it
fails, the fallback in the original plan was a Ghostscript pass in a Cloudflare
Container off a Queue — it was not needed to produce the structures, only possibly to
certify them.

### 2. Exercise the Claude extraction path on a real document
**Blocked on:** an Anthropic API key.

```bash
npx wrangler secret put ANTHROPIC_API_KEY --config apps/api/wrangler.toml
```

`apps/api/src/extract/claude.ts` is written and typechecked but **has never run**. Test
it against a real green barcoded ID book, a smart ID card and a DHA marriage
certificate before trusting the confidence scores — the whole Review & Confirm flow is
calibrated around the 0.8 threshold, and that threshold is currently a guess.

### 3. WhatsApp notifications
**Blocked on:** a Meta WhatsApp Business Cloud API account.

South African clients live on WhatsApp; email is a poor second. Deliberately not built
blind — an adapter that has never sent a message tells you nothing about whether it
works. When the account exists, the natural shape is a Cloudflare Queue consumer
triggered off the same events that already write to `audit_trail`.

Worth sending: summons served, return of service filed, a document is outstanding, a
fee note issued.

### 4. ZAR billing per firm seat
**Blocked on:** a Paystack or PayFast merchant account.

Paystack has the better API; PayFast has wider local recognition. Needs a
`subscriptions` table keyed on `law_firms`, a webhook endpoint for payment events, and
a seat check somewhere in `requireAuth`.

### 5. Court Online integration
**Blocked on:** a Court Online practitioner account (needs an LPC number), and on
whether an API exists at all.

Today the bundle is produced as a file to upload by hand. Investigate whether Court
Online exposes anything programmatic; if it does not, this stays manual and should be
struck from the backlog rather than left open.

---

## Needs a person, not a model

### 6. Multi-language client output (isiZulu, Afrikaans, Sesotho)
**Needs:** a human legal translator.

The client-facing portal and any client correspondence should be available in the
client's own language. This was deliberately not machine-translated: a mistranslated
explanation of a divorce settlement is worse than an English one the client asks about.
The strings to translate are the portal view and the outstanding-document labels — not
the pleadings, which are filed in English.

### 7. Verify the Rule 4 manner-of-service list
**Needs:** ten minutes with the current Uniform Rules.

`SERVICE_MANNERS` in `packages/schema/src/operations.ts` was transcribed from working
knowledge — the Rules PDF returned 403/404 from three sources during the build. The
list is designed to degrade safely (an `other` option with free text means an omission
never blocks a record), but it should be checked. Same for whether Rule 4A electronic
service deserves its own entry.

---

## Worth doing when there is time

### 8. The full POPIA programme
Auth, per-firm scoping, encryption in transit and an audit trail are all in place. Not
in place: an Information Officer register, data-subject access and erasure workflows,
and a retention policy. This is the difference between "more secure than the original"
and "POPIA-compliant", and only the second one is a defence.

Note the related open item: **the original bbcmlegal.net is still live and still
exposes every firm's data unauthenticated.** That is a separate, more urgent job.

`scripts/gate-original-rls.sql` closes that hole: it enables row-level security on all
twelve tables with no policies, revokes the anon grants and makes the document bucket
private. It has to be pasted into the Supabase SQL editor — nothing in this repo can
reach that instance.

Be clear on the cost before running it: **the original application stops working.** RLS
scopes rows to an authenticated identity and that app has none, so there is nothing to
write a policy against and deny-all is the only correct answer. Nothing is deleted, and
`service_role` bypasses RLS, so the export still works afterwards. Gate first, then
export.

### 9. Data migration from the original Supabase instance
Both halves are written:

    node scripts/export-original.mjs --files          # from Supabase
    node scripts/import-to-d1.mjs <exportDir> --remote --apply

The export doubles as evidence for the POPIA assessment, so it records row counts and
SHA-256 checksums; the import refuses to run if those no longer match.

**Two schema gaps the import will make you deal with**, found by running it rather than
by reading the migrations:

- Many columns are `NOT NULL DEFAULT ''` here but nullable in the original. Nulls are
  filled with the declared default and the substitutions are counted in the report.
- `matters.attorney_id` is `NOT NULL` with no default and does not exist in the export
  at all. Which attorney owns an imported matter is a decision, not a lookup — supply it
  with `--set matters.attorney_id=<user id>`. The same applies to any other required
  column the export lacks.

Do the export **before** the original is taken down, and use the service_role key.

### 10. Bundle build is synchronous
`buildCourtBundle` runs inside the request. Fine for a divorce bundle of a few hundred
pages; a large discovery bundle will hit the Worker CPU limit. If that happens, move it
to a Queue and have the manifest endpoint return a job id.

### 11. Frontend bundle is one 513 KB chunk
Vite warns about it. Route-level `React.lazy` on the Template Designer and the PDF
views would cut the first paint considerably.

### 12. Screens reconstructed rather than copied
Upload & Extract, Review & Confirm, Detailed OCR, Annexures, Documents, Document
Preview and Matter Detail were rebuilt from strings in the original JS bundle, because
creating a matter in the live shared database to see them was not acceptable. They
work, but their layout is a design decision, not a copy. Worth a look from someone who
used the original daily.

### 13. Rate limiting is a fixed window in KV
`apps/api/src/lib/rateLimit.ts` counts attempts per window in the sessions KV namespace.
Two known limits of that choice:

- **Fixed rather than sliding**, so a caller who aligns with a window boundary can get
  up to 2× the limit in a burst. Harmless at 10 logins per fifteen minutes; revisit if
  the thresholds are ever tightened.
- **KV is eventually consistent.** Concurrent requests can read the same counter and
  each write back the same increment, so a parallel burst can overshoot. It bounds a
  sustained attack, which is the point, but it is not an exact quota. Cloudflare's
  native Rate Limiting binding, or a Durable Object, would be exact — the binding is
  the smaller change if this ever matters.

A KV read failure deliberately *allows* the request rather than denying it: a KV
outage should not lock every attorney out of their own files.

### 14. The test runtime does not enforce the Workers PBKDF2 cap
Login was broken on every deployment and the suite was green throughout. Cloudflare
Workers refuses PBKDF2 above 100 000 iterations:

    Pbkdf2 failed: iteration counts above 100000 are not supported (requested 210000)

`derive()` threw, `verifyPassword` caught it and returned false, and nobody could sign
in. The local test runtime allows 210 000, so 236 passing tests said nothing — on the
one path where being wrong matters most.

Worth doing something about, because the same blindness applies to any Workers runtime
limit: a smoke test that runs against a *deployed* Worker rather than the local runtime,
covering at least sign-in. Until that exists, treat a green suite as evidence about the
code and not about the platform.

