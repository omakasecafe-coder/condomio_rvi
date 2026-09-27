alter table public.opportunities
  add column cal_booking_uid text,
  add column demo_starts_at timestamptz,
  add column demo_ends_at timestamptz,
  add column demo_booking_status text;

create unique index opportunities_cal_booking_uid_idx
  on public.opportunities (cal_booking_uid)
  where cal_booking_uid is not null;
