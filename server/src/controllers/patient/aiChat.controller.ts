import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../config/supabase.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError, BadRequestError } from "../../utils/errors.js";
import { requirePatient } from "../../utils/lookup.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

interface PrescriptionContext {
  issuedAt: string;
  illnessDescription: string | null;
  doctorSpecialisation: string | null;
  items: {
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    comment: string | null;
  }[];
}

interface ReportContext {
  reportType: string;
  reportName: string;
  uploadedAt: string;
}

/**
 * Pre-generated AI analysis summary for a specific report from report_analysis_cache.
 * audio_base64 is intentionally excluded — it's the TTS audio of the text and is redundant here.
 */
interface ReportAnalysisContext {
  reportName: string;
  docType: string;
  uploadedAt: string;
  analysisText: string;
}

interface ReferralContext {
  fromSpecialisation: string | null;
  toSpecialisation: string | null;
  reason: string | null;
  status: string;
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(context: {
  ageYears: number | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  prescriptions: PrescriptionContext[];
  reports: ReportContext[];
  reportAnalyses: ReportAnalysisContext[];
  referrals: ReferralContext[];
}): string {
  // ── Prescriptions ────────────────────────────────────────────────────────
  const rxText =
    context.prescriptions.length === 0
      ? "No prescriptions on record."
      : context.prescriptions
          .map((rx, i) => {
            const meds =
              rx.items.length === 0
                ? "  (no medicines listed)"
                : rx.items
                    .map(
                      (it) =>
                        `  • ${it.medicineName} — ${it.dosage}, ${it.frequency}, for ${it.duration}` +
                        (it.comment ? ` (note: ${it.comment})` : ""),
                    )
                    .join("\n");
            return [
              `Prescription ${i + 1} — issued ${rx.issuedAt}`,
              rx.illnessDescription
                ? `  Illness/Diagnosis: ${rx.illnessDescription}`
                : "",
              rx.doctorSpecialisation
                ? `  Doctor speciality: ${rx.doctorSpecialisation}`
                : "",
              meds,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

  // ── Reports (metadata list — always shown) ────────────────────────────────
  const reportsText =
    context.reports.length === 0
      ? "No reports on file."
      : context.reports
          .map(
            (r) =>
              `• ${r.reportName} (${r.reportType}) — uploaded ${r.uploadedAt}`,
          )
          .join("\n");

  // ── Report AI Analysis Summaries ─────────────────────────────────────────
  // These are the patient-friendly AI-generated summaries from report_analysis_cache.
  // They give the chat AI deep clinical context about each analysed report.
  const analysesText =
    context.reportAnalyses.length === 0
      ? "No AI-analysed report summaries available yet."
      : context.reportAnalyses
          .map(
            (a, i) =>
              `Analysis ${i + 1}: "${a.reportName}" | Type: ${a.docType} | Date: ${a.uploadedAt}\n${a.analysisText}`,
          )
          .join("\n\n---\n\n");

  // ── Referrals ────────────────────────────────────────────────────────────
  const referralsText =
    context.referrals.length === 0
      ? "No referrals on record."
      : context.referrals
          .map(
            (r) =>
              `• ${r.fromSpecialisation ?? "Unknown"} → ${r.toSpecialisation ?? "Unknown"}` +
              (r.reason ? `: ${r.reason}` : "") +
              ` [${r.status}]`,
          )
          .join("\n");

  return `You are a personal health assistant integrated into the mediNexus patient portal.
Your role is to help the patient understand their own medical history, past prescriptions, reports, and referrals in plain, compassionate language.
You also have access to AI-generated analysis summaries of the patient's medical reports (lab results, MRI, ECG, CT scans, X-rays, etc.) — use these to answer questions about specific reports in detail.

IMPORTANT RULES:
1. You only have the information provided below. Do NOT make up diagnoses, test results, or medicines not listed.
2. Always speak from the patient's perspective ("your records show…", "you were prescribed…", "your MRI analysis shows…").
3. Keep answers concise, clear, empathetic, and non-alarmist.
4. If a question requires in-person evaluation, lab tests, or a doctor's judgment, say so clearly and encourage them to book an appointment.
5. Never advise changing dosages or stopping medicines — only reference what is already in their records.
6. If there are no relevant records for a question, say so honestly.
7. When answering questions about a specific report, use the AI analysis summary section to give detailed, accurate answers — not just the report name.
8. Format responses with clear structure when helpful (use bullet points, line breaks). Keep replies focused and under 300 words unless the question genuinely needs more.
9. Always end EVERY response with this disclaimer on a new line: "⚠️ This overview is based on your past records only. Please consult a doctor for detailed clinical analysis and personalized medical advice."

══════════════════════════════════════════════════════════════
PATIENT HEALTH CONTEXT (anonymized — no names or IDs shared)
══════════════════════════════════════════════════════════════

Age: ${context.ageYears !== null ? `${context.ageYears} years` : "Not available"}
Blood Group: ${context.bloodGroup ?? "Not recorded"}
Known Allergies: ${context.knownAllergies?.trim() || "None reported"}

── PRESCRIPTIONS (most recent first, up to last 10) ──────────
${rxText}

── REPORTS (metadata list) ───────────────────────────────────
${reportsText}

── REPORT AI ANALYSIS SUMMARIES ──────────────────────────────
The following are AI-generated patient-friendly summaries of the analysed reports.
Use these to answer detailed questions about specific findings, abnormal values, imaging observations, etc.

${analysesText}

── REFERRALS ─────────────────────────────────────────────────
${referralsText}
══════════════════════════════════════════════════════════════`;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/patients/me/ai-chat
 *
 * Accepts { message: string, history?: ChatMessage[] }.
 * Fetches the patient's full health context from the DB (server-side — no PII
 * travels in the request body), including pre-generated AI report analysis
 * summaries from report_analysis_cache, builds a system prompt, then calls
 * arcee-ai/trinity-large-preview:free on OpenRouter for a reply.
 */
export async function patientAIChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authenticated user not found", 401);

    const patient = await requirePatient(userId);

    const { message, history = [] } = req.body as AIChatRequestBody;

    if (!message?.trim()) {
      throw new BadRequestError("message is required");
    }

    if (message.trim().length > 1000) {
      throw new BadRequestError("message must be 1000 characters or less");
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new AppError("AI service is not configured", 503);

    // ── 1. Fetch all patient health data in parallel ─────────────────────────
    const [prescriptionsRes, reportsRes, referralsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("prescriptions")
        .select(
          `illness_description, issued_at,
           doctors ( specialisation ),
           prescription_items (
             dosage, frequency, duration, doctor_comment,
             medicines ( medicine_name )
           )`,
        )
        .eq("patient_id", patient.id)
        .order("issued_at", { ascending: false })
        .limit(10),

      (supabaseAdmin as any)
        .from("patient_reports")
        .select("id, report_type, report_name, uploaded_at")
        .eq("patient_id", patient.id)
        .order("uploaded_at", { ascending: false })
        .limit(20),

      (supabaseAdmin as any)
        .from("referrals")
        .select(
          `reason, status,
           referring_doctor:referring_doctor_id ( specialisation ),
           referred_to_doctor:referred_to_doctor_id ( specialisation )`,
        )
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // ── 2. Fetch report analysis cache for all fetched reports ────────────────
    //
    // We use the report IDs from the reports fetch to pull only the rows
    // relevant to this patient. We prefer 'en' language for the analysis text.
    // audio_base64 is explicitly excluded — it's redundant TTS audio.

    let reportAnalyses: ReportAnalysisContext[] = [];

    const reportRows: {
      id: string;
      report_type: string;
      report_name: string;
      uploaded_at: string;
    }[] = reportsRes.data ?? [];

    if (reportRows.length > 0) {
      const reportIds = reportRows.map((r) => r.id);

      const { data: cacheRows, error: cacheErr } = await (supabaseAdmin as any)
        .from("report_analysis_cache")
        .select("report_id, doc_type, analysis_text, lang")
        .in("report_id", reportIds);

      if (cacheErr) {
        // Non-fatal — log and continue without analysis summaries
        console.warn(
          "[patientAIChat] Could not fetch report_analysis_cache:",
          cacheErr.message,
        );
      } else if (cacheRows && cacheRows.length > 0) {
        // Group by report_id, prefer 'en' lang
        const cacheMap = new Map<
          string,
          { doc_type: string; analysis_text: string; lang: string }
        >();

        for (const row of cacheRows as {
          report_id: string;
          doc_type: string;
          analysis_text: string;
          lang: string;
        }[]) {
          const existing = cacheMap.get(row.report_id);
          if (!existing || (existing.lang !== "en" && row.lang === "en")) {
            cacheMap.set(row.report_id, {
              doc_type: row.doc_type,
              analysis_text: row.analysis_text,
              lang: row.lang,
            });
          }
        }

        // Build the final analysed report list in the same order as reports
        // (most recent first), truncating analysis_text to avoid blowing the
        // context window (~2 000 chars per report is a safe ceiling).
        reportAnalyses = reportRows
          .filter((r) => cacheMap.has(r.id))
          .map((r) => {
            const entry = cacheMap.get(r.id)!;
            return {
              reportName: r.report_name,
              docType: entry.doc_type,
              uploadedAt: new Date(r.uploaded_at).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
              }),
              analysisText: entry.analysis_text.slice(0, 2000),
            };
          });
      }
    }

    // ── 3. Calculate age from DOB ────────────────────────────────────────────
    let ageYears: number | null = null;
    if (patient.dob) {
      const dob = new Date(patient.dob);
      const today = new Date();
      ageYears = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < dob.getDate())
      ) {
        ageYears--;
      }
    }

    // ── 4. Shape data into clean context objects ─────────────────────────────
    const prescriptions: PrescriptionContext[] = (
      prescriptionsRes.data ?? []
    ).map((rx: any) => ({
      issuedAt: new Date(rx.issued_at).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      illnessDescription: rx.illness_description ?? null,
      doctorSpecialisation: rx.doctors?.specialisation ?? null,
      items: (rx.prescription_items ?? []).map((it: any) => ({
        medicineName: it.medicines?.medicine_name ?? "Unknown",
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        comment: it.doctor_comment ?? null,
      })),
    }));

    const reports: ReportContext[] = reportRows.map((r) => ({
      reportType: r.report_type,
      reportName: r.report_name,
      uploadedAt: new Date(r.uploaded_at).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));

    const referrals: ReferralContext[] = (referralsRes.data ?? []).map(
      (r: any) => ({
        fromSpecialisation: r.referring_doctor?.specialisation ?? null,
        toSpecialisation: r.referred_to_doctor?.specialisation ?? null,
        reason: r.reason ?? null,
        status: r.status,
      }),
    );

    // ── 5. Build system prompt with full health context ───────────────────────
    const systemPrompt = buildSystemPrompt({
      ageYears,
      bloodGroup: patient.blood_group ?? null,
      knownAllergies: patient.known_allergies ?? null,
      prescriptions,
      reports,
      reportAnalyses,
      referrals,
    });

    // ── 6. Build the message thread (sanitized history + new message) ────────
    const safeHistory: { role: "user" | "assistant"; content: string }[] =
      history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20) // at most last 10 turns (20 messages)
        .map((m) => ({
          role: m.role,
          content: String(m.content).slice(0, 2000),
        }));

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...safeHistory,
      { role: "user" as const, content: message.trim() },
    ];

    // ── 7. Call OpenRouter ───────────────────────────────────────────────────
    const openRouterRes = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://medinexus.app",
          "X-Title": "mediNexus Patient Health Assistant",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
          messages,
          reasoning: { enabled: true },
          temperature: 0.3,
          max_tokens: 800,
        }),
      },
    );

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error("[patientAIChat] OpenRouter error:", errText);
      throw new AppError("AI service returned an error", 502);
    }

    const openRouterData = (await openRouterRes.json()) as any;
    const reply: string =
      openRouterData?.choices?.[0]?.message?.content?.trim() ??
      "I was unable to generate a response. Please try again.";

    sendSuccess(res, { reply }, "AI response generated");
  } catch (err) {
    next(err);
  }
}
