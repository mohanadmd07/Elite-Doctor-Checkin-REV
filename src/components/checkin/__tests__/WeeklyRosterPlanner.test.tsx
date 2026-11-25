// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EntryModeSelector } from "../EntryModeSelector";
import { WeeklyRosterPlanner } from "../WeeklyRosterPlanner";
import { ToastProvider } from "../../common/Toast";

describe("Daily vs Weekly Doctors Entry Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders both Daily Doctor and Weekly Doctors mode cards and triggers callbacks", () => {
    const onSelect = vi.fn();
    render(
      <EntryModeSelector
        activeSheetDate="2026-11-25"
        todayCheckinsCount={12}
        onSelectMode={onSelect}
      />
    );

    expect(screen.getByText("Daily Doctor")).toBeInTheDocument();
    expect(screen.getByText("Weekly Doctors")).toBeInTheDocument();
    expect(screen.getByText(/12 on duty today/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Weekly Doctors/i }));
    expect(onSelect).toHaveBeenCalledWith("weekly");

    fireEvent.click(screen.getByRole("button", { name: /Daily Doctor/i }));
    expect(onSelect).toHaveBeenCalledWith("daily");
  });

  it("allows adding a doctor, quick-filling shifts across 7 days, and batch-saving to /api/checkins/weekly", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/doctors/search")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "1042",
              name: "Ahmed Hassan",
              arabicName: "د. أحمد حسن",
              department: "General Surgery",
              mobileNumber: "01012345678",
            },
          ],
        } as Response;
      }
      if (url === "/api/checkins/weekly" && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        return {
          ok: true,
          json: async () => ({
            success: true,
            savedCount: body.entries.length,
            deletedCount: 0,
            syncedToTodayCount: 1,
            affectedDates: body.entries.map((e: any) => e.date),
            checkins: body.entries,
          }),
        } as Response;
      }
      if (url.startsWith("/api/checkins/week")) {
        return {
          ok: true,
          json: async () => ({
            activeTodayDate: "2026-11-25",
            startDate: "2026-11-25",
            dates: [
              "2026-11-25",
              "2026-11-26",
              "2026-11-27",
              "2026-11-28",
              "2026-11-29",
              "2026-11-30",
              "2026-12-01",
            ],
            checkins: [],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    vi.stubGlobal("fetch", mockFetch);
    const onSaved = vi.fn();

    render(
      <ToastProvider>
        <WeeklyRosterPlanner
          activeSheetDate="2026-11-25"
          onBackToModes={vi.fn()}
          onSwitchToDaily={vi.fn()}
          onSaved={onSaved}
        />
      </ToastProvider>
    );

    // Search for doctor
    const searchInput = screen.getByLabelText(/Add Doctor to Weekly Grid/i);
    fireEvent.change(searchInput, { target: { value: "Ahmed" } });

    const suggestionBtn = await screen.findByText("Ahmed Hassan");
    fireEvent.click(suggestionBtn);

    // Doctor appears in grid
    await waitFor(() => {
      expect(screen.getAllByText("Ahmed Hassan").length).toBeGreaterThan(0);
    });

    // Click "All M" quick fill for 7 days
    const allMorningBtn = screen.getByTitle("Assign Morning shift to all 7 days");
    fireEvent.click(allMorningBtn);

    // Save Weekly Schedule button becomes enabled with (7)
    const saveBtn = screen.getByRole("button", { name: /Save Weekly Schedule \(7\)/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/7 shift assignments saved/i)).toBeInTheDocument();
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
