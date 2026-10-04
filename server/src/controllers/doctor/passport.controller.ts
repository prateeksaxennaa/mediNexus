import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { requireDoctor } from '../../utils/lookup.js';
import { logPatientDataAccess } from '../../utils/privacyAudit.js';

/**
 * GET /api/doctors/me/patients/:patientId/passport
 * Returns a patient's health passport filtered by what this doctor can access.
 *
 * Access model:
 * 1. Doctor always sees prescriptions they personally wrote.
 * 2. Doctor sees any prescriptions/reports the patient has explicitly granted
 *    them document-level access to (via record_access_grants with document_id).
 * 3. Legacy: if a hospital-level grant exists (no document_id), the doctor
 *    sees all records of that type from that hospital.
 */
export async function getPatientPassportForDoctor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { patientId } = req.params as { patientId: string };

    // Verify the patient exists
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, full_name, dob, blood_group, known_allergies, phone_number, email')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      throw new NotFoundError('Patient not found');
    }

    // Get all active grants for this doctor + patient
    const { data: grants } = await supabaseAdmin
      .from('record_access_grants')
      .select('id, document_type, document_id, granted_to_hospital_id, record_types, valid_until')
      .eq('patient_id', patientId)
      .or(
        `granted_to_doctor_id.eq.${doctor.id},granted_to_hospital_id.eq.${doctor.hospital_id}`
      )
      .gt('valid_until', new Date().toISOString());

    // Check if doctor has own prescriptions for this patient
    const { data: ownRx } = await supabaseAdmin
      .from('prescriptions')
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId);

    const hasOwnRecords = (ownRx?.length ?? 0) > 0;
    const hasGrants = (grants?.length ?? 0) > 0;

    if (!hasOwnRecords && !hasGrants) {
      throw new ForbiddenError(
        'No valid access grant found for this patient. Ask the patient to share their records.'
      );
    }

    // Determine which document IDs the doctor can access
    const grantedPrescriptionIds = new Set<string>();
    const grantedReportIds = new Set<string>();
    let hasFullPrescriptionAccess = false;
    let hasFullReportAccess = false;

    for (const grant of (grants ?? [])) {
      if (grant.document_id) {
        // Document-level grant
        if (grant.document_type === 'prescription') {
          grantedPrescriptionIds.add(grant.document_id);
        } else if (grant.document_type === 'report') {
          grantedReportIds.add(grant.document_id);
        }
      } else {
        // Fallback: decode the packed record_types[] encoding used before
        // the document_type/document_id columns were added to the live DB.
        // Format: [docType, docId, source?]  e.g. ['report', '<uuid>', 'manual']
        // Also handle legacy bulk grants that stored plural type names.
        const types = grant.record_types ?? [];
        if (types.length >= 2 && types[0] === 'report' && types[1]) {
          grantedReportIds.add(types[1]);
        } else if (types.length >= 2 && types[0] === 'prescription' && types[1]) {
          grantedPrescriptionIds.add(types[1]);
        } else if (types.includes('reports')) {
          hasFullReportAccess = true;
        } else if (types.includes('prescriptions')) {
          hasFullPrescriptionAccess = true;
        }
      }
    }

    // Own prescriptions are always accessible
    for (const rx of (ownRx ?? [])) {
      grantedPrescriptionIds.add(rx.id);
    }

    // Fetch prescriptions
    let prescriptions: any[] = [];
    if (hasFullPrescriptionAccess) {
      // Full access to all prescriptions
      const { data } = await supabaseAdmin
        .from('prescriptions')
        .select(
          `id, appointment_id, doctor_id, patient_id, illness_description, issued_at, pdf_url,
           doctors ( full_name, specialisation ),
           prescription_items (
             id, medicine_id, dosage, frequency, duration, doctor_comment,
             medicines ( medicine_name, composition, therapeutic_class )
           )`
        )
        .eq('patient_id', patientId)
        .order('issued_at', { ascending: false });
      prescriptions = data ?? [];
    } else if (grantedPrescriptionIds.size > 0) {
      // Only specific prescriptions
      const { data } = await supabaseAdmin
        .from('prescriptions')
        .select(
          `id, appointment_id, doctor_id, patient_id, illness_description, issued_at, pdf_url,
           doctors ( full_name, specialisation ),
           prescription_items (
             id, medicine_id, dosage, frequency, duration, doctor_comment,
             medicines ( medicine_name, composition, therapeutic_class )
           )`
        )
        .eq('patient_id', patientId)
        .in('id', [...grantedPrescriptionIds])
        .order('issued_at', { ascending: false });
      prescriptions = data ?? [];
    }

    // Fetch reports
    let reports: any[] = [];
    if (hasFullReportAccess) {
      const { data } = await supabaseAdmin
        .from('patient_reports')
        .select('*, hospitals ( name, city )')
        .eq('patient_id', patientId)
        .order('uploaded_at', { ascending: false });
      reports = data ?? [];
    } else if (grantedReportIds.size > 0) {
      const { data } = await supabaseAdmin
        .from('patient_reports')
        .select('*, hospitals ( name, city )')
        .eq('patient_id', patientId)
        .in('id', [...grantedReportIds])
        .order('uploaded_at', { ascending: false });
      reports = data ?? [];
    }

    await logPatientDataAccess({
      patientId,
      actorUserId: userId,
      actorRole: 'doctor',
      actorLabel: doctor.full_name,
      action: 'read',
      resourceType: 'patient_passport',
      resourceId: patientId,
      purpose: 'clinical_treatment',
      metadata: {
        prescriptions_returned: prescriptions.length,
        reports_returned: reports.length,
        record_count: prescriptions.length + reports.length,
      },
      ipAddress: req.ip,
    });

    sendSuccess(
      res,
      {
        patient,
        prescriptions,
        reports,
      },
      'Patient passport retrieved'
    );
  } catch (err) {
    next(err);
  }
}
