import { getWaitlistEntries } from './src/controllers/whatsapp/db.helpers.js';

async function run() {
  const patientId = 'ed28519b-cfdb-4e92-8304-c8fccb35d6a6';
  try {
    const res = await getWaitlistEntries(patientId);
    console.log("Result:", res);
  } catch (e) {
    console.log("Error:", e);
  }
}
run();
