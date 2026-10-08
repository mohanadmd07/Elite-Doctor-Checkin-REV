import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { DOCTORS_DATABASE } from "../src/data/doctors.js";

function getEgyptDateStr(timestampStr: string): string {
  try {
    const d = new Date(timestampStr);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const year = parseInt(parts.find(p => p.type === "year")?.value || "0", 10);
    const month = parseInt(parts.find(p => p.type === "month")?.value || "0", 10);
    const day = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    let utcTime = Date.UTC(year, month - 1, day);
    if (hour >= 19) utcTime += 86400000;
    const target = new Date(utcTime);
    return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
  } catch {
    return (timestampStr || new Date().toISOString()).split("T")[0];
  }
}

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
      is_active: d.isActive !== false,
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
        const uniqueDaily = new Map<string, any>();
        for (const c of checkins) {
          const docId = String(c.id || "").trim();
          if (!docId) continue;
          uniqueDaily.set(docId.toLowerCase(), {
            doctor_id: docId,
            doctor_name: c.doctorName || "",
            doctor_arabic_name: c.doctorArabicName || c.doctorName || "",
            department: c.department || "General",
            shifts: Array.isArray(c.shifts) ? c.shifts : [],
            mobile_number: c.mobileNumber || "",
            checkin_timestamp: c.timestamp || new Date().toISOString(),
            checkin_date: getEgyptDateStr(c.timestamp || new Date().toISOString()),
          });
        }
        const entries = Array.from(uniqueDaily.values());
        // Clean delete existing daily checkins to ensure fresh sync without orphaned IDs
        await supabase.from("checkins").delete().neq("doctor_id", "__none__");
        const { error } = await supabase.from("checkins").upsert(entries, { onConflict: "doctor_id" });
        if (error) console.error("⚠️ Error upserting checkins:", error.message);
        else console.log(`✅ Completed checkins: ${entries.length} records.`);
      }
    } catch (e) {
      console.error("Error reading checkins.json:", e);
    }
  }

  // 6. Migrate Monthly Cumulative Check-ins (30-day FIFO sliding window)
  const monthlyPath = path.join(process.cwd(), "data", "monthly_checkins.json");
  const weeklyPath = path.join(process.cwd(), "data", "weekly_checkins.json");
  const sourcePath = fs.existsSync(monthlyPath) ? monthlyPath : weeklyPath;
  if (fs.existsSync(sourcePath)) {
    try {
      const records = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
      if (Array.isArray(records) && records.length > 0) {
        console.log(`📦 [6/6] Migrating ${records.length} check-in records to monthly 30-day rolling roster...`);
        
        // 30-day window enforcement:
        const dateMap = new Map<string, any[]>();
        for (const r of records) {
          const ts = r.timestamp || new Date().toISOString();
          const d = getEgyptDateStr(ts);
          if (!dateMap.has(d)) dateMap.set(d, []);
          dateMap.get(d)!.push(r);
        }
        const sortedDates = Array.from(dateMap.keys()).sort();
        let recordsToMigrate = records;
        if (sortedDates.length > 30) {
          const keepDates = new Set(sortedDates.slice(sortedDates.length - 30));
          console.log(`   Pruning ${sortedDates.length - 30} oldest days to maintain 30-day sliding window.`);
          recordsToMigrate = records.filter(r => keepDates.has(getEgyptDateStr(r.timestamp || new Date().toISOString())));
        }

        const uniqueMonthly = new Map<string, any>();
        for (const w of recordsToMigrate) {
          const docId = String(w.id || "").trim();
          if (!docId) continue;
          const ts = w.timestamp || new Date().toISOString();
          const dateStr = getEgyptDateStr(ts);
          const key = `${docId.toLowerCase()}_${dateStr}`;
          uniqueMonthly.set(key, {
            doctor_id: docId,
            doctor_name: w.doctorName || "",
            doctor_arabic_name: w.doctorArabicName || w.doctorName || "",
            department: w.department || "General",
            shifts: Array.isArray(w.shifts) ? w.shifts : [],
            mobile_number: w.mobileNumber || "",
            checkin_timestamp: ts,
            checkin_date: dateStr,
          });
        }
        const entries = Array.from(uniqueMonthly.values());
        const BATCH_SIZE = 100;
        let insertedMonthly = 0;
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          const { error: monErr } = await supabase.from("monthly_checkins").upsert(batch, { onConflict: "doctor_id,checkin_date" });
          if (monErr) {
            const { error: insertErr } = await supabase.from("monthly_checkins").insert(batch);
            if (insertErr) console.error("⚠️ Error inserting monthly_checkins batch:", insertErr.message);
            else insertedMonthly += batch.length;
          } else {
            insertedMonthly += batch.length;
          }
          // Also sync to weekly_checkins for backward compatibility
          try {
            await supabase.from("weekly_checkins").upsert(batch, { onConflict: "doctor_id,checkin_date" });
          } catch {}
        }
        console.log(`✅ Completed monthly_checkins (30-day window): ${insertedMonthly} records.`);
      }
    } catch (e) {
      console.error("Error reading check-ins file for migration:", e);
    }
  }

  console.log(`\n🎉 Database Migration Finished Successfully!\n`);
}

runMigration().catch(err => {
  console.error("Fatal migration failure:", err);
  process.exit(1);
});
