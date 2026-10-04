import { supabaseAdmin } from './src/config/supabase.js';

async function run() {
  // Let's get the most recent date available: 2026-04-20 slots
  const { data: doctor } = await supabaseAdmin.from('doctors').select('id').ilike('full_name', '%Sherlock%').single();
  if (!doctor) { console.log('Doctor not found'); return; }
  
  const { data: slots, error } = await supabaseAdmin
  .from('appointment_slots')
  .select('*')
  .eq('doctor_id', doctor.id)
  .gte('slot_start', '2026-04-20T00:00:00Z')
  .lte('slot_start', '2026-04-20T23:59:59Z')
  .order('slot_start');
  
  console.log("Error:", error);
  console.log("Count:", slots?.length);
  const interesting = slots?.filter(s => s.status !== 'available' || s.waitlist_entries?.length > 0);
  console.log("Non-available slots:", interesting);
}
run();
