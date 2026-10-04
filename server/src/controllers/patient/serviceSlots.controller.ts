import { Request, Response } from 'express';
import { supabaseAdmin as supabaseAdminRaw } from '../../config/supabase.js';

const supabaseAdmin: any = supabaseAdminRaw;

const isValidUUID = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const isValidDateOnly = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ─── Discover Services ────────────────────────────────────────────────────────

export const discoverServices = async (req: Request, res: Response) => {
  try {
    const { hospitalId, search, department, availableOn } = req.query;

    let query = supabaseAdmin
      .from('hospital_services')
      .select(`
        id, service_name, service_type, department, default_duration_mins, fee,
        pay_at_counter, is_available, daily_slot_limit,
        hospitals(id, name, city, address)
      `)
      .eq('is_available', true);

    if (hospitalId) query = query.eq('hospital_id', hospitalId as string);
    if (search) query = query.or(`service_name.ilike.%${search}%,department.ilike.%${search}%`);
    if (department) query = query.eq('department', department as string);

    const { data: services, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch services' });

    let result = services || [];

    if (availableOn && isValidDateOnly(availableOn)) {
      const serviceIds = result.map((s: any) => s.id);
      const { data: slots } = await supabaseAdmin
        .from('service_slots')
        .select('service_id, status')
        .in('service_id', serviceIds)
        .eq('slot_date', availableOn as string)
        .eq('status', 'available');

      const countMap: Record<string, number> = {};
      slots?.forEach((s: any) => {
        countMap[s.service_id] = (countMap[s.service_id] || 0) + 1;
      });

      result = result.map((service: any) => ({
        ...service,
        slotsAvailable: countMap[service.id] ?? 0,
      }));
    }

    res.json({ data: { services: result } });
  } catch (error) {
    console.error('Discover services error:', error);
    res.status(500).json({ error: 'Failed to discover services' });
  }
};

// ─── Get Service Details ──────────────────────────────────────────────────────

export const getServiceDetails = async (req: Request, res: Response) => {
  try {
    const serviceId = String(req.params.serviceId ?? '');
    if (!isValidUUID(serviceId)) {
      return res.status(400).json({ error: 'Invalid service ID' });
    }

    const { data: service, error } = await supabaseAdmin
      .from('hospital_services')
      .select(`
        id, service_name, service_type, department, default_duration_mins, fee,
        pay_at_counter, is_available, daily_slot_limit,
        hospitals(id, name, city, address, phone)
      `)
      .eq('id', serviceId)
      .single();

    if (error || !service) return res.status(404).json({ error: 'Service not found' });
    if (!service.is_available) return res.status(400).json({ error: 'Service is not available' });

    res.json({ data: { service } });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Failed to fetch service details' });
  }
};

// ─── Get Service Slots ────────────────────────────────────────────────────────

export const getServiceSlots = async (req: Request, res: Response) => {
  try {
    const serviceId = String(req.params.serviceId ?? '');
    if (!isValidUUID(serviceId)) {
      return res.status(400).json({ error: 'Invalid service ID' });
    }

    const { date, startDate, endDate } = req.query;

    // Validate date params
    if (date && !isValidDateOnly(date)) {
      return res.status(400).json({ error: 'Invalid date (YYYY-MM-DD)' });
    }
    if (startDate && !isValidDateOnly(startDate)) {
      return res.status(400).json({ error: 'Invalid startDate (YYYY-MM-DD)' });
    }
    if (endDate && !isValidDateOnly(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate (YYYY-MM-DD)' });
    }
    if (startDate && endDate && (endDate as string) < (startDate as string)) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }

    const { data: service, error: serviceError } = await supabaseAdmin
      .from('hospital_services')
      .select('id, service_name, department, is_available, daily_slot_limit, fee, pay_at_counter, hospitals(id, name, city, address)')
      .eq('id', serviceId)
      .eq('is_available', true)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Service not found or unavailable' });
    }

    let query = supabaseAdmin
      .from('service_slots')
      .select('id, service_id, slot_date, slot_number, status')
      .eq('service_id', serviceId);

    if (date) {
      query = query.eq('slot_date', date as string);
    } else if (startDate && endDate) {
      query = query
        .gte('slot_date', startDate as string)
        .lte('slot_date', endDate as string);
    } else {
      // Default: today
      const today = new Date().toISOString().split('T')[0];
      query = query.eq('slot_date', today);
    }

    query = query
      .order('slot_date', { ascending: true })
      .order('slot_number', { ascending: true });

    const { data: slots, error: slotsError } = await query;
    if (slotsError) return res.status(500).json({ error: 'Failed to fetch slots' });

    // Group by date
    const slotsByDate: Record<string, typeof slots> = {};
    slots?.forEach((slot: any) => {
      if (!slotsByDate[slot.slot_date]) slotsByDate[slot.slot_date] = [];
      slotsByDate[slot.slot_date].push(slot);
    });

    res.json({ data: { service, slots: slotsByDate } });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

// ─── Lock Service Slot ────────────────────────────────────────────────────────

export const lockServiceSlot = async (req: Request, res: Response) => {
  try {
    const { slotId } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!isValidUUID(slotId)) return res.status(400).json({ error: 'Invalid slot ID' });

    const { data: slot, error: slotError } = await supabaseAdmin
      .from('service_slots')
      .select('id, status, service_id, hospital_services!inner(id, service_name, is_available, hospital_id)')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) return res.status(404).json({ error: 'Slot not found' });
    if (!slot.hospital_services.is_available) {
      return res.status(400).json({ error: 'Service is not available' });
    }
    if (slot.status !== 'available') {
      return res.status(409).json({ error: 'Slot is not available' });
    }

    const lockedUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    // Optimistic concurrency: only update if still available
    const { data: updatedSlot, error: updateError } = await supabaseAdmin
      .from('service_slots')
      .update({ status: 'locked', locked_by: userId, locked_until: lockedUntil })
      .eq('id', slotId)
      .eq('status', 'available')    // ← concurrency guard
      .select('id, slot_date, slot_number, status, locked_until')
      .single();

    if (updateError || !updatedSlot) {
      return res.status(409).json({ error: 'Slot was just taken by another user. Please choose another.' });
    }

    res.json({ data: { slot: updatedSlot, lockedUntil } });
  } catch (error) {
    console.error('Lock slot error:', error);
    res.status(500).json({ error: 'Failed to lock slot' });
  }
};

// ─── Book Service Slot ────────────────────────────────────────────────────────

export const bookServiceSlot = async (req: Request, res: Response) => {
  try {
    const { slotId, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!isValidUUID(slotId)) return res.status(400).json({ error: 'Invalid slot ID' });

    // Fetch patient profile
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, user_id')
      .eq('user_id', userId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: 'Patient profile not found. Please complete your profile first.' });
    }

    // Fetch slot with service info
    const { data: slot, error: slotError } = await supabaseAdmin
      .from('service_slots')
      .select('id, status, slot_date, slot_number, locked_by, service_id, hospital_services!inner(id, service_name, hospital_id, fee, is_available)')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) return res.status(404).json({ error: 'Slot not found' });

    // Validate slot is bookable by this user
    if (slot.status === 'booked') {
      return res.status(409).json({ error: 'This slot has already been booked' });
    }
    if (slot.status === 'blocked') {
      return res.status(409).json({ error: 'This slot is not available for booking' });
    }
    if (slot.status === 'locked' && slot.locked_by !== userId) {
      return res.status(409).json({ error: 'This slot is currently being booked by another user' });
    }
    if (slot.status === 'locked') {
      // Check lock hasn't expired
      const { data: freshSlot } = await supabaseAdmin
        .from('service_slots')
        .select('locked_until')
        .eq('id', slotId)
        .single();

      if (freshSlot?.locked_until && new Date(freshSlot.locked_until) < new Date()) {
        return res.status(409).json({ error: 'Your slot hold has expired. Please select the slot again.' });
      }
    }

    // Check for existing active booking by same patient on same slot_date + service
    const { data: existingBooking } = await supabaseAdmin
      .from('service_appointments')
      .select('id')
      .eq('patient_id', patient.id)
      .eq('service_id', slot.service_id)
      .eq('status', 'booked')
      .limit(1);

    // Note: we allow re-booking a different slot date, but check same slot
    const { data: slotAlreadyBooked } = await supabaseAdmin
      .from('service_appointments')
      .select('id')
      .eq('slot_id', slotId)
      .neq('status', 'cancelled')
      .limit(1);

    if (slotAlreadyBooked && slotAlreadyBooked.length > 0) {
      return res.status(409).json({ error: 'This slot has already been booked' });
    }

    // Create the appointment
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from('service_appointments')
      .insert({
        slot_id: slotId,
        patient_id: patient.id,
        hospital_id: slot.hospital_services.hospital_id,
        service_id: slot.service_id,
        booking_type: 'online',
        status: 'booked',
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (appointmentError) {
      console.error('Appointment insert error:', appointmentError);
      return res.status(500).json({ error: 'Failed to create appointment. Please try again.' });
    }

    // Mark slot as booked atomically — use conditional update as a final safety check
    const { error: slotUpdateError } = await supabaseAdmin
      .from('service_slots')
      .update({ status: 'booked', locked_by: null, locked_until: null })
      .eq('id', slotId)
      .in('status', ['available', 'locked']);   // Won't update if already booked by a race

    if (slotUpdateError) {
      console.error('Slot status update error:', slotUpdateError);
      // Appointment was created — still return success; slot status will be corrected
    }

    res.json({
      data: {
        appointment: {
          ...appointment,
          slot_date: slot.slot_date,
          slot_number: slot.slot_number,
        },
        service: slot.hospital_services,
      },
    });
  } catch (error) {
    console.error('Book slot error:', error);
    res.status(500).json({ error: 'Failed to book slot' });
  }
};

// ─── Release Service Slot ─────────────────────────────────────────────────────

export const releaseServiceSlot = async (req: Request, res: Response) => {
  try {
    const slotId = String(req.params.slotId ?? '');
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!isValidUUID(slotId)) return res.status(400).json({ error: 'Invalid slot ID' });

    const { data: slot, error: updateError } = await supabaseAdmin
      .from('service_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('id', slotId)
      .eq('locked_by', userId)
      .eq('status', 'locked')
      .select('id')
      .single();

    // It's OK if the slot wasn't locked by this user (already expired or released)
    if (updateError && updateError.code !== 'PGRST116') {
      console.error('Release slot error:', updateError);
    }

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Release slot error:', error);
    res.status(500).json({ error: 'Failed to release slot' });
  }
};

// ─── List My Service Appointments ─────────────────────────────────────────────

export const listMyServiceAppointments = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { status } = req.query;

    const { data: patient } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    let query = supabaseAdmin
      .from('service_appointments')
      .select(`
        id, slot_id, service_id, hospital_id, booking_type, status, notes, booked_at, created_at,
        service_slots(slot_date, slot_number),
        hospital_services(id, service_name, department, fee, service_type),
        hospitals(id, name, city, address)
      `)
      .eq('patient_id', patient.id);

    const validStatuses = ['booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (status && validStatuses.includes(status as string)) {
      query = query.eq('status', status as string);
    }

    const { data: appointments, error } = await query.order('booked_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch appointments' });

    res.json({ data: { appointments } });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
};

// ─── Cancel Service Appointment ───────────────────────────────────────────────

export const cancelServiceAppointment = async (req: Request, res: Response) => {
  try {
    const appointmentId = String(req.params.appointmentId ?? '');
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!isValidUUID(appointmentId)) return res.status(400).json({ error: 'Invalid appointment ID' });

    const { data: patient } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { data: appointment, error: apptError } = await supabaseAdmin
      .from('service_appointments')
      .select('id, status, slot_id, service_slots(id, slot_date)')
      .eq('id', appointmentId)
      .eq('patient_id', patient.id)
      .single();

    if (apptError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled' });
    }
    if (appointment.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed appointment' });
    }
    if (appointment.status === 'in_progress') {
      return res.status(400).json({ error: 'Cannot cancel an appointment that is in progress' });
    }

    // Check if the appointment date has passed
    const slotDate = appointment.service_slots?.slot_date;
    if (slotDate) {
      const today = new Date().toISOString().split('T')[0];
      if (slotDate < today) {
        return res.status(400).json({ error: 'Cannot cancel a past appointment' });
      }
    }

    await supabaseAdmin
      .from('service_appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId);

    // Release the slot back to available
    await supabaseAdmin
      .from('service_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('id', appointment.slot_id)
      .eq('status', 'booked');   // Only if still in booked state

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
};
