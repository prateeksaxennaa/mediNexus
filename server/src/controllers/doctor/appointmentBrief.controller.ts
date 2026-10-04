import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../config/supabase.js";
import { requireDoctor } from "../../utils/lookup.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError, NotFoundError } from "../../utils/errors.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppointmentBrief {
  patient_name: string;
  age: number | null;
  blood_group: string | null;
  known_allergies: string | null;
  active_medications: string[];
  recent_conditions: string[];
  recent_findings: string[];
  focus_areas: string[];
  narrative: string;
  generated_at: string;
}

// ─── In-memory cache (keyed by appointmentId) ─────────────────────────────────

const briefCache = new Map<string, AppointmentBrief>();

// ─── Age helper ───────────────────────────────────────────────────────────────

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const ms = Date.now() - new Date(dob).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── OpenRouter brief generation ─────────────────────────────────────────────

async function generateBrief(context: {
  patientName: string;
  age: number | null;
  bloodGroup: string | null;
  allergies: string | null;
  bookingType: string;
  appointmentNotes: string | null;
  prescriptions: any[];
  reports: any[];
}): Promise<AppointmentBrief> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError("OpenRouter API key not configured", 503);

  // Build a concise context block — keep tokens lean
  const rxSummary = context.prescriptions
    .slice(0, 5)
    .map((rx: any) => {
      const meds = (rx.prescription_items ?? [])
        .map((i: any) => i.medicines?.medicine_name ?? i.medicine_id)
        .join(", ");
      return `• ${rx.issued_at?.split("T")[0] ?? "Unknown date"}: ${rx.illness_description ?? "General"} — Medications: ${meds || "None listed"}`;
    })
    .join("\n");

  const reportSummary = context.reports
    .slice(0, 5)
    .map(
      (r: any) =>
        `• ${r.uploaded_at?.split("T")[0] ?? "Unknown date"}: ${r.report_name} (${r.report_type ?? "general"})`,
    )
    .join("\n");

  const contextBlock = [
    `Patient: ${context.patientName}`,
    context.age != null ? `Age: ${context.age} years` : null,
    context.bloodGroup ? `Blood Group: ${context.bloodGroup}` : null,
    context.allergies ? `Known Allergies: ${context.allergies}` : null,
    `Booking Type: ${context.bookingType}`,
    context.appointmentNotes
      ? `Appointment Notes: ${context.appointmentNotes}`
      : null,
    rxSummary
      ? `\nRecent Prescriptions (newest first):\n${rxSummary}`
      : "\nNo prescription history accessible.",
    reportSummary
      ? `\nRecent Reports (newest first):\n${reportSummary}`
      : "\nNo report history accessible.",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt =
    "You are a clinical AI assistant briefing a doctor before they see a patient. " +
    "Your job is to give the doctor a concise, actionable pre-appointment brief — like a smart summary a senior nurse would prepare. " +
    "Respond with ONLY a valid JSON object, no markdown or code fences, using exactly this structure:\n" +
    "{\n" +
    '  "active_medications": ["list of current medications inferred from the most recent prescriptions"],\n' +
    '  "recent_conditions": ["conditions/diagnoses inferred from prescriptions and report names"],\n' +
    '  "recent_findings": ["any abnormal or noteworthy findings inferred from report names and types — if no reports available, empty array"],\n' +
    '  "focus_areas": ["2-3 specific clinical things the doctor should check or ask about in today\'s appointment, based on history and booking context"],\n' +
    '  "narrative": "3-5 sentence plain-English summary of who this patient is, what their recent health picture looks like, and what to watch for today"\n' +
    "}\n\n" +
    "Rules:\n" +
    "- Never expand report names into diagnoses you cannot confirm — stay close to the data.\n" +
    "- Never include abbreviations — always write the full name (e.g. Blood Pressure not BP).\n" +
    "- If data is sparse, still provide useful focus areas based on demographics and booking context.\n" +
    "- Keep each array item concise (under 15 words).\n" +
    "- Narrative must be plain English, no bullet points inside it.";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://medinexus.app",
      "X-Title": "mediNexus Pre-Appointment Brief",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate the pre-appointment brief for this patient:\n\n${contextBlock}`,
        },
      ],
      reasoning: { enabled: true },
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[appointmentBrief] OpenRouter error:", errText);
    throw new AppError("AI brief generation service returned an error", 502);
  }

  const data = (await res.json()) as any;
  const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

  let jsonStr = raw;
  const startIndex = raw.indexOf("{");
  const endIndex = raw.lastIndexOf("}");

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    jsonStr = raw.substring(startIndex, endIndex + 1);
  }

  let parsed: Partial<AppointmentBrief>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[appointmentBrief] JSON parse failed, err:", err);
    console.error("[appointmentBrief] raw string was:", raw);
    parsed = {
      narrative:
        "We generated a brief but could not format it properly. Details:\n\n" +
        raw,
      active_medications: [],
      recent_conditions: [],
      recent_findings: [],
      focus_areas: [],
    };
  }

  return {
    patient_name: context.patientName,
    age: context.age,
    blood_group: context.bloodGroup,
    known_allergies: context.allergies,
    active_medications: Array.isArray(parsed.active_medications)
      ? parsed.active_medications
      : [],
    recent_conditions: Array.isArray(parsed.recent_conditions)
      ? parsed.recent_conditions
      : [],
    recent_findings: Array.isArray(parsed.recent_findings)
      ? parsed.recent_findings
      : [],
    focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas : [],
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    generated_at: new Date().toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function getAppointmentBrief(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new AppError("Not authenticated", 401);

    const doctor = await requireDoctor(userId);
    const rawId = req.params.appointmentId;
    const appointmentId = Array.isArray(rawId) ? rawId[0] : rawId;

    // Check cache
    const cached = briefCache.get(appointmentId);
    if (cached) {
      sendSuccess(
        res,
        { ...cached, cached: true },
        "Appointment brief (cached)",
      );
      return;
    }

    // Fetch the appointment — must belong to this doctor
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select(
        `id, patient_id, booking_type, notes, status,
         appointment_slots ( slot_start, slot_end ),
         patients ( full_name, dob, blood_group, known_allergies )`,
      )
      .eq("id", appointmentId)
      .eq("doctor_id", doctor.id)
      .single();

    if (apptErr || !appt) throw new NotFoundError("Appointment not found");

    const patient = appt.patients as any;
    const patientId = appt.patient_id;
    const age = calcAge(patient?.dob ?? null);

    // Try to fetch accessible prescriptions (grant-based, silently skip if none)
    let prescriptions: any[] = [];
    let reports: any[] = [];

    try {
      // Doctor's own prescriptions for this patient
      const { data: ownRx } = await supabaseAdmin
        .from("prescriptions")
        .select(
          `id, illness_description, issued_at,
           prescription_items (
             id, medicine_id,
             medicines ( medicine_name )
           )`,
        )
        .eq("doctor_id", doctor.id)
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false })
        .limit(5);

      prescriptions = ownRx ?? [];

      // Check for access grants → fetch shared prescriptions + reports
      const { data: grants } = await supabaseAdmin
        .from("record_access_grants")
        .select("document_type, document_id, record_types, valid_until")
        .eq("patient_id", patientId)
        .or(
          `granted_to_doctor_id.eq.${doctor.id},granted_to_hospital_id.eq.${doctor.hospital_id}`,
        )
        .gt("valid_until", new Date().toISOString());

      if (grants && grants.length > 0) {
        const grantedRxIds = new Set<string>();
        const grantedReportIds = new Set<string>();
        let fullRxAccess = false;
        let fullReportAccess = false;

        for (const g of grants) {
          if (g.document_id) {
            if (g.document_type === "prescription")
              grantedRxIds.add(g.document_id);
            else if (g.document_type === "report")
              grantedReportIds.add(g.document_id);
          } else {
            // Fallback: decode the packed record_types[] encoding used before
            // the document_type/document_id columns were added to the live DB.
            // Format: [docType, docId, source?]  e.g. ['report', '<uuid>', 'manual']
            // Also handle legacy bulk grants that stored plural type names.
            const types: string[] = g.record_types ?? [];
            if (types.length >= 2 && types[0] === "report" && types[1]) {
              grantedReportIds.add(types[1]);
            } else if (
              types.length >= 2 &&
              types[0] === "prescription" &&
              types[1]
            ) {
              grantedRxIds.add(types[1]);
            } else if (types.includes("reports")) {
              fullReportAccess = true;
            } else if (types.includes("prescriptions")) {
              fullRxAccess = true;
            }
          }
        }

        // Fetch shared prescriptions not already in ownRx
        const existingRxIds = new Set(prescriptions.map((r: any) => r.id));
        if (fullRxAccess) {
          const { data } = await supabaseAdmin
            .from("prescriptions")
            .select(
              `id, illness_description, issued_at, prescription_items ( id, medicine_id, medicines ( medicine_name ) )`,
            )
            .eq("patient_id", patientId)
            .not("id", "in", `(${[...existingRxIds].join(",") || "null"})`)
            .order("issued_at", { ascending: false })
            .limit(5);
          prescriptions = [...prescriptions, ...(data ?? [])];
        } else if (grantedRxIds.size > 0) {
          const ids = [...grantedRxIds].filter((id) => !existingRxIds.has(id));
          if (ids.length > 0) {
            const { data } = await supabaseAdmin
              .from("prescriptions")
              .select(
                `id, illness_description, issued_at, prescription_items ( id, medicine_id, medicines ( medicine_name ) )`,
              )
              .in("id", ids)
              .order("issued_at", { ascending: false });
            prescriptions = [...prescriptions, ...(data ?? [])];
          }
        }

        // Fetch reports
        if (fullReportAccess) {
          const { data } = await supabaseAdmin
            .from("patient_reports")
            .select("id, report_name, report_type, uploaded_at")
            .eq("patient_id", patientId)
            .order("uploaded_at", { ascending: false })
            .limit(5);
          reports = data ?? [];
        } else if (grantedReportIds.size > 0) {
          const { data } = await supabaseAdmin
            .from("patient_reports")
            .select("id, report_name, report_type, uploaded_at")
            .in("id", [...grantedReportIds])
            .order("uploaded_at", { ascending: false });
          reports = data ?? [];
        }
      }
    } catch (e) {
      // Passport data is supplementary — don't fail the whole request
      console.warn(
        "[appointmentBrief] Could not fetch passport data, using appointment data only:",
        e,
      );
    }

    console.log(
      `[appointmentBrief] Generating brief for appointment ${appointmentId} — ${prescriptions.length} Rx, ${reports.length} reports`,
    );

    const brief = await generateBrief({
      patientName: patient?.full_name ?? "Patient",
      age,
      bloodGroup: patient?.blood_group ?? null,
      allergies: patient?.known_allergies ?? null,
      bookingType: appt.booking_type,
      appointmentNotes: appt.notes,
      prescriptions,
      reports,
    });

    briefCache.set(appointmentId, brief);
    sendSuccess(res, brief, "Appointment brief generated");
  } catch (err) {
    next(err);
  }
}
