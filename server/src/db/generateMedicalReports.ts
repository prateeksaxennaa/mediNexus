import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';
dns.setDefaultResultOrder('ipv4first');
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
    },
  })
);

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabaseAdmin } from '../config/supabase.js';

interface LabTableRow {
  param: string;
  value: string;
  unit: string;
  range: string;
  flag?: 'NORMAL' | 'HIGH' | 'LOW' | 'BORDERLINE' | 'DEFICIENT';
}

interface ReportSpec {
  patientEmail: string;
  reportName: string;
  category: 'lab' | 'radiology';
  modalityText: string;
  department: string;
  doctorName: string;
  doctorQual: string;
  sampleCollectedDate: string;
  reportedDate: string;
  clinicalIndication: string;
  tableData?: LabTableRow[];
  findings?: string[];
  impression: string;
  recommendations: string;
}

const REPORT_SPECS: ReportSpec[] = [
  // ── 1. Aarav Mehta (patient@example.com) ───────────────────────────
  {
    patientEmail: 'patient@example.com',
    reportName: 'Complete Blood Count (CBC) Panel',
    category: 'lab',
    modalityText: 'Automated 5-Part Hematology Analyzer (Flow Cytometry)',
    department: 'Department of Pathology & Hematology',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '21-Sep-2026 08:30 AM',
    reportedDate: '21-Sep-2026 11:45 AM',
    clinicalIndication: 'Routine health screening & cardiovascular baseline evaluation',
    tableData: [
      { param: 'Hemoglobin (Hb)', value: '14.4', unit: 'g/dL', range: '13.0 - 17.0', flag: 'NORMAL' },
      { param: 'Total Leukocyte Count (WBC)', value: '7,800', unit: '/mcL', range: '4,000 - 11,000', flag: 'NORMAL' },
      { param: 'RBC Count', value: '4.92', unit: 'mill/mcL', range: '4.50 - 5.90', flag: 'NORMAL' },
      { param: 'Packed Cell Volume (PCV)', value: '43.2', unit: '%', range: '40.0 - 50.0', flag: 'NORMAL' },
      { param: 'Mean Corpuscular Volume (MCV)', value: '87.8', unit: 'fL', range: '80.0 - 100.0', flag: 'NORMAL' },
      { param: 'Platelet Count', value: '245,000', unit: '/mcL', range: '150,000 - 450,000', flag: 'NORMAL' },
      { param: 'Neutrophils', value: '62', unit: '%', range: '40 - 75', flag: 'NORMAL' },
      { param: 'Lymphocytes', value: '28', unit: '%', range: '20 - 45', flag: 'NORMAL' },
      { param: 'Monocytes', value: '6', unit: '%', range: '2 - 10', flag: 'NORMAL' },
      { param: 'Eosinophils', value: '3', unit: '%', range: '1 - 6', flag: 'NORMAL' },
      { param: 'Basophils', value: '1', unit: '%', range: '0 - 2', flag: 'NORMAL' },
    ],
    impression: 'Complete Blood Count is completely within biological reference limits. Red cell indices indicate normocytic normochromic morphology. No evidence of anemia or leukocytosis.',
    recommendations: 'Annual preventive follow-up.',
  },
  {
    patientEmail: 'patient@example.com',
    reportName: 'Comprehensive Lipid & Cholesterol Profile',
    category: 'lab',
    modalityText: 'Enzymatic Colorimetric Photometry',
    department: 'Department of Clinical Biochemistry',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '21-Sep-2026 08:30 AM',
    reportedDate: '21-Sep-2026 01:15 PM',
    clinicalIndication: 'Evaluation of exertional palpitations and hypertension monitoring',
    tableData: [
      { param: 'Total Cholesterol', value: '214.0', unit: 'mg/dL', range: '< 200.0', flag: 'HIGH' },
      { param: 'HDL Cholesterol (Good)', value: '45.2', unit: 'mg/dL', range: '> 40.0', flag: 'NORMAL' },
      { param: 'LDL Cholesterol (Bad)', value: '136.4', unit: 'mg/dL', range: '< 100.0', flag: 'HIGH' },
      { param: 'Triglycerides', value: '162.0', unit: 'mg/dL', range: '< 150.0', flag: 'HIGH' },
      { param: 'VLDL Cholesterol', value: '32.4', unit: 'mg/dL', range: '< 30.0', flag: 'BORDERLINE' },
      { param: 'Total Chol / HDL Ratio', value: '4.73', unit: 'Ratio', range: '< 4.5', flag: 'HIGH' },
    ],
    impression: 'Mixed Dyslipidemia characterized by borderline-elevated Total Cholesterol, elevated LDL, and moderate hypertriglyceridemia. Atherogenic index is mildly increased.',
    recommendations: 'Dietary fat restriction, aerobic physical activity (150 min/wk), and repeat fasting lipid panel in 12 weeks. Consider low-dose Statin under clinical supervision.',
  },
  {
    patientEmail: 'patient@example.com',
    reportName: 'Digital Chest X-Ray (PA View)',
    category: 'radiology',
    modalityText: 'High-Frequency Digital Flat-Panel Radiography (DR)',
    department: 'Department of Radiodiagnosis & Imaging',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '24-Sep-2026 10:15 AM',
    reportedDate: '24-Sep-2026 11:30 AM',
    clinicalIndication: 'Pre-cardiac workup and baseline pulmonary screening',
    findings: [
      'Bilateral lung parenchyma shows clear aeration without focal consolidation, cavitation, or interstitial infiltrate.',
      'Cardiothoracic ratio (CTR) is measured at 0.46, which is well within normal limits (< 0.50). No cardiomegaly.',
      'Trachea and superior mediastinal structures are midline and normal.',
      'Both hilar vascular shadows are normal in size, density, and distribution.',
      'Bilateral costophrenic angles and cardiophrenic angles are acute and clearly defined. No pleural effusion.',
      'Visualized osseous structures of the rib cage, clavicles, and dorsal spine appear intact.',
    ],
    impression: 'Digital Chest Radiograph reveals no active cardiopulmonary disease. Cardiac silhouette and pulmonary vasculature are normal.',
    recommendations: 'No immediate imaging intervention required.',
  },
  {
    patientEmail: 'patient@example.com',
    reportName: '12-Lead Electrocardiogram (ECG)',
    category: 'radiology',
    modalityText: '12-Lead High-Resolution Digital Electrocardiograph',
    department: 'Department of Non-Invasive Cardiology',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '26-Sep-2026 09:45 AM',
    reportedDate: '26-Sep-2026 10:30 AM',
    clinicalIndication: 'Episodic palpitations and borderline blood pressure (142/92 mmHg)',
    findings: [
      'Heart Rate: 72 beats/min | Rhythm: Regular Sinus Rhythm',
      'P-Wave: 94 ms (Normal morphology, upright in lead II, positive in aVF)',
      'PR Interval: 152 ms (Normal atrio-ventricular conduction, 120 - 200 ms)',
      'QRS Complex: 88 ms (Narrow QRS, no intraventricular conduction delay)',
      'QT / QTc: 384 ms / 412 ms (Normal repolarization interval Bazett formula)',
      'Mean Electrical Axis: QRS Axis +56° (Normal frontal plane axis)',
      'ST-T Waves: Isoelectric ST segments across all precordial and limb leads; no ischemic ST depression or elevation.',
    ],
    impression: 'Normal resting 12-lead Electrocardiogram (ECG). Normal sinus rhythm at 72 bpm. No acute ST-T wave changes, ischemia, or chamber hypertrophy.',
    recommendations: 'Advised 2D Echocardiogram to assess left ventricular function and structure.',
  },
  {
    patientEmail: 'patient@example.com',
    reportName: 'Brain MRI Scan (1.5T Screen)',
    category: 'radiology',
    modalityText: '1.5 Tesla Superconducting High-Gradient MRI System',
    department: 'Department of Radiodiagnosis & Neuroimaging',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '29-Sep-2026 11:00 AM',
    reportedDate: '29-Sep-2026 03:00 PM',
    clinicalIndication: 'Intermittent tension-type headache with baseline vascular assessment',
    findings: [
      'Sequences: Axial T1WI, T2WI, T2-FLAIR, DWI/ADC, and Sagittal T1WI.',
      'Cerebral Hemispheres: Normal grey-white matter differentiation. No focal signal abnormalities.',
      'Diffusion Weighted Imaging (DWI): No areas of restricted diffusion to suggest acute territorial or lacunar infarction.',
      'Hemorrhage Screen: No focal blooming on gradient echo sequences to indicate intracranial microbleeds or hemorrhage.',
      'Ventricular System: Lateral, third, and fourth ventricles are normal in caliber, morphology, and symmetric.',
      'Basal Cisterns & Sulci: Cortical sulci and basal cisterns are prominent for age with normal CSF spaces.',
      'Posterior Fossa: Brainstem, cerebellum, and craniocervical junction demonstrate normal anatomical configuration.',
    ],
    impression: 'Unremarkable non-contrast Brain MRI (1.5 Tesla). No evidence of acute ischemia, space-occupying lesion, or intracranial hemorrhage.',
    recommendations: 'Clinical correlation and outpatient follow-up.',
  },

  // ── 2. Vikram Malhotra (vikram.malhotra@example.com) ───────────────
  {
    patientEmail: 'vikram.malhotra@example.com',
    reportName: 'Glycated Hemoglobin (HbA1c) & Glucose Panel',
    category: 'lab',
    modalityText: 'High-Performance Liquid Chromatography (HPLC - NGSP Certified)',
    department: 'Department of Endocrinology & Diabetes Care',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '23-Sep-2026 08:15 AM',
    reportedDate: '23-Sep-2026 11:30 AM',
    clinicalIndication: 'Known Type 2 Diabetes Mellitus - 3-month periodic evaluation',
    tableData: [
      { param: 'HbA1c (Glycosylated Hemoglobin)', value: '7.60', unit: '%', range: '< 5.7 (Target < 7.0)', flag: 'HIGH' },
      { param: 'Estimated Average Glucose (eAG)', value: '171.2', unit: 'mg/dL', range: '< 117.0', flag: 'HIGH' },
      { param: 'Fasting Plasma Glucose (FPG)', value: '148.0', unit: 'mg/dL', range: '70.0 - 100.0', flag: 'HIGH' },
      { param: 'Post-Prandial Plasma Glucose (PP)', value: '218.0', unit: 'mg/dL', range: '< 140.0', flag: 'HIGH' },
    ],
    impression: 'Suboptimal glycemic control in established Type 2 Diabetes Mellitus (HbA1c 7.6% vs recommended target < 7.0%). Both fasting and postprandial glucose are above therapeutic targets.',
    recommendations: 'Intensification of antidiabetic therapy, dietary glycemic index control, and repeat HbA1c in 90 days.',
  },
  {
    patientEmail: 'vikram.malhotra@example.com',
    reportName: 'Comprehensive Liver Function Test (LFT)',
    category: 'lab',
    modalityText: 'Automated Photometric Chemistry Analyzer',
    department: 'Department of Clinical Biochemistry',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '23-Sep-2026 08:15 AM',
    reportedDate: '23-Sep-2026 12:30 PM',
    clinicalIndication: 'Metabolic liver evaluation and oral antidiabetic drug safety screen',
    tableData: [
      { param: 'Bilirubin Total', value: '0.90', unit: 'mg/dL', range: '0.2 - 1.2', flag: 'NORMAL' },
      { param: 'Bilirubin Direct (Conjugated)', value: '0.22', unit: 'mg/dL', range: '0.0 - 0.3', flag: 'NORMAL' },
      { param: 'SGPT / ALT', value: '52.0', unit: 'U/L', range: '< 45.0', flag: 'HIGH' },
      { param: 'SGOT / AST', value: '45.0', unit: 'U/L', range: '< 40.0', flag: 'HIGH' },
      { param: 'Alkaline Phosphatase (ALP)', value: '88.0', unit: 'U/L', range: '44 - 147', flag: 'NORMAL' },
      { param: 'Total Protein', value: '7.20', unit: 'g/dL', range: '6.0 - 8.3', flag: 'NORMAL' },
      { param: 'Serum Albumin', value: '4.40', unit: 'g/dL', range: '3.5 - 5.0', flag: 'NORMAL' },
      { param: 'A/G Ratio', value: '1.57', unit: 'Ratio', range: '1.2 - 2.2', flag: 'NORMAL' },
    ],
    impression: 'Mild transaminitis (ALT > AST). Preserved hepatic synthetic function with normal serum albumin and bilirubin. Pattern is consistent with mild metabolic steatosis (Non-Alcoholic Fatty Liver Disease).',
    recommendations: 'Avoid hepatotoxic medications, monitor weight and lipid parameters, recheck LFT in 6 months.',
  },
  {
    patientEmail: 'vikram.malhotra@example.com',
    reportName: 'Urine Microalbumin & Creatinine Ratio',
    category: 'lab',
    modalityText: 'Turbidimetric Immunoassay & Jaffe Method',
    department: 'Department of Clinical Biochemistry & Nephrology',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '23-Sep-2026 08:15 AM',
    reportedDate: '23-Sep-2026 11:30 AM',
    clinicalIndication: 'Annual diabetic nephropathy screening',
    tableData: [
      { param: 'Urine Microalbumin', value: '14.2', unit: 'mg/L', range: '< 20.0', flag: 'NORMAL' },
      { param: 'Urine Creatinine', value: '78.8', unit: 'mg/dL', range: '20 - 320', flag: 'NORMAL' },
      { param: 'Albumin-to-Creatinine Ratio (UACR)', value: '18.0', unit: 'mg/g', range: '< 30.0', flag: 'NORMAL' },
    ],
    impression: 'Normoalbuminuria (UACR 18.0 mg/g). No evidence of microalbuminuria or early diabetic glomerulopathy.',
    recommendations: 'Continue strict blood pressure and glycemic control. Repeat UACR annually.',
  },

  // ── 3. Sunita Rao (sunita.rao@example.com) ──────────────────────────
  {
    patientEmail: 'sunita.rao@example.com',
    reportName: 'Digital Bilateral Knee Joint X-Ray (AP & Lateral)',
    category: 'radiology',
    modalityText: 'Weight-Bearing Digital Radiography (DR)',
    department: 'Department of Musculoskeletal Radiodiagnosis',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '25-Sep-2026 10:30 AM',
    reportedDate: '25-Sep-2026 11:45 AM',
    clinicalIndication: 'Chronic bilateral knee joint pain, crepitus, and stiffness on stair climbing',
    findings: [
      'Bilateral weight-bearing anteroposterior and 30-degree flexion lateral projections were evaluated.',
      'Medial tibiofemoral joint space demonstrates moderate narrowing bilaterally, right greater than left.',
      'Subchondral sclerosis and cortical thickening are prominent along the medial tibial plateaus.',
      'Small marginal osteophytic spurring is noted along the medial and lateral femoral condylar margins.',
      'Patellofemoral articulation demonstrates mild lateral joint space reduction with mild enthesopathy.',
      'No calcified intra-articular loose bodies or acute cortical fractures identified.',
    ],
    impression: 'Bilateral Primary Knee Osteoarthritis, Kellgren-Lawrence Grade 2 (Moderate), predominantly affecting the medial compartment. Right knee shows slightly greater progression than left.',
    recommendations: 'Physical therapy for quadriceps strengthening, low-impact exercise, weight reduction, and symptomatic analgesia.',
  },
  {
    patientEmail: 'sunita.rao@example.com',
    reportName: 'Inflammatory Marker & Serum Uric Acid Panel',
    category: 'lab',
    modalityText: 'Nephelometry & Uricase Enzymatic Assay',
    department: 'Department of Clinical Pathology & Immunology',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '25-Sep-2026 09:00 AM',
    reportedDate: '25-Sep-2026 12:15 PM',
    clinicalIndication: 'Differential diagnosis of joint pain (ruling out inflammatory/gouty arthropathy)',
    tableData: [
      { param: 'Serum Uric Acid', value: '5.80', unit: 'mg/dL', range: '2.4 - 6.0', flag: 'NORMAL' },
      { param: 'Erythrocyte Sedimentation Rate (ESR)', value: '28.0', unit: 'mm/hr', range: '< 20.0', flag: 'HIGH' },
      { param: 'High Sensitivity CRP (hs-CRP)', value: '6.20', unit: 'mg/L', range: '< 3.0', flag: 'HIGH' },
      { param: 'Rheumatoid Factor (RF - Quantitative)', value: '8.40', unit: 'IU/mL', range: '< 14.0', flag: 'NORMAL' },
    ],
    impression: 'Mild non-specific elevation in acute-phase reactants (ESR 28 mm/hr, hs-CRP 6.2 mg/L), corresponding to localized osteoarthritis synovitis. Normal uric acid and negative RF exclude active gout and rheumatoid arthritis.',
    recommendations: 'Anti-inflammatory physical management; no disease-modifying antirheumatic therapy indicated.',
  },
  {
    patientEmail: 'sunita.rao@example.com',
    reportName: 'Complete Thyroid Profile (FT3, FT4, TSH)',
    category: 'lab',
    modalityText: 'Chemiluminescence Immunoassay (CLIA)',
    department: 'Department of Endocrinology & Clinical Chemistry',
    doctorName: 'Dr. Priya Patel',
    doctorQual: 'MBBS, DNB (Internal Medicine)',
    sampleCollectedDate: '25-Sep-2026 09:00 AM',
    reportedDate: '25-Sep-2026 12:15 PM',
    clinicalIndication: 'Metabolic check and evaluation for thyroid-associated arthropathy',
    tableData: [
      { param: 'Free Triiodothyronine (FT3)', value: '3.12', unit: 'pg/mL', range: '2.0 - 4.4', flag: 'NORMAL' },
      { param: 'Free Thyroxine (FT4)', value: '1.18', unit: 'ng/dL', range: '0.8 - 1.8', flag: 'NORMAL' },
      { param: 'Thyroid Stimulating Hormone (TSH)', value: '2.45', unit: 'uIU/mL', range: '0.35 - 4.94', flag: 'NORMAL' },
    ],
    impression: 'Euthyroid profile. Thyroid hormone levels are completely within reference limits. Normal hypothalamic-pituitary-thyroid axis function.',
    recommendations: 'Routine annual metabolic screen.',
  },

  // ── 4. Kavita Nair (kavita.nair@example.com) ────────────────────────
  {
    patientEmail: 'kavita.nair@example.com',
    reportName: 'Whole Abdomen & Pelvis Ultrasound (USG)',
    category: 'radiology',
    modalityText: 'High-Resolution Real-Time Color Doppler Ultrasound (3.5 - 5.0 MHz)',
    department: 'Department of Diagnostic Ultrasonography',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '27-Sep-2026 11:30 AM',
    reportedDate: '27-Sep-2026 12:45 PM',
    clinicalIndication: 'Annual wellness health checkup and vague post-prandial dyspepsia',
    findings: [
      'Liver: Normal size (13.8 cm span). Diffuse mild increase in parenchymal echogenicity with sound attenuation, characteristic of Grade 1 Fatty Liver (Steatosis). No focal mass lesion.',
      'Gallbladder: Adequately distended with thin, smooth wall (< 3 mm). Lumen is completely clear; no calculus, sludge, or polyps seen. Intrahepatic biliary radicals (IHBR) and common bile duct are normal.',
      'Pancreas: Visualized portions of head, body, and tail demonstrate normal acoustic texture and caliber. No calcification or mass.',
      'Spleen: Normal size (9.2 cm length) and homogeneous parenchymal echotexture. No splenomegaly.',
      'Kidneys: Both kidneys are normal in size, shape, and anatomical location (Right: 10.2 cm, Left: 10.5 cm). Corticomedullary differentiation is maintained. No calculus, hydronephrosis, or cyst.',
      'Pelvis: Urinary bladder is well-distended with regular mucosal contour. Uterus and adnexa appear sonographically unremarkable for age.',
    ],
    impression: 'Grade 1 Diffuse Hepatic Steatosis (Mild Fatty Liver). Normal sonographic study of the gallbladder, biliary tree, pancreas, spleen, kidneys, and pelvic structures.',
    recommendations: 'Dietary lifestyle modification (reduction of refined carbohydrates/fats) and periodic re-evaluation.',
  },
  {
    patientEmail: 'kavita.nair@example.com',
    reportName: 'Serum 25-Hydroxy Vitamin D & B12 Screen',
    category: 'lab',
    modalityText: 'Chemiluminescence Microparticle Immunoassay (CMIA)',
    department: 'Department of Clinical Chemistry & Nutrition',
    doctorName: 'Dr. Rajesh Sharma',
    doctorQual: 'MD, DM (Cardiology), FACC',
    sampleCollectedDate: '27-Sep-2026 09:15 AM',
    reportedDate: '27-Sep-2026 01:00 PM',
    clinicalIndication: 'Fatigue, low energy, and preventive nutritional assessment',
    tableData: [
      { param: '25-Hydroxy Vitamin D (Total)', value: '16.20', unit: 'ng/mL', range: '30.0 - 100.0 (Deficient < 20)', flag: 'DEFICIENT' },
      { param: 'Vitamin B12 (Cyanocobalamin)', value: '410.0', unit: 'pg/mL', range: '211.0 - 911.0', flag: 'NORMAL' },
      { param: 'Total Serum Calcium', value: '9.35', unit: 'mg/dL', range: '8.6 - 10.2', flag: 'NORMAL' },
      { param: 'Serum Inorganic Phosphorus', value: '3.40', unit: 'mg/dL', range: '2.5 - 4.5', flag: 'NORMAL' },
    ],
    impression: 'Significant Vitamin D Deficiency (16.2 ng/mL vs normal > 30 ng/mL). Serum calcium and phosphorus remain balanced. Vitamin B12 levels are optimal.',
    recommendations: 'High-dose oral Cholecalciferol (Vitamin D3) supplementation: 60,000 IU once weekly for 8 weeks, followed by monthly maintenance. Moderate sun exposure recommended.',
  },
];

async function generateSinglePdf(
  spec: ReportSpec,
  patientName: string,
  patientAge: string,
  patientGender: string,
  patientId: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // Standard A4: 595 x 842 points
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Palette
  const navy = rgb(0.08, 0.22, 0.42);      // #14386b
  const teal = rgb(0.05, 0.58, 0.53);      // #0d9488
  const darkGray = rgb(0.18, 0.22, 0.28);  // text primary
  const midGray = rgb(0.40, 0.45, 0.52);   // text secondary
  const lightBg = rgb(0.96, 0.97, 0.99);   // box fill
  const borderCol = rgb(0.85, 0.88, 0.92);
  const alertRed = rgb(0.80, 0.15, 0.15);   // abnormal tag
  const alertGreen = rgb(0.12, 0.55, 0.25); // normal tag

  let y = 800;

  // 1. HOSPITAL LETTERHEAD
  page.drawText('CITY CARE MULTISPECIALITY HOSPITAL', {
    x: 45,
    y,
    size: 15,
    font: fontBold,
    color: navy,
  });

  page.drawText('CENTRE FOR ADVANCED LABORATORY MEDICINE & RADIODIAGNOSIS', {
    x: 45,
    y: y - 14,
    size: 8,
    font: fontBold,
    color: teal,
  });

  page.drawText('Plot 42, Health City, Sector 18, New Delhi - 110001 | Phone: +91 11 4567 8900 | emergency@citycarehospital.com', {
    x: 45,
    y: y - 26,
    size: 7.5,
    font: fontRegular,
    color: midGray,
  });

  page.drawText('NABL ACCREDITED LAB (MC-2419) • NABH ACCREDITED HEALTHCARE NETWORK • ISO 9001:2015', {
    x: 45,
    y: y - 37,
    size: 7,
    font: fontBold,
    color: navy,
  });

  // Top accent bars
  page.drawLine({
    start: { x: 45, y: y - 44 },
    end: { x: 550, y: y - 44 },
    thickness: 2,
    color: teal,
  });
  page.drawLine({
    start: { x: 45, y: y - 47 },
    end: { x: 550, y: y - 47 },
    thickness: 0.5,
    color: navy,
  });

  y -= 62;

  // 2. PATIENT DEMOGRAPHICS CONTAINER
  page.drawRectangle({
    x: 45,
    y: y - 65,
    width: 505,
    height: 65,
    color: lightBg,
    borderColor: borderCol,
    borderWidth: 1,
  });

  const col1X = 55;
  const col2X = 225;
  const col3X = 395;
  const row1Y = y - 18;
  const row2Y = y - 36;
  const row3Y = y - 54;

  // Column 1
  page.drawText('Patient Name:', { x: col1X, y: row1Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(patientName.toUpperCase(), { x: col1X + 60, y: row1Y, size: 8.5, font: fontBold, color: navy });

  page.drawText('Age / Gender:', { x: col1X, y: row2Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(`${patientAge} / ${patientGender}`, { x: col1X + 60, y: row2Y, size: 8, font: fontRegular, color: darkGray });

  page.drawText('Patient UHID:', { x: col1X, y: row3Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(`MDN-${patientId.substring(0, 8).toUpperCase()}`, { x: col1X + 60, y: row3Y, size: 8, font: fontBold, color: darkGray });

  // Column 2
  page.drawText('Referring Dr:', { x: col2X, y: row1Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(spec.doctorName, { x: col2X + 60, y: row1Y, size: 8, font: fontBold, color: darkGray });

  page.drawText('Department:', { x: col2X, y: row2Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(spec.department.replace('Department of ', ''), { x: col2X + 60, y: row2Y, size: 7.5, font: fontRegular, color: darkGray });

  page.drawText('Modality:', { x: col2X, y: row3Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(spec.category.toUpperCase(), { x: col2X + 60, y: row3Y, size: 8, font: fontBold, color: teal });

  // Column 3
  page.drawText('Collected / Done:', { x: col3X, y: row1Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(spec.sampleCollectedDate, { x: col3X + 75, y: row1Y, size: 7.5, font: fontRegular, color: darkGray });

  page.drawText('Reported Date:', { x: col3X, y: row2Y, size: 8, font: fontRegular, color: midGray });
  page.drawText(spec.reportedDate, { x: col3X + 75, y: row2Y, size: 7.5, font: fontRegular, color: darkGray });

  page.drawText('Report Status:', { x: col3X, y: row3Y, size: 8, font: fontRegular, color: midGray });
  page.drawText('FINAL VERIFIED', { x: col3X + 75, y: row3Y, size: 8, font: fontBold, color: alertGreen });

  y -= 85;

  // 3. REPORT TITLE HEADER BANNER
  page.drawRectangle({
    x: 45,
    y: y - 22,
    width: 505,
    height: 22,
    color: navy,
  });

  page.drawText(spec.reportName.toUpperCase(), {
    x: 55,
    y: y - 15,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(spec.modalityText, {
    x: 540 - fontOblique.widthOfTextAtSize(spec.modalityText, 7.5),
    y: y - 15,
    size: 7.5,
    font: fontOblique,
    color: rgb(0.85, 0.95, 0.95),
  });

  y -= 32;

  // Clinical Indication note
  page.drawText('Clinical Indication: ', { x: 45, y, size: 8, font: fontBold, color: darkGray });
  page.drawText(spec.clinicalIndication, { x: 130, y, size: 8, font: fontRegular, color: darkGray });

  y -= 16;

  // 4. MAIN CONTENT: LAB TABLE OR RADIOLOGY FINDINGS
  if (spec.tableData && spec.tableData.length > 0) {
    // Table Header
    page.drawRectangle({
      x: 45,
      y: y - 16,
      width: 505,
      height: 16,
      color: rgb(0.90, 0.93, 0.96),
    });

    page.drawText('TEST INVESTIGATION', { x: 55, y: y - 11, size: 8, font: fontBold, color: navy });
    page.drawText('RESULT', { x: 235, y: y - 11, size: 8, font: fontBold, color: navy });
    page.drawText('UNITS', { x: 305, y: y - 11, size: 8, font: fontBold, color: navy });
    page.drawText('REFERENCE INTERVAL', { x: 375, y: y - 11, size: 8, font: fontBold, color: navy });
    page.drawText('FLAG', { x: 495, y: y - 11, size: 8, font: fontBold, color: navy });

    y -= 20;

    for (let i = 0; i < spec.tableData.length; i++) {
      const row = spec.tableData[i];
      const isAlt = i % 2 === 1;

      if (isAlt) {
        page.drawRectangle({
          x: 45,
          y: y - 14,
          width: 505,
          height: 15,
          color: rgb(0.97, 0.98, 0.99),
        });
      }

      const isAbnormal = row.flag && row.flag !== 'NORMAL';

      page.drawText(row.param, { x: 55, y: y - 9, size: 8, font: fontRegular, color: darkGray });
      page.drawText(row.value, {
        x: 235,
        y: y - 9,
        size: 8.5,
        font: isAbnormal ? fontBold : fontRegular,
        color: isAbnormal ? alertRed : darkGray,
      });
      page.drawText(row.unit, { x: 305, y: y - 9, size: 8, font: fontRegular, color: midGray });
      page.drawText(row.range, { x: 375, y: y - 9, size: 8, font: fontRegular, color: midGray });

      if (row.flag) {
        page.drawText(row.flag, {
          x: 495,
          y: y - 9,
          size: 7.5,
          font: fontBold,
          color: isAbnormal ? alertRed : alertGreen,
        });
      }

      page.drawLine({
        start: { x: 45, y: y - 15 },
        end: { x: 550, y: y - 15 },
        thickness: 0.5,
        color: rgb(0.92, 0.93, 0.95),
      });

      y -= 16;
    }
  } else if (spec.findings && spec.findings.length > 0) {
    // Radiology Structured Findings
    page.drawText('RADIOLOGICAL FINDINGS & OBSERVATIONS:', {
      x: 45,
      y,
      size: 8.5,
      font: fontBold,
      color: navy,
    });
    y -= 14;

    for (const f of spec.findings) {
      page.drawText('•', { x: 52, y, size: 8, font: fontBold, color: teal });
      
      // Multi-line word wrap at ~95 characters
      const words = f.split(' ');
      let currentLine = '';
      for (const w of words) {
        if ((currentLine + w).length > 95) {
          page.drawText(currentLine, { x: 62, y, size: 8, font: fontRegular, color: darkGray });
          y -= 11;
          currentLine = w + ' ';
        } else {
          currentLine += w + ' ';
        }
      }
      if (currentLine.trim()) {
        page.drawText(currentLine.trim(), { x: 62, y, size: 8, font: fontRegular, color: darkGray });
        y -= 13;
      }
    }
  }

  y -= 8;

  // 5. IMPRESSION BOX
  page.drawRectangle({
    x: 45,
    y: y - 55,
    width: 505,
    height: 55,
    color: rgb(0.96, 0.98, 0.97),
    borderColor: rgb(0.78, 0.88, 0.84),
    borderWidth: 1,
  });

  page.drawText('IMPRESSION & CLINICAL INTERPRETATION:', {
    x: 55,
    y: y - 12,
    size: 8,
    font: fontBold,
    color: teal,
  });

  const impWords = spec.impression.split(' ');
  let impLine = '';
  let impY = y - 24;
  for (const w of impWords) {
    if ((impLine + w).length > 95) {
      page.drawText(impLine, { x: 55, y: impY, size: 8, font: fontBold, color: navy });
      impY -= 11;
      impLine = w + ' ';
    } else {
      impLine += w + ' ';
    }
  }
  if (impLine.trim()) {
    page.drawText(impLine.trim(), { x: 55, y: impY, size: 8, font: fontBold, color: navy });
  }

  page.drawText(`Clinical Advice: ${spec.recommendations}`, {
    x: 55,
    y: y - 48,
    size: 7.5,
    font: fontOblique,
    color: darkGray,
  });

  // 6. FOOTER & SIGNATURES (Anchored to bottom of page)
  const footerY = 95;

  page.drawLine({
    start: { x: 45, y: footerY + 20 },
    end: { x: 550, y: footerY + 20 },
    thickness: 1,
    color: borderCol,
  });

  // Left stamp
  page.drawText('Verified By:', { x: 55, y: footerY + 10, size: 7.5, font: fontRegular, color: midGray });
  page.drawText('R. Sengupta, DMLT', { x: 55, y: footerY - 1, size: 8, font: fontBold, color: darkGray });
  page.drawText('Senior Medical Lab Technologist', { x: 55, y: footerY - 10, size: 7, font: fontRegular, color: midGray });

  // Center QR/Barcode simulation
  page.drawRectangle({
    x: 235,
    y: footerY - 12,
    width: 125,
    height: 25,
    color: lightBg,
    borderColor: borderCol,
    borderWidth: 0.5,
  });
  page.drawText('||||| |||| |||||| ||||| |||||', { x: 247, y: footerY + 2, size: 10, font: fontBold, color: navy });
  page.drawText(`SECURE EMR HASH: ${patientId.substring(0, 12)}`, { x: 244, y: footerY - 8, size: 5.5, font: fontRegular, color: midGray });

  // Right Sign-off Doctor
  page.drawText('Report Approved By:', { x: 410, y: footerY + 10, size: 7.5, font: fontRegular, color: midGray });
  page.drawText(spec.doctorName, { x: 410, y: footerY - 1, size: 8.5, font: fontBold, color: navy });
  page.drawText(spec.doctorQual, { x: 410, y: footerY - 10, size: 7, font: fontRegular, color: midGray });

  // Bottom micro-footer
  page.drawLine({
    start: { x: 45, y: 35 },
    end: { x: 550, y: 35 },
    thickness: 0.5,
    color: borderCol,
  });

  page.drawText('Page 1 of 1 • This is a computer-generated medical record under Section 65B of Evidence Act. MediNexus Healthcare EMR Platform.', {
    x: 45,
    y: 25,
    size: 6.5,
    font: fontRegular,
    color: midGray,
  });

  return await pdfDoc.save();
}

async function runReportGeneration() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('    📄 MediNexus Professional Medical PDF Report Generator     ');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Fetch hospital
  const { data: hospital } = await supabaseAdmin.from('hospitals').select('id, name').limit(1).single();
  if (!hospital) {
    console.error('Hospital not found in DB!');
    return;
  }
  console.log(`Hospital: ${hospital.name} (${hospital.id})`);

  // Fetch all patients
  const { data: patients } = await supabaseAdmin.from('patients').select('id, full_name, email, dob');
  const patientByEmail = new Map<string, any>();
  for (const p of (patients ?? [])) {
    if (p.email) patientByEmail.set(p.email, p);
  }

  let generatedCount = 0;
  for (const spec of REPORT_SPECS) {
    const patient = patientByEmail.get(spec.patientEmail);
    if (!patient) {
      console.warn(`  ⚠ Patient not found for email ${spec.patientEmail}`);
      continue;
    }

    // Calculate approximate age
    let age = '32 Y';
    if (patient.dob) {
      const birthYear = new Date(patient.dob).getFullYear();
      age = `${2026 - birthYear} Y`;
    }
    const gender = spec.patientEmail.includes('sunita') || spec.patientEmail.includes('kavita') ? 'Female' : 'Male';

    // 1. Generate professional PDF
    const pdfBytes = await generateSinglePdf(spec, patient.full_name, age, gender, patient.id);

    // 2. Upload to Supabase Storage
    const safeName = spec.reportName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const storagePath = `reports/${hospital.id}/${patient.id}/${safeName}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('patient-reports')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error(`  ❌ Failed to upload ${spec.reportName}:`, uploadErr.message);
      continue;
    }

    // 3. Get Public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('patient-reports')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // 4. Update patient_reports table row
    const { error: updateErr } = await (supabaseAdmin as any)
      .from('patient_reports')
      .update({ report_url: publicUrl })
      .eq('patient_id', patient.id)
      .eq('report_name', spec.reportName);

    if (updateErr) {
      console.error(`  ⚠ Failed to update DB row for ${spec.reportName}:`, updateErr.message);
    } else {
      generatedCount++;
      console.log(`  ✓ Generated & Linked [${spec.category.toUpperCase()}]: ${spec.reportName} for ${patient.full_name}`);
      console.log(`    ↳ ${publicUrl}`);
    }
  }

  console.log(`\n🎉 Successfully generated and uploaded ${generatedCount} genuine medical report PDFs!`);
}

runReportGeneration().catch(err => {
  console.error('Fatal error in report generator:', err);
  process.exit(1);
});
