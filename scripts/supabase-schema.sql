-- ==============================================================================
-- ELITE HOSPITAL ATTENDANCE & PHYSICIAN SYSTEM - SUPABASE DATABASE MIGRATION
-- Run this complete script in the Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

-- 1. Master Doctors Database
CREATE TABLE IF NOT EXISTS public.doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Daily Active Check-ins (Attendance Roster)
CREATE TABLE IF NOT EXISTS public.checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Weekly Cumulative Check-ins (Cumulative logs for weekly reporting)
CREATE TABLE IF NOT EXISTS public.weekly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Custom Doctor Overrides (Persisted custom added or edited physicians)
CREATE TABLE IF NOT EXISTS public.custom_doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    original_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Custom Doctor Phone Overrides
CREATE TABLE IF NOT EXISTS public.custom_doctor_phones (
    id TEXT PRIMARY KEY,
    mobile_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Deleted Doctors (Blacklist of deleted master records)
CREATE TABLE IF NOT EXISTS public.deleted_doctors (
    id TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for fast querying and filtering
CREATE INDEX IF NOT EXISTS idx_doctors_name ON public.doctors (name);
CREATE INDEX IF NOT EXISTS idx_doctors_dept ON public.doctors (department);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON public.doctors (is_active);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON public.checkins (checkin_date);
CREATE INDEX IF NOT EXISTS idx_checkins_doctor_id ON public.checkins (doctor_id);
CREATE INDEX IF NOT EXISTS idx_checkins_timestamp ON public.checkins (checkin_timestamp);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_doctor_id ON public.weekly_checkins (doctor_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_timestamp ON public.weekly_checkins (checkin_timestamp);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_doctor_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_doctors ENABLE ROW LEVEL SECURITY;

-- Grant schema and table access permissions to anon, authenticated, and service_role roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Allow public / anon / authenticated full read & write access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to doctors' AND tablename = 'doctors') THEN
    CREATE POLICY "Public access to doctors" ON public.doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to checkins' AND tablename = 'checkins') THEN
    CREATE POLICY "Public access to checkins" ON public.checkins FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to weekly_checkins' AND tablename = 'weekly_checkins') THEN
    CREATE POLICY "Public access to weekly_checkins" ON public.weekly_checkins FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to custom_doctors' AND tablename = 'custom_doctors') THEN
    CREATE POLICY "Public access to custom_doctors" ON public.custom_doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to custom_doctor_phones' AND tablename = 'custom_doctor_phones') THEN
    CREATE POLICY "Public access to custom_doctor_phones" ON public.custom_doctor_phones FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to deleted_doctors' AND tablename = 'deleted_doctors') THEN
    CREATE POLICY "Public access to deleted_doctors" ON public.deleted_doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
