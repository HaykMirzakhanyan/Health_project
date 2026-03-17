/**
 * agents/orchestrator.js
 * Main Pipeline Orchestrator
 *
 * Runs all four AI agents in sequence on demand (triggered via POST /api/orchestrator/run).
 * Aggregates results into a digest for charge nurses and HR managers.
 * Sends Twilio SMS alerts for critical interventions and large staffing gaps.
 *
 * Pipeline order:
 *   1. Demand Forecasting  → store.forecasts
 *   2. Schedule Optimizer  → store.schedule + gaps
 *   3. Burnout Monitor     → store.burnoutScores + updates store.staff
 *   4. Intervention Advisor → store.interventions
 *   5. SMS alerts via Twilio (critical urgency / large gaps)
 */

'use strict';

const { store } = require('../data/schema');
const { runDemandForecast } = require('./demandForecast');
const { runScheduleOptimizer } = require('./scheduleOptimizer');
const { runBurnoutMonitor } = require('./burnoutMonitor');
const { runInterventionAdvisor } = require('./interventionAdvisor');

// ---------------------------------------------------------------------------
// Twilio SMS helper — wrapped in try/catch so a failed SMS never crashes the
// pipeline.  In production, also log failures to a monitoring service.
// ---------------------------------------------------------------------------
async function sendSmsAlert(message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_PHONE_NUMBER } =
    process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ALERT_PHONE_NUMBER) {
    console.warn('[Orchestrator] Twilio env vars not set — skipping SMS alert.');
    return false;
  }

  try {
    const twilio = require('twilio');
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: message,
      from: TWILIO_FROM_NUMBER,
      to: ALERT_PHONE_NUMBER,
    });
    console.log(`[Orchestrator] SMS alert sent: "${message.slice(0, 60)}..."`);
    return true;
  } catch (err) {
    console.error('[Orchestrator] SMS alert failed (non-fatal):', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// buildHistoricalData
// Summarises the last 30 days of shift data into per-unit, per-day-of-week
// average census figures that the Demand Forecasting agent can reason about.
// ---------------------------------------------------------------------------
function buildHistoricalData(shifts) {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const unitDayMap = {}; // { unit: { dayName: { total, count } } }

  shifts.forEach((shift) => {
    const unit = shift.unit;
    const dayOfWeek = DAY_NAMES[new Date(shift.date).getDay()];

    if (!unitDayMap[unit]) unitDayMap[unit] = {};
    if (!unitDayMap[unit][dayOfWeek]) unitDayMap[unit][dayOfWeek] = { total: 0, count: 0 };

    unitDayMap[unit][dayOfWeek].total += shift.patientLoad || 0;
    unitDayMap[unit][dayOfWeek].count += 1;
  });

  // Convert to averages
  const historicalData = {};
  for (const [unit, days] of Object.entries(unitDayMap)) {
    historicalData[unit] = {};
    for (const [day, { total, count }] of Object.entries(days)) {
      historicalData[unit][day] = count > 0 ? Math.round(total / count) : 0;
    }
  }

  return historicalData;
}

// ---------------------------------------------------------------------------
// runOrchestrator — main entry point
// ---------------------------------------------------------------------------
async function runOrchestrator() {
  console.log('\n[Orchestrator] ===== Starting pipeline run =====');
  const runAt = new Date().toISOString();
  let alertsSent = 0;

  // ---- Step 1: Build historical summary for Agent 1 ----------------------
  const historicalData = buildHistoricalData(store.shifts);
  const scheduledProcedures = store.procedures || [];
  console.log('[Orchestrator] Step 1/4 — Running Demand Forecast Agent...');

  let forecasts;
  try {
    forecasts = await runDemandForecast(historicalData, scheduledProcedures);
    store.forecasts = forecasts;
  } catch (err) {
    console.error('[Orchestrator] Agent 1 failed:', err.message);
    // Use empty forecasts so remaining agents can still run with degraded data
    forecasts = [];
    store.forecasts = [];
  }

  // ---- Step 2: Schedule Optimization ------------------------------------
  console.log('[Orchestrator] Step 2/4 — Running Schedule Optimizer Agent...');
  let schedule = [];
  let gaps = [];
  try {
    const result = await runScheduleOptimizer(forecasts, store.staff);
    schedule = result.schedule;
    gaps = result.gaps;
    store.schedule = schedule;
  } catch (err) {
    console.error('[Orchestrator] Agent 2 failed:', err.message);
    store.schedule = [];
  }

  // ---- Step 3: Burnout Monitoring ----------------------------------------
  console.log('[Orchestrator] Step 3/4 — Running Burnout Monitor Agent...');
  let burnoutScores = [];
  try {
    burnoutScores = await runBurnoutMonitor(store.staff);
    store.burnoutScores = burnoutScores;
  } catch (err) {
    console.error('[Orchestrator] Agent 3 failed:', err.message);
    store.burnoutScores = [];
  }

  // ---- Step 4: Intervention Recommendations --------------------------------
  console.log('[Orchestrator] Step 4/4 — Running Intervention Advisor Agent...');
  const riskFlags = burnoutScores.filter((s) => s.burnoutRisk !== 'green');
  let interventions = [];
  try {
    interventions = await runInterventionAdvisor(riskFlags, gaps);
    store.interventions = interventions;
  } catch (err) {
    console.error('[Orchestrator] Agent 4 failed:', err.message);
    store.interventions = [];
  }

  // ---- Step 5: Twilio SMS for critical items --------------------------------
  console.log('[Orchestrator] Evaluating SMS alert thresholds...');

  // Alert for critical interventions
  const criticalInterventions = interventions.filter((i) => i.urgency === 'critical');
  for (const intervention of criticalInterventions) {
    const target = intervention.unit || intervention.staffId || 'unknown';
    const msg =
      `[Riverside General] CRITICAL ALERT: ${target}\n` +
      intervention.recommendation.slice(0, 120);
    const sent = await sendSmsAlert(msg);
    if (sent) alertsSent++;
  }

  // Alert for large forecast gaps (shortfall >= 2)
  const largeGaps = gaps.filter((g) => g.shortfall >= 2);
  for (const gap of largeGaps) {
    const msg =
      `[Riverside General] STAFFING GAP: ${gap.unit} is short ${gap.shortfall} staff ` +
      `on ${new Date(gap.date).toDateString()} (${gap.type} shift). Immediate action needed.`;
    const sent = await sendSmsAlert(msg);
    if (sent) alertsSent++;
  }

  // ---- Build digest -------------------------------------------------------
  const greenCount = burnoutScores.filter((s) => s.burnoutRisk === 'green').length;
  const yellowCount = burnoutScores.filter((s) => s.burnoutRisk === 'yellow').length;
  const redCount = burnoutScores.filter((s) => s.burnoutRisk === 'red').length;

  store.lastRun = runAt;

  const digest = {
    forecasts,
    gaps,
    burnoutSummary: { green: greenCount, yellow: yellowCount, red: redCount },
    interventions,
    alertsSent,
    runAt,
  };

  console.log(
    `[Orchestrator] ===== Pipeline complete =====\n` +
      `  Forecasts: ${forecasts.length} | Gaps: ${gaps.length}\n` +
      `  Burnout — green: ${greenCount}, yellow: ${yellowCount}, red: ${redCount}\n` +
      `  Interventions: ${interventions.length} (${criticalInterventions.length} critical)\n` +
      `  SMS alerts sent: ${alertsSent}\n`
  );

  return digest;
}

module.exports = { runOrchestrator };
