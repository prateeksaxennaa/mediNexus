import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

/**
 * GET /api/patients/me/passport
 * Returns the patient's full health passport:
 *  - prescriptions (all, from all hospitals)
 *  - reports (all)
 *  - grants (enriched with doctor names, document details, grouped by doctor)
 *  - referrals (incoming referrals to this patient)
 */
export async function getPatientPassport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    // Run all queries in parallel
    const [prescriptionsResult, reportsResult, grantsResult] = await Promise.all([
      supabaseAdmin
        .from('prescriptions')
        .select(
          `id, appointment_id, doctor_id, patient_id, illness_description, issued_at, pdf_url,
           doctors ( full_name, specialisation, hospitals ( name, city ) ),
           prescription_items (
             id, medicine_id, dosage, frequency, duration, doctor_comment,
             medicines ( medicine_name, composition, therapeutic_class, uses )
           )`
        )
        .eq('patient_id', patient.id)
        .order('issued_at', { ascending: false }),
      supabaseAdmin
        .from('patient_reports')
        .select('*, hospitals ( name, city )')
        .eq('patient_id', patient.id)
        .order('uploaded_at', { ascending: false }),
      // Select the new document-level columns added by migration 006
      supabaseAdmin
        .from('record_access_grants')
        .select(
          `id, granted_to_hospital_id, granted_to_doctor_id, document_type, document_id, source, record_types, valid_until, created_at`
        )
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false }),
    ]);

    if (prescriptionsResult.error) {
      console.error('[getPatientPassport] prescriptions query failed:', prescriptionsResult.error.message);
      throw new AppError('Failed to fetch prescriptions', 500);
    }

    // Referrals query is wrapped separately with graceful error handling
    // (the table may not exist yet if migration 006 hasn't run)
    const referralsResult = await supabaseAdmin
      .from('referrals')
      .select(
        `id, referring_doctor_id, referred_to_doctor_id, reason, status, created_at, updated_at`
      )
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false });

    // Enrich grants with doctor & document details
    const rawGrants = grantsResult.data ?? [];
    let enrichedGrants: any[] = [];

    if (rawGrants.length > 0) {
      // Use the new direct columns (migration 006). Fall back to record_types[] for old rows.
      const decoded = rawGrants.map(g => {
        let docType = (g as any).document_type ?? '';
        let docId = (g as any).document_id ?? '';
        let source = (g as any).source ?? 'manual';

        // Legacy fallback: old rows that haven't been re-saved may only have record_types
        if (!docType && g.record_types) {
          const rt = (g.record_types ?? []) as string[];
          docType = rt[0] ?? '';
          docId = rt[1] ?? '';
          source = rt[2] ?? 'manual';
        }

        return { ...g, document_type: docType, document_id: docId, source };
      });

      const doctorIds = [...new Set(decoded.map(g => g.granted_to_doctor_id).filter(Boolean))];
      const prescriptionIds = decoded.filter(g => g.document_type === 'prescription').map(g => g.document_id).filter(Boolean);
      const reportIds = decoded.filter(g => g.document_type === 'report').map(g => g.document_id).filter(Boolean);

      const [doctorsRes, rxRes, rptRes] = await Promise.all([
        doctorIds.length > 0
          ? supabaseAdmin.from('doctors').select('id, full_name, specialisation, hospitals ( name, city )').in('id', doctorIds as string[])
          : Promise.resolve({ data: [] }),
        prescriptionIds.length > 0
          ? supabaseAdmin.from('prescriptions').select('id, illness_description, issued_at, doctors ( full_name )').in('id', prescriptionIds as string[])
          : Promise.resolve({ data: [] }),
        reportIds.length > 0
          ? supabaseAdmin.from('patient_reports').select('id, report_name, report_type, uploaded_at').in('id', reportIds as string[])
          : Promise.resolve({ data: [] }),
      ]);

      const doctorMap: Record<string, any> = {};
      for (const d of (doctorsRes.data ?? [])) doctorMap[d.id] = d;

      const rxMap: Record<string, any> = {};
      for (const p of (rxRes.data ?? [])) rxMap[p.id] = p;

      const rptMap: Record<string, any> = {};
      for (const r of (rptRes.data ?? [])) rptMap[r.id] = r;

      enrichedGrants = decoded.map(g => ({
        ...g,
        doctor: g.granted_to_doctor_id ? doctorMap[g.granted_to_doctor_id] ?? null : null,
        document: g.document_id
          ? (g.document_type === 'prescription' ? rxMap[g.document_id] : rptMap[g.document_id]) ?? null
          : null,
        is_active: new Date(g.valid_until) > new Date(),
      }));
    }

    // Enrich referrals with doctor names — graceful if table doesn't exist yet
    let enrichedReferrals: any[] = [];
    if (!referralsResult.error && (referralsResult.data?.length ?? 0) > 0) {
      const rawReferrals = referralsResult.data!;
      const allDoctorIds = [
        ...new Set([
          ...rawReferrals.map(r => r.referring_doctor_id),
          ...rawReferrals.map(r => r.referred_to_doctor_id),
        ].filter(Boolean)),
      ];

      const { data: refDoctors } = await supabaseAdmin
        .from('doctors')
        .select('id, full_name, specialisation, hospitals ( name, city )')
        .in('id', allDoctorIds as string[]);

      const refDocMap: Record<string, any> = {};
      for (const d of (refDoctors ?? [])) refDocMap[d.id] = d;

      enrichedReferrals = rawReferrals.map(r => ({
        ...r,
        referring_doctor: refDocMap[r.referring_doctor_id] ?? null,
        referred_to_doctor: refDocMap[r.referred_to_doctor_id] ?? null,
      }));
    } else if (referralsResult.error) {
      console.warn('[getPatientPassport] referrals query failed (table may not exist yet):', referralsResult.error.message);
    }

    sendSuccess(
      res,
      {
        profile: patient,
        prescriptions: prescriptionsResult.data ?? [],
        reports: reportsResult.data ?? [],
        grants: enrichedGrants,
        referrals: enrichedReferrals,
      },
      'Health passport retrieved'
    );
  } catch (err) {
    next(err);
  }
}
