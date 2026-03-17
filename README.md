# Staff Scheduling & Burnout Monitor
> AI-powered staff scheduling and burnout monitoring for healthcare — Riverside General demo

---

## Prerequisites

Make sure you have the following installed before starting:

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- An [IBM Cloud account](https://cloud.ibm.com) with Watsonx access
- *(Optional)* A [Twilio account](https://www.twilio.com) for SMS alerts

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd Health_project
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and fill in the following:

```env
# IBM Watsonx — required for AI agents
WATSONX_API_KEY=your_api_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-3-8b-instruct

# Twilio — optional, only needed for SMS alerts
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
ALERT_PHONE_NUMBER=+1xxxxxxxxxx

# Server
PORT=3000
```

### Getting your Watsonx credentials

**API Key:**
1. Go to [cloud.ibm.com/iam/apikeys](https://cloud.ibm.com/iam/apikeys)
2. Click **Create an IBM Cloud API key**
3. Copy the key immediately — it won't be shown again

**Project ID:**
1. Go to [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com)
2. Open your project → **Manage** tab → **General**
3. Copy the **Project ID**

---

## 4. Start the Server

```bash
npm start
```

You should see:

```
╔════════════════════════════════════════════════════╗
║       Health Staff Scheduler — Riverside General   ║
╚════════════════════════════════════════════════════╝
  Server   : http://localhost:3000
  API root : http://localhost:3000/api/health
  ...
```

---

## 5. Open the App

Navigate to **[http://localhost:3000](http://localhost:3000)** — you will be redirected to the login page automatically.

---

## 6. Log In

Use one of the pre-seeded demo accounts:

| Role | Login ID | Password | Redirects To |
|---|---|---|---|
| Admin | `admin` | `Admin@789` | HR Dashboard |
| Admin | `hradmin` | `Admin@789` | HR Dashboard |
| Charge Nurse (ICU-1) | `rdonovan` | `Charge@456` | HR Dashboard |
| Charge Nurse (ICU-2) | `pwynn` | `Charge@456` | HR Dashboard |
| Charge Nurse (MedSurg-3) | `sortega` | `Charge@456` | HR Dashboard |
| Doctor | `srivera` | `Staff@123` | Doctor Dashboard |
| Doctor | `cwei` | `Staff@123` | Doctor Dashboard |
| Doctor | `asingh` | `Staff@123` | Doctor Dashboard |
| Nurse | `msantos` | `Staff@123` | Doctor Dashboard |
| Nurse | `jokafor` | `Staff@123` | Doctor Dashboard |

> **Staff login ID format:** first initial + last name, lowercase (e.g. Maria Santos = `msantos`)
> **All staff passwords:** `Staff@123`

---

## 7. Run the AI Pipeline

To generate forecasts, detect staffing gaps, score burnout risk, and get intervention recommendations:

1. Log in as **admin** or **charge nurse**
2. Go to **Schedule & Forecast** from the HR Dashboard
3. Click **Run AI Analysis**

> ⚠️ This requires valid Watsonx credentials in your `.env`. It may take 15–30 seconds to complete.

You can also trigger it directly via the API:

```bash
curl -X POST http://localhost:3000/api/orchestrator/run
```

---

## Screens

| Screen | URL | Access |
|---|---|---|
| Login | `/screens/Login.html` | All |
| HR Dashboard | `/screens/hr.html` | Admin / Charge Nurse |
| Schedule & AI Forecast | `/screens/schedule.html` | Admin / Charge Nurse |
| Doctor Dashboard | `/screens/doctor.html` | Staff |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server status and last AI run time |
| POST | `/api/orchestrator/run` | Run the full 4-agent AI pipeline |
| GET | `/api/staff` | All staff members |
| GET | `/api/staff/:id` | Single staff member + burnout score |
| GET | `/api/today-schedule` | Today's shift schedule (filter: `?unit=ICU-1`) |
| GET | `/api/patients` | All patients (filter: `?unit=ICU-1`) |
| GET | `/api/appointments` | All appointments (filter: `?unit=`, `?staffId=`, `?status=`) |
| PATCH | `/api/appointments/:id/status` | Update appointment status |
| GET | `/api/forecasts` | Demand forecasts from Agent 1 |
| GET | `/api/schedule` | Optimized schedule from Agent 2 |
| GET | `/api/burnout` | Burnout scores from Agent 3 (red first) |
| GET | `/api/interventions` | Intervention recommendations from Agent 4 |
| GET | `/api/interventions/pending` | Pending (unapproved) interventions |
| POST | `/api/interventions/:id/approve` | Approve an intervention |
| POST | `/api/checkin/:staffId` | Submit wellness check-in `{ wellnessScore: 1-5 }` |
| POST | `/api/auth/login` | Login `{ loginId, password }` |
| GET | `/api/users` | All user accounts (passwords omitted) |

---

## Project Structure

```
Health_project/
├── agents/
│   ├── orchestrator.js         # Runs all 4 agents in sequence
│   ├── demandForecast.js       # Agent 1 — 72-hour patient demand forecast
│   ├── scheduleOptimizer.js    # Agent 2 — shift schedule optimization
│   ├── burnoutMonitor.js       # Agent 3 — burnout risk scoring
│   └── interventionAdvisor.js  # Agent 4 — intervention recommendations
├── config/
│   └── watsonx.js              # IBM Watsonx AI client
├── data/
│   ├── schema.js               # Data models + in-memory store
│   └── seedData.js             # Synthetic hospital data generator
├── api/
│   └── routes.js               # All REST API endpoints
├── screens/
│   ├── Login.html              # Login page
│   ├── hr.html                 # HR / Charge Nurse dashboard
│   ├── schedule.html           # Schedule management + AI forecast
│   └── doctor.html             # Individual clinician dashboard
├── server.js                   # Express entry point
├── .env.example                # Environment variable template
└── package.json
```

---

## Troubleshooting

**Port already in use:**
```bash
# Find and kill the process on port 3000
cmd /c "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :3000') do taskkill /PID %a /F"
```
Or change `PORT=3001` in your `.env`.

**AI pipeline not returning results:**
- Double-check `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` in `.env`
- Make sure your IBM Cloud project has **Watson Machine Learning** service enabled
- Check the terminal for error output after clicking Run AI Analysis

**Login not working:**
- Make sure the server is running (`npm start`)
- Use exact credentials from the table above (case-sensitive)

---

## Notes

- All data is synthetic — no real patient or staff information is used
- The in-memory store resets on every server restart (seed data reloads automatically)
- All AI recommendations require human approval before any action is taken
- Passwords are stored in plain text for demo purposes only — use bcrypt in production
