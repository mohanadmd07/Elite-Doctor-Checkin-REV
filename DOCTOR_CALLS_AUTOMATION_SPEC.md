# Specification: WhatsApp Doctor Call Dispatcher & Admin Tracking

## 1. Executive Summary & Purpose
This system provides an end-to-end hospital ward call paging automation and administrative audit dashboard.
It listens via Green-API webhook to inpatient calls sent to a WhatsApp group, extracts call metadata (department, room, patient, etc.), matches the on-duty attending physician(s) currently checked in during the active shift (Cairo timezone), and tags them in a target WhatsApp group with a tailored mention.

All calls are logged in Supabase (`doctor_calls`) with local JSON fallback and monitored via a dedicated "Doctor Calls" tab in the Admin Panel with filtering, search, and one-click manual re-dispatch.

---

## 2. Decision Log

| Decision # | What Was Decided | Alternatives Considered | Why This Was Chosen |
| :--- | :--- | :--- | :--- |
| **DEC-006** | Modular service `src/services/doctorCallDispatcher.ts` | Monolithic `server.ts` code | Isolates WhatsApp webhook parsing and dispatch logic; makes unit testing straightforward without bloating `server.ts`. |
| **DEC-007** | In-memory message deduplication cache (15-min TTL) | No deduplication | Green-API occasionally retries webhooks on network timeouts; deduplication prevents paging doctors multiple times for the same call. |
| **DEC-008** | Supabase table `doctor_calls` + local JSON fallback | Supabase-only / in-memory only | Aligns with existing system architecture, ensuring local offline dev support and cloud persistence in production. |
| **DEC-009** | Multiline Regex with permissive room extraction | Strict line-by-line parsing | Handles varying room text layouts (e.g., `"Sub.Location: Room 325"` vs `"Bed: Bed 325"`). |
| **DEC-010** | Strict Cairo timezone (`Africa/Cairo`) calculation | Server host time (`UTC`) | Prevents cloud server clock drift from misidentifying active shifts. |
| **DEC-011** | Clean `@20XXXXXXXXXX` mention format | Raw 11-digit Egyptian local number | WhatsApp group mentions only work when using international country code (`20`). |
| **DEC-012** | Multi-doctor combined notification | Separate messages per doctor | Prevents spamming the group chat when multiple doctors from one department are on duty. |
| **DEC-013** | Dual persistence (Supabase + local JSON) | In-memory only | Persists calls across server restarts and provides audit trails. |
| **DEC-014** | One-click Re-dispatch action | Read-only table | Allows coordinators to re-page doctors if a doctor checks in late or misses the original call. |

---

## 3. Architecture & Data Flow

```
[Green-API Webhook Trigger] (POST /api/whatsapp/webhook)
          │
          ▼
[Deduplication Guard] ──(Already processed?)──► Return 200 OK
          │
          ▼
[DoctorCall Parser]
(Matches Category: DoctorCall, Room, Dept, Patient)
          │
          ▼
[Cairo Shift & Check-In Matcher]
(Evaluates active shift in Africa/Cairo: Long, Evening, or Night)
(Queries today's checked-in doctors for matching department & shift)
          │
   ┌──────┴─────────────────────────────────┐
   ▼ (Doctor(s) Present)                    ▼ (No Doctor Checked In)
[Green-API REST Dispatcher]            [Silent Error Logger]
(Dispatches formatted mention alert)   (Sets status to 'no_doctor_present')
   │                                        │
   └───────────────────┬────────────────────┘
                       ▼
             [Persistence Layer]
        (Upserts into Supabase `doctor_calls`
         & writes to data/doctor_calls.json)
                       │
                       ▼
             [Admin Panel Frontend]
        ("Doctor Calls" Tab: KPI Cards,
         Filter, Search, Status Badges, Re-dispatch)
```

---

## 4. Shift & Timezone Rules (Africa/Cairo)
* **Long shift:** 09:00 – 21:00 (9:00 AM – 9:00 PM)
* **Evening shift:** 15:00 – 23:00 (3:00 PM – 11:00 PM)
* **Night shift:** 23:00 – 09:00 (11:00 PM – 9:00 AM)
* **Overlap Behavior:** During 15:00 – 21:00, doctors checked in for either `Long shift` or `Evening shift` qualify as present.

---

## 5. WhatsApp Alert Message Format

```text
🚨 *INPATIENT DOCTOR CALL* 🚨
👨‍⚕️ Dr. @20XXXXXXXXXX *[Doctor Name]*

📍 *Location:* Room *[Room Number]*
🩺 *Specialty:* [Speciality]
📞 *Phone:* [Doctor Phone number]

⚡ _Please attend to the patient promptly._
```

---

## 6. Environment Variables Required

```env
# Source WhatsApp group being monitored for calls
WHATSAPP_CALLS_SOURCE_GROUP_ID="1203630xxxxxxxxxxx@g.us"

# Target WhatsApp group where doctors are mentioned/alerted
WHATSAPP_DOCTORS_TARGET_GROUP_ID="1203630xxxxxxxxxxx@g.us"

# Green-API credentials
GREEN_API_ID_INSTANCE=""
GREEN_API_API_TOKEN_INSTANCE=""
```

---

## 7. Supabase Database Migration

```sql
CREATE TABLE IF NOT EXISTS public.doctor_calls (
  id TEXT PRIMARY KEY,
  call_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  room TEXT NOT NULL,
  department TEXT NOT NULL,
  raw_department TEXT,
  patient_name TEXT,
  patient_barcode TEXT,
  admitting_physician TEXT,
  caller_name TEXT,
  dispatched_doctors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL, -- 'dispatched' | 'no_doctor_present' | 'failed'
  raw_message TEXT
);

ALTER TABLE public.doctor_calls ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.doctor_calls TO anon, authenticated, service_role;

CREATE POLICY "Public access to doctor_calls" ON public.doctor_calls
  FOR ALL TO public USING (true) WITH CHECK (true);
```
