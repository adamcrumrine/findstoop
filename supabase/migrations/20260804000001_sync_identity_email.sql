-- Keep auth.identities in step with an admin-initiated email change.
--
-- The email provider's identity row carries its own copy of the address in
-- identity_data. When only auth.users.email is updated, the account reports two
-- different addresses depending on which one a caller reads — we hit exactly
-- that on a tenant whose university migrated her mailbox: auth.users said one
-- thing, identity_data said another with email_verified false.
--
-- update-tenant calls GoTrue's admin API first (which owns the auth.users
-- bookkeeping) and then this, so the identity copy is reconciled regardless of
-- whether GoTrue already did it. Idempotent.
--
-- service_role only — it writes to the auth schema.

create or replace function public.sync_identity_email(target_user uuid, new_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.identities
     set identity_data = jsonb_set(
           jsonb_set(identity_data, '{email}', to_jsonb(lower(btrim(new_email)))),
           '{email_verified}', 'true'::jsonb
         ),
         updated_at = now()
   where user_id = target_user
     and provider = 'email';
end;
$$;

revoke all on function public.sync_identity_email(uuid, text) from public;
revoke all on function public.sync_identity_email(uuid, text) from anon;
revoke all on function public.sync_identity_email(uuid, text) from authenticated;
grant execute on function public.sync_identity_email(uuid, text) to service_role;
