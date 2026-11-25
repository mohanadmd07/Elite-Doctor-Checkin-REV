import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  processDoctorCallWebhook,
  pollGreenApiNotifications,
  setGreenApiWebhookUrl,
} from "../doctorCallDispatcher";

describe("Vercel Fluid Compute Optimizations & Automation Safety", () => {
  it("ignores noisy Green-API webhooks (receipts, stickers, casual chat) immediately with zero outbound fetch calls", async () => {
    const origId = process.env.GREEN_API_ID_INSTANCE;
    const origToken = process.env.GREEN_API_API_TOKEN_INSTANCE;
    const origFetch = global.fetch;
    const fetchSpy = vi.fn();

    try {
      process.env.GREEN_API_ID_INSTANCE = "7100000001";
      process.env.GREEN_API_API_TOKEN_INSTANCE = "test_token_123";
      global.fetch = fetchSpy as any;

      const receiptRes = await processDoctorCallWebhook({
        rawBody: { typeWebhook: "outgoingMessageStatus", status: "read" },
        getActiveCheckins: async () => [],
      });
      expect(receiptRes.handled).toBe(false);

      const reactionRes = await processDoctorCallWebhook({
        rawBody: {
          typeWebhook: "incomingMessageReceived",
          idMessage: `react_${Date.now()}`,
          senderData: { chatId: "120363000000@g.us" },
          messageData: { typeMessage: "reactionMessage" },
        },
        getActiveCheckins: async () => [],
      });
      expect(reactionRes.handled).toBe(false);

      const casualRes = await processDoctorCallWebhook({
        rawBody: {
          typeWebhook: "incomingMessageReceived",
          idMessage: `casual_${Date.now()}`,
          senderData: { chatId: "120363000000@g.us" },
          messageData: {
            typeMessage: "textMessage",
            textMessageData: { textMessage: "Good morning everyone!" },
          },
        },
        getActiveCheckins: async () => [],
      });
      expect(casualRes.handled).toBe(false);

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      process.env.GREEN_API_ID_INSTANCE = origId;
      process.env.GREEN_API_API_TOKEN_INSTANCE = origToken;
      global.fetch = origFetch;
    }
  });

  it("configures Green-API webhooks to disable receipt/state chatter while keeping incoming & outgoing call webhooks active", async () => {
    const origId = process.env.GREEN_API_ID_INSTANCE;
    const origToken = process.env.GREEN_API_API_TOKEN_INSTANCE;
    const origFetch = global.fetch;
    let sentSettings: any = null;

    try {
      process.env.GREEN_API_ID_INSTANCE = "7100000001";
      process.env.GREEN_API_API_TOKEN_INSTANCE = "test_token_123";
      global.fetch = vi.fn(async (_url: any, init?: any) => {
        sentSettings = init?.body ? JSON.parse(init.body) : null;
        return { ok: true, json: async () => ({ saveSettings: true }) } as any;
      }) as any;

      const res = await setGreenApiWebhookUrl("https://elite-doctor-checkin-rev.vercel.app/api/whatsapp/webhook");
      expect(res.success).toBe(true);
      expect(sentSettings.incomingWebhook).toBe("yes");
      expect(sentSettings.incomingBlockWebhook).toBe("yes");
      expect(sentSettings.outgoingMessageWebhook).toBe("yes");
      expect(sentSettings.outgoingWebhook).toBe("no");
      expect(sentSettings.outgoingAPIMessageWebhook).toBe("no");
      expect(sentSettings.stateWebhook).toBe("no");
    } finally {
      process.env.GREEN_API_ID_INSTANCE = origId;
      process.env.GREEN_API_API_TOKEN_INSTANCE = origToken;
      global.fetch = origFetch;
    }
  });

  it("fast failsafe poll mode only queries lastIncomingMessages with short window and skips outgoing/queue/history calls", async () => {
    const origId = process.env.GREEN_API_ID_INSTANCE;
    const origToken = process.env.GREEN_API_API_TOKEN_INSTANCE;
    const origFetch = global.fetch;
    const calledUrls: string[] = [];

    try {
      process.env.GREEN_API_ID_INSTANCE = "7100000001";
      process.env.GREEN_API_API_TOKEN_INSTANCE = "test_token_123";
      global.fetch = vi.fn(async (url: any) => {
        calledUrls.push(String(url));
        return { ok: true, json: async () => [] } as any;
      }) as any;

      await pollGreenApiNotifications({
        getActiveCheckins: async () => [],
        maxCount: 3,
        skipQueueDrain: true,
        journalMinutes: 15,
        incomingOnly: true,
      });

      expect(calledUrls).toHaveLength(1);
      expect(calledUrls[0]).toContain("/lastIncomingMessages/");
      expect(calledUrls[0]).toContain("minutes=15");
    } finally {
      process.env.GREEN_API_ID_INSTANCE = origId;
      process.env.GREEN_API_API_TOKEN_INSTANCE = origToken;
      global.fetch = origFetch;
    }
  });

  it("verifies server.ts and src/App.tsx enforce serverless cold-start and polling guards", () => {
    const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
    const appSource = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");

    expect(serverSource).not.toContain('import ExcelJS from "exceljs"');
    expect(serverSource).not.toContain('import { DOCTORS_DATABASE }');
    expect(serverSource).not.toContain('import { COMPILED_HEADER_BG_BASE64');
    expect(serverSource).toContain("if (!process.env.VERCEL) {\n  app.use(compression());");
    expect(serverSource).toContain("ensureBaseDoctorsInitialized");
    expect(serverSource).toContain("s-maxage=300");

    expect(appSource).not.toContain("setInterval(runPoll, 15000)");
    expect(appSource).not.toContain('fetch("/api/sheet-header-sync"');
    expect(appSource).toContain("setInterval(refreshRoster, 60000)");
    expect(appSource).toContain("setInterval(refreshCallsTab, 30000)");
    expect(appSource).toContain("setInterval(refreshPrayerTab, 300000)");
  });
});
