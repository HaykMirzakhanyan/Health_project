/**
 * data/seedData.js
 * Generates synthetic data for "Riverside General" hospital demo.
 * Run standalone with: node data/seedData.js
 *
 * In production this would be replaced by real data pulled from
 * Firebase Firestore / PostgreSQL and an EHR integration.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  createStaffMember,
  createShift,
  createScheduleEntry,
  createPatient,
  createAppointment,
  createPendingPatient,
  createUser,
  store,
} = require('./schema');

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
const UNITS = ['ICU-1', 'ICU-2', 'MedSurg-3'];

// ---------------------------------------------------------------------------
// Random metric generators
// ---------------------------------------------------------------------------

/** Integer in [min, max] inclusive */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Float rounded to 2 decimal places in [0, 1] */
function randRatio() {
  return Math.round(Math.random() * 100) / 100;
}

/**
 * Derives a wellness score (1–5) from workload factors.
 * Starts at 5 and deducts points based on stress indicators:
 *   - High night shift ratio  → fatigue & circadian disruption
 *   - Many days without PTO   → chronic exhaustion & no recovery time
 *   - Many shifts in 14 days  → overwork in the immediate term
 *   - High hours in 30 days   → sustained overload
 * A small random ±1 wobble adds individual variation.
 */
function calcWellness(shifts14, hours30, nightRatio, ptoDays) {
  let score = 5;

  // Night shift ratio — circadian disruption
  if (nightRatio >= 0.75) score -= 2;
  else if (nightRatio >= 0.5)  score -= 1;
  else if (nightRatio >= 0.25) score -= 0.5;

  // Days without PTO — recovery deficit
  if (ptoDays >= 180) score -= 2;
  else if (ptoDays >= 90)  score -= 1.5;
  else if (ptoDays >= 45)  score -= 1;
  else if (ptoDays >= 20)  score -= 0.5;

  // Shifts in last 14 days — short-term overwork
  if (shifts14 >= 12) score -= 1.5;
  else if (shifts14 >= 10) score -= 1;
  else if (shifts14 >= 8)  score -= 0.5;

  // Hours in last 30 days — sustained load
  if (hours30 >= 280) score -= 1;
  else if (hours30 >= 200) score -= 0.5;

  // Individual variation ±1 (weighted toward centre)
  const wobble = [-1, 0, 0, 0, 1][randInt(0, 4)];
  score += wobble;

  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * Generates a full set of randomised workload metrics for one staff member.
 * Fields match the ranges specified in the project spec.
 */
function randomMetrics() {
  const shiftsLast14Days  = randInt(0, 14);
  const hoursLast30Days   = randInt(0, 30 * 12);          // 0–360
  const nightShiftRatio   = randRatio();                   // 0.00–1.00
  const daysSinceLastPTO  = randInt(1, 365);
  const wellnessScore     = calcWellness(
    shiftsLast14Days, hoursLast30Days, nightShiftRatio, daysSinceLastPTO
  );
  return { shiftsLast14Days, hoursLast30Days, nightShiftRatio, daysSinceLastPTO, wellnessScore };
}

// ---------------------------------------------------------------------------
// Staff definitions — identity only (name, role, unit, certifications).
// All workload metrics are generated at runtime by randomMetrics().
// ---------------------------------------------------------------------------
const staffDefinitions = [
  // --- ICU-1 (5 doctors: 3 day + 2 night, ordered so [0-2]=day [3-4]=night) ---
  { name: 'Linda Patel',        role: 'NP',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN', 'FNP'] },
  { name: 'Dr. Samuel Rivera',  role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Thomas Harlow',  role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Emily Zhao',     role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Marcus Flynn',   role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  // ICU-1 nursing staff
  { name: 'Maria Santos',       role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Derek Nguyen',       role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'BLS'] },
  { name: 'Aisha Kowalski',     role: 'CNA', unit: 'ICU-1',     certifications: ['BLS'] },
  { name: 'Priya Mehta',        role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },

  // --- ICU-2 (5 doctors: 3 day + 2 night, ordered so [0-2]=day [3-4]=night) ---
  { name: 'Dr. Chen Wei',       role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board', 'Pulmonary Fellowship'] },
  { name: 'Nadia Volkov',       role: 'NP',  unit: 'ICU-2',     certifications: ['ACLS', 'AGPCNP'] },
  { name: 'Dr. Priya Sharma',   role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Michael Torres', role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Aiko Tanaka',    role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board', 'Pulmonary Fellowship'] },
  // ICU-2 nursing staff
  { name: 'James Okafor',       role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Fatima Al-Rashid',   role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'BLS'] },
  { name: 'Rosa Martinez',      role: 'CNA', unit: 'ICU-2',     certifications: ['BLS'] },
  { name: 'Kevin Tremblay',     role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },

  // --- MedSurg-3 (5 doctors: 3 day + 2 night, ordered so [0-2]=day [3-4]=night) ---
  { name: 'Dr. Anjali Singh',   role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Patricia Lee',       role: 'NP',  unit: 'MedSurg-3', certifications: ['ACLS', 'FNP', 'Med-Surg Cert'] },
  { name: 'Dr. Kevin Murphy',   role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Dr. Sandra Pierce',  role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Dr. Omar Hassan',    role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  // MedSurg-3 nursing staff
  { name: 'Tamara Johnson',     role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Oliver Hayes',       role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },
  { name: 'Marcus Bell',        role: 'CNA', unit: 'MedSurg-3', certifications: ['BLS'] },
  { name: 'Yuki Tanaka',        role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Bethany Cross',      role: 'CNA', unit: 'MedSurg-3', certifications: ['BLS'] },
  { name: 'Carlos Espinoza',    role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },

  // ── Additional ICU-1 staff ────────────────────────────────────────────────
  { name: 'Dr. Rachel Kim',      role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. James Whitfield', role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board', 'Cardiology Fellowship'] },
  { name: 'Dr. Lydia Osei',      role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Sofia Reyes',         role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Brandon Scott',       role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Chloe Patterson',     role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'BLS'] },
  { name: 'Nathan Brooks',       role: 'CNA', unit: 'ICU-1',     certifications: ['BLS'] },

  // ── Additional ICU-2 staff ────────────────────────────────────────────────
  { name: 'Dr. Victor Navarro',  role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board', 'Pulmonary Fellowship'] },
  { name: 'Dr. Irene Hoffman',   role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Dr. Leonard Park',    role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Vanessa Cho',         role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Elijah Stone',        role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'BLS'] },
  { name: 'Maya Griffin',        role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Terrance Hughes',     role: 'CNA', unit: 'ICU-2',     certifications: ['BLS'] },

  // ── Additional MedSurg-3 staff ────────────────────────────────────────────
  { name: 'Dr. Gloria Mendes',   role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Dr. Ray Thornton',    role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Dr. Simone Archer',   role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Natalie Price',       role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Owen Fitzgerald',     role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },
  { name: 'Isabelle Nguyen',     role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Samuel Adeyemi',      role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },
  { name: 'Diana Ross',          role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Curtis Flemming',     role: 'CNA', unit: 'MedSurg-3', certifications: ['BLS'] },
];

// ---------------------------------------------------------------------------
// Build staff members — merge identity with randomised metrics
// ---------------------------------------------------------------------------
const seedStaff = staffDefinitions.map((def) =>
  createStaffMember({ ...def, ...randomMetrics() })
);

// ---------------------------------------------------------------------------
// Generate 30 days of historical shift data per staff member
// ---------------------------------------------------------------------------
const SHIFT_TYPES = ['day', 'evening', 'night'];

/**
 * Returns a date string N days relative to today (negative = past).
 */
function relativeDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Pick a shift type biased by the staff member's nightShiftRatio.
 */
function pickShiftType(nightRatio) {
  const r = Math.random();
  if (r < nightRatio) return 'night';
  if (r < nightRatio + (1 - nightRatio) / 2) return 'evening';
  return 'day';
}

/**
 * Returns a realistic per-staff patient load for a given unit and date.
 *
 * Models three layers of variation:
 *   1. Day-of-week  — weekdays busier than weekends (Mon/Tue/Wed peak)
 *   2. Week-of-month — week 2–3 simulate a mid-month surge (post-weekend
 *      admissions, elective procedure backlog)
 *   3. Unit-specific spikes — ICU-1 has a Monday cardiac cath spike;
 *      ICU-2 has a Wednesday thoracic surgery influx;
 *      MedSurg-3 spikes Friday as elective step-downs arrive
 *
 * ICU staff ratios are 1:2, so an ICU nurse carries 2–4 patients.
 * MedSurg ratios are 1:5, so a MedSurg nurse carries 4–8 patients.
 */
function realisticPatientLoad(unit, dateIso) {
  const date    = new Date(dateIso);
  const dow     = date.getDay();          // 0 = Sunday … 6 = Saturday
  const dayOfMonth = date.getDate();
  const weekOfMonth = Math.min(Math.floor((dayOfMonth - 1) / 7), 3); // 0–3

  // Day-of-week multipliers — Mon(1)/Tue(2)/Wed(3) are busiest
  const DOW_FACTOR = [0.70, 1.12, 1.18, 1.16, 1.08, 0.90, 0.65];

  // Week-of-month multipliers — weeks 1 & 2 tend to be busier
  const WEEK_FACTOR = [0.90, 1.18, 1.22, 0.95];

  const dowF  = DOW_FACTOR[dow];
  const weekF = WEEK_FACTOR[weekOfMonth];

  if (unit === 'ICU-1') {
    // Monday cardiac-cath spike (+0.5 extra patients on average)
    const spike  = dow === 1 ? 0.6 : 0;
    const base   = (2.3 * dowF * weekF) + spike;
    const jitter = (Math.random() - 0.5) * 0.8;
    return Math.max(1, Math.min(4, Math.round(base + jitter)));
  }

  if (unit === 'ICU-2') {
    // Wednesday thoracic-surgery influx
    const spike  = dow === 3 ? 0.7 : 0;
    const base   = (2.1 * dowF * weekF) + spike;
    const jitter = (Math.random() - 0.5) * 0.8;
    return Math.max(1, Math.min(4, Math.round(base + jitter)));
  }

  // MedSurg-3 — Friday elective step-downs, lower Sunday/Monday
  const spike  = dow === 5 ? 1.2 : 0;
  const base   = (5.2 * dowF * weekF) + spike;
  const jitter = (Math.random() - 0.5) * 2.0;
  return Math.max(2, Math.min(9, Math.round(base + jitter)));
}

const seedShifts = [];

seedStaff.forEach((member) => {
  // Spread ~60–70% of past 30 days as worked shifts
  for (let dayOffset = -30; dayOffset < 0; dayOffset++) {
    // Skip some days to simulate days off (~35% chance of day off)
    if (Math.random() < 0.35) continue;

    const dateIso   = relativeDate(dayOffset);
    const shiftType = pickShiftType(member.nightShiftRatio);

    seedShifts.push(
      createShift({
        staffId:     member.id,
        unit:        member.unit,
        date:        dateIso,
        type:        shiftType,
        hoursWorked: 12,
        patientLoad: realisticPatientLoad(member.unit, dateIso),
      })
    );
  }
});

// ---------------------------------------------------------------------------
// Upcoming scheduled procedures / surgeries for the next 72 hours
// These feed Agent 1 (Demand Forecasting) as known demand spikes.
// ---------------------------------------------------------------------------
const seedProcedures = [
  // ── Today ──────────────────────────────────────────────────────────────
  {
    id: uuidv4(), unit: 'ICU-1', date: relativeDate(0),
    type: 'Cardiac Cath x2', estimatedAdditionalCensus: 2,
    notes: 'Back-to-back cath lab cases, expect 2 ICU-1 admissions post-procedure',
  },
  {
    id: uuidv4(), unit: 'ICU-2', date: relativeDate(0),
    type: 'Emergent Intubation x1', estimatedAdditionalCensus: 1,
    notes: 'Respiratory failure transfer from ED, immediate ICU-2 bed needed',
  },
  {
    id: uuidv4(), unit: 'MedSurg-3', date: relativeDate(0),
    type: 'Elective Cholecystectomy x2', estimatedAdditionalCensus: 2,
    notes: 'Two lap chole cases; overnight MedSurg-3 obs expected',
  },

  // ── Day +1 ─────────────────────────────────────────────────────────────
  {
    id: uuidv4(), unit: 'ICU-2', date: relativeDate(1),
    type: 'Major Thoracic Surgery x1', estimatedAdditionalCensus: 1,
    notes: 'Lobectomy scheduled for 0800; patient expected in ICU-2 post-op',
  },
  {
    id: uuidv4(), unit: 'MedSurg-3', date: relativeDate(1),
    type: 'Elective Joint Replacement x3', estimatedAdditionalCensus: 3,
    notes: 'Three hip replacements; all expected to step down to MedSurg-3',
  },
  {
    id: uuidv4(), unit: 'ICU-1', date: relativeDate(1),
    type: 'TAVR Procedure x1', estimatedAdditionalCensus: 1,
    notes: 'Transcatheter aortic valve replacement; ICU-1 post-op monitoring',
  },
  {
    id: uuidv4(), unit: 'MedSurg-3', date: relativeDate(1),
    type: 'Colonoscopy / Polypectomy x4', estimatedAdditionalCensus: 1,
    notes: 'Four GI cases; one polyp removal may require overnight stay',
  },

  // ── Day +2 ─────────────────────────────────────────────────────────────
  {
    id: uuidv4(), unit: 'ICU-2', date: relativeDate(2),
    type: 'CABG Surgery x1', estimatedAdditionalCensus: 1,
    notes: 'Coronary artery bypass; high acuity post-op, will need 1:1 nursing',
  },
  {
    id: uuidv4(), unit: 'MedSurg-3', date: relativeDate(2),
    type: 'Appendectomy x2', estimatedAdditionalCensus: 2,
    notes: 'Two laparoscopic appendectomies; routine admissions expected',
  },
  {
    id: uuidv4(), unit: 'ICU-1', date: relativeDate(2),
    type: 'Aortic Aneurysm Repair x1', estimatedAdditionalCensus: 1,
    notes: 'Elective EVAR scheduled 0700; prolonged ICU-1 stay expected (48–72 hrs)',
  },
  {
    id: uuidv4(), unit: 'MedSurg-3', date: relativeDate(2),
    type: 'Spinal Fusion x1', estimatedAdditionalCensus: 1,
    notes: 'L4-L5 fusion; PT/OT consult day 1, multi-day MedSurg-3 stay expected',
  },
];

// ---------------------------------------------------------------------------
// Today's schedule — each staff member's shift for today with clock times
// and hours worked so far
// ---------------------------------------------------------------------------

const SHIFT_TIMES = {
  day:     { start: '07:00', end: '19:00' },
  evening: { start: '15:00', end: '03:00' },
  night:   { start: '19:00', end: '07:00' },
};

/**
 * How many hours has this person worked so far today?
 * Simulated by picking a random point within their shift window.
 */
function hoursWorkedSoFar(shiftType) {
  const maxHours = 12;
  if (shiftType === 'day') {
    // Day shift started at 07:00. Simulate current time between 07:00 and 19:00.
    return parseFloat((Math.random() * maxHours).toFixed(1));
  }
  if (shiftType === 'evening') return parseFloat((Math.random() * 8).toFixed(1));
  // Night staff may be finishing up — 8-12 hrs worked
  return parseFloat((8 + Math.random() * 4).toFixed(1));
}

const seedTodaySchedule = seedStaff.map((member) => {
  const shiftType = pickShiftType(member.nightShiftRatio);
  const times = SHIFT_TIMES[shiftType];
  const patientLoad =
    member.unit === 'MedSurg-3'
      ? Math.floor(Math.random() * 4) + 4
      : Math.floor(Math.random() * 2) + 2;

  // Simulate ~10% absent today
  const status = Math.random() < 0.1 ? 'absent' : 'on_shift';

  return createScheduleEntry({
    staffId: member.id,
    staffName: member.name,
    role: member.role,
    unit: member.unit,
    shiftType,
    shiftStart: times.start,
    shiftEnd: times.end,
    hoursWorkedToday: status === 'absent' ? 0 : hoursWorkedSoFar(shiftType),
    patientLoad: status === 'absent' ? 0 : patientLoad,
    status,
  });
});

// ---------------------------------------------------------------------------
// Patients — 18 fictional patients spread across the 3 units
// ---------------------------------------------------------------------------

const patientDefinitions = [
  // ICU-1 (6 patients)
  { name: 'Harold Finch',    dob: '1948-03-12', room: '101A', unit: 'ICU-1', diagnosis: 'Acute MI post-PCI',           acuityLevel: 'critical' },
  { name: 'Donna Sherwood',  dob: '1955-07-29', room: '101B', unit: 'ICU-1', diagnosis: 'Septic shock',                acuityLevel: 'critical' },
  { name: 'Marcus Webb',     dob: '1962-11-04', room: '102A', unit: 'ICU-1', diagnosis: 'Respiratory failure on vent', acuityLevel: 'critical' },
  { name: 'Gloria Tran',     dob: '1971-05-18', room: '102B', unit: 'ICU-1', diagnosis: 'Post-cardiac arrest',        acuityLevel: 'high'     },
  { name: 'Stanley Ruiz',    dob: '1958-09-30', room: '103A', unit: 'ICU-1', diagnosis: 'Acute kidney injury',        acuityLevel: 'high'     },
  { name: 'Irene Blackwood', dob: '1943-02-15', room: '103B', unit: 'ICU-1', diagnosis: 'GI bleed, hemodynamic instability', acuityLevel: 'high' },

  // ICU-2 (6 patients)
  { name: 'Raymond Park',    dob: '1966-08-22', room: '201A', unit: 'ICU-2', diagnosis: 'Post-lobectomy',             acuityLevel: 'critical' },
  { name: 'Celeste Dumont',  dob: '1952-12-09', room: '201B', unit: 'ICU-2', diagnosis: 'ARDS on ECMO',              acuityLevel: 'critical' },
  { name: 'George Osei',     dob: '1960-04-01', room: '202A', unit: 'ICU-2', diagnosis: 'Pulmonary embolism',        acuityLevel: 'high'     },
  { name: 'Miriam Castro',   dob: '1975-06-14', room: '202B', unit: 'ICU-2', diagnosis: 'Diabetic ketoacidosis',     acuityLevel: 'medium'   },
  { name: 'Theodore Lane',   dob: '1949-10-27', room: '203A', unit: 'ICU-2', diagnosis: 'CHF exacerbation',         acuityLevel: 'high'     },
  { name: 'Angela Moss',     dob: '1968-01-03', room: '203B', unit: 'ICU-2', diagnosis: 'Post-CABG day 1',          acuityLevel: 'critical' },

  // MedSurg-3 (6 patients)
  { name: 'Philip Garrett',  dob: '1978-07-08', room: '301',  unit: 'MedSurg-3', diagnosis: 'Post-op hip replacement',    acuityLevel: 'medium' },
  { name: 'Joyce Nakamura',  dob: '1985-03-25', room: '302',  unit: 'MedSurg-3', diagnosis: 'Appendectomy recovery',      acuityLevel: 'low'    },
  { name: 'Bernard Ellis',   dob: '1953-11-17', room: '303',  unit: 'MedSurg-3', diagnosis: 'COPD exacerbation',          acuityLevel: 'medium' },
  { name: 'Sandra Kim',      dob: '1990-09-02', room: '304',  unit: 'MedSurg-3', diagnosis: 'Cellulitis, IV antibiotics', acuityLevel: 'low'    },
  { name: 'Frank Morales',   dob: '1947-05-31', room: '305',  unit: 'MedSurg-3', diagnosis: 'Pneumonia, elderly',         acuityLevel: 'medium' },
  { name: 'Helen Chu',       dob: '1969-12-20', room: '306',  unit: 'MedSurg-3', diagnosis: 'Post-op knee replacement',   acuityLevel: 'medium' },

  // ── ICU-1 additional patients (rooms 104A–116B) ───────────────────────────
  { name: 'Arthur Weston',        dob: '1950-04-11', room: '104A', unit: 'ICU-1', diagnosis: 'Cardiogenic shock post-MI',               acuityLevel: 'critical' },
  { name: 'Doris Fletcher',       dob: '1944-08-30', room: '104B', unit: 'ICU-1', diagnosis: 'Aortic dissection, Type A',                acuityLevel: 'critical' },
  { name: 'Eugene Palmer',        dob: '1963-01-25', room: '105A', unit: 'ICU-1', diagnosis: 'Ventricular fibrillation arrest — ROSC',   acuityLevel: 'critical' },
  { name: 'Lorraine Duke',        dob: '1957-06-14', room: '105B', unit: 'ICU-1', diagnosis: 'Complete heart block, temp pacemaker',     acuityLevel: 'high'     },
  { name: 'Chester Vaughn',       dob: '1961-10-03', room: '106A', unit: 'ICU-1', diagnosis: 'Decompensated CHF, BiPAP',                 acuityLevel: 'high'     },
  { name: 'Mabel Torres',         dob: '1939-12-19', room: '106B', unit: 'ICU-1', diagnosis: 'End-stage renal disease, fluid overload',  acuityLevel: 'high'     },
  { name: 'Reginald Sutton',      dob: '1970-02-07', room: '107A', unit: 'ICU-1', diagnosis: 'Acute liver failure, hepatic encephalopathy', acuityLevel: 'critical' },
  { name: 'Harriet Cross',        dob: '1967-09-22', room: '107B', unit: 'ICU-1', diagnosis: 'Pulmonary oedema, vasopressor support',    acuityLevel: 'critical' },
  { name: 'Douglas Carr',         dob: '1953-05-16', room: '108A', unit: 'ICU-1', diagnosis: 'Hypertensive emergency, IV labetalol',     acuityLevel: 'high'     },
  { name: 'Norma Stephenson',     dob: '1948-11-01', room: '108B', unit: 'ICU-1', diagnosis: 'Post-cardiac surgery day 2, monitoring',   acuityLevel: 'high'     },
  { name: 'Clifford Yates',       dob: '1975-07-28', room: '109A', unit: 'ICU-1', diagnosis: 'Myocarditis — troponin trending up',       acuityLevel: 'high'     },
  { name: 'Agnes Hartley',        dob: '1942-03-04', room: '109B', unit: 'ICU-1', diagnosis: 'Septic shock, norepinephrine drip',        acuityLevel: 'critical' },
  { name: 'Bernard Novak',        dob: '1959-08-17', room: '110A', unit: 'ICU-1', diagnosis: 'Stroke, large vessel occlusion',           acuityLevel: 'critical' },
  { name: 'Ethel Cunningham',     dob: '1946-01-13', room: '110B', unit: 'ICU-1', diagnosis: 'Pulmonary embolism, tPA administered',     acuityLevel: 'critical' },
  { name: 'Vernon Griffith',      dob: '1968-04-20', room: '111A', unit: 'ICU-1', diagnosis: 'Diabetic ketoacidosis, insulin drip',      acuityLevel: 'medium'   },
  { name: 'Doreen Holt',          dob: '1980-09-09', room: '111B', unit: 'ICU-1', diagnosis: 'Anaphylaxis, post-epinephrine monitoring', acuityLevel: 'medium'   },
  { name: 'Lionel Prescott',      dob: '1956-06-26', room: '112A', unit: 'ICU-1', diagnosis: 'GI haemorrhage, endoscopy pending',        acuityLevel: 'high'     },
  { name: 'Vivian Chang',         dob: '1972-12-05', room: '112B', unit: 'ICU-1', diagnosis: 'Acute pancreatitis, haemodynamic instability', acuityLevel: 'high' },

  // ── ICU-2 additional patients (rooms 204A–216B) ───────────────────────────
  { name: 'Franklin Bowen',       dob: '1951-03-08', room: '204A', unit: 'ICU-2', diagnosis: 'ARDS — lung-protective ventilation',         acuityLevel: 'critical' },
  { name: 'Constance Mercer',     dob: '1960-07-15', room: '204B', unit: 'ICU-2', diagnosis: 'Post-pneumonectomy, respiratory monitoring', acuityLevel: 'critical' },
  { name: 'Stewart Holbrook',     dob: '1955-11-29', room: '205A', unit: 'ICU-2', diagnosis: 'Severe community-acquired pneumonia, vent',  acuityLevel: 'critical' },
  { name: 'Millicent Ashby',      dob: '1949-04-03', room: '205B', unit: 'ICU-2', diagnosis: 'Pleural empyema, chest tube drainage',       acuityLevel: 'high'     },
  { name: 'Cornelius Frost',      dob: '1964-01-18', room: '206A', unit: 'ICU-2', diagnosis: 'Mesothelioma — pain & symptom management',  acuityLevel: 'high'     },
  { name: 'Rosalind Chambers',    dob: '1978-06-22', room: '206B', unit: 'ICU-2', diagnosis: 'Pulmonary hypertension, prostacyclin drip',  acuityLevel: 'critical' },
  { name: 'Reginald Fowler',      dob: '1943-09-14', room: '207A', unit: 'ICU-2', diagnosis: 'PE with right heart strain, heparin drip',  acuityLevel: 'critical' },
  { name: 'Harriet Bloom',        dob: '1970-02-28', room: '207B', unit: 'ICU-2', diagnosis: 'Bronchial asthma — status asthmaticus',      acuityLevel: 'high'     },
  { name: 'Leopold Haines',       dob: '1957-08-11', room: '208A', unit: 'ICU-2', diagnosis: 'Post-lung transplant day 5, tacrolimus',    acuityLevel: 'critical' },
  { name: 'Gwendolyn Marsh',      dob: '1966-05-30', room: '208B', unit: 'ICU-2', diagnosis: 'Haemoptysis, bronchoscopy scheduled',       acuityLevel: 'high'     },
  { name: 'Percival Dunn',        dob: '1952-10-07', room: '209A', unit: 'ICU-2', diagnosis: 'Type 1 respiratory failure, NIV',           acuityLevel: 'high'     },
  { name: 'Agatha Moore',         dob: '1947-01-24', room: '209B', unit: 'ICU-2', diagnosis: 'Pleural effusion, drainage in progress',    acuityLevel: 'medium'   },
  { name: 'Sylvester Banks',      dob: '1973-07-12', room: '210A', unit: 'ICU-2', diagnosis: 'COVID pneumonia — high-flow O2',            acuityLevel: 'high'     },
  { name: 'Matilda Hurst',        dob: '1961-03-19', room: '210B', unit: 'ICU-2', diagnosis: 'Lung cancer, obstructive pneumonia',        acuityLevel: 'high'     },
  { name: 'Ambrose Payne',        dob: '1944-12-31', room: '211A', unit: 'ICU-2', diagnosis: 'Septic shock, pulmonary source',            acuityLevel: 'critical' },
  { name: 'Lavinia Perkins',      dob: '1983-04-06', room: '211B', unit: 'ICU-2', diagnosis: 'Post-VATS resection, pain management',      acuityLevel: 'medium'   },
  { name: 'Archibald Stone',      dob: '1953-09-25', room: '212A', unit: 'ICU-2', diagnosis: 'Tracheostomy, ventilator weaning',          acuityLevel: 'high'     },
  { name: 'Cecilia Vance',        dob: '1969-06-08', room: '212B', unit: 'ICU-2', diagnosis: 'Tracheobronchomalacia, stent placement',    acuityLevel: 'high'     },

  // ── MedSurg-3 additional patients (rooms 307–370) ────────────────────────
  { name: 'Ronald Hooper',        dob: '1955-02-14', room: '307',  unit: 'MedSurg-3', diagnosis: 'Post-op spinal fusion day 2',             acuityLevel: 'medium' },
  { name: 'Geraldine Watts',      dob: '1963-08-09', room: '308',  unit: 'MedSurg-3', diagnosis: 'UTI with sepsis, IV antibiotics',          acuityLevel: 'medium' },
  { name: 'Theodore Marsh',       dob: '1979-11-17', room: '309',  unit: 'MedSurg-3', diagnosis: 'Bowel obstruction, conservative management', acuityLevel: 'medium' },
  { name: 'Beatrice Holloway',    dob: '1950-04-22', room: '310',  unit: 'MedSurg-3', diagnosis: 'Pneumonia, oral antibiotics step-down',    acuityLevel: 'low'    },
  { name: 'Wallace Grant',        dob: '1972-07-31', room: '311',  unit: 'MedSurg-3', diagnosis: 'Diabetic foot wound, IV antibiotics',      acuityLevel: 'medium' },
  { name: 'Ophelia Simmons',      dob: '1987-01-05', room: '312',  unit: 'MedSurg-3', diagnosis: 'Post-op cholecystectomy day 1',            acuityLevel: 'low'    },
  { name: 'Thaddeus Norris',      dob: '1945-10-18', room: '313',  unit: 'MedSurg-3', diagnosis: 'COPD — oral steroid taper monitoring',    acuityLevel: 'medium' },
  { name: 'Cordelia Benson',      dob: '1961-06-03', room: '314',  unit: 'MedSurg-3', diagnosis: 'Chest pain rule-out, telemetry obs',       acuityLevel: 'medium' },
  { name: 'Barnaby Webb',         dob: '1958-12-27', room: '315',  unit: 'MedSurg-3', diagnosis: 'Post-colonoscopy polypectomy observation', acuityLevel: 'low'    },
  { name: 'Josephine Drake',      dob: '1974-05-10', room: '316',  unit: 'MedSurg-3', diagnosis: 'Knee replacement rehabilitation, PT/OT',   acuityLevel: 'low'    },
  { name: 'Algernon Fox',         dob: '1948-09-16', room: '317',  unit: 'MedSurg-3', diagnosis: 'Diverticulitis, IV antibiotics',            acuityLevel: 'medium' },
  { name: 'Winifred Cole',        dob: '1966-03-29', room: '318',  unit: 'MedSurg-3', diagnosis: 'Hyponatraemia, fluid restriction protocol', acuityLevel: 'medium' },
  { name: 'Reginald Hall',        dob: '1980-11-01', room: '319',  unit: 'MedSurg-3', diagnosis: 'Asthma exacerbation, nebs & steroids',     acuityLevel: 'low'    },
  { name: 'Millicent Ford',       dob: '1953-07-20', room: '320',  unit: 'MedSurg-3', diagnosis: 'Post-thyroidectomy calcium monitoring',    acuityLevel: 'medium' },
  { name: 'Cornelius Shaw',       dob: '1969-02-08', room: '321',  unit: 'MedSurg-3', diagnosis: 'Atrial fibrillation, rate-control therapy', acuityLevel: 'medium' },
  { name: 'Lavinia Hunt',         dob: '1943-08-25', room: '322',  unit: 'MedSurg-3', diagnosis: 'Pressure ulcer, wound vac therapy',         acuityLevel: 'medium' },
  { name: 'Percival Armstrong',   dob: '1976-04-14', room: '323',  unit: 'MedSurg-3', diagnosis: 'Pyelonephritis, IV ceftriaxone',            acuityLevel: 'low'    },
  { name: 'Sylvia Doyle',         dob: '1959-10-30', room: '324',  unit: 'MedSurg-3', diagnosis: 'GI bleed — haemoglobin monitoring',         acuityLevel: 'medium' },
  { name: 'Augustus Bloom',       dob: '1982-01-19', room: '325',  unit: 'MedSurg-3', diagnosis: 'Crohn flare, IV steroids',                  acuityLevel: 'medium' },
  { name: 'Rosalind Kent',        dob: '1947-06-06', room: '326',  unit: 'MedSurg-3', diagnosis: 'Post-mastectomy drain monitoring',          acuityLevel: 'low'    },
  { name: 'Rupert Owens',         dob: '1973-09-03', room: '327',  unit: 'MedSurg-3', diagnosis: 'Post-prostatectomy, urological monitoring', acuityLevel: 'low'    },
  { name: 'Agatha Patel',         dob: '1964-12-12', room: '328',  unit: 'MedSurg-3', diagnosis: 'Pancreatitis, NPO status',                  acuityLevel: 'medium' },
  { name: 'Bertram Quinn',        dob: '1956-03-07', room: '329',  unit: 'MedSurg-3', diagnosis: 'Cellulitis — facial, IV amoxicillin',       acuityLevel: 'low'    },
  { name: 'Clarissa Burns',       dob: '1990-07-24', room: '330',  unit: 'MedSurg-3', diagnosis: 'Post-appendectomy, routine observation',    acuityLevel: 'low'    },
  { name: 'Desmond Riley',        dob: '1946-11-15', room: '331',  unit: 'MedSurg-3', diagnosis: 'COPD with pneumonia, oral abx step-down',   acuityLevel: 'medium' },
  { name: 'Esmeralda Fox',        dob: '1977-05-28', room: '332',  unit: 'MedSurg-3', diagnosis: 'DVT, therapeutic anticoagulation',          acuityLevel: 'low'    },
  { name: 'Fitzgerald Lamb',      dob: '1960-09-11', room: '333',  unit: 'MedSurg-3', diagnosis: 'Post-ERCP pancreatitis monitoring',         acuityLevel: 'medium' },
  { name: 'Gertrude Walton',      dob: '1953-01-04', room: '334',  unit: 'MedSurg-3', diagnosis: 'Dehydration, IV fluids',                    acuityLevel: 'low'    },
  { name: 'Hamilton Cross',       dob: '1984-04-17', room: '335',  unit: 'MedSurg-3', diagnosis: 'Hypertensive urgency, oral amlodipine',     acuityLevel: 'low'    },
  { name: 'Imogen Walsh',         dob: '1971-08-22', room: '336',  unit: 'MedSurg-3', diagnosis: 'Post-op hernia repair, pain management',    acuityLevel: 'low'    },
  { name: 'Jasper Griffith',      dob: '1949-02-03', room: '337',  unit: 'MedSurg-3', diagnosis: 'Sepsis, UTI source, oral step-down',        acuityLevel: 'medium' },
  { name: 'Katherine Potts',      dob: '1967-06-19', room: '338',  unit: 'MedSurg-3', diagnosis: 'Anaemia workup, transfusion pending',       acuityLevel: 'medium' },
  { name: 'Lancelot Dunn',        dob: '1975-10-08', room: '339',  unit: 'MedSurg-3', diagnosis: 'Rhabdomyolysis, IV hydration protocol',     acuityLevel: 'medium' },
  { name: 'Matilda Crane',        dob: '1942-03-31', room: '340',  unit: 'MedSurg-3', diagnosis: 'Hip fracture, surgical hold — cardiology clearance', acuityLevel: 'medium' },
  { name: 'Nathaniel King',       dob: '1985-07-14', room: '341',  unit: 'MedSurg-3', diagnosis: 'Colitis — IV steroids',                     acuityLevel: 'medium' },
  { name: 'Octavia Saunders',     dob: '1958-12-29', room: '342',  unit: 'MedSurg-3', diagnosis: 'Post-op sigmoid resection, ileostomy care', acuityLevel: 'medium' },
  { name: 'Ptolemy Harding',      dob: '1952-05-23', room: '343',  unit: 'MedSurg-3', diagnosis: 'Alcohol withdrawal, CIWA protocol',         acuityLevel: 'high'   },
  { name: 'Quintessa Barker',     dob: '1979-09-06', room: '344',  unit: 'MedSurg-3', diagnosis: 'Renal calculus, pain management',           acuityLevel: 'low'    },
  { name: 'Reginald Marsh',       dob: '1944-01-17', room: '345',  unit: 'MedSurg-3', diagnosis: 'Stroke step-down, rehabilitation',          acuityLevel: 'medium' },
  { name: 'Seraphina Blaine',     dob: '1970-06-30', room: '346',  unit: 'MedSurg-3', diagnosis: 'Post-gastric sleeve day 2, monitoring',     acuityLevel: 'medium' },
  { name: 'Tobias Sherwood',      dob: '1963-03-13', room: '347',  unit: 'MedSurg-3', diagnosis: 'Acute gout flare, IV colchicine',           acuityLevel: 'low'    },
  { name: 'Ursula Blackwood',     dob: '1957-08-04', room: '348',  unit: 'MedSurg-3', diagnosis: 'Post-cataract surgery, ophthalmology obs',  acuityLevel: 'low'    },
  { name: 'Vincent Mercer',       dob: '1981-11-21', room: '349',  unit: 'MedSurg-3', diagnosis: 'Pericarditis, anti-inflammatory therapy',   acuityLevel: 'medium' },
  { name: 'Wilhelmina Porter',    dob: '1948-04-08', room: '350',  unit: 'MedSurg-3', diagnosis: 'Hyperosmolar hyperglycaemic state',         acuityLevel: 'medium' },
  { name: 'Xerxes Barlow',        dob: '1973-02-16', room: '351',  unit: 'MedSurg-3', diagnosis: 'Post-renal biopsy, haematuria monitoring',  acuityLevel: 'medium' },
  { name: 'Yvonne Castle',        dob: '1966-07-09', room: '352',  unit: 'MedSurg-3', diagnosis: 'Lupus flare, IV methylprednisolone',        acuityLevel: 'medium' },
  { name: 'Zachary Sutton',       dob: '1954-10-24', room: '353',  unit: 'MedSurg-3', diagnosis: 'Post-parotidectomy, facial nerve monitoring', acuityLevel: 'low'  },
  { name: 'Adeline Frost',        dob: '1988-01-11', room: '354',  unit: 'MedSurg-3', diagnosis: 'Opioid overdose, NARCAN, psychiatry consult', acuityLevel: 'high' },
  { name: 'Beaumont Drake',       dob: '1961-05-26', room: '355',  unit: 'MedSurg-3', diagnosis: 'Haematemesis, GI follow-up',                acuityLevel: 'medium' },
  { name: 'Clementine Ross',      dob: '1976-09-17', room: '356',  unit: 'MedSurg-3', diagnosis: 'Post-laparoscopic Nissen fundoplication',   acuityLevel: 'low'    },
  { name: 'Dominic Holt',         dob: '1945-12-02', room: '357',  unit: 'MedSurg-3', diagnosis: 'Cellulitis — bilateral lower limb',         acuityLevel: 'medium' },
  { name: 'Elspeth Caldwell',     dob: '1983-06-15', room: '358',  unit: 'MedSurg-3', diagnosis: 'Fibromyalgia flare, pain management protocol', acuityLevel: 'low' },
  { name: 'Ferdinand Hawkins',    dob: '1940-03-20', room: '359',  unit: 'MedSurg-3', diagnosis: 'Hypokalemia, IV potassium replacement',     acuityLevel: 'low'    },
  { name: 'Giselle Warren',       dob: '1968-08-13', room: '360',  unit: 'MedSurg-3', diagnosis: 'Post-TURP, urological monitoring',          acuityLevel: 'low'    },
  { name: 'Horatio Simms',        dob: '1956-04-27', room: '361',  unit: 'MedSurg-3', diagnosis: 'Ascending cholangitis, IV antibiotics',     acuityLevel: 'high'   },
  { name: 'Isolde Marsh',         dob: '1991-11-08', room: '362',  unit: 'MedSurg-3', diagnosis: 'Anorexia nervosa, nutritional support',     acuityLevel: 'medium' },
  { name: 'Jasper Flynn',         dob: '1959-07-03', room: '363',  unit: 'MedSurg-3', diagnosis: 'Post-cardiac stent placement, monitoring',  acuityLevel: 'medium' },
  { name: 'Lavinia Trent',        dob: '1974-02-22', room: '364',  unit: 'MedSurg-3', diagnosis: 'Hyperkalemia, cardiac monitoring',          acuityLevel: 'high'   },
  { name: 'Montgomery Bell',      dob: '1950-09-30', room: '365',  unit: 'MedSurg-3', diagnosis: 'Post-op inguinal hernia repair',            acuityLevel: 'low'    },
  { name: 'Norah Keating',        dob: '1982-12-07', room: '366',  unit: 'MedSurg-3', diagnosis: 'Ectopic pregnancy, post-op observation',   acuityLevel: 'medium' },
  { name: 'Oberon Walsh',         dob: '1947-05-14', room: '367',  unit: 'MedSurg-3', diagnosis: 'MRSA wound, contact-precaution antibiotics', acuityLevel: 'medium' },
  { name: 'Patience Lawson',      dob: '1975-10-21', room: '368',  unit: 'MedSurg-3', diagnosis: 'Thyroid storm — beta-blocker & PTU',       acuityLevel: 'high'   },
  { name: 'Quillan Barrett',      dob: '1962-03-16', room: '369',  unit: 'MedSurg-3', diagnosis: 'Post-op bowel resection, ileostomy care',   acuityLevel: 'medium' },
  { name: 'Rowena Stafford',      dob: '1988-08-29', room: '370',  unit: 'MedSurg-3', diagnosis: 'Post-partum complication, OB-GYN consult', acuityLevel: 'medium' },
];

// Assign nurses and doctors to patients by unit
function assignedStaffForUnit(unit) {
  const nurses = seedStaff.filter((s) => s.unit === unit && (s.role === 'RN' || s.role === 'NP'));
  const doctors = seedStaff.filter((s) => s.unit === unit && s.role === 'MD');
  return {
    nurseId:  nurses[Math.floor(Math.random() * nurses.length)]?.id || null,
    doctorId: doctors[Math.floor(Math.random() * doctors.length)]?.id || null,
  };
}

const seedPatients = patientDefinitions.map((def) => {
  const { nurseId, doctorId } = assignedStaffForUnit(def.unit);
  const admitDaysAgo = Math.floor(Math.random() * 7) + 1;
  const admitDate = new Date();
  admitDate.setDate(admitDate.getDate() - admitDaysAgo);

  return createPatient({
    ...def,
    admittedDate: admitDate.toISOString().split('T')[0],
    assignedNurseId: nurseId,
    assignedDoctorId: doctorId,
  });
});

// ---------------------------------------------------------------------------
// Appointments — 2–3 per patient today
// ---------------------------------------------------------------------------

const APPOINTMENT_TYPES = [
  'Morning Vitals & Assessment',
  'Lab Draw',
  'Medication Administration',
  'Physician Rounds',
  'Physical Therapy',
  'Wound Care',
  'Radiology — Chest X-Ray',
  'Cardiology Consult',
  'Dietary Consult',
  'Discharge Planning',
  'Echo/EKG',
  'Respiratory Therapy',
  'Pain Management Review',
];

const today = new Date().toISOString().split('T')[0];

function randomTime(startHour, endHour) {
  const hour = startHour + Math.floor(Math.random() * (endHour - startHour));
  const min = Math.random() < 0.5 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${min}`;
}

const seedAppointments = [];

seedPatients.forEach((patient) => {
  const numAppts = Math.floor(Math.random() * 2) + 2; // 2–3 appointments each
  const usedTypes = new Set();

  for (let i = 0; i < numAppts; i++) {
    let type;
    do {
      type = APPOINTMENT_TYPES[Math.floor(Math.random() * APPOINTMENT_TYPES.length)];
    } while (usedTypes.has(type));
    usedTypes.add(type);

    // Assign a staff member from the same unit
    const unitStaff = seedStaff.filter((s) => s.unit === patient.unit);
    const assignedStaff = unitStaff[Math.floor(Math.random() * unitStaff.length)];

    const statusRoll = Math.random();
    const status =
      statusRoll < 0.3 ? 'completed' :
      statusRoll < 0.4 ? 'in_progress' :
      'scheduled';

    seedAppointments.push(
      createAppointment({
        patientId:      patient.id,
        patientName:    patient.name,
        type,
        date:           today,
        time:           randomTime(7, 20),
        unit:           patient.unit,
        room:           patient.room,
        assignedStaffId: assignedStaff?.id || null,
        status,
        notes: status === 'completed' ? 'Completed without incident.' : '',
      })
    );
  }
});

// Sort appointments chronologically
seedAppointments.sort((a, b) => a.time.localeCompare(b.time));

// ---------------------------------------------------------------------------
// Future schedule — days +1 through +14, one entry per staff member per day
// ---------------------------------------------------------------------------
const seedFutureSchedule = [];

for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
  const dateStr = relativeDate(dayOffset).split('T')[0];

  seedStaff.forEach((member) => {
    const shiftType = pickShiftType(member.nightShiftRatio);
    const times     = SHIFT_TIMES[shiftType];
    const status    = Math.random() < 0.1 ? 'absent' : 'scheduled';
    const patientLoad = member.unit === 'MedSurg-3'
      ? Math.floor(Math.random() * 4) + 4
      : Math.floor(Math.random() * 2) + 2;

    seedFutureSchedule.push(
      createScheduleEntry({
        staffId:          member.id,
        staffName:        member.name,
        role:             member.role,
        unit:             member.unit,
        date:             dateStr,
        shiftType,
        shiftStart:       times.start,
        shiftEnd:         times.end,
        hoursWorkedToday: 0,
        patientLoad:      status === 'absent' ? 0 : patientLoad,
        status,
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Pending patients — 20 patients needing appointments in the next two weeks
// ---------------------------------------------------------------------------
const PENDING_REASONS = {
  'ICU-1': [
    'Post-cardiac catheterisation monitoring',
    'STEMI follow-up — step-down from CCU',
    'Hypertensive crisis management',
    'Acute decompensated heart failure',
    'Post-ablation cardiac monitoring',
  ],
  'ICU-2': [
    'Post-thoracic surgery recovery',
    'COPD exacerbation with respiratory failure',
    'Pneumonia — high-flow oxygen requirement',
    'Pulmonary embolism — anticoagulation initiation',
    'Post-CABG day-2 transfer from surgical ICU',
  ],
  'MedSurg-3': [
    'Hip replacement post-operative care',
    'Appendectomy recovery — routine obs',
    'Cellulitis — IV antibiotics course',
    'Bowel obstruction — conservative management',
    'Diabetic foot wound care',
    'COPD stable — oral-steroid taper monitoring',
    'Knee replacement rehabilitation',
    'Post-colonoscopy observation',
    'Chest pain rule-out — telemetry monitoring',
    'Urinary tract infection — IV antibiotics',
  ],
};

const PENDING_NAMES = [
  'Arthur Pemberton',  'Sylvia Nakashima', 'Robert Okafor',    'Diana Chen',
  'Harold Stein',      'Valentina Cruz',   'Eugene Marsh',      'Constance Webb',
  'Franklin Diaz',     'Miriam Holloway',  'Jerome Patten',     'Ingrid Sorenson',
  'Chester Yamamoto',  'Rosalie Fontaine', 'Augustus Cole',     'Harriet Nguyen',
  'Leopold Grant',     'Millicent Ashby',  'Percival Wu',       'Agatha Ferreira',
];

const PENDING_PRIORITIES = ['low', 'medium', 'medium', 'high', 'urgent'];

const seedPendingPatients = PENDING_NAMES.map((name, i) => {
  const unit      = UNITS[i % 3];
  const reasons   = PENDING_REASONS[unit];
  const reason    = reasons[i % reasons.length];
  const priority  = PENDING_PRIORITIES[i % PENDING_PRIORITIES.length];
  const maxDays   = priority === 'urgent' ? 3 : priority === 'high' ? 6 : 14;
  const daysOut   = Math.max(1, Math.floor(Math.random() * maxDays) + 1);

  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - (40 + (i * 2) % 40));

  return createPendingPatient({
    name,
    dob:          dob.toISOString().split('T')[0],
    unit,
    reason,
    priority,
    notes:        priority === 'urgent' ? 'Flagged by ED physician — expedite scheduling.' : '',
    dateNeededBy: relativeDate(daysOut).split('T')[0],
  });
});

// ---------------------------------------------------------------------------
// User logins — one account per staff member + charge nurse + admin accounts
// NOTE: Plain text passwords for demo only. Use bcrypt in production.
// ---------------------------------------------------------------------------

/**
 * Derives a login ID from a staff name: first initial + last name, lowercase.
 * "Dr. " prefix is stripped. e.g. "Dr. Chen Wei" → "cwei"
 */
function makeLoginId(name) {
  const cleaned = name.replace(/^Dr\.\s*/i, '').trim();
  const parts = cleaned.split(' ');
  const first = parts[0];
  const last = parts[parts.length - 1];
  return (first[0] + last).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const seedUsers = [];

// Staff accounts — one per staff member
seedStaff.forEach((member) => {
  seedUsers.push(
    createUser({
      loginId:  makeLoginId(member.name),
      password: 'Staff@123',          // same password for all demo staff
      role:     'staff',
      staffId:  member.id,
      name:     member.name,
      unit:     member.unit,
    })
  );
});

// Charge nurse accounts (elevated role)
const chargeNurses = [
  { name: 'Rachel Donovan', unit: 'ICU-1',     loginId: 'rdonovan',  password: 'Charge@456' },
  { name: 'Patrick Wynn',   unit: 'ICU-2',     loginId: 'pwynn',     password: 'Charge@456' },
  { name: 'Stella Ortega',  unit: 'MedSurg-3', loginId: 'sortega',   password: 'Charge@456' },
];

chargeNurses.forEach((cn) => {
  seedUsers.push(createUser({ ...cn, role: 'charge_nurse', staffId: null }));
});

// Admin accounts
seedUsers.push(
  createUser({ loginId: 'admin',    password: 'Admin@789', role: 'admin', name: 'Hospital Admin',   unit: 'All', staffId: null }),
  createUser({ loginId: 'hradmin', password: 'Admin@789', role: 'admin', name: 'HR Administrator', unit: 'All', staffId: null })
);

// ---------------------------------------------------------------------------
// loadSeed() — populates the shared in-memory store on startup
// ---------------------------------------------------------------------------
function loadSeed() {
  store.staff           = [...seedStaff];
  store.shifts          = [...seedShifts];
  store.todaySchedule   = [...seedTodaySchedule];
  store.futureSchedule  = [...seedFutureSchedule];
  store.pendingPatients = [...seedPendingPatients];
  store.patients        = [...seedPatients];
  store.appointments    = [...seedAppointments];
  store.users           = [...seedUsers];
  store.procedures      = [...seedProcedures];

  console.log(
    `[Seed] Loaded ${store.staff.length} staff, ` +
      `${store.shifts.length} historical shifts, ` +
      `${store.todaySchedule.length} today's schedule entries, ` +
      `${store.futureSchedule.length} future schedule entries (14 days), ` +
      `${store.pendingPatients.length} pending patients, ` +
      `${store.patients.length} patients, ` +
      `${store.appointments.length} appointments, ` +
      `${store.users.length} user accounts, ` +
      `${store.procedures.length} upcoming procedures.`
  );
}

// ---------------------------------------------------------------------------
// Allow standalone execution: node data/seedData.js
// ---------------------------------------------------------------------------
if (require.main === module) {
  loadSeed();
  console.log('\nSample staff:');
  store.staff.slice(0, 3).forEach((s) => {
    console.log(`  ${s.name} (${s.role}, ${s.unit}) — burnout: ${s.burnoutRisk}`);
  });
  console.log('\nHigh-burnout staff:');
  store.staff
    .filter((s) => s.burnoutRisk === 'red')
    .forEach((s) => {
      console.log(
        `  ${s.name} — nights: ${s.nightShiftRatio * 100}%, ` +
          `PTO gap: ${s.daysSinceLastPTO}d, wellness: ${s.wellnessScore}/5`
      );
    });
}

module.exports = {
  seedStaff,
  seedShifts,
  seedTodaySchedule,
  seedFutureSchedule,
  seedPendingPatients,
  seedPatients,
  seedAppointments,
  seedUsers,
  seedProcedures,
  loadSeed,
};
