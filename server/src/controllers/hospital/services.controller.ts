import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';
import type {
  CreateServiceBody,
  UpdateServiceBody,
} from '../../validators/hospital/service.validator.js';

/**
 * GET /api/hospitals/me/services
 */
export async function listHospitalServices(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    const { data, error } = await supabaseAdmin
      .from('hospital_services')
      .select('*')
      .eq('hospital_id', hospital.id)
      .order('service_name');

    if (error) {
      console.error('[listHospitalServices] query failed:', error.message);
      throw new AppError('Failed to fetch services', 500);
    }

    sendSuccess(res, { services: data ?? [] }, 'Services retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/hospitals/me/services
 */
export async function createHospitalService(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const body = req.body as CreateServiceBody;

    const { data, error } = await supabaseAdmin
      .from('hospital_services')
      .insert({ ...body, hospital_id: hospital.id })
      .select()
      .single();

    if (error || !data) {
      console.error('[createHospitalService] insert failed:', error?.message);
      throw new AppError('Failed to create service', 500);
    }

    sendSuccess(res, { service: data }, 'Service created', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/hospitals/me/services/:serviceId
 */
export async function updateHospitalService(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { serviceId } = req.params as { serviceId: string };
    const body = req.body as UpdateServiceBody;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, hospital_id')
      .eq('id', serviceId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Service not found');
    }

    const { data, error } = await supabaseAdmin
      .from('hospital_services')
      .update(body)
      .eq('id', serviceId)
      .select()
      .single();

    if (error || !data) {
      console.error('[updateHospitalService] update failed:', error?.message);
      throw new AppError('Failed to update service', 500);
    }

    sendSuccess(res, { service: data }, 'Service updated');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/hospitals/me/services/:serviceId
 */
export async function deleteHospitalService(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { serviceId } = req.params as { serviceId: string };

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, hospital_id')
      .eq('id', serviceId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Service not found');
    }

    const { error } = await supabaseAdmin
      .from('hospital_services')
      .delete()
      .eq('id', serviceId);

    if (error) {
      console.error('[deleteHospitalService] delete failed:', error.message);
      throw new AppError('Failed to delete service', 500);
    }

    sendSuccess(res, null, 'Service deleted');
  } catch (err) {
    next(err);
  }
}
