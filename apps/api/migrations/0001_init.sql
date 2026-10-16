-- BBCM Summons v2 — initial schema
-- Column names ported verbatim from the original DivorceSummons AI Supabase schema so that
-- the seeded templates keep working and a data migration is a straight column copy.

PRAGMA foreign_keys = ON;

CREATE TABLE law_firms (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  province            TEXT NOT NULL DEFAULT '',
  city                TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  lpc_number          TEXT NOT NULL DEFAULT '',
  vat_number          TEXT NOT NULL DEFAULT '',
  logo_url            TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE branches (
  id         TEXT PRIMARY KEY,
  firm_id    TEXT NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_branches_firm ON branches(firm_id);

CREATE TABLE app_users (
  id            TEXT PRIMARY KEY,
  firm_id       TEXT REFERENCES law_firms(id) ON DELETE CASCADE,
  branch_id     TEXT REFERENCES branches(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'attorney',
  lpc_number    TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_users_email ON app_users(email);
CREATE INDEX idx_users_firm ON app_users(firm_id);

CREATE TABLE matters (
  id             TEXT PRIMARY KEY,
  firm_id        TEXT NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  branch_id      TEXT REFERENCES branches(id) ON DELETE SET NULL,
  attorney_id    TEXT NOT NULL REFERENCES app_users(id),
  case_reference TEXT NOT NULL DEFAULT '',
  case_number    TEXT NOT NULL DEFAULT '',
  province       TEXT NOT NULL DEFAULT '',
  court_type     TEXT NOT NULL DEFAULT 'high_court',
  court_name     TEXT NOT NULL DEFAULT '',
  is_contested   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',

  plaintiff_full_names        TEXT NOT NULL DEFAULT '',
  plaintiff_surname           TEXT NOT NULL DEFAULT '',
  plaintiff_id_number         TEXT NOT NULL DEFAULT '',
  plaintiff_passport          TEXT NOT NULL DEFAULT '',
  plaintiff_dob               TEXT NOT NULL DEFAULT '',
  plaintiff_gender            TEXT NOT NULL DEFAULT '',
  plaintiff_occupation        TEXT NOT NULL DEFAULT '',
  plaintiff_employer          TEXT NOT NULL DEFAULT '',
  plaintiff_employee_number   TEXT NOT NULL DEFAULT '',
  plaintiff_income            REAL NOT NULL DEFAULT 0,
  plaintiff_monthly_expenses  REAL NOT NULL DEFAULT 0,
  plaintiff_physical_address  TEXT NOT NULL DEFAULT '',
  plaintiff_postal_address    TEXT NOT NULL DEFAULT '',
  plaintiff_phone             TEXT NOT NULL DEFAULT '',
  plaintiff_email             TEXT NOT NULL DEFAULT '',
  plaintiff_pension_fund_name TEXT NOT NULL DEFAULT '',
  plaintiff_pension_share_pct REAL NOT NULL DEFAULT 0,

  defendant_full_names        TEXT NOT NULL DEFAULT '',
  defendant_surname           TEXT NOT NULL DEFAULT '',
  defendant_id_number         TEXT NOT NULL DEFAULT '',
  defendant_passport          TEXT NOT NULL DEFAULT '',
  defendant_dob               TEXT NOT NULL DEFAULT '',
  defendant_gender            TEXT NOT NULL DEFAULT '',
  defendant_occupation        TEXT NOT NULL DEFAULT '',
  defendant_employer          TEXT NOT NULL DEFAULT '',
  defendant_employee_number   TEXT NOT NULL DEFAULT '',
  defendant_income            REAL NOT NULL DEFAULT 0,
  defendant_monthly_expenses  REAL NOT NULL DEFAULT 0,
  defendant_physical_address  TEXT NOT NULL DEFAULT '',
  defendant_postal_address    TEXT NOT NULL DEFAULT '',
  defendant_phone             TEXT NOT NULL DEFAULT '',
  defendant_email             TEXT NOT NULL DEFAULT '',
  defendant_pension_fund_name TEXT NOT NULL DEFAULT '',
  defendant_pension_share_pct REAL NOT NULL DEFAULT 0,

  marriage_date                     TEXT NOT NULL DEFAULT '',
  marriage_place                    TEXT NOT NULL DEFAULT '',
  marriage_type                     TEXT NOT NULL DEFAULT 'civil',
  marriage_regime                   TEXT NOT NULL DEFAULT 'in_community',
  marriage_certificate_attached     INTEGER NOT NULL DEFAULT 0,
  marriage_certificate_annexure_ref TEXT NOT NULL DEFAULT '',

  child_maintenance_claimed   REAL NOT NULL DEFAULT 0,
  spousal_maintenance_claimed REAL NOT NULL DEFAULT 0,
  pension_interest_claimed    INTEGER NOT NULL DEFAULT 0,
  forfeiture_claimed          INTEGER NOT NULL DEFAULT 0,
  costs_sought                INTEGER NOT NULL DEFAULT 0,

  ocr_data_applied INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Every matter query is scoped by firm_id; this index backs that access path.
CREATE INDEX idx_matters_firm ON matters(firm_id, created_at DESC);
CREATE INDEX idx_matters_status ON matters(firm_id, status);
CREATE INDEX idx_matters_attorney ON matters(attorney_id);

CREATE TABLE matter_children (
  id                  TEXT PRIMARY KEY,
  matter_id           TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL DEFAULT '',
  surname             TEXT NOT NULL DEFAULT '',
  id_number           TEXT NOT NULL DEFAULT '',
  dob                 TEXT NOT NULL DEFAULT '',
  gender              TEXT NOT NULL DEFAULT '',
  birth_cert_attached INTEGER NOT NULL DEFAULT 0,
  maintenance_claimed REAL NOT NULL DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_children_matter ON matter_children(matter_id, sort_order);

CREATE TABLE matter_assets (
  id                 TEXT PRIMARY KEY,
  matter_id          TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  description        TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL DEFAULT 'other',
  value              REAL NOT NULL DEFAULT 0,
  allocated_to       TEXT NOT NULL DEFAULT 'unallocated',
  commencement_value REAL NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_assets_matter ON matter_assets(matter_id, sort_order);

CREATE TABLE matter_liabilities (
  id                TEXT PRIMARY KEY,
  matter_id         TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  creditor          TEXT NOT NULL DEFAULT '',
  amount            REAL NOT NULL DEFAULT 0,
  responsible_party TEXT NOT NULL DEFAULT 'joint',
  sort_order        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_liabilities_matter ON matter_liabilities(matter_id, sort_order);

CREATE TABLE matter_attachments (
  id              TEXT PRIMARY KEY,
  matter_id       TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL DEFAULT 'other',
  file_name       TEXT NOT NULL DEFAULT '',
  storage_key     TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT '',
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  annexure_label  TEXT NOT NULL DEFAULT '',
  annexure_number INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  ocr_text        TEXT NOT NULL DEFAULT '',
  ocr_confidence  REAL NOT NULL DEFAULT 0,
  ocr_extracted   INTEGER NOT NULL DEFAULT 0,
  uploaded_by     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachments_matter ON matter_attachments(matter_id, sort_order);

CREATE TABLE ocr_field_overrides (
  id              TEXT PRIMARY KEY,
  matter_id       TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  attachment_id   TEXT REFERENCES matter_attachments(id) ON DELETE SET NULL,
  field_name      TEXT NOT NULL,
  extracted_value TEXT NOT NULL DEFAULT '',
  value           TEXT NOT NULL DEFAULT '',
  confidence      REAL NOT NULL DEFAULT 0,
  confirmed       INTEGER NOT NULL DEFAULT 0,
  overridden      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_ocr_matter_field ON ocr_field_overrides(matter_id, field_name);

CREATE TABLE firm_templates (
  id              TEXT PRIMARY KEY,
  firm_id         TEXT NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  document_type   TEXT NOT NULL,
  marriage_regime TEXT,          -- NULL = any regime
  is_contested    INTEGER,       -- NULL = either
  has_children    INTEGER,       -- NULL = either
  body            TEXT NOT NULL DEFAULT '',
  is_active       INTEGER NOT NULL DEFAULT 1,
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_templates_firm ON firm_templates(firm_id, document_type);

CREATE TABLE clause_library (
  id         TEXT PRIMARY KEY,
  firm_id    TEXT REFERENCES law_firms(id) ON DELETE CASCADE, -- NULL = system clause
  key        TEXT NOT NULL,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  condition  TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_clauses_firm ON clause_library(firm_id, sort_order);

CREATE TABLE generated_documents (
  id            TEXT PRIMARY KEY,
  matter_id     TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  template_id   TEXT REFERENCES firm_templates(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  storage_key   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  generated_by  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_generated_matter ON generated_documents(matter_id, document_type, version DESC);

CREATE TABLE audit_trail (
  id         TEXT PRIMARY KEY,
  firm_id    TEXT,
  user_id    TEXT,
  matter_id  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_firm ON audit_trail(firm_id, created_at DESC);
CREATE INDEX idx_audit_matter ON audit_trail(matter_id, created_at DESC);
