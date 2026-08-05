-- Extend the collections pause to tenancies that ENDED without ever running
-- on Stoop.
--
-- 20260803000001 paused active leases whose tenants had never signed in. That
-- test does not reach the ended ones: the students on 301/303 E 14th Ave were
-- invited during the Avail import and did sign in — several are on the new
-- leases — while their PREVIOUS tenancy was administered entirely off-platform.
-- Their imported ledgers were therefore still live, and the Leases page opened
-- with a red statutory countdown ("Return due in 6d") over deposits Stoop has
-- never held and cannot return.
--
-- The honest signal for an ended lease is the money, not the login: a lease
-- carrying imported payment history where nothing ever settled through Stripe
-- was never on Stoop rails. Requiring history matters — a Stoop-native lease
-- cancelled before move-in has no payments either, and its deposit return is
-- real work we must keep prompting.
--
-- Null still means "administer normally", so this changes nothing for any
-- lease it does not match, and it is reversible per-lease.

UPDATE leases l
   SET collections_paused_at     = now(),
       collections_paused_reason = 'Imported tenancy — never ran on Stoop'
 WHERE l.collections_paused_at IS NULL
   AND l.status IN ('expired', 'terminated')
   AND EXISTS (
     SELECT 1 FROM public.payments p WHERE p.lease_id = l.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.payments p
      WHERE p.lease_id = l.id AND p.stripe_payment_id IS NOT NULL
   );
