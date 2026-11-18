-- =====================================================================
-- Fix: users who signed in before 0001 ran have no profile row, so
-- create_group fails with "groups_created_by_fkey".
-- Safe to run more than once.
-- =====================================================================

-- 1. Create a profile for every existing auth user that's missing one.
insert into public.profiles (id, name)
select u.id, coalesce(left(u.raw_user_meta_data->>'name', 40), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 2. Make update_profile create the row if it's missing (belt and braces).
create or replace function public.update_profile(p_name text, p_upi text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id, name, upi_id)
  values (auth.uid(), left(trim(p_name), 40), nullif(trim(coalesce(p_upi, '')), ''))
  on conflict (id) do update
    set name = excluded.name,
        upi_id = excluded.upi_id;
end $$;
