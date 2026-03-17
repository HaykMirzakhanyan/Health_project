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

---

## Agent Architecture

All agents are powered by **IBM Watsonx AI** (`ibm/granite-3-8b-instruct` by default, configurable via `WATSONX_MODEL_ID`). The original spec called for Anthropic Claude — this was switched to IBM Watsonx to align with IBM's hackathon platform and enterprise healthcare tooling.

### Agent 1 — Demand Forecasting Agent
- **Input:** Historical census data, seasonal patterns, day-of-week trends, upcoming scheduled procedures
- **Output:** Patient volume forecast per unit for next 24–72 hours
- **Prompt goal:** Analyze patterns and return a structured staffing demand forecast as JSON

### Agent 2 — Schedule Optimization Agent
- **Input:** Demand forecast from Agent 1, staff availability, labor rules (max consecutive shifts, required rest periods, required certifications per unit)
- **Output:** Optimized draft schedule with flagged staffing gaps
- **Prompt goal:** Generate a schedule that satisfies labor constraints while meeting forecasted demand

### Agent 3 — Burnout Risk Monitor
- **Input:** Individual staff metrics (shifts last 14 days, hours last 30 days, night shift ratio, days since last PTO, wellness check-in score)
- **Output:** Burnout risk score per staff member (green / yellow / red) with contributing factors in plain language
- **Prompt goal:** Score burnout risk and surface the top contributing factors
- **Note:** Burnout risk is NOT hardcoded in seed data — it is computed dynamically either by Agent 3 (after orchestrator runs) or by a live scoring algorithm in the frontend that factors in today's hours worked

### Agent 4 — Intervention Recommendation Agent
- **Input:** Burnout risk flags from Agent 3 and staffing gap alerts from Agent 2
- **Output:** Concrete action recommendations (e.g., offer shift swap, recommend PTO, redistribute workload, alert charge nurse) ranked by urgency
- **Prompt goal:** Given a risk flag or gap, suggest the 1–3 most actionable interventions ranked by impact

### Orchestrator
- Runs all four agents in sequence on demand (or daily cadence)
- Aggregates outputs into a digest returned to the caller and stored in memory
- Surfaces highest-urgency flags at the top
- Triggers real-time SMS alerts for critical gaps via Twilio

---

## Key Features

- **Live Burnout Risk Scoring** — Risk is computed dynamically from workload factors (night shift ratio, hours worked, PTO gap, wellness score, shifts in 14 days). Labeled "AI scored" after Agent 3 runs, "Live estimate" before
- **Today's Schedule View** — Color-coded shift badges (day/evening/night/absent), hours worked with green/yellow/red coloring, and live burnout risk per staff member
- **Predictive Staffing Alerts** — Forward-looking warnings surfaced after running the AI pipeline (e.g., "ICU-2 is understaffed Friday night")
- **One-Click Intervention Approval** — Agent suggests a fix, charge nurse approves directly in the dashboard
- **Swap & Send Home** — HR can swap a tired staff member's appointments to an available colleague; the system validates whether a swap is possible before confirming
- **Patient & Appointment Tracking** — 18 synthetic patients across 3 units with appointments, assigned nurses/doctors, and real-time status updates
- **Wellness Check-In API** — Staff submit a self-reported wellness score (1–5) that feeds into the burnout model
- **Role-Based Login** — Three access levels: admin/HR, charge nurse, and staff. Each role redirects to the appropriate dashboard

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
│   ├── orchestrator.js         # Runs all 4 agents, sends Twilio SMS for critical alerts
│   ├── demandForecast.js       # Agent 1 — 72-hour patient demand forecast
│   ├── scheduleOptimizer.js    # Agent 2 — shift schedule optimization + gap detection
│   ├── burnoutMonitor.js       # Agent 3 — burnout risk scoring per staff member
│   └── interventionAdvisor.js  # Agent 4 — ranked intervention recommendations
├── config/
│   └── watsonx.js              # IBM Watsonx AI client + generateText() + parseJSON()
├── data/
│   ├── schema.js               # Data models + factory functions + in-memory store
│   └── seedData.js             # Randomized synthetic data for Riverside General hospital
├── api/
│   └── routes.js               # All REST API endpoints
├── screens/
│   ├── Login.html              # Login page — authenticates via /api/auth/login
│   ├── hr.html                 # HR / Charge Nurse dashboard — tired staff wheel, summaries
│   ├── schedule.html           # Schedule grid + AI forecast + intervention approvals
│   └── doctor.html             # Individual clinician view — their shift, appointments
├── server.js                   # Express entry point — seeds data, serves screens + API
├── .env.example                # Environment variable template
├── .gitattributes              # Line ending normalization
└── package.json
```

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

### Daily Schedule Entry
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
  "scheduledStaff": "number",
  "gapFlag": "boolean"
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

## Agent Prompt Templates

### Demand Forecasting Agent
```
You are a healthcare demand forecasting agent.
Given the following historical census data and upcoming scheduled procedures,
forecast the expected patient volume for each unit over the next 72 hours.
Return a JSON array of forecast objects with: unit, date, predictedCensus, requiredStaff.

Historical data: {{historicalData}}
Upcoming procedures: {{scheduledProcedures}}
```

### Schedule Optimization Agent
```
You are a healthcare schedule optimization agent. Given the following demand
forecasts and staff availability, generate an optimized shift schedule.
Apply these labor rules: max 5 consecutive shifts, minimum 8 hours rest between shifts,
match required certifications per unit. Flag any scheduling gaps.
Return a JSON object with: schedule (array of shift assignments) and gaps (array of shortfalls).
```

### Burnout Monitor Agent
```
You are a clinician burnout risk assessment agent.
Given the following staff metrics, calculate a burnout risk score for each staff member.
Return green (low risk), yellow (moderate risk), or red (high risk) with the
top 2-3 contributing factors in plain language.

Staff metrics: {{staffMetrics}}
```

### Intervention Recommendation Agent
```
You are a healthcare workforce intervention advisor.
Given the following burnout risk flags and staffing gaps, recommend the most impactful actions
a charge nurse or HR manager can take today. Be specific and actionable.
Rank recommendations by urgency.

Risk flags: {{riskFlags}}
Staffing gaps: {{staffingGaps}}
```

---

## Demo Flow

1. Start the server — 20 randomized staff members, 18 patients, and appointments load automatically
2. Log in as `admin` / `Admin@789` → lands on HR Dashboard
3. Open **Schedule & AI Forecast** — view today's schedule with live burnout risk per staff member
4. Click **Run AI Analysis** — watch all 4 agents run in sequence via IBM Watsonx
5. Review demand forecasts, staffing gaps, and ranked intervention recommendations
6. Approve an intervention with one click
7. Switch to the **HR Dashboard** — see tired staff in the wheel, view their appointments
8. Use **Swap & Send Home** — system validates whether a swap is possible or rejects with explanation
9. Log out and log back in as a staff member (`srivera` / `Staff@123`) → Doctor Dashboard
10. View personal shift, today's appointments, and mark one complete

---

## Hackathon Narrative

> "A charge nurse shouldn't find out their unit is short-staffed at 6am when the shift starts. And a nurse shouldn't burn out before anyone notices the warning signs. This system sees both problems coming — days in advance — and gives managers the tools to act before it becomes a crisis."

---

## Responsible AI Notes

- No real patient or staff data used — all data is randomly generated on server startup
- Burnout scores are advisory, not punitive — designed to help managers support staff
- All AI recommendations require human approval before any action is taken
- Transparent explainability: every risk score shows its contributing factors
- IBM Watsonx Granite models used in alignment with enterprise AI governance standards
