import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../config/supabase.js";
import { sendSuccess } from "../../utils/response.js";
import {
  AppError,
  NotFoundError,
  BadRequestError,
} from "../../utils/errors.js";
import { requireDoctor } from "../../utils/lookup.js";

// ─── Types ───────────────────────────────────────────────────────────

interface PrescriptionItemInput {
  medicine_id: string;
  dosage: string;
  frequency: string;
  duration: string;
  doctor_comment?: string;
}

interface CreatePrescriptionBody {
  illness_description?: string;
  items: PrescriptionItemInput[];
}

// ─── AI Prescription Insights ─────────────────────────────────────────────────

interface AIInsightsRequestBody {
  illnessDescription: string;
  currentMedicineIds: string[];
  patientAllergies?: string | null;
  patientBloodGroup?: string | null;
}

interface AISuggestion {
  medicine_name: string;
  therapeutic_class: string | null;
  reason: string;
  co_prescription_count: number;
}

interface AIInsightsResponse {
  suggestions: AISuggestion[];
  interactions: {
    medicines: string[];
    warning: string;
    severity: "low" | "medium" | "high";
  }[];
  allergyWarnings: { medicine: string; allergen: string; warning: string }[];
  disclaimer: string;
}

/**
 * POST /api/doctors/me/prescriptions/ai-insights
 * Accepts the current prescription context (illness, medicines already added,
 * patient allergies) and returns AI-powered suggestions, interaction flags,
 * and allergy warnings — all anonymized, no patient PII sent to the LLM.
 */
export async function getAIInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authenticated user not found", 401);

    await requireDoctor(userId); // verify caller is a registered doctor

    const {
      illnessDescription,
      currentMedicineIds = [],
      patientAllergies,
    } = req.body as AIInsightsRequestBody;

    if (!illnessDescription?.trim()) {
      throw new BadRequestError("illnessDescription is required");
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new AppError("AI service is not configured", 503);
    }

    // ── 1. Fetch full details for medicines already on the Rx ────────────────
    let currentMedicines: {
      medicine_name: string;
      composition: string | null;
      therapeutic_class: string | null;
      side_effects: string | null;
    }[] = [];
    if (currentMedicineIds.length > 0) {
      const { data: meds } = await (supabaseAdmin as any)
        .from("medicines")
        .select("medicine_name, composition, therapeutic_class, side_effects")
        .in("id", currentMedicineIds);
      currentMedicines = meds ?? [];
    }

    // ── 2. Anonymized population lookup ─────────────────────────────────────
    // Extract keywords from illness description (strip stop words)
    const stopwords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "for",
      "of",
      "in",
      "on",
      "with",
      "due",
      "to",
      "is",
      "are",
      "was",
      "patient",
      "has",
      "have",
      "presents",
      "complains",
      "history",
      "chronic",
      "acute",
      "mild",
      "moderate",
      "severe",
      "pain",
      "complaint",
      "fever",
    ]);
    const keywords = illnessDescription
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w))
      .slice(0, 4);

    let populationData: {
      medicine_name: string;
      therapeutic_class: string | null;
      co_prescription_count: number;
    }[] = [];

    if (keywords.length > 0) {
      // Find prescriptions with a similar illness description
      const ilikeConditions = keywords
        .map((k) => `illness_description.ilike.%${k}%`)
        .join(",");
      const { data: matchingRxs } = await (supabaseAdmin as any)
        .from("prescriptions")
        .select("id")
        .or(ilikeConditions)
        .limit(500);

      const rxIds: string[] = (matchingRxs ?? []).map((r: any) => r.id);

      if (rxIds.length > 0) {
        // Get medicines from those prescriptions, excluding what's already on the Rx
        const { data: coItems } = await (supabaseAdmin as any)
          .from("prescription_items")
          .select("medicine_id, medicines(medicine_name, therapeutic_class)")
          .in("prescription_id", rxIds)
          .limit(2000);

        // Aggregate counts
        const countMap: Record<
          string,
          {
            medicine_name: string;
            therapeutic_class: string | null;
            count: number;
          }
        > = {};
        for (const item of coItems ?? []) {
          if (currentMedicineIds.includes(item.medicine_id)) continue; // skip already-added
          const name: string = item.medicines?.medicine_name ?? "";
          if (!name) continue;
          if (!countMap[item.medicine_id]) {
            countMap[item.medicine_id] = {
              medicine_name: name,
              therapeutic_class: item.medicines?.therapeutic_class ?? null,
              count: 0,
            };
          }
          countMap[item.medicine_id].count++;
        }

        populationData = Object.values(countMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
          .map((v) => ({
            medicine_name: v.medicine_name,
            therapeutic_class: v.therapeutic_class,
            co_prescription_count: v.count,
          }));
      }
    }

    // ── 3. Build the prompt — strictly anonymized ────────────────────────────
    const currentRxText =
      currentMedicines.length > 0
        ? currentMedicines
            .map(
              (m) =>
                `- ${m.medicine_name}${m.therapeutic_class ? ` (${m.therapeutic_class})` : ""}${m.composition ? ` [${m.composition}]` : ""}`,
            )
            .join("\n")
        : "None yet";

    const populationText =
      populationData.length > 0
        ? populationData
            .map(
              (m) =>
                `- ${m.medicine_name}${m.therapeutic_class ? ` (${m.therapeutic_class})` : ""} — co-prescribed ${m.co_prescription_count}× in similar cases`,
            )
            .join("\n")
        : "No population data available";

    const allergiesText = patientAllergies?.trim() || "None reported";

    const systemPrompt = `You are a clinical decision support assistant integrated into a hospital prescription system.
Your role is to help doctors by surfacing relevant drug information, potential interactions, and commonly co-prescribed medicines.
You never mention patient names or any identifying information.
Always respond ONLY in valid JSON — no markdown, no prose outside the JSON.`;

    const userPrompt = `A doctor is writing a prescription. Analyze the following clinical context and return structured insights.

DIAGNOSIS / ILLNESS:
${illnessDescription.trim()}

CURRENT PRESCRIPTION (already added medicines):
${currentRxText}

COMMONLY CO-PRESCRIBED in similar cases on this platform (anonymized population data):
${populationText}

PATIENT KNOWN ALLERGIES: ${allergiesText}

Return a JSON object with exactly this shape:
{
  "suggestions": [
    {
      "medicine_name": "<name>",
      "therapeutic_class": "<class or null>",
      "reason": "<1 sentence why this is relevant>",
      "co_prescription_count": <number from population data, or 0>
    }
  ],
  "interactions": [
    {
      "medicines": ["<medicine A>", "<medicine B>"],
      "warning": "<plain English description of the interaction>",
      "severity": "low" | "medium" | "high"
    }
  ],
  "allergyWarnings": [
    {
      "medicine": "<medicine name already on Rx>",
      "allergen": "<overlapping allergen>",
      "warning": "<plain English warning>"
    }
  ],
  "disclaimer": "AI suggestions are for reference only. Clinical judgment applies."
}

Rules:
- suggestions: only recommend medicines NOT already on the current prescription. Limit to top 5.
- interactions: only flag interactions between medicines that ARE already on the current prescription. Omit if current prescription is empty or has only 1 medicine.
- allergyWarnings: only flag if a medicine on the current prescription's composition overlaps with the known allergies. Omit if allergies are "None reported".
- If there is nothing to report for a section, return an empty array.
- Never invent medicine names. Only use names from the population data or well-known clinical knowledge.
- Keep all text brief and clinical.`;

    // ── 4. Call OpenRouter with arcee-ai/trinity-large-preview:free ─────────
    const openRouterRes = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://medinexus.app",
          "X-Title": "mediNexus Clinical Decision Support",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          reasoning: { enabled: true },
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 1200,
        }),
      },
    );

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error("[getAIInsights] OpenRouter error:", errText);
      throw new AppError("AI service returned an error", 502);
    }

    const openRouterData = (await openRouterRes.json()) as any;
    const rawContent: string =
      openRouterData?.choices?.[0]?.message?.content ?? "{}";

    let insights: AIInsightsResponse;
    try {
      // Strip potential markdown fences if model ignores response_format
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      insights = {
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.slice(0, 5)
          : [],
        interactions: Array.isArray(parsed.interactions)
          ? parsed.interactions
          : [],
        allergyWarnings: Array.isArray(parsed.allergyWarnings)
          ? parsed.allergyWarnings
          : [],
        disclaimer:
          parsed.disclaimer ??
          "AI suggestions are for reference only. Clinical judgment applies.",
      };
    } catch (parseErr) {
      console.error(
        "[getAIInsights] JSON parse error:",
        parseErr,
        "raw:",
        rawContent,
      );
      // Return empty but valid response rather than a 500
      insights = {
        suggestions: [],
        interactions: [],
        allergyWarnings: [],
        disclaimer:
          "AI suggestions are for reference only. Clinical judgment applies.",
      };
    }

    sendSuccess(res, { insights }, "AI insights generated");
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/medicines/search?q=<term>
 * Ranked full-text search on medicines using a GIN-indexed tsvector column.
 * Falls back to direct text search / ilike when the SQL RPC is unavailable.
 */
export async function searchMedicines(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = (req.query["q"] as string | undefined)?.trim();
    if (!q || q.length < 2) {
      throw new BadRequestError(
        "Query parameter q must be at least 2 characters",
      );
    }

    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc(
      "search_medicines",
      { p_query: q, p_limit: 25 },
    );

    if (!rpcError) {
      sendSuccess(res, { medicines: rpcData ?? [] }, "Medicines retrieved");
      return;
    }

    console.warn(
      "[searchMedicines] RPC search failed, falling back to direct FTS:",
      rpcError.message,
    );

    // Fallback: FTS directly on tsvector column
    const { data: ftsData, error: ftsError } = await supabaseAdmin
      .from("medicines")
      .select(
        "id, medicine_name, composition, therapeutic_class, chemical_class, uses, side_effects, substitutes, description, image_url",
      )
      .textSearch("search_vector", q, { type: "websearch", config: "english" })
      .limit(25);

    // If FTS also fails, fall back to ilike
    if (ftsError) {
      console.warn(
        "[searchMedicines] FTS failed, falling back to ilike:",
        ftsError.message,
      );
      const { data, error } = await supabaseAdmin
        .from("medicines")
        .select(
          "id, medicine_name, composition, therapeutic_class, chemical_class, uses, side_effects, substitutes, description, image_url",
        )
        .or(
          `medicine_name.ilike.%${q}%,uses.ilike.%${q}%,description.ilike.%${q}%,therapeutic_class.ilike.%${q}%`,
        )
        .limit(25);

      if (error) {
        console.error(
          "[searchMedicines] ilike fallback failed:",
          error.message,
        );
        throw new AppError("Failed to search medicines", 500);
      }
      sendSuccess(res, { medicines: data ?? [] }, "Medicines retrieved");
      return;
    }

    sendSuccess(res, { medicines: ftsData ?? [] }, "Medicines retrieved");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/doctors/me/appointments/:appointmentId/prescriptions
 * Creates a prescription with multiple medicine items for an appointment.
 */
export async function createPrescription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authenticated user not found", 401);

    const doctor = await requireDoctor(userId);
    const { appointmentId } = req.params as { appointmentId: string };
    const { illness_description, items } = req.body as CreatePrescriptionBody;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestError("At least one medicine item is required");
    }

    // Verify the appointment belongs to this doctor
    const { data: appointment, error: apptError } = await supabaseAdmin
      .from("appointments")
      .select("id, doctor_id, patient_id, status")
      .eq("id", appointmentId)
      .eq("doctor_id", doctor.id)
      .single();

    if (apptError || !appointment) {
      throw new NotFoundError("Appointment not found");
    }

    // Check if prescription already exists for this appointment
    const { data: existingRx } = await supabaseAdmin
      .from("prescriptions")
      .select("id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (existingRx) {
      throw new BadRequestError(
        "A prescription already exists for this appointment",
      );
    }

    // Create the prescription header
    const { data: prescription, error: rxError } = await supabaseAdmin
      .from("prescriptions")
      .insert({
        appointment_id: appointmentId,
        doctor_id: doctor.id,
        patient_id: appointment.patient_id,
        illness_description: illness_description ?? null,
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (rxError || !prescription) {
      console.error(
        "[createPrescription] prescription insert failed:",
        rxError?.message,
      );
      throw new AppError("Failed to create prescription", 500);
    }

    // Insert all medicine items
    const prescriptionItems = items.map((item) => ({
      prescription_id: prescription.id,
      medicine_id: item.medicine_id,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      doctor_comment: item.doctor_comment ?? null,
    }));

    const { data: insertedItems, error: itemsError } = await supabaseAdmin
      .from("prescription_items")
      .insert(prescriptionItems)
      .select();

    if (itemsError) {
      console.error(
        "[createPrescription] items insert failed:",
        itemsError.message,
      );
      // Roll back prescription header
      await supabaseAdmin
        .from("prescriptions")
        .delete()
        .eq("id", prescription.id);
      throw new AppError("Failed to create prescription items", 500);
    }

    // Auto-complete the appointment now that a prescription has been issued
    const { error: completeError } = await supabaseAdmin
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", appointmentId);

    if (completeError) {
      // Non-fatal: log but don't fail — prescription was created successfully
      console.error(
        "[createPrescription] auto-complete appointment failed:",
        completeError.message,
      );
    } else {
      // Write status log entry
      const { error: logError } = await supabaseAdmin
        .from("appointment_status_log")
        .insert({
          appointment_id: appointmentId,
          old_status: appointment.status,
          new_status: "completed",
          changed_by: userId,
          changed_at: new Date().toISOString(),
        });
      if (logError) {
        console.error(
          "[createPrescription] status log insert failed:",
          logError.message,
        );
      }
    }

    sendSuccess(
      res,
      { prescription: { ...prescription, prescription_items: insertedItems } },
      "Prescription created",
      201,
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/prescriptions
 * Returns all prescriptions issued by the doctor.
 */
export async function listDoctorPrescriptions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authenticated user not found", 401);

    const doctor = await requireDoctor(userId);

    const { data, error } = await supabaseAdmin
      .from("prescriptions")
      .select(
        `id, appointment_id, doctor_id, patient_id, illness_description, issued_at, pdf_url,
         patients ( full_name, dob ),
         prescription_items (
           id, prescription_id, medicine_id,
           dosage, frequency, duration, doctor_comment,
           medicines ( medicine_name, therapeutic_class )
         )`,
      )
      .eq("doctor_id", doctor.id)
      .order("issued_at", { ascending: false });

    if (error) {
      console.error("[listDoctorPrescriptions] query failed:", error.message);
      throw new AppError("Failed to fetch prescriptions", 500);
    }

    sendSuccess(res, { prescriptions: data ?? [] }, "Prescriptions retrieved");
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/prescriptions/:id
 * Returns a single prescription with its items and medicines.
 */
export async function getDoctorPrescription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authenticated user not found", 401);

    const doctor = await requireDoctor(userId);
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from("prescriptions")
      .select(
        `id, appointment_id, doctor_id, patient_id, illness_description, issued_at, pdf_url,
         patients ( full_name, dob, blood_group, known_allergies ),
         doctors ( full_name, specialisation, qualifications, registration_number, department ),
         appointments (
           hospital_id,
           appointment_slots ( slot_start ),
           hospitals ( name, city )
         ),
         prescription_items (
           id, prescription_id, medicine_id,
           dosage, frequency, duration, doctor_comment,
           medicines ( medicine_name, composition, therapeutic_class )
         )`,
      )
      .eq("id", id)
      .eq("doctor_id", doctor.id)
      .single();

    if (error || !data) {
      throw new NotFoundError("Prescription not found");
    }

    sendSuccess(res, { prescription: data }, "Prescription retrieved");
  } catch (err) {
    next(err);
  }
}
