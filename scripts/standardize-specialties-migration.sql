-- ==============================================================================
-- ELITE HOSPITAL - MEDICAL SPECIALTIES STANDARDIZATION & DATABASE OPTIMIZATION
-- Run this script in the Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. STANDARDIZE ACTIVE DOCTORS DEPARTMENT NAMES IN public.doctors
-- ==============================================================================

-- General Surgery (Includes Vascular Surgery, iVein, GIT, Bariatrics, Colorectal, Pediatric Surgery, etc.)
UPDATE public.doctors
SET department = 'General Surgery', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%general surgery%'
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
    OR department ILIKE '%maxillofacial%'
  );

-- Internal Medicine (Pulmonology, Hematology, Endocrinology, Rheumatology, Nephrology, Hepatology, Nutrition)
UPDATE public.doctors
SET department = 'Internal Medicine', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%internal medicine%'
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
    OR department ILIKE '%nutrition%'
  );

-- ICU (Critical Care, Emergency, SICU)
UPDATE public.doctors
SET department = 'ICU', updated_at = now()
WHERE is_active = true
  AND (
    department = 'ICU'
    OR department ILIKE 'ICU%'
    OR department ILIKE '%critical care%'
    OR department ILIKE '%حالات حرجة%'
    OR department ILIKE '%sicu%'
    OR department ILIKE '%emerg%'
  );

-- Cardiology
UPDATE public.doctors
SET department = 'Cardiology', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%cardiology%'
    OR department ILIKE '%القلب%'
    OR department ILIKE '%structural heart%'
    OR department ILIKE '%heart failure%'
    OR department ILIKE '%cardiac rehabilitation%'
    OR department ILIKE '%holter%'
    OR department ILIKE '%echo%'
  );

-- Pediatrics
UPDATE public.doctors
SET department = 'Pediatrics', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%pediatric%'
    OR department ILIKE '%اطفال%'
  );

-- Cardiothoracic Surgery
UPDATE public.doctors
SET department = 'Cardiothoracic Surgery', updated_at = now()
WHERE is_active = true
  AND department ILIKE '%cardiothoracic%';

-- Urology
UPDATE public.doctors
SET department = 'Urology', updated_at = now()
WHERE is_active = true
  AND (department ILIKE '%urology%' OR department ILIKE '%مسالك%');

-- Orthopedic Surgery (unifying Orthopedics)
UPDATE public.doctors
SET department = 'Orthopedic Surgery', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%orthopedic%'
    OR department ILIKE '%orthopedics%'
    OR department ILIKE '%عظام%'
  );

-- Neurosurgery
UPDATE public.doctors
SET department = 'Neurosurgery', updated_at = now()
WHERE is_active = true
  AND (department ILIKE '%neurosurgery%' OR department ILIKE '%spine surgeon%');

-- Oncology
UPDATE public.doctors
SET department = 'Oncology', updated_at = now()
WHERE is_active = true
  AND (department ILIKE '%oncology%' OR department ILIKE '%اورام%');

-- ENT
UPDATE public.doctors
SET department = 'ENT', updated_at = now()
WHERE is_active = true
  AND (
    department = 'ENT'
    OR department ILIKE '%ent%'
    OR department ILIKE '%ear%'
    OR department ILIKE '%audiometry%'
    OR department ILIKE '%swallowing%'
  );

-- Obstetrics and gynecology
UPDATE public.doctors
SET department = 'Obstetrics and gynecology', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%obstetrics%'
    OR department ILIKE '%gynecology%'
    OR department ILIKE '%نساء%'
    OR department = '4D'
    OR department ILIKE '%breast feeding%'
  );

-- Radiology (including Interventional Radiology)
UPDATE public.doctors
SET department = 'Radiology', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%radiology%'
    OR department ILIKE '%intervential%'
    OR department ILIKE '%interventional%'
    OR department ILIKE '%x ray%'
    OR department ILIKE '%ct%'
    OR department ILIKE '%mri%'
    OR department = 'U/S'
    OR department ILIKE '%ultrasound%'
    OR department ILIKE '%rad doctor%'
  );

-- Physiotherapy (fixing typos and physical medicine variations)
UPDATE public.doctors
SET department = 'Physiotherapy', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%physiotherapy%'
    OR department ILIKE '%physiotherpy%'
    OR department ILIKE '%physical medicine%'
    OR department ILIKE '%علاج طبيعي%'
    OR department ILIKE '%low back pain%'
    OR department ILIKE '%prp injection%'
  );

-- Anesthesiology & Pain Therapy
UPDATE public.doctors
SET department = 'Anesthesiology & Pain Therapy', updated_at = now()
WHERE is_active = true
  AND (
    department ILIKE '%anesthesia%'
    OR department ILIKE '%pain therapy%'
    OR department ILIKE '%تخدير%'
  );

-- ==============================================================================
-- 2. SOFT-DEACTIVATE EXCLUDED & NON-INPATIENT PHYSICIANS (is_active = false)
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

-- Any remaining active doctor not in the 15 canonical departments is deactivated
UPDATE public.doctors
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND department NOT IN (
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

-- Also synchronize custom_doctors table
UPDATE public.custom_doctors cd
SET department = d.department, updated_at = now()
FROM public.doctors d
WHERE cd.id = d.id;

-- ==============================================================================
-- 3. PROPAGATE STANDARDIZED DEPARTMENTS TO ATTENDANCE TABLES
-- ==============================================================================

-- Update daily checkins
UPDATE public.checkins c
SET department = d.department
FROM public.doctors d
WHERE c.doctor_id = d.id;

-- Update monthly checkins
UPDATE public.monthly_checkins mc
SET department = d.department
FROM public.doctors d
WHERE mc.doctor_id = d.id;

-- Update backward-compatible weekly checkins
UPDATE public.weekly_checkins wc
SET department = d.department
FROM public.doctors d
WHERE wc.doctor_id = d.id;

-- ==============================================================================
-- 4. DATABASE OPTIMIZATION: PARTIAL INDEXING & DATA INTEGRITY CONSTRAINTS
-- ==============================================================================

-- Drop old full-text department index to reclaim RAM and storage
DROP INDEX IF EXISTS public.idx_doctors_dept;
DROP INDEX IF EXISTS public.idx_doctors_active_dept;

-- High-performance Partial B-Tree Index on active doctors' department
CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_fast 
ON public.doctors (department) 
WHERE is_active = true;

-- Composite partial index for instant name lookups within active departments
CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_name 
ON public.doctors (department, name) 
WHERE is_active = true;

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

-- Verification Query: Check final active specialty breakdown
SELECT department, COUNT(*) AS active_physicians_count
FROM public.doctors
WHERE is_active = true
GROUP BY department
ORDER BY active_physicians_count DESC;
