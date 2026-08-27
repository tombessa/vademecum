BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE SCHEMA IF NOT EXISTS vademecum AUTHORIZATION CURRENT_USER;
SET LOCAL search_path TO vademecum, public;

CREATE TEXT SEARCH CONFIGURATION vademecum.portuguese_unaccent (COPY = pg_catalog.portuguese);
ALTER TEXT SEARCH CONFIGURATION vademecum.portuguese_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, portuguese_stem;

CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE', 'BLOCKED', 'INACTIVE');
CREATE TYPE act_status AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED', 'UNKNOWN');
CREATE TYPE source_type AS ENUM ('SENADO_PDF', 'PLANALTO_HTML', 'OFFICIAL_URL', 'USER_UPLOAD');
CREATE TYPE legal_unit_type AS ENUM (
  'PREAMBLE', 'PART', 'BOOK', 'TITLE', 'CHAPTER', 'SECTION', 'SUBSECTION',
  'ARTICLE', 'CAPUT', 'SOLE_PARAGRAPH', 'PARAGRAPH', 'ITEM_ROMAN',
  'LETTER', 'ITEM_ARABIC', 'FINAL_PROVISION', 'ANNEX', 'OTHER'
);
CREATE TYPE reference_type AS ENUM ('LEGISLATION', 'JURISPRUDENCE', 'EDITORIAL', 'EXTERNAL');
CREATE TYPE import_status AS ENUM (
  'REQUESTED', 'LOCATING', 'AWAITING_CHOICE', 'FOUND', 'DOWNLOADED',
  'PARSED', 'AWAITING_REVIEW', 'PUBLISHED', 'NOT_FOUND', 'FAILED', 'CANCELLED'
);
CREATE TYPE highlight_color AS ENUM ('YELLOW', 'GREEN', 'BLUE', 'PINK', 'PURPLE');
CREATE TYPE anchor_status AS ENUM ('VALID', 'REANCHORED', 'REVIEW_REQUIRED', 'ORPHANED');
CREATE TYPE update_run_status AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE FUNCTION current_app_user_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$;

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'LOCAL'
    CHECK (auth_provider IN ('LOCAL', 'CHATGPT')),
  external_subject text,
  role user_role NOT NULL DEFAULT 'USER',
  status user_status NOT NULL DEFAULT 'INVITED',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, external_subject),
  CHECK (auth_provider <> 'LOCAL' OR password_hash IS NOT NULL)
);

CREATE TABLE user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_session_active ON user_session(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE legal_collection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  edition text,
  reference_date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES legal_collection(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES collection_section(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (collection_id, parent_id, position)
);

CREATE TABLE normative_act (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL DEFAULT 'BR',
  act_type text NOT NULL,
  act_number text NOT NULL,
  act_year integer NOT NULL CHECK (act_year BETWEEN 1800 AND 2200),
  title text NOT NULL,
  short_title text,
  summary text,
  official_url text,
  status act_status NOT NULL DEFAULT 'UNKNOWN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, act_type, act_number, act_year)
);

CREATE TABLE source_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type source_type NOT NULL,
  source_url text,
  payload_storage_key text,
  content_type text,
  sha256 char(64) NOT NULL,
  http_etag text,
  http_last_modified text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_type, sha256)
);

CREATE TABLE act_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  previous_version_id uuid REFERENCES act_version(id) ON DELETE SET NULL,
  source_snapshot_id uuid NOT NULL REFERENCES source_snapshot(id),
  version_label text NOT NULL,
  reference_date date,
  effective_from date,
  effective_to date,
  is_current boolean NOT NULL DEFAULT false,
  content_sha256 char(64) NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (act_id, content_sha256)
);
CREATE UNIQUE INDEX uk_act_version_current ON act_version(act_id) WHERE is_current;

CREATE TABLE collection_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES collection_section(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE RESTRICT,
  version_id uuid REFERENCES act_version(id) ON DELETE SET NULL,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (section_id, act_id),
  UNIQUE (section_id, position)
);

CREATE TABLE legal_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES act_version(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES legal_unit(id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  unit_type legal_unit_type NOT NULL,
  label text,
  heading text,
  body text,
  order_path ltree NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  source_page_start integer,
  source_page_end integer,
  source_bounding_box jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'vademecum.portuguese_unaccent'::regconfig,
      coalesce(label, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(body, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, logical_key),
  UNIQUE (version_id, order_path),
  CHECK (source_page_end IS NULL OR source_page_start IS NULL OR source_page_end >= source_page_start)
);
CREATE INDEX idx_legal_unit_parent ON legal_unit(version_id, parent_id, sort_order);
CREATE INDEX idx_legal_unit_path ON legal_unit USING gist(order_path);
CREATE INDEX idx_legal_unit_search ON legal_unit USING gin(search_vector);
CREATE INDEX idx_legal_unit_body_trgm ON legal_unit USING gin(body gin_trgm_ops);

CREATE TABLE editorial_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_unit_id uuid NOT NULL REFERENCES legal_unit(id) ON DELETE CASCADE,
  marker text,
  body text NOT NULL,
  source_page integer,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE legal_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_unit_id uuid NOT NULL REFERENCES legal_unit(id) ON DELETE CASCADE,
  reference_type reference_type NOT NULL,
  target_act_id uuid REFERENCES normative_act(id) ON DELETE SET NULL,
  target_logical_key text,
  external_url text,
  display_text text NOT NULL,
  is_editorial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_act_id IS NOT NULL OR external_url IS NOT NULL)
);

CREATE TABLE jurisprudence_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court text NOT NULL,
  process_number text,
  decision_class text,
  title text NOT NULL,
  holding text,
  full_text text,
  rapporteur text,
  judging_body text,
  judgment_date date,
  publication_date date,
  official_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'vademecum.portuguese_unaccent'::regconfig,
      court || ' ' || coalesce(process_number, '') || ' ' || title || ' ' || coalesce(holding, '') || ' ' || coalesce(full_text, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (court, process_number, official_url)
);
CREATE INDEX idx_jurisprudence_search ON jurisprudence_decision USING gin(search_vector);

CREATE TABLE jurisprudence_reference (
  decision_id uuid NOT NULL REFERENCES jurisprudence_decision(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  target_logical_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, act_id, target_logical_key)
);

CREATE TABLE legislation_import_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  raw_query text NOT NULL,
  requested_act_type text,
  requested_act_number text,
  requested_act_year integer,
  provided_source_url text,
  status import_status NOT NULL DEFAULT 'REQUESTED',
  published_act_id uuid REFERENCES normative_act(id) ON DELETE SET NULL,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_request_queue ON legislation_import_request(status, created_at);

CREATE TABLE legislation_import_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES legislation_import_request(id) ON DELETE CASCADE,
  act_type text,
  act_number text,
  act_year integer,
  title text NOT NULL,
  summary text,
  source_url text NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  is_selected boolean NOT NULL DEFAULT false,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_import_candidate_selected ON legislation_import_candidate(request_id) WHERE is_selected;

CREATE TABLE update_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status update_run_status NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  checked_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_detail text,
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE update_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES update_run(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  previous_version_id uuid REFERENCES act_version(id) ON DELETE SET NULL,
  new_version_id uuid REFERENCES act_version(id) ON DELETE SET NULL,
  changed boolean NOT NULL,
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, act_id)
);

CREATE TABLE user_collection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_user_collection_default ON user_collection(user_id) WHERE is_default;

CREATE TABLE user_collection_item (
  collection_id uuid NOT NULL REFERENCES user_collection(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, act_id)
);

CREATE TABLE user_highlight (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES act_version(id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  color highlight_color NOT NULL,
  quote_exact text NOT NULL,
  quote_prefix text,
  quote_suffix text,
  position_start integer,
  position_end integer,
  anchor_status anchor_status NOT NULL DEFAULT 'VALID',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_highlight_unit ON user_highlight(user_id, act_id, logical_key);

CREATE TABLE user_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_note_unit ON user_note(user_id, act_id, logical_key);

CREATE TABLE user_bookmark (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, act_id, logical_key)
);

CREATE TABLE reading_progress (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  act_id uuid NOT NULL REFERENCES normative_act(id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, act_id)
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_event_created ON audit_event(created_at DESC);

CREATE TRIGGER trg_app_user_updated BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_collection_updated BEFORE UPDATE ON legal_collection FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_act_updated BEFORE UPDATE ON normative_act FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jurisprudence_updated BEFORE UPDATE ON jurisprudence_decision FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_import_request_updated BEFORE UPDATE ON legislation_import_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_collection_updated BEFORE UPDATE ON user_collection FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_highlight_updated BEFORE UPDATE ON user_highlight FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_note_updated BEFORE UPDATE ON user_note FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE legislation_import_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE legislation_import_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collection_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_highlight ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmark ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_user_self ON app_user
  USING (id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY session_owner ON user_session
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY import_request_owner ON legislation_import_request
  USING (requested_by = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (requested_by = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY import_candidate_owner ON legislation_import_candidate
  USING (
    EXISTS (
      SELECT 1 FROM legislation_import_request request
      WHERE request.id = request_id
        AND (request.requested_by = current_app_user_id() OR current_app_user_role() = 'ADMIN')
    )
  );
CREATE POLICY collection_owner ON user_collection
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY collection_item_owner ON user_collection_item
  USING (
    EXISTS (
      SELECT 1 FROM user_collection collection
      WHERE collection.id = collection_id
        AND (collection.user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
    )
  );
CREATE POLICY highlight_owner ON user_highlight
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY note_owner ON user_note
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY bookmark_owner ON user_bookmark
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');
CREATE POLICY reading_progress_owner ON reading_progress
  USING (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN')
  WITH CHECK (user_id = current_app_user_id() OR current_app_user_role() = 'ADMIN');

COMMIT;
