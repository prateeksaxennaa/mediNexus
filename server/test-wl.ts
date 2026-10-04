import { supabaseAdmin } from './src/config/supabase.js';

async function run() {
  const { data: w } = await supabaseAdmin.from('slot_waitlist').select('*');
  console.log("Waitlist length:", w?.length);
  console.log("Waitlists:", w);
}
run();
