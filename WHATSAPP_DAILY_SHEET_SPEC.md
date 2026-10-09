# Specification: Automated WhatsApp Daily Sheet Delivery

## 1. Overview & Purpose
This system automatically delivers today's physician check-in spreadsheet (`Physician_Checkins_<YYYY-MM-DD>.xlsx`) directly to a designated WhatsApp group chat as a native document attachment every morning at 8:00 AM Cairo time.

It is 100% free, runs serverlessly on Vercel via Vercel Cron, and integrates with Green-API's permanent free developer instance via REST.

---

## 2. Decision Log

| Decision # | What Was Decided | Alternatives Considered | Why This Was Chosen |
| :--- | :--- | :--- | :--- |
| **DEC-001** | Send actual `.xlsx` spreadsheet as a native document attachment. | Plain text summary only / summary + web link. | Clinic administration needs the exact formatted Excel roster file directly accessible within WhatsApp. |
| **DEC-002** | Deliver today's roster for the day just beginning at 8:00 AM Cairo time. | Yesterday's completed roster. | Doctors, supervisors, and operations teams require the active morning roster to coordinate incoming shifts. |
| **DEC-003** | Use Green-API Free Developer Instance via REST (`sendFileByUpload`). | Self-hosted Baileys worker / Paid Meta BSP. | 100% free, zero server management, and fully compatible with Vercel's stateless serverless function lifecycle. |
| **DEC-004** | Dual trigger: Automated Vercel Cron + Manual UI Button. | Cron-only automation. | Provides instantaneous test verification, debugging, and ad-hoc re-sends directly from the admin dashboard. |
| **DEC-005** | Schedule at `0 5 * * *` UTC with Cairo timezone offset awareness. | Static UTC hour without DST consideration. | Egypt alternates between UTC+3 (summer) and UTC+2 (winter); Vercel Crons operate in UTC. |

---

## 3. Architecture & Data Flow

```
[Vercel Cron Trigger] (8:00 AM Cairo / 05:00 UTC)
        │
        ▼ (Authorization: Bearer CRON_SECRET)
[GET /api/cron/send-daily-sheet]
        │
        ├─────────────────────────────────────────────────┐
        ▼                                                 │
[ExcelJS In-Memory Generator]                             │
(Constructs Physician_Checkins_YYYY-MM-DD.xlsx)           │
        │                                                 ▼
        ▼                                      [POST /api/whatsapp/send-daily-sheet]
[Multipart FormData Buffer]                               ▲
        │                                                 │
        ▼                                      [Admin UI Dashboard Button]
[Green-API REST Endpoint]                     ("📤 Send Sheet to WhatsApp")
(POST /sendFileByUpload)
        │
        ▼
[WhatsApp Group Chat]
(Native .xlsx document with morning briefing caption)
```

---

## 4. Environment Variables Required

Add the following environment variables to `.env` locally and in **Vercel Project Settings > Environment Variables**:

```env
# Green-API WhatsApp Credentials
GREEN_API_ID_INSTANCE="1101xxxxxx"
GREEN_API_API_TOKEN_INSTANCE="d1f5e8xxxxxxxxxxxxxxxxxxxx"
WHATSAPP_GROUP_ID="1203630xxxxxxxxxxx@g.us"

# Vercel Cron Security Token
CRON_SECRET="your-secure-random-token-here"
```

---

## 5. Step-by-Step "For Dummies" Setup Guide

### Step 1: Create Free Green-API Instance
1. Go to [green-api.com](https://green-api.com) and click **Start for Free**.
2. Sign up with your email and confirm your account.
3. In the console, click **Create Instance** and select the **"Developer" (Free)** plan.
4. Click **QR code** in the menu, open WhatsApp on your phone (**Settings > Linked Devices > Link a Device**), and scan the screen.
5. Your instance will display **"Authorized"**.

### Step 2: Obtain Group ID
1. Add the linked phone number into your target clinic WhatsApp group as a participant.
2. In the Green-API console, navigate to the **"Chats"** tab or test the `getChats` method.
3. Locate your group name and copy its `chatId` (it will look like `120363041234567890@g.us`).

### Step 3: Configure Vercel & Run
1. In `vercel.json`, configure the cron schedule:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/send-daily-sheet",
         "schedule": "0 5 * * *"
       }
     ]
   }
   ```
2. In `server.ts`, implement:
   - Helper function `sendDailySheetToWhatsApp({ targetDate?: string })`.
   - `GET /api/cron/send-daily-sheet` for Vercel Cron.
   - `POST /api/whatsapp/send-daily-sheet` for manual UI invocation.
3. In the Frontend admin header, add the **"Send Sheet to WhatsApp"** button.

---

## 6. Error Handling & Edge Cases

1. **WhatsApp Instance Disconnected**:
   - Status code `401/403` received from Green-API.
   - Handled gracefully: Logs explicit guidance to re-authenticate via QR code; dashboard displays an informative warning toast.
2. **Missing Group ID or Unrecognized Chat**:
   - Validates format `*@g.us` before dispatching.
3. **Empty Roster at 8:00 AM**:
   - If no doctors have checked in yet at 8:00 AM, the generated sheet includes the date header and empty roster layout with a caption note: *"0 check-ins logged so far today"*.
4. **Rate Limits & Execution Time**:
   - Free developer tier allows up to 100 messages/day. With 1 scheduled message daily, usage is 1% of the quota.
   - Vercel execution finishes in `< 3 seconds`, comfortably below the 10-second serverless execution limit.
