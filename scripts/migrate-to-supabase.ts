import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { DOCTORS_DATABASE } from "../src/data/doctors.js";

async function runMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY environment variables are required.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  console.log(`\n🚀 Starting database migration to Supabase (${supabaseUrl})...\n`);

  // 1. Migrate Doctors
  console.log(`📦 [1/6] Migrating master doctor records...`);
  const uniqueDoctorMap = new Map<string, any>();
  for (const d of DOCTORS_DATABASE) {
    const cleanId = String(d.id || "").trim();
    if (!cleanId) continue;
    uniqueDoctorMap.set(cleanId, {
      id: cleanId,
      name: d.name ? String(d.name).trim() : "",
      arabic_name: d.arabicName ? String(d.arabicName).trim() : (d.name ? String(d.name).trim() : ""),
      department: d.department ? String(d.department).trim() : "General",
      mobile_number: d.mobileNumber ? String(d.mobileNumber).trim() : "",
      is_active: true,
    });
  }

  const doctorRecords = Array.from(uniqueDoctorMap.values());
  const BATCH_SIZE = 100;
  let insertedDoctors = 0;
  for (let i = 0; i < doctorRecords.length; i += BATCH_SIZE) {
    const batch = doctorRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("doctors").upsert(batch, { onConflict: "id" });
    if (error) {
      if (error.message && error.message.toLowerCase().includes("permission denied")) {
        console.error(`\n❌ Permission denied for table 'doctors'.\n👉 Please run the updated SQL Schema (with schema GRANT permissions) in your Supabase SQL Editor, or set SUPABASE_SERVICE_ROLE_KEY.\n`);
        process.exit(1);
      }
      console.error(`⚠️ Error upserting doctors batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      insertedDoctors += batch.length;
    }
  }
  console.log(`✅ Completed doctors table migration: ${insertedDoctors} records.`);

  // 2. Migrate Custom Doctors
  const customDocsPath = path.join(process.cwd(), "data", "custom_doctors.json");
  if (fs.existsSync(customDocsPath)) {
    try {
      const customDocs = JSON.parse(fs.readFileSync(customDocsPath, "utf-8"));
      if (Array.isArray(customDocs) && customDocs.length > 0) {
        console.log(`📦 [2/6] Migrating custom doctor overrides...`);
        const uniqueCustom = new Map<string, any>();
        for (const c of customDocs) {
          const cleanId = String(c.id || "").trim();
          if (!cleanId) continue;
          uniqueCustom.set(cleanId, {
            id: cleanId,
            name: c.name ? String(c.name).trim() : "",
            arabic_name: c.arabicName ? String(c.arabicName).trim() : (c.name ? String(c.name).trim() : ""),
            department: c.department ? String(c.department).trim() : "General",
            mobile_number: c.mobileNumber ? String(c.mobileNumber).trim() : "",
            original_id: c.originalId ? String(c.originalId).trim() : "",
            updated_at: c.updatedAt || new Date().toISOString(),
          });
        }
        const formatted = Array.from(uniqueCustom.values());
        const { error } = await supabase.from("custom_doctors").upsert(formatted, { onConflict: "id" });
        if (error) console.error("⚠️ Error upserting custom_doctors:", error.message);
        else console.log(`✅ Completed custom_doctors: ${formatted.length} records.`);
      }
    } catch (e) {
      console.error("Error reading custom_doctors.json:", e);
    }
  }

  // 3. Migrate Custom Doctor Phones
  const customPhonesPath = path.join(process.cwd(), "data", "custom_doctors_phones.json");
  if (fs.existsSync(customPhonesPath)) {
    try {
      const phones = JSON.parse(fs.readFileSync(customPhonesPath, "utf-8"));
      const uniquePhones = new Map<string, any>();
      for (const [id, mobileNumber] of Object.entries(phones)) {
        const cleanId = String(id || "").trim();
        if (!cleanId) continue;
        uniquePhones.set(cleanId, {
          id: cleanId,
          mobile_number: String(mobileNumber || "").trim(),
          updated_at: new Date().toISOString(),
        });
      }
      const phoneEntries = Array.from(uniquePhones.values());
      if (phoneEntries.length > 0) {
        console.log(`📦 [3/6] Migrating ${phoneEntries.length} phone number overrides...`);
        const { error } = await supabase.from("custom_doctor_phones").upsert(phoneEntries, { onConflict: "id" });
        if (error) console.error("⚠️ Error upserting custom_doctor_phones:", error.message);
        else console.log(`✅ Completed custom_doctor_phones: ${phoneEntries.length} records.`);
      }
    } catch (e) {
      console.error("Error reading custom_doctors_phones.json:", e);
    }
  }

  // 4. Migrate Deleted Doctors
  const deletedDocsPath = path.join(process.cwd(), "data", "deleted_doctors.json");
  if (fs.existsSync(deletedDocsPath)) {
    try {
      const deleted = JSON.parse(fs.readFileSync(deletedDocsPath, "utf-8"));
      if (Array.isArray(deleted) && deleted.length > 0) {
        console.log(`📦 [4/6] Migrating deleted doctor keys...`);
        const uniqueDeleted = new Map<string, any>();
        for (const id of deleted) {
          const cleanId = String(id || "").trim();
          if (!cleanId) continue;
          uniqueDeleted.set(cleanId, {
            id: cleanId,
            deleted_at: new Date().toISOString(),
          });
        }
        const entries = Array.from(uniqueDeleted.values());
        const { error } = await supabase.from("deleted_doctors").upsert(entries, { onConflict: "id" });
        if (error) console.error("⚠️ Error upserting deleted_doctors:", error.message);
        else console.log(`✅ Completed deleted_doctors: ${entries.length} records.`);
      }
    } catch (e) {
      console.error("Error reading deleted_doctors.json:", e);
    }
  }

  // 5. Migrate Daily Check-ins
  const checkinsPath = path.join(process.cwd(), "data", "checkins.json");
  if (fs.existsSync(checkinsPath)) {
    try {
      const checkins = JSON.parse(fs.readFileSync(checkinsPath, "utf-8"));
      if (Array.isArray(checkins) && checkins.length > 0) {
        console.log(`📦 [5/6] Migrating ${checkins.length} daily check-ins...`);
        const entries = checkins.map(c => ({
          doctor_id: c.id || "",
          doctor_name: c.doctorName || "",
          doctor_arabic_name: c.doctorArabicName || c.doctorName || "",
          department: c.department || "General",
          shifts: Array.isArray(c.shifts) ? c.shifts : [],
          mobile_number: c.mobileNumber || "",
          checkin_timestamp: c.timestamp || new Date().toISOString(),
          checkin_date: (c.timestamp || new Date().toISOString()).split("T")[0],
        }));
        const { error } = await supabase.from("checkins").insert(entries);
        if (error) console.error("⚠️ Error inserting checkins:", error.message);
        else console.log(`✅ Completed checkins: ${entries.length} records.`);
      }
    } catch (e) {
      console.error("Error reading checkins.json:", e);
    }
  }

  // 6. Migrate Weekly Cumulative Check-ins
  const weeklyPath = path.join(process.cwd(), "data", "weekly_checkins.json");
  if (fs.existsSync(weeklyPath)) {
    try {
      const weekly = JSON.parse(fs.readFileSync(weeklyPath, "utf-8"));
      if (Array.isArray(weekly) && weekly.length > 0) {
        console.log(`📦 [6/6] Migrating ${weekly.length} weekly cumulative check-ins...`);
        const entries = weekly.map(w => ({
          doctor_id: w.id || "",
          doctor_name: w.doctorName || "",
          doctor_arabic_name: w.doctorArabicName || w.doctorName || "",
          department: w.department || "General",
          shifts: Array.isArray(w.shifts) ? w.shifts : [],
          mobile_number: w.mobileNumber || "",
          checkin_timestamp: w.timestamp || new Date().toISOString(),
        }));
        const { error } = await supabase.from("weekly_checkins").insert(entries);
        if (error) console.error("⚠️ Error inserting weekly_checkins:", error.message);
        else console.log(`✅ Completed weekly_checkins: ${entries.length} records.`);
      }
    } catch (e) {
      console.error("Error reading weekly_checkins.json:", e);
    }
  }

  console.log(`\n🎉 Database Migration Finished Successfully!\n`);
}

runMigration().catch(err => {
  console.error("Fatal migration failure:", err);
  process.exit(1);
});
