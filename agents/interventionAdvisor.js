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
  // Build an explicit roster so the LLM has no reason to invent names
  const rosterLines = riskFlags.map((s) =>
    `  - staffId: ${s.staffId} | name: ${s.name} | role: ${s.role || 'unknown'} | unit: ${s.unit || 'unknown'} | risk: ${s.burnoutRisk} | score: ${s.score} | factors: ${(s.contributingFactors || []).join('; ')}`
  ).join('\n');

  const hasRiskFlags  = riskFlags.length > 0;
  const hasGaps       = staffingGaps.length > 0;

  const prompt = `You are a healthcare workforce intervention advisor for Riverside General Hospital.
Generate specific, actionable recommendations based on the data below.

RULES — follow exactly:
1. For individual staff recommendations, use ONLY names and staffIds from the AT-RISK STAFF ROSTER.
2. Do NOT invent names. No "Jane Doe", no "John Smith", no placeholders.
3. For unit-level recommendations (coverage gaps), set staffId to null and populate the unit field.
4. You MUST produce at least one recommendation per staffing gap and one per red-risk staff member.

AT-RISK STAFF ROSTER (${hasRiskFlags ? riskFlags.length + ' at-risk members' : 'none currently — focus on gaps'}):
${rosterLines || '  (none)'}

STAFFING GAPS (${hasGaps ? staffingGaps.length + ' gap(s) detected' : 'none detected'}):
${JSON.stringify(staffingGaps, null, 2)}

For each recommendation return:
  - staffId: exact UUID from the roster, or null for unit-level
  - unit: unit name, or null for individual
  - recommendation: 1-2 sentences, specific and actionable, referencing the actual name or unit
  - urgency: "critical" | "high" | "medium" | "low"
  - type: "shift_swap" | "pto" | "redistribute" | "alert_charge_nurse" | "other"

Urgency guidelines:
  - critical: Immediate patient safety risk (shortfall >= 2 OR red-risk staff on 6th+ consecutive shift)
  - high: Will become critical within 24 hours
  - medium: Addressable within 48 hours
  - low: Preventative / wellness

Return ONLY a valid JSON array. No markdown, no extra text.`;

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
