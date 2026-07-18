-- 20260718000001_payment_dispute_refund_statuses.sql
-- The stripe-webhook now handles charge.dispute.created and charge.refunded:
-- a disputed rent payment must stop counting as collected, and a fully
-- refunded one must stop showing as Paid. Two new payment_status values back
-- those transitions. (ALTER TYPE ... ADD VALUE is safe in a migration as long
-- as the new value isn't used in the same transaction — it isn't here.)

ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'disputed';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';
