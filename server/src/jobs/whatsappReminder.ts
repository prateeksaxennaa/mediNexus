/**
 * WhatsApp Appointment Reminder Job
 *
 * Runs daily at 6 PM IST (12:30 UTC).
 * Sends a Hindi reminder via WhatsApp to every patient who has an appointment
 * scheduled for the following day and has a phone_number registered in the DB.
 */

import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { twilioClient } from '../controllers/whatsapp/whatsapp.controller.js';
import { env } from '../config/env.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HINDI_MONTHS: string[] = [
  'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];

function formatDateHindi(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getDate()} ${HINDI_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimeHindi(isoDate: string): string {
  const d = new Date(isoDate);
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'शाम' : 'सुबह';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const mins = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${ampm} ${hours}${mins} बजे`;
}

// ─── Core reminder sender ─────────────────────────────────────────────────────

export async function sendTomorrowReminders(): Promise<void> {
  const now = new Date();

  // Tomorrow: full-day window (start of day to end of day in UTC)
  const tomorrowStart = new Date(now);
  tomorrowStart.setUTCDate(now.getUTCDate() + 1);
  tomorrowStart.setUTCHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setUTCHours(23, 59, 59, 999);

  console.log(
    `[whatsappReminder] Checking appointments between ${tomorrowStart.toISOString()} and ${tomorrowEnd.toISOString()}`
  );

  // Fetch tomorrow's confirmed appointments with patient phone + doctor + hospital
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(
      `id, status,
       patients ( full_name, phone_number ),
       doctors ( full_name ),
       hospitals ( name ),
       appointment_slots ( slot_start )`
    )
    .eq('status', 'booked')
    .gte('appointment_slots.slot_start', tomorrowStart.toISOString())
    .lte('appointment_slots.slot_start', tomorrowEnd.toISOString());

  if (error) {
    console.error('[whatsappReminder] Failed to fetch appointments:', error.message);
    return;
  }

  if (!appointments || appointments.length === 0) {
    console.log('[whatsappReminder] No appointments tomorrow — nothing to send.');
    return;
  }

  let sent = 0;
  let skipped = 0;

  for (const appt of appointments as any[]) {
    const patientPhone: string | null = appt.patients?.phone_number ?? null;
    const patientName: string = appt.patients?.full_name ?? 'मरीज़';
    const doctorName: string = appt.doctors?.full_name ?? 'डॉक्टर';
    const hospitalName: string = appt.hospitals?.name ?? 'अस्पताल';
    const slotStart: string | null = appt.appointment_slots?.slot_start ?? null;

    if (!patientPhone || !slotStart) {
      skipped++;
      continue;
    }

    const message =
      `🔔 *MediNexus — कल की अपॉइंटमेंट याद दिलाना*\n\n` +
      `नमस्ते ${patientName}! 🙏\n\n` +
      `कल आपकी अपॉइंटमेंट है:\n\n` +
      `👨‍⚕️ डॉक्टर: ${doctorName}\n` +
      `📅 दिनांक: ${formatDateHindi(slotStart)}\n` +
      `⏰ समय: ${formatTimeHindi(slotStart)}\n` +
      `🏥 अस्पताल: ${hospitalName}\n\n` +
      `समय पर पहुंचें। रद्द करना हो तो अस्पताल से संपर्क करें।\n\n` +
      `_MediNexus — आपकी सेहत, हमारी जिम्मेदारी_ 💙`;

    try {
      await twilioClient.messages.create({
        from: env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${patientPhone}`,
        body: message,
      });
      sent++;
      console.log(`[whatsappReminder] Sent reminder to ${patientPhone} for appointment ${appt.id}`);
    } catch (err: any) {
      console.error(
        `[whatsappReminder] Failed to send reminder to ${patientPhone}:`,
        err?.message ?? err
      );
      skipped++;
    }

    // Small delay between messages to respect Twilio rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[whatsappReminder] Done — sent: ${sent}, skipped: ${skipped}`);
}

// ─── Cron scheduler ───────────────────────────────────────────────────────────

export function startWhatsAppReminderJob(): void {
  // 12:30 UTC = 6:00 PM IST — daily
  cron.schedule('30 12 * * *', async () => {
    console.log('[whatsappReminder] Running daily D-1 reminder job...');
    await sendTomorrowReminders();
  });

  console.log('[whatsappReminder] Daily reminder job scheduled (6 PM IST / 12:30 UTC)');
}
