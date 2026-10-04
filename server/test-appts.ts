import { supabaseAdmin } from './src/config/supabase.js';

async function run() {
    const { data: docAppts, error: e1 } = await supabaseAdmin
      .from("appointments")
      .select(`id, status, slot_id,
        appointment_slots(slot_start, slot_end),
        doctors(full_name),
        hospitals(name)`)
      .eq("patient_id", "a7d2e3be-b924-42f2-8941-7bc052fbb6c0")
      .in("status", ["booked", "checked_in"])
      .order("created_at", { ascending: false });
    
    console.log("e1:", e1);

    const { data: svcAppts, error: e2 } = await supabaseAdmin
      .from("service_appointments")
      .select(`id, status, slot_id,
        service_slots(slot_date, slot_number),
        hospital_services(service_name),
        hospitals(name)`)
      .eq("patient_id", "a7d2e3be-b924-42f2-8941-7bc052fbb6c0")
      .in("status", ["booked", "checked_in"])
      .order("booked_at", { ascending: false });
    console.log("e2:", e2);
}
run();
