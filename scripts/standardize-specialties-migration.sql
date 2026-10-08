-- ==============================================================================
-- ELITE HOSPITAL - MEDICAL SPECIALTIES STANDARDIZATION & DATABASE OPTIMIZATION
-- Run this complete script in the Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. ENSURE ATTENDANCE TABLES AND COLUMNS EXIST (Resolves Error 42P01 & 42703)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_checkins (
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

CREATE TABLE IF NOT EXISTS public.monthly_checkins (
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

-- Ensure checkin_date column exists and backfill values from timestamp
ALTER TABLE public.weekly_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT CURRENT_DATE;
UPDATE public.weekly_checkins 
SET checkin_date = (checkin_timestamp AT TIME ZONE 'Africa/Cairo')::DATE 
WHERE checkin_date IS NULL;

ALTER TABLE public.monthly_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT CURRENT_DATE;
UPDATE public.monthly_checkins 
SET checkin_date = (checkin_timestamp AT TIME ZONE 'Africa/Cairo')::DATE 
WHERE checkin_date IS NULL;

-- ==============================================================================
-- 2. DEDUPLICATE ATTENDANCE RECORDS (Resolves Error 23505)
-- ==============================================================================

-- Deduplicate weekly_checkins keeping the latest entry per doctor per date
DELETE FROM public.weekly_checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id, checkin_date 
      ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn
    FROM public.weekly_checkins
  ) dupes WHERE dupes.rn > 1
);

-- Deduplicate monthly_checkins keeping the latest entry per doctor per date
DELETE FROM public.monthly_checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id, checkin_date 
      ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn
    FROM public.monthly_checkins
  ) dupes WHERE dupes.rn > 1
);

-- Deduplicate daily checkins keeping the latest entry per doctor
DELETE FROM public.checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id 
      ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn
    FROM public.checkins
  ) dupes WHERE dupes.rn > 1
);

-- ==============================================================================
-- 3. CLEAN STRINGS & NORMALIZE CANONICAL SPECIALTIES IN public.doctors
-- ==============================================================================

UPDATE public.doctors
SET department = TRIM(REPLACE(department, E'\u00A0', ' '))
WHERE department IS NOT NULL;

-- General Surgery (including Vascular Surgery & iVein)
UPDATE public.doctors
SET department = 'General Surgery', updated_at = now()
WHERE department ILIKE '%general surgery%'
   OR department ILIKE '%الجراحة العامة%'
   OR department IN ('GS Doctor', 'General')
   OR department ILIKE '%vascular%'
   OR department = 'iVein'
   OR department ILIKE '%git surgery%'
   OR department ILIKE '%git and pancreas%'
   OR department ILIKE '%bariatric%'
   OR department ILIKE '%pediatric surgery%'
   OR department ILIKE '%pediatric oncology surgery%'
   OR department ILIKE '%endocrine surgery%'
   OR department ILIKE '%colorectal%'
   OR department ILIKE '%breast surgery%'
   OR department ILIKE '%plastic surgery%'
   OR department ILIKE '%hand and microsurgery%'
   OR department ILIKE '%maxillofacial%';

-- Internal Medicine
UPDATE public.doctors
SET department = 'Internal Medicine', updated_at = now()
WHERE department ILIKE '%internal medicine%'
   OR department ILIKE '%باطن%'
   OR department ILIKE '%pulmonology%'
   OR department ILIKE '%pulmonary%'
   OR department ILIKE '%hematology%'
   OR department ILIKE '%haematologist%'
   OR department ILIKE '%endocrinolog%'
   OR department ILIKE '%diabetes%'
   OR department ILIKE '%thyroid%'
   OR department ILIKE '%pituitary%'
   OR department ILIKE '%الغدة النخامية%'
   OR department ILIKE '%rheumatolog%'
   OR department ILIKE '%nephrology%'
   OR department ILIKE '%hepatolog%'
   OR department ILIKE '%hepatica%'
   OR department ILIKE '%liver transplantation%'
   OR department ILIKE '%gastroenterology%'
   OR department ILIKE '%infectious disease%'
   OR department ILIKE '%immunology%'
   OR department ILIKE '%nutrition%';

-- ICU
UPDATE public.doctors
SET department = 'ICU', updated_at = now()
WHERE department = 'ICU'
   OR department ILIKE 'ICU%'
   OR department ILIKE '%critical care%'
   OR department ILIKE '%حالات حرجة%'
   OR department ILIKE '%sicu%'
   OR department ILIKE '%emerg%';

-- Cardiology
UPDATE public.doctors
SET department = 'Cardiology', updated_at = now()
WHERE department ILIKE '%cardiology%'
   OR department ILIKE '%القلب%'
   OR department ILIKE '%structural heart%'
   OR department ILIKE '%heart failure%'
   OR department ILIKE '%cardiac rehabilitation%'
   OR department ILIKE '%holter%'
   OR department ILIKE '%echo%';

-- Pediatrics
UPDATE public.doctors
SET department = 'Pediatrics', updated_at = now()
WHERE department ILIKE '%pediatric%'
   OR department ILIKE '%اطفال%';

-- Cardiothoracic Surgery
UPDATE public.doctors
SET department = 'Cardiothoracic Surgery', updated_at = now()
WHERE department ILIKE '%cardiothoracic%';

-- Urology
UPDATE public.doctors
SET department = 'Urology', updated_at = now()
WHERE department ILIKE '%urology%'
   OR department ILIKE '%مسالك%';

-- Orthopedic Surgery
UPDATE public.doctors
SET department = 'Orthopedic Surgery', updated_at = now()
WHERE department ILIKE '%orthopedic%'
   OR department ILIKE '%orthopedics%'
   OR department ILIKE '%عظام%';

-- Neurosurgery
UPDATE public.doctors
SET department = 'Neurosurgery', updated_at = now()
WHERE department ILIKE '%neurosurgery%'
   OR department ILIKE '%spine surgeon%';

-- Oncology
UPDATE public.doctors
SET department = 'Oncology', updated_at = now()
WHERE department ILIKE '%oncology%'
   OR department ILIKE '%اورام%';

-- ENT
UPDATE public.doctors
SET department = 'ENT', updated_at = now()
WHERE department = 'ENT'
   OR department ILIKE '%ent%'
   OR department ILIKE '%ear%'
   OR department ILIKE '%audiometry%'
   OR department ILIKE '%swallowing%';

-- Obstetrics and gynecology
UPDATE public.doctors
SET department = 'Obstetrics and gynecology', updated_at = now()
WHERE department ILIKE '%obstetrics%'
   OR department ILIKE '%gynecology%'
   OR department ILIKE '%نساء%'
   OR department = '4D'
   OR department ILIKE '%breast feeding%';

-- Radiology (including Interventional Radiology)
UPDATE public.doctors
SET department = 'Radiology', updated_at = now()
WHERE department ILIKE '%radiology%'
   OR department ILIKE '%intervential%'
   OR department ILIKE '%interventional%'
   OR department ILIKE '%x ray%'
   OR department ILIKE '%ct%'
   OR department ILIKE '%mri%'
   OR department = 'U/S'
   OR department ILIKE '%ultrasound%'
   OR department ILIKE '%rad doctor%';

-- Physiotherapy
UPDATE public.doctors
SET department = 'Physiotherapy', updated_at = now()
WHERE department ILIKE '%physiotherapy%'
   OR department ILIKE '%physiotherpy%'
   OR department ILIKE '%physical medicine%'
   OR department ILIKE '%علاج طبيعي%'
   OR department ILIKE '%low back pain%'
   OR department ILIKE '%prp injection%';

-- Anesthesiology & Pain Therapy
UPDATE public.doctors
SET department = 'Anesthesiology & Pain Therapy', updated_at = now()
WHERE department ILIKE '%anesthesia%'
   OR department ILIKE '%pain therapy%'
   OR department ILIKE '%تخدير%';

-- ==============================================================================
-- 4. SOFT-DEACTIVATE EXCLUDED & NON-INPATIENT PHYSICIANS
-- ==============================================================================

UPDATE public.doctors
SET is_active = false, updated_at = now()
WHERE department ILIKE '%home visit%'
   OR department ILIKE '%dental%'
   OR department ILIKE '%orthodontist%'
   OR department ILIKE '%dermatolog%'
   OR department ILIKE '%cosmotolog%'
   OR department ILIKE '%جلدية%'
   OR department ILIKE '%hair transplant%'
   OR department ILIKE '%psoriasis%'
   OR department ILIKE '%ophthalmolog%'
   OR department ILIKE '%neurolog%'
   OR department ILIKE '%neuropsychiatr%'
   OR department ILIKE '%pediatric cardiology%'
   OR department ILIKE '%laboratory%'
   OR department ILIKE '%معمل%'
   OR department ILIKE '%pharmac%'
   OR department ILIKE '%nurse%'
   OR department ILIKE '%medical records%'
   OR department ILIKE '%speciality%'
   OR department ILIKE '%check up%'
   OR department ILIKE '%offers%'
   OR department ILIKE '%visiting doctor%'
   OR department ILIKE '%online consultation%'
   OR department ILIKE '%eeg%'
   OR department ILIKE '%nerve conduction%'
   OR department ILIKE '%forensic%'
   OR department ILIKE '%toxoclogy%'
   OR department ILIKE '%external services%'
   OR department IN ('OR', 'NULL', 'Other');

-- Fix any NULL is_active rows
UPDATE public.doctors
SET is_active = false, updated_at = now()
WHERE is_active IS NULL;

-- Any row not in canonical 15 is marked inactive
UPDATE public.doctors
SET is_active = false, updated_at = now()
WHERE department IS NULL
   OR department NOT IN (
    'Internal Medicine',
    'General Surgery',
    'ICU',
    'Cardiology',
    'Pediatrics',
    'Cardiothoracic Surgery',
    'Urology',
    'Orthopedic Surgery',
    'Neurosurgery',
    'Oncology',
    'ENT',
    'Obstetrics and gynecology',
    'Radiology',
    'Physiotherapy',
    'Anesthesiology & Pain Therapy'
  );

-- Sync custom_doctors table if it exists
DO $$
BEGIN
  IF to_regclass('public.custom_doctors') IS NOT NULL THEN
    UPDATE public.custom_doctors cd
    SET department = d.department, updated_at = now()
    FROM public.doctors d
    WHERE cd.id = d.id;
  END IF;
END $$;

-- ==============================================================================
-- 5. PROPAGATE STANDARDIZED DEPARTMENTS TO ATTENDANCE TABLES
-- ==============================================================================

UPDATE public.checkins c
SET department = d.department
FROM public.doctors d
WHERE c.doctor_id = d.id;

UPDATE public.weekly_checkins wc
SET department = d.department
FROM public.doctors d
WHERE wc.doctor_id = d.id;

UPDATE public.monthly_checkins mc
SET department = d.department
FROM public.doctors d
WHERE mc.doctor_id = d.id;

-- ==============================================================================
-- 6. CREATE INDEXES & CONSTRAINTS SAFELY
-- ==============================================================================

-- Rebuild doctor indexes
DROP INDEX IF EXISTS public.idx_doctors_dept;
DROP INDEX IF EXISTS public.idx_doctors_active_dept;

CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_fast 
ON public.doctors (department) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_name 
ON public.doctors (department, name) 
WHERE is_active = true;

-- Unique Indexes on Attendance Tables
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_checkins_doctor_date 
ON public.weekly_checkins (doctor_id, checkin_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_checkins_doctor_date 
ON public.monthly_checkins (doctor_id, checkin_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_doctor_id_unique 
ON public.checkins (doctor_id);

-- Enforce canonical medical nomenclature with CHECK constraint
ALTER TABLE public.doctors DROP CONSTRAINT IF EXISTS chk_active_canonical_dept;
ALTER TABLE public.doctors ADD CONSTRAINT chk_active_canonical_dept
CHECK (
  is_active = false OR department IN (
    'Internal Medicine',
    'General Surgery',
    'ICU',
    'Cardiology',
    'Pediatrics',
    'Cardiothoracic Surgery',
    'Urology',
    'Orthopedic Surgery',
    'Neurosurgery',
    'Oncology',
    'ENT',
    'Obstetrics and gynecology',
    'Radiology',
    'Physiotherapy',
    'Anesthesiology & Pain Therapy'
  )
);

COMMIT;

-- Final Verification: Active physician count by canonical department
SELECT department, COUNT(*) AS active_physicians_count
FROM public.doctors
WHERE is_active = true
GROUP BY department
ORDER BY active_physicians_count DESC;
