ALTER TABLE microsoft_imap_accounts
  ADD COLUMN combination_password_cipher TEXT NOT NULL DEFAULT '';

UPDATE microsoft_imap_accounts
SET status = 'credential_error',
    last_error_code = 'password_auth_removed',
    last_error_at = unixepoch(),
    next_sync_at = 0,
    updated_at = unixepoch()
WHERE auth_mode = 'password';
