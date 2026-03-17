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

// Shift start/end times keyed by shift type
const SHIFT_TIMES = {
  day:     { shiftStart: '07:00', shiftEnd: '19:00' },
  evening: { shiftStart: '15:00', shiftEnd: '03:00' },
  night:   { shiftStart: '19:00', shiftEnd: '07:00' },
};

// ---------------------------------------------------------------------------
// runScheduleOptimizer
//
// Analyses forecast coverage gaps and edits the live schedule entries to
// satisfy minimum staffing requirements.
//
// @param {Array} forecasts       — Forecast objects from Agent 1 (with status field)
// @param {Array} staff           — Current staff roster from store.staff
// @param {Array} scheduleEntries — Combined todaySchedule + futureSchedule entries
//                                  (only the next 3 days are sent to the LLM)
// @returns {Promise<{scheduleUpdates: Array, gaps: Array}>}
//   scheduleUpdates: patches to apply to the live schedule — { id, shiftType,
//                    shiftStart, shiftEnd, reason }
//   gaps:           shortfalls that cannot be resolved with available staff
// ---------------------------------------------------------------------------
async function runScheduleOptimizer(forecasts, staff, scheduleEntries = []) {
  // Derive the date window from the forecasts (next 3 days)
  const forecastDates = new Set(
    forecasts.map((f) => (f.date ? f.date.split('T')[0] : null)).filter(Boolean)
  );

  // Filter schedule entries to just the forecast window; omit absent staff
  const relevantEntries = scheduleEntries.filter(
    (e) => forecastDates.has(e.date) && e.status !== 'absent'
  );

  // Lean summaries to keep token usage low
  const entrySummary = relevantEntries.map((e) => ({
    id:        e.id,
    staffId:   e.staffId,
    staffName: e.staffName,
    role:      e.role,
    unit:      e.unit,
    date:      e.date,
    shiftType: e.shiftType,
    status:    e.status,
  }));

  const staffSummary = staff.map((s) => ({
    id:              s.id,
    name:            s.name,
    role:            s.role,
    unit:            s.unit,
    certifications:  s.certifications,
    shiftsLast14Days: s.shiftsLast14Days,
    hoursLast30Days: s.hoursLast30Days,
    burnoutRisk:     s.burnoutRisk || 'green',
    wellnessScore:   s.wellnessScore,
  }));

  const prompt = `You are a healthcare schedule optimization agent for Riverside General Hospital.
Your task is to edit the existing shift schedule so that every unit meets its minimum
staffing requirements for each shift type over the next 72 hours.

Minimum staffing requirements:
  ICU-1 and ICU-2:
    - Night shift: at least 3 nurses (RN/NP) AND at least 2 doctor (MD).
    - Day  shift:  at least 6 nurses (RN/NP) AND at least 5 doctors (MD).
  MedSurg-3:
    - Night shift: at least 4 nurses (RN/NP) AND at least 2 doctors (MD).
    - Day  shift:  at least 5 nurses (RN/NP) AND at least 4 doctors (MD).

Additional labour rules:
  - Maximum 5 consecutive shifts per staff member.
  - Minimum 8 hours rest between shifts.
  - ICU units require ACLS or CCRN certification; MedSurg-3 requires BLS minimum.
  - Prefer staff with lower burnoutRisk for shift changes; avoid switching red-risk staff to night.
  - Only change staff assigned to the same unit as the gap — do NOT move staff across units.
  - Only reference entry IDs from the schedule below — do NOT invent new IDs.

Demand forecasts with current coverage status (status: ok | understaffed_nurses | understaffed_doctors | critical_shortage):
${JSON.stringify(forecasts, null, 2)}

Current schedule entries for the next 72 hours (non-absent staff only):
${JSON.stringify(entrySummary, null, 2)}

Staff roster:
${JSON.stringify(staffSummary, null, 2)}

Instructions:
1. For each forecast where status is NOT "ok", identify which shift type (day or night) is
   understaffed for that unit on that date.
2. Resolve the gap by changing the shiftType of existing schedule entries for that unit.
   Prefer changing evening-shift staff to the needed shift type before changing day-shift staff.
3. If a gap cannot be resolved (not enough staff in unit), record it in "gaps".
4. Return ONLY a valid JSON object with exactly two keys: "scheduleUpdates" and "gaps".

Format:
{
  "scheduleUpdates": [
    {
      "id": "<existing scheduleEntry id>",
      "shiftType": "night",
      "shiftStart": "19:00",
      "shiftEnd": "07:00",
      "reason": "one-sentence justification"
    }
  ],
  "gaps": [
    {
      "unit": "ICU-2",
      "date": "2025-01-16",
      "shiftType": "night",
      "role": "MD",
      "shortfall": 1,
      "reason": "No additional MD available in unit for this shift"
    }
  ]
}`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 2400, temperature: 0.2 });
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

  const scheduleUpdates = (parsed.scheduleUpdates || []).map((u) => ({
    id:         u.id || '',
    shiftType:  u.shiftType || 'day',
    shiftStart: u.shiftStart || SHIFT_TIMES[u.shiftType]?.shiftStart || '07:00',
    shiftEnd:   u.shiftEnd   || SHIFT_TIMES[u.shiftType]?.shiftEnd   || '19:00',
    reason:     u.reason || '',
  }));

  const gaps = (parsed.gaps || []).map((g) => ({
    unit:      g.unit || '',
    date:      g.date || '',
    shiftType: g.shiftType || g.type || '',
    role:      g.role || '',
    shortfall: Number(g.shortfall) || 1,
    reason:    g.reason || '',
  }));

  console.log(
    `[ScheduleOptimizer] ${scheduleUpdates.length} schedule update(s) proposed, ${gaps.length} unresolvable gap(s).`
  );

  return { scheduleUpdates, gaps };
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
