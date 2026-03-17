/**
 * agents/burnoutMonitor.js
 * Agent 3 — Burnout Risk Monitor
 *
 * Evaluates individual staff metrics to produce a rolling burnout risk
 * classification (green / yellow / red) with plain-language contributing
 * factors.  Results are written back to each staff member's record in the
 * store so the dashboard always reflects the latest assessment.
 */

'use strict';

const { generateText, parseJSON } = require('../config/watsonx');
const { store } = require('../data/schema');

// ---------------------------------------------------------------------------
// runBurnoutMonitor
//
// @param {Array} staffMetrics — Array of staff objects from store.staff
// @returns {Promise<Array>}   — Burnout score objects, one per staff member
// ---------------------------------------------------------------------------
async function runBurnoutMonitor(staffMetrics) {
  // Build a focused metrics payload — exclude fields irrelevant to burnout
  const metricsPayload = staffMetrics.map((s) => ({
    staffId: s.id,
    name: s.name,
    role: s.role,
    unit: s.unit,
    shiftsLast14Days: s.shiftsLast14Days,
    hoursLast30Days: s.hoursLast30Days,
    nightShiftRatio: s.nightShiftRatio,
    daysSinceLastPTO: s.daysSinceLastPTO,
    wellnessScore: s.wellnessScore,
  }));

  const prompt = `You are a clinician burnout risk assessment agent.
Given the following staff metrics, calculate a burnout risk score for each staff member.

Scoring criteria:
  - RED (high risk):   Any of — >8 shifts in 14 days, >210 hours in 30 days,
                       nightShiftRatio >0.7, daysSinceLastPTO >60, wellnessScore <=2
  - YELLOW (moderate): Any of — 7-8 shifts in 14 days, 170-210 hours in 30 days,
                       nightShiftRatio 0.4-0.7, daysSinceLastPTO 30-60, wellnessScore 3
  - GREEN (low risk):  None of the above thresholds exceeded.

For each staff member return:
  - burnoutRisk: "green", "yellow", or "red"
  - contributingFactors: array of 2-3 plain-language strings explaining why
  - score: a number from 1-10 (10 = most burned out)

Staff metrics:
${JSON.stringify(metricsPayload, null, 2)}

Return ONLY a valid JSON array. No extra commentary.

Format:
[
  {
    "staffId": "<uuid>",
    "name": "<name>",
    "burnoutRisk": "red",
    "contributingFactors": [
      "10 shifts in the last 14 days — well above the 8-shift safe threshold",
      "Night shift ratio of 90% with no day-shift recovery periods",
      "No PTO in 70 days, preventing adequate rest and recovery"
    ],
    "score": 9
  }
]`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 1500, temperature: 0.2 });
  } catch (err) {
    throw new Error(`[BurnoutMonitor] Watsonx API call failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseJSON(rawResponse);
  } catch (err) {
    throw new Error(
      `[BurnoutMonitor] Failed to parse JSON from LLM response: ${err.message}\nRaw: ${rawResponse}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('[BurnoutMonitor] Expected JSON array from LLM, got: ' + typeof parsed);
  }

  // Normalise and write burnoutRisk back to each staff member in the store
  const burnoutScores = parsed.map((item) => {
    const risk = ['green', 'yellow', 'red'].includes(item.burnoutRisk)
      ? item.burnoutRisk
      : 'green';

    // Update the staff record in the store so GET /staff reflects new risk
    const staffRecord = store.staff.find((s) => s.id === item.staffId);
    if (staffRecord) {
      staffRecord.burnoutRisk = risk;
    }

    return {
      staffId: item.staffId || '',
      name: item.name || '',
      role: staffRecord?.role || '',
      unit: staffRecord?.unit || '',
      burnoutRisk: risk,
      contributingFactors: Array.isArray(item.contributingFactors)
        ? item.contributingFactors
        : [],
      score: typeof item.score === 'number' ? item.score : 0,
    };
  });

  const redCount = burnoutScores.filter((s) => s.burnoutRisk === 'red').length;
  const yellowCount = burnoutScores.filter((s) => s.burnoutRisk === 'yellow').length;
  console.log(
    `[BurnoutMonitor] Assessment complete — red: ${redCount}, yellow: ${yellowCount}, green: ${burnoutScores.length - redCount - yellowCount}`
  );

  return burnoutScores;
}

module.exports = { runBurnoutMonitor };
