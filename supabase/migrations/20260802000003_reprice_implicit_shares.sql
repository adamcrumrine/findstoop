-- When one roommate sets their share, re-price everyone whose share is implicit.
--
-- set_my_rent_share already computed the corrected split for the whole house
-- via lease_tenant_charges, then threw all of it away except the caller's row:
--
--     IF chg.tenant_id = auth.uid() THEN ... END IF;
--
-- That is wrong by construction. An implicit share is defined as "the rest of
-- the rent, divided by whoever hasn't named a number" — so it changes the
-- moment anybody else names one. Only the person who acted got re-priced, and
-- the others kept a figure derived from a household that no longer existed.
--
-- Unit 301 showed the damage: Ava took $425 and Ella took $560, leaving
-- $1,115 to split two ways = $557.50 each. Elizabeth and Samantha were still
-- being billed $558.33 and $558.34 — the even split of $2,100 - $425 across
-- three people, i.e. the answer from before Ella set hers. September collected
-- $2,101.67 against $2,100 of rent. The "split sum ≠ lease rent" banner
-- correctly reported the discrepancy every month and nothing could clear it,
-- because the only control that re-prices anything only ever moved one row.
--
-- Explicit shares are left alone: someone who named a number shouldn't have it
-- silently changed by a roommate. Only the derived amounts move.
create or replace function public.set_my_rent_share(p_lease_id uuid, p_amount numeric)
returns table(updated_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_party boolean;
  v_mode     text;
  v_lease    public.leases%rowtype;
  v_updated  integer := 0;
  v_rows     integer := 0;
  chg        record;
begin
  select exists (
    select 1 from public.lease_tenants lt
     where lt.lease_id = p_lease_id and lt.tenant_id = auth.uid() and lt.is_primary
  ) into v_is_party;
  if not v_is_party then
    raise exception 'not a primary tenant on this lease';
  end if;

  select rent_split_mode into v_mode from public.leases where id = p_lease_id;
  if v_mode is distinct from 'self_serve' then
    raise exception 'this lease uses an even split — contact your landlord to change it';
  end if;

  if p_amount is not null and (p_amount < 0 or p_amount > 1000000) then
    raise exception 'amount out of range';
  end if;

  update public.lease_tenants
     set rent_share = p_amount
   where lease_id = p_lease_id and tenant_id = auth.uid();

  select * into v_lease from public.leases where id = p_lease_id;

  -- Re-price every tenant the recomputed split covers, not just the caller.
  --
  -- Future UNPAID rent only. A settled or in-flight month is a record of what
  -- happened and must not be rewritten under a tenant who has already paid it,
  -- and back-dated rows stay as billed.
  for chg in select * from public.lease_tenant_charges(p_lease_id, v_lease.rent_amount) loop
    -- The caller's own explicit amount, plus anyone whose share is derived.
    -- A roommate with their own explicit number is untouched.
    if chg.tenant_id = auth.uid()
       or exists (
         select 1 from public.lease_tenants lt
          where lt.lease_id = p_lease_id
            and lt.tenant_id = chg.tenant_id
            and lt.rent_share is null
       )
    then
      update public.payments p
         set amount = chg.rent_amount
       where p.lease_id  = p_lease_id
         and p.tenant_id = chg.tenant_id
         and p.type      = 'rent'
         and p.status    = 'pending'
         and p.due_date >= current_date
         and p.amount is distinct from chg.rent_amount;
      -- Accumulate across the loop; assigning would report only the last
      -- tenant's rows and make a four-person re-price look like a one-row edit.
      get diagnostics v_rows = row_count;
      v_updated := v_updated + v_rows;
    end if;
  end loop;

  return query select v_updated;
end;
$function$;
