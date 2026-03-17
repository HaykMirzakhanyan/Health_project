/**
 * agents/demandForecast.js
 * Agent 1 — Demand Forecasting Agent
 *
 * Analyses historical census data and upcoming scheduled procedures to
 * predict patient volume per unit for the next 72 hours.  The output
 * feeds directly into Agent 2 (Schedule Optimizer).
 */

'use strict';

const { generateText, parseJSON } = require('../config/watsonx');
const { createForecast } = require('../data/schema');

// ---------------------------------------------------------------------------
// runDemandForecast
//
// @param {Object} historicalData       — Per-unit census summaries (last 30 days)
// @param {Array}  scheduledProcedures  — Upcoming procedures from store.procedures
// @param {Array}  scheduleData         — Combined today + future schedule entries
// @returns {Promise<Array>}            — Array of Forecast objects (next 3 days)
// ---------------------------------------------------------------------------
async function runDemandForecast(historicalData, scheduledProcedures, scheduleData = []) {
  // Summarise scheduled staff counts by unit and shift type for the prompt
  const scheduleSummary = {};
  for (const entry of scheduleData) {
    if (entry.status === 'absent') continue;
    const key = `${entry.unit}|${entry.shiftType || 'day'}`;
    if (!scheduleSummary[key]) scheduleSummary[key] = { nurses: 0, doctors: 0 };
    const isNurse  = entry.role === 'RN' || entry.role === 'NP';
    const isDoctor = entry.role === 'MD';
    if (isNurse)  scheduleSummary[key].nurses  += 1;
    if (isDoctor) scheduleSummary[key].doctors += 1;
  }

  const prompt = `You are a healthcare demand forecasting agent.
Given the following historical census data, upcoming scheduled procedures, and the
current staff schedule, forecast the expected patient volume for each unit over the
next 72 hours and assess whether staffing levels meet minimum safe coverage requirements.

Historical census data (last 30 days — averages by unit and day-of-week):
${JSON.stringify(historicalData, null, 2)}

Upcoming scheduled procedures (next 72 hours):
${JSON.stringify(scheduledProcedures, null, 2)}

Scheduled staff counts by unit and shift type (nurses / doctors on shift):
${JSON.stringify(scheduleSummary, null, 2)}

Instructions:
- Forecast for each of the 3 units (ICU-1, ICU-2, MedSurg-3) for each of the next 3 days.
- Account for day-of-week patterns and the additional census from scheduled procedures.
- ICU units have a max capacity of 12 beds; MedSurg-3 has a max of 30 beds.
- Staff ratios: ICU 1:2 (one nurse per 2 patients), MedSurg 1:5 (one nurse per 5 patients).
- Return ONLY a valid JSON array with no extra commentary.
- Do NOT include scheduledStaff or gapFlag — those are computed separately.

Minimum staffing requirements — check the schedule and mark status accordingly:
  ICU-1 and ICU-2:
    - Night shift: at least 3 nurses (RN/NP) AND at least 2 doctor (MD).
    - Day  shift:  at least 6 nurses (RN/NP) AND at least 5 doctors (MD).
  MedSurg-3:
    - Night shift: at least 4 nurses (RN/NP) AND at least 2 doctors (MD).
    - Day  shift:  at least 5 nurses (RN/NP) AND at least 4 doctors (MD).
  Additional ratio rules:
    - Do NOT mark status as okay if there is fewer than 1 nurse per 2 patients in ICU.
    - Do NOT mark status as okay if there is fewer than 1 nurse per 5 patients in MedSurg-3.
    - Do NOT mark status as okay if there is fewer than 1 doctor per 10 patients in ICU.
    - Do NOT mark status as okay if there is fewer than 1 doctor per 20 patients in MedSurg-3.
  Set "status" to one of: "ok" | "understaffed_nurses" | "understaffed_doctors" | "critical_shortage"
    - Use "critical_shortage" when BOTH nurse AND doctor minimums are unmet.
    - Use "understaffed_nurses" when only nurse minimums are unmet.
    - Use "understaffed_doctors" when only doctor minimums are unmet.
    - Use "ok" only when all minimums are satisfied for the relevant shift type.

Required JSON format:
[
  {
    "unit": "ICU-1",
    "date": "2025-01-15T00:00:00.000Z",
    "predictedCensus": 9,
    "requiredStaff": 5,
    "status": "ok"
  }
]

Generate 9 forecast objects total (3 units × 3 days).`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 1200, temperature: 0.2 });
  } catch (err) {
    throw new Error(`[DemandForecast] Watsonx API call failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseJSON(rawResponse);
  } catch (err) {
    throw new Error(
      `[DemandForecast] Failed to parse JSON from LLM response: ${err.message}\nRaw: ${rawResponse}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('[DemandForecast] Expected JSON array from LLM, got: ' + typeof parsed);
  }

  // Normalise into Forecast schema objects
  const forecasts = parsed.map((item) =>
    createForecast({
      unit: item.unit || '',
      date: item.date || new Date().toISOString(),
      predictedCensus: Number(item.predictedCensus) || 0,
      requiredStaff: Number(item.requiredStaff) || 0,
      scheduledStaff: Number(item.scheduledStaff) || 0,
      gapFlag: Boolean(item.gapFlag),
      status: item.status || 'ok',
    })
  );

  console.log(`[DemandForecast] Generated ${forecasts.length} forecast records.`);
  return forecasts;
}

module.exports = { runDemandForecast };
