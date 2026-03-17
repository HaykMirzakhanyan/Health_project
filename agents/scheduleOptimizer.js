/**
 * agents/scheduleOptimizer.js
 * Agent 2 — Schedule Optimization Agent
 *
 * Takes the demand forecasts produced by Agent 1 and the current staff
 * roster to generate an optimised shift schedule for the next 72 hours.
 * Returns both the schedule and any coverage gaps for Agent 4 to act on.
 */

'use strict';

const { generateText, parseJSON } = require('../config/watsonx');
const { createShift } = require('../data/schema');

// ---------------------------------------------------------------------------
// runScheduleOptimizer
//
// @param {Array} forecasts — Forecast objects from Agent 1
// @param {Array} staff     — Current staff roster from store.staff
// @returns {Promise<{schedule: Array, gaps: Array}>}
// ---------------------------------------------------------------------------
async function runScheduleOptimizer(forecasts, staff) {
  // Build a lean staff summary to keep the prompt concise
  const staffSummary = staff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    unit: s.unit,
    certifications: s.certifications,
    shiftsLast14Days: s.shiftsLast14Days,
    hoursLast30Days: s.hoursLast30Days,
    burnoutRisk: s.burnoutRisk,
    wellnessScore: s.wellnessScore,
  }));

  const prompt = `You are a healthcare schedule optimization agent.
Given the following demand forecasts and staff availability, generate an optimized shift schedule
for the next 72 hours. Apply the following labor rules strictly:
  - Maximum 5 consecutive shifts per staff member.
  - Minimum 8 hours rest between shifts.
  - Match required certifications per unit (ICU units require ACLS or CCRN; MedSurg-3 requires BLS minimum).
  - Prefer staff with lower burnoutRisk for extra shifts; avoid scheduling red-risk staff for additional nights.
  - Flag any scheduling gaps where requiredStaff cannot be met.

Demand forecasts (next 72 hours):
${JSON.stringify(forecasts, null, 2)}

Staff roster:
${JSON.stringify(staffSummary, null, 2)}

Return ONLY a valid JSON object with exactly two keys: "schedule" and "gaps". No extra commentary.

Format:
{
  "schedule": [
    {
      "staffId": "<uuid>",
      "staffName": "<name>",
      "unit": "ICU-1",
      "date": "2025-01-15T00:00:00.000Z",
      "type": "day",
      "hoursWorked": 12,
      "patientLoad": 3
    }
  ],
  "gaps": [
    {
      "unit": "ICU-2",
      "date": "2025-01-16T00:00:00.000Z",
      "type": "night",
      "shortfall": 2,
      "reason": "Insufficient ACLS-certified staff available"
    }
  ]
}`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 2000, temperature: 0.2 });
  } catch (err) {
    throw new Error(`[ScheduleOptimizer] Watsonx API call failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseJSON(rawResponse);
  } catch (err) {
    throw new Error(
      `[ScheduleOptimizer] Failed to parse JSON from LLM response: ${err.message}\nRaw: ${rawResponse}`
    );
  }

  const schedule = (parsed.schedule || []).map((item) =>
    createShift({
      staffId: item.staffId || '',
      unit: item.unit || '',
      date: item.date || new Date().toISOString(),
      type: item.type || 'day',
      hoursWorked: Number(item.hoursWorked) || 12,
      patientLoad: Number(item.patientLoad) || 0,
    })
  );

  const gaps = (parsed.gaps || []).map((g) => ({
    unit: g.unit || '',
    date: g.date || '',
    type: g.type || '',
    shortfall: Number(g.shortfall) || 1,
    reason: g.reason || '',
  }));

  console.log(
    `[ScheduleOptimizer] Generated ${schedule.length} shift assignments, ${gaps.length} gap(s) identified.`
  );

  return { schedule, gaps };
}

module.exports = { runScheduleOptimizer };
