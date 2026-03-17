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

// ---------------------------------------------------------------------------
// runFutureOptimizer
//
// @param {string} date            — YYYY-MM-DD target date
// @param {Array}  currentEntries  — Current draft ScheduleEntry[] for that date
// @param {Array}  pendingPatients — PendingPatient[] needing scheduling
// @param {Array}  staff           — Full staff roster
// @returns {Promise<Object>}      — { scheduleUpdates, patientAssignments, summary, suggestions }
// ---------------------------------------------------------------------------
async function runFutureOptimizer(date, currentEntries, pendingPatients, staff) {
  const staffSummary = staff.map((s) => ({
    id:              s.id,
    name:            s.name,
    role:            s.role,
    unit:            s.unit,
    certifications:  s.certifications,
    burnoutRisk:     s.burnoutRisk || 'green',
    wellnessScore:   s.wellnessScore,
    shiftsLast14Days: s.shiftsLast14Days,
  }));

  const entrySummary = currentEntries.map((e) => ({
    id:        e.id,
    staffId:   e.staffId,
    staffName: e.staffName,
    role:      e.role,
    unit:      e.unit,
    shiftType: e.shiftType,
    status:    e.status,
  }));

  const patientSummary = pendingPatients.map((p) => ({
    id:          p.id,
    name:        p.name,
    unit:        p.unit,
    reason:      p.reason,
    priority:    p.priority,
    dateNeededBy: p.dateNeededBy,
  }));

  const prompt = `You are a healthcare schedule optimization agent for Riverside General Hospital.
Optimize the draft schedule for ${date} and assign pending patients to available staff.

DRAFT SCHEDULE for ${date}:
${JSON.stringify(entrySummary, null, 2)}

PENDING PATIENTS needing scheduling on or before their dateNeededBy:
${JSON.stringify(patientSummary, null, 2)}

STAFF ROSTER:
${JSON.stringify(staffSummary, null, 2)}

RULES:
- Prioritize urgent and high-priority patients first.
- Match patients to staff in the same unit.
- Avoid assigning extra patients to red-risk or high-burnout staff.
- Suggest shift type changes (day/evening/night) only if it improves coverage.
- ICU staff ratio: 1:2 (one nurse per 2 patients). MedSurg ratio: 1:5.
- Only reference staff and patients from the data above — no invented names.

Return ONLY a valid JSON object with these keys:
{
  "scheduleUpdates": [
    { "id": "<scheduleEntryId>", "shiftType": "day|evening|night" }
  ],
  "patientAssignments": [
    {
      "patientId":    "<pendingPatientId>",
      "patientName":  "<name>",
      "staffId":      "<staffId>",
      "staffName":    "<name>",
      "suggestedTime": "HH:MM",
      "reason":       "one sentence justification"
    }
  ],
  "summary": "2-3 sentence plain-language summary of changes made",
  "suggestions": ["array of plain-language tips for the charge nurse"]
}`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 2000, temperature: 0.2 });
  } catch (err) {
    throw new Error(`[FutureOptimizer] Watsonx API call failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseJSON(rawResponse);
  } catch (err) {
    throw new Error(`[FutureOptimizer] Failed to parse JSON: ${err.message}\nRaw: ${rawResponse}`);
  }

  console.log(
    `[FutureOptimizer] ${date} — ` +
    `${(parsed.scheduleUpdates || []).length} schedule updates, ` +
    `${(parsed.patientAssignments || []).length} patient assignments.`
  );

  return {
    scheduleUpdates:    parsed.scheduleUpdates    || [],
    patientAssignments: parsed.patientAssignments || [],
    summary:            parsed.summary            || '',
    suggestions:        parsed.suggestions        || [],
  };
}

module.exports = { runScheduleOptimizer, runFutureOptimizer };
