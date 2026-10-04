import type { Request, Response, NextFunction } from "express";
import pdfParseLib from "pdf-parse";
const pdfParse = pdfParseLib as unknown as (
  buf: Buffer,
) => Promise<{ text: string }>;
import { supabaseAdmin } from "../../config/supabase.js";
import { requirePatient } from "../../utils/lookup.js";
import { sendSuccess } from "../../utils/response.js";
import { Groq } from "groq-sdk";
import {
  AppError,
  BadRequestError,
  NotFoundError,
} from "../../utils/errors.js";
import { env } from "../../config/env.js";

// ─── Clients ────────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: env.GROQ_API_KEY.trim() });

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "en" | "hi";

/**
 * The document_type sent in the request body.
 * Image modalities: xray | mri | ecg | ct
 * Text-based:       report | default
 */
type DocumentType = "xray" | "mri" | "ecg" | "ct" | "report" | "default";

/** The set of document types that are image-based and require vision AI. */
const IMAGE_MODALITIES = new Set<DocumentType>(["xray", "mri", "ecg", "ct"]);

// ─── System prompts (English) per document type ───────────────────────────────

const SYSTEM_PROMPTS_EN: Record<DocumentType, string> = {
  xray:
    "You are a radiology assistant. A patient has uploaded an X-ray and wants to understand what it shows. " +
    "Analyse the image and describe the key findings in simple, patient-friendly language. " +
    "First, identify the body part or area shown. Then mention any visible abnormalities (e.g. fractures, dislocations, consolidation, effusion), " +
    "note normal-looking areas, and tell the patient what they should discuss with their doctor. " +
    "Do NOT make definitive diagnoses. Plain prose only — no bullet points, no asterisks, no markdown. " +
    'Speak directly to the patient using "your". Keep the response under 350 words.',

  mri:
    "You are a medical imaging assistant. A patient has uploaded an MRI scan. " +
    "Describe what is visible in simple language a patient can understand. " +
    "Note any areas that appear unusual and what they might suggest, without making a definitive diagnosis. " +
    "Tell the patient what they should bring up with their doctor. " +
    "Plain prose only — no bullet points, no asterisks, no markdown. " +
    'Speak directly to the patient using "your". Keep the response under 350 words.',

  ecg:
    "You are a cardiac assistant. A patient has uploaded an ECG/EKG. " +
    "Analyse the heart rhythm and describe any notable patterns in simple language. " +
    "Mention the heart rate if you can estimate it and flag any findings the patient should discuss with their doctor. " +
    "Do NOT make definitive diagnoses. Plain prose only — no bullet points, no asterisks, no markdown. " +
    'Speak directly to the patient using "your". Keep the response under 350 words.',

  ct:
    "You are a radiology assistant. A patient has uploaded a CT scan. " +
    "Describe the findings visible in the image in patient-friendly language. " +
    "Note any areas that appear abnormal and what follow-up may be needed, without making a definitive diagnosis. " +
    "Plain prose only — no bullet points, no asterisks, no markdown. " +
    'Speak directly to the patient using "your". Keep the response under 350 words.',

  report:
    "You are an expert medical analyst. A patient has uploaded a medical report and wants to understand the most important takeaways. " +
    "Your job is NOT to read or repeat the report — your job is to ANALYSE it and surface what actually matters. " +
    "First, identify the type and purpose of the report in one sentence. " +
    "Second, highlight ONLY the clinically significant findings — abnormal values, confirmed diagnoses, critical markers, or anything that deviates from normal ranges. Skip all normal or unremarkable results entirely. " +
    "Third, flag anything the patient should act on: follow-up tests, lifestyle changes, medications mentioned, or results that need a doctor's attention. " +
    "Fourth, close with a single plain-language bottom line the patient can remember. " +
    "Plain prose only — no bullet points, no asterisks, no markdown, no numbering. " +
    'Speak directly to the patient using "your". Keep the total response under 350 words. ' +
    "If a value is abnormal, say whether it is high or low and briefly explain what that generally means in simple terms.",

  default:
    "You are a medical assistant. Analyse this medical document or image and provide a clear, patient-friendly summary of the key information. " +
    "Highlight any findings that the patient should be aware of and what they should discuss with their doctor. " +
    "Plain prose only — no bullet points, no asterisks, no markdown. " +
    'Speak directly to the patient using "your". Keep the response under 350 words.',
};

// ─── System prompts (Hinglish) per document type ──────────────────────────────

const SYSTEM_PROMPTS_HI: Record<DocumentType, string> = {
  xray:
    "You are a radiology assistant explaining an X-ray in simple Hinglish — a natural mix of Hindi and English the way educated Indians speak daily. " +
    "First, identify identify which body part is shown in the image. Then, describe what the X-ray shows, mention any visible abnormalities in simple language, " +
    "and tell the patient what to discuss with their doctor. " +
    "Do NOT make definitive diagnoses. Plain conversational prose only — no bullet points, no asterisks, no markdown. " +
    'Patient se directly "aap / aapka / aapki" use karke baat karo. Total response 350 words se kam rakho.',

  mri:
    "You are a medical imaging assistant explaining an MRI in simple Hinglish — a natural mix of Hindi and English the way educated Indians speak daily. " +
    "Describe what the MRI shows, highlight any areas that look unusual, and tell the patient what to ask their doctor. " +
    "Do NOT make definitive diagnoses. Plain conversational prose only — no bullet points, no asterisks, no markdown. " +
    'Patient se directly "aap / aapka / aapki" use karke baat karo. Total response 350 words se kam rakho.',

  ecg:
    "You are a cardiac assistant explaining an ECG/EKG in simple Hinglish — a natural mix of Hindi and English the way educated Indians speak daily. " +
    "Describe the heart rhythm, estimate heart rate if visible, and flag anything the patient should discuss with their doctor. " +
    "Do NOT make definitive diagnoses. Plain conversational prose only — no bullet points, no asterisks, no markdown. " +
    'Patient se directly "aap / aapka / aapki" use karke baat karo. Total response 350 words se kam rakho.',

  ct:
    "You are a radiology assistant explaining a CT scan in simple Hinglish — a natural mix of Hindi and English the way educated Indians speak daily. " +
    "Describe what the CT shows, note any abnormal areas, and tell the patient what follow-up might be needed. " +
    "Do NOT make definitive diagnoses. Plain conversational prose only — no bullet points, no asterisks, no markdown. " +
    'Patient se directly "aap / aapka / aapki" use karke baat karo. Total response 350 words se kam rakho.',

  report:
    "You are a friendly medical expert explaining a patient's report in simple Hinglish — a natural mix of Hindi and English the way educated Indians actually speak in daily life. " +
    "Your job is NOT to read the report — ANALYSE it and tell the patient only what truly matters. " +
    "CRITICAL LANGUAGE RULES: Write in conversational Hinglish. Use short, easy Hindi words mixed freely with common English medical terms. " +
    'Never use formal or literary Hindi words that people don\'t use in everyday speech (avoid words like "नैदानिक", "अनुवर्ती", "संकेतक" — instead say things like "important finding hai", "follow-up karna hoga", "dhyan dena hoga"). ' +
    "ABBREVIATION RULE: Never say any abbreviation or short form. Always say the full name (e.g. never say CBC — say Complete Blood Count; never say BP — say Blood Pressure). " +
    "First, one sentence mein batao ki yeh kaun si report hai. " +
    "Second, sirf woh findings batao jo abnormal hain — normal results skip karo. Agar koi value high ya low hai toh clearly batao aur simple mein samjhao. " +
    "Third, batao patient ko ab kya karna chahiye — follow-up test, doctor se milna, lifestyle change, ya koi dawai. " +
    "Fourth, ek simple bottom line do jo patient yaad rakh sake. " +
    'Plain conversational prose only — no bullet points, no asterisks, no markdown. Patient se directly "aap / aapka / aapki" use karke baat karo. Total 350 words se kam rakho.',

  default:
    "You are a medical assistant explaining a medical document in simple Hinglish — a natural mix of Hindi and English the way educated Indians speak daily. " +
    "Provide a clear, patient-friendly summary of the key findings and what the patient should discuss with their doctor. " +
    'Plain conversational prose only — no bullet points, no asterisks, no markdown. Patient se directly "aap / aapka / aapki" use karke baat karo. Total response 350 words se kam rakho.',
};

// ─── Map report_type DB value → DocumentType for analysis prompts ─────────────

/** Maps the `report_type` TEXT value from DB to the DocumentType used for prompts. */
function resolveDocumentType(dbReportType: string | null | undefined): DocumentType {
  switch (dbReportType) {
    case "xray":
      return "xray";
    case "mri":
      return "mri";
    case "ecg":
      return "ecg";
    case "ct":
      return "ct";
    case "blood_test":
    case "urine_test":
      return "report"; // text-based analysis
    default:
      return "default";
  }
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractTextFromPDF(reportUrl: string): Promise<string> {
  const res : any = await fetch(reportUrl);
  if (!res.ok) {
    throw new AppError(
      `Failed to fetch report PDF: ${res.status} ${res.statusText}`,
      502,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const parsed = await pdfParse(buffer);
  return parsed.text?.trim() ?? "";
}

/** Fetches the file at a URL and returns it as a base64 data URI. */
async function fetchAsBase64DataUri(fileUrl: string): Promise<{ dataUri: string; mimeType: string }> {
  const res: any = await fetch(fileUrl);
  if (!res.ok) {
    throw new AppError(
      `Failed to fetch report file: ${res.status} ${res.statusText}`,
      502,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
  return { dataUri, mimeType: contentType };
}

// ─── Image modality analyser — Llama 4 Scout via Groq ───────────────────────
// Handles: xray | mri | ecg | ct
// Uses base64 Data URI as Groq vision models expect images in that format.

async function analyseImageWithGroq(
  imageUrl: string,
  docType: DocumentType,
  lang: Lang,
): Promise<string> {
  const systemPrompt =
    lang === "hi" ? SYSTEM_PROMPTS_HI[docType] : SYSTEM_PROMPTS_EN[docType];

  console.log(`[reportSpeak] Fetching file for Groq vision: ${imageUrl}`);
  const { dataUri } = await fetchAsBase64DataUri(imageUrl);

  console.log(`[reportSpeak] Calling Groq (Llama 4 Scout) for modality: ${docType}`);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: systemPrompt,
            },
            {
              type: "image_url",
              image_url: { url: dataUri },
            },
          ],
        },
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.1,
      max_completion_tokens: 1024,
    });

    const reply = chatCompletion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) throw new AppError("Groq returned an empty response", 502);

    console.log("[reportSpeak] Groq reply summary:", reply.slice(0, 100), "...");
    return reply;
  } catch (err: any) {
    console.error("[reportSpeak] Groq analysis error:", err?.message || err);
    throw new AppError("Vision analysis service returned an error", 502);
  }
}

// ─── Text-based report analyser — Trinity via OpenRouter ─────────────────────
// Handles: report | default (PDF with extractable text)

async function analyseTextWithTrinity(
  extractedText: string,
  reportName: string,
  docType: DocumentType,
  lang: Lang,
): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY.trim();
  const systemPrompt =
    lang === "hi" ? SYSTEM_PROMPTS_HI[docType] : SYSTEM_PROMPTS_EN[docType];

  // Truncate to stay within token limits (~6 000 chars ≈ ~1 500 tokens)
  const truncated = extractedText.slice(0, 6000);

  console.log(`[reportSpeak] Calling Trinity for text-based report (${docType})`);

  const res : any = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://medinexus.app",
      "X-Title": "mediNexus Report Audio Analysis",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      messages: [
        { role: "system" as const, content: systemPrompt },
        {
          role: "user" as const,
          content: `Report name: ${reportName}\n\nFull report content:\n${truncated}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[reportSpeak] Trinity error:", errText);
    throw new AppError("AI analysis service returned an error", 502);
  }

  const data = (await res.json()) as any;
  const reply: string =
    data?.choices?.[0]?.message?.content?.trim() ??
    "Analysis could not be generated. Please try again.";
  console.log("[reportSpeak] Trinity reply:", reply.slice(0, 120), "...");
  return reply;
}

// ─── Unified analysis dispatcher ──────────────────────────────────────────────

async function analyseReport(
  reportUrl: string,
  reportName: string,
  docType: DocumentType,
  lang: Lang,
): Promise<string> {
  if (IMAGE_MODALITIES.has(docType)) {
    // ── Image modality: LLama 4 Scout via Groq ───────────────────────
    return analyseImageWithGroq(reportUrl, docType, lang);
  } else {
    // ── Text-based report: extract PDF text → Trinity ─────────────────
    console.log(`[reportSpeak] Text-based report (${docType}) — extracting PDF text`);
    const extractedText = await extractTextFromPDF(reportUrl);

    if (extractedText.length > 0) {
      console.log(`[reportSpeak] Extracted ${extractedText.length} chars — sending to Trinity`);
      return analyseTextWithTrinity(extractedText, reportName, docType, lang);
    }

    // No text found (scanned / image-only PDF) — use Groq vision as fallback
    console.warn(
      "[reportSpeak] No extractable text in PDF, falling back to Groq vision",
    );
    return analyseImageWithGroq(reportUrl, docType, lang);
  }
}


// ─── Sarvam Bulbul v3 TTS ─────────────────────────────────────────────────────

async function textToSpeech(
  analysisText: string,
  lang: Lang,
): Promise<{ audioBase64: string; audioMime: string }> {
  const apiKey = env.SARVAM_API_KEY.trim();

  const res: any= await fetch("https://api.sarvam.ai/text-to-speech/stream", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: analysisText,
      target_language_code: lang === "hi" ? "hi-IN" : "en-IN",
      speaker: "shubh",
      model: "bulbul:v3",
      pace: 1.0,
      speech_sample_rate: 22050,
      output_audio_codec: "mp3",
      enable_preprocessing: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new AppError(`Sarvam TTS failed: ${txt}`, 502);
  }

  if (!res.body) {
    throw new AppError("Sarvam TTS returned an empty stream", 502);
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) chunks.push(Buffer.from(value));
  }

  const audioBuffer = Buffer.concat(chunks);
  if (audioBuffer.length === 0) {
    throw new AppError("Sarvam TTS returned no audio bytes", 502);
  }

  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
  const audioMime = contentType?.startsWith("audio/") ? contentType : "audio/mpeg";

  return { audioBase64: audioBuffer.toString("base64"), audioMime };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function reportSpeak(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new AppError("Not authenticated", 401);

    const { reportId: reportIdParam } = req.params;
    if (!reportIdParam) throw new BadRequestError("reportId param is required");
    const reportId = Array.isArray(reportIdParam)
      ? reportIdParam[0]
      : reportIdParam;

    const rawLang = req.body?.lang;
    const lang: Lang = rawLang === "hi" ? "hi" : "en";

    // ── 1. Verify patient owns the report ───────────────────────────────
    const patient = await requirePatient(userId);

    const { data: report, error: reportErr } = await supabaseAdmin
      .from("patient_reports")
      .select("id, report_name, report_url, patient_id, report_type")
      .eq("id", reportId)
      .single();

    if (reportErr || !report) throw new NotFoundError("Report not found");
    if (report.patient_id !== patient.id) throw new AppError("Forbidden", 403);
    if (!report.report_url)
      throw new BadRequestError("Report has no associated file URL");

    // Determine doc type: prefer DB report_type, fall back to request body, then 'default'
    const rawDocType = req.body?.document_type as string | undefined;
    const validDocTypes: DocumentType[] = ["xray", "mri", "ecg", "ct", "report", "default"];
    const dbDocType = resolveDocumentType(report.report_type);
    const docType: DocumentType =
      dbDocType !== "default"
        ? dbDocType
        : rawDocType && validDocTypes.includes(rawDocType as DocumentType)
          ? (rawDocType as DocumentType)
          : "default";

    console.log(`[reportSpeak] report_type from DB: "${report.report_type}", resolved docType: "${docType}"`);

    // ── 2. Check DB cache (report_analysis_cache) ───────────────────────
    const { data: cached, error: cacheErr } = await (supabaseAdmin as any)
      .from("report_analysis_cache")
      .select("analysis_text, audio_base64, audio_mime")
      .eq("report_id", reportId)
      .eq("lang", lang)
      .eq("doc_type", docType)
      .maybeSingle();

    const isAudioValid =
      cached?.audio_base64 &&
      cached.audio_base64.length > 500 &&
      !cached.audio_base64.startsWith("SUQzBAAAAAAAI1");

    if (!cacheErr && cached && isAudioValid) {
      console.log(`[reportSpeak] Cache hit with valid audio for report ${reportId} (lang=${lang}, docType=${docType})`);
      sendSuccess(
        res,
        {
          audio_base64: cached.audio_base64,
          audio_mime: cached.audio_mime || "audio/mpeg",
          analysis_text: cached.analysis_text,
        },
        "Report audio (cached)",
      );
      return;
    }

    // ── 3. Analyse (LLM) if not already analysed ───────────────────────
    let analysisText = cached?.analysis_text;
    if (!analysisText) {
      console.log(
        `[reportSpeak] Analysing report ${reportId} (type=${docType}, lang=${lang})`,
      );
      analysisText = await analyseReport(
        report.report_url,
        report.report_name,
        docType,
        lang,
      );
      console.log(
        `[reportSpeak] Analysis complete (${analysisText.length} chars)`,
      );
    }

    // ── 4. Generate TTS ──────────────────────────────────────────────────
    let audioBase64: string | null = null;
    let audioMime = "audio/mpeg";

    try {
      console.log(
        `[reportSpeak] Generating TTS for report ${reportId} (lang=${lang})`,
      );
      const ttsResult = await textToSpeech(analysisText, lang);
      audioBase64 = ttsResult.audioBase64;
      audioMime = ttsResult.audioMime;
    } catch (ttsErr: any) {
      console.warn(
        `[reportSpeak] TTS generation error (will fallback to browser speech):`,
        ttsErr?.message || ttsErr,
      );
    }

    // ── 5. Store / Update in DB cache ────────────────────────────────────
    const { error: insertCacheErr } = await (supabaseAdmin as any)
      .from("report_analysis_cache")
      .upsert(
        {
          report_id: reportId,
          lang,
          doc_type: docType,
          analysis_text: analysisText,
          audio_base64: audioBase64,
          audio_mime: audioMime,
        },
        { onConflict: "report_id,lang,doc_type" },
      );

    if (insertCacheErr) {
      console.error("[reportSpeak] Failed to cache analysis:", insertCacheErr.message);
    } else {
      console.log(`[reportSpeak] Cached analysis for report ${reportId} (lang=${lang}, docType=${docType})`);
    }

    // ── 6. Respond ─────────────────────────────────────────────────────
    sendSuccess(
      res,
      {
        audio_base64: audioBase64,
        audio_mime: audioMime,
        analysis_text: analysisText,
      },
      audioBase64 ? "Report audio generated" : "Report analysis text generated",
    );
  } catch (err) {
    next(err);
  }
}
