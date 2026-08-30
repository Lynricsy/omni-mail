INSERT INTO mailboxes (
  address, user_id, is_primary, is_active, created_at, is_hidden
)
SELECT username, user_id, 0, 1, unixepoch(), 1
FROM linux_do_mail_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM mailboxes WHERE address = linux_do_mail_accounts.username
);
