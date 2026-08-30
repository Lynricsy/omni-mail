CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

WITH legacy_migrations(name, position) AS (
  VALUES
    ('0001_initial.sql', 1),
    ('0002_domains.sql', 2),
    ('0003_temporary_invites.sql', 3),
    ('0004_device_sessions.sql', 4),
    ('0005_audit_log_index.sql', 5),
    ('0006_external_registration.sql', 6),
    ('0007_registration_security.sql', 7),
    ('0008_storage_policy.sql', 8),
    ('0009_mail_operations.sql', 9),
    ('0010_account_invites.sql', 10),
    ('0011_unassigned_mail.sql', 11),
    ('0012_mail_safety.sql', 12),
    ('0013_mail_features.sql', 13),
    ('0014_outbound_rate_limits.sql', 14),
    ('0015_message_translations.sql', 15),
    ('0016_translation_permissions.sql', 16),
    ('0017_multiple_drafts.sql', 17)
), legacy_baseline(position) AS (
  SELECT CASE value
    WHEN '2026-07-29-p5-outbound-rate-limit-admin' THEN 14
    WHEN '2026-08-01-p2-translation-permissions' THEN 16
    WHEN '2026-08-03-p3-multiple-drafts' THEN 17
  END
  FROM settings
  WHERE key = 'schema_version'
)
INSERT INTO d1_migrations (name)
SELECT legacy_migrations.name
FROM legacy_migrations
CROSS JOIN legacy_baseline
WHERE legacy_migrations.position <= legacy_baseline.position
  AND NOT EXISTS (
    SELECT 1 FROM d1_migrations applied
    WHERE applied.name = legacy_migrations.name
  );
