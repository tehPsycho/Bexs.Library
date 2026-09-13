-- Apply this to an existing Bex's Library database when deploying the full-email
-- login flow. Supabase Auth already stores and authenticates full email addresses,
-- so no auth.users, profiles, or books data needs to be migrated.

drop function if exists public.preview_member_card(text);
