import { Request, Response } from 'express';
import { supabaseAdmin as supabaseAdminRaw } from '../../config/supabase.js';
import { requireHospital } from "../../utils/lookup.js";
import { z } from 'zod';

const supabaseAdmin: any = supabaseAdminRaw;

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

const isValidDateOnly = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateOnly(value).getTime());

// Generate dates between start and end (inclusive), skipping Sundays
const getWorkingDates = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    const dayOfWeek = current.getUTCDay(); // 0 = Sunday
    if (dayOfWeek !== 0) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const generateSlotsSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  startDate: z.string().refine(isValidDateOnly, 'Invalid startDate (expected YYYY-MM-DD)'),
  endDate: z.string().refine(isValidDateOnly, 'Invalid endDate (expected YYYY-MM-DD)'),
  numberOfSlots: z.number().int().positive().max(200, 'Max 200 slots per day').optional(),
});

const updateServiceDaySlotsSchema = z.object({
  serviceId: z.string().uuid(),
  slotDate: z.string().refine(isValidDateOnly, 'Invalid slotDate (expected YYYY-MM-DD)'),
  numberOfSlots: z.number().int().positive().max(200, 'Max 200 slots per day'),
});

export const generateServiceSlots = async (req: Request, res: Response) => {
  try {
    const parsed = generateSlotsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }
    const { serviceId, startDate, endDate, numberOfSlots } = parsed.data;

    // Validate date range
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (end < start) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 90) {
      return res.status(400).json({ error: 'Date range cannot exceed 90 days' });
    }

    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    // Verify service belongs to admin's hospital
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, hospital_id, service_name, daily_slot_limit')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const resolvedSlotsPerDay = numberOfSlots ?? service.daily_slot_limit ?? 10;
    const workingDates = getWorkingDates(startDate, endDate);

    if (workingDates.length === 0) {
      return res.status(400).json({ error: 'No working days in the selected date range (all Sundays)' });
    }

    // Build all slots for all working dates
    const slots: { service_id: string; slot_date: string; slot_number: number; status: string }[] = [];
    for (const date of workingDates) {
      for (let slotNum = 1; slotNum <= resolvedSlotsPerDay; slotNum++) {
        slots.push({
          service_id: serviceId,
          slot_date: date,
          slot_number: slotNum,
          status: 'available',
        });
      }
    }

    // Upsert all slots (ignore existing to avoid duplicate errors)
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('service_slots')
      .upsert(slots, {
        onConflict: 'service_id,slot_date,slot_number',
        ignoreDuplicates: true,
      })
      .select('id');

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to generate slots' });
    }

    res.json({
      data: {
        generated: inserted?.length ?? 0,
        startDate,
        endDate,
        workingDays: workingDates.length,
        slotsPerDay: resolvedSlotsPerDay,
        totalRequested: slots.length,
        serviceName: service.service_name,
      },
    });
  } catch (error) {
    console.error('Generate slots error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: 'Failed to generate slots' });
  }
};

export const updateServiceDaySlots = async (req: Request, res: Response) => {
  try {
    const parsed = updateServiceDaySlotsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }
    const { serviceId, slotDate, numberOfSlots } = parsed.data;

    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    const { data: service, error: serviceError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, hospital_id, service_name')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate not Sunday
    const date = new Date(`${slotDate}T00:00:00.000Z`);
    if (date.getUTCDay() === 0) {
      return res.status(400).json({ error: 'Cannot manage slots on Sunday' });
    }

    const { data: existingSlots, error: slotsError } = await supabaseAdmin
      .from('service_slots')
      .select('id, slot_number, status')
      .eq('service_id', serviceId)
      .eq('slot_date', slotDate)
      .order('slot_number', { ascending: true });

    if (slotsError) {
      return res.status(500).json({ error: 'Failed to fetch existing slots' });
    }

    const currentMax = (existingSlots ?? []).reduce(
      (max: number, slot: any) => Math.max(max, slot.slot_number),
      0
    );

    if (currentMax < numberOfSlots) {
      // Add new slots
      const toInsert = [];
      for (let slotNum = currentMax + 1; slotNum <= numberOfSlots; slotNum++) {
        toInsert.push({
          service_id: serviceId,
          slot_date: slotDate,
          slot_number: slotNum,
          status: 'available',
        });
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('service_slots')
          .insert(toInsert);

        if (insertError) {
          return res.status(500).json({ error: 'Failed to add slots' });
        }
      }
    } else if (currentMax > numberOfSlots) {
      // Remove only available slots beyond the new limit
      const removableIds = (existingSlots ?? [])
        .filter((slot: any) => slot.slot_number > numberOfSlots && slot.status === 'available')
        .map((slot: any) => slot.id);

      if (removableIds.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('service_slots')
          .delete()
          .in('id', removableIds);

        if (deleteError) {
          return res.status(500).json({ error: 'Failed to remove extra slots' });
        }
      }
    }

    const { data: updatedSlots, error: updatedSlotsError } = await supabaseAdmin
      .from('service_slots')
      .select('id, slot_number, status')
      .eq('service_id', serviceId)
      .eq('slot_date', slotDate)
      .order('slot_number', { ascending: true });

    if (updatedSlotsError) {
      return res.status(500).json({ error: 'Failed to fetch updated slots' });
    }

    const total = updatedSlots?.length ?? 0;
    const booked = updatedSlots?.filter((slot: any) => slot.status === 'booked').length ?? 0;
    const locked = updatedSlots?.filter((slot: any) => slot.status === 'locked').length ?? 0;
    const available = updatedSlots?.filter((slot: any) => slot.status === 'available').length ?? 0;

    res.json({
      data: {
        serviceId,
        slotDate,
        requestedSlots: numberOfSlots,
        total,
        available,
        booked,
        locked,
      },
    });
  } catch (error) {
    console.error('Update service day slots error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: 'Failed to update day slots' });
  }
};

export const listServiceSlots = async (req: Request, res: Response) => {
  try {
    const { serviceId, date, status, startDate, endDate } = req.query;
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    let query = supabaseAdmin
      .from('hospital_services')
      .select('id, service_name, department, daily_slot_limit, is_available')
      .eq('hospital_id', hospitalId);

    if (serviceId) {
      query = query.eq('id', serviceId as string);
    }

    const { data: services, error: servicesError } = await query;

    if (servicesError || !services || services.length === 0) {
      return res.status(404).json({ error: 'No services found' });
    }

    const serviceIds = services.map((s: any) => s.id);

    let slotsQuery = supabaseAdmin
      .from('service_slots')
      .select('*')
      .in('service_id', serviceIds)
      .order('slot_date', { ascending: true })
      .order('slot_number', { ascending: true });

    if (startDate && endDate) {
      if (!isValidDateOnly(startDate as string) || !isValidDateOnly(endDate as string)) {
        return res.status(400).json({ error: 'Invalid startDate or endDate (YYYY-MM-DD)' });
      }
      slotsQuery = slotsQuery
        .gte('slot_date', startDate as string)
        .lte('slot_date', endDate as string);
    } else if (date) {
      if (!isValidDateOnly(date as string)) {
        return res.status(400).json({ error: 'Invalid date (YYYY-MM-DD)' });
      }
      slotsQuery = slotsQuery.eq('slot_date', date as string);
    }

    if (status) {
      const validStatuses = ['available', 'locked', 'booked', 'blocked'];
      if (!validStatuses.includes(status as string)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      slotsQuery = slotsQuery.eq('status', status as string);
    }

    const { data: slots, error: slotsError } = await slotsQuery;

    if (slotsError) {
      return res.status(500).json({ error: 'Failed to fetch slots' });
    }

    const slotsByService = services.map((service: any) => ({
      ...service,
      slots: slots?.filter((s: any) => s.service_id === service.id) || [],
    }));

    res.json({ data: { services: slotsByService } });
  } catch (error) {
    console.error('List slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

export const getServiceSlotDetails = async (req: Request, res: Response) => {
  try {
    const slotId = String(req.params.slotId ?? '');
    if (!slotId || !/^[0-9a-f-]{36}$/i.test(slotId)) {
      return res.status(400).json({ error: 'Invalid slot ID' });
    }

    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    const { data: slot, error } = await supabaseAdmin
      .from('service_slots')
      .select(`
        *,
        hospital_services!inner(id, service_name, department, fee, hospital_id)
      `)
      .eq('id', slotId)
      .single();

    if (error || !slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (slot.hospital_services.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ data: { slot } });
  } catch (error) {
    console.error('Get slot error:', error);
    res.status(500).json({ error: 'Failed to fetch slot details' });
  }
};

export const deleteServiceSlot = async (req: Request, res: Response) => {
  try {
    const slotId = String(req.params.slotId ?? '');
    if (!slotId || !/^[0-9a-f-]{36}$/i.test(slotId)) {
      return res.status(400).json({ error: 'Invalid slot ID' });
    }

    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    const { data: slot, error: slotError } = await supabaseAdmin
      .from('service_slots')
      .select(`
        *,
        hospital_services!inner(id, hospital_id)
      `)
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (slot.hospital_services.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (slot.status === 'booked') {
      return res.status(400).json({ error: 'Cannot delete a booked slot. Cancel the appointment first.' });
    }

    if (slot.status === 'locked') {
      return res.status(400).json({ error: 'Cannot delete a locked slot. Wait for the lock to expire.' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('service_slots')
      .delete()
      .eq('id', slotId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete slot' });
    }

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

export const bulkDeleteServiceSlots = async (req: Request, res: Response) => {
  try {
    const { serviceId, startDate, endDate } = req.body;

    if (!serviceId || typeof serviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      return res.status(400).json({ error: 'Valid serviceId (UUID) is required' });
    }
    if (!startDate || !isValidDateOnly(startDate)) {
      return res.status(400).json({ error: 'Valid startDate (YYYY-MM-DD) is required' });
    }
    if (!endDate || !isValidDateOnly(endDate)) {
      return res.status(400).json({ error: 'Valid endDate (YYYY-MM-DD) is required' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }

    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    const { data: service, error: serviceError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, hospital_id')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabaseAdmin
      .from('service_slots')
      .delete()
      .eq('service_id', serviceId)
      .eq('status', 'available')
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .select('id');

    if (error) {
      return res.status(500).json({ error: 'Failed to delete slots' });
    }

    res.json({ data: { deleted: data?.length || 0, startDate, endDate } });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete slots' });
  }
};

export const getServiceSlotAvailability = async (req: Request, res: Response) => {
  try {
    // serviceId comes from the route param (:serviceId), dates from query string
    const serviceId = req.params.serviceId ?? req.query.serviceId;
    const { startDate, endDate } = req.query;
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    const hospital = await requireHospital(adminId);
    const hospitalId = hospital.id;

    if (typeof serviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      return res.status(400).json({ error: 'Valid serviceId is required' });
    }

    if (
      typeof startDate !== 'string' ||
      typeof endDate !== 'string' ||
      !isValidDateOnly(startDate) ||
      !isValidDateOnly(endDate)
    ) {
      return res.status(400).json({ error: 'Valid startDate and endDate are required (YYYY-MM-DD)' });
    }

    if (endDate < startDate) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }

    const { data: service, error: serviceError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, service_name, department, daily_slot_limit, is_available, hospital_id')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.hospital_id !== hospitalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: slots, error: slotsError } = await supabaseAdmin
      .from('service_slots')
      .select('slot_date, status')
      .eq('service_id', serviceId)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate);

    if (slotsError) {
      return res.status(500).json({ error: 'Failed to fetch availability' });
    }

    const availability: Record<string, { total: number; available: number; booked: number; locked: number }> = {};

    slots?.forEach((slot: any) => {
      if (!availability[slot.slot_date]) {
        availability[slot.slot_date] = { total: 0, available: 0, booked: 0, locked: 0 };
      }
      availability[slot.slot_date].total++;
      if (slot.status === 'available') {
        availability[slot.slot_date].available++;
      } else if (slot.status === 'booked') {
        availability[slot.slot_date].booked++;
      } else if (slot.status === 'locked') {
        availability[slot.slot_date].locked++;
      }
    });

    res.json({ data: { service, availability } });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};
