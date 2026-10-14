/**
 * CANONICAL MEDICAL SPECIALTIES & NOMENCLATURE TAXONOMY
 * Elite Hospital Physician Check-in & Roster System
 * 
 * Unified inpatient hospital specialties (18 canonical disciplines),
 * including independent Nephrology, Nutrition, and Emergency Medicine.
 */

export const CANONICAL_SPECIALTIES = [
  "Internal Medicine",
  "General Surgery",
  "ICU",
  "Emergency Medicine",
  "Cardiology",
  "Pediatrics",
  "Nephrology",
  "Nutrition",
  "Cardiothoracic Surgery",
  "Urology",
  "Orthopedic Surgery",
  "Neurosurgery",
  "Oncology",
  "ENT",
  "Obstetrics and gynecology",
  "Radiology",
  "Physiotherapy",
  "Anesthesiology & Pain Therapy",
  "Clinical Pharmacy",
  "OPD Coordinator",
  "Home Care",
] as const;

export type CanonicalSpecialty = (typeof CANONICAL_SPECIALTIES)[number];

export const NEPHROLOGY_DOCTOR_IDS = new Set([
  "55", "56", "57", "58", "251", "252", "348", "401", "724", "1177",
  "2300", "2542", "2631", "2649", "3255", "3536", "030723.09.23.26",
  "030822.11.20.21", "030822.11.21.36", "041123.12.39.10", "041124.05.24.17",
  "051123.02.59.41", "070225.11.20.37", "100824.10.08.23", "110225.01.59.17",
  "160726.01.40.36", "180126.03.03.04", "180726.02.44.44", "200123.04.03.57",
  "260522.05.46.18", "300925.10.01.27"
]);

/**
 * Strips Arabic diacritics and normalizes letter variations (أ/إ/آ -> ا, ة -> ه, ى/ئ -> ي)
 */
function cleanArabicSpecialty(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

/**
 * Normalizes any legacy string, typo, or Arabic alias into a canonical specialty
 * or flags it as inactive/filtered out.
 */
export function normalizeSpecialty(rawDept: string): { active: boolean; department: string } {
  if (!rawDept) return { active: false, department: "General" };

  // Strip non-breaking spaces and trim
  const clean = rawDept.replace(/\u00A0/g, " ").trim();
  const lower = clean.toLowerCase();
  const aNorm = cleanArabicSpecialty(lower);

  // =========================================================================
  // 1. FILTERED OUT / DEACTIVATED DEPARTMENTS (Non-inpatient / Allied / Administrative)
  // =========================================================================
  if (
    lower.includes("dental") ||
    lower.includes("orthodontist") ||
    lower.includes("dermatolog") ||
    lower.includes("cosmotolog") ||
    aNorm.includes("جلديه") ||
    lower.includes("hair transplant") ||
    lower.includes("psoriasis") ||
    lower.includes("ophthalmolog") ||
    lower.includes("neurolog") ||
    lower.includes("neuropsychiatr") ||
    lower.includes("pediatric cardiology") ||
    lower.includes("laboratory") ||
    aNorm.includes("معمل") ||
    lower.includes("nurse") ||
    lower.includes("medical records") ||
    lower.includes("speciality") ||
    lower.includes("check up") ||
    lower.includes("offers") ||
    lower.includes("visiting doctor") ||
    lower.includes("online consultation") ||
    lower.includes("eeg") ||
    lower.includes("nerve conduction") ||
    lower.includes("forensic") ||
    lower.includes("toxoclogy") ||
    lower.includes("external services") ||
    clean === "OR" ||
    clean === "NULL" ||
    clean === "Other"
  ) {
    return { active: false, department: clean };
  }

  // Fast path: Exact match with canonical specialties
  for (const canonical of CANONICAL_SPECIALTIES) {
    if (lower === canonical.toLowerCase()) {
      return { active: true, department: canonical };
    }
  }

  // =========================================================================
  // 2. ACTIVE CANONICAL SPECIALTIES
  // =========================================================================

  // Specialized Surgical Disciplines (Must be evaluated BEFORE General Surgery)
  // Cardiothoracic Surgery
  if (
    lower.includes("cardiothoracic") ||
    aNorm.includes("قلب وصدر") ||
    aNorm.includes("جراحه قلب")
  ) {
    return { active: true, department: "Cardiothoracic Surgery" };
  }

  // Neurosurgery
  if (
    lower.includes("neurosurgery") ||
    lower.includes("spine surgeon") ||
    aNorm.includes("مخ") ||
    aNorm.includes("اعصاب")
  ) {
    return { active: true, department: "Neurosurgery" };
  }

  // Orthopedic Surgery
  if (
    lower.includes("orthopedic") ||
    lower.includes("orthopedics") ||
    aNorm.includes("عظام")
  ) {
    return { active: true, department: "Orthopedic Surgery" };
  }

  // Urology
  if (
    lower.includes("urology") ||
    aNorm.includes("مسالك")
  ) {
    return { active: true, department: "Urology" };
  }

  // General Surgery (Includes Vascular Surgery, iVein, Bariatrics, GIT Surgery, Pediatric Surgery, Maxillofacial, etc.)
  if (
    lower.includes("general surgery") ||
    aNorm.includes("جراح") ||
    clean === "GS Doctor" ||
    clean === "General" ||
    lower.includes("vascular") ||
    aNorm.includes("اوعيه") ||
    clean === "iVein" ||
    lower.includes("git surgery") ||
    lower.includes("git and pancreas") ||
    lower.includes("bariatric") ||
    aNorm.includes("سمنه") ||
    lower.includes("pediatric surgery") ||
    lower.includes("pediatric oncology surgery") ||
    lower.includes("endocrine surgery") ||
    lower.includes("colorectal") ||
    lower.includes("breast surgery") ||
    lower.includes("plastic surgery") ||
    aNorm.includes("تجميل") ||
    lower.includes("hand and microsurgery") ||
    lower.includes("maxillofacial")
  ) {
    return { active: true, department: "General Surgery" };
  }

  // Cardiology
  if (
    lower.includes("cardiology") ||
    aNorm.includes("قلب") ||
    lower.includes("structural heart") ||
    lower.includes("heart failure") ||
    lower.includes("cardiac") ||
    lower.includes("holter") ||
    lower.includes("echo") ||
    aNorm.includes("قسطره")
  ) {
    return { active: true, department: "Cardiology" };
  }

  // Internal Medicine (Pulmonology, Hematology, Endocrinology, Rheumatology, Hepatology, Geriatrics, Gastroenterology)
  if (
    lower.includes("internal medicine") ||
    aNorm.includes("باطن") ||
    lower.includes("pulmonology") ||
    lower.includes("pulmonary") ||
    aNorm.includes("صدر") ||
    lower.includes("hematology") ||
    lower.includes("haematologist") ||
    aNorm.includes("دم") ||
    lower.includes("endocrinolog") ||
    lower.includes("diabetes") ||
    aNorm.includes("سكر") ||
    aNorm.includes("غدد") ||
    lower.includes("thyroid") ||
    lower.includes("pituitary") ||
    aNorm.includes("الغده النخاميه") ||
    lower.includes("rheumatolog") ||
    aNorm.includes("روماتيزم") ||
    lower.includes("hepatolog") ||
    lower.includes("hepatica") ||
    aNorm.includes("كبد") ||
    lower.includes("liver transplantation") ||
    lower.includes("gastroenterology") ||
    aNorm.includes("جهاز هضمي") ||
    lower.includes("infectious disease") ||
    lower.includes("immunology") ||
    aNorm.includes("مناعه")
  ) {
    return { active: true, department: "Internal Medicine" };
  }

  // ICU (Critical Care, SICU)
  if (
    clean === "ICU" ||
    clean.startsWith("ICU") ||
    lower.includes("critical care") ||
    aNorm.includes("حالات حرجه") ||
    aNorm.includes("عنايه") ||
    aNorm.includes("رعايه") ||
    lower.includes("sicu")
  ) {
    return { active: true, department: "ICU" };
  }

  // Emergency Medicine
  if (
    lower.includes("emerg") ||
    lower.includes("طوار") ||
    aNorm.includes("طوار") ||
    clean === "Emergency" ||
    clean === "Emergency Medicine"
  ) {
    return { active: true, department: "Emergency Medicine" };
  }

  // Nephrology (Independent Specialty - Kidneys & Dialysis)
  if (
    lower.includes("nephrology") ||
    lower.includes("nephro") ||
    lower.includes("kidney") ||
    lower.includes("renal") ||
    lower.includes("dialysis") ||
    aNorm.includes("غسيل كلوي") ||
    aNorm.includes("كلي") ||
    clean === "طبيب باطن وكلي" ||
    clean === "طبيب باطن وكلى"
  ) {
    return { active: true, department: "Nephrology" };
  }

  // Nutrition (Independent Specialty)
  if (
    lower.includes("nutrition") ||
    aNorm.includes("تغذي")
  ) {
    return { active: true, department: "Nutrition" };
  }

  // Pediatrics
  if (
    lower.includes("pediatric") ||
    aNorm.includes("اطفال") ||
    aNorm.includes("مبتسرين") ||
    aNorm.includes("حديثي ولاده")
  ) {
    return { active: true, department: "Pediatrics" };
  }

  // Oncology
  if (
    lower.includes("oncology") ||
    aNorm.includes("اورام")
  ) {
    return { active: true, department: "Oncology" };
  }

  // ENT
  if (
    clean === "ENT" ||
    lower.includes(" ent") ||
    lower.includes("ear") ||
    lower.includes("audiometry") ||
    lower.includes("swallowing") ||
    aNorm.includes("انف") ||
    aNorm.includes("اذن") ||
    aNorm.includes("حنجره")
  ) {
    return { active: true, department: "ENT" };
  }

  // Obstetrics and gynecology
  if (
    lower.includes("obstetrics") ||
    lower.includes("gynecology") ||
    aNorm.includes("نساء") ||
    aNorm.includes("توليد") ||
    clean === "4D" ||
    lower.includes("breast feeding")
  ) {
    return { active: true, department: "Obstetrics and gynecology" };
  }

  // Radiology (including Interventional Radiology & Radiology Coordinator)
  if (
    lower.includes("radiology") ||
    lower.includes("rad coordinator") ||
    lower.includes("radiology coordinator") ||
    lower.includes("intervential") ||
    lower.includes("interventional") ||
    lower.includes("x ray") ||
    lower.includes("ct") ||
    lower.includes("mri") ||
    clean === "U/S" ||
    lower.includes("ultrasound") ||
    lower.includes("rad doctor") ||
    aNorm.includes("اشعه") ||
    aNorm.includes("سونار") ||
    aNorm.includes("رنين")
  ) {
    return { active: true, department: "Radiology" };
  }

  // Physiotherapy (unifying all typos and sessions)
  if (
    lower.includes("physiotherapy") ||
    lower.includes("physiotherpy") ||
    lower.includes("physical medicine") ||
    aNorm.includes("علاج طبيعي") ||
    lower.includes("low back pain") ||
    lower.includes("prp injection")
  ) {
    return { active: true, department: "Physiotherapy" };
  }

  // Anesthesiology & Pain Therapy
  if (
    lower.includes("anesthesia") ||
    lower.includes("pain therapy") ||
    aNorm.includes("تخدير") ||
    aNorm.includes("علاج الالم")
  ) {
    return { active: true, department: "Anesthesiology & Pain Therapy" };
  }

  // Clinical Pharmacy (Independent Specialty)
  if (
    lower.includes("clinical pharmacy") ||
    lower.includes("pharmac") ||
    aNorm.includes("صيدل") ||
    clean === "Clinical Pharmacy" ||
    clean === "Pharmacist"
  ) {
    return { active: true, department: "Clinical Pharmacy" };
  }

  // OPD Coordinator (Independent Specialty)
  if (
    lower.includes("opd coordinator") ||
    clean === "OPD Coordinator"
  ) {
    return { active: true, department: "OPD Coordinator" };
  }

  // Home Care (Independent Specialty - Home Visits & Care)
  if (
    lower.includes("home visit") ||
    lower.includes("home care") ||
    aNorm.includes("زيارات منزليه") ||
    aNorm.includes("رعايه منزليه") ||
    clean === "Home Visit" ||
    clean === "Home Visits" ||
    clean === "Home Care"
  ) {
    return { active: true, department: "Home Care" };
  }

  // Default fallback
  return { active: false, department: clean };
}

export interface SpecialtyOption {
  value: string;
  labelEn: string;
  labelAr: string;
}

export const SPECIALTY_OPTIONS: SpecialtyOption[] = [
  { value: "General Surgery", labelEn: "General Surgery", labelAr: "الجراحة العامة" },
  { value: "Internal Medicine", labelEn: "Internal Medicine", labelAr: "الباطنة العامة" },
  { value: "ICU", labelEn: "ICU (Intensive Care)", labelAr: "العناية المركزة" },
  { value: "Emergency Medicine", labelEn: "Emergency Medicine", labelAr: "طب الطوارئ" },
  { value: "Cardiology", labelEn: "Cardiology", labelAr: "القلب والأوعية الدموية" },
  { value: "Pediatrics", labelEn: "Pediatrics & Neonatology", labelAr: "الأطفال والمبتسرين" },
  { value: "Nephrology", labelEn: "Nephrology & Dialysis", labelAr: "أمراض الكلى والغسيل الكلوي" },
  { value: "Obstetrics and gynecology", labelEn: "Obstetrics & Gynecology", labelAr: "النساء والتوليد" },
  { value: "Orthopedic Surgery", labelEn: "Orthopedic Surgery", labelAr: "جراحة العظام" },
  { value: "Neurosurgery", labelEn: "Neurosurgery & Spine", labelAr: "جراحة المخ والأعصاب والعمود الفقري" },
  { value: "Urology", labelEn: "Urology Surgery", labelAr: "جراحة المسالك البولية" },
  { value: "Cardiothoracic Surgery", labelEn: "Cardiothoracic Surgery", labelAr: "جراحة القلب والصدر" },
  { value: "ENT", labelEn: "ENT (Ear, Nose & Throat)", labelAr: "الأنف والأذن والحنجرة" },
  { value: "Oncology", labelEn: "Oncology", labelAr: "الأورام" },
  { value: "Radiology", labelEn: "Radiology", labelAr: "الأشعة التشخيصية" },
  { value: "Physiotherapy", labelEn: "Physiotherapy & Rehab", labelAr: "العلاج الطبيعي والتأهيل" },
  { value: "Nutrition", labelEn: "Clinical Nutrition", labelAr: "التغذية العلاجية" },
  { value: "Anesthesiology & Pain Therapy", labelEn: "Anesthesiology & Pain Therapy", labelAr: "التخدير وعلاج الألم" },
  { value: "Clinical Pharmacy", labelEn: "Clinical Pharmacy", labelAr: "الصيدلة الإكلينيكية" },
  { value: "OPD Coordinator", labelEn: "OPD Coordinator", labelAr: "منسق العيادات الخارجية" },
  { value: "Home Care", labelEn: "Home Care", labelAr: "الرعاية والزيارات المنزلية" },
];

