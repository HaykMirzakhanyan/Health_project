/**
 * data/schema.js
 * Data models and in-memory store for the Health Staff Scheduler.
 * In production, replace the `store` with Firebase Firestore or PostgreSQL.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Factory functions — each accepts an `overrides` object so callers can
// supply only the fields they care about while still getting safe defaults.
// ---------------------------------------------------------------------------

/**
 * Creates a StaffMember record.
 * @param {Object} overrides
 * @returns {Object}
 */
function createStaffMember(overrides = {}) {
  return {
    id: uuidv4(),
    name: '',
    role: 'RN',                 // RN | NP | MD | CNA
    unit: '',
    certifications: [],
    shiftsLast14Days: 0,
    hoursLast30Days: 0,
    nightShiftRatio: 0,         // 0–1 fraction of shifts that were night shifts
    daysSinceLastPTO: 0,
    wellnessScore: 3,           // 1–5 from weekly check-in (5 = best)
    burnoutRisk: null,          // null until Agent 3 runs; green | yellow | red
    ...overrides,
  };
}

/**
 * Creates a Shift record.
 * @param {Object} overrides
 * @returns {Object}
 */
function createShift(overrides = {}) {
  return {
    id: uuidv4(),
    staffId: '',
    unit: '',
    date: new Date().toISOString(),
    type: 'day',                // day | evening | night
    hoursWorked: 12,
    patientLoad: 4,
    ...overrides,
  };
}

/**
 * Creates a Forecast record for a single unit+date combination.
 * @param {Object} overrides
 * @returns {Object}
 */
function createForecast(overrides = {}) {
  return {
    unit: '',
    date: new Date().toISOString(),
    predictedCensus: 0,
    requiredStaff: 0,
    scheduledStaff: 0,
    gapFlag: false,             // true when scheduledStaff < requiredStaff
    ...overrides,
  };
}

/**
 * Creates an Intervention recommendation record.
 * @param {Object} overrides
 * @returns {Object}
 */
function createIntervention(overrides = {}) {
  return {
    id: uuidv4(),
    staffId: null,              // optional — null when unit-level intervention
    unit: null,                 // optional — null when individual intervention
    type: 'other',              // shift_swap | pto | redistribute | alert_charge_nurse | other
    recommendation: '',
    urgency: 'low',             // low | medium | high | critical
    approved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates a daily schedule entry for a staff member.
 * @param {Object} overrides
 * @returns {Object}
 */
function createScheduleEntry(overrides = {}) {
  return {
    id: uuidv4(),
    staffId: '',
    staffName: '',
    role: 'RN',
    unit: '',
    date: new Date().toISOString().split('T')[0],   // YYYY-MM-DD
    shiftType: 'day',                                // day | evening | night
    shiftStart: '07:00',
    shiftEnd: '19:00',
    hoursWorkedToday: 0,                             // hours clocked so far today
    patientLoad: 0,
    status: 'scheduled',                             // scheduled | on_shift | completed | absent
    ...overrides,
  };
}

/**
 * Creates a Patient record.
 * @param {Object} overrides
 * @returns {Object}
 */
function createPatient(overrides = {}) {
  return {
    id: uuidv4(),
    name: '',
    dob: '',                  // YYYY-MM-DD
    room: '',
    unit: '',
    admittedDate: new Date().toISOString().split('T')[0],
    diagnosis: '',
    assignedNurseId: null,
    assignedDoctorId: null,
    acuityLevel: 'medium',   // low | medium | high | critical
    ...overrides,
  };
}

/**
 * Creates an Appointment record.
 * @param {Object} overrides
 * @returns {Object}
 */
function createAppointment(overrides = {}) {
  return {
    id: uuidv4(),
    patientId: '',
    patientName: '',
    type: '',                  // e.g. "Cardiology Consult", "Lab Draw", etc.
    date: new Date().toISOString().split('T')[0],
    time: '09:00',             // HH:MM (24-hour)
    unit: '',
    room: '',
    assignedStaffId: null,
    status: 'scheduled',       // scheduled | in_progress | completed | cancelled
    notes: '',
    ...overrides,
  };
}

/**
 * Creates a User login record.
 * NOTE: Passwords are stored in plain text here for demo purposes only.
 * In production use bcrypt/argon2 and never store plain text passwords.
 * @param {Object} overrides
 * @returns {Object}
 */
function createUser(overrides = {}) {
  return {
    id: uuidv4(),
    loginId: '',               // e.g. "msantos"
    password: '',              // plain text — demo only
    role: 'staff',             // staff | charge_nurse | admin
    staffId: null,             // links to a StaffMember record (null for admin-only accounts)
    name: '',
    unit: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory store
// In production: swap this for Firebase Firestore collections or
// PostgreSQL tables (staff, shifts, forecasts, schedule, burnout_scores,
// interventions, patients, appointments, users).
// ---------------------------------------------------------------------------
const store = {
  staff: [],
  shifts: [],
  forecasts: [],
  schedule: [],
  burnoutScores: [],
  interventions: [],
  todaySchedule: [],
  patients: [],
  appointments: [],
  users: [],
  lastRun: null,
};

module.exports = {
  createStaffMember,
  createShift,
  createForecast,
  createIntervention,
  createScheduleEntry,
  createPatient,
  createAppointment,
  createUser,
  store,
};
