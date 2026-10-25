import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { prayerAuthMiddleware, prayerKillSwitchMiddleware, prayerRouter } from "../prayerRoutes.js";
import * as prayerService from "../../services/prayerService.js";

describe("Prayer Routes - Auth & Middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "super-secret-token";
    process.env.PRAYER_NOTIFICATIONS_ENABLED = "true";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is missing or incorrect", () => {
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res: any = { status, json };

    // Case 1: No auth header
    const req1: any = { headers: {}, method: "GET", url: "/api/prayer/dispatch" };
    prayerAuthMiddleware(req1, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Unauthorized") }));
    expect(next).not.toHaveBeenCalled();

    // Case 2: Wrong Bearer token
    status.mockClear();
    json.mockClear();
    const req2: any = { headers: { authorization: "Bearer wrong-token" }, method: "GET", url: "/api/prayer/dispatch" };
    prayerAuthMiddleware(req2, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    // Case 3: Valid Bearer token
    status.mockClear();
    json.mockClear();
    const req3: any = { headers: { authorization: "Bearer super-secret-token" }, method: "GET", url: "/api/prayer/dispatch" };
    prayerAuthMiddleware(req3, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("kill switch middleware immediately returns 200 { skipped: true } when disabled", () => {
    process.env.PRAYER_NOTIFICATIONS_ENABLED = "false";

    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res: any = { status, json };
    const req: any = {};

    prayerKillSwitchMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ skipped: true, reason: "PRAYER_NOTIFICATIONS_ENABLED is false" });
    expect(next).not.toHaveBeenCalled();
  });

  it("kill switch middleware calls next() when enabled", () => {
    process.env.PRAYER_NOTIFICATIONS_ENABLED = "true";

    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res: any = { status, json };
    const req: any = {};

    prayerKillSwitchMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
