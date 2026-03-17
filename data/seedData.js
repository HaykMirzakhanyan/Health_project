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
  // --- ICU-1 ---
  { name: 'Maria Santos',     role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Linda Patel',      role: 'NP',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN', 'FNP'] },
  { name: 'Derek Nguyen',     role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'BLS'] },
  { name: 'Aisha Kowalski',   role: 'CNA', unit: 'ICU-1',     certifications: ['BLS'] },
  { name: 'Dr. Samuel Rivera',role: 'MD',  unit: 'ICU-1',     certifications: ['ACLS', 'Critical Care Board'] },
  { name: 'Priya Mehta',      role: 'RN',  unit: 'ICU-1',     certifications: ['ACLS', 'CCRN'] },

  // --- ICU-2 ---
  { name: 'James Okafor',     role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Fatima Al-Rashid', role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'BLS'] },
  { name: 'Dr. Chen Wei',     role: 'MD',  unit: 'ICU-2',     certifications: ['ACLS', 'Critical Care Board', 'Pulmonary Fellowship'] },
  { name: 'Rosa Martinez',    role: 'CNA', unit: 'ICU-2',     certifications: ['BLS'] },
  { name: 'Kevin Tremblay',   role: 'RN',  unit: 'ICU-2',     certifications: ['ACLS', 'CCRN'] },
  { name: 'Nadia Volkov',     role: 'NP',  unit: 'ICU-2',     certifications: ['ACLS', 'AGPCNP'] },

  // --- MedSurg-3 ---
  { name: 'Tamara Johnson',   role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Oliver Hayes',     role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },
  { name: 'Dr. Anjali Singh', role: 'MD',  unit: 'MedSurg-3', certifications: ['ACLS', 'Hospitalist Board'] },
  { name: 'Marcus Bell',      role: 'CNA', unit: 'MedSurg-3', certifications: ['BLS'] },
  { name: 'Yuki Tanaka',      role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'Med-Surg Cert'] },
  { name: 'Bethany Cross',    role: 'CNA', unit: 'MedSurg-3', certifications: ['BLS'] },
  { name: 'Carlos Espinoza', role: 'RN',  unit: 'MedSurg-3', certifications: ['BLS', 'ACLS'] },
  { name: 'Patricia Lee',     role: 'NP',  unit: 'MedSurg-3', certifications: ['ACLS', 'FNP', 'Med-Surg Cert'] },
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

const seedShifts = [];

seedStaff.forEach((member) => {
  // Spread ~60–70% of past 30 days as worked shifts
  for (let dayOffset = -30; dayOffset < 0; dayOffset++) {
    // Skip some days to simulate days off (~35% chance of day off)
    if (Math.random() < 0.35) continue;

    const shiftType = pickShiftType(member.nightShiftRatio);
    const patientLoad =
      member.unit === 'MedSurg-3'
        ? Math.floor(Math.random() * 4) + 4   // 4–7 patients
        : Math.floor(Math.random() * 2) + 2;  // 2–3 patients (ICU)

    seedShifts.push(
      createShift({
        staffId: member.id,
        unit: member.unit,
        date: relativeDate(dayOffset),
        type: shiftType,
        hoursWorked: shiftType === 'day' ? 12 : 12,
        patientLoad,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// Upcoming scheduled procedures / surgeries for the next 72 hours
// These feed Agent 1 (Demand Forecasting) as known demand spikes.
// ---------------------------------------------------------------------------
const seedProcedures = [
  {
    id: uuidv4(),
    unit: 'ICU-1',
    date: relativeDate(0),
    type: 'Cardiac Cath x2',
    estimatedAdditionalCensus: 2,
    notes: 'Back-to-back cath lab cases, expect 2 ICU admissions post-procedure',
  },
  {
    id: uuidv4(),
    unit: 'ICU-2',
    date: relativeDate(1),
    type: 'Major Thoracic Surgery x1',
    estimatedAdditionalCensus: 1,
    notes: 'Lobectomy scheduled for 0800; patient expected in ICU-2 post-op',
  },
  {
    id: uuidv4(),
    unit: 'MedSurg-3',
    date: relativeDate(1),
    type: 'Elective Joint Replacement x3',
    estimatedAdditionalCensus: 3,
    notes: 'Three hip replacements; all expected to step down to MedSurg-3',
  },
  {
    id: uuidv4(),
    unit: 'ICU-2',
    date: relativeDate(2),
    type: 'CABG Surgery x1',
    estimatedAdditionalCensus: 1,
    notes: 'Coronary artery bypass; high acuity post-op, will need 1:1 nursing',
  },
  {
    id: uuidv4(),
    unit: 'MedSurg-3',
    date: relativeDate(2),
    type: 'Appendectomy x2',
    estimatedAdditionalCensus: 2,
    notes: 'Two laparoscopic appendectomies; routine admissions expected',
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
  { name: 'Frank Morales',   dob: '1947-05-31', room: '305',  unit: 'MedSurg-3', diagnosis: 'Pneumonia, elderly',        acuityLevel: 'medium' },
  { name: 'Helen Chu',       dob: '1969-12-20', room: '306',  unit: 'MedSurg-3', diagnosis: 'Post-op knee replacement',  acuityLevel: 'medium' },
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
  store.staff = [...seedStaff];
  store.shifts = [...seedShifts];
  store.todaySchedule = [...seedTodaySchedule];
  store.patients = [...seedPatients];
  store.appointments = [...seedAppointments];
  store.users = [...seedUsers];

  // Procedures live on the store as a convenience for the orchestrator
  // In production: these would come from the EHR scheduling system
  store.procedures = [...seedProcedures];

  console.log(
    `[Seed] Loaded ${store.staff.length} staff, ` +
      `${store.shifts.length} historical shifts, ` +
      `${store.todaySchedule.length} today's schedule entries, ` +
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
  seedPatients,
  seedAppointments,
  seedUsers,
  seedProcedures,
  loadSeed,
};
