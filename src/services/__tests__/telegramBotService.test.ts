import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTelegramCallCommand,
  processTelegramWebhookUpdate,
  clearTelegramDeduplicationCache,
  type TelegramUpdate,
} from "../telegramBotService.js";
import * as doctorCallDispatcher from "../doctorCallDispatcher.js";

describe("Telegram Bot Service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearTelegramDeduplicationCache();
    process.env.TELEGRAM_BOT_TOKEN = "test-tg-token";
    process.env.GREEN_API_ID_INSTANCE = "1101000001";
    process.env.GREEN_API_API_TOKEN_INSTANCE = "test-green-token";
    process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID = "120363000000000000@g.us";
    delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("parseTelegramCallCommand", () => {
    it("parses 'call general surgery to ER'", () => {
      const parsed = parseTelegramCallCommand("call general surgery to ER");
      expect(parsed).toEqual({
        rawDepartment: "general surgery",
        canonicalDepartment: "General Surgery",
        room: "ER",
        isOpd: false,
        notes: undefined,
      });
    });

    it("parses 'call general surgery to 324'", () => {
      const parsed = parseTelegramCallCommand("call general surgery to 324");
      expect(parsed).toEqual({
        rawDepartment: "general surgery",
        canonicalDepartment: "General Surgery",
        room: "324",
        isOpd: false,
        notes: undefined,
      });
    });

    it("parses 'call general surgery to 411'", () => {
      const parsed = parseTelegramCallCommand("call general surgery to 411");
      expect(parsed).toEqual({
        rawDepartment: "general surgery",
        canonicalDepartment: "General Surgery",
        room: "411",
        isOpd: false,
        notes: undefined,
      });
    });

    it("parses OPD commands ('call cardiology to OPD' and 'call cardiology to OPD cardiology center')", () => {
      const opdPlain = parseTelegramCallCommand("call cardiology to OPD");
      expect(opdPlain).toEqual({
        rawDepartment: "cardiology",
        canonicalDepartment: "Cardiology",
        room: "OPD",
        isOpd: true,
        notes: undefined,
      });

      const opdCenter = parseTelegramCallCommand("call cardiology to OPD cardiology center");
      expect(opdCenter).toEqual({
        rawDepartment: "cardiology",
        canonicalDepartment: "Cardiology",
        room: "OPD Cardiology Center",
        isOpd: true,
        notes: undefined,
      });
    });

    it("parses '/call cardiology to room 325' and abbreviations like 'gs'", () => {
      const parsed1 = parseTelegramCallCommand("/call cardiology to room 325");
      expect(parsed1?.canonicalDepartment).toBe("Cardiology");
      expect(parsed1?.room).toBe("325");

      const parsed2 = parseTelegramCallCommand("call gs to icu");
      expect(parsed2?.canonicalDepartment).toBe("General Surgery");
      expect(parsed2?.room).toBe("ICU");
    });

    it("parses Arabic call commands", () => {
      const parsed = parseTelegramCallCommand("استدعاء جراحة عامة الى 324");
      expect(parsed?.canonicalDepartment).toBe("General Surgery");
      expect(parsed?.room).toBe("324");
    });

    it("returns null for non-call messages or inactive/unknown specialties", () => {
      expect(parseTelegramCallCommand("hello there")).toBeNull();
      expect(parseTelegramCallCommand("call dental to 101")).toBeNull();
      expect(parseTelegramCallCommand("call unknown_dept to 101")).toBeNull();
    });
  });

  describe("processTelegramWebhookUpdate", () => {
    it("fetches on-shift doctor, dispatches WhatsApp alert, logs 'Telegram Call', and replies 'Call Dispached'", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, idMessage: "wa-msg-123", result: { message_id: 99 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const saveSpy = vi.spyOn(doctorCallDispatcher, "saveDoctorCallRecord").mockResolvedValue(undefined);
      vi.spyOn(doctorCallDispatcher, "recordWebhookAuditLog").mockImplementation(() => {});
      vi.spyOn(doctorCallDispatcher, "isAutomationPaused").mockReturnValue(false);

      const getActiveCheckins = vi.fn().mockResolvedValue([
        {
          id: "101",
          doctorName: "Ahmed Mohamed",
          doctorArabicName: "أحمد محمد",
          department: "General Surgery",
          shifts: ["24 shift"],
          mobileNumber: "01012345678",
        },
        {
          id: "102",
          doctorName: "Sara Ali",
          doctorArabicName: "سارة علي",
          department: "Cardiology",
          shifts: ["24 shift"],
          mobileNumber: "01099999999",
        },
      ]);

      const update: TelegramUpdate = {
        update_id: 5001,
        message: {
          message_id: 10,
          chat: { id: 777888, type: "private" },
          from: { id: 777888, first_name: "Mohanad", username: "mohanad" },
          text: "call general surgery to 324",
        },
      };

      const result = await processTelegramWebhookUpdate({ update, getActiveCheckins });

      expect(result.handled).toBe(true);
      expect(result.action).toBe("dispatched");
      expect(result.replyText).toBe("Call Dispached");

      // Verify record logged for Admin Dashboard states "Elite Patient" & "Telegram Call"
      expect(result.callRecord).toBeDefined();
      expect(result.callRecord?.patientName).toBe("Elite Patient");
      expect(result.callRecord?.callerName).toBe("Telegram Call");
      expect(result.callRecord?.department).toBe("General Surgery");
      expect(result.callRecord?.room).toBe("324");
      expect(result.callRecord?.status).toBe("dispatched");
      expect(result.callRecord?.dispatchedDoctors).toHaveLength(1);
      expect(result.callRecord?.dispatchedDoctors[0].waPhone).toBe("201012345678");

      // Verify Green-API WhatsApp call + Telegram sendMessage call
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const waCall = fetchMock.mock.calls[0];
      expect(String(waCall[0])).toContain("api.green-api.com");
      const waBody = JSON.parse(waCall[1].body);
      expect(waBody.message).toContain("Room *324*");
      expect(waBody.message).toContain("General Surgery");
      expect(waBody.message).toContain("@201012345678");

      const tgCall = fetchMock.mock.calls[1];
      expect(String(tgCall[0])).toContain("api.telegram.org/bottest-tg-token/sendMessage");
      const tgBody = JSON.parse(tgCall[1].body);
      expect(tgBody.chat_id).toBe(777888);
      expect(tgBody.text).toBe("Call Dispached");
    });

    it("deduplicates repeated update_id", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, idMessage: "wa-msg-1", result: { message_id: 1 } }),
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(doctorCallDispatcher, "saveDoctorCallRecord").mockResolvedValue(undefined);
      vi.spyOn(doctorCallDispatcher, "recordWebhookAuditLog").mockImplementation(() => {});
      vi.spyOn(doctorCallDispatcher, "isAutomationPaused").mockReturnValue(false);

      const getActiveCheckins = vi.fn().mockResolvedValue([
        {
          id: "101",
          doctorName: "Ahmed Mohamed",
          department: "General Surgery",
          shifts: ["24 shift"],
          mobileNumber: "01012345678",
        },
      ]);

      const update: TelegramUpdate = {
        update_id: 9001,
        message: {
          message_id: 11,
          chat: { id: 123, type: "private" },
          text: "call general surgery to ER",
        },
      };

      const first = await processTelegramWebhookUpdate({ update, getActiveCheckins });
      const second = await processTelegramWebhookUpdate({ update, getActiveCheckins });

      expect(first.handled).toBe(true);
      expect(second.handled).toBe(false);
      expect(second.action).toBe("ignored");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("logs 'no_doctor_present' as 'Telegram Call' and does not send WhatsApp when no doctor is on shift", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 12 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const saveSpy = vi.spyOn(doctorCallDispatcher, "saveDoctorCallRecord").mockResolvedValue(undefined);
      vi.spyOn(doctorCallDispatcher, "recordWebhookAuditLog").mockImplementation(() => {});
      vi.spyOn(doctorCallDispatcher, "isAutomationPaused").mockReturnValue(false);

      const getActiveCheckins = vi.fn().mockResolvedValue([]);

      const update: TelegramUpdate = {
        update_id: 5002,
        message: {
          message_id: 15,
          chat: { id: 777888, type: "private" },
          text: "call general surgery to 411",
        },
      };

      const result = await processTelegramWebhookUpdate({ update, getActiveCheckins });

      expect(result.handled).toBe(true);
      expect(result.action).toBe("no_doctor_present");
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy.mock.calls[0][0].patientName).toBe("Elite Patient");
      expect(saveSpy.mock.calls[0][0].callerName).toBe("Telegram Call");
      expect(saveSpy.mock.calls[0][0].status).toBe("no_doctor_present");

      // Only Telegram reply was sent; Green-API was NOT called
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain("api.telegram.org");
    });

    it("rejects unauthorized chat IDs when TELEGRAM_ALLOWED_CHAT_IDS is set", async () => {
      process.env.TELEGRAM_ALLOWED_CHAT_IDS = "111222";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 13 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const update: TelegramUpdate = {
        update_id: 5003,
        message: {
          message_id: 16,
          chat: { id: 999999, type: "private" },
          text: "call general surgery to ER",
        },
      };

      const result = await processTelegramWebhookUpdate({
        update,
        getActiveCheckins: vi.fn(),
      });

      expect(result.handled).toBe(false);
      expect(result.action).toBe("unauthorized");
    });

    it("dispatches OPD template with stethoscope+siren header, bold location, and 'OPD Patient'", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, idMessage: "wa-opd-1", result: { message_id: 21 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      vi.spyOn(doctorCallDispatcher, "recordWebhookAuditLog").mockImplementation(() => {});
      vi.spyOn(doctorCallDispatcher, "isAutomationPaused").mockReturnValue(false);

      const getActiveCheckins = vi.fn().mockResolvedValue([
        {
          id: "202",
          doctorName: "Sara Ali",
          department: "Cardiology",
          shifts: ["24 shift"],
          mobileNumber: "01099998888",
        },
      ]);

      const update: TelegramUpdate = {
        update_id: 5004,
        message: {
          message_id: 20,
          chat: { id: 777888, type: "private" },
          text: "call cardiology to OPD cardiology center",
        },
      };

      const result = await processTelegramWebhookUpdate({ update, getActiveCheckins });

      expect(result.handled).toBe(true);
      expect(result.action).toBe("dispatched");
      expect(result.replyText).toBe("Call Dispached");
      expect(result.callRecord?.patientName).toBe("OPD Patient");
      expect(result.callRecord?.callerName).toBe("Telegram Call");
      expect(result.callRecord?.room).toBe("OPD Cardiology Center");

      const waBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(waBody.message).toContain("🩺🚨 *OPD DOCTOR CALL* 🚨🩺");
      expect(waBody.message).toContain("📍 *Location:* *OPD Cardiology Center*");
      expect(waBody.message).toContain("🩺 *Specialty:* Cardiology");
      expect(waBody.message).toContain("👤 *Patient:* OPD Patient");
      expect(waBody.message).toContain("@201099998888");
      expect(waBody.message).toContain("01099998888");
    });
  });
});
