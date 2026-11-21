-- Who invited a player (their player ID, from a WhatsApp invite link). Used to count invites.
ALTER TABLE users ADD COLUMN invited_by TEXT;
