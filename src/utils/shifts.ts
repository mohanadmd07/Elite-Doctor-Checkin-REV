export const SHIFT_MAP_AR: Record<string, string> = {
  "Morning shift": "مورنينج",
  "Long shift": "لونج",
  "Evening shift": "ايڤينينج",
  "Night shift": "نايت",
  "24 shift": "24",
};

export const formatShiftsForDisplay = (shifts: string[]): string => {
  if (!shifts || shifts.length === 0) return "";
  let finalShifts = [...shifts];
  if (
    finalShifts.length === 3 &&
    finalShifts.includes("Morning shift") &&
    finalShifts.includes("Evening shift") &&
    finalShifts.includes("Night shift")
  ) {
    finalShifts = ["24 shift"];
  }
  return finalShifts.map((sh) => SHIFT_MAP_AR[sh] || sh).join(", ");
};

export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

export function compareDoctorIds(idA: string, idB: string): number {
  const cleanA = (idA || "").trim().replace(/^(emp\.|emp)/i, "");
  const cleanB = (idB || "").trim().replace(/^(emp\.|emp)/i, "");
  const numA = Number(cleanA);
  const numB = Number(cleanB);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: "base" });
}
