import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Loader2, Bell, BellOff, CheckCircle2, X, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientService, type WaitlistEntry } from '@/services/patient.service';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 3000;

// Live countdown for the offer expiry
function useCountdown(expiresAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setLabel('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLabel(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return label;
}

// Single waitlist card — memoised to avoid re-renders on unrelated state changes
function WaitlistCard({
  entry,
  onAccepted,
  onLeft,
}: {
  entry: WaitlistEntry;
  onAccepted: (slot: any, lockedUntil: string) => void;
  onLeft: (entryId: string) => void;
}) {
  const [acting, setActing] = useState<'accept' | 'decline' | null>(null);
  const countdown = useCountdown(entry.status === 'notified' ? entry.offer_expires_at : null);

  const isOffer = entry.status === 'notified';
  const slot = entry.appointment_slots;
  const doctor = slot?.doctors;
  const hospital = doctor?.hospitals;

  const handleAccept = async () => {
    setActing('accept');
    try {
      const res = await patientService.acceptOffer(entry.id);
      const { slot: lockedSlot, locked_until } = (res as any).data;
      toast.success('Slot locked! Confirm your booking now.');
      onAccepted(lockedSlot, locked_until);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to accept offer');
    } finally {
      setActing(null);
    }
  };

  const handleDecline = async () => {
    setActing('decline');
    try {
      await patientService.declineOffer(entry.id);
      toast.success('Offer declined');
      onLeft(entry.id);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to decline offer');
    } finally {
      setActing(null);
    }
  };

  const handleLeave = async () => {
    setActing('decline');
    try {
      await patientService.leaveWaitlist(entry.id);
      toast.success('Left the waitlist');
      onLeft(entry.id);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to leave waitlist');
    } finally {
      setActing(null);
    }
  };

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-4 transition-all ${
        isOffer
          ? 'border-primary/50 bg-primary/5 shadow-sm'
          : 'bg-card'
      }`}
    >
      {/* Offer banner */}
      {isOffer && (
        <div className="flex items-center gap-2 text-primary text-sm font-medium">
          <Bell className="h-4 w-4 animate-pulse" />
          <span>A slot is available — act fast!</span>
          {countdown && (
            <span className="ml-auto font-mono text-xs bg-primary/10 px-2 py-0.5 rounded-full">
              {countdown}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Info */}
        <div className="flex-1 space-y-1">
          <p className="font-medium">{doctor?.full_name ?? 'Doctor'}</p>
          <p className="text-sm text-muted-foreground">
            {doctor?.specialisation}
            {hospital ? ` — ${hospital.name}, ${hospital.city}` : ''}
          </p>
          {slot && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {format(parseISO(slot.slot_start), 'EEE, MMM d')}
                {' · '}
                {format(parseISO(slot.slot_start), 'h:mm a')}
                {' – '}
                {format(parseISO(slot.slot_end), 'h:mm a')}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            {isOffer ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-medium">
                <Bell className="h-3 w-3" /> Offer active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">
                <BellOff className="h-3 w-3" /> Waiting
              </span>
            )}
            <span>
              Joined {formatDistanceToNowStrict(parseISO(entry.queued_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isOffer ? (
            <>
              <Button
                size="sm"
                onClick={handleAccept}
                disabled={acting !== null}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {acting === 'accept' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDecline}
                disabled={acting !== null}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                {acting === 'decline' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-1" />
                )}
                Decline
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLeave}
              disabled={acting !== null}
              className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              {acting === 'decline' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserMinus className="h-4 w-4 mr-1" />
              )}
              Leave
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface WaitlistPanelProps {
  /** Called when patient accepts an offer — navigate to confirm booking */
  onOfferAccepted?: (slot: any, lockedUntil: string) => void;
}

export const WaitlistPanel = ({ onOfferAccepted }: WaitlistPanelProps) => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Guard: don't overwrite entries while the user is mid-action (accept/decline).
  const actingRef = useRef(false);

  const fetchWaitlist = useCallback(async (silent = false) => {
    if (actingRef.current) return; // skip poll during user action
    try {
      const res = await patientService.listWaitlist();
      setEntries((res as any).data?.waitlist ?? []);
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchWaitlist();
  }, [fetchWaitlist]);

  // 3-second polling while panel is mounted
  useEffect(() => {
    const id = setInterval(() => fetchWaitlist(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchWaitlist]);

  const handleAccepted = (slot: any, lockedUntil: string) => {
    setEntries((prev) => prev.filter((e) => e.slot_id !== slot.id));
    if (onOfferAccepted) {
      onOfferAccepted(slot, lockedUntil);
    } else {
      navigate('/patient/discover');
    }
  };

  const handleLeft = (entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  // Sort: offers ('notified') always first, then by queued_at
  const sorted = [...entries].sort((a, b) => {
    if (a.status === 'notified' && b.status !== 'notified') return -1;
    if (b.status === 'notified' && a.status !== 'notified') return 1;
    return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
  });

  const hasOffers = sorted.some((e) => e.status === 'notified');

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-light tracking-tight">My Waitlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasOffers
              ? "You have an active slot offer — accept before time runs out!"
              : "You'll be notified when a slot opens up."}
          </p>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      {!loading && sorted.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
          You are not on any waitlists.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((entry) => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
              onAccepted={handleAccepted}
              onLeft={handleLeft}
            />
          ))}
        </div>
      )}
    </div>
  );
};
