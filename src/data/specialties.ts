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
 * Normalizes any legacy string, typo, or Arabic alias into a canonical specialty
 * or flags it as inactive/filtered out.
 */
export function normalizeSpecialty(rawDept: string): { active: boolean; department: string } {
  if (!rawDept) return { active: false, department: "General" };

  // Strip non-breaking spaces and trim
  const clean = rawDept.replace(/\u00A0/g, " ").trim();
  const lower = clean.toLowerCase();

  // =========================================================================
  // 1. FILTERED OUT / DEACTIVATED DEPARTMENTS (Non-inpatient / Allied / Administrative)
  // =========================================================================
  if (
    lower.includes("home visit") ||
    lower.includes("dental") ||
    lower.includes("orthodontist") ||
    lower.includes("dermatolog") ||
    lower.includes("cosmotolog") ||
    lower.includes("جلدية") ||
    lower.includes("hair transplant") ||
    lower.includes("psoriasis") ||
    lower.includes("ophthalmolog") ||
    lower.includes("neurolog") ||
    lower.includes("neuropsychiatr") ||
    lower.includes("pediatric cardiology") ||
    lower.includes("laboratory") ||
    lower.includes("معمل") ||
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

  // =========================================================================
  // 2. ACTIVE CANONICAL SPECIALTIES
  // =========================================================================

  // Clinical Pharmacy (Independent Specialty)
  if (
    lower.includes("clinical pharmacy") ||
    lower.includes("pharmac") ||
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

  // Emergency Medicine (Independent Specialty)
  if (
    lower.includes("emerg") ||
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
    lower.includes("غسيل كلوي") ||
    lower.includes("كلي") ||
    lower.includes("كلى") ||
    clean === "طبيب باطن وكلي" ||
    clean === "طبيب باطن وكلى"
  ) {
    return { active: true, department: "Nephrology" };
  }

  // Nutrition (Independent Specialty)
  if (lower.includes("nutrition")) {
    return { active: true, department: "Nutrition" };
  }

  // General Surgery (Includes Vascular Surgery, iVein, Bariatrics, GIT Surgery, Pediatric Surgery, Maxillofacial, etc.)
  if (
    lower.includes("general surgery") ||
    lower.includes("الجراحة العامة") ||
    clean === "GS Doctor" ||
    clean === "General" ||
    lower.includes("vascular") ||
    clean === "iVein" ||
    lower.includes("git surgery") ||
    lower.includes("git and pancreas") ||
    lower.includes("bariatric") ||
    lower.includes("pediatric surgery") ||
    lower.includes("pediatric oncology surgery") ||
    lower.includes("endocrine surgery") ||
    lower.includes("colorectal") ||
    lower.includes("breast surgery") ||
    lower.includes("plastic surgery") ||
    lower.includes("hand and microsurgery") ||
    lower.includes("maxillofacial")
  ) {
    return { active: true, department: "General Surgery" };
  }

  // Internal Medicine (Pulmonology, Hematology, Endocrinology, Rheumatology, Hepatology, Geriatrics)
  if (
    lower.includes("internal medicine") ||
    lower.includes("باطن") ||
    lower.includes("pulmonology") ||
    lower.includes("pulmonary") ||
    lower.includes("hematology") ||
    lower.includes("haematologist") ||
    lower.includes("endocrinolog") ||
    lower.includes("diabetes") ||
    lower.includes("thyroid") ||
    lower.includes("pituitary") ||
    lower.includes("الغدة النخامية") ||
    lower.includes("rheumatolog") ||
    lower.includes("hepatolog") ||
    lower.includes("hepatica") ||
    lower.includes("liver transplantation") ||
    lower.includes("gastroenterology") ||
    lower.includes("infectious disease") ||
    lower.includes("immunology")
  ) {
    return { active: true, department: "Internal Medicine" };
  }

  // ICU (Critical Care, SICU)
  if (
    clean === "ICU" ||
    clean.startsWith("ICU") ||
    lower.includes("critical care") ||
    lower.includes("حالات حرجة") ||
    lower.includes("sicu")
  ) {
    return { active: true, department: "ICU" };
  }

  // Cardiology
  if (
    lower.includes("cardiology") ||
    lower.includes("القلب") ||
    lower.includes("قلب") ||
    lower.includes("structural heart") ||
    lower.includes("heart failure") ||
    lower.includes("cardiac rehabilitation") ||
    lower.includes("holter") ||
    lower.includes("echo")
  ) {
    return { active: true, department: "Cardiology" };
  }

  // Pediatrics
  if (
    lower.includes("pediatric") ||
    lower.includes("اطفال")
  ) {
    return { active: true, department: "Pediatrics" };
  }

  // Cardiothoracic Surgery
  if (lower.includes("cardiothoracic")) {
    return { active: true, department: "Cardiothoracic Surgery" };
  }

  // Urology
  if (lower.includes("urology") || lower.includes("مسالك")) {
    return { active: true, department: "Urology" };
  }

  // Orthopedic Surgery (unifying Orthopedics)
  if (
    lower.includes("orthopedic") ||
    lower.includes("orthopedics") ||
    lower.includes("عظام")
  ) {
    return { active: true, department: "Orthopedic Surgery" };
  }

  // Neurosurgery
  if (
    lower.includes("neurosurgery") ||
    lower.includes("spine surgeon") ||
    lower.includes("مخ") ||
    lower.includes("جراحة المخ") ||
    lower.includes("اعصاب") ||
    lower.includes("أعصاب")
  ) {
    return { active: true, department: "Neurosurgery" };
  }

  // Oncology
  if (lower.includes("oncology") || lower.includes("اورام")) {
    return { active: true, department: "Oncology" };
  }

  // ENT
  if (
    clean === "ENT" ||
    lower.includes(" ent") ||
    lower.includes("ear") ||
    lower.includes("audiometry") ||
    lower.includes("swallowing")
  ) {
    return { active: true, department: "ENT" };
  }

  // Obstetrics and gynecology
  if (
    lower.includes("obstetrics") ||
    lower.includes("gynecology") ||
    lower.includes("نساء") ||
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
    lower.includes("rad doctor")
  ) {
    return { active: true, department: "Radiology" };
  }

  // Physiotherapy (unifying all typos and sessions)
  if (
    lower.includes("physiotherapy") ||
    lower.includes("physiotherpy") ||
    lower.includes("physical medicine") ||
    lower.includes("علاج طبيعي") ||
    lower.includes("low back pain") ||
    lower.includes("prp injection")
  ) {
    return { active: true, department: "Physiotherapy" };
  }

  // Anesthesiology & Pain Therapy
  if (
    lower.includes("anesthesia") ||
    lower.includes("pain therapy") ||
    lower.includes("تخدير")
  ) {
    return { active: true, department: "Anesthesiology & Pain Therapy" };
  }

  // Default fallback
  return { active: false, department: clean };
}
