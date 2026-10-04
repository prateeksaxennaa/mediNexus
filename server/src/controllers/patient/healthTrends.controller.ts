import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../config/supabase.js";
import { requirePatient } from "../../utils/lookup.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError, BadRequestError } from "../../utils/errors.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendItem {
  parameter: string;
  direction: "improving" | "declining" | "stable" | "variable";
  concern: "none" | "watch" | "urgent";
  note: string;
}

export interface TrendsResult {
  summary: string;
  trends: TrendItem[];
  report_count: number;
  generated_at: string;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Bust automatically when the patient uploads a new report (reportCount changes)

interface CacheEntry {
  result: TrendsResult;
  reportCount: number;
}

const trendsCache = new Map<string, CacheEntry>();

// ─── Enriched report type for trend analysis ──────────────────────────────────

interface AnalysedReport {
  name: string;
  date: string;
  /** doc_type as stored in report_analysis_cache (xray | mri | ecg | ct | report | default) */
  docType: string;
  /** Pre-generated patient-friendly analysis text from report_analysis_cache */
  analysisText: string;
}

// ─── OpenRouter trend analysis ────────────────────────────────────────────────

async function generateTrends(
  reports: AnalysedReport[],
): Promise<TrendsResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError("OpenRouter API key not configured", 503);

  // Build the report block — include the doc_type label so the model
  // knows whether it is looking at a lab result, an MRI description, an ECG
  // summary, etc., and can apply the correct clinical lens.
  const reportsBlock = reports
    .map(
      (r, i) =>
        `--- Report ${i + 1}: "${r.name}" | Type: ${r.docType} | Date: ${r.date} ---\n${r.analysisText}`,
    )
    .join("\n\n");

  const systemPrompt =
    "You are a senior clinical AI that analyses a patient's medical reports across time to identify meaningful health trends. " +
    "The reports have already been individually analysed by specialist AI — each report block below contains a patient-friendly summary of that report, " +
    "along with the report type (lab/blood test, MRI, ECG, CT scan, X-ray, etc.).\n\n" +
    "Your task:\n" +
    "1. Read all the report summaries in chronological order.\n" +
    "2. Identify parameters, findings, or clinical markers that appear across MULTIPLE reports — applying the correct clinical lens for each modality:\n" +
    "   • For lab/blood reports: look for numerical values (haemoglobin, glucose, cholesterol, creatinine, WBC, platelets, liver enzymes, kidney markers, etc.).\n" +
    "   • For ECG reports: look for rhythm findings, heart rate changes, conduction patterns, or interval changes over time.\n" +
    "   • For MRI / CT / X-ray reports: look for structural or lesion findings that are mentioned across scans (e.g. size of a mass, extent of inflammation, bone density, effusion).\n" +
    "   • For mixed report sets: cross-correlate findings where clinically meaningful (e.g. abnormal kidney markers in blood tests alongside kidney findings in an imaging study).\n" +
    "3. For each such finding or parameter, determine whether it is improving, declining, stable, or variable across reports.\n" +
    "4. Flag which trends are clinically concerning.\n" +
    "5. Write a concise overall narrative for the patient.\n\n" +
    "IMPORTANT: Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text before or after. Use this exact structure:\n" +
    "{\n" +
    '  "summary": "2-4 sentence overall narrative for the patient, using \'your\'",\n' +
    '  "trends": [\n' +
    "    {\n" +
    '      "parameter": "Full parameter or finding name — never abbreviate (e.g. Haemoglobin, Fasting Blood Glucose, Heart Rate, Left Ventricular Ejection Fraction, Pleural Effusion Size)",\n' +
    '      "direction": "improving" or "declining" or "stable" or "variable",\n' +
    '      "concern": "none" or "watch" or "urgent",\n' +
    '      "note": "1-2 sentences describing what was observed across reports and what the trend means for the patient"\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- Only include parameters or findings that appear in at least 2 reports with observable changes or consistent mentions.\n" +
    '- "urgent" concern = clinically dangerous trend requiring immediate attention.\n' +
    '- "watch" concern = abnormal or worsening but not immediately dangerous — worth monitoring.\n' +
    '- "none" concern = improving or holding within a healthy/normal range.\n' +
    "- Maximum 8 trend items — pick the most clinically significant.\n" +
    "- Never abbreviate parameter or finding names. Write the full name.\n" +
    '- Speak directly to the patient using "your" in the summary and trend notes.\n' +
    "- If only one type of report is present (e.g. all ECGs), focus entirely on that modality's relevant findings.";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://medinexus.app",
      "X-Title": "mediNexus Health Trend Analysis",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyse these ${reports.length} medical reports in chronological order and identify health trends:\n\n${reportsBlock}`,
        },
      ],
      reasoning: { enabled: true },
      temperature: 0.2,
      max_tokens: 1100,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[healthTrends] OpenRouter error:", errText);
    throw new AppError("AI trend analysis service returned an error", 502);
  }

  const data = (await res.json()) as any;
  const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

  let jsonStr = raw;
  // Robust JSON extraction: find first '{' and last '}'
  const startIndex = raw.indexOf("{");
  const endIndex = raw.lastIndexOf("}");

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    jsonStr = raw.substring(startIndex, endIndex + 1);
  }

  let parsed: { summary: string; trends: TrendItem[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[healthTrends] JSON parse failed, err:", err);
    console.error("[healthTrends] raw string was:", raw);
    // Fallback: return the raw text as summary with no trends
    parsed = {
      summary:
        "We generated a summary but could not format it as trends. Details:\n\n" +
        raw,
      trends: [],
    };
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    trends: Array.isArray(parsed.trends) ? parsed.trends : [],
    report_count: reports.length,
    generated_at: new Date().toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function getHealthTrends(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new AppError("Not authenticated", 401);

    const patient = await requirePatient(userId);

    // ── 1. Fetch all patient reports (to know total count + order) ─────────
    const { data: allReports, error: reportsErr } = await supabaseAdmin
      .from("patient_reports")
      .select("id, report_name, uploaded_at")
      .eq("patient_id", patient.id)
      .order("uploaded_at", { ascending: true });

    if (reportsErr) throw new AppError("Failed to fetch reports", 502);

    if (!allReports || allReports.length < 2) {
      throw new BadRequestError(
        "At least 2 reports are needed to analyse health trends.",
      );
    }

    // ── 2. In-memory cache — bust when report count changes ────────────────
    const cached = trendsCache.get(patient.id);
    if (cached && cached.reportCount === allReports.length) {
      sendSuccess(
        res,
        { ...cached.result, cached: true },
        "Health trends (cached)",
      );
      return;
    }

    // ── 3. Fetch pre-analysed summaries from report_analysis_cache ─────────
    //
    // We prefer the English ('en') analysis text as the source for trend
    // generation — the trend engine always operates in English regardless of
    // the patient's preferred language.  We join via the report_id so we also
    // get the report's upload date for chronological ordering.
    //
    // Strategy: for each report that has a cache entry, take the first
    // available language (en preferred, then hi, then any).  Reports without
    // any cache entry are silently skipped.

    const reportIds = allReports.map((r) => r.id as string);

    const { data: cacheRows, error: cacheErr } = await (supabaseAdmin as any)
      .from("report_analysis_cache")
      .select("report_id, doc_type, analysis_text, lang")
      .in("report_id", reportIds);

    if (cacheErr) {
      console.error("[healthTrends] Could not read report_analysis_cache:", cacheErr.message);
    }

    // Group cache rows by report_id, prefer 'en' lang
    const cacheByReportId = new Map<
      string,
      { doc_type: string; analysis_text: string; lang: string }
    >();

    if (cacheRows && cacheRows.length > 0) {
      for (const row of cacheRows as {
        report_id: string;
        doc_type: string;
        analysis_text: string;
        lang: string;
      }[]) {
        const existing = cacheByReportId.get(row.report_id);
        // Prefer English; if none yet, take whatever we have
        if (!existing || (existing.lang !== "en" && row.lang === "en")) {
          cacheByReportId.set(row.report_id, {
            doc_type: row.doc_type,
            analysis_text: row.analysis_text,
            lang: row.lang,
          });
        }
      }
    }

    // Build the enriched report list in chronological order
    const analysedReports: AnalysedReport[] = [];

    for (const report of allReports) {
      const entry = cacheByReportId.get(report.id as string);
      if (!entry) continue; // No analysis available yet — skip

      analysedReports.push({
        name: report.report_name as string,
        date: (report.uploaded_at as string).split("T")[0],
        docType: entry.doc_type,
        analysisText: entry.analysis_text,
      });
    }

    console.log(
      `[healthTrends] Running trend analysis on ${analysedReports.length} reports for patient ${patient.id}`,
    );

    if (analysedReports.length < 2) {
      throw new BadRequestError(
        "At least 2 analysed reports are needed to identify health trends. Please open each report to trigger analysis first.",
      );
    }

    // ── 4. Generate trends from the pre-analysed summaries ─────────────────
    const result = await generateTrends(analysedReports);

    trendsCache.set(patient.id, { result, reportCount: allReports.length });
    sendSuccess(res, result, "Health trends generated");
  } catch (err) {
    next(err);
  }
}
