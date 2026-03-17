/**
 * agents/interventionAdvisor.js
 * Agent 4 — Intervention Recommendation Agent
 *
 * Given burnout risk flags from Agent 3 and staffing gaps from Agent 2,
 * recommends the most impactful concrete actions for charge nurses and HR
 * managers, ranked by urgency.  All recommendations require human approval
 * before they are enacted (see POST /interventions/:id/approve).
 */

'use strict';

const { generateText, parseJSON } = require('../config/watsonx');
const { createIntervention } = require('../data/schema');

// ---------------------------------------------------------------------------
// runInterventionAdvisor
//
// @param {Array} riskFlags    — Burnout score objects from Agent 3 (yellow/red)
// @param {Array} staffingGaps — Gap objects from Agent 2
// @returns {Promise<Array>}   — Intervention objects (unsaved; orchestrator saves them)
// ---------------------------------------------------------------------------
async function runInterventionAdvisor(riskFlags, staffingGaps) {
  const prompt = `You are a healthcare workforce intervention advisor.
Given the following burnout risk flags and staffing gaps, recommend the most impactful actions
a charge nurse or HR manager can take today. Be specific and actionable.
Rank recommendations by urgency (critical first, then high, medium, low).

Burnout risk flags (staff at yellow or red risk):
${JSON.stringify(riskFlags, null, 2)}

Staffing gaps (units where demand exceeds scheduled staff):
${JSON.stringify(staffingGaps, null, 2)}

For each recommendation include:
  - staffId: UUID of the specific staff member (null if unit-level)
  - unit: unit name (null if individual intervention)
  - recommendation: a specific, actionable step in plain language (1-2 sentences)
  - urgency: "critical" | "high" | "medium" | "low"
  - type: one of "shift_swap" | "pto" | "redistribute" | "alert_charge_nurse" | "other"

Urgency guidelines:
  - critical: Immediate patient safety risk (gap >= 2 staff OR red-risk nurse on 6th+ consecutive shift)
  - high: Likely to become critical within 24 hours
  - medium: Addressable within 48 hours without immediate risk
  - low: Preventative / wellness recommendations

Return ONLY a valid JSON array. No extra commentary.

Format:
[
  {
    "staffId": "<uuid or null>",
    "unit": "<unit name or null>",
    "recommendation": "Immediately reassign Maria Santos from night shifts to day shifts for the next 7 days and schedule a mandatory wellness check-in with the charge nurse.",
    "urgency": "critical",
    "type": "shift_swap"
  }
]`;

  let rawResponse;
  try {
    rawResponse = await generateText(prompt, { maxTokens: 1500, temperature: 0.3 });
  } catch (err) {
    throw new Error(`[InterventionAdvisor] Watsonx API call failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = parseJSON(rawResponse);
  } catch (err) {
    throw new Error(
      `[InterventionAdvisor] Failed to parse JSON from LLM response: ${err.message}\nRaw: ${rawResponse}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('[InterventionAdvisor] Expected JSON array from LLM, got: ' + typeof parsed);
  }

  const validTypes = ['shift_swap', 'pto', 'redistribute', 'alert_charge_nurse', 'other'];
  const validUrgencies = ['low', 'medium', 'high', 'critical'];

  const interventions = parsed.map((item) =>
    createIntervention({
      staffId: item.staffId || null,
      unit: item.unit || null,
      type: validTypes.includes(item.type) ? item.type : 'other',
      recommendation: item.recommendation || '',
      urgency: validUrgencies.includes(item.urgency) ? item.urgency : 'low',
      approved: false,
    })
  );

  const criticalCount = interventions.filter((i) => i.urgency === 'critical').length;
  console.log(
    `[InterventionAdvisor] Generated ${interventions.length} interventions (${criticalCount} critical).`
  );

  return interventions;
}

module.exports = { runInterventionAdvisor };
