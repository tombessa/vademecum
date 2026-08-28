BEGIN;

SET LOCAL search_path TO vademecum, public;

CREATE OR REPLACE FUNCTION ensure_chatgpt_user(p_email citext, p_display_name text)
RETURNS TABLE(user_id uuid, user_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vademecum, public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO app_user (
    email, display_name, auth_provider, external_subject, status
  ) VALUES (p_email, p_display_name, 'CHATGPT', p_email, 'ACTIVE')
  ON CONFLICT (email) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        auth_provider = 'CHATGPT',
        external_subject = EXCLUDED.external_subject,
        status = 'ACTIVE'
  RETURNING app_user.id, app_user.role::text;
END;
$$;

COMMIT;
