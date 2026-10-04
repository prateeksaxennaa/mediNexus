import { useState, useRef, useCallback, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Search, Loader2, GripVertical, Pill, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { doctorService, type MedicineResult } from '@/services/doctor.service';
import { AIInsightsPanel } from './AIInsightsPanel';
import type { RxItem } from './RxPad';

// ─── Draggable Medicine Card ─────────────────────────────────────────────────

interface DraggableMedicineCardProps {
  medicine: MedicineResult;
}

const DraggableMedicineCard = ({ medicine }: DraggableMedicineCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `medicine-${medicine.id}`,
    data: { medicine },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-card border rounded-xl p-3.5 select-none cursor-grab active:cursor-grabbing
        transition-all duration-150
        ${isDragging ? 'shadow-2xl scale-[1.03] ring-2 ring-primary/40' : 'hover:border-primary/40 hover:shadow-sm'}
      `}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className="absolute top-3 right-3 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="pr-6 space-y-1.5">
        <p className="font-medium text-sm leading-tight">{medicine.medicine_name}</p>

        {medicine.therapeutic_class && (
          <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
            {medicine.therapeutic_class}
          </Badge>
        )}

        {medicine.uses && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {medicine.uses}
          </p>
        )}

        {medicine.composition && (
          <p className="text-[10px] text-muted-foreground/60 font-mono truncate">
            {medicine.composition}
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Search medicines from the API */
async function runSearch(q: string): Promise<MedicineResult[]> {
  const res = await doctorService.searchMedicines(q);
  return (res as any).data?.medicines ?? [];
}

/** Extract the most meaningful keyword(s) from an illness description for auto-search. */
function extractSearchQuery(description: string): string {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'with',
    'due', 'to', 'is', 'are', 'was', 'patient', 'has', 'have', 'presents',
    'complains', 'history', 'chronic', 'acute', 'mild', 'moderate', 'severe',
  ]);
  const words = description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));
  // Return up to 3 most relevant words joined
  return words.slice(0, 3).join(' ');
}

// ─── Medicine Search Panel ───────────────────────────────────────────────────

interface MedicineSearchPanelProps {
  illnessDescription: string;
  onIllnessDescriptionChange: (val: string) => void;
  rxItems: RxItem[];
  patientAllergies: string | null;
  patientBloodGroup: string | null;
}

export const MedicineSearchPanel = ({
  illnessDescription,
  onIllnessDescriptionChange,
  rxItems,
  patientAllergies,
  patientBloodGroup,
}: MedicineSearchPanelProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicineResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // 'manual' = doctor typed in search box; 'illness' = auto from diagnosis
  const [searchSource, setSearchSource] = useState<'manual' | 'illness'>('manual');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const illnessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Core search executor ──────────────────────────────────────────────────
  const executeSearch = useCallback(async (q: string, source: 'manual' | 'illness') => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    setSearchSource(source);
    try {
      const meds = await runSearch(q);
      setResults(meds);
      setSearched(true);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Manual search box ─────────────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!q.trim()) {
      // If no manual query, re-derive from illness description
      const derived = extractSearchQuery(illnessDescription);
      if (derived) {
        executeSearch(derived, 'illness');
      } else {
        setResults([]);
        setSearched(false);
      }
      return;
    }

    searchTimer.current = setTimeout(() => executeSearch(q, 'manual'), 300);
  }, [illnessDescription, executeSearch]);

  // ── Illness description → auto-suggest ───────────────────────────────────
  useEffect(() => {
    // Only auto-search from illness if no manual query is active
    if (query.trim()) return;

    if (illnessTimer.current) clearTimeout(illnessTimer.current);
    illnessTimer.current = setTimeout(() => {
      const derived = extractSearchQuery(illnessDescription);
      if (derived) {
        executeSearch(derived, 'illness');
      } else {
        setResults([]);
        setSearched(false);
      }
    }, 600); // slightly longer debounce so typing doesn't hammer

    return () => {
      if (illnessTimer.current) clearTimeout(illnessTimer.current);
    };
  }, [illnessDescription, query, executeSearch]);

  const effectiveQuery = query.trim() || extractSearchQuery(illnessDescription);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Diagnosis section */}
      <div className="p-5 border-b space-y-2 flex-shrink-0">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Diagnosis / Illness
        </Label>
        <Textarea
          placeholder="Describe the diagnosis, symptoms, or chief complaint…"
          className="resize-none h-24 text-sm"
          value={illnessDescription}
          onChange={(e) => onIllnessDescriptionChange(e.target.value)}
        />
        {illnessDescription.trim() && !query.trim() && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Showing suggestions based on diagnosis
          </p>
        )}
      </div>

      {/* AI Insights Panel — inline, below diagnosis, above search */}
      <AIInsightsPanel
        illnessDescription={illnessDescription}
        rxItems={rxItems}
        patientAllergies={patientAllergies}
        patientBloodGroup={patientBloodGroup}
        onAddSuggestion={(medicineName) => {
          // Pre-fill the search box with the suggested medicine name
          handleSearch(medicineName);
        }}
      />

      {/* Search input */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 block">
          Search Medicines
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 pr-9"
            placeholder="Search by name, class, or use…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Drag a card onto the prescription pad
        </p>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
        {!effectiveQuery && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="rounded-full bg-muted/60 p-4">
              <Pill className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              Type a medicine name or fill in the diagnosis above
            </p>
          </div>
        )}

        {searched && results.length === 0 && !searching && (
          <div className="text-sm text-muted-foreground text-center py-10">
            No medicines found
            {searchSource === 'illness' ? ' for this diagnosis' : ` for "${query}"`}
          </div>
        )}

        {searching && results.length === 0 && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}

        {results.length > 0 && (
          <>
            {searchSource === 'illness' && !query.trim() && (
              <p className="text-[11px] text-muted-foreground pb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary/60" />
                Suggested for your diagnosis
              </p>
            )}
            {results.map((med) => (
              <DraggableMedicineCard key={med.id} medicine={med} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};
