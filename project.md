# Staff Scheduling & Burnout Monitor
## Healthcare & Life Sciences Hackathon — Project Spec

---

## Problem Statement

Clinician burnout is one of healthcare's most urgent crises. Nurses and physicians face unpredictable manually-built schedules, no early warning system for burnout, and reactive staffing fixes that arrive too late. HR and charge nurses spend hours weekly just building schedules with no intelligent support.

This system shifts healthcare staffing from **reactive to predictive** using a multi-agent AI pipeline.

---

## Solution Overview

An agentic AI platform that:
1. Forecasts patient demand 24–72 hours in advance
2. Optimizes staff scheduling against that forecast
3. Monitors individual burnout risk in real time using live workload data
4. Recommends proactive interventions before problems escalate
5. Provides role-based dashboards for HR, charge nurses, and individual clinicians
6. Allows charge nurses to view, edit, and AI-optimize schedules up to 2 weeks in advance
7. Sends real-time SMS alerts via Twilio for critical staffing gaps

---

## Agent Architecture

All agents are powered by **IBM Watsonx AI** (`ibm/granite-3-8b-instruct` by default, configurable via `WATSONX_MODEL_ID`). The original spec called for Anthropic Claude — this was switched to IBM Watsonx to align with IBM's hackathon platform and enterprise healthcare tooling.

### Agent 1 — Demand Forecasting Agent
- **Input:** Historical census data (last 30 days with day-of-week averages), upcoming scheduled procedures
- **Output:** Patient volume forecast per unit for next 24–72 hours (`unit`, `date`, `predictedCensus`, `requiredStaff`)
- **Note:** `scheduledStaff` and `gapFlag` are computed deterministically in the orchestrator — the LLM does not guess real roster counts

### Agent 2 — Schedule Optimization Agent
- **Input:** Demand forecast from Agent 1, staff availability, labor rules (max consecutive shifts, required rest periods, required certifications per unit)
- **Output:** Optimized draft schedule with flagged staffing gaps
- **Note:** Gap detection has been moved to a deterministic computation in the orchestrator for reliability

### Agent 3 — Burnout Risk Monitor
- **Input:** Individual staff metrics (shifts last 14 days, hours last 30 days, night shift ratio, days since last PTO, wellness check-in score)
- **Output:** Burnout risk score per staff member (green / yellow / red) with contributing factors in plain language, including `role` and `unit` fields for downstream use
- **Note:** Burnout risk is NOT hardcoded in seed data — computed dynamically either by Agent 3 (after orchestrator runs) or by a live scoring algorithm in the frontend

### Agent 4 — Intervention Recommendation Agent
- **Input:** Burnout risk flags from Agent 3 (yellow/red only) and deterministic staffing gaps from orchestrator
- **Output:** Concrete action recommendations ranked by urgency (critical / high / medium / low)
- **Prompt improvements:** Includes an explicit AT-RISK STAFF ROSTER with real names/IDs; hard prohibition on invented placeholder names (no "Jane Doe"); requires at least one recommendation per red-risk member and per staffing gap

### Agent 5 — Future Schedule Optimizer (new)
- **Input:** Draft future schedule for a given date, pending patients needing appointments, full staff roster
- **Output:** `scheduleUpdates` (shift type changes), `patientAssignments` (patient → staff with suggested time), `summary`, `suggestions`
- **Invoked by:** `POST /api/optimize-future?date=YYYY-MM-DD` from the Edit Schedule panel

### Orchestrator
- Runs all four agents in sequence on demand (triggered via `POST /api/orchestrator/run`)
- **Deterministic gap computation:** `computeGaps()` compares `requiredStaff` vs active roster per unit directly — no LLM guessing
- Stamps `scheduledStaff` and `gapFlag` onto each forecast object so the UI always shows accurate gap badges
- Aggregates outputs into a digest returned to the caller and stored in memory
- Triggers SMS alerts via Twilio for critical interventions and large staffing gaps (shortfall ≥ 2)

---

## Key Features

- **Live Burnout Risk Scoring** — Risk is computed dynamically from workload factors (night shift ratio, hours worked, PTO gap, wellness score, shifts in 14 days). Labeled "AI scored" after Agent 3 runs, "Live estimate" before
- **Today's Schedule View** — Color-coded shift badges (day/evening/night/absent), live hours worked calculated from shift start/end times (all displayed to 2 decimal places), burnout risk per staff member
- **Timeline View** — Toggle between Table and Timeline views on the Schedule & Forecast screen. Displays a 0–24h horizontal shift bar chart per staff member, grouped by unit, with a red "now" line for today. Supports date navigation (◀ date ▶) across historical, today, and future dates
- **Edit Schedule Panel** — Slide-up panel for editing future schedules (today+1 through today+14). Features: change shift type, mark absent, add/remove staff, assign pending patients to staff, and one-click AI optimization
- **AI-Assisted Future Scheduling** — "Optimize with AI" button in the Edit Panel calls Agent 5 to suggest shift changes and assign pending patients to available staff based on unit, priority, and burnout risk
- **Pending Patients Dataset** — 20 synthetic patients across 3 units awaiting appointments, each with priority (urgent/high/medium/low), reason for visit, and `dateNeededBy`
- **14-Day Future Schedule** — Seeded with one schedule entry per staff member per day (280 entries) from today+1 through today+14; fully editable via the Edit Panel
- **Predictive Staffing Alerts** — Forward-looking warnings surfaced after running the AI pipeline (e.g., "ICU-2 is understaffed Friday night")
- **One-Click Intervention Approval** — Agent 4 suggests a fix; charge nurse approves directly in the dashboard
- **Swap & Send Home** — HR can swap a tired staff member's appointments to an available colleague. Sent-home staff are removed from the tired wheel and moved to an "Off Shift" section. State persists across page navigations via `localStorage`
- **Cross-Screen State Sync** — Sent-home staff list is shared between HR Dashboard and Schedule & Forecast via `localStorage`. Changes on one screen are reflected on the other without a page reload
- **Live Clock** — Real-time clock displayed on HR Dashboard and Schedule & Forecast screens
- **Live Hours Calculation** — Hours worked calculated dynamically from shift start/end times, including overnight shifts (e.g., 19:00–07:00). Updated every 60 seconds
- **Patient & Appointment Tracking** — 18 synthetic patients across 3 units with appointments, assigned nurses/doctors, and real-time status updates
- **Mark Complete Persistence** — Completed appointments remain marked across navigation within the Doctor/Nurse Dashboard session
- **Wellness Check-In API** — Staff submit a self-reported wellness score (1–5) that feeds into the burnout model
- **Role-Based Login** — Three access levels: admin/HR → HR Dashboard, charge nurse → Nurse Dashboard (same layout as Doctor Dashboard with role-appropriate title), staff → Doctor Dashboard

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (served by Express) |
| AI Agents | IBM Watsonx AI — `@ibm-cloud/watsonx-ai` SDK |
| Default Model | `ibm/granite-3-8b-instruct` (configurable) |
| Agent Orchestration | Node.js + Express |
| Database | In-memory store (production: Firebase Firestore or PostgreSQL) |
| Notifications | Twilio (SMS alerts for critical staffing gaps) |
| Auth | Session-based via `localStorage` (production: Firebase Auth) |
| Demo Data | Fully randomized synthetic data generated on server startup |

> **Why IBM Watsonx?** Switched from the original Anthropic Claude spec to IBM Watsonx AI to align with IBM's healthcare hackathon platform, enterprise compliance requirements, and the IBM Granite model family which is optimized for structured JSON output tasks.

---

## File Structure

```
Health_project/
├── agents/
│   ├── orchestrator.js         # Runs all 4 agents, deterministic gap computation, Twilio SMS
│   ├── demandForecast.js       # Agent 1 — 72-hour patient demand forecast
│   ├── scheduleOptimizer.js    # Agent 2 — shift schedule optimization; also exports runFutureOptimizer (Agent 5)
│   ├── burnoutMonitor.js       # Agent 3 — burnout risk scoring per staff member
│   └── interventionAdvisor.js  # Agent 4 — ranked intervention recommendations with explicit staff roster
├── config/
│   └── watsonx.js              # IBM Watsonx AI client + generateText() + parseJSON()
├── data/
│   ├── schema.js               # Data models + factory functions + in-memory store
│   │                           #   includes: createPendingPatient, createScheduleEntry
│   │                           #   store includes: futureSchedule[], pendingPatients[]
│   └── seedData.js             # Synthetic data for Riverside General hospital
│                               #   includes: realisticPatientLoad (day-of-week + unit spikes),
│                               #             seedFutureSchedule (14 days × all staff = 280 entries),
│                               #             seedPendingPatients (20 patients with priorities)
├── api/
│   └── routes.js               # All REST API endpoints (see API Reference below)
├── screens/
│   ├── Login.html              # Login page — charge_nurse → doctor.html, admin → hr.html
│   ├── hr.html                 # HR Dashboard — tired staff wheel, Swap & Send Home, Off Shift section, live clock
│   ├── schedule.html           # Schedule grid + Timeline view + Edit Panel + AI forecast + interventions
│   └── doctor.html             # Clinician view — "Doctor Dashboard" or "Nurse Dashboard" by role
├── server.js                   # Express entry point — seeds data, serves screens + API
├── .env.example                # Environment variable template
├── .gitattributes              # Line ending normalization
└── package.json
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Liveness check + last orchestrator run timestamp |
| POST | `/api/orchestrator/run` | Triggers full 4-agent pipeline, returns digest |
| GET | `/api/staff` | All staff members |
| GET | `/api/staff/:id` | Single staff member + latest burnout score |
| GET | `/api/forecasts` | All demand forecasts from Agent 1 |
| GET | `/api/schedule` | Optimized schedule from Agent 2 |
| GET | `/api/burnout` | Burnout scores sorted red → yellow → green |
| GET | `/api/interventions` | All intervention recommendations sorted by urgency |
| GET | `/api/interventions/pending` | Unapproved interventions only |
| POST | `/api/interventions/:id/approve` | Approve an intervention |
| GET | `/api/today-schedule` | Today's schedule entries (optional `?unit=`) |
| GET | `/api/patients` | All patients (optional `?unit=`) |
| GET | `/api/appointments` | All appointments (optional `?unit=`, `?staffId=`, `?status=`) |
| PATCH | `/api/appointments/:id/status` | Update appointment status |
| POST | `/api/auth/login` | Authenticate user, returns user record |
| POST | `/api/checkin/:staffId` | Submit wellness score (1–5) |
| GET | `/api/timeline?date=` | Shift entries for timeline view (today, future, or historical) |
| GET | `/api/future-schedule?date=` | Future schedule entries for a date |
| POST | `/api/future-schedule` | Add a staff member to a future date |
| PATCH | `/api/future-schedule/:id` | Update shift type or status |
| DELETE | `/api/future-schedule/:id` | Remove a future schedule entry |
| GET | `/api/pending-patients` | Pending patients (optional `?unit=`, `?scheduled=false`) |
| PATCH | `/api/pending-patients/:id` | Assign/schedule a pending patient |
| POST | `/api/optimize-future?date=` | Run Agent 5 on draft future schedule for a date |

---

## Data Models

### Staff Member
```json
{
  "id": "string",
  "name": "string",
  "role": "RN | NP | MD | CNA",
  "unit": "string",
  "certifications": ["string"],
  "shiftsLast14Days": "number (0–14, randomized)",
  "hoursLast30Days": "number (0–360, randomized)",
  "nightShiftRatio": "number (0.00–1.00, randomized)",
  "daysSinceLastPTO": "number (1–365, randomized)",
  "wellnessScore": "number (1–5, derived from workload factors)",
  "burnoutRisk": "null | green | yellow | red"
}
```

### Daily Schedule Entry (Today)
```json
{
  "id": "string",
  "staffId": "string",
  "staffName": "string",
  "role": "string",
  "unit": "string",
  "date": "YYYY-MM-DD",
  "shiftType": "day | evening | night",
  "shiftStart": "HH:MM",
  "shiftEnd": "HH:MM",
  "hoursWorkedToday": "number",
  "patientLoad": "number",
  "status": "scheduled | on_shift | completed | absent"
}
```

### Future Schedule Entry
```json
{
  "id": "string",
  "staffId": "string",
  "staffName": "string",
  "role": "string",
  "unit": "string",
  "date": "YYYY-MM-DD",
  "shiftType": "day | evening | night",
  "shiftStart": "HH:MM",
  "shiftEnd": "HH:MM",
  "status": "scheduled | absent"
}
```

### Pending Patient
```json
{
  "id": "string",
  "name": "string",
  "dob": "YYYY-MM-DD",
  "unit": "string",
  "reason": "string",
  "priority": "urgent | high | medium | low",
  "notes": "string",
  "dateNeededBy": "YYYY-MM-DD",
  "scheduled": "boolean",
  "assignedStaffId": "string | null",
  "scheduledDate": "string | null",
  "scheduledTime": "string | null"
}
```

### Patient
```json
{
  "id": "string",
  "name": "string",
  "dob": "YYYY-MM-DD",
  "room": "string",
  "unit": "string",
  "admittedDate": "YYYY-MM-DD",
  "diagnosis": "string",
  "assignedNurseId": "string",
  "assignedDoctorId": "string",
  "acuityLevel": "low | medium | high | critical"
}
```

### Appointment
```json
{
  "id": "string",
  "patientId": "string",
  "patientName": "string",
  "type": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "unit": "string",
  "room": "string",
  "assignedStaffId": "string",
  "status": "scheduled | in_progress | completed | cancelled",
  "notes": "string"
}
```

### Forecast
```json
{
  "unit": "string",
  "date": "ISO string",
  "predictedCensus": "number",
  "requiredStaff": "number",
  "scheduledStaff": "number (stamped by orchestrator, not LLM)",
  "gapFlag": "boolean (stamped by orchestrator, not LLM)"
}
```

### User (Login)
```json
{
  "id": "string",
  "loginId": "string",
  "password": "string (plain text — demo only)",
  "role": "staff | charge_nurse | admin",
  "staffId": "string | null",
  "name": "string",
  "unit": "string"
}
```

---

## Burnout Risk Scoring Logic

Burnout risk is computed using a point-based scoring system applied to each staff member's workload metrics. This runs live in the frontend before Agent 3 has scored them, and is replaced by Agent 3's result after the orchestrator runs.

| Factor | Moderate (+1–2 pts) | High (+2–3 pts) |
|---|---|---|
| Hours worked today | 6–7.9 hrs | 10+ hrs |
| Night shift ratio | 40–69% | 70%+ |
| Days without PTO | 30–59 days | 60+ days |
| Wellness score | 3/5 | 1–2/5 |
| Shifts in 14 days | 7–8 | 9+ |

- **Score ≥ 5** → Red (high risk)
- **Score 2–4** → Yellow (moderate risk)
- **Score 0–1** → Green (low risk)

---

## Historical Data Generation

`seedData.js` uses a `realisticPatientLoad(unit, dateIso)` function to produce historically plausible census numbers:

- **Day-of-week multipliers:** Monday–Wednesday busiest (1.15–1.2×), Saturday–Sunday slowest (0.75–0.8×)
- **Week-of-month multipliers:** Weeks 1–2 busier (1.1–1.15×), weeks 3–4 slower (0.9–0.95×)
- **Unit-specific spikes:** ICU-1 Monday cardiac cath surge, ICU-2 Wednesday thoracic procedures, MedSurg-3 Friday elective admissions

This data feeds Agent 1 so its demand forecasts reflect real-world hospital patterns rather than flat random numbers.

---

## Demo Flow

1. Start the server — 20 staff members, 18 patients, 280 future schedule entries, and 20 pending patients load automatically
2. Log in as `admin` / `Admin@789` → lands on HR Dashboard
3. Open **Schedule & AI Forecast** — view today's schedule with live burnout risk and live hours per staff member
4. Toggle to **Timeline View** — see 0–24h shift bars for all staff; use ◀ ▶ to navigate dates
5. Navigate to a future date → **Edit Schedule** button appears
6. Open the **Edit Panel** — adjust shift types, mark absences, assign pending patients
7. Click **Optimize with AI** — Agent 5 suggests shift changes and patient assignments
8. Click **Save** to persist changes
9. Back on today: click **Run AI Analysis** — watch all 4 agents run via IBM Watsonx
10. Review demand forecasts, staffing gaps, and ranked intervention recommendations
11. Approve an intervention with one click
12. Switch to the **HR Dashboard** — see tired staff in the wheel, view their appointments
13. Use **Swap & Send Home** — system validates whether a swap is possible; sent-home staff move to the Off Shift section
14. Switch back to Schedule & Forecast — sent-home staff show as "Off Shift" (state shared via `localStorage`)
15. Log out and log back in as a charge nurse (`charge_nurse` role) → lands on **Nurse Dashboard**
16. View personal shift and appointments; mark an appointment complete

---

## Hackathon Narrative

> "A charge nurse shouldn't find out their unit is short-staffed at 6am when the shift starts. And a nurse shouldn't burn out before anyone notices the warning signs. This system sees both problems coming — days in advance — and gives managers the tools to act before it becomes a crisis."

---

## Responsible AI Notes

- No real patient or staff data used — all data is randomly generated on server startup
- Burnout scores are advisory, not punitive — designed to help managers support staff
- All AI recommendations require human approval before any action is taken
- Transparent explainability: every risk score shows its contributing factors
- Agent 4 prompt explicitly prohibits invented names — all recommendations reference real staff IDs from the roster
- IBM Watsonx Granite models used in alignment with enterprise AI governance standards
