import { getUpcomingAppointments } from './src/controllers/whatsapp/db.helpers.js';

async function run() {
  try {
    const appts = await getUpcomingAppointments("a7d2e3be-b924-42f2-8941-7bc052fbb6c0");
    console.log("Appts:", appts);
  } catch (e) {
    console.log("Error inside getUpcomingAppointments:", e);
  }
}
run();
