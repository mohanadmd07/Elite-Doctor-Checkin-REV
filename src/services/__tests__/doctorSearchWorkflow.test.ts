import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { DOCTORS_DATABASE } from "../../data/doctors.js";
import { COMPILED_DOCTORS } from "../../data/compiledDoctors.js";

describe("Doctor Search and Deletion Workflow", () => {
  const DATA_DIR = path.join(process.cwd(), "data");
  const CUSTOM_DOCTORS_FILE = path.join(DATA_DIR, "custom_doctors.json");
  const DELETED_DOCTORS_FILE = path.join(DATA_DIR, "deleted_doctors.json");

  it("ensures 'test' and 'test2' are completely purged from static DOCTORS_DATABASE", () => {
    const testDocs = DOCTORS_DATABASE.filter(
      (d: any) =>
        d.id === "test" ||
        d.id === "test2" ||
        d.id === "12345" ||
        d.name?.toLowerCase() === "test" ||
        d.name?.toLowerCase() === "test2" ||
        d.arabicName?.toLowerCase() === "test" ||
        d.arabicName?.toLowerCase() === "test2"
    );
    expect(testDocs).toHaveLength(0);
  });

  it("ensures 'test' and 'test2' are completely purged from COMPILED_DOCTORS", () => {
    const testDocs = COMPILED_DOCTORS.filter(
      (d: any) =>
        d.id === "test" ||
        d.id === "test2" ||
        d.id === "12345" ||
        d.name?.toLowerCase() === "test" ||
        d.name?.toLowerCase() === "test2" ||
        d.arabicName?.toLowerCase() === "test" ||
        d.arabicName?.toLowerCase() === "test2"
    );
    expect(testDocs).toHaveLength(0);
  });

  it("ensures 'test' and 'test2' are removed from custom_doctors.json", () => {
    if (fs.existsSync(CUSTOM_DOCTORS_FILE)) {
      const customDocs = JSON.parse(fs.readFileSync(CUSTOM_DOCTORS_FILE, "utf-8"));
      const lingeringTest = customDocs.filter(
        (d: any) =>
          d.id === "test" ||
          d.id === "test2" ||
          d.id === "12345" ||
          d.name?.toLowerCase() === "test" ||
          d.name?.toLowerCase() === "test2"
      );
      expect(lingeringTest).toHaveLength(0);
    }
  });

  it("ensures tombstones for 'test', 'test2', and '12345' exist in deleted_doctors.json", () => {
    expect(fs.existsSync(DELETED_DOCTORS_FILE)).toBe(true);
    const deletedDocs: string[] = JSON.parse(fs.readFileSync(DELETED_DOCTORS_FILE, "utf-8"));
    expect(deletedDocs).toContain("test");
    expect(deletedDocs).toContain("test2");
    expect(deletedDocs).toContain("12345");
    expect(deletedDocs).toContain("test2_test2");
    expect(deletedDocs).toContain("12345_test");
  });

  it("verifies search ranking filtering logic excludes deleted doctors", () => {
    // Replicate normalization and deleted key check logic
    const normalizeId = (id: string) => (id || "").trim().toLowerCase().replace(/^emp\./, "").replace(/^emp/, "");
    const normalizeName = (name: string) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

    const deletedKeys = new Set(JSON.parse(fs.readFileSync(DELETED_DOCTORS_FILE, "utf-8")).map((k: string) => normalizeId(k) || k));

    const isDoctorDeleted = (id: string, name: string) => {
      const cleanId = normalizeId(id);
      const nameKey = normalizeName(name);
      if (cleanId && deletedKeys.has(cleanId)) return true;
      if (nameKey && deletedKeys.has(nameKey)) return true;
      if (cleanId && nameKey && deletedKeys.has(`${cleanId}_${nameKey}`)) return true;
      return false;
    };

    // Both test and test2 must evaluate to true (deleted)
    expect(isDoctorDeleted("12345", "test")).toBe(true);
    expect(isDoctorDeleted("test2", "test2")).toBe(true);
    expect(isDoctorDeleted("test", "test")).toBe(true);
  });
});
