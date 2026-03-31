-- ============================================================
-- Permissions: Action-Level Access + Minimum Admin Protection
-- ============================================================

-- 1. Add access_level column to module_access (full = read+write, read = read-only)
ALTER TABLE public.module_access
    ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'full';

COMMENT ON COLUMN public.module_access.access_level IS
    'Permission level: full = read+write, read = read-only';

-- 2. Minimum-admin protection trigger
CREATE OR REPLACE FUNCTION public.check_minimum_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_count INTEGER;
    admin_role_id UUID;
BEGIN
    SELECT id INTO admin_role_id FROM public.roles WHERE role_name = 'admin';

    IF TG_OP = 'DELETE' AND OLD.role_id = admin_role_id THEN
        SELECT COUNT(*) INTO admin_count
        FROM public.user_roles ur
        JOIN public.users u ON u.id = ur.user_id
        WHERE ur.role_id = admin_role_id
          AND u.status = 'active'
          AND ur.id != OLD.id;

        IF admin_count < 1 THEN
            RAISE EXCEPTION 'Cannot remove the last admin. At least one active admin user is required.';
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_minimum_admin ON public.user_roles;
CREATE TRIGGER trg_check_minimum_admin
    BEFORE DELETE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_minimum_admin();
