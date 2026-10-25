import express from "express";
import {
  executePrayerFetch,
  executePrayerDispatch,
  getPrayerStatus,
  sendTestPrayerMessage,
  isPrayerPaused,
  setPrayerPaused,
} from "../services/prayerService.js";

export const prayerRouter = express.Router();

/**
 * Authentication middleware matching existing CRON_SECRET pattern.
 * Requires: Authorization: Bearer <CRON_SECRET> or x-vercel-cron: 1
 */
export function prayerAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers["x-vercel-cron"] === "1";

  if (!cronSecret || (!isVercelCron && authHeader !== `Bearer ${cronSecret}`)) {
    console.warn(`[prayer] Unauthorized attempt on ${req.method} ${req.originalUrl || req.url}`);
    return res.status(401).json({ error: "Unauthorized: Invalid or missing CRON_SECRET bearer token" });
  }

  next();
}

/**
 * Kill switch middleware: when PRAYER_NOTIFICATIONS_ENABLED is false (default),
 * immediately returns 200 { skipped: true } without doing any work.
 */
export function prayerKillSwitchMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (process.env.PRAYER_NOTIFICATIONS_ENABLED !== "true") {
    return res.status(200).json({ skipped: true, reason: "PRAYER_NOTIFICATIONS_ENABLED is false" });
  }
  next();
}

/**
 * GET /api/prayer/fetch
 * Weekly fetch of Alexandria, Egypt prayer times (pre-fetches 8 days in advance).
 * Scheduled: Each Friday at 06:00 AM Africa/Cairo.
 * Guard: only runs on Friday at 06:00 AM unless ?force=1 is passed.
 * Protected by CRON_SECRET.
 */
prayerRouter.get("/fetch", prayerAuthMiddleware, prayerKillSwitchMiddleware, async (req, res) => {
  try {
    const force = req.query.force === "1" || req.query.force === "true";
    const result = await executePrayerFetch({ force });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[prayer] Fetch endpoint error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * GET /api/prayer/dispatch
 * Per-minute dispatcher called by external scheduler (e.g. cron-job.org).
 * Checks if current Cairo minute matches any stored prayer (tolerance: 0 to +2 min).
 * Atomically claims row and dispatches to WhatsApp groups.
 * Protected by CRON_SECRET.
 */
prayerRouter.get("/dispatch", prayerAuthMiddleware, prayerKillSwitchMiddleware, async (req, res) => {
  try {
    const result = await executePrayerDispatch();
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[prayer] Dispatch endpoint error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * GET /api/prayer/status
 * Read-only status endpoint returning cached times and send logs for today and upcoming week.
 * Accessible to Admin Dashboard and authorized monitoring scripts.
 */
prayerRouter.get("/status", async (req, res) => {
  try {
    const status = await getPrayerStatus();
    res.status(200).json(status);
  } catch (err: any) {
    console.error("[prayer] Status endpoint error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * POST /api/prayer/toggle-pause
 * Toggle automation state (pause / resume).
 * When paused, scheduled weekly fetching and azan WhatsApp sending are suspended.
 */
prayerRouter.post("/toggle-pause", async (req, res) => {
  try {
    const current = await isPrayerPaused();
    const updated = await setPrayerPaused(!current);
    res.status(200).json({
      success: true,
      isPaused: updated,
      message: updated
        ? "Prayer automation has been PAUSED. Scheduled fetching and azan messages are halted."
        : "Prayer automation has been RESUMED and is ACTIVE.",
    });
  } catch (err: any) {
    console.error("[prayer] Toggle pause error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * POST /api/prayer/fetch-now
 * Trigger an immediate weekly fetch from the Admin Panel without needing CRON_SECRET.
 * Pre-fetches the upcoming week in advance.
 */
prayerRouter.post("/fetch-now", prayerKillSwitchMiddleware, async (req, res) => {
  try {
    const result = await executePrayerFetch({ force: true });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[prayer] Fetch-now endpoint error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * POST /api/prayer/test
 * Explicit test trigger: sends a clearly marked "[TEST]" message to a single group.
 */
prayerRouter.post("/test", prayerKillSwitchMiddleware, async (req, res) => {
  try {
    const chatId = typeof req.body?.chatId === "string" ? req.body.chatId : undefined;
    const prayer = typeof req.body?.prayer === "string" ? req.body.prayer : undefined;
    const time = typeof req.body?.time === "string" ? req.body.time : undefined;

    const result = await sendTestPrayerMessage({ chatId, prayer, time });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[prayer] Test dispatch endpoint error:", err);
    res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});
