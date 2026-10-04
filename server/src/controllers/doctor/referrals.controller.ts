import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { requireDoctor } from '../../utils/lookup.js';
import { logPatientDataAccess } from '../../utils/privacyAudit.js';

// ─── Types ───────────────────────────────────────────────────────────

interface CreateReferralBody {
  patient_id: string;
  referred_to_doctor_id: string;
  reason?: string;
}

// ─── Controllers ─────────────────────────────────────────────────────

/**
 * POST /api/doctors/me/referrals
 * Creates a referral from the current doctor to another doctor for a given patient.
 * Automatically copies all document-level access grants the referring doctor has
 * to the referred-to doctor (with source = 'referral').
 */
export async function createReferral(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { patient_id, referred_to_doctor_id, reason } = req.body as CreateReferralBody;

    if (!patient_id) throw new BadRequestError('patient_id is required');
    if (!referred_to_doctor_id) throw new BadRequestError('referred_to_doctor_id is required');
    if (referred_to_doctor_id === doctor.id) throw new BadRequestError('Cannot refer to yourself');

    // Verify patient exists
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, full_name')
      .eq('id', patient_id)
      .single();

    if (patientError || !patient) {
      throw new NotFoundError('Patient not found');
    }

    // Verify referred-to doctor exists
    const { data: referredDoctor, error: refDocError } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name, specialisation, hospital_id, hospitals ( name )')
      .eq('id', referred_to_doctor_id)
      .single();

    if (refDocError || !referredDoctor) {
      throw new NotFoundError('Referred-to doctor not found');
    }

    // Verify the referring doctor has a relationship with this patient
    // (either has treated them or has an active access grant)
    const [ownRxResult, grantResult] = await Promise.all([
      supabaseAdmin
        .from('prescriptions')
        .select('id')
        .eq('doctor_id', doctor.id)
        .eq('patient_id', patient_id)
        .limit(1),
      supabaseAdmin
        .from('record_access_grants')
        .select('id')
        .eq('patient_id', patient_id)
        .eq('granted_to_doctor_id', doctor.id)
        .gt('valid_until', new Date().toISOString())
        .limit(1),
    ]);

    const hasRelationship =
      (ownRxResult.data?.length ?? 0) > 0 ||
      (grantResult.data?.length ?? 0) > 0;

    if (!hasRelationship) {
      throw new ForbiddenError(
        'You can only refer patients you have a treatment relationship with'
      );
    }

    // Check for existing pending referral
    const { data: existingReferral } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referring_doctor_id', doctor.id)
      .eq('referred_to_doctor_id', referred_to_doctor_id)
      .eq('patient_id', patient_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingReferral) {
      throw new BadRequestError('A pending referral already exists for this patient and doctor');
    }

    // Create the referral
    const { data: referral, error: referralError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referring_doctor_id: doctor.id,
        referred_to_doctor_id,
        patient_id,
        reason: reason ?? null,
        status: 'pending',
      })
      .select()
      .single();

    if (referralError || !referral) {
      console.error('[createReferral] insert failed:', referralError?.message);
      throw new AppError('Failed to create referral', 500);
    }

    // Copy all active document-level grants the referring doctor has to the referred doctor
    const { data: myGrants } = await supabaseAdmin
      .from('record_access_grants')
      .select('*')
      .eq('patient_id', patient_id)
      .eq('granted_to_doctor_id', doctor.id)
      .gt('valid_until', new Date().toISOString());

    let copiedCount = 0;
    if (myGrants && myGrants.length > 0) {
      const newGrants = myGrants.map(g => ({
        patient_id: g.patient_id,
        granted_to_doctor_id: referred_to_doctor_id,
        granted_to_hospital_id: referredDoctor.hospital_id,
        document_type: g.document_type,
        document_id: g.document_id,
        record_types: g.record_types,
        valid_until: g.valid_until,
        source: 'referral',
        created_at: new Date().toISOString(),
      }));

      // Remove existing grants for same documents from referred doctor to avoid duplicates
      const docIds = newGrants.map(g => g.document_id).filter(Boolean);
      if (docIds.length > 0) {
        await supabaseAdmin
          .from('record_access_grants')
          .delete()
          .eq('patient_id', patient_id)
          .eq('granted_to_doctor_id', referred_to_doctor_id)
          .in('document_id', docIds as string[]);
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('record_access_grants')
        .insert(newGrants)
        .select();

      if (insertError) {
        console.error('[createReferral] grant copy failed:', insertError.message);
        // Non-fatal — referral was already created
      } else {
        copiedCount = inserted?.length ?? 0;
      }
    }

    sendSuccess(
      res,
      {
        referral: {
          ...referral,
          referred_to_doctor: referredDoctor,
          patient,
        },
        grants_copied: copiedCount,
      },
      `Patient referred to Dr. ${referredDoctor.full_name}. ${copiedCount} document access(es) shared.`,
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/referrals
 * Lists all referrals where the doctor is either the referring or referred-to doctor.
 */
export async function listReferrals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);

    // Get referrals where this doctor is either sender or receiver
    const { data: sentResult, error: sentError } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referring_doctor_id', doctor.id)
      .order('created_at', { ascending: false });

    const { data: receivedResult, error: receivedError } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referred_to_doctor_id', doctor.id)
      .order('created_at', { ascending: false });

    if (sentError || receivedError) {
      const errMsg = sentError?.message ?? receivedError?.message ?? '';
      // If the table doesn't exist yet (migration not applied), return empty list gracefully
      if (
        errMsg.includes('relation') ||
        errMsg.includes('does not exist') ||
        errMsg.includes('schema cache') ||
        errMsg.includes('Could not find the table')
      ) {
        sendSuccess(res, { referrals: [] }, 'Referrals retrieved (table not yet available)');
        return;
      }
      throw new AppError('Failed to fetch referrals', 500);
    }

    const allReferrals = [...(sentResult ?? []), ...(receivedResult ?? [])];

    // Enrich with doctor and patient names
    const doctorIds = [...new Set([
      ...allReferrals.map(r => r.referring_doctor_id),
      ...allReferrals.map(r => r.referred_to_doctor_id),
    ].filter(Boolean))];
    const patientIds = [...new Set(allReferrals.map(r => r.patient_id).filter(Boolean))];

    const [doctorsRes, patientsRes] = await Promise.all([
      doctorIds.length > 0
        ? supabaseAdmin.from('doctors').select('id, full_name, specialisation, hospitals ( name, city )').in('id', doctorIds)
        : Promise.resolve({ data: [] }),
      patientIds.length > 0
        ? supabaseAdmin.from('patients').select('id, full_name, phone_number, email').in('id', patientIds)
        : Promise.resolve({ data: [] }),
    ]);

    const doctorMap: Record<string, any> = {};
    for (const d of (doctorsRes.data ?? [])) doctorMap[d.id] = d;

    const patientMap: Record<string, any> = {};
    for (const p of (patientsRes.data ?? [])) patientMap[p.id] = p;

    const enriched = allReferrals.map(r => ({
      ...r,
      referring_doctor: doctorMap[r.referring_doctor_id] ?? null,
      referred_to_doctor: doctorMap[r.referred_to_doctor_id] ?? null,
      patient: patientMap[r.patient_id] ?? null,
      direction: r.referring_doctor_id === doctor.id ? 'sent' : 'received',
    }));

    // Sort by created_at descending
    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    sendSuccess(res, { referrals: enriched }, 'Referrals retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/doctors/me/referrals/:referralId/status
 * Updates the status of a referral (accept/decline/complete).
 * Only the referred-to doctor can accept/decline; referring doctor can mark complete.
 */
export async function updateReferralStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { referralId } = req.params as { referralId: string };
    const { status } = req.body as { status: 'accepted' | 'declined' | 'completed' };

    if (!['accepted', 'declined', 'completed'].includes(status)) {
      throw new BadRequestError('Invalid status. Must be: accepted, declined, or completed');
    }

    const { data: referral, error: fetchError } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .single();

    if (fetchError || !referral) {
      throw new NotFoundError('Referral not found');
    }

    // Permission checks
    if (status === 'accepted' || status === 'declined') {
      if (referral.referred_to_doctor_id !== doctor.id) {
        throw new ForbiddenError('Only the referred-to doctor can accept or decline');
      }
      if (referral.status !== 'pending') {
        throw new BadRequestError(`Cannot ${status} a referral that is already ${referral.status}`);
      }
    }

    if (status === 'completed') {
      if (referral.referring_doctor_id !== doctor.id && referral.referred_to_doctor_id !== doctor.id) {
        throw new ForbiddenError('Only the involved doctors can mark a referral as completed');
      }
      if (referral.status !== 'accepted') {
        throw new BadRequestError('Can only complete an accepted referral');
      }
    }

    // If declining, remove the copied grants
    if (status === 'declined') {
      await supabaseAdmin
        .from('record_access_grants')
        .delete()
        .eq('patient_id', referral.patient_id)
        .eq('granted_to_doctor_id', referral.referred_to_doctor_id)
        .eq('source', 'referral');
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('referrals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', referralId)
      .select()
      .single();

    if (updateError || !updated) {
      throw new AppError('Failed to update referral', 500);
    }

    sendSuccess(res, { referral: updated }, `Referral ${status}`);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/patients/:patientId/accessible-documents
 * Returns which documents the doctor can access for a given patient.
 * Useful for the referral flow to know what gets shared.
 */
export async function getAccessibleDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { patientId } = req.params as { patientId: string };

    // Get active grants for this doctor + patient
    const { data: grants } = await supabaseAdmin
      .from('record_access_grants')
      .select('document_type, document_id')
      .eq('patient_id', patientId)
      .eq('granted_to_doctor_id', doctor.id)
      .gt('valid_until', new Date().toISOString());

    // Also get prescriptions the doctor wrote themselves
    const { data: ownRx } = await supabaseAdmin
      .from('prescriptions')
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId);

    const grantedPrescriptionIds = (grants ?? [])
      .filter(g => g.document_type === 'prescription')
      .map(g => g.document_id)
      .filter(Boolean);

    const grantedReportIds = (grants ?? [])
      .filter(g => g.document_type === 'report')
      .map(g => g.document_id)
      .filter(Boolean);

    const ownPrescriptionIds = (ownRx ?? []).map(r => r.id);

    // Combine own + granted prescription IDs
    const allPrescriptionIds = [...new Set([...ownPrescriptionIds, ...grantedPrescriptionIds])];

    await logPatientDataAccess({
      patientId,
      actorUserId: userId,
      actorRole: 'doctor',
      actorLabel: doctor.full_name,
      action: 'read',
      resourceType: 'accessible_documents',
      resourceId: patientId,
      purpose: 'referral_preparation',
      metadata: {
        prescription_count: allPrescriptionIds.length,
        report_count: grantedReportIds.length,
        record_count: allPrescriptionIds.length + grantedReportIds.length,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, {
      accessible_prescription_ids: allPrescriptionIds,
      accessible_report_ids: grantedReportIds,
      total: allPrescriptionIds.length + grantedReportIds.length,
    }, 'Accessible documents retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/search?q=...
 * Searches for doctors by name or specialisation. Used when creating referrals.
 * Public within authenticated doctor context.
 */
export async function searchDoctors(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const q = (req.query.q as string ?? '').trim();
    if (q.length < 2) {
      sendSuccess(res, { doctors: [] }, 'Query too short');
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name, specialisation, hospital_id, hospitals ( name, city )')
      .or(`full_name.ilike.%${q}%,specialisation.ilike.%${q}%`)
      .limit(20);

    if (error) {
      throw new AppError('Failed to search doctors', 500);
    }

    sendSuccess(res, { doctors: data ?? [] }, 'Doctors found');
  } catch (err) {
    next(err);
  }
}
