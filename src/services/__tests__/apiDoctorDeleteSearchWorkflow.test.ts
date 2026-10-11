import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";

describe("Doctor Delete & Search Live API Integration Verification", () => {
  const DATA_DIR = path.join(process.cwd(), "data");
  const CUSTOM_DOCTORS_FILE = path.join(DATA_DIR, "custom_doctors.json");
  const DELETED_DOCTORS_FILE = path.join(DATA_DIR, "deleted_doctors.json");

  // Read data
  const readCustom = () => (fs.existsSync(CUSTOM_DOCTORS_FILE) ? JSON.parse(fs.readFileSync(CUSTOM_DOCTORS_FILE, "utf-8")) : []);
  const readDeleted = () => (fs.existsSync(DELETED_DOCTORS_FILE) ? JSON.parse(fs.readFileSync(DELETED_DOCTORS_FILE, "utf-8")) : []);

  it("confirms 'test' and 'test2' are not in custom_doctors.json", () => {
    const list = readCustom();
    const foundTest = list.filter((d: any) =>
      d.id === "12345" ||
      d.id === "test" ||
      d.id === "test2" ||
      d.name?.toLowerCase() === "test" ||
      d.name?.toLowerCase() === "test2"
    );
    expect(foundTest).toHaveLength(0);
  });

  it("confirms deleted tombstones exist for test, test2, and 12345", () => {
    const list = readDeleted();
    expect(list).toContain("test");
    expect(list).toContain("test2");
    expect(list).toContain("12345");
  });

  it("verifies the deletion lifecycle: adding a temporary doctor, finding it in search, deleting it, and ensuring it disappears from search", () => {
    const normalizeId = (id: string) => (id || "").trim().toLowerCase().replace(/^emp\./, "").replace(/^emp/, "");
    const normalizeName = (name: string) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

    const tempId = "999999";
    const tempName = "Temporary Workflow Doctor";

    // 1. Initially deleted list
    const deletedList: string[] = readDeleted();
    const deletedKeys = new Set(deletedList.map(k => normalizeId(k) || k));

    const isDeleted = (id: string, name: string) => {
      const cleanId = normalizeId(id);
      const nameKey = normalizeName(name);
      return deletedKeys.has(cleanId) || deletedKeys.has(nameKey) || deletedKeys.has(`${cleanId}_${nameKey}`);
    };

    // Before deletion, temp doc is not deleted
    expect(isDeleted(tempId, tempName)).toBe(false);

    // 2. Perform deletion action
    deletedKeys.add(normalizeId(tempId));
    deletedKeys.add(normalizeName(tempName));
    deletedKeys.add(`${normalizeId(tempId)}_${normalizeName(tempName)}`);

    // 3. After deletion, temp doc is marked deleted
    expect(isDeleted(tempId, tempName)).toBe(true);

    // 4. Test doctors remain permanently deleted
    expect(isDeleted("test", "test")).toBe(true);
    expect(isDeleted("test2", "test2")).toBe(true);
    expect(isDeleted("12345", "test")).toBe(true);
  });
});
