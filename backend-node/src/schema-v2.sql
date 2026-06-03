-- Migration v2: accounts, itr_codes, updated budget_lines

CREATE TABLE IF NOT EXISTS accounts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR UNIQUE NOT NULL,
    description VARCHAR NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itr_codes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR UNIQUE NOT NULL,
    description VARCHAR NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Extend budget_lines with the new fields (old code/name kept for safety)
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS description  VARCHAR;
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS account_id   UUID REFERENCES accounts(id);
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS itr_code_id  UUID REFERENCES itr_codes(id);
