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
// @returns {Promise<Array>}            — Array of Forecast objects (next 3 days)
// ---------------------------------------------------------------------------
async function runDemandForecast(historicalData, scheduledProcedures) {
  const prompt = `You are a healthcare demand forecasting agent.
Given the following historical census data and upcoming scheduled procedures,
forecast the expected patient volume for each unit over the next 72 hours.

Historical census data (last 30 days — averages by unit and day-of-week):
${JSON.stringify(historicalData, null, 2)}

Upcoming scheduled procedures (next 72 hours):
${JSON.stringify(scheduledProcedures, null, 2)}

Instructions:
- Forecast for each of the 3 units (ICU-1, ICU-2, MedSurg-3) for each of the next 3 days.
- Account for day-of-week patterns and the additional census from scheduled procedures.
- ICU units have a max capacity of 12 beds; MedSurg-3 has a max of 30 beds.
- Staff ratios: ICU 1:2 (one nurse per 2 patients), MedSurg 1:5 (one nurse per 5 patients).
- Return ONLY a valid JSON array with no extra commentary.
- Do NOT include scheduledStaff or gapFlag — those are computed separately.

Required JSON format:
[
  {
    "unit": "ICU-1",
    "date": "2025-01-15T00:00:00.000Z",
    "predictedCensus": 9,
    "requiredStaff": 5
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
    })
  );

  console.log(`[DemandForecast] Generated ${forecasts.length} forecast records.`);
  return forecasts;
}

module.exports = { runDemandForecast };
