-- ==============================================================================
-- PRAYER TIMES & NOTIFICATIONS MIGRATION (Alexandria, Egypt)
-- Run this script in the Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

-- 1. Prayer Times Table (Daily Cached Timings for Alexandria, Egypt)
CREATE TABLE IF NOT EXISTS public.prayer_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prayer_date DATE NOT NULL,
    prayer TEXT NOT NULL,
    prayer_time TIME NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_prayer_times_date_prayer UNIQUE (prayer_date, prayer)
);

-- 2. Prayer Notifications Table (Atomic Claim & Delivery Tracking)
CREATE TABLE IF NOT EXISTS public.prayer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prayer_date DATE NOT NULL,
    prayer TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sending' | 'sent' | 'failed' | 'missed'
    sent_at TIMESTAMPTZ,
    group_results JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_prayer_notifications_date_prayer UNIQUE (prayer_date, prayer)
);

-- 3. Indexes for fast single-minute dispatcher and status lookups
CREATE INDEX IF NOT EXISTS idx_prayer_times_date ON public.prayer_times (prayer_date);
CREATE INDEX IF NOT EXISTS idx_prayer_notifications_date ON public.prayer_notifications (prayer_date);
CREATE INDEX IF NOT EXISTS idx_prayer_notifications_status ON public.prayer_notifications (status);

-- 4. Enable Row Level Security (RLS) consistent with existing tables
ALTER TABLE public.prayer_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Grant access permissions to anon, authenticated, and service_role
GRANT ALL ON public.prayer_times TO anon, authenticated, service_role;
GRANT ALL ON public.prayer_notifications TO anon, authenticated, service_role;

-- 6. Permissive RLS policies consistent with existing database schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public access to prayer_times' 
      AND tablename = 'prayer_times'
  ) THEN
    CREATE POLICY "Public access to prayer_times" ON public.prayer_times FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public access to prayer_notifications' 
      AND tablename = 'prayer_notifications'
  ) THEN
    CREATE POLICY "Public access to prayer_notifications" ON public.prayer_notifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
