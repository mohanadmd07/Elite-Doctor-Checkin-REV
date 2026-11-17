import express from "express";
import {
  processTelegramWebhookUpdate,
  setTelegramWebhook,
  getTelegramBotStatus,
} from "../services/telegramBotService.js";

/**
 * Creates the Express router for Telegram Bot webhook & diagnostics.
 */
export function createTelegramRouter(
  getActiveCheckins: (callDate?: string) => Promise<any[]>
): express.Router {
  const router = express.Router();

  /**
   * POST /api/telegram/webhook
   * Receives incoming Telegram Bot updates, dispatches doctor calls to WhatsApp,
   * logs them as "Telegram Call", and replies "Call Dispached" before returning 200.
   */
  router.all("/webhook", async (req, res) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return res.status(200).json({
        status: "ready",
        service: "telegram-doctor-call-webhook",
        endpoint: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ status: "method_not_allowed", method: req.method });
    }

    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (expectedSecret) {
      const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
      if (incomingSecret !== expectedSecret) {
        console.warn("[Telegram Webhook] Unauthorized request: invalid secret token");
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
    }

    try {
      const result = await processTelegramWebhookUpdate({
        update: req.body,
        getActiveCheckins,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Telegram Webhook] Fatal error:", err);
      // Always return 200 to Telegram after logging to prevent infinite retry storms
      return res.status(200).json({ ok: false, error: err?.message || String(err) });
    }
  });

  /**
   * GET /api/telegram/status
   * Verifies bot token and reports current webhook registration info.
   */
  router.get("/status", async (_req, res) => {
    try {
      const status = await getTelegramBotStatus();
      res.status(200).json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  /**
   * POST /api/telegram/set-webhook
   * Registers the webhook URL with Telegram Bot API.
   */
  router.post("/set-webhook", async (req, res) => {
    try {
      const webhookUrl =
        typeof req.body?.webhookUrl === "string" && req.body.webhookUrl.trim()
          ? req.body.webhookUrl.trim()
          : process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/telegram/webhook`
            : "";

      if (!webhookUrl || !webhookUrl.startsWith("http")) {
        return res.status(400).json({
          success: false,
          error: "webhookUrl is required (e.g. https://your-domain.vercel.app/api/telegram/webhook)",
        });
      }

      const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
      const result = await setTelegramWebhook({ webhookUrl, secretToken });
      res.status(result.ok ? 200 : 400).json({
        success: result.ok,
        webhookUrl,
        description: result.description,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  return router;
}
