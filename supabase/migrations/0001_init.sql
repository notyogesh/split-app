-- =====================================================================
-- Split app — initial schema
-- Run in Supabase: Dashboard → SQL Editor → paste → Run.
--
-- Design:
--   * Money is stored as integer paise (bigint). ₹10.50 = 1050.
--   * Clients can only READ tables (RLS select policies).
--   * All writes go through SECURITY DEFINER functions that validate input
--     and membership, so a modified client can't write bad data.
--   * expense_history is written only by triggers and is append-only.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 40),
  upi_id      text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,128}@[A-Za-z]{2,64}$'),
  created_at  timestamptz not null default now()
);

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 40),
  invite_code  text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  currency     text not null default 'INR',
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_members (user_id);

create table public.recurring_expenses (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  created_by     uuid not null references public.profiles(id),
  payload        jsonb not null,          -- same shape as create_expense input
  day_of_month   int  not null check (day_of_month between 1 and 28),
  next_run       date not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  paid_by       uuid not null references public.profiles(id),
  created_by    uuid not null references public.profiles(id),
  title         text not null check (char_length(title) between 1 and 80),
  category      text not null default 'other' check (char_length(category) <= 24),
  amount_paise  bigint not null check (amount_paise > 0 and amount_paise <= 100000000),
  expense_date  date not null default current_date,
  visibility    text not null default 'group' check (visibility in ('private', 'group', 'selected')),
  split_type    text not null default 'equal' check (split_type in ('equal', 'exact', 'shares', 'none')),
  note          text check (note is null or char_length(note) <= 500),
  receipt_path  text,
  recurring_id  uuid references public.recurring_expenses(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.expenses (group_id, expense_date desc);
create index on public.expenses (paid_by);

create table public.expense_splits (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),
  share_paise  bigint not null check (share_paise >= 0),
  shares       numeric,                   -- weight when split_type = 'shares'
  status       text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at      timestamptz,
  marked_by    uuid references public.profiles(id),
  primary key (expense_id, user_id)
);
create index on public.expense_splits (user_id, status);

create table public.expense_viewers (
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  primary key (expense_id, user_id)
);

create table public.expense_history (
  id          bigint generated always as identity primary key,
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references public.profiles(id),
  changed_at  timestamptz not null default clock_timestamp()
);
create index on public.expense_history (expense_id, changed_at);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(left(new.raw_user_meta_data->>'name', 40), ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER avoids RLS recursion)
-- ---------------------------------------------------------------------

create function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid()
  );
$$;

create function public.can_view_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and public.is_group_member(e.group_id)
      and (
        e.created_by = auth.uid()
        or (e.visibility = 'group')
        or (e.visibility = 'selected' and (
              e.paid_by = auth.uid()
              or exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.user_id = auth.uid())
              or exists (select 1 from public.expense_viewers v where v.expense_id = e.id and v.user_id = auth.uid())
           ))
      )
  );
$$;

create function public.shares_group_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------
-- Row Level Security: read-only for clients
-- ---------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.expenses           enable row level security;
alter table public.expense_splits     enable row level security;
alter table public.expense_viewers    enable row level security;
alter table public.expense_history    enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles: see people in my groups" on public.profiles
  for select to authenticated using (public.shares_group_with(id));

create policy "groups: members" on public.groups
  for select to authenticated using (public.is_group_member(id));

create policy "group_members: members" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));

create policy "expenses: visible" on public.expenses
  for select to authenticated using (public.can_view_expense(id));

create policy "splits: visible" on public.expense_splits
  for select to authenticated using (public.can_view_expense(expense_id));

create policy "viewers: visible" on public.expense_viewers
  for select to authenticated using (public.can_view_expense(expense_id));

create policy "history: visible" on public.expense_history
  for select to authenticated using (public.can_view_expense(expense_id));

create policy "recurring: own" on public.recurring_expenses
  for select to authenticated using (created_by = auth.uid() and public.is_group_member(group_id));

create policy "push: own select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push: own insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push: own delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Belt and braces: clients never write these tables directly.
revoke insert, update, delete on
  public.profiles, public.groups, public.group_members, public.expenses,
  public.expense_splits, public.expense_viewers, public.expense_history,
  public.recurring_expenses
from anon, authenticated;
revoke all on public.push_subscriptions from anon;

-- ---------------------------------------------------------------------
-- Change history triggers (append-only audit log)
-- ---------------------------------------------------------------------

create function public.log_expense_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restored';
  else
    v_action := 'updated';
  end if;

  insert into public.expense_history (expense_id, action, old_data, new_data, changed_by)
  values (
    new.id, v_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' end,
    to_jsonb(new) - 'updated_at',
    coalesce(auth.uid(), new.created_by)
  );
  return new;
end $$;

create trigger expenses_history
  after insert or update on public.expenses
  for each row execute function public.log_expense_change();

create function public.log_split_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_expense uuid := coalesce(new.expense_id, old.expense_id);
  v_created timestamptz;
  v_action  text;
begin
  -- Splits inserted together with a brand-new expense are part of "created".
  select created_at into v_created from public.expenses where id = v_expense;
  if tg_op = 'INSERT' and v_created = now() then
    return new;
  end if;
  if tg_op = 'DELETE' and v_created is null then
    return old; -- expense itself is being deleted (cascade)
  end if;

  if tg_op = 'INSERT' then
    v_action := 'split_added';
  elsif tg_op = 'DELETE' then
    v_action := 'split_removed';
  elsif old.share_paise <> new.share_paise then
    v_action := 'split_changed';  -- may also reset status; old/new data show it
  elsif old.status <> new.status then
    v_action := case when new.status = 'paid' then 'marked_paid' else 'marked_unpaid' end;
  else
    return new;
  end if;

  insert into public.expense_history (expense_id, action, old_data, new_data, changed_by)
  values (
    v_expense, v_action,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger splits_history
  after insert or update or delete on public.expense_splits
  for each row execute function public.log_split_change();

-- ---------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------

create function public.update_profile(p_name text, p_upi text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles
     set name = left(trim(p_name), 40),
         upi_id = nullif(trim(coalesce(p_upi, '')), '')
   where id = auth.uid();
end $$;

create function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.groups (name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_id from public.groups where invite_code = lower(trim(p_code));
  if v_id is null then raise exception 'invalid invite code'; end if;
  insert into public.group_members (group_id, user_id) values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end $$;

create function public.reset_invite_code(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not exists (select 1 from public.group_members
                 where group_id = p_group and user_id = auth.uid() and role = 'admin') then
    raise exception 'only admins can reset the invite link';
  end if;
  update public.groups set invite_code = encode(extensions.gen_random_bytes(6), 'hex')
   where id = p_group returning invite_code into v_code;
  return v_code;
end $$;

-- ---------------------------------------------------------------------
-- Expenses
--
-- Payload (jsonb):
-- {
--   "group_id": uuid, "title": text, "category": text, "amount_paise": int,
--   "expense_date": "YYYY-MM-DD", "paid_by": uuid,
--   "visibility": "private"|"group"|"selected",
--   "split_type": "equal"|"exact"|"shares"|"none",
--   "splits": [{"user_id": uuid, "share_paise": int, "shares": num?}],
--   "viewers": [uuid], "note": text?, "receipt_path": text?,
--   "settled": bool   -- mark every share paid immediately
-- }
-- The client computes share_paise; the server re-checks they add up.
-- ---------------------------------------------------------------------

create function public._validate_expense(p_actor uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_group  uuid := (p->>'group_id')::uuid;
  v_amount bigint := (p->>'amount_paise')::bigint;
  v_vis    text := coalesce(p->>'visibility', 'group');
  v_type   text := coalesce(p->>'split_type', 'equal');
  v_paid   uuid := coalesce((p->>'paid_by')::uuid, p_actor);
  v_splits jsonb := coalesce(p->'splits', '[]'::jsonb);
  v_sum    bigint;
  v_bad    int;
begin
  if not exists (select 1 from public.group_members where group_id = v_group and user_id = p_actor) then
    raise exception 'not a member of this group';
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Private = personal tracking only: you paid, you own the whole amount.
  if v_vis = 'private' or v_type = 'none' then
    if v_vis = 'private' then v_paid := p_actor; end if;
    v_type := 'none';
    v_splits := jsonb_build_array(jsonb_build_object('user_id', v_paid, 'share_paise', v_amount));
  end if;

  if not exists (select 1 from public.group_members where group_id = v_group and user_id = v_paid) then
    raise exception 'payer is not in this group';
  end if;
  if jsonb_array_length(v_splits) = 0 then raise exception 'pick at least one person'; end if;

  select count(*) into v_bad
    from jsonb_array_elements(v_splits) s
   where not exists (select 1 from public.group_members m
                     where m.group_id = v_group and m.user_id = (s->>'user_id')::uuid)
      or (s->>'share_paise')::bigint < 0;
  if v_bad > 0 then raise exception 'invalid split participant or amount'; end if;

  select count(*) - count(distinct s->>'user_id') into v_bad from jsonb_array_elements(v_splits) s;
  if v_bad > 0 then raise exception 'duplicate person in split'; end if;

  select sum((s->>'share_paise')::bigint) into v_sum from jsonb_array_elements(v_splits) s;
  if v_sum <> v_amount then
    raise exception 'split shares (%) must add up to the amount (%)', v_sum, v_amount;
  end if;

  if p->>'receipt_path' is not null and split_part(p->>'receipt_path', '/', 1) <> p_actor::text then
    raise exception 'invalid receipt path';
  end if;

  return p || jsonb_build_object('paid_by', v_paid, 'split_type', v_type,
                                 'visibility', v_vis, 'splits', v_splits);
end $$;

create function public._insert_expense(p_actor uuid, p_in jsonb, p_recurring uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p       jsonb := public._validate_expense(p_actor, p_in);
  v_id    uuid;
  v_paid  uuid := (p->>'paid_by')::uuid;
  v_settled boolean := coalesce((p->>'settled')::boolean, false);
begin
  insert into public.expenses (group_id, paid_by, created_by, title, category, amount_paise,
                               expense_date, visibility, split_type, note, receipt_path, recurring_id)
  values ((p->>'group_id')::uuid, v_paid, p_actor, trim(p->>'title'),
          coalesce(nullif(p->>'category', ''), 'other'), (p->>'amount_paise')::bigint,
          coalesce((p->>'expense_date')::date, current_date),
          p->>'visibility', p->>'split_type', nullif(trim(coalesce(p->>'note', '')), ''),
          p->>'receipt_path', p_recurring)
  returning id into v_id;

  insert into public.expense_splits (expense_id, user_id, share_paise, shares, status, paid_at, marked_by)
  select v_id, (s->>'user_id')::uuid, (s->>'share_paise')::bigint, (s->>'shares')::numeric,
         case when (s->>'user_id')::uuid = v_paid or v_settled then 'paid' else 'unpaid' end,
         case when (s->>'user_id')::uuid = v_paid or v_settled then now() end,
         case when (s->>'user_id')::uuid = v_paid or v_settled then p_actor end
    from jsonb_array_elements(p->'splits') s;

  if p->>'visibility' = 'selected' then
    insert into public.expense_viewers (expense_id, user_id)
    select v_id, m.user_id
      from jsonb_array_elements_text(coalesce(p->'viewers', '[]'::jsonb)) v(uid)
      join public.group_members m on m.user_id = v.uid::uuid and m.group_id = (p->>'group_id')::uuid
    on conflict do nothing;
  end if;

  return v_id;
end $$;

create function public.create_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return public._insert_expense(auth.uid(), p);
end $$;

create function public.update_expense(p_id uuid, p_in jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e  public.expenses;
  p  jsonb;
  v_paid uuid;
begin
  select * into e from public.expenses where id = p_id and deleted_at is null;
  if e.id is null then raise exception 'expense not found'; end if;
  if e.created_by <> auth.uid() then raise exception 'only the person who added it can edit it'; end if;

  p := public._validate_expense(auth.uid(), p_in || jsonb_build_object('group_id', e.group_id));
  v_paid := (p->>'paid_by')::uuid;

  update public.expenses set
    paid_by = v_paid, title = trim(p->>'title'),
    category = coalesce(nullif(p->>'category', ''), 'other'),
    amount_paise = (p->>'amount_paise')::bigint,
    expense_date = coalesce((p->>'expense_date')::date, expense_date),
    visibility = p->>'visibility', split_type = p->>'split_type',
    note = nullif(trim(coalesce(p->>'note', '')), ''),
    receipt_path = case when p ? 'receipt_path' then p->>'receipt_path' else receipt_path end,
    updated_at = now()
  where id = p_id;

  -- Remove people no longer in the split.
  delete from public.expense_splits s
   where s.expense_id = p_id
     and not exists (select 1 from jsonb_array_elements(p->'splits') x where (x->>'user_id')::uuid = s.user_id);

  -- Update changed shares: a changed share goes back to unpaid (except the payer's own).
  update public.expense_splits s set
    share_paise = (x->>'share_paise')::bigint,
    shares = (x->>'shares')::numeric,
    status = case when s.user_id = v_paid then 'paid'
                  when s.share_paise <> (x->>'share_paise')::bigint then 'unpaid'
                  else s.status end,
    paid_at = case when s.user_id = v_paid then coalesce(s.paid_at, now())
                   when s.share_paise <> (x->>'share_paise')::bigint then null
                   else s.paid_at end
  from jsonb_array_elements(p->'splits') x
  where s.expense_id = p_id and s.user_id = (x->>'user_id')::uuid
    and (s.share_paise <> (x->>'share_paise')::bigint
         or s.shares is distinct from (x->>'shares')::numeric
         or (s.user_id = v_paid and s.status <> 'paid'));

  -- If the payer changed, the old payer's share now has to be paid back.
  if e.paid_by <> v_paid then
    update public.expense_splits set status = 'unpaid', paid_at = null, marked_by = null
     where expense_id = p_id and user_id = e.paid_by and status = 'paid';
  end if;

  -- Add new people.
  insert into public.expense_splits (expense_id, user_id, share_paise, shares, status, paid_at, marked_by)
  select p_id, (x->>'user_id')::uuid, (x->>'share_paise')::bigint, (x->>'shares')::numeric,
         case when (x->>'user_id')::uuid = v_paid then 'paid' else 'unpaid' end,
         case when (x->>'user_id')::uuid = v_paid then now() end,
         case when (x->>'user_id')::uuid = v_paid then auth.uid() end
    from jsonb_array_elements(p->'splits') x
  on conflict (expense_id, user_id) do nothing;

  delete from public.expense_viewers where expense_id = p_id;
  if p->>'visibility' = 'selected' then
    insert into public.expense_viewers (expense_id, user_id)
    select p_id, m.user_id
      from jsonb_array_elements_text(coalesce(p->'viewers', '[]'::jsonb)) v(uid)
      join public.group_members m on m.user_id = v.uid::uuid and m.group_id = e.group_id
    on conflict do nothing;
  end if;
end $$;

create function public.delete_expense(p_id uuid, p_restore boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.expenses
     set deleted_at = case when p_restore then null else now() end, updated_at = now()
   where id = p_id and created_by = auth.uid()
     and (deleted_at is null) = (not p_restore);
  if not found then raise exception 'expense not found or not yours'; end if;
end $$;

-- The person who owes, or the person who paid, can flip a share's status.
create function public.set_split_status(p_expense uuid, p_user uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_payer uuid;
begin
  select paid_by into v_payer from public.expenses where id = p_expense and deleted_at is null;
  if v_payer is null then raise exception 'expense not found'; end if;
  if auth.uid() not in (p_user, v_payer) then
    raise exception 'only the payer or the person who owes can change this';
  end if;
  if p_user = v_payer then raise exception 'the payer''s own share is always paid'; end if;

  update public.expense_splits set
    status = case when p_paid then 'paid' else 'unpaid' end,
    paid_at = case when p_paid then now() end,
    marked_by = auth.uid()
  where expense_id = p_expense and user_id = p_user
    and status <> case when p_paid then 'paid' else 'unpaid' end;
end $$;

-- Mark every unpaid share between me and another person as paid (both directions).
create function public.settle_up(p_group uuid, p_other uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if not public.is_group_member(p_group) then raise exception 'not a member'; end if;
  update public.expense_splits s set status = 'paid', paid_at = now(), marked_by = auth.uid()
    from public.expenses e
   where e.id = s.expense_id and e.group_id = p_group and e.deleted_at is null
     and s.status = 'unpaid'
     and ((s.user_id = auth.uid() and e.paid_by = p_other)
       or (s.user_id = p_other and e.paid_by = auth.uid()));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------

-- What I owe each person / each person owes me (positive = they owe me).
create function public.my_balances(p_group uuid)
returns table (user_id uuid, net_paise bigint)
language sql stable security definer set search_path = '' as $$
  select other, sum(amt)::bigint from (
    select e.paid_by as other, -s.share_paise as amt
      from public.expense_splits s join public.expenses e on e.id = s.expense_id
     where e.group_id = p_group and e.deleted_at is null and s.status = 'unpaid'
       and s.user_id = auth.uid() and e.paid_by <> auth.uid()
    union all
    select s.user_id, s.share_paise
      from public.expense_splits s join public.expenses e on e.id = s.expense_id
     where e.group_id = p_group and e.deleted_at is null and s.status = 'unpaid'
       and e.paid_by = auth.uid() and s.user_id <> auth.uid()
  ) t
  where public.is_group_member(p_group)
  group by other
  having sum(amt) <> 0;
$$;

-- Each member's overall net in the group (totals only, no expense details).
create function public.group_balances(p_group uuid)
returns table (user_id uuid, net_paise bigint)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         coalesce((select sum(s.share_paise) from public.expense_splits s
                     join public.expenses e on e.id = s.expense_id
                    where e.group_id = p_group and e.deleted_at is null and s.status = 'unpaid'
                      and e.paid_by = m.user_id and s.user_id <> m.user_id), 0)::bigint
       - coalesce((select sum(s.share_paise) from public.expense_splits s
                     join public.expenses e on e.id = s.expense_id
                    where e.group_id = p_group and e.deleted_at is null and s.status = 'unpaid'
                      and s.user_id = m.user_id and e.paid_by <> m.user_id), 0)::bigint
  from public.group_members m
  where m.group_id = p_group and public.is_group_member(p_group);
$$;

-- ---------------------------------------------------------------------
-- Recurring expenses (rent, wifi, maid…)
-- ---------------------------------------------------------------------

create function public.create_recurring(p jsonb, p_day int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_next date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public._validate_expense(auth.uid(), p);  -- fail early on bad input
  v_next := make_date(extract(year from current_date)::int, extract(month from current_date)::int, p_day);
  -- Strictly after today: the add form saves today's expense itself.
  if v_next <= current_date then v_next := (v_next + interval '1 month')::date; end if;
  insert into public.recurring_expenses (group_id, created_by, payload, day_of_month, next_run)
  values ((p->>'group_id')::uuid, auth.uid(), p - 'receipt_path' - 'settled' - 'expense_date', p_day, v_next)
  returning id into v_id;
  return v_id;
end $$;

create function public.set_recurring_active(p_id uuid, p_active boolean, p_delete boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_delete then
    delete from public.recurring_expenses where id = p_id and created_by = auth.uid();
  else
    update public.recurring_expenses set active = p_active where id = p_id and created_by = auth.uid();
  end if;
  if not found then raise exception 'not found'; end if;
end $$;

-- Called once a day by the Vercel cron (service role only).
create function public.run_recurring() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select * from public.recurring_expenses
     where active and next_run <= current_date
     for update skip locked
  loop
    begin
      perform public._insert_expense(
        r.created_by,
        r.payload || jsonb_build_object('expense_date', r.next_run),
        r.id);
      v_count := v_count + 1;
    exception when others then
      -- A member left, etc. Pause it instead of failing the whole run.
      update public.recurring_expenses set active = false where id = r.id;
      continue;
    end;
    update public.recurring_expenses
       set next_run = (next_run + interval '1 month')::date
     where id = r.id;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.is_group_member(uuid), public.can_view_expense(uuid), public.shares_group_with(uuid),
  public.update_profile(text, text), public.create_group(text), public.join_group(text),
  public.reset_invite_code(uuid), public.create_expense(jsonb), public.update_expense(uuid, jsonb),
  public.delete_expense(uuid, boolean), public.set_split_status(uuid, uuid, boolean),
  public.settle_up(uuid, uuid), public.my_balances(uuid), public.group_balances(uuid),
  public.create_recurring(jsonb, int), public.set_recurring_active(uuid, boolean, boolean)
to authenticated;

revoke execute on function public._validate_expense(uuid, jsonb), public._insert_expense(uuid, jsonb, uuid),
  public.run_recurring() from authenticated;
grant execute on function public.run_recurring() to service_role;

-- ---------------------------------------------------------------------
-- Receipt storage (private bucket). Path: <uploader-id>/<uuid>.webp
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "receipts: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "receipts: read if expense visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.expenses e
                  where e.receipt_path = storage.objects.name and public.can_view_expense(e.id))
    )
  );

create policy "receipts: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
