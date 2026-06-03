-- Run once to initialise the database: npm run db:init

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role      AS ENUM ('admin', 'finance', 'user');
  CREATE TYPE member_role    AS ENUM ('owner', 'viewer');
  CREATE TYPE invoice_status AS ENUM ('pending_assignment', 'pending_approval', 'approved', 'rejected');
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    azure_id      VARCHAR UNIQUE NOT NULL,
    email         VARCHAR UNIQUE NOT NULL,
    display_name  VARCHAR NOT NULL,
    role          user_role NOT NULL DEFAULT 'user',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_centers (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code       VARCHAR UNIQUE NOT NULL,
    name       VARCHAR NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_center_members (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_center_id UUID NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           member_role NOT NULL DEFAULT 'owner',
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(cost_center_id, user_id)
);

CREATE TABLE IF NOT EXISTS budget_uploads (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_center_id    UUID NOT NULL REFERENCES cost_centers(id),
    fiscal_year       VARCHAR NOT NULL,
    file_path         VARCHAR NOT NULL,
    original_filename VARCHAR NOT NULL,
    uploaded_by_id    UUID NOT NULL REFERENCES users(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_lines (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_center_id   UUID NOT NULL REFERENCES cost_centers(id),
    budget_upload_id UUID NOT NULL REFERENCES budget_uploads(id) ON DELETE CASCADE,
    code             VARCHAR NOT NULL,
    name             VARCHAR NOT NULL,
    allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR UNIQUE NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_center_id UUID NOT NULL REFERENCES cost_centers(id),
    code           VARCHAR NOT NULL,
    name           VARCHAR NOT NULL,
    description    TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id  UUID NOT NULL REFERENCES users(id),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number    VARCHAR,
    cost_center_id    UUID NOT NULL REFERENCES cost_centers(id),
    vendor_id         UUID NOT NULL REFERENCES vendors(id),
    pdf_path          VARCHAR,
    original_filename VARCHAR,
    status            invoice_status NOT NULL DEFAULT 'pending_assignment',
    uploaded_by_id    UUID NOT NULL REFERENCES users(id),
    amount            NUMERIC(18,2),
    due_date          DATE,
    notes             TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_allocations (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    budget_line_id UUID REFERENCES budget_lines(id),
    project_id     UUID REFERENCES projects(id),
    amount         NUMERIC(18,2) NOT NULL,
    notes          TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_steps (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    step_order  INTEGER NOT NULL,
    status      approval_status NOT NULL DEFAULT 'pending',
    comment     TEXT,
    decided_at  DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR NOT NULL,
    entity_id   UUID,
    action      VARCHAR NOT NULL,
    user_id     UUID REFERENCES users(id),
    invoice_id  UUID REFERENCES invoices(id),
    details     JSONB,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
