create extension if not exists pgcrypto;

create table if not exists public.notifications (
    notification_id uuid primary key,
    title text not null,
    message text not null,
    severity text not null default 'info',
    category text not null default 'system_event',
    target_page text,
    target_hash text,
    is_read boolean not null default false,
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    recipient_role text,
    recipient_user_id uuid references public.app_users(id) on delete cascade
);

alter table if exists public.notifications
    add column if not exists recipient_role text;

alter table if exists public.notifications
    add column if not exists recipient_user_id uuid references public.app_users(id) on delete cascade;

create index if not exists notifications_recipient_role_idx
    on public.notifications (recipient_role, created_at desc);

create index if not exists notifications_recipient_user_idx
    on public.notifications (recipient_user_id, created_at desc);

create table if not exists public.field_updates (
    field_update_id uuid primary key default gen_random_uuid(),
    barangay text not null,
    barangay_key text not null,
    reporting_date date not null,
    submitted_by uuid not null references public.app_users(id) on delete cascade,
    tasks jsonb not null default '{}'::jsonb,
    completed_count integer not null default 0,
    total_tasks integer not null default 5,
    observation_note text not null default '',
    risk_level text not null default 'Pending',
    predicted_cases numeric not null default 0,
    status text not null default 'Draft',
    is_urgent boolean not null default false,
    suspected_symptoms boolean not null default false,
    supplies_needed boolean not null default false,
    assistance_needed boolean not null default false,
    saved_at timestamptz not null default now(),
    submitted_at timestamptz,
    reviewed_by uuid references public.app_users(id) on delete set null,
    reviewed_at timestamptz,
    supervisor_comment text not null default '',
    updated_at timestamptz not null default now(),
    constraint field_updates_status_check check (
        status in ('Draft', 'Submitted', 'Reviewed', 'Follow-up Required')
    ),
    constraint field_updates_daily_unique unique (submitted_by, barangay_key, reporting_date)
);

create index if not exists field_updates_reporting_date_idx
    on public.field_updates (reporting_date desc);

create index if not exists field_updates_status_idx
    on public.field_updates (status, submitted_at desc);

create index if not exists field_updates_barangay_idx
    on public.field_updates (barangay_key, reporting_date desc);
