import { supabaseAdmin } from './src/config/supabase.js';
async function run() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  console.log('Existing buckets:', buckets?.map(b => b.name));

  if (!buckets?.some(b => b.name === 'patient-reports')) {
    const { data, error } = await supabaseAdmin.storage.createBucket('patient-reports', {
      public: true,
      fileSizeLimit: 20971520, // 20MB
    });
    console.log('Created patient-reports bucket:', data, error);
  } else {
    console.log('patient-reports bucket already exists!');
  }
}
run();
