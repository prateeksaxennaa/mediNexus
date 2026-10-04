/**
 * All database query helpers for the WhatsApp bot.
 * These are thin adapters over the existing Supabase tables — they do NOT
 * import from other controllers; they query the DB directly.
 */

import { supabaseAdmin } from "../../config/supabase.js";
import { notifyNextWaiting } from "../../jobs/waitlistQueue.js";
import { env } from "../../config/env.js";
import { Groq } from "groq-sdk";
import pdfParseLib from "pdf-parse";
const pdfParse = pdfParseLib as unknown as (buf: Buffer) => Promise<{ text: string }>;

// ─── Groq client (shared) ─────────────────────────────────────────────────────

const groq = new Groq({ apiKey: env.GROQ_API_KEY.trim() });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientRow {
  id: string;
  full_name: string;
  phone_number: string;
  dob?: string | null;
  blood_group?: string | null;
}

export interface SlotOption {
  id: string;
  slot_start: string;
  slot_end: string;
  doctor_full_name: string;
  doctor_id: string;
  specialisation: string;
  hospital_name: string;
  hospital_id: string;
}

export interface AppointmentRow {
  id: string;
  type: "doctor" | "service";
  status: string;
  title: string;           // "Dr. X" or "Service name"
  date_label: string;      // human-readable date
  time_label: string;      // human-readable time or slot number
  hospital: string;
  slot_id: string | null;
}

export interface WaitlistRow {
  id: string;
  slot_id: string;
  status: string;
  doctor_name: string;
  slot_start: string;
  position: number;
}

export interface ReportRow {
  id: string;
  report_name: string;
  report_url: string | null;
  report_type: string | null;
  uploaded_at: string;
  hospital_name?: string | null;
}

export interface SvcSlotOption {
  id: string;
  slot_date: string;
  slot_number: number;
  service_id: string;
  hospital_id: string;
  hospital_name: string;
  service_name: string;
  fee: number;
  pay_at_counter: boolean;
}

type DocumentType = "xray" | "mri" | "ecg" | "ct" | "report" | "default";
type Lang = "en" | "hi";

// ─── Patient lookup ───────────────────────────────────────────────────────────

export async function getPatientByPhone(phone: string): Promise<PatientRow | null> {
  // Strip non-digits, take last 10 digits (Indian mobile)
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);

  // Build all possible formats stored in DB
  const candidates = [
    phone,            // e.g. +916378654771  (as Twilio sends)
    `+91${last10}`,   // e.g. +916378654771
    `91${last10}`,    // e.g.  916378654771
    last10,           // e.g.    6378654771
  ];

  // Try each format — Supabase .or() cannot handle '+' in values safely
  for (const candidate of candidates) {
    const { data } = await supabaseAdmin
      .from("patients")
      .select("id, full_name, phone_number, dob, blood_group")
      .eq("phone_number", candidate)
      .maybeSingle();
    if (data) return data as PatientRow;
  }

  // Last resort: suffix match — fetch all and filter in JS
  const { data: all } = await supabaseAdmin
    .from("patients")
    .select("id, full_name, phone_number, dob, blood_group")
    .ilike("phone_number", `%${last10}`);

  if (all && all.length > 0) return all[0] as PatientRow;
  return null;
}

// ─── Doctor appointment slots ─────────────────────────────────────────────────

const DEPT_KEYWORDS: string[] = [
  "General Physician",
  "Orthopaedics",
  "Gynaecology",
  "Paediatrics",
  "Cardiology",
];

export function deptLabel(idx: number): string {
  return DEPT_KEYWORDS[idx] ?? "General Physician";
}

export async function getAvailableDoctorSlots(dept: string): Promise<SlotOption[]> {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await (supabaseAdmin as any)
    .from("appointment_slots")
    .select(
      `id, slot_start, slot_end,
       doctors!inner( id, full_name, specialisation, hospital_id,
         hospitals ( id, name ) )`
    )
    .eq("status", "available")
    .ilike("doctors.specialisation", `%${dept}%`)
    .gte("slot_start", from)
    .lte("slot_start", to)
    .order("slot_start")
    .limit(8);

  if (!data) return [];

  return (data as any[]).map((s) => ({
    id: s.id,
    slot_start: s.slot_start,
    slot_end: s.slot_end,
    doctor_id: s.doctors.id,
    doctor_full_name: s.doctors.full_name,
    specialisation: s.doctors.specialisation,
    hospital_id: s.doctors.hospitals?.id ?? "",
    hospital_name: s.doctors.hospitals?.name ?? "Hospital",
  }));
}

export async function bookDoctorSlot(
  patientId: string,
  slot: SlotOption
): Promise<boolean> {
  // Lock the slot
  const lockUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  const { data: locked, error: lockErr } = await supabaseAdmin
    .from("appointment_slots")
    .update({ status: "locked", locked_by: patientId, locked_until: lockUntil })
    .eq("id", slot.id)
    .eq("status", "available")
    .select("id")
    .single();

  if (lockErr || !locked) return false;

  // Create appointment
  const { error: apptErr } = await supabaseAdmin.from("appointments").insert({
    slot_id: slot.id,
    patient_id: patientId,
    doctor_id: slot.doctor_id,
    hospital_id: slot.hospital_id,
    booking_type: "online",
    status: "booked",
  });

  if (apptErr) {
    // Release lock on failure
    await supabaseAdmin
      .from("appointment_slots")
      .update({ status: "available", locked_by: null, locked_until: null })
      .eq("id", slot.id);
    return false;
  }

  // Finalize slot as booked
  await supabaseAdmin
    .from("appointment_slots")
    .update({ status: "booked", locked_by: null, locked_until: null })
    .eq("id", slot.id);

  return true;
}

// ─── Service / Lab booking ────────────────────────────────────────────────────

export async function getServiceDepts(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("hospital_services")
    .select("department")
    .eq("is_available", true);

  if (!data) return [];

  const depts = [...new Set((data as any[]).map((r) => r.department).filter(Boolean))];
  return depts.slice(0, 8);
}

export async function getServicesForDept(dept: string): Promise<{ id: string; service_name: string; fee: number; pay_at_counter: boolean; hospital_id: string; hospital_name: string }[]> {
  const { data } = await (supabaseAdmin as any)
    .from("hospital_services")
    .select("id, service_name, fee, pay_at_counter, hospital_id, hospitals(name)")
    .eq("is_available", true)
    .ilike("department", `%${dept}%`)
    .limit(8);

  if (!data) return [];
  return (data as any[]).map((s) => ({
    id: s.id,
    service_name: s.service_name,
    fee: s.fee ?? 0,
    pay_at_counter: s.pay_at_counter ?? false,
    hospital_id: s.hospital_id,
    hospital_name: s.hospitals?.name ?? "Hospital",
  }));
}

export async function getAvailableSvcSlots(serviceId: string): Promise<SvcSlotOption[]> {
  const today = new Date().toISOString().split("T")[0]!;
  const plus3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

  const { data: svc } = await (supabaseAdmin as any)
    .from("hospital_services")
    .select("id, service_name, fee, pay_at_counter, hospital_id, hospitals(name)")
    .eq("id", serviceId)
    .single();

  const { data: slots } = await supabaseAdmin
    .from("service_slots")
    .select("id, slot_date, slot_number, service_id")
    .eq("service_id", serviceId)
    .eq("status", "available")
    .gte("slot_date", today)
    .lte("slot_date", plus3)
    .order("slot_date")
    .order("slot_number")
    .limit(8);

  if (!slots || !svc) return [];
  return (slots as any[]).map((s) => ({
    id: s.id,
    slot_date: s.slot_date,
    slot_number: s.slot_number,
    service_id: serviceId,
    hospital_id: svc.hospital_id,
    hospital_name: svc.hospitals?.name ?? "Hospital",
    service_name: svc.service_name,
    fee: svc.fee ?? 0,
    pay_at_counter: svc.pay_at_counter ?? false,
  }));
}

export async function bookSvcSlot(
  patientId: string,
  slot: SvcSlotOption
): Promise<boolean> {
  const { error: updateErr } = await supabaseAdmin
    .from("service_slots")
    .update({ status: "booked" })
    .eq("id", slot.id)
    .eq("status", "available");

  if (updateErr) return false;

  const { error: apptErr } = await supabaseAdmin.from("service_appointments").insert({
    slot_id: slot.id,
    patient_id: patientId,
    hospital_id: slot.hospital_id,
    service_id: slot.service_id,
    booking_type: "online",
    status: "booked",
  });

  if (apptErr) {
    await supabaseAdmin
      .from("service_slots")
      .update({ status: "available" })
      .eq("id", slot.id);
    return false;
  }

  return true;
}

// ─── Appointments (doctor + service) ─────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export async function getUpcomingAppointments(patientId: string): Promise<AppointmentRow[]> {
  const now = new Date().toISOString();

  const [{ data: docAppts }, { data: svcAppts }] = await Promise.all([
    (supabaseAdmin as any)
      .from("appointments")
      .select(`id, status, slot_id,
        appointment_slots(slot_start, slot_end),
        doctors(full_name),
        hospitals(name)`)
      .eq("patient_id", patientId)
      .in("status", ["booked", "checked_in"])
      .order("created_at", { ascending: false }),
    (supabaseAdmin as any)
      .from("service_appointments")
      .select(`id, status, slot_id,
        service_slots(slot_date, slot_number),
        hospital_services(service_name),
        hospitals(name)`)
      .eq("patient_id", patientId)
      .in("status", ["booked", "checked_in"])
      .order("booked_at", { ascending: false }),
  ]);

  const rows: AppointmentRow[] = [];

  for (const a of (docAppts ?? []) as any[]) {
    const slotStart: string = a.appointment_slots?.slot_start ?? "";
    if (slotStart && slotStart <= now) continue;
    rows.push({
      id: a.id,
      type: "doctor",
      status: a.status,
      title: `Dr. ${a.doctors?.full_name ?? ""}`,
      date_label: slotStart ? formatDate(slotStart) : "—",
      time_label: slotStart ? formatTime(slotStart) : "—",
      hospital: a.hospitals?.name ?? "Hospital",
      slot_id: a.slot_id,
    });
  }

  for (const a of (svcAppts ?? []) as any[]) {
    rows.push({
      id: a.id,
      type: "service",
      status: a.status,
      title: a.hospital_services?.service_name ?? "Service",
      date_label: a.service_slots?.slot_date ?? "—",
      time_label: `Slot #${a.service_slots?.slot_number ?? "?"}`,
      hospital: a.hospitals?.name ?? "Hospital",
      slot_id: a.slot_id,
    });
  }

  return rows;
}

export async function getPastAppointments(patientId: string): Promise<AppointmentRow[]> {
  const now = new Date().toISOString();

  const [{ data: docAppts }, { data: svcAppts }] = await Promise.all([
    (supabaseAdmin as any)
      .from("appointments")
      .select(`id, status, slot_id,
        appointment_slots(slot_start),
        doctors(full_name),
        hospitals(name)`)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(5),
    (supabaseAdmin as any)
      .from("service_appointments")
      .select(`id, status, slot_id,
        service_slots(slot_date, slot_number),
        hospital_services(service_name),
        hospitals(name)`)
      .eq("patient_id", patientId)
      .in("status", ["completed", "no_show", "cancelled"])
      .order("booked_at", { ascending: false })
      .limit(5),
  ]);

  const rows: AppointmentRow[] = [];

  for (const a of (docAppts ?? []) as any[]) {
    const slotStart: string = a.appointment_slots?.slot_start ?? "";
    if (slotStart && slotStart > now) continue;
    rows.push({
      id: a.id,
      type: "doctor",
      status: a.status,
      title: `Dr. ${a.doctors?.full_name ?? ""}`,
      date_label: slotStart ? formatDate(slotStart) : "—",
      time_label: slotStart ? formatTime(slotStart) : "—",
      hospital: a.hospitals?.name ?? "Hospital",
      slot_id: a.slot_id,
    });
  }

  for (const a of (svcAppts ?? []) as any[]) {
    rows.push({
      id: a.id,
      type: "service",
      status: a.status,
      title: a.hospital_services?.service_name ?? "Service",
      date_label: a.service_slots?.slot_date ?? "—",
      time_label: `Slot #${a.service_slots?.slot_number ?? "?"}`,
      hospital: a.hospitals?.name ?? "Hospital",
      slot_id: a.slot_id,
    });
  }

  return rows.slice(0, 8);
}

export async function cancelAppointmentById(
  apptId: string,
  apptType: "doctor" | "service",
  slotId: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (apptType === "doctor") {
    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", apptId)
      .in("status", ["booked", "checked_in"]);

    if (error) return { ok: false, error: error.message };

    if (slotId) {
      await supabaseAdmin
        .from("appointment_slots")
        .update({ status: "available", locked_by: null, locked_until: null })
        .eq("id", slotId)
        .eq("status", "booked");
      await notifyNextWaiting(slotId);
    }
    return { ok: true };
  } else {
    const { error } = await supabaseAdmin
      .from("service_appointments")
      .update({ status: "cancelled" })
      .eq("id", apptId);

    if (error) return { ok: false, error: error.message };

    if (slotId) {
      await supabaseAdmin
        .from("service_slots")
        .update({ status: "available", locked_by: null, locked_until: null })
        .eq("id", slotId)
        .eq("status", "booked");
    }
    return { ok: true };
  }
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

export async function getWaitlistEntries(patientId: string): Promise<WaitlistRow[]> {
  const { data: entries } = await (supabaseAdmin as any)
    .from("slot_waitlist")
    .select(`id, slot_id, status, queued_at,
      appointment_slots(slot_start, doctors(full_name))`)
    .eq("patient_id", patientId)
    .in("status", ["waiting", "notified"])
    .order("queued_at", { ascending: true });

  if (!entries) return [];

  return (entries as any[]).map((w, i) => ({
    id: w.id,
    slot_id: w.slot_id,
    status: w.status,
    position: i + 1, // dynamically calculated for display
    doctor_name: w.appointment_slots?.doctors?.full_name ?? "Doctor",
    slot_start: w.appointment_slots?.slot_start ?? "",
  }));
}

export async function leaveWaitlist(entryId: string, patientId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("slot_waitlist")
    .delete()
    .eq("id", entryId)
    .eq("patient_id", patientId);
  return !error;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getPatientReports(patientId: string): Promise<ReportRow[]> {
  const { data } = await (supabaseAdmin as any)
    .from("patient_reports")
    .select("id, report_name, report_url, report_type, uploaded_at, hospitals(name)")
    .eq("patient_id", patientId)
    .order("uploaded_at", { ascending: false })
    .limit(8);

  if (!data) return [];

  return (data as any[]).map((r) => ({
    id: r.id,
    report_name: r.report_name,
    report_url: r.report_url ?? null,
    report_type: r.report_type ?? null,
    uploaded_at: r.uploaded_at,
    hospital_name: r.hospitals?.name ?? null,
  }));
}

// ─── Report analysis pipeline (mirrors reportSpeak.controller) ────────────────

type AnalysisResult = { analysisText: string; audioBase64: string; audioMime: string };

function resolveDocType(dbType: string | null | undefined): DocumentType {
  switch (dbType) {
    case "xray": return "xray";
    case "mri": return "mri";
    case "ecg": return "ecg";
    case "ct": return "ct";
    case "blood_test":
    case "urine_test": return "report";
    default: return "default";
  }
}

const SYS_EN: Record<DocumentType, string> = {
  xray: `You are a radiology assistant. Analyse the X-ray and describe key findings in patient-friendly language. No bullet points, no markdown. Speak using "your". Under 350 words.`,
  mri: `You are a medical imaging assistant. Describe what the MRI shows in simple patient language. No bullets/markdown. Use "your". Under 350 words.`,
  ecg: `You are a cardiac assistant. Analyse the ECG, describe rhythm and heart rate. No bullets/markdown. Use "your". Under 350 words.`,
  ct: `You are a radiology assistant. Describe the CT scan findings in patient-friendly language. No bullets/markdown. Use "your". Under 350 words.`,
  report: `You are a medical analyst. Analyse this report and surface only the clinically significant findings. Skip normal results. Flag what needs doctor attention. No bullets/markdown. Use "your". Under 350 words.`,
  default: `You are a medical assistant. Provide a patient-friendly summary of the key findings. No bullets/markdown. Use "your". Under 350 words.`,
};
const SYS_HI: Record<DocumentType, string> = {
  xray: `Aap ek radiology assistant ho. Patient ke X-ray ko simple Hinglish mein explain karo. Plain prose only, no bullets. "Aap/aapka" use karo. 350 words se kam.`,
  mri: `Aap ek medical imaging assistant ho. MRI ko simple Hinglish mein samjhao. Plain prose only, no bullets. "Aap/aapka" use karo. 350 words se kam.`,
  ecg: `Aap ek cardiac assistant ho. ECG ko simple Hinglish mein explain karo, heart rate aur rhythm batao. Plain prose only. "Aap/aapka" use karo. 350 words se kam.`,
  ct: `Aap ek radiology assistant ho. CT scan ke findings ko simple Hinglish mein batao. Plain prose only. "Aap/aapka" use karo. 350 words se kam.`,
  report: `Aap ek friendly medical expert ho. Report ka analysis Hinglish mein karo — sirf abnormal findings batao, normal skip karo. Plain prose only, no bullets. "Aap/aapka" use karo. 350 words se kam.`,
  default: `Aap ek medical assistant ho. Medical document ka patient-friendly summary do in Hinglish. Plain prose only. "Aap/aapka" use karo. 350 words se kam.`,
};

const IMAGE_MODALITIES = new Set<DocumentType>(["xray", "mri", "ecg", "ct"]);

async function fetchBase64DataUri(url: string): Promise<{ dataUri: string; mimeType: string }> {
  const res: any = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  return { dataUri: `data:${mime};base64,${buf.toString("base64")}`, mimeType: mime };
}

async function analyseImageGroq(url: string, docType: DocumentType, lang: Lang): Promise<string> {
  const sys = lang === "hi" ? SYS_HI[docType] : SYS_EN[docType];
  const { dataUri } = await fetchBase64DataUri(url);
  const cc = await groq.chat.completions.create({
    messages: [{ role: "user", content: [{ type: "text", text: sys }, { type: "image_url", image_url: { url: dataUri } }] }],
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
    max_completion_tokens: 1024,
  });
  return cc.choices[0]?.message?.content?.trim() ?? "";
}

async function extractPdfText(url: string): Promise<string> {
  const res: any = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const parsed = await pdfParse(buf);
  return parsed.text?.trim() ?? "";
}

async function analyseTextTrinity(text: string, reportName: string, docType: DocumentType, lang: Lang): Promise<string> {
  const sys = lang === "hi" ? SYS_HI[docType] : SYS_EN[docType];
  const r: any = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://medinexus.app",
      "X-Title": "mediNexus WhatsApp Bot",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Report: ${reportName}\n\n${text.slice(0, 6000)}` },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callTTS(text: string, lang: Lang): Promise<{ audioBase64: string; audioMime: string }> {
  const res: any = await fetch("https://api.sarvam.ai/text-to-speech/stream", {
    method: "POST",
    headers: { "api-subscription-key": env.SARVAM_API_KEY.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_language_code: lang === "hi" ? "hi-IN" : "en-IN",
      speaker: "shubh",
      model: "bulbul:v3",
      pace: 1.0,
      speech_sample_rate: 22050,
      output_audio_codec: "mp3",
      enable_preprocessing: true,
    }),
  });
  if (!res.ok) throw new Error(`Sarvam TTS error: ${res.status}`);
  const reader = res.body!.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  const buf = Buffer.concat(chunks);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "audio/mpeg";
  return { audioBase64: buf.toString("base64"), audioMime: mime };
}

export async function getOrGenerateAnalysis(report: ReportRow, lang: Lang): Promise<AnalysisResult | null> {
  const docType = resolveDocType(report.report_type);

  // Check cache first
  const { data: cached } = await (supabaseAdmin as any)
    .from("report_analysis_cache")
    .select("analysis_text, audio_base64, audio_mime")
    .eq("report_id", report.id)
    .eq("lang", lang)
    .eq("doc_type", docType)
    .maybeSingle();

  if (cached) {
    return { analysisText: cached.analysis_text, audioBase64: cached.audio_base64, audioMime: cached.audio_mime };
  }

  if (!report.report_url) return null;

  try {
    let analysisText: string;
    if (IMAGE_MODALITIES.has(docType)) {
      analysisText = await analyseImageGroq(report.report_url, docType, lang);
    } else {
      const text = await extractPdfText(report.report_url);
      if (text.length > 0) {
        analysisText = await analyseTextTrinity(text, report.report_name, docType, lang);
      } else {
        analysisText = await analyseImageGroq(report.report_url, docType, lang);
      }
    }

    if (!analysisText) return null;

    const { audioBase64, audioMime } = await callTTS(analysisText, lang);

    // Upsert cache
    await (supabaseAdmin as any)
      .from("report_analysis_cache")
      .upsert(
        { report_id: report.id, lang, doc_type: docType, analysis_text: analysisText, audio_base64: audioBase64, audio_mime: audioMime },
        { onConflict: "report_id,lang,doc_type" }
      );

    return { analysisText, audioBase64, audioMime };
  } catch (err: any) {
    console.error("[whatsapp/db.helpers] analysis failed:", err?.message);
    return null;
  }
}

export async function uploadAudioAndGetUrl(audioBase64: string, audioMime: string, patientId: string): Promise<string | null> {
  const ext = audioMime.includes("wav") ? "wav" : "mp3";
  const path = `whatsapp_audio/${patientId}/${Date.now()}.${ext}`;
  const buf = Buffer.from(audioBase64, "base64");

  const { error } = await supabaseAdmin.storage
    .from("patient-reports")
    .upload(path, buf, { contentType: audioMime, upsert: true });

  if (error) {
    console.error("[whatsapp/db.helpers] audio upload failed:", error.message);
    return null;
  }

  const { data: signed } = await supabaseAdmin.storage
    .from("patient-reports")
    .createSignedUrl(path, 3600);

  return signed?.signedUrl ?? null;
}

// ─── Health Passport ──────────────────────────────────────────────────────────

export interface PassportSummary {
  patientName: string;
  bloodGroup: string | null;
  dob: string | null;
  prescriptionCount: number;
  reportCount: number;
  activeGrantCount: number;
  latestPrescription: { doctor: string; illness: string; medicines: string; date: string } | null;
  latestReport: { name: string; date: string } | null;
}

export async function getHealthPassport(patientId: string): Promise<PassportSummary | null> {
  try {
    const [rxRes, rptRes, grantRes, patRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("prescriptions")
        .select(`illness_description, issued_at, doctors(full_name),
          prescription_items(dosage, medicines(medicine_name))`)
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("patient_reports")
        .select("report_name, uploaded_at")
        .eq("patient_id", patientId)
        .order("uploaded_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("record_access_grants")
        .select("id, valid_until")
        .eq("patient_id", patientId),
      supabaseAdmin
        .from("patients")
        .select("full_name, blood_group, dob")
        .eq("id", patientId)
        .single(),
    ]);

    // Count totals
    const rxCountRes = await supabaseAdmin
      .from("prescriptions")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);
    const rptCountRes = await supabaseAdmin
      .from("patient_reports")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);

    const now = new Date();
    const activeGrants = (grantRes.data ?? []).filter(
      (g: any) => new Date(g.valid_until) > now
    ).length;

    const latestRx = rxRes.data?.[0];
    let latestPrescription = null;
    if (latestRx) {
      const items = (latestRx.prescription_items ?? []) as any[];
      const medNames = items.slice(0, 3).map((i: any) => i.medicines?.medicine_name ?? "").filter(Boolean).join(" · ");
      latestPrescription = {
        doctor: latestRx.doctors?.full_name ?? "Doctor",
        illness: latestRx.illness_description ?? "Not specified",
        medicines: medNames || "Not available",
        date: latestRx.issued_at ? new Date(latestRx.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—",
      };
    }

    const latestRpt = rptRes.data?.[0];
    const latestReport = latestRpt ? {
      name: (latestRpt as any).report_name,
      date: new Date((latestRpt as any).uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    } : null;

    const pat = patRes.data as any;

    return {
      patientName: pat?.full_name ?? "Patient",
      bloodGroup: pat?.blood_group ?? null,
      dob: pat?.dob ?? null,
      prescriptionCount: rxCountRes.count ?? 0,
      reportCount: rptCountRes.count ?? 0,
      activeGrantCount: activeGrants,
      latestPrescription,
      latestReport,
    };
  } catch (err: any) {
    console.error("[whatsapp/db.helpers] getHealthPassport failed:", err?.message);
    return null;
  }
}

// ─── Health Trends ────────────────────────────────────────────────────────────

export interface TrendItem {
  parameter: string;
  direction: string;
  concern: string;
  note: string;
}

export interface TrendsResult {
  summary: string;
  trends: TrendItem[];
  report_count: number;
}

export async function getHealthTrends(patientId: string): Promise<TrendsResult | null> {
  // Fetch all report IDs
  const { data: allReports } = await supabaseAdmin
    .from("patient_reports")
    .select("id, report_name, uploaded_at")
    .eq("patient_id", patientId)
    .order("uploaded_at", { ascending: true });

  if (!allReports || allReports.length < 2) return null;

  const reportIds = allReports.map((r: any) => r.id as string);

  const { data: cacheRows } = await (supabaseAdmin as any)
    .from("report_analysis_cache")
    .select("report_id, doc_type, analysis_text, lang")
    .in("report_id", reportIds);

  // Build map — prefer English
  const cacheMap = new Map<string, { doc_type: string; analysis_text: string }>();
  for (const row of (cacheRows ?? []) as any[]) {
    const ex = cacheMap.get(row.report_id);
    if (!ex || (ex && row.lang === "en")) {
      cacheMap.set(row.report_id, { doc_type: row.doc_type, analysis_text: row.analysis_text });
    }
  }

  const analysed = (allReports as any[])
    .filter((r) => cacheMap.has(r.id))
    .map((r) => {
      const c = cacheMap.get(r.id)!;
      return `--- ${r.report_name} | ${r.uploaded_at.split("T")[0]} | ${c.doc_type} ---\n${c.analysis_text}`;
    })
    .join("\n\n");

  if (analysed.split("---").length - 1 < 2) return null;

  try {
    const res: any = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://medinexus.app",
        "X-Title": "mediNexus WhatsApp Trends",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
        messages: [
          {
            role: "system",
            content: `You are a clinical AI. Analyse these patient report summaries and identify health trends across them. 
Return ONLY valid JSON: {"summary":"2-4 sentence overview","trends":[{"parameter":"full name","direction":"improving|declining|stable|variable","concern":"none|watch|urgent","note":"1-2 sentences"}]}
Max 6 trend items. Only include findings across 2+ reports. No markdown outside JSON.`,
          },
          { role: "user", content: `Analyse these reports:\n\n${analysed}` },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.substring(start, end + 1));
    return {
      summary: parsed.summary ?? "",
      trends: Array.isArray(parsed.trends) ? parsed.trends : [],
      report_count: cacheMap.size,
    };
  } catch (err: any) {
    console.error("[whatsapp/db.helpers] getHealthTrends failed:", err?.message);
    return null;
  }
}
