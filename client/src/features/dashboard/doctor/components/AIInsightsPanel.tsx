import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Plus,
  ShieldAlert,
  Info,
} from 'lucide-react';
import {
  doctorService,
  type AIInsights,
  type AIInsightSuggestion,
  type AIInteraction,
  type AIAllergyWarning,
} from '@/services/doctor.service';
import type { RxItem } from './RxPad';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIInsightsPanelProps {
  illnessDescription: string;
  rxItems: RxItem[];
  patientAllergies: string | null;
  patientBloodGroup: string | null;
  /** Called when doctor clicks "+ Add" on a suggestion. Receives the medicine name so the parent can search & add it. */
  onAddSuggestion: (medicineName: string) => void;
}

// ─── Severity badge ───────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

// ─── Sub-section component ────────────────────────────────────────────────────

const SectionHeader = ({ icon, label, count, accent }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  accent: string;
}) => (
  <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 ${accent}`}>
    {icon}
    {label}
    {count > 0 && (
      <span className="ml-auto font-normal text-[10px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">
        {count}
      </span>
    )}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const AIInsightsPanel = ({
  illnessDescription,
  rxItems,
  patientAllergies,
  patientBloodGroup,
  onAddSuggestion,
}: AIInsightsPanelProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track what was last fetched to avoid redundant calls
  const lastFetchKey = useRef<string>('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a stable cache key from the current context
  const buildKey = useCallback(() => {
    const ids = rxItems.map((r) => r.medicine.id).sort().join(',');
    return `${illnessDescription.trim()}__${ids}__${patientAllergies ?? ''}`;
  }, [illnessDescription, rxItems, patientAllergies]);

  const fetchInsights = useCallback(async () => {
    const key = buildKey();
    if (!illnessDescription.trim()) {
      setInsights(null);
      setError(null);
      lastFetchKey.current = '';
      return;
    }
    if (key === lastFetchKey.current) return; // no change, skip

    setLoading(true);
    setError(null);
    lastFetchKey.current = key;

    try {
      const res = await doctorService.getAIInsights({
        illnessDescription: illnessDescription.trim(),
        currentMedicineIds: rxItems.map((r) => r.medicine.id),
        patientAllergies,
        patientBloodGroup,
      });
      setInsights((res as any).data?.insights ?? null);
      // Auto-open the panel when new insights arrive (if there's something to show)
      const data = (res as any).data?.insights as AIInsights | null;
      if (
        data &&
        (data.suggestions.length > 0 || data.interactions.length > 0 || data.allergyWarnings.length > 0)
      ) {
        setOpen(true);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Could not load AI insights';
      setError(msg);
      // Don't reset lastFetchKey — avoid hammering the API on transient errors
    } finally {
      setLoading(false);
    }
  }, [buildKey, illnessDescription, rxItems, patientAllergies, patientBloodGroup]);

  // Debounced trigger: fires 900ms after illness description or rx items change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(fetchInsights, 900);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [fetchInsights]);

  const hasAllergyWarnings = (insights?.allergyWarnings.length ?? 0) > 0;
  const hasInteractions = (insights?.interactions.length ?? 0) > 0;
  const hasSuggestions = (insights?.suggestions.length ?? 0) > 0;
  const hasAnything = hasAllergyWarnings || hasInteractions || hasSuggestions;

  // Urgency indicator for the collapsed header
  const headerAccent = hasAllergyWarnings
    ? 'text-red-600 dark:text-red-400'
    : hasInteractions
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-primary';

  const headerBg = hasAllergyWarnings
    ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30'
    : hasInteractions
    ? 'border-yellow-200 bg-yellow-50/60 dark:border-yellow-900 dark:bg-yellow-950/30'
    : 'border-primary/20 bg-primary/5';

  // Don't render at all until the user has typed a diagnosis
  if (!illnessDescription.trim() && !loading && !insights) return null;

  return (
    <div className={`mx-5 mb-3 rounded-xl border transition-colors ${open ? headerBg : 'border-border bg-card'}`}>
      {/* ── Header / Toggle ───────────────────────────────────────────────── */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${headerAccent}`}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          ) : hasAllergyWarnings ? (
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
          ) : hasInteractions ? (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold truncate">
            {loading
              ? 'AI is analyzing…'
              : hasAllergyWarnings
              ? `AI — ${insights!.allergyWarnings.length} allergy alert${insights!.allergyWarnings.length > 1 ? 's' : ''}`
              : hasInteractions
              ? `AI — ${insights!.interactions.length} interaction${insights!.interactions.length > 1 ? 's' : ''} flagged`
              : hasSuggestions
              ? `AI — ${insights!.suggestions.length} suggestion${insights!.suggestions.length > 1 ? 's' : ''}`
              : error
              ? 'AI insights unavailable'
              : 'AI insights ready'}
          </span>
        </div>

        {/* Urgent badges visible even when collapsed */}
        {!open && !loading && hasAnything && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasAllergyWarnings && (
              <span className="text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 rounded-full px-1.5 py-0.5">
                Allergy
              </span>
            )}
            {hasInteractions && (
              <span className="text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 rounded-full px-1.5 py-0.5">
                Interaction
              </span>
            )}
          </div>
        )}

        <div className="text-muted-foreground flex-shrink-0">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-inherit max-h-56 overflow-y-auto">

          {/* Loading skeleton */}
          {loading && !insights && (
            <div className="pt-3 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <p className="pt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </p>
          )}

          {/* ── Allergy warnings (highest priority) ───────────────────── */}
          {hasAllergyWarnings && (
            <div className="pt-3">
              <SectionHeader
                icon={<ShieldAlert className="h-3 w-3" />}
                label="Allergy Alerts"
                count={insights!.allergyWarnings.length}
                accent="text-red-600 dark:text-red-400"
              />
              <div className="space-y-2">
                {insights!.allergyWarnings.map((w: AIAllergyWarning, i: number) => (
                  <div key={i} className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5 text-xs">
                    <p className="font-semibold text-red-700 dark:text-red-300">{w.medicine}</p>
                    <p className="text-red-600 dark:text-red-400 mt-0.5">{w.warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Drug interactions ──────────────────────────────────────── */}
          {hasInteractions && (
            <div className={hasAllergyWarnings ? '' : 'pt-3'}>
              <SectionHeader
                icon={<AlertTriangle className="h-3 w-3" />}
                label="Drug Interactions"
                count={insights!.interactions.length}
                accent="text-yellow-600 dark:text-yellow-400"
              />
              <div className="space-y-2">
                {insights!.interactions.map((ix: AIInteraction, i: number) => (
                  <div key={i} className={`border rounded-lg p-2.5 text-xs ${SEVERITY_STYLES[ix.severity] ?? SEVERITY_STYLES.low} bg-opacity-30`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-medium">{ix.medicines.join(' + ')}</p>
                      <span className={`text-[10px] capitalize font-semibold px-1.5 py-0.5 rounded-full ${SEVERITY_STYLES[ix.severity]}`}>
                        {ix.severity}
                      </span>
                    </div>
                    <p className="opacity-90">{ix.warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Suggestions ───────────────────────────────────────────── */}
          {hasSuggestions && (
            <div className={hasAllergyWarnings || hasInteractions ? '' : 'pt-3'}>
              <SectionHeader
                icon={<Sparkles className="h-3 w-3" />}
                label="Commonly Co-Prescribed"
                count={insights!.suggestions.length}
                accent="text-primary"
              />
              <div className="space-y-1.5">
                {insights!.suggestions.map((s: AIInsightSuggestion, i: number) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-2 bg-muted/50 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{s.medicine_name}</span>
                        {s.therapeutic_class && (
                          <span className="text-[10px] text-muted-foreground bg-background border rounded-full px-1.5 py-px">
                            {s.therapeutic_class}
                          </span>
                        )}
                        {s.co_prescription_count > 0 && (
                          <span className="text-[10px] text-primary/70">
                            {s.co_prescription_count}× in similar cases
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{s.reason}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddSuggestion(s.medicine_name)}
                      className="flex-shrink-0 flex items-center gap-0.5 text-primary hover:text-primary/80 font-medium text-[11px] mt-0.5 transition-colors"
                      title={`Search for ${s.medicine_name}`}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && insights && !hasAnything && (
            <p className="pt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              No interactions, allergy conflicts, or common co-prescriptions found for this case.
            </p>
          )}

          {/* Disclaimer */}
          {insights && (
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1 border-t border-inherit">
              {insights.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
