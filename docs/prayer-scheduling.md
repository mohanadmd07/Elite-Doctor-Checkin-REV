# Muslim Prayer-Time Notifications Scheduling Guide (Alexandria, Egypt)

This system provides automated prayer time notifications for Alexandria, Egypt sent to configured WhatsApp groups via Green-API.

> **Important**: This application runs on the **Vercel Hobby (free)** plan. Vercel Hobby accounts do not support sub-daily cron jobs, and cron triggers can drift by up to an hour. Therefore, scheduling is handled via **cron-job.org** (free, exact-minute scheduling with native IANA timezone support). Do **NOT** add sub-daily cron entries to `vercel.json`.

---

## 1. Primary Scheduler Setup (cron-job.org)

### Prerequisites
- Production app URL (e.g., `https://your-hospital-domain.vercel.app`)
- The `CRON_SECRET` configured in your Vercel Project Environment Variables.
- `PRAYER_NOTIFICATIONS_ENABLED=true` set in your Vercel Project Environment Variables.

---

### Step 1: Create an Account
1. Visit [cron-job.org](https://cron-job.org/) and create a free account.
2. Confirm your email address and log in to the console.

---

### Step 2: Configure Job 1 — "Prayer weekly fetch" (Weekly on Friday at 06:00 AM Africa/Cairo)
1. In the cron-job.org dashboard, click **"Create cronjob"**.
2. Set the following fields:
   * **Title**: `Prayer weekly fetch (Alexandria)`
   * **URL**: `https://<YOUR_PRODUCTION_DOMAIN>/api/prayer/fetch`
   * **Request Method**: `GET`
   * **Schedule**:
     * Execution mode: **User-defined** / **Days of week**:
     * Select **Friday**
     * Time: **06:00** (6:00 AM)
     * Cron expression equivalent: `0 6 * * 5`
     * **Timezone**: Select `Africa/Cairo` (ensures automatic compliance with Egypt Daylight Saving Time / DST)
   * **Advanced Settings**:
     * **Request Timeout**: `30` seconds
     * **Request Headers**:
       * Click **"Add header"**
       * Name: `Authorization`
       * Value: `Bearer <YOUR_CRON_SECRET>`
     * **Failure Notifications**: Enable notifications on failure to receive an email alert if the endpoint returns an error.
3. Click **"Create"**.
*(Note: Each run pre-fetches 8 days in advance, covering Friday through next Friday inclusive to prevent gaps for early morning Fajr).*

---

### Step 3: Configure Job 2 — "Prayer dispatch" (Every 1 Minute Africa/Cairo)
1. Click **"Create cronjob"**.
2. Set the following fields:
   * **Title**: `Prayer dispatch (Alexandria)`
   * **URL**: `https://<YOUR_PRODUCTION_DOMAIN>/api/prayer/dispatch`
   * **Request Method**: `GET`
   * **Schedule**:
     * Execution mode: **Every 1 minute** (`* * * * *`)
     * **Timezone**: Select `Africa/Cairo`
   * **Advanced Settings**:
     * **Request Timeout**: `30` seconds
     * **Request Headers**:
       * Click **"Add header"**
       * Name: `Authorization`
       * Value: `Bearer <YOUR_CRON_SECRET>`
     * **Failure Notifications**: Enable notifications on consecutive failures.
3. Click **"Create"**.

---

## 2. First-Day Verification & End-to-End Testing

Once both jobs are created and your environment variables are configured, execute these 3 verification steps:

### 1. Manual Force Fetch
Trigger an immediate fetch of the upcoming week's prayer times (bypassing the Friday 06:00 AM guard):
```bash
curl -i -X GET "https://<YOUR_PRODUCTION_DOMAIN>/api/prayer/fetch?force=1" \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
```
**Expected Response:**
```json
{
  "success": true,
  "data": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "daysCount": 8,
    "timingsByDate": { ... }
  }
}
```
```

### 2. Verify Status
Inspect the cached times and notification statuses:
```bash
curl -i -X GET "https://<YOUR_PRODUCTION_DOMAIN>/api/prayer/status" \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
```
**Expected Response:**
* `enabled`: `true`
* `cairo_now`: current date and time in Cairo
* `configured_groups_count`: 1 (or matching number of groups in `WHATSAPP_GROUP_ID`)
* `today.times`: 5 records (Fajr, Dhuhr, Asr, Maghrib, Isha)

### 3. Send Test Notification
Send a live test message to verify Green-API delivery to WhatsApp:
```bash
curl -i -X POST "https://<YOUR_PRODUCTION_DOMAIN>/api/prayer/test" \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"prayer":"Dhuhr","time":"12:00"}'
```
**Expected Delivery:**
Your WhatsApp group receives:
```text
[TEST] 🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية
🕐 12:00
```

---

## 3. Architecture & Safety Details

1. **Self-Healing:** If `dispatch` runs and finds that today or tomorrow are missing from `prayer_times` (e.g. database cleared or first boot), it automatically triggers `fetch` before dispatching.
2. **Tolerance Window:** The dispatcher only fires if the current Cairo time is within `0 to +2 minutes` of the scheduled prayer. It will **never** send a missed prayer that is older than 2 minutes.
3. **Atomic Deduplication:** A Conditional Compare-And-Swap (CAS) update (`status = 'pending' -> 'sending'`) prevents duplicate messages even if overlapping cron jobs run concurrently.
4. **Existing Cron Untouched:** The existing Vercel daily sheet cron (`0 5 * * *` in `vercel.json`) remains completely independent and untouched.

---

## 4. Optional Fallback: GitHub Actions (Documented Only)

> **Note**: This fallback is documented for reference only and is **not enabled by default**. GitHub Actions scheduled workflows are best-effort and often queue with variable delays (often 3 to 15 minutes late). Because of this latency, GitHub Actions cannot guarantee the `0 to +2 minute` exact-time window required for azan dispatch. However, our atomic CAS claim logic ensures that even if both schedulers run, duplicate messages are prevented.

```yaml
# .github/workflows/prayer-dispatch-fallback.yml (EXAMPLE ONLY - DO NOT ENABLE BY DEFAULT)
name: Prayer Dispatch Fallback
on:
  schedule:
    - cron: '* * * * *'
  workflow_dispatch:

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Prayer Dispatch
        run: |
          curl -s -f -X GET "${{ secrets.PROD_APP_URL }}/api/prayer/dispatch" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```
