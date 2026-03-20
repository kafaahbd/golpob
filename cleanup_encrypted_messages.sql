-- =============================================
-- GOLPO — Clean up old RSA-encrypted messages
-- Run in Neon SQL Editor if you want a fresh start
-- =============================================

-- Option 1: Delete ALL messages (cleanest — start fresh)
-- DELETE FROM message_statuses;
-- DELETE FROM reactions;
-- DELETE FROM messages;

-- Option 2: Delete only messages that are RSA-encrypted
-- (those that have encryptedKey field in the JSON)
DELETE FROM message_statuses
WHERE message_id IN (
  SELECT id FROM messages
  WHERE encrypted_content LIKE '%"encryptedKey"%'
);

DELETE FROM reactions
WHERE message_id IN (
  SELECT id FROM messages
  WHERE encrypted_content LIKE '%"encryptedKey"%'
);

DELETE FROM messages
WHERE encrypted_content LIKE '%"encryptedKey"%';

-- Verify
SELECT COUNT(*) as remaining_messages FROM messages;
