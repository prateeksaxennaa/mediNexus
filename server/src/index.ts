import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';

dns.setDefaultResultOrder('ipv4first');

// In development, handle local SSL inspection / Wi-Fi proxies gracefully to avoid SELF_SIGNED_CERT_IN_CHAIN
const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Force IPv4 lookup & configured TLS verification for all global fetch/undici requests
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
      rejectUnauthorized: !isDev,
    },
  })
);

import app from './app.js';
import { env } from './config/env.js';
import { startSlotLockCleanupJob } from './jobs/slotLockCleanup.js';
import { startWaitlistQueueJob } from './jobs/waitlistQueue.js';
import { startServiceSlotSeeder } from './jobs/serviceSlotSeeder.js';
import { startDoctorSlotSeeder } from './jobs/doctorSlotSeeder.js';
import { startWhatsAppReminderJob } from './jobs/whatsappReminder.js';
import { runMigrations } from './db/runMigrations.js';

const PORT = Number(process.env.PORT) || env.PORT || 10000;
const HOST = '0.0.0.0';

// Start server immediately on 0.0.0.0:PORT to satisfy Render/cloud port binding
const server = app.listen(PORT, HOST, () => {
  console.log(`\nmediNexus API server running on http://${HOST}:${PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health check: http://${HOST}:${PORT}/api/health\n`);

  // Start background jobs
  startSlotLockCleanupJob();
  startWaitlistQueueJob();
  startServiceSlotSeeder();
  startDoctorSlotSeeder();
  startWhatsAppReminderJob();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] Port ${PORT} is already in use.`);
    console.error(`   Run:  fuser -k ${PORT}/tcp   to free it, then restart.\n`);
    process.exit(1);
  }
  throw err;
});

// Run pending DB migrations asynchronously in background without delaying port binding
runMigrations().catch((err) => {
  console.error('[migrations] Startup migration error:', (err as Error)?.message || err);
});
