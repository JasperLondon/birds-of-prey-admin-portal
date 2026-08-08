DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Required function public.is_admin() is missing.';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Allow admins to update announcements" ON public.announcements';
  EXECUTE 'CREATE POLICY "Allow admins to update announcements" ON public.announcements FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
END $$;
