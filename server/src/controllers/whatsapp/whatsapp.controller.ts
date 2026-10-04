/**
 * MediNexus WhatsApp Bot — Full State Machine (v2)
 *
 * Stateful, bilingual (EN/HI), feature-complete patient interface built on
 * Twilio's WhatsApp Sandbox.  Identity is resolved via phone_number in the
 * patients table — no auth tokens required.
 *
 * States:
 *   start → lang_select → main_menu
 *     1 → select_dept → select_slot → (booked)
 *     2 → select_svc_dept → select_svc → select_svc_slot → (booked)
 *     3 → appts_submenu
 *           1 → sel_cancel (upcoming) → cancel_confirm → done
 *           2 → past appts list (read-only)
 *           3 → waitlist_list → leave confirm
 *     4 → reports_list → report_analysis
 *     5 → health_passport
 *     6 → health_trends
 */

import type { Request, Response } from "express";
import twilio from "twilio";
import { env } from "../../config/env.js";
import { msg, type Lang } from "./strings.js";
import {
  getPatientByPhone,
  getAvailableDoctorSlots,
  bookDoctorSlot,
  getServiceDepts,
  getServicesForDept,
  getAvailableSvcSlots,
  bookSvcSlot,
  getUpcomingAppointments,
  getPastAppointments,
  cancelAppointmentById,
  getWaitlistEntries,
  leaveWaitlist,
  getPatientReports,
  getOrGenerateAnalysis,
  uploadAudioAndGetUrl,
  getHealthPassport,
  getHealthTrends,
  deptLabel,
  type SlotOption,
  type SvcSlotOption,
  type AppointmentRow,
  type WaitlistRow,
  type ReportRow,
} from "./db.helpers.js";

// ─── Twilio client ────────────────────────────────────────────────────────────

export const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// ─── Session ──────────────────────────────────────────────────────────────────

type Step =
  | "lang_select"
  | "main_menu"
  // Doctor booking
  | "select_dept"
  | "select_slot"
  // Service booking
  | "select_svc_dept"
  | "select_svc"
  | "select_svc_slot"
  // Appointments
  | "appts_submenu"
  | "appts_list_upcoming"
  | "appts_list_past"
  | "sel_cancel"
  | "cancel_confirm"
  // Waitlist
  | "waitlist_list"
  // Reports
  | "reports_list"
  | "report_analysis"
  // Passport / Trends are single-shot (no waiting step)
  ;

interface Session {
  lang: Lang | null;
  step: Step;
  patientDbId: string | null;
  data: {
    // doctor booking
    slots?: SlotOption[];
    selectedDept?: string;
    // service booking
    svcDepts?: string[];
    svcs?: { id: string; service_name: string; fee: number; pay_at_counter: boolean; hospital_id: string; hospital_name: string }[];
    svcSlots?: SvcSlotOption[];
    // appointments
    appointments?: AppointmentRow[];
    pendingCancel?: AppointmentRow;
    // waitlist
    waitlist?: WaitlistRow[];
    // reports
    reports?: ReportRow[];
    selectedReport?: ReportRow;
  };
  lastActivity: number;
}

const sessions = new Map<string, Session>();
const SESSION_TTL = 15 * 60 * 1000; // 15 min

function getSession(phone: string): Session {
  const existing = sessions.get(phone);
  if (existing && Date.now() - existing.lastActivity < SESSION_TTL) {
    existing.lastActivity = Date.now();
    return existing;
  }
  const fresh: Session = {
    lang: null,
    step: "lang_select",
    patientDbId: null,
    data: {},
    lastActivity: Date.now(),
  };
  sessions.set(phone, fresh);
  return fresh;
}

// ─── Twilio send helpers ──────────────────────────────────────────────────────

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  await twilioClient.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
  });
}

async function sendText(to: string, body: string): Promise<void> {
  return sendWhatsAppText(to, body);
}

async function sendMedia(to: string, body: string, mediaUrl: string): Promise<void> {
  await twilioClient.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
    mediaUrl: [mediaUrl],
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function slotListText(slots: SlotOption[], lang: Lang): string {
  return slots
    .map((s, i) => `${i + 1}️⃣  Dr. ${s.doctor_full_name} (${s.specialisation})\n   📅 ${formatDate(s.slot_start, lang)} ${formatTime(s.slot_start)}\n   🏥 ${s.hospital_name}`)
    .join("\n\n");
}

function apptListText(appts: AppointmentRow[]): string {
  return appts
    .map((a, i) => `${i + 1}️⃣  ${a.title}\n   📅 ${a.date_label} ${a.time_label}\n   🏥 ${a.hospital} — ${a.status}`)
    .join("\n\n");
}

function waitlistText(entries: WaitlistRow[], lang: Lang): string {
  return entries
    .map((w, i) => {
      const d = w.slot_start ? `📅 ${formatDate(w.slot_start, lang)} ${formatTime(w.slot_start)}` : "";
      const status = w.status === "notified" ? "⚡ Offer pending!" : `#${w.position} in queue`;
      return `${i + 1}️⃣  Dr. ${w.doctor_name}\n   ${d}\n   Status: ${status}`;
    })
    .join("\n\n");
}

function reportListText(reports: ReportRow[], lang: Lang): string {
  return reports
    .map((r, i) => {
      const date = r.uploaded_at ? formatDate(r.uploaded_at, lang) : "—";
      const type = r.report_type ?? "general";
      return `${i + 1}️⃣  ${r.report_name}\n   📅 ${date} | 🏷️ ${type}`;
    })
    .join("\n\n");
}

function svcSlotText(slots: SvcSlotOption[]): string {
  return slots
    .map((s, i) => `${i + 1}️⃣  ${s.slot_date} — Slot #${s.slot_number}`)
    .join("\n");
}

// ─── Per-step handlers ────────────────────────────────────────────────────────

async function handleLangSelect(session: Session, phone: string, text: string): Promise<void> {
  if (text === "1") {
    session.lang = "en";
  } else if (text === "2") {
    session.lang = "hi";
  } else {
    await sendText(phone, msg("en", "lang_select"));
    return;
  }

  const lang = session.lang!;

  // Resolve patient
  const patient = await getPatientByPhone(phone);
  if (!patient) {
    await sendText(phone, msg(lang, "not_registered", phone));
    session.step = "lang_select";
    return;
  }

  session.patientDbId = patient.id;
  session.step = "main_menu";
  await sendText(phone, msg(lang, "main_menu"));
}

async function handleMainMenu(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  switch (text) {
    case "1":
      session.step = "select_dept";
      await sendText(phone, msg(lang, "select_dept"));
      break;
    case "2":
      session.step = "select_svc_dept";
      await sendText(phone, msg(lang, "searching_slots", "services"));
      const depts = await getServiceDepts();
      if (depts.length === 0) {
        session.step = "main_menu";
        await sendText(phone, msg(lang, "no_svc_depts"));
        return;
      }
      session.data.svcDepts = depts;
      const deptMenu = depts.map((d, i) => `${i + 1}️⃣  ${d}`).join("\n");
      await sendText(phone, msg(lang, "select_svc_dept", deptMenu));
      break;
    case "3":
      session.step = "appts_submenu";
      await sendText(phone, msg(lang, "appts_submenu"));
      break;
    case "4":
      session.step = "reports_list";
      await sendText(phone, msg(lang, "loading_reports"));
      const reports = await getPatientReports(session.patientDbId!);
      if (reports.length === 0) {
        session.step = "main_menu";
        await sendText(phone, msg(lang, "no_reports"));
        return;
      }
      session.data.reports = reports;
      await sendText(phone, msg(lang, "reports_header", reportListText(reports, lang)));
      break;
    case "5":
      await sendText(phone, msg(lang, "loading_passport"));
      await deliverHealthPassport(session, phone, lang);
      break;
    case "6":
      await sendText(phone, msg(lang, "trends_loading"));
      await deliverHealthTrends(session, phone, lang);
      break;
    default:
      await sendText(phone, msg(lang, "invalid_choice"));
  }
}

// ── Doctor booking ─────────────────────────────────────────────────────────

async function handleSelectDept(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx > 4) {
    await sendText(phone, msg(lang, "invalid_dept"));
    return;
  }
  const dept = deptLabel(idx);
  session.data.selectedDept = dept;
  await sendText(phone, msg(lang, "searching_slots", dept));

  const slots = await getAvailableDoctorSlots(dept);
  if (slots.length === 0) {
    session.step = "main_menu";
    await sendText(phone, msg(lang, "no_slots", dept));
    return;
  }
  session.data.slots = slots;
  session.step = "select_slot";
  await sendText(phone, msg(lang, "slots_list_header", dept, slotListText(slots, lang), slots.length));
}

async function handleSelectSlot(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const slots = session.data.slots ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    await sendText(phone, msg(lang, "invalid_slot_choice", slots.length));
    return;
  }

  const slot = slots[idx]!;
  await sendText(phone, msg(lang, "booking_in_progress"));
  const ok = await bookDoctorSlot(session.patientDbId!, slot);
  if (!ok) {
    await sendText(phone, msg(lang, "slot_taken"));
    session.step = "select_dept";
    return;
  }

  session.step = "main_menu";
  await sendText(phone,
    msg(lang, "booked_confirm",
      slot.doctor_full_name,
      formatDate(slot.slot_start, lang),
      formatTime(slot.slot_start),
      slot.hospital_name
    )
  );
}

// ── Service / Lab booking ──────────────────────────────────────────────────

async function handleSelectSvcDept(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const depts = session.data.svcDepts ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= depts.length) {
    await sendText(phone, msg(lang, "invalid_svc_choice"));
    return;
  }

  const dept = depts[idx]!;
  await sendText(phone, msg(lang, "selecting_services", dept));
  const svcs = await getServicesForDept(dept);
  if (svcs.length === 0) {
    await sendText(phone, msg(lang, "no_services"));
    session.step = "main_menu";
    return;
  }
  session.data.svcs = svcs;
  session.step = "select_svc";
  const list = svcs.map((s, i) => `${i + 1}️⃣  ${s.service_name} — ₹${s.fee}`).join("\n");
  await sendText(phone, msg(lang, "services_list", dept, list));
}

async function handleSelectSvc(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const svcs = session.data.svcs ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= svcs.length) {
    await sendText(phone, msg(lang, "invalid_svc_choice"));
    return;
  }

  const svc = svcs[idx]!;
  const svcSlots = await getAvailableSvcSlots(svc.id);
  if (svcSlots.length === 0) {
    await sendText(phone, msg(lang, "no_svc_slots", svc.service_name));
    session.step = "main_menu";
    return;
  }

  session.data.svcSlots = svcSlots;
  session.step = "select_svc_slot";
  await sendText(phone, msg(lang, "svc_slots_header", svc.service_name, svcSlotText(svcSlots), svcSlots.length));
}

async function handleSelectSvcSlot(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const slots = session.data.svcSlots ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    await sendText(phone, msg(lang, "invalid_svc_slot", slots.length));
    return;
  }

  const slot = slots[idx]!;
  const ok = await bookSvcSlot(session.patientDbId!, slot);
  if (!ok) {
    await sendText(phone, msg(lang, "slot_taken"));
    session.step = "main_menu";
    return;
  }

  session.step = "main_menu";
  const counterNote = slot.pay_at_counter ? (lang === "hi" ? " (काउंटर पर भुगतान)" : " (pay at counter)") : "";
  await sendText(phone,
    msg(lang, "svc_booked_confirm",
      slot.service_name,
      slot.slot_date,
      slot.slot_number,
      slot.hospital_name,
      slot.fee,
      counterNote
    )
  );
}

// ── Appointments ───────────────────────────────────────────────────────────

async function handleApptsSubmenu(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const patientId = session.patientDbId!;

  if (text === "1") {
    await sendText(phone, msg(lang, "loading_appts"));
    const appts = await getUpcomingAppointments(patientId);
    if (appts.length === 0) {
      await sendText(phone, msg(lang, "no_upcoming_appts"));
      session.step = "main_menu";
      return;
    }
    session.data.appointments = appts;
    session.step = "sel_cancel";
    await sendText(phone, msg(lang, "upcoming_appts_header", apptListText(appts)));

  } else if (text === "2") {
    await sendText(phone, msg(lang, "loading_appts"));
    const appts = await getPastAppointments(patientId);
    if (appts.length === 0) {
      await sendText(phone, msg(lang, "no_past_appts"));
      session.step = "main_menu";
      return;
    }
    session.step = "main_menu";
    await sendText(phone, msg(lang, "past_appts_header", apptListText(appts)));

  } else if (text === "3") {
    const entries = await getWaitlistEntries(patientId);
    if (entries.length === 0) {
      await sendText(phone, msg(lang, "waitlist_empty"));
      session.step = "main_menu";
      return;
    }
    session.data.waitlist = entries;
    session.step = "waitlist_list";
    await sendText(phone, msg(lang, "waitlist_header", waitlistText(entries, lang)));

  } else {
    await sendText(phone, msg(lang, "invalid_choice"));
  }
}

async function handleSelCancel(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const appts = session.data.appointments ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= appts.length) {
    await sendText(phone, msg(lang, "invalid_slot_choice", appts.length));
    return;
  }

  const appt = appts[idx]!;

  if (["cancelled", "completed", "no_show", "in_progress"].includes(appt.status)) {
    await sendText(phone, appt.status === "cancelled"
      ? msg(lang, "cancel_already")
      : msg(lang, "cancel_invalid", appt.status)
    );
    session.step = "main_menu";
    return;
  }

  session.data.pendingCancel = appt;
  session.step = "cancel_confirm";

  const detail = `${appt.title} — ${appt.date_label} ${appt.time_label} @ ${appt.hospital}`;
  await sendText(phone, msg(lang, "cancel_confirm_prompt", detail));
}

async function handleCancelConfirm(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const appt = session.data.pendingCancel;
  session.step = "main_menu";

  if (!appt || text.toLowerCase() !== "yes") {
    await sendText(phone, msg(lang, "main_menu"));
    return;
  }

  const result = await cancelAppointmentById(appt.id, appt.type, appt.slot_id);
  if (!result.ok) {
    await sendText(phone, msg(lang, "error_generic"));
    return;
  }
  await sendText(phone, msg(lang, "cancel_confirmed"));
}

// ── Waitlist ───────────────────────────────────────────────────────────────

async function handleWaitlistList(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const entries = session.data.waitlist ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= entries.length) {
    session.step = "main_menu";
    await sendText(phone, msg(lang, "main_menu"));
    return;
  }

  const entry = entries[idx]!;
  const ok = await leaveWaitlist(entry.id, session.patientDbId!);
  const detail = `Dr. ${entry.doctor_name} — ${entry.slot_start ? formatDate(entry.slot_start, lang) : ""}`;

  session.step = "main_menu";
  await sendText(phone, ok ? msg(lang, "waitlist_leave_confirm", detail) : msg(lang, "error_generic"));
}

// ── Reports ────────────────────────────────────────────────────────────────

async function handleReportsList(session: Session, phone: string, text: string): Promise<void> {
  const lang = session.lang!;
  const reports = session.data.reports ?? [];
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= reports.length) {
    await sendText(phone, msg(lang, "invalid_report", reports.length));
    return;
  }

  const report = reports[idx]!;
  session.data.selectedReport = report;
  session.step = "report_analysis";

  await sendText(phone, msg(lang, "analysis_wait"));

  // Run in background so webhook returns quickly
  deliverReportAnalysis(session, phone, lang, report).catch((e) =>
    console.error("[whatsapp] deliverReportAnalysis failed:", e?.message)
  );
}

async function deliverReportAnalysis(
  session: Session,
  phone: string,
  lang: Lang,
  report: ReportRow
): Promise<void> {
  const result = await getOrGenerateAnalysis(report, lang);
  session.step = "main_menu";

  if (!result) {
    await sendText(phone, msg(lang, "analysis_error"));
    return;
  }

  const dateStr = report.uploaded_at ? formatDate(report.uploaded_at, lang) : "—";
  const typeLabel = report.report_type ?? "general";

  // 1. Text analysis
  await sendText(phone,
    msg(lang, "analysis_text_header",
      report.report_name,
      dateStr,
      typeLabel,
      result.analysisText
    )
  );

  // 2. Audio file (upload to storage → signed URL)
  try {
    const audioUrl = await uploadAudioAndGetUrl(result.audioBase64, result.audioMime, session.patientDbId!);
    if (audioUrl) {
      await sendMedia(phone, msg(lang, "analysis_audio_header", report.report_name), audioUrl);
    }
  } catch (e: any) {
    console.warn("[whatsapp] audio send failed:", e?.message);
  }

  // 3. Original report file
  if (report.report_url) {
    try {
      await sendMedia(phone, msg(lang, "analysis_file_header", report.report_name), report.report_url);
    } catch {
      await sendText(phone, msg(lang, "analysis_no_file"));
    }
  }

  await sendText(phone, msg(lang, "type_menu"));
}

// ── Health Passport ────────────────────────────────────────────────────────

async function deliverHealthPassport(session: Session, phone: string, lang: Lang): Promise<void> {
  const passport = await getHealthPassport(session.patientDbId!);
  session.step = "main_menu";

  if (!passport) {
    await sendText(phone, msg(lang, "error_generic"));
    return;
  }

  const bgLine = [
    passport.bloodGroup ? `🩸 ${passport.bloodGroup}` : "",
    passport.dob ? ` | DOB: ${passport.dob}` : "",
  ].filter(Boolean).join("");

  const rxBlock = passport.latestPrescription
    ? (lang === "hi"
      ? `\n💊 *ताज़ा पर्चा* (${passport.latestPrescription.doctor} — ${passport.latestPrescription.date}):\n   ${passport.latestPrescription.illness}\n   → ${passport.latestPrescription.medicines}`
      : `\n💊 *Latest Prescription* (${passport.latestPrescription.doctor} — ${passport.latestPrescription.date}):\n   ${passport.latestPrescription.illness}\n   → ${passport.latestPrescription.medicines}`)
    : "";

  const rptBlock = passport.latestReport
    ? (lang === "hi"
      ? `\n📄 *ताज़ा रिपोर्ट* (${passport.latestReport.date}):\n   ${passport.latestReport.name}`
      : `\n📄 *Latest Report* (${passport.latestReport.date}):\n   ${passport.latestReport.name}`)
    : "";

  await sendText(phone,
    msg(lang, "passport_header",
      passport.patientName,
      bgLine ? `\n${bgLine}` : "",
      passport.prescriptionCount,
      passport.reportCount,
      passport.activeGrantCount,
      rxBlock,
      rptBlock
    )
  );
}

// ── Health Trends ──────────────────────────────────────────────────────────

async function deliverHealthTrends(session: Session, phone: string, lang: Lang): Promise<void> {
  const result = await getHealthTrends(session.patientDbId!);
  session.step = "main_menu";

  if (!result) {
    await sendText(phone, msg(lang, "trends_need_more"));
    return;
  }

  const dirMap: Record<string, string> = {
    improving: msg(lang, "trends_dir_improving"),
    declining: msg(lang, "trends_dir_declining"),
    stable: msg(lang, "trends_dir_stable"),
    variable: msg(lang, "trends_dir_variable"),
  };
  const concernMap: Record<string, string> = {
    urgent: msg(lang, "trends_concern_urgent"),
    watch: msg(lang, "trends_concern_watch"),
    none: msg(lang, "trends_concern_none"),
  };

  const trendsText = result.trends
    .map((t) => {
      const dir = dirMap[t.direction] ?? t.direction;
      const concern = concernMap[t.concern] ?? t.concern;
      return `${dir} — ${t.parameter} (${concern})\n   ${t.note}`;
    })
    .join("\n\n");

  await sendText(phone, msg(lang, "trends_header", result.report_count, trendsText, result.summary));
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

export async function whatsappWebhook(req: Request, res: Response): Promise<void> {
  // Always ACK Twilio immediately
  res.status(200).set("Content-Type", "text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");

  const rawFrom: string = (req.body?.From as string) ?? "";
  const rawBody: string = ((req.body?.Body as string) ?? "").trim();
  const phone = rawFrom.replace(/^whatsapp:/, "");
  const text = rawBody.toLowerCase().replace(/[^\w\d]/g, " ").trim();
  const rawText = rawBody;

  if (!phone || !rawBody) return;

  console.log(`[whatsapp] ${phone} → "${rawBody}"`);

  // Handle global reset keywords
  if (["hi", "hello", "start", "menu", "नमस्ते", "शुरू"].some((k) => text === k || rawBody.toLowerCase() === k)) {
    // "menu" mid-session: go back to main menu if lang is already set
    const existing = sessions.get(phone);
    if (rawBody.toLowerCase() === "menu" && existing?.lang && existing.patientDbId) {
      existing.step = "main_menu";
      existing.data = {};
      existing.lastActivity = Date.now();
      await sendText(phone, msg(existing.lang, "main_menu"));
      return;
    }
    // Full reset
    sessions.delete(phone);
    const session = getSession(phone);
    await sendText(phone, msg("en", "welcome"));
    return;
  }

  const session = getSession(phone);
  const lang = session.lang ?? "en";

  try {
    switch (session.step) {
      case "lang_select":
        await handleLangSelect(session, phone, text);
        break;

      case "main_menu":
        await handleMainMenu(session, phone, text);
        break;

      // Doctor booking
      case "select_dept":
        await handleSelectDept(session, phone, text);
        break;
      case "select_slot":
        await handleSelectSlot(session, phone, text);
        break;

      // Service booking
      case "select_svc_dept":
        await handleSelectSvcDept(session, phone, text);
        break;
      case "select_svc":
        await handleSelectSvc(session, phone, text);
        break;
      case "select_svc_slot":
        await handleSelectSvcSlot(session, phone, text);
        break;

      // Appointments
      case "appts_submenu":
        await handleApptsSubmenu(session, phone, text);
        break;
      case "sel_cancel":
        await handleSelCancel(session, phone, text);
        break;
      case "cancel_confirm":
        // text may be "YES" — use rawText for case-insensitive exact
        await handleCancelConfirm(session, phone, rawText.toLowerCase());
        break;

      // Waitlist
      case "waitlist_list":
        await handleWaitlistList(session, phone, text);
        break;

      // Reports
      case "reports_list":
        await handleReportsList(session, phone, text);
        break;

      case "report_analysis":
        // Mid-analysis: user sent something while waiting
        await sendText(phone, msg(lang, "analysis_wait"));
        break;

      default:
        session.step = "main_menu";
        await sendText(phone, msg(lang, "main_menu"));
    }
  } catch (err: any) {
    console.error(`[whatsapp] handler error for step=${session.step}:`, err?.message ?? err);
    await sendText(phone, msg(lang, "error_generic")).catch(() => {});
    session.step = "main_menu";
  }
}
