-- Default trial length for new organizations. Existing rows are not changed.

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO platform_settings (key, value)
VALUES ('default_trial_days', '7')
ON CONFLICT (key) DO NOTHING;
