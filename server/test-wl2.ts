import { supabaseAdmin } from './src/config/supabase.js';
async function run() {
  const { data, error } = await supabaseAdmin.from('slot_waitlist').select('id').limit(1);
  console.log("Waitlist table name works?", !error);
}
run();
