import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';

// ─── Multer — in-memory, 20 MB cap ───────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF and image files are allowed', 400));
    }
  },
});

export const uploadReportMiddleware = upload.single('file');

// ─── Valid report categories (was previously "report type") ───────────────────

const VALID_REPORT_CATEGORIES = [
  'lab',
  'radiology',
  'pathology',
  'discharge_summary',
  'other',
] as const;

type ReportCategory = (typeof VALID_REPORT_CATEGORIES)[number];

// ─── Valid report types (modality) ────────────────────────────────────────────

const VALID_REPORT_TYPES = [
  'ecg',
  'xray',
  'mri',
  'ct',
  'blood_test',
  'urine_test',
  'other',
] as const;

type ReportType = (typeof VALID_REPORT_TYPES)[number];

/**
 * POST /api/hospitals/me/patients/:patientId/reports
 * Uploads a patient report file to Supabase Storage and inserts a
 * patient_reports row.  Only the patient's hospital admin can call this.
 */
export async function uploadPatientReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(userId);
    const { patientId } = req.params as { patientId: string };

    // Validate patient exists
    const { data: patient, error: patientErr } = await supabaseAdmin
      .from('patients')
      .select('id, full_name')
      .eq('id', patientId)
      .single();

    if (patientErr || !patient) throw new NotFoundError('Patient not found');

    // Validate body fields
    const reportName = (req.body?.report_name ?? '').trim();
    const reportCategory = (req.body?.report_category ?? '').trim() as ReportCategory;
    const reportType = (req.body?.report_type ?? 'other').trim() as ReportType;

    if (!reportName) throw new AppError('report_name is required', 400);
    if (!VALID_REPORT_CATEGORIES.includes(reportCategory)) {
      throw new AppError(
        `report_category must be one of: ${VALID_REPORT_CATEGORIES.join(', ')}`,
        400
      );
    }
    if (!VALID_REPORT_TYPES.includes(reportType)) {
      throw new AppError(
        `report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
        400
      );
    }

    // Require an uploaded file
    const file = req.file;
    if (!file) throw new AppError('A file is required', 400);

    // Upload to Supabase Storage
    const ext = file.originalname.split('.').pop() ?? 'bin';
    const storagePath = `reports/${hospital.id}/${patientId}/${Date.now()}.${ext}`;

    const { error: storageErr } = await supabaseAdmin.storage
      .from('patient-reports')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (storageErr) {
      console.error('[uploadPatientReport] storage error:', storageErr.message);
      throw new AppError('Failed to upload file to storage', 500);
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('patient-reports')
      .getPublicUrl(storagePath);

    const reportUrl = urlData.publicUrl;

    // Insert patient_reports row
    const { data: report, error: insertErr } = await (supabaseAdmin as any)
      .from('patient_reports')
      .insert({
        patient_id: patientId,
        hospital_id: hospital.id,
        report_category: reportCategory,
        report_type: reportType,
        report_name: reportName,
        report_url: reportUrl,
        uploaded_by: userId,
        uploaded_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[uploadPatientReport] insert error:', insertErr.message);
      // Roll back the storage upload
      await supabaseAdmin.storage.from('patient-reports').remove([storagePath]);
      throw new AppError('Failed to save report record', 500);
    }

    sendSuccess(res, { report }, 'Report uploaded successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hospitals/me/patients/search?q=
 * Search patients who have had an appointment at this hospital.
 * Returns id, full_name, phone_number, email.
 */
export async function searchHospitalPatients(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(userId);
    const q = ((req.query.q as string) ?? '').trim();

    if (q.length < 2) {
      sendSuccess(res, { patients: [] }, 'Search query too short');
      return;
    }

    // Find distinct patient_ids who have appointments at this hospital
    const { data: apptRows, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .select('patient_id')
      .eq('hospital_id', hospital.id);

    if (apptErr) throw new AppError('Failed to query appointments', 500);

    const patientIds = [...new Set((apptRows ?? []).map((r: any) => r.patient_id as string))];

    if (patientIds.length === 0) {
      sendSuccess(res, { patients: [] }, 'No patients found');
      return;
    }

    // Search within those patients by name or phone
    const { data: patients, error: patErr } = await supabaseAdmin
      .from('patients')
      .select('id, full_name, phone_number, email')
      .in('id', patientIds)
      .or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`)
      .limit(20);

    if (patErr) throw new AppError('Failed to search patients', 500);

    sendSuccess(res, { patients: patients ?? [] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hospitals/me/patients/:patientId/reports
 * List all reports uploaded by this hospital for a given patient.
 */
export async function listPatientReportsForAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(userId);
    const { patientId } = req.params as { patientId: string };

    const { data: reports, error } = await supabaseAdmin
      .from('patient_reports')
      .select('id, report_name, report_category, report_type, report_url, uploaded_at')
      .eq('patient_id', patientId)
      .eq('hospital_id', hospital.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw new AppError('Failed to fetch reports', 500);

    sendSuccess(res, { reports: reports ?? [] });
  } catch (err) {
    next(err);
  }
}
