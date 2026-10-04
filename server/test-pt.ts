import { supabaseAdmin } from './src/config/supabase.js';

async function run() {
  const { data } = await supabaseAdmin.from('patients').select('id, phone_number').ilike('phone_number', '%6376438732%');
  console.log("Patient for 6376438732:", data);
}
run();
