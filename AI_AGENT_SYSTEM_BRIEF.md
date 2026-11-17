# Elite Hospital Physician Check-in & Doctor Call Dispatcher System
## Comprehensive System & Integration Brief for AI Agents

---

### Executive Summary

**Elite Hospital Physician Check-in & Doctor Call Dispatcher** (`Elite-Doctor-Checkin-REV`) is a mission-critical hospital operational system designed for **Elite Hospital** (operating on `Africa/Cairo` time). 

The platform serves three interconnected operational pillars:
1. **Physician Attendance Kiosk & Roster System:** Doctors check in for shifts daily via a fast touch/desktop kiosk. The system maintains real-time active rosters, historical date-specific records, and rolling 30-day cumulative rosters.
2. **Automated WhatsApp Daily Sheet Delivery:** Every morning at 8:00 AM Cairo time (05:00 UTC), the platform compiles an Excel (`.xlsx`) sheet featuring branded hospital headers, Arabic shift translations, and department breakdowns, delivering it natively to hospital management WhatsApp groups via Green-API.
3. **Inpatient Doctor Call Paging Hub:** Listens to inpatient nursing station call alerts via WhatsApp webhooks (Green-API), parses patient/room/specialty data, determines the active hospital shift, matches checked-in attending physicians, and automatically pages them in a target WhatsApp group using native phone `@mentions`.

---

## 1. High-Level Architecture & Tech Stack

```
                                      ┌─────────────────────────────────────────────────┐
                                      │              Doctor Check-In Kiosk              │
                                      │  (Vite + React 19 + Tailwind v4 + Lucide Icons) │
                                      └────────┬──────────────────────▲─────────────────┘
                                               │                      │
                                               ▼                      │
                                      ┌───────────────────────────────┴─────────────────┐
                                      │               Admin Control Suite               │
                                      │   (Roster · Database · Duplicates · Calls Hub)  │
                                      └────────────────┬────────────────────────────────┘
                                                       │
                                  HTTP REST / JSON     │
                                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Express Node.js Backend (`server.ts`)                                │
│                                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────┐  ┌────────────────┐  │
│  │ Check-In Controller   │  │ Doctor Directory &    │  │ WhatsApp Excel Daily   │  │ Doctor Call    │  │
│  │ & Historical Date API │  │ 20 Canonical Depts    │  │ Generator (ExcelJS)    │  │ Dispatcher     │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────┘  └───────▲────────┘  │
└────────────────────────────────────────┬───────────────────────────────────────────────────┼───────────┘
                                         │                                                   │
                 ┌───────────────────────┴────────────────────────┐                          │
                 ▼                                                ▼                          ▼
┌─────────────────────────────────┐              ┌─────────────────────────────────┐ ┌───────────────────┐
│     Primary Cloud Database      │              │      Local Fallback Cache       │ │ Green-API Gateway │
│      Supabase (PostgreSQL)      │◄── Failover ─┤         (JSON Storage)          │ │  (WhatsApp REST   │
│  (8 Tables with RLS & Indices)  │              │    (`data/*.json` or `/tmp`)    │ │    & Webhooks)    │
└─────────────────────────────────┘              └─────────────────────────────────┘ └───────────────────┘
```

### Core Technologies
- **Runtime & Language:** Node.js 22+, TypeScript 5.8 (ESM modules with `tsx` development runtime, `esbuild` for CJS production bundling).
- **Backend Framework:** Express 4.21 with Gzip compression (`compression`).
- **Frontend Framework:** React 19, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), Motion 12 (`motion`), Lucide Icons (`lucide-react`).
- **Excel Processing:** `exceljs` 4.4 (native formatting, styles, borders, base64 banner embedding) and `xlsx` 0.18.
- **Database & Cloud:** Supabase (`@supabase/supabase-js` 2.116, PostgreSQL with Row Level Security, Partial B-Tree indices).
- **Automation & Messaging:** Green-API (WhatsApp REST API + incoming webhook processing).
- **Hosting & Cron:** Vercel Serverless Functions (`api/index.ts` handler) + Vercel Cron.
- **Testing:** Vitest 5 with `@testing-library/react` and `jsdom` (68 automated unit & integration tests).

---

## 2. Core Functional Modules

### 2.1. Physician Check-in Kiosk (`/`)
- **Live Digital Hospital Clock:** Displays Cairo local time (`DD/MM/YYYY | HH:mm:ss AM/PM`) ticking live.
- **Physician ID Search & Barcode Input:**
  - Auto-strips prefixes like `emp.` / `emp` and whitespace.
  - Matches against 1,900+ precompiled and database-stored doctors.
  - Returns doctor profile card: Name (English & Arabic), ID, Department, and Phone Number.
- **Manual Registration Fallback:** If an unregistered physician checks in, the kiosk prompts for English name, Arabic name, and Department dropdown selection to register on the fly.
- **Shift Selection (1 to 3 shifts allowed):**
  - `Morning shift` (08:00 – 14:00)
  - `Long shift` (08:00 – 20:00)
  - `Evening shift` (14:00 – 20:00)
  - `Night shift` (20:00 – 08:00)
  - `24 shift` (24-hour continuous duty)
- **Check-in Confirmation:** Shows celebratory toast/card, updates today's live roster, and triggers an automatic 5-second form reset for the next incoming doctor.

### 2.2. Admin Control Suite (`isAdminMode = true`)
Protected by role-based passcodes:
- **`Mohanad`** ➔ Full Admin privileges (access to Roster, Database, Duplicates, Doctor Calls, Supabase Migrations, Clear Roster actions).
- **`coordinator`** ➔ Coordinator role (direct entry to Database and Doctor Calls views).

#### Tab 1: Attendance Roster (`adminTab === "roster"`)
- **Dual View Modes:**
  - **Daily Roster:** Today's active duty roster.
  - **Monthly Cumulative Roster:** Rolling 30-day attendance roster with FIFO sliding window.
- **Historical Date Picker:** Coordinators can jump to any previous calendar date (`YYYY-MM-DD`):
  - View historical check-in records for that specific date.
  - Add missing check-ins to past dates (`POST /api/checkins/by-date`).
  - Edit past check-in records (`PUT /api/checkins/by-date`) with option to sync changes back to master physician profiles.
  - Delete past check-ins (`DELETE /api/checkins/by-date/:id`).
- **Live Statistics KPI Cards:** Total present doctors, active departments, and shift distribution count.
- **Inline Row Management:** Edit doctor phone number on the fly, edit assigned shifts, or delete check-in.
- **Excel Roster Export:** One-click download of styled `.xlsx` reports for Daily or Monthly views.
- **WhatsApp Manual Dispatch:** Button to trigger immediate delivery of today's spreadsheet to the hospital management WhatsApp group.

#### Tab 2: Master Physician Database (`adminTab === "database"`)
- **Directory of ~1,900+ active physicians** across the 20 canonical medical specialties.
- **Faceted Filters & Search:** Search by English Name, Arabic Name, ID, or Phone, filtered by canonical department.
- **CRUD Operations:**
  - Add Custom Physician (`POST /api/doctors/upsert`).
  - Edit details (Name, Arabic Name, Specialty, Phone Number).
  - Delete Physician (`DELETE /api/doctors/delete/:id`) with soft-delete tombstone tracking.
  - Update Phone Number (`POST /api/doctors/phone`).

#### Tab 3: Duplicate Resolution & Data Hygiene (`adminTab === "duplicates"`)
- Intelligent algorithm identifying potential duplicates by:
  - Exact or bare numeric ID matches (`emp.123` vs `123`).
  - Name similarity (token-based comparison with Arabic diacritic normalization).
  - Matching mobile numbers.
- Bulk selection & batch deletion (`POST /api/doctors/delete-batch`) to clean legacy database conflicts.

#### Tab 4: Inpatient Doctor Calls Hub (`adminTab === "calls"`)
- Full audit log and real-time control room for ward doctor paging.
- **Live KPI Metric Cards:** Total Calls, Dispatched, No Doctor Present, Failed, Paused.
- **Calls Feed Table:** Displays Call Date/Time, Room, Bed, Department, Patient Name & Barcode, Admitting Physician, Caller Name, Dispatched Doctors (with @mentions and phones), and Status badges.
- **Operational Controls:**
  - **Manual Re-dispatch:** Re-evaluates active duty shifts and re-sends WhatsApp alerts for late-arriving doctors.
  - **Pause / Resume Automation:** Temporarily silence outgoing WhatsApp alerts while still logging calls.
  - **Status & Diagnostics:** Displays Green-API connection authorization, webhook URL, and group IDs.
  - **Send Test Alert:** Dispatches sample inpatient call alert to verify group permissions.
  - **Simulate Call:** In-browser modal to simulate incoming webhook payloads for testing.
  - **Dispatch Custom Call:** Manual composer to dispatch a custom inpatient call to any department.
  - **Audit Logs Drawer:** Displays raw incoming webhook logs and timestamps.

---

## 3. Medical Specialties Taxonomy (20 Canonical Specialties)

The system normalizes all raw department strings, typos, and Arabic text into **20 canonical inpatient hospital departments** (`src/data/specialties.ts`):

| # | Canonical Specialty | Included / Merged Variations |
|---|---|---|
| 1 | **Internal Medicine** | Pulmonology, Hematology, Endocrinology, Diabetes, Rheumatology, Hepatology, Geriatrics, Gastroenterology, Infectious Disease. |
| 2 | **General Surgery** | GIT Surgery, Bariatrics, Pediatric Surgery, Endocrine Surgery, Colorectal, Breast, Hand/Microsurgery, **Vascular Surgery**, **iVein**, Maxillofacial. |
| 3 | **ICU** | Critical Care, SICU, ICU Doctor, الحالات الحرجة. |
| 4 | **Emergency Medicine** | Emergency, ER Doctors, الطوارئ. |
| 5 | **Cardiology** | Heart Failure, Echo, Holter, Cardiac Rehab, Structural Heart, القسطرة, القلب والأوعية الدموية. |
| 6 | **Pediatrics** | General Pediatrics, Pediatric GIT, Pediatric Hematology, Pediatric Hepatology, Adolescent Psychology. |
| 7 | **Nephrology** | **Independent Specialty:** Dialysis, Renal Medicine, أمراض الكلى (Explicit doctor ID map included). |
| 8 | **Nutrition** | **Independent Specialty:** Clinical Nutrition, Sports Nutrition, Pediatric Nutrition, تغذية علاجية. |
| 9 | **Cardiothoracic Surgery** | Pediatric Cardiac Surgery, جراحة القلب والصدر. |
| 10 | **Urology** | Pediatric Urology, مسالك بولية. |
| 11 | **Orthopedic Surgery** | Pediatric Orthopedics, جراحة العظام. |
| 12 | **Neurosurgery** | Spine Surgery, جراحة المخ والأعصاب. |
| 13 | **Oncology** | Surgical Oncology, علاج الأورام. |
| 14 | **ENT** | Ear, Nose & Throat, Audiometry, الأنف والأذن والحنجرة. |
| 15 | **Obstetrics and gynecology** | 4D Fetal Ultrasound, Breast Feeding, النساء والتوليد. |
| 16 | **Radiology** | Interventional Radiology, X-Ray, CT, MRI, Ultrasound, الأشعة. |
| 17 | **Physiotherapy** | Physical Medicine, Pulmonary Rehab, العلاج الطبيعي. |
| 18 | **Anesthesiology & Pain Therapy** | Anesthesia Specialist, التخدير وعلاج الألم. |
| 19 | **Clinical Pharmacy** | Clinical Pharmacist, الصيدلة الإكلينيكية. |
| 20 | **OPD Coordinator** | Outpatient Clinic Coordinators. |
| + | **Home Care** | Home Visit / Supportive Inpatient Home Care. |

### Excluded Non-Inpatient Services (`is_active = false`)
`Dental`, `Dermatology & Cosmetology`, `Ophthalmology`, `Neurology`, `Pediatric Cardiology`, `Laboratory`, `Pharmacy Dispensing`, `Medical Records`. Filtered doctors never appear in kiosk autocomplete or search results.

---

## 4. Hospital Business Rules & Cairo Timezone (`Africa/Cairo`)

All operations strictly calculate against `Africa/Cairo` (UTC+2 standard / UTC+3 DST) to ensure consistency regardless of server host location:

### 4.1. Shift Windows & Overlap Rules
- **Morning shift:** `08:00 – 14:00` (8:00 AM – 2:00 PM)
- **Long shift:** `08:00 – 20:00` (8:00 AM – 8:00 PM) — qualifies as active across **both Morning and Evening**.
- **Evening shift:** `14:00 – 20:00` (2:00 PM – 8:00 PM)
- **Night shift:** `20:00 – 08:00` (8:00 PM – 8:00 AM next morning)
- **24 shift:** Continuous 24-hour coverage.

### 4.2. Strict Night Window Rule (20:00 – 08:00)
Any inpatient doctor call received between 8:00 PM and 8:00 AM Cairo time routes **exclusively** to physicians checked in for `Night shift` or `24 shift`. 
> [!IMPORTANT]
> Off-shift fallback to daytime or evening doctors is strictly prohibited during night hours to avoid waking off-duty staff.

### 4.3. Hospital Duty Date Reset (08:00 AM Cairo)
Hospital shift rosters reset daily at 08:00 AM. 
- Calls arriving between 00:00 (midnight) and 07:59 AM Cairo belong to the duty roster initiated on the previous calendar day.
- Daily check-in sheets cutoff at 18:30 (6:30 PM Cairo); check-ins logged after 19:00 belong to the next operational date.

---

## 5. WhatsApp & External Integrations

### 5.1. Green-API Integration (WhatsApp Gateway)
Green-API acts as the WhatsApp REST bridge for both inbound calls and outbound notifications.

- **Required Credentials:**
  - `GREEN_API_ID_INSTANCE`: Green-API Developer Instance ID.
  - `GREEN_API_API_TOKEN_INSTANCE`: Green-API API Token.
  - `WHATSAPP_GROUP_ID`: Destination group for the 8:00 AM Daily Sheet (`1203630xxxxxxxxxxx@g.us`).
  - `WHATSAPP_CALLS_SOURCE_GROUP_ID`: Source group monitored for nursing station calls.
  - `WHATSAPP_DOCTORS_TARGET_GROUP_ID`: Target group where on-duty doctors are paged and @mentioned.

#### Feature A: Automated Daily Sheet Delivery
1. **Trigger:** Triggered automatically at 05:00 UTC (8:00 AM Cairo) by Vercel Cron via `GET /api/cron/send-daily-sheet` (secured by `CRON_SECRET`), or manually via `POST /api/whatsapp/send-daily-sheet`.
2. **Sheet Compilation:** `ExcelJS` compiles the `.xlsx` workbook in memory with embedded hospital logo, high-res header banner, auto-fitted columns, thin borders, and department separators.
3. **Dispatch:** Dispatched to `WHATSAPP_GROUP_ID` using Green-API's `sendFileByUpload` endpoint with a morning summary caption.

#### Feature B: Inpatient Doctor Call Paging Webhook
1. **Webhook Endpoint:** `POST /api/whatsapp/webhook`
2. **Deduplication:** In-memory 48-hour TTL cache filters out duplicate messages or retry storms.
3. **Fallback Poller:** `runOpportunisticJournalPoll` checks the Green-API message journal to recover any messages dropped during serverless cold starts.
4. **Message Parsing Regex:**
   Extracts:
   - Category (`DoctorCall`, `استدعاء`, `Consultation`, `Urgent`)
   - Room number (`Room 325`, `غرفة 325`, `Bed 325`)
   - Department (`الجراحة العامة`, `Cardiology`, etc.)
   - Patient Name, Patient Barcode, Admitting Doctor, Caller Name
5. **Egyptian Phone Normalization:**
   Converts Egyptian mobile numbers (e.g. `01012345678`) to international WhatsApp format (`201012345678`). Mentions in WhatsApp groups require `@20XXXXXXXXXX`.
6. **Alert Format:**
```text
🚨 *INPATIENT DOCTOR CALL* 🚨
👨‍⚕️ Dr. @2010XXXXXXXX *[Doctor Name]*

📍 *Location:* Room *[Room Number]*
🩺 *Specialty:* [Canonical Specialty]
👤 *Patient:* [Patient Name]
📞 *Phone:* 010XXXXXXXX

⚡ _Please attend to the patient promptly._
```

---

## 6. Database Schema & Persistence Strategy

The system uses a **Dual Persistence Architecture**:
- **Primary:** Supabase PostgreSQL Database (persistent cloud state).
- **Secondary / Fallback:** Local JSON files in `./data/` (`checkins.json`, `monthly_checkins.json`, `custom_doctors.json`, `deleted_doctors.json`, `doctor_calls.json`, `call_automation_settings.json`). In serverless environments (Vercel), fallback files write to `/tmp/data/`.

### Supabase Database Tables (8 Tables)

```sql
-- 1. Master Doctors Database
public.doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Daily Active Check-ins (Attendance Roster)
public.checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL UNIQUE,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. Monthly Cumulative Check-ins (Rolling 30-day roster)
public.monthly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(doctor_id, checkin_date)
);

-- 4. Backward Compatibility Table
public.weekly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(doctor_id, checkin_date)
);

-- 5. Custom Doctor Overrides (Persisted custom additions / edits)
public.custom_doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    original_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 6. Custom Doctor Phone Overrides
public.custom_doctor_phones (
    id TEXT PRIMARY KEY,
    mobile_number TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 7. Deleted Doctors Blacklist (Tombstones)
public.deleted_doctors (
    id TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 8. Inpatient Ward Doctor Calls
public.doctor_calls (
    id TEXT PRIMARY KEY,
    call_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    room TEXT NOT NULL,
    department TEXT NOT NULL,
    raw_department TEXT,
    patient_name TEXT,
    patient_barcode TEXT,
    admitting_physician TEXT,
    caller_name TEXT,
    dispatched_doctors JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL, -- 'dispatched' | 'no_doctor_present' | 'failed' | 'paused'
    raw_message TEXT
);
```

---

## 7. Complete API Route Map

### 7.1. Kiosk & Doctor Lookups
- `GET /api/doctors`: Fetch all active physicians.
- `GET /api/doctors/search?q=query`: Fast token-indexed search for autocomplete suggestions.
- `GET /api/doctors/:id`: Exact doctor profile lookup by Employee ID.

### 7.2. Attendance & Roster CRUD
- `GET /api/checkins`: Get today's active check-ins.
- `POST /api/checkins`: Submit a doctor check-in (validates ID, shifts, updates master phone).
- `DELETE /api/checkins/:id`: Delete a doctor's check-in from today's active roster.
- `POST /api/checkins/clear`: Delete all check-ins from today's active roster.
- `GET /api/monthly-checkins`: Fetch rolling 30-day cumulative check-ins.
- `POST /api/checkins/clear-monthly`: Clear cumulative roster.
- `GET /api/checkins/dates`: Fetch list of all historical dates with check-in records.
- `GET /api/checkins/by-date?date=YYYY-MM-DD`: Fetch attendance records for a specific date.
- `POST /api/checkins/by-date`: Add a physician check-in to a specific historical date.
- `PUT /api/checkins/by-date`: Edit a physician check-in on a specific historical date.
- `DELETE /api/checkins/by-date/:id?date=YYYY-MM-DD`: Delete a check-in from a specific historical date.

### 7.3. Doctor Management & Phone Overrides
- `POST /api/doctors/phone`: Update master mobile number for a physician.
- `PUT /api/checkins/:id/phone`: Update phone number on an active check-in record.
- `POST /api/doctors/upsert`: Create or update custom physician profile.
- `DELETE /api/doctors/delete/:id`: Soft-delete physician and write tombstone.
- `POST /api/doctors/delete-batch`: Batch soft-delete multiple physicians.

### 7.4. Excel Reporting & WhatsApp Daily Sheet
- `GET /api/download/daily-sheet`: Generate and download today's `.xlsx` sheet.
- `GET /api/download/monthly-sheet`: Generate and download monthly rolling `.xlsx` sheet.
- `POST /api/whatsapp/send-daily-sheet`: Manual UI trigger to send today's `.xlsx` to WhatsApp.
- `GET /api/cron/send-daily-sheet`: Automated Vercel Cron trigger (secured by `CRON_SECRET`).
- `GET /api/whatsapp/status`: Check Green-API connectivity and configuration.

### 7.5. Doctor Calls Automation & Webhooks
- `POST /api/whatsapp/webhook`: Green-API incoming webhook receiver for ward calls.
- `GET /api/doctor-calls`: Query logged calls (supports date, department, status, and search filters).
- `POST /api/doctor-calls/:id/redispatch`: Re-evaluate active shift and re-dispatch alert.
- `GET /api/doctor-calls/status`: Detailed Green-API connectivity, source/target group status.
- `POST /api/doctor-calls/toggle-pause`: Pause or resume automated dispatching.
- `POST /api/doctor-calls/test-message`: Send test alert to target WhatsApp group.
- `POST /api/doctor-calls/set-webhook-url`: Configure Green-API webhook callback URL.
- `POST /api/doctor-calls/simulate-call`: Simulate incoming nurse call payload.
- `GET /api/doctor-calls/audit-logs`: Retrieve recent incoming webhook payloads.
- `POST /api/doctor-calls/preview`: Preview custom doctor call text and matching physicians.
- `POST /api/doctor-calls/send-custom`: Send custom doctor call to specific checked-in physicians.

### 7.6. Supabase Admin & Diagnostics
- `GET /api/supabase/status`: Check database connection, configuration, and table record counts.
- `POST /api/supabase/config`: Save Supabase URL and Key directly from UI.
- `POST /api/supabase/migrate`: Execute database schema migration and populate default tables.

---

## 8. Environment Variables Reference

| Variable | Required | Description / Example |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Google Gemini API key for AI assistant features. |
| `APP_URL` | Optional | Deployment URL for self-referential links / webhooks. |
| `SUPABASE_URL` | **Yes** (Prod) | Supabase project URL (`https://xyz.supabase.co`). |
| `SUPABASE_ANON_KEY` | **Yes** (Prod) | Supabase public anonymous API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase service role key (bypasses RLS). |
| `GREEN_API_ID_INSTANCE` | **Yes** (WhatsApp) | Green-API Instance ID (`1101xxxxxx`). |
| `GREEN_API_API_TOKEN_INSTANCE` | **Yes** (WhatsApp) | Green-API API Token (`d1f5e8xxxxxxxxxxxxxxxxxxxx`). |
| `WHATSAPP_GROUP_ID` | **Yes** (Daily Sheet) | Group ID receiving the 8:00 AM daily Excel sheet (`1203630xxxxxxxxxxx@g.us`). |
| `WHATSAPP_CALLS_SOURCE_GROUP_ID` | **Yes** (Calls) | Source group monitored for nurse call messages. |
| `WHATSAPP_DOCTORS_TARGET_GROUP_ID`| **Yes** (Calls) | Target group where on-duty doctors are alerted and tagged. |
| `CRON_SECRET` | Optional | Bearer token to protect `/api/cron/send-daily-sheet` on Vercel. |

---

## 9. Key Source Files & Codebase Map

| File Path | Purpose |
|---|---|
| `server.ts` | Monolithic Express backend with ExcelJS generator, API endpoints, and Supabase handlers. |
| `src/App.tsx` | Main frontend React application containing the Kiosk, Admin Dashboard, Modals, and Tables. |
| `src/services/doctorCallDispatcher.ts` | Modular WhatsApp webhook parser, shift resolver, phone normalizer, and dispatcher. |
| `src/data/specialties.ts` | 20 Canonical hospital specialties, Arabic normalizer, and department merge rules. |
| `src/utils/shifts.ts` | Shift definitions, Arabic shift labels (`مورنينج`, `لونج`, `نايت`), and ID comparators. |
| `src/utils/timezone.ts` | Cairo timezone calculations, day cutoff resets (18:30 / 19:00), and UTC conversions. |
| `src/db/supabase.ts` | Supabase client singleton with automatic PostgREST 1,000-row pagination support. |
| `scripts/supabase-schema.sql` | Production PostgreSQL migration script with RLS policies and partial B-Tree indices. |
| `vercel.json` | Vercel Serverless deployment routes and cron job definition (`0 5 * * *`). |
| `src/services/__tests__/` | Unit and integration test suites (shifts, timezone, doctor call dispatcher, deletion). |

---

## 10. Operational Guidelines for Future AI Agents

1. **Timezone Awareness:** Never use `new Date().getHours()` or `new Date().toISOString().split("T")[0]` directly for hospital business logic. Always route through `Africa/Cairo` helpers in `src/utils/timezone.ts` or `src/services/doctorCallDispatcher.ts`.
2. **Specialty Standardization:** Never introduce arbitrary new department names. All departments must be mapped to one of the 20 canonical medical specialties in `src/data/specialties.ts`.
3. **Dual Persistence Consistency:** Whenever creating or modifying API routes that alter physician attendance or profiles, update both Supabase and the corresponding local JSON file fallback.
4. **Phone Formatting:** WhatsApp @mentions only work when numbers begin with the country code `20` and contain no leading zero or spaces (use `toWhatsAppPhone(num)`).
5. **Night Shift Protection:** Do not alter the 20:00 – 08:00 strict Night Window rule. Daytime or Long-shift doctors must never be paged during the night window.
