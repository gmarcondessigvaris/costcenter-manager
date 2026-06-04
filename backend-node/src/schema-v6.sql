-- v6: system settings table for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key        VARCHAR PRIMARY KEY,
    value      VARCHAR NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Default: manual exchange rate mode
INSERT INTO system_settings (key, value)
VALUES ('exchange_rate_mode', 'manual')
ON CONFLICT (key) DO NOTHING;
