-- Per-tenant control over who pays the Stripe processing fee.
--
-- The pass-through is the default: the tenant paying sees the fee added to
-- their charge. But a landlord sometimes needs to absorb it for a specific
-- person — someone who signed while ACH was still advertised as free, a
-- goodwill call after a bad month, a unit where the landlord would rather
-- quote one round number. Making that a per-tenant switch rather than a
-- per-lease one matters on shared houses, where roommates sign at different
-- times under different terms.
--
-- Absorbing does NOT make the fee disappear. Stripe still takes it; it comes
-- out of the landlord's transfer instead of the tenant's card. See
-- create-payment-intent, which keeps application_fee_amount at the full fee
-- while charging the tenant rent alone.

alter table lease_tenants
  add column if not exists landlord_absorbs_fees boolean not null default false;

comment on column lease_tenants.landlord_absorbs_fees is
  'When true, this tenant is charged rent only and the processing fee is deducted from the landlord''s payout instead. Default false = fee passed through to the tenant.';

-- Managers change this through a definer function rather than a direct UPDATE
-- policy: lease_tenants also carries rent shares and pet-fee assignment, and
-- opening the table for writes to change one boolean would expose the rest.
create or replace function set_tenant_fee_absorption(
  p_lease_id  uuid,
  p_tenant_id uuid,
  p_absorb    boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manages boolean;
begin
  select exists (
    select 1
      from leases l
      join units u      on u.id = l.unit_id
      join properties p on p.id = u.property_id
     where l.id = p_lease_id
       and p.manager_id = auth.uid()
  ) into v_manages;

  if not v_manages then
    raise exception 'Not authorized to change fee settings for this lease'
      using errcode = '42501';
  end if;

  update lease_tenants
     set landlord_absorbs_fees = coalesce(p_absorb, false)
   where lease_id = p_lease_id
     and tenant_id = p_tenant_id;

  if not found then
    raise exception 'That tenant is not on this lease' using errcode = 'P0002';
  end if;

  return coalesce(p_absorb, false);
end;
$$;

grant execute on function set_tenant_fee_absorption(uuid, uuid, boolean) to authenticated;
