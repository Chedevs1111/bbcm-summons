-- Phase 3: firm operations.
--
--   service_events  — Sheriff service, from instruction to return of service
--   fee_notes       — LPC fee notes, with trust/business account separation
--   portal_invites  — scoped client access to a single matter, without an account

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Sheriff service
--
-- A summons has no effect until it is served, and the Sheriff's return of service
-- is the proof. Without a filed return the matter cannot proceed to default
-- judgment, so this is the record the whole action depends on.
-- ---------------------------------------------------------------------------
CREATE TABLE service_events (
  id          TEXT PRIMARY KEY,
  matter_id   TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  -- Which generated document went out for service.
  document_id TEXT REFERENCES generated_documents(id) ON DELETE SET NULL,

  -- instructed → served | not_served → return_filed
  status      TEXT NOT NULL DEFAULT 'instructed',

  sheriff_office    TEXT NOT NULL DEFAULT '',
  sheriff_reference TEXT NOT NULL DEFAULT '',
  service_address   TEXT NOT NULL DEFAULT '',

  -- Manner of service under Uniform Rule 4(1)(a); 'other' carries manner_detail.
  manner        TEXT NOT NULL DEFAULT '',
  manner_detail TEXT NOT NULL DEFAULT '',
  -- Name and capacity of whoever accepted service.
  served_on     TEXT NOT NULL DEFAULT '',

  instructed_at      TEXT NOT NULL DEFAULT '',
  served_at          TEXT NOT NULL DEFAULT '',
  return_received_at TEXT NOT NULL DEFAULT '',

  non_service_reason TEXT NOT NULL DEFAULT '',
  fee                REAL NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',

  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_matter ON service_events(matter_id, created_at DESC);
CREATE INDEX idx_service_status ON service_events(status);

-- ---------------------------------------------------------------------------
-- Fee notes
--
-- The Legal Practice Act requires client money to be held in trust separately from
-- the firm's own money, so every line records which account it belongs to. Fees are
-- earned (business); disbursements are paid out on the client's behalf (trust).
-- ---------------------------------------------------------------------------
CREATE TABLE fee_notes (
  id          TEXT PRIMARY KEY,
  matter_id   TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  note_number TEXT NOT NULL DEFAULT '',

  -- draft → issued → paid
  status TEXT NOT NULL DEFAULT 'draft',

  issued_at TEXT NOT NULL DEFAULT '',
  due_at    TEXT NOT NULL DEFAULT '',
  paid_at   TEXT NOT NULL DEFAULT '',

  -- Stored per note: the SA rate has changed before and historical notes must not
  -- silently re-price when it changes again.
  vat_rate REAL NOT NULL DEFAULT 15,
  -- VAT is only charged where the firm is registered for it.
  vat_registered INTEGER NOT NULL DEFAULT 1,

  notes      TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fee_notes_matter ON fee_notes(matter_id, created_at DESC);

CREATE TABLE fee_note_lines (
  id          TEXT PRIMARY KEY,
  fee_note_id TEXT NOT NULL REFERENCES fee_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  -- 'fee' is professional work; 'disbursement' is money laid out for the client
  -- (Sheriff's fees, advocate's fees, search fees).
  kind        TEXT NOT NULL DEFAULT 'fee',
  -- 'business' or 'trust'.
  account     TEXT NOT NULL DEFAULT 'business',
  service_date TEXT NOT NULL DEFAULT '',
  quantity    REAL NOT NULL DEFAULT 1,
  unit_amount REAL NOT NULL DEFAULT 0,
  -- Disbursements paid to a non-vendor are not subject to VAT output.
  vatable     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_fee_lines_note ON fee_note_lines(fee_note_id, sort_order);

-- ---------------------------------------------------------------------------
-- Client portal invitations
--
-- Clients chase their attorney for status. This gives one client read access to one
-- matter without creating a user account. The token is stored hashed, exactly like a
-- session, so a database read cannot be replayed as portal access.
-- ---------------------------------------------------------------------------
CREATE TABLE portal_invites (
  id         TEXT PRIMARY KEY,
  matter_id  TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  -- Which side of the matter this invite belongs to; a defendant must never be able
  -- to read the plaintiff's privileged correspondence.
  party      TEXT NOT NULL DEFAULT 'plaintiff',
  label      TEXT NOT NULL DEFAULT '',

  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT,
  use_count    INTEGER NOT NULL DEFAULT 0,
  -- Whether the client may upload documents, or only read status.
  can_upload   INTEGER NOT NULL DEFAULT 1,

  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_portal_token ON portal_invites(token_hash);
CREATE INDEX idx_portal_matter ON portal_invites(matter_id);
