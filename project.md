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
3. Monitors individual burnout risk over time
4. Recommends proactive interventions before problems escalate

---

## Agent Architecture

### Agent 1 — Demand Forecasting Agent
- **Input:** Historical census data, seasonal patterns, day-of-week trends, upcoming scheduled procedures
- **Output:** Patient volume forecast per unit for next 24–72 hours
- **Prompt goal:** Analyze patterns and return a structured staffing demand forecast

### Agent 2 — Schedule Optimization Agent
- **Input:** Demand forecast from Agent 1, staff availability, labor rules (max consecutive shifts, required rest periods, required certifications per unit)
- **Output:** Optimized draft schedule with flagged gaps
- **Prompt goal:** Generate a schedule that satisfies labor constraints while meeting forecasted demand

### Agent 3 — Burnout Risk Monitor
- **Input:** Individual staff metrics (consecutive shifts, hours/week, shift type distribution, PTO utilization, wellness check-in responses)
- **Output:** Rolling burnout risk score per staff member (green / yellow / red) with contributing factors
- **Prompt goal:** Score burnout risk and surface the top contributing factors in plain language

### Agent 4 — Intervention Recommendation Agent
- **Input:** Burnout risk flags from Agent 3 and staffing gap alerts from Agent 2
- **Output:** Concrete action recommendations (e.g., offer shift swap, recommend PTO, redistribute workload, alert charge nurse)
- **Prompt goal:** Given a risk flag or gap, suggest the 1–3 most actionable interventions ranked by impact

### Orchestrator
- Runs all four agents on a daily cadence
- Aggregates outputs into a digest surfaced to charge nurses and HR
- Surfaces highest-urgency flags at the top
- Triggers real-time alerts for critical gaps via SMS (Twilio)

---

## Key Features

- **Burnout Risk Dashboard** — Color-coded risk score per staff member with contributing factors displayed (e.g., "8 night shifts in 14 days, no PTO in 60 days")
- **Predictive Staffing Alerts** — Forward-looking warnings like "Unit 4B is projected to be understaffed by 2 nurses Friday evening based on current schedule and forecasted volume"
- **One-Click Schedule Adjustments** — Agent suggests a fix, charge nurse approves, schedule updates
- **Weekly Wellness Check-In** — Short AI-driven check-in sent to staff that feeds the burnout risk model 

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Agent Orchestration | Node.js + Anthropic API (claude-sonnet-4-20250514) |
| Database | Firebase Firestore or PostgreSQL |
| Notifications | Twilio (SMS alerts) |
| Auth | Firebase Auth |
| Demo Data | Synthetic nurse scheduling data (generated) |

---

## File Structure

```
/
├── agents/
│   ├── orchestrator.js         # Main pipeline runner
│   ├── demandForecast.js       # Agent 1
│   ├── scheduleOptimizer.js    # Agent 2
│   ├── burnoutMonitor.js       # Agent 3
│   └── interventionAdvisor.js  # Agent 4
├── data/
│   ├── seedData.js             # Synthetic staff + census data generator
│   └── schema.js               # Data models
├── api/
│   └── routes.js               # Express API endpoints
├── frontend/
│   ├── Dashboard.jsx           # Main charge nurse view
│   ├── StaffCard.jsx           # Per-staff burnout risk display
│   ├── ScheduleView.jsx        # Schedule grid with gap highlights
│   └── AlertPanel.jsx          # Intervention recommendations
├── .env                        # ANTHROPIC_API_KEY, TWILIO keys
└── README.md
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
  "shiftsLast14Days": "number",
  "hoursLast30Days": "number",
  "nightShiftRatio": "number (0–1)",
  "daysSinceLastPTO": "number",
  "wellnessScore": "number (1–5, from check-in)",
  "burnoutRisk": "green | yellow | red"
}
```

### Shift
```json
{
  "id": "string",
  "staffId": "string",
  "unit": "string",
  "date": "ISO string",
  "type": "day | evening | night",
  "hoursWorked": "number",
  "patientLoad": "number"
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

### Burnout Monitor Agent
```
You are a clinician burnout risk assessment agent.
Given the following staff metrics, calculate a burnout risk score for each staff member.
Return green (low risk), yellow (moderate risk), or red (high risk) with the top 2-3 contributing factors in plain language.

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

## Hackathon Narrative

> "A charge nurse shouldn't find out their unit is short-staffed at 6am when the shift starts. And a nurse shouldn't burn out before anyone notices the warning signs. This system sees both problems coming — days in advance — and gives managers the tools to act before it becomes a crisis."

---

## Demo Flow

1. Load synthetic data for a fictional hospital (3 units, 20 staff members)
2. Show the dashboard — burnout risk cards, upcoming schedule grid
3. Trigger the orchestrator pipeline live — watch agents run in sequence
4. Surface a predictive alert: "Unit ICU-2 is understaffed Friday night"
5. Show intervention recommendations and one-click approval
6. Show a red-flagged nurse with burnout factors explained in plain language

---

## Responsible AI Notes

- No real patient or staff data used — synthetic only for demo
- Burnout scores are advisory, not punitive — designed to help managers support staff
- All recommendations require human approval before action is taken
- Transparent explainability: every risk score shows its contributing factors
