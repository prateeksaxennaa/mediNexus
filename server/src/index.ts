import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';

dns.setDefaultResultOrder('ipv4first');

// Force IPv4 lookup for all global fetch/undici requests to prevent IPv6/AAAA drops on local routers
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
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

const PORT = env.PORT;

// Run pending DB migrations before accepting traffic
runMigrations().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`\nmediNexus API server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);

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
});
