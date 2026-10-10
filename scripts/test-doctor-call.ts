import {
  parseDoctorCallMessage,
  getCairoActiveShifts,
  matchesActiveShift,
  formatDoctorCallAlert,
  toWhatsAppPhone,
  saveDoctorCallRecord,
  getDoctorCallRecords,
  DoctorCallRecord
} from "../src/services/doctorCallDispatcher.js";

async function runTests() {
  console.log("🧪 === TESTING DOCTOR CALL DISPATCHER ===\n");

  const sampleMessage = `Type: Request

Category: DoctorCall

Group: جراحة المخ و الاعصاب

By: Samar Raafat Abdelmoniem Abo elenin

Date: 10/10/2026, 10:55:28 AM

Location: Elite 3rd Floor - Elite

Sub.Location: Room 325


Patient Barcode: 0000267599
Patient Name: سمر وحيد عبدالفتاح عبدالصمدالشناوي
Admitting Phys: Ahmed Mohamed  Khalil
Bed: Bed 325

لمناظرة الحالة`;

  // Test 1: Message Parser
  console.log("▶ [Test 1] Parsing sample DoctorCall message...");
  const parsed = parseDoctorCallMessage(sampleMessage);
  if (!parsed) {
    throw new Error("Failed to parse sample message!");
  }

  console.log("  Parsed Category:", parsed.category);
  console.log("  Parsed Raw Dept:", parsed.departmentRaw);
  console.log("  Canonical Specialty:", parsed.canonicalDepartment);
  console.log("  Parsed Room:", parsed.room);
  console.log("  Parsed Patient:", parsed.patientName);
  console.log("  Parsed Barcode:", parsed.patientBarcode);
  console.log("  Parsed Admitting Phys:", parsed.admittingPhysician);

  if (parsed.canonicalDepartment !== "Neurosurgery") {
    throw new Error(`Expected Neurosurgery, got: ${parsed.canonicalDepartment}`);
  }
  if (parsed.room !== "325") {
    throw new Error(`Expected room 325, got: ${parsed.room}`);
  }
  console.log("  ✅ Message Parser passed!\n");

  // Test 2: Cairo Shift Resolution
  console.log("▶ [Test 2] Testing Cairo Shift Resolution...");
  // 10:55 AM Cairo
  const morningDate = new Date("2026-10-10T10:55:28+03:00");
  const morningShifts = getCairoActiveShifts(morningDate);
  console.log("  10:55 AM Shifts:", morningShifts);
  if (!morningShifts.includes("Long shift")) {
    throw new Error("10:55 AM should include Long shift");
  }

  // 4:00 PM Cairo (Overlap: Long + Evening)
  const afternoonDate = new Date("2026-10-10T16:00:00+03:00");
  const afternoonShifts = getCairoActiveShifts(afternoonDate);
  console.log("  04:00 PM Shifts (Overlap):", afternoonShifts);
  if (!afternoonShifts.includes("Long shift") || !afternoonShifts.includes("Evening shift")) {
    throw new Error("4:00 PM should include both Long and Evening shifts");
  }

  // 11:30 PM Cairo
  const nightDate = new Date("2026-10-10T23:30:00+03:00");
  const nightShifts = getCairoActiveShifts(nightDate);
  console.log("  11:30 PM Shifts:", nightShifts);
  if (!nightShifts.includes("Night shift")) {
    throw new Error("11:30 PM should include Night shift");
  }
  console.log("  ✅ Shift Resolution passed!\n");

  // Test 3: Phone Normalization & WhatsApp Mention Alert Formatting
  console.log("▶ [Test 3] Testing Alert Template Formatting...");
  const sampleDoctor = {
    id: "300",
    name: "Mohamed El-Shennawy",
    arabicName: "محمد الشناوي",
    phone: "01012345678",
    waPhone: toWhatsAppPhone("01012345678"),
    shifts: ["Long shift"]
  };

  console.log("  Local Phone:", sampleDoctor.phone, "-> WhatsApp Normalized:", sampleDoctor.waPhone);
  if (sampleDoctor.waPhone !== "201012345678") {
    throw new Error(`Expected 201012345678, got ${sampleDoctor.waPhone}`);
  }

  const alertMessage = formatDoctorCallAlert({
    doctors: [sampleDoctor],
    specialty: parsed.canonicalDepartment,
    room: parsed.room
  });

  console.log("  Formatted WhatsApp Alert Output:\n---\n" + alertMessage + "\n---");
  if (!alertMessage.includes("Dr. @201012345678 *Mohamed El-Shennawy*")) {
    throw new Error("Alert message does not match requested mention format!");
  }
  if (!alertMessage.includes("Room *325*")) {
    throw new Error("Alert message does not include room number!");
  }
  console.log("  ✅ Alert Template Formatting passed!\n");

  // Test 4: Persistence Test (Local JSON fallback)
  console.log("▶ [Test 4] Testing Persistence...");
  const testRecord: DoctorCallRecord = {
    id: "test_call_sample_1",
    callDate: "2026-10-10",
    createdAt: new Date().toISOString(),
    room: parsed.room,
    department: parsed.canonicalDepartment,
    rawDepartment: parsed.departmentRaw,
    patientName: parsed.patientName || "N/A",
    patientBarcode: parsed.patientBarcode || "N/A",
    admittingPhysician: parsed.admittingPhysician || "N/A",
    callerName: parsed.callerName || "N/A",
    dispatchedDoctors: [sampleDoctor],
    status: "dispatched",
    rawMessage: parsed.rawMessage
  };

  await saveDoctorCallRecord(testRecord);
  const fetched = await getDoctorCallRecords({ search: "325" });
  const found = fetched.find(c => c.id === testRecord.id);
  if (!found) {
    throw new Error("Failed to find persisted record!");
  }
  console.log("  Retrieved saved record ID:", found.id, "Status:", found.status);
  console.log("  ✅ Persistence passed!\n");

  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
