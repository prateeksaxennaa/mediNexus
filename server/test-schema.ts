import { supabaseAdmin } from './src/config/supabase.js';

async function run() {
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const { data: patients, count: patientCount } = await supabaseAdmin.from('patients').select('id, full_name, email, phone_number', { count: 'exact' });
  const { data: doctors, count: doctorCount } = await supabaseAdmin.from('doctors').select('id, full_name, specialisation', { count: 'exact' });
  const { data: hospitals, count: hospitalCount } = await supabaseAdmin.from('hospitals').select('id, name, city', { count: 'exact' });

  console.log('--- USER AUDIT ---');
  console.log('Auth Users (auth.users count):', authUsers?.users?.length ?? 0);
  if (authUsers?.users?.length) {
    authUsers.users.forEach(u => console.log(' - Email:', u.email, '| Role:', u.app_metadata?.role));
  }
  const { data: meds } = await supabaseAdmin.from('medicines').select('id, medicine_name, therapeutic_class, composition').limit(5);
  console.log('Sample medicines:', meds);
}
run();
