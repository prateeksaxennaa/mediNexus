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

import { supabaseAdmin } from '../config/supabase.js';
import { seedDoctorSlots } from '../jobs/doctorSlotSeeder.js';
import { seedServiceSlots } from '../jobs/serviceSlotSeeder.js';

interface CreatedUser {
  id: string;
  email: string;
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────
async function getOrCreateAuthUser(
  email: string,
  pass: string,
  role: 'hospital_admin' | 'doctor' | 'patient',
  fullName: string
): Promise<CreatedUser> {
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const existing = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: pass,
      app_metadata: { role },
      user_metadata: { full_name: fullName },
      email_confirm: true,
    });
    return { id: existing.id, email: existing.email! };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create auth user ${email}: ${error?.message}`);
  }

  console.log(`  ✓ Auth user: ${email} (${role})`);
  return { id: data.user.id, email: data.user.email! };
}

// ─── Slot Helper (Past or Present) ───────────────────────────────────────────
async function ensureDoctorSlot(
  doctorId: string,
  startTime: Date,
  durationMins: number = 30,
  status: 'available' | 'booked' | 'locked' | 'cancelled' | 'blocked' = 'booked'
): Promise<string> {
  const slotStart = startTime.toISOString();
  const slotEnd = new Date(startTime.getTime() + durationMins * 60 * 1000).toISOString();

  const { data: existing } = await supabaseAdmin
    .from('appointment_slots')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('slot_start', slotStart)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('appointment_slots')
      .update({ status })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from('appointment_slots')
    .insert({
      doctor_id: doctorId,
      slot_start: slotStart,
      slot_end: slotEnd,
      status,
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create slot: ${error?.message}`);
  }

  return created.id;
}

// ─── Service Slot Helper ─────────────────────────────────────────────────────
async function ensureServiceSlot(
  serviceId: string,
  dateStr: string,
  slotNumber: number,
  status: 'available' | 'booked' | 'locked' | 'cancelled' = 'booked'
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('service_slots')
    .select('id')
    .eq('service_id', serviceId)
    .eq('slot_date', dateStr)
    .eq('slot_number', slotNumber)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('service_slots')
      .update({ status })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from('service_slots')
    .insert({
      service_id: serviceId,
      slot_date: dateStr,
      slot_number: slotNumber,
      status,
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create service slot: ${error?.message}`);
  }

  return created.id;
}

// ─── Main Seeder ─────────────────────────────────────────────────────────────
export async function runDemoSeed() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('       🏥 MediNexus Comprehensive Demo Data Seeder');
  console.log('════════════════════════════════════════════════════════════════\n');

  const defaultPassword = 'Password123!';
  const now = new Date();

  // Helper date generators relative to today
  const getDateAt = (daysOffset: number, hours: number, minutes: number = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  const toYMD = (d: Date) => d.toISOString().split('T')[0];

  // ─── 1. Hospital Admin & Hospital ──────────────────────────────────────────
  console.log('1. Setting up Hospital Admin & Hospital...');
  const adminUser = await getOrCreateAuthUser(
    'admin@cityhospital.com',
    defaultPassword,
    'hospital_admin',
    'Admin - City Care'
  );

  let { data: hospital } = await supabaseAdmin
    .from('hospitals')
    .select('id, name')
    .eq('admin_id', adminUser.id)
    .maybeSingle();

  if (!hospital) {
    const { data: newHospital, error: hospErr } = await supabaseAdmin
      .from('hospitals')
      .insert({
        name: 'City Care Multispeciality Hospital',
        type: 'private',
        address: '100 Healthcare Boulevard, Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        registration_number: 'HOSP-MUM-2024-001',
        admin_id: adminUser.id,
        is_approved: true,
      })
      .select('id, name')
      .single();

    if (hospErr) throw hospErr;
    hospital = newHospital;
    console.log(`  ✓ Created Hospital: ${hospital.name}`);
  } else {
    console.log(`  ℹ Hospital exists: ${hospital.name}`);
  }

  // ─── 2. Hospital Services ──────────────────────────────────────────────────
  console.log('\n2. Setting up Hospital Services Catalogue...');
  const servicesConfig = [
    { service_type: 'consultation', service_name: 'General OPD Consultation', department: 'General Medicine', default_duration_mins: 30, fee: 500, pay_at_counter: true, daily_slot_limit: 25 },
    { service_type: 'lab', service_name: 'Complete Blood Count (CBC)', department: 'Pathology', default_duration_mins: 15, fee: 350, pay_at_counter: true, daily_slot_limit: 30 },
    { service_type: 'radiology', service_name: 'Digital Chest X-Ray', department: 'Radiology', default_duration_mins: 20, fee: 750, pay_at_counter: false, daily_slot_limit: 20 },
    { service_type: 'radiology', service_name: 'Brain MRI Scan (1.5T)', department: 'Radiology', default_duration_mins: 45, fee: 4500, pay_at_counter: false, daily_slot_limit: 10 },
    { service_type: 'cardiology', service_name: 'Echocardiogram (2D Echo)', department: 'Cardiology', default_duration_mins: 30, fee: 2200, pay_at_counter: false, daily_slot_limit: 15 },
  ];

  const servicesMap: Record<string, string> = {};
  for (const s of servicesConfig) {
    let { data: existingService } = await supabaseAdmin
      .from('hospital_services')
      .select('id, service_name')
      .eq('hospital_id', hospital.id)
      .eq('service_name', s.service_name)
      .maybeSingle();

    if (!existingService) {
      const { data: created } = await supabaseAdmin
        .from('hospital_services')
        .insert({ ...s, hospital_id: hospital.id, is_available: true })
        .select('id, service_name')
        .single();
      existingService = created;
      console.log(`  ✓ Added Service: ${s.service_name}`);
    } else {
      console.log(`  ℹ Service exists: ${s.service_name}`);
    }
    if (existingService) {
      servicesMap[s.service_name] = existingService.id;
    }
  }

  // ─── 3. Doctors ────────────────────────────────────────────────────────────
  console.log('\n3. Setting up Doctors & Clinical Profiles...');
  const doctorSpecs = [
    {
      email: 'dr.sharma@cityhospital.com',
      fullName: 'Dr. Rajesh Sharma',
      specialisation: 'Cardiology',
      department: 'Cardiology',
      qualifications: 'MBBS, MD (Medicine), DM (Cardiology)',
      registration_number: 'MCI-2012-45892',
      experience_years: 14,
      consultation_fee: 1200,
      bio: 'Senior Interventional Cardiologist specializing in preventive cardiology, hypertension management, and angioplasty.',
      available_from: '09:00',
      available_to: '17:00',
      slot_duration_mins: 30,
    },
    {
      email: 'dr.patel@cityhospital.com',
      fullName: 'Dr. Priya Patel',
      specialisation: 'General Medicine',
      department: 'Internal Medicine',
      qualifications: 'MBBS, DNB (Internal Medicine)',
      registration_number: 'MCI-2016-78231',
      experience_years: 8,
      consultation_fee: 600,
      bio: 'Consultant Physician with a special clinical interest in lifestyle diseases, diabetes control, and preventive care.',
      available_from: '10:00',
      available_to: '18:00',
      slot_duration_mins: 30,
    },
  ];

  const doctorsList: { id: string; fullName: string; spec: string }[] = [];
  for (const doc of doctorSpecs) {
    const docAuth = await getOrCreateAuthUser(doc.email, defaultPassword, 'doctor', doc.fullName);

    let { data: docRecord } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name')
      .eq('user_id', docAuth.id)
      .maybeSingle();

    if (!docRecord) {
      const { data: newDoc, error: docErr } = await supabaseAdmin
        .from('doctors')
        .insert({
          user_id: docAuth.id,
          hospital_id: hospital.id,
          full_name: doc.fullName,
          specialisation: doc.specialisation,
          department: doc.department,
          qualifications: doc.qualifications,
          registration_number: doc.registration_number,
          experience_years: doc.experience_years,
          consultation_fee: doc.consultation_fee,
          bio: doc.bio,
          available_from: doc.available_from,
          available_to: doc.available_to,
          slot_duration_mins: doc.slot_duration_mins,
          verified: true,
        })
        .select('id, full_name')
        .single();

      if (docErr) throw docErr;
      docRecord = newDoc;
      console.log(`  ✓ Created Doctor: ${doc.fullName} (${doc.specialisation})`);
    } else {
      console.log(`  ℹ Doctor exists: ${docRecord.full_name}`);
    }
    doctorsList.push({ id: docRecord.id, fullName: doc.fullName, spec: doc.specialisation });
  }

  const [drSharma, drPatel] = doctorsList;

  // ─── 4. Patients (Primary Customer + Clinic Queue Roster) ──────────────────
  console.log('\n4. Setting up Patients (Primary Customer & Clinic Roster)...');
  const patientRoster = [
    {
      email: 'patient@example.com',
      fullName: 'Aarav Mehta',
      phone: '+919876543210',
      dob: '1995-06-15',
      bloodGroup: 'B+',
      allergies: 'Penicillin',
      isPrimary: true,
    },
    {
      email: 'vikram.malhotra@example.com',
      fullName: 'Vikram Malhotra',
      phone: '+919811223344',
      dob: '1976-03-22',
      bloodGroup: 'O+',
      allergies: 'Sulfa drugs',
      isPrimary: false,
    },
    {
      email: 'sunita.rao@example.com',
      fullName: 'Sunita Rao',
      phone: '+919822334455',
      dob: '1969-11-10',
      bloodGroup: 'A+',
      allergies: 'Aspirin, Shellfish',
      isPrimary: false,
    },
    {
      email: 'kavita.nair@example.com',
      fullName: 'Kavita Nair',
      phone: '+919833445566',
      dob: '1992-08-04',
      bloodGroup: 'AB+',
      allergies: 'None reported',
      isPrimary: false,
    },
  ];

  const patientsMap: Record<string, string> = {};
  for (const pt of patientRoster) {
    const ptAuth = await getOrCreateAuthUser(pt.email, defaultPassword, 'patient', pt.fullName);

    let { data: ptRecord } = await supabaseAdmin
      .from('patients')
      .select('id, full_name')
      .eq('user_id', ptAuth.id)
      .maybeSingle();

    if (!ptRecord) {
      const { data: newPt, error: ptErr } = await supabaseAdmin
        .from('patients')
        .insert({
          user_id: ptAuth.id,
          full_name: pt.fullName,
          email: pt.email,
          phone_number: pt.phone,
          dob: pt.dob,
          blood_group: pt.bloodGroup,
          known_allergies: pt.allergies,
          language_preference: 'en',
        })
        .select('id, full_name')
        .single();

      if (ptErr) throw ptErr;
      ptRecord = newPt;
      console.log(`  ✓ Created Patient: ${pt.fullName} (${pt.email})`);
    } else {
      console.log(`  ℹ Patient exists: ${pt.fullName}`);
    }
    patientsMap[pt.email] = ptRecord.id;
  }

  const primaryPatientId = patientsMap['patient@example.com'];
  const vikramId = patientsMap['vikram.malhotra@example.com'];
  const sunitaId = patientsMap['sunita.rao@example.com'];
  const kavitaId = patientsMap['kavita.nair@example.com'];

  // ─── 5. Auto-Seed Doctor & Service Slots ───────────────────────────────────
  console.log('\n5. Generating 31-day rolling slots for Doctors and Services...');
  await seedDoctorSlots();
  await seedServiceSlots();
  console.log('  ✓ Rolling slots verified.');

  // Fetch some sample medicines for prescriptions
  const { data: medicinesList } = await supabaseAdmin
    .from('medicines')
    .select('id, medicine_name, therapeutic_class')
    .limit(10);

  const med1 = medicinesList?.[0] ?? { id: 'b9852f56-7d7d-45bd-a949-66faadd0f0d7', medicine_name: 'Epofit 10000IU Injection' };
  const med2 = medicinesList?.[1] ?? { id: 'a72e6c55-65ba-433b-a1c7-30c78f053ab4', medicine_name: 'Glycomet 1gm Tablet SR' };
  const med3 = medicinesList?.[4] ?? { id: '3364e32c-ac26-421d-b85d-18b3b1ead7a4', medicine_name: 'Thyrox 125 Tablet' };

  // ─── 6. Rich Doctor & Patient Appointments ─────────────────────────────────
  console.log('\n6. Populating Multi-Status Clinical Appointments...');

  const appointmentsToSeed = [
    // ── TODAY'S QUEUE (Realtime Doctor Dashboard) ──
    {
      doctor: drSharma,
      patientId: vikramId,
      time: getDateAt(0, 9, 0), // 09:00 AM Today
      status: 'completed' as const,
      bookingType: 'online' as const,
      notes: 'Hypertension follow-up. Resting BP 130/82 mmHg. Stable response to medication.',
      prescription: {
        illness: 'Essential Hypertension (Stage 1) - Maintenance',
        items: [
          { medId: med2.id, dosage: '1 tablet (500mg)', freq: 'Once daily after breakfast', dur: '30 days', comment: 'Continue low-sodium diet and daily walking.' }
        ]
      }
    },
    {
      doctor: drSharma,
      patientId: primaryPatientId, // Aarav Mehta
      time: getDateAt(0, 9, 30), // 09:30 AM Today
      status: 'in_progress' as const, // Currently in consultation!
      bookingType: 'online' as const,
      notes: 'Patient reports mild exertional tightness and fatigue. Reviewing 2D Echo results and adjusting beta-blockers.',
      prescription: {
        illness: 'Mild Exertional Angina & Dyslipidemia',
        items: [
          { medId: med2.id, dosage: '1 tablet (1gm SR)', freq: 'Once daily after dinner', dur: '30 days', comment: 'Avoid strenuous high-intensity workouts for 2 weeks.' },
          { medId: med3.id, dosage: '1 tablet (125mcg)', freq: 'Morning before breakfast', dur: '60 days', comment: 'Take with a full glass of water.' }
        ]
      }
    },
    {
      doctor: drSharma,
      patientId: sunitaId,
      time: getDateAt(0, 10, 0), // 10:00 AM Today
      status: 'checked_in' as const, // Waiting in lobby!
      bookingType: 'walk_in' as const,
      notes: 'Pre-consultation triage: SpO2 98%, Pulse 74 bpm, BP 138/86 mmHg. Awaiting room entry.',
    },
    {
      doctor: drSharma,
      patientId: kavitaId,
      time: getDateAt(0, 11, 0), // 11:00 AM Today
      status: 'booked' as const, // Scheduled
      bookingType: 'online' as const,
      notes: 'Annual preventative cardiovascular screening and cholesterol review.',
    },
    {
      doctor: drPatel,
      patientId: primaryPatientId, // Aarav Mehta
      time: getDateAt(0, 10, 30), // 10:30 AM Today
      status: 'checked_in' as const,
      bookingType: 'referral' as const,
      notes: 'Follow-up for metabolic profile and blood sugar monitoring post-referral.',
    },
    {
      doctor: drPatel,
      patientId: sunitaId,
      time: getDateAt(0, 11, 30),
      status: 'booked' as const,
      bookingType: 'online' as const,
      notes: 'Routine HbA1c review and diabetic foot examination.',
    },

    // ── PAST APPOINTMENTS (Historical Patient Records & Passport) ──
    {
      doctor: drPatel,
      patientId: primaryPatientId,
      time: getDateAt(-3, 11, 0), // 3 days ago
      status: 'completed' as const,
      bookingType: 'online' as const,
      notes: 'Acute seasonal rhinitis, sore throat, and low-grade pyrexia. Throat swab clear.',
      prescription: {
        illness: 'Upper Respiratory Tract Infection & Mild Pharyngitis',
        items: [
          { medId: med1.id, dosage: '1 dose (subcutaneous)', freq: 'Alternate days', dur: '5 days', comment: 'Stay well hydrated and warm saline gargles.' }
        ]
      }
    },
    {
      doctor: drSharma,
      patientId: primaryPatientId,
      time: getDateAt(-14, 10, 0), // 14 days ago
      status: 'completed' as const,
      bookingType: 'online' as const,
      notes: 'Initial cardiac workup. Baseline ECG performed. Ordered Lipid Profile and Chest X-Ray.',
      prescription: {
        illness: 'Primary Hypertension & Elevated Serum Cholesterol',
        items: [
          { medId: med2.id, dosage: '1 tablet', freq: 'Once daily at bedtime', dur: '14 days', comment: 'Monitor BP every 3 days in the morning.' }
        ]
      }
    },

    // ── UPCOMING APPOINTMENTS (Future Patient View) ──
    {
      doctor: drSharma,
      patientId: primaryPatientId,
      time: getDateAt(2, 10, 0), // In 2 days
      status: 'booked' as const,
      bookingType: 'online' as const,
      notes: 'Review post-treatment exercise tolerance and updated lipid numbers.',
    },
    {
      doctor: drPatel,
      patientId: primaryPatientId,
      time: getDateAt(7, 14, 0), // Next week
      status: 'booked' as const,
      bookingType: 'online' as const,
      notes: 'Comprehensive preventive health check and metabolic follow-up.',
    }
  ];

  let createdApptsCount = 0;
  for (const apptDef of appointmentsToSeed) {
    const slotId = await ensureDoctorSlot(
      apptDef.doctor.id,
      apptDef.time,
      30,
      apptDef.status === 'completed' || apptDef.status === 'in_progress' || apptDef.status === 'checked_in' || apptDef.status === 'booked'
        ? 'booked'
        : 'available'
    );

    // Check if appointment already exists for this slot
    const { data: existingAppt } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('slot_id', slotId)
      .maybeSingle();

    let apptId = existingAppt?.id;
    if (!existingAppt) {
      const { data: newAppt, error: apptErr } = await supabaseAdmin
        .from('appointments')
        .insert({
          slot_id: slotId,
          patient_id: apptDef.patientId,
          doctor_id: apptDef.doctor.id,
          hospital_id: hospital.id,
          booking_type: apptDef.bookingType,
          status: apptDef.status,
          notes: apptDef.notes,
          created_at: new Date(apptDef.time.getTime() - 24 * 3600 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (apptErr) {
        console.error('  ⚠ Error inserting appointment:', apptErr.message);
        continue;
      }
      apptId = newAppt.id;
      createdApptsCount++;
    } else {
      // Update status if already exists
      await supabaseAdmin
        .from('appointments')
        .update({ status: apptDef.status, notes: apptDef.notes })
        .eq('id', existingAppt.id);
    }

    // Attach Prescription if specified
    if (apptDef.prescription && apptId) {
      const { data: existingRx } = await supabaseAdmin
        .from('prescriptions')
        .select('id')
        .eq('appointment_id', apptId)
        .maybeSingle();

      if (!existingRx) {
        const { data: newRx } = await supabaseAdmin
          .from('prescriptions')
          .insert({
            appointment_id: apptId,
            doctor_id: apptDef.doctor.id,
            patient_id: apptDef.patientId,
            illness_description: apptDef.prescription.illness,
            issued_at: apptDef.time.toISOString(),
          })
          .select('id')
          .single();

        if (newRx) {
          for (const item of apptDef.prescription.items) {
            await supabaseAdmin.from('prescription_items').insert({
              prescription_id: newRx.id,
              medicine_id: item.medId,
              dosage: item.dosage,
              frequency: item.freq,
              duration: item.dur,
              doctor_comment: item.comment,
            });
          }
        }
      }
    }
  }
  console.log(`  ✓ Seeded / Updated ${appointmentsToSeed.length} appointments across Doctor & Patient queues.`);

  // ─── 7. Patient Lab & Radiology Reports (Health Passport & Admin Reports) ───
  console.log('\n7. Populating Diagnostic Lab & Imaging Reports for Health Passport...');

  const reportsConfig = [
    // ── Aarav Mehta (Primary Cardiology & Health Check Patient) ──
    {
      patientId: primaryPatientId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Complete Blood Count (CBC) Panel',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 10,
      analysisEn: 'Complete Blood Count is within normal reference limits. Hemoglobin is healthy at 14.4 g/dL. White blood cell count is 7,800/mcL. Platelets are optimal at 245,000/mcL. Red cell indices show normal normocytic normochromic morphology.',
      analysisHi: 'आपकी कम्प्लीट ब्लड काउंट (CBC) रिपोर्ट सामान्य है। हीमोग्लोबिन 14.4 g/dL पर स्वस्थ है। सफेद रक्त कोशिकाएं और प्लेटलेट्स पूरी तरह सामान्य स्तर पर हैं। कोई रक्तहीनता या संक्रमण नहीं है।',
    },
    {
      patientId: primaryPatientId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Comprehensive Lipid & Cholesterol Profile',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 10,
      analysisEn: 'Total Cholesterol is 214 mg/dL (borderline high, normal < 200). LDL bad cholesterol is elevated at 136 mg/dL, while HDL good cholesterol is 45 mg/dL. Triglycerides are 162 mg/dL. Lifestyle modifications and dietary monitoring recommended.',
      analysisHi: 'आपका कुल कोलेस्ट्रॉल 214 mg/dL है जो सामान्य से थोड़ा अधिक है। एलडीएल (खराब कोलेस्ट्रॉल) 136 mg/dL पर है। हृदय स्वास्थ्य के लिए कम वसायुक्त भोजन और नियमित व्यायाम की सलाह दी जाती है।',
    },
    {
      patientId: primaryPatientId,
      category: 'radiology' as const,
      type: 'xray',
      name: 'Digital Chest X-Ray (PA View)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 7,
      analysisEn: 'Chest X-Ray shows clear lung parenchyma bilaterally without consolidation, pleural effusion, or pneumothorax. Cardiothoracic ratio is normal (< 0.50). Trachea is central and mediastinal contours are unremarkable.',
      analysisHi: 'डिजिटल चेस्ट एक्स-रे में दोनों फेफड़े पूरी तरह साफ हैं। किसी प्रकार का संक्रमण, निमोनिया या पानी भरने का कोई संकेत नहीं है। हृदय का आकार और फेफड़ों की संरचना सामान्य है।',
    },
    {
      patientId: primaryPatientId,
      category: 'radiology' as const,
      type: 'ecg',
      name: '12-Lead Electrocardiogram (ECG)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 5,
      analysisEn: '12-Lead ECG shows normal sinus rhythm with a resting heart rate of 72 bpm. PR interval (150 ms) and QTc interval (412 ms) are normal. No ST-segment elevation or T-wave inversion observed. Good overall electrical conduction.',
      analysisHi: '12-लीड ईसीजी (ECG) रिपोर्ट में हृदय गति 72 बीट्स प्रति मिनट के साथ सामान्य साइनस रिदम दर्शाती है। दिल की धड़कन और विद्युत तरंगें पूरी तरह सामान्य हैं। किसी इस्केमिया के लक्षण नहीं हैं।',
    },
    {
      patientId: primaryPatientId,
      category: 'radiology' as const,
      type: 'mri',
      name: 'Brain MRI Scan (1.5T Screen)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 2,
      analysisEn: 'Brain MRI demonstrates normal grey-white matter differentiation. No acute intracranial hemorrhage, territorial infarction, or mass effect. Ventricles and basal cisterns are within normal limits for age.',
      analysisHi: 'मस्तिष्क के एमआरआई (MRI) स्कैन में दिमाग की संरचना बिल्कुल सामान्य है। किसी भी तरह का रक्तस्राव, सूजन या थक्का नहीं पाया गया है। रिपोर्ट पूरी तरह संतोषजनक है।',
    },

    // ── Vikram Malhotra (Diabetic & Metabolic Monitoring Patient) ──
    {
      patientId: vikramId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Glycated Hemoglobin (HbA1c) & Glucose Panel',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 8,
      analysisEn: 'HbA1c is 7.6%, reflecting suboptimal glycaemic control over the past 3 months (target for type 2 diabetes is < 7.0%). Fasting plasma glucose is 148 mg/dL. Microvascular screening and medication dose titration recommended.',
      analysisHi: 'आपका एचबीए1सी (HbA1c) 7.6% है, जो पिछले 3 महीनों में शुगर का स्तर थोड़ा बढ़ा हुआ दर्शाता है (सामान्य लक्ष्य 7% से कम होता है)। फास्टिंग ब्लड शुगर 148 mg/dL है। दवा की खुराक समायोजन और आहार नियंत्रण की आवश्यकता है।',
    },
    {
      patientId: vikramId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Comprehensive Liver Function Test (LFT)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 8,
      analysisEn: 'Liver Function Test shows mildly elevated transaminases: ALT (SGPT) is 52 U/L and AST (SGOT) is 45 U/L. Serum Bilirubin and Albumin are completely normal. Consistent with mild metabolic hepatic steatosis; monitor lifestyle and liver enzymes.',
      analysisHi: 'लिवर फंक्शन टेस्ट (LFT) में एसजीपीटी (ALT) 52 U/L और एसजीओटी 45 U/L है, जो सामान्य से हल्का सा अधिक है। सीरम बिलीरुबिन पूरी तरह सामान्य है। यह हल्के फैटी लिवर का संकेत हो सकता है।',
    },
    {
      patientId: vikramId,
      category: 'lab' as const,
      type: 'urine_test',
      name: 'Urine Microalbumin & Creatinine Ratio',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 8,
      analysisEn: 'Urine Albumin-to-Creatinine Ratio (UACR) is 18 mg/g, which is well within normal limits (< 30 mg/g). Kidneys show no signs of microalbuminuria or diabetic kidney injury.',
      analysisHi: 'यूरिन माइक्रोएल्ब्यूमिन टेस्ट 18 mg/g पर सामान्य है। गुर्दे (किडनी) स्वस्थ हैं और डायबिटीज से गुर्दे को कोई नुकसान नहीं पहुंचा है।',
    },

    // ── Sunita Rao (Orthopedic & Joint Pain Patient) ──
    {
      patientId: sunitaId,
      category: 'radiology' as const,
      type: 'xray',
      name: 'Digital Bilateral Knee Joint X-Ray (AP & Lateral)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 6,
      analysisEn: 'Weight-bearing bilateral knee radiograph reveals moderate medial compartment joint space narrowing, subchondral sclerosis, and marginal osteophytes bilaterally. Findings are characteristic of Grade 2 Kellgren-Lawrence Osteoarthritis.',
      analysisHi: 'दोनों घुटनों के डिजिटल एक्स-रे में घुटने के अंदरूनी हिस्से में जोड़ों की जगह (joint space) कम पाई गई है। यह ग्रेड 2 ऑस्टियोआर्थराइटिस (गठिया/घुटने का घिसना) दर्शाता है। फिजियोथेरेपी और वजन प्रबंधन उपयोगी है।',
    },
    {
      patientId: sunitaId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Inflammatory Marker & Serum Uric Acid Panel',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 6,
      analysisEn: 'Serum Uric Acid is normal at 5.8 mg/dL (ruling out acute gouty arthritis). Erythrocyte Sedimentation Rate (ESR) is mildly elevated at 28 mm/hr and hs-CRP is 6.2 mg/L, reflecting ongoing low-grade joint inflammation.',
      analysisHi: 'सीरम यूरिक एसिड 5.8 mg/dL पर सामान्य है, जिससे गाउट की संभावना नहीं है। सूजन का स्तर (ESR और CRP) हल्का बढ़ा हुआ है, जो घुटनों की सूजन से मेल खाता है।',
    },
    {
      patientId: sunitaId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Complete Thyroid Profile (FT3, FT4, TSH)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 6,
      analysisEn: 'Thyroid stimulating hormone (TSH) is 2.45 uIU/mL with normal FT3 and FT4 levels. Euthyroid status confirmed; thyroid function is normal.',
      analysisHi: 'थायराइड प्रोफाइल (TSH 2.45 uIU/mL) पूरी तरह सामान्य है। थायराइड ग्रंथि सही ढंग से काम कर रही है।',
    },

    // ── Kavita Nair (Wellness & Preventive Screen Patient) ──
    {
      patientId: kavitaId,
      category: 'radiology' as const,
      type: 'other',
      name: 'Whole Abdomen & Pelvis Ultrasound (USG)',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 4,
      analysisEn: 'Abdominal ultrasound shows mild diffuse increase in hepatic parenchymal echogenicity with sound attenuation, suggestive of Grade 1 Fatty Liver (Steatosis). Gallbladder is calculus-free. Spleen, pancreas, kidneys, and pelvic organs are unremarkable.',
      analysisHi: 'पेट के अल्ट्रासाउंड में ग्रेड 1 फैटी लिवर का संकेत मिला है। पित्ताशय (गॉलब्लेडर) में कोई पथरी नहीं है। तिल्ली, अग्न्याशय और गुर्दे पूरी तरह स्वस्थ हैं।',
    },
    {
      patientId: kavitaId,
      category: 'lab' as const,
      type: 'blood_test',
      name: 'Serum 25-Hydroxy Vitamin D & B12 Screen',
      url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      daysAgo: 4,
      analysisEn: 'Serum 25-OH Vitamin D is deficient at 16.2 ng/mL (optimal range: 30-100 ng/mL). Vitamin B12 is healthy at 410 pg/mL. Cholecalciferol (Vitamin D3) supplementation 60,000 IU weekly for 8 weeks is indicated.',
      analysisHi: 'विटामिन डी (Vitamin D3) 16.2 ng/mL पर कम है (सामान्य स्तर 30 से अधिक होना चाहिए)। विटामिन बी12 सामान्य है। विटामिन डी के सप्लीमेंट लेने की सलाह दी जाती है।',
    },
  ];

  const dummyAudioBase64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//MUZAAAAP8AAAAAAAAAAAA=';

  const seededReportsList: { id: string; name: string; patientId: string }[] = [];
  for (const r of reportsConfig) {
    const uploadedAt = getDateAt(-r.daysAgo, 14, 30).toISOString();

    let { data: existingReport } = await (supabaseAdmin as any)
      .from('patient_reports')
      .select('id, report_name')
      .eq('patient_id', r.patientId)
      .eq('report_name', r.name)
      .maybeSingle();

    if (!existingReport) {
      const { data: newReport, error: repErr } = await (supabaseAdmin as any)
        .from('patient_reports')
        .insert({
          patient_id: r.patientId,
          hospital_id: hospital.id,
          report_category: r.category,
          report_type: r.type,
          report_name: r.name,
          report_url: r.url,
          uploaded_by: adminUser.id,
          uploaded_at: uploadedAt,
        })
        .select('id, report_name')
        .single();

      if (repErr) {
        console.error('  ⚠ Error inserting report:', repErr.message);
        continue;
      }
      existingReport = newReport;
      console.log(`  ✓ Added Patient Report: ${r.name}`);
    } else {
      console.log(`  ℹ Report exists: ${r.name}`);
    }

    if (existingReport) {
      seededReportsList.push({ id: existingReport.id, name: r.name, patientId: r.patientId });

      // Cache English and Hindi AI analysis
      await (supabaseAdmin as any).from('report_analysis_cache').upsert([
        {
          report_id: existingReport.id,
          lang: 'en',
          doc_type: r.type,
          analysis_text: r.analysisEn,
          audio_base64: dummyAudioBase64,
          audio_mime: 'audio/mpeg',
        },
        {
          report_id: existingReport.id,
          lang: 'hi',
          doc_type: r.type,
          analysis_text: r.analysisHi,
          audio_base64: dummyAudioBase64,
          audio_mime: 'audio/mpeg',
        },
      ], { onConflict: 'report_id,lang,doc_type' });
    }
  }

  // ─── 8. Referrals (Doctor to Doctor) ───────────────────────────────────────
  console.log('\n8. Setting up Doctor Referrals...');
  const referralsConfig = [
    {
      fromDoctorId: drPatel.id,
      toDoctorId: drSharma.id,
      patientId: primaryPatientId,
      reason: 'Patient Aarav Mehta presented with borderline resting hypertension (142/92) and episodic exertional palpitations. Kindly evaluate for secondary hypertension and advise on cardiac plan.',
      status: 'accepted' as const,
      createdDaysAgo: 14,
    },
    {
      fromDoctorId: drSharma.id,
      toDoctorId: drPatel.id,
      patientId: primaryPatientId,
      reason: 'Cardiology workup completed. Echo stable. Kindly monitor long-term lipid profile and metabolic blood parameters.',
      status: 'pending' as const,
      createdDaysAgo: 1,
    },
  ];

  for (const ref of referralsConfig) {
    const { data: existingRef } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referring_doctor_id', ref.fromDoctorId)
      .eq('referred_to_doctor_id', ref.toDoctorId)
      .eq('patient_id', ref.patientId)
      .maybeSingle();

    if (!existingRef) {
      await supabaseAdmin.from('referrals').insert({
        referring_doctor_id: ref.fromDoctorId,
        referred_to_doctor_id: ref.toDoctorId,
        patient_id: ref.patientId,
        reason: ref.reason,
        status: ref.status,
        created_at: getDateAt(-ref.createdDaysAgo, 11, 0).toISOString(),
        updated_at: getDateAt(-ref.createdDaysAgo, 15, 0).toISOString(),
      });
      console.log(`  ✓ Seeded Referral from ${ref.fromDoctorId === drPatel.id ? 'Dr. Patel' : 'Dr. Sharma'} (${ref.status})`);
    }
  }

  // ─── 9. Record Access Grants (Patient to Doctor) ───────────────────────────
  console.log('\n9. Setting up Patient Record Access Grants...');
  if (seededReportsList.length >= 2) {
    const grantsConfig = [
      // Aarav Mehta -> Dr. Sharma
      {
        patientId: primaryPatientId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === primaryPatientId && r.name.includes('CBC'))?.id,
        source: 'manual',
        validDays: 90,
      },
      {
        patientId: primaryPatientId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === primaryPatientId && r.name.includes('Lipid'))?.id,
        source: 'manual',
        validDays: 90,
      },
      {
        patientId: primaryPatientId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === primaryPatientId && r.name.includes('X-Ray'))?.id,
        source: 'referral',
        validDays: 60,
      },
      // Aarav Mehta -> Dr. Patel
      {
        patientId: primaryPatientId,
        doctorId: drPatel.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === primaryPatientId && r.name.includes('CBC'))?.id,
        source: 'manual',
        validDays: 45,
      },
      // Vikram Malhotra -> Dr. Patel (HbA1c & LFT)
      {
        patientId: vikramId,
        doctorId: drPatel.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === vikramId && r.name.includes('HbA1c'))?.id,
        source: 'manual',
        validDays: 90,
      },
      {
        patientId: vikramId,
        doctorId: drPatel.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === vikramId && r.name.includes('Liver'))?.id,
        source: 'manual',
        validDays: 90,
      },
      // Sunita Rao -> Dr. Patel & Dr. Sharma (Knee X-Ray & Inflammatory)
      {
        patientId: sunitaId,
        doctorId: drPatel.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === sunitaId && r.name.includes('Knee'))?.id,
        source: 'manual',
        validDays: 90,
      },
      {
        patientId: sunitaId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === sunitaId && r.name.includes('Inflammatory'))?.id,
        source: 'manual',
        validDays: 90,
      },
      // Kavita Nair -> Dr. Sharma (Ultrasound & Vitamin)
      {
        patientId: kavitaId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === kavitaId && r.name.includes('Ultrasound'))?.id,
        source: 'manual',
        validDays: 90,
      },
      {
        patientId: kavitaId,
        doctorId: drSharma.id,
        docType: 'report',
        docId: seededReportsList.find(r => r.patientId === kavitaId && r.name.includes('Vitamin'))?.id,
        source: 'manual',
        validDays: 90,
      },
    ];

    for (const g of grantsConfig) {
      if (!g.docId) continue;
      const { data: existingGrant } = await supabaseAdmin
        .from('record_access_grants')
        .select('id')
        .eq('patient_id', g.patientId)
        .eq('granted_to_doctor_id', g.doctorId)
        .eq('document_id', g.docId)
        .maybeSingle();

      if (!existingGrant) {
        await supabaseAdmin.from('record_access_grants').insert({
          patient_id: g.patientId,
          granted_to_doctor_id: g.doctorId,
          granted_to_hospital_id: hospital.id,
          record_types: ['report'],
          document_type: g.docType,
          document_id: g.docId,
          source: g.source,
          valid_until: getDateAt(g.validDays, 23, 59).toISOString(),
        });
      }
    }
    console.log(`  ✓ Seeded active record access grants for patient records.`);
  }

  // ─── 10. Hospital Service Appointments (Admin Service Operations) ─────────
  console.log('\n10. Setting up Hospital Service Appointments...');
  const cbcServiceId = servicesMap['Complete Blood Count (CBC)'];
  const xrayServiceId = servicesMap['Digital Chest X-Ray'];
  const mriServiceId = servicesMap['Brain MRI Scan (1.5T)'];

  if (cbcServiceId && xrayServiceId && mriServiceId) {
    const serviceAppts = [
      // Past CBC
      {
        serviceId: cbcServiceId,
        patientId: primaryPatientId,
        dateStr: toYMD(getDateAt(-10, 8, 30)),
        slotNum: 1,
        status: 'completed' as const,
        notes: 'Sample collected. Blood report generated and uploaded to passport.',
      },
      // Past Chest X-Ray
      {
        serviceId: xrayServiceId,
        patientId: primaryPatientId,
        dateStr: toYMD(getDateAt(-7, 10, 0)),
        slotNum: 2,
        status: 'completed' as const,
        notes: 'Standard PA digital radiograph. Processed successfully.',
      },
      // Upcoming MRI
      {
        serviceId: mriServiceId,
        patientId: primaryPatientId,
        dateStr: toYMD(getDateAt(3, 11, 30)),
        slotNum: 1,
        status: 'booked' as const,
        notes: 'Pre-scan instructions sent: no metallic items, fast 4 hours prior.',
      },
      // Today OPD service for Sunita
      {
        serviceId: servicesMap['General OPD Consultation'] || cbcServiceId,
        patientId: sunitaId,
        dateStr: toYMD(now),
        slotNum: 3,
        status: 'checked_in' as const,
        notes: 'Blood sugar fasting token issued.',
      }
    ];

    for (const sa of serviceAppts) {
      const slotId = await ensureServiceSlot(sa.serviceId, sa.dateStr, sa.slotNum, 'booked');

      const { data: existingSa } = await supabaseAdmin
        .from('service_appointments')
        .select('id')
        .eq('slot_id', slotId)
        .maybeSingle();

      if (!existingSa) {
        await supabaseAdmin.from('service_appointments').insert({
          slot_id: slotId,
          patient_id: sa.patientId,
          hospital_id: hospital.id,
          service_id: sa.serviceId,
          booking_type: 'online',
          status: sa.status,
          notes: sa.notes,
        });
      }
    }
    console.log(`  ✓ Seeded Service Appointments for CBC, X-Ray, and MRI.`);
  }

  // ─── 11. Slot Waitlist Sample ──────────────────────────────────────────────
  console.log('\n11. Setting up Slot Waitlist...');
  const { data: waitlistSlot } = await supabaseAdmin
    .from('appointment_slots')
    .select('id')
    .eq('doctor_id', drSharma.id)
    .gte('slot_start', getDateAt(1, 10, 0).toISOString())
    .limit(1)
    .maybeSingle();

  if (waitlistSlot) {
    const { data: existingWl } = await supabaseAdmin
      .from('slot_waitlist')
      .select('id')
      .eq('slot_id', waitlistSlot.id)
      .eq('patient_id', sunitaId)
      .maybeSingle();

    if (!existingWl) {
      await supabaseAdmin.from('slot_waitlist').insert({
        slot_id: waitlistSlot.id,
        patient_id: sunitaId,
        queued_at: new Date().toISOString(),
        status: 'waiting',
      });
      console.log(`  ✓ Added patient to doctor waitlist queue.`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('       🎉 Comprehensive Demo Data Seeding Completed!          ');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('📊 Summary of Available Data:');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('• Customer / Patient:');
  console.log('  - Upcoming Appointments: 2 active bookings (Today & Next Week)');
  console.log('  - Past Consultations: 2 completed with full clinical notes');
  console.log('  - Prescriptions: 3 issued with dosage, frequency & advice');
  console.log('  - Health Passport Reports: 5 diagnostic records (CBC, Lipid, X-Ray, ECG, MRI)');
  console.log('  - AI Audio Analysis: Cached bilingual (English & Hindi) summaries');
  console.log('  - Referrals & Access Grants: Active grants & doctor transfers');
  console.log('  - Hospital Services: Booked & completed CBC, X-Ray & MRI');
  console.log('\n• Doctor Side:');
  console.log('  - Today Queue: Completed, In Progress, Checked-in & Booked patients');
  console.log('  - Multi-day calendar with pre-populated patient queue');
  console.log('  - Referrals Dashboard: Sent & received doctor referrals');
  console.log('  - Prescriptions Dashboard: Patient history & medications');
  console.log('\n• Admin Side:');
  console.log('  - Doctor roster with 2 verified specialists');
  console.log('  - Service catalogue with 5 active hospital departments');
  console.log('  - Service appointments queue (CBC, X-Ray, MRI, OPD)');
  console.log('  - Central diagnostic reports archive');
  console.log('────────────────────────────────────────────────────────────────\n');
}

runDemoSeed().catch(err => {
  console.error('Demo seed error:', err);
  process.exit(1);
});
