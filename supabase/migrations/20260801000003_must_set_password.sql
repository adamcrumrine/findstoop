-- 20260801000003_must_set_password.sql
--
-- Invited tenants were landing straight in the portal with no credential of
-- their own. The emailed link is a BEARER token: whoever opens the message
-- is signed in as that tenant, and nothing ever asks them to set a password.
-- So the link stayed the only key to the account until it expired, and any
-- copy of the email (forward, shared inbox, a CC'd landlord) was a working
-- login.
--
-- This flag lets the app force a one-time "create your password" step on
-- first arrival. It deliberately keys off the PROFILE rather than anything
-- embedded in the link, so it also applies to invite emails that were
-- already sent and are sitting in inboxes right now.
--
-- Not a security boundary on its own — a determined holder of a live session
-- could clear it via the API. It's the mechanism that gets a real credential
-- onto the account, after which the expired link is worthless.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_set_password IS
  'TRUE when the user reached their account via an emailed invite/magic link and has not yet chosen a password. The app routes them to /set-password until they do. Set by invite-tenant on every link it issues; cleared when the password is saved.';

-- Backfill: the 301/303 E 14th Ave tenants were created by the Avail import
-- and invited today. None of them has a password they chose, whether or not
-- an emailed link has already been opened on their behalf.
UPDATE profiles
   SET must_set_password = true
 WHERE role = 'tenant'
   AND email IN (
     'boylndsamantha@gmail.com',
     'avaisabellamccoy@gmail.com',
     'henrikson.6@buckeyemail.osu.edu',
     'ella.anisfeld@gmail.com',
     'mayaweber1213@gmail.com',
     'savannahsteele223@gmail.com',
     'clarecahill9@gmail.com',
     'mackmin13@gmail.com'
   );
