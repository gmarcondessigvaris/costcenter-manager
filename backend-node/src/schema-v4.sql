-- v4: multi-currency support

CREATE TABLE IF NOT EXISTS currencies (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(3) UNIQUE NOT NULL,
    name         VARCHAR NOT NULL,
    rate_to_chf  NUMERIC(18,6) NOT NULL DEFAULT 1.0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by_id UUID REFERENCES users(id)
);

INSERT INTO currencies (code, name, rate_to_chf) VALUES
  ('CHF', 'Swiss Franc',     1.000000),
  ('EUR', 'Euro',            1.050000),
  ('USD', 'US Dollar',       0.920000),
  ('GBP', 'British Pound',   1.160000),
  ('SEK', 'Swedish Krona',   0.088000),
  ('NOK', 'Norwegian Krone', 0.087000),
  ('DKK', 'Danish Krone',    0.141000),
  ('JPY', 'Japanese Yen',    0.006200),
  ('CNY', 'Chinese Yuan',    0.127000)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency            VARCHAR(3)     DEFAULT 'CHF';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18,6)  DEFAULT 1.0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate_mode  VARCHAR(10)    DEFAULT 'auto';
