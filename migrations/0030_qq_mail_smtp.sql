INSERT INTO mailboxes (
  address, user_id, is_primary, is_active, created_at, is_hidden
)
SELECT email, user_id, 0, 1, created_at, 1
FROM qq_mail_accounts account
WHERE account.id = (
  SELECT owner.id FROM qq_mail_accounts owner
  WHERE owner.email = account.email COLLATE NOCASE
  ORDER BY owner.created_at, owner.id LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM mailboxes WHERE address = account.email
);
