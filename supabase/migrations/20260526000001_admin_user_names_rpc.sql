-- 20260526000001_admin_user_names_rpc.sql
--
-- Admin console shows users as 6-char refs by default. Sometimes the admin
-- needs to bridge ref ↔ identity (e.g., to verify a flagged signup). This
-- RPC returns id → full_name / email for a batch of ids, but ONLY when the
-- caller is themselves an admin. Non-admin callers get an exception so the
-- function can't be used to bulk-enumerate PII from a manager/tenant token.
--
-- Returns rows keyed by id so the client can join back into whatever
-- ref-anonymized list it's rendering.

-- The RETURNS TABLE column names (id, full_name, email) shadow the
-- profiles columns of the same name in the function body — qualify
-- everything with the table alias `p` to avoid "column reference is
-- ambiguous" errors.
CREATE OR REPLACE FUNCTION public.admin_user_names(p_ids UUID[])
RETURNS TABLE(id UUID, full_name TEXT, email TEXT) AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT (p.role = 'admin') INTO v_is_admin
    FROM public.profiles p
   WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
    FROM public.profiles p
   WHERE p.id = ANY(p_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_user_names(UUID[]) TO authenticated;
