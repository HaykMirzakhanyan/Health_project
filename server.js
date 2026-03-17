/**
 * server.js
 * Entry point for the Health Staff Scheduler backend.
 *
 * Startup sequence:
 *   1. Load environment variables from .env
 *   2. Seed the in-memory store with synthetic Riverside General data
 *   3. Mount the API router at /api
 *   4. Start listening on PORT (default 3000)
 *
 * In production:
 *   - Replace loadSeed() with a Firebase Firestore / PostgreSQL bootstrap
 *   - Add authentication middleware (Firebase Auth JWT or similar)
 *   - Enable HTTPS (handled by a reverse proxy like Nginx or Cloud Run)
 */

'use strict';

// Load .env before any other imports that might read env vars
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { loadSeed } = require('./data/seedData');
const { store } = require('./data/schema');
const apiRouter = require('./api/routes');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();

// Allow cross-origin requests (UI team's React app will run on a different port)
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// ---------------------------------------------------------------------------
// Seed data — populate the in-memory store with synthetic hospital data
// ---------------------------------------------------------------------------
loadSeed();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// Root redirect for convenience
app.get('/', (req, res) => {
  res.json({
    name: 'Health Staff Scheduler API',
    version: '1.0.0',
    description: 'AI-powered staff scheduling and burnout monitoring for Riverside General.',
    docs: 'See /api/health to confirm the service is running.',
    endpoints: [
      'GET  /api/health',
      'POST /api/orchestrator/run',
      'GET  /api/staff',
      'GET  /api/staff/:id',
      'GET  /api/forecasts',
      'GET  /api/schedule',
      'GET  /api/burnout',
      'GET  /api/interventions',
      'GET  /api/interventions/pending',
      'POST /api/interventions/:id/approve',
      'POST /api/checkin/:staffId',
    ],
  });
});

// 404 fallback for any unmatched route
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler (catches anything thrown without a try/catch in a route)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  const units = [...new Set(store.staff.map((s) => s.unit))];
  console.log(`
╔════════════════════════════════════════════════════╗
║       Health Staff Scheduler — Riverside General   ║
╚════════════════════════════════════════════════════╝
  Server   : http://localhost:${PORT}
  API root : http://localhost:${PORT}/api/health

  Staff loaded : ${store.staff.length} members
  Units        : ${units.join(', ')}
  Shifts (hist): ${store.shifts.length} records
  Procedures   : ${(store.procedures || []).length} upcoming

  Run POST /api/orchestrator/run to start the AI pipeline.
`);
});

module.exports = app; // Export for testing
