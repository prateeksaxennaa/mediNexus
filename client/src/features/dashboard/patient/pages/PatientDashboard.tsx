import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PatientDashboardHeader,
  PatientHealthPassport,
  PatientHome,
  PatientAppointments,
  WaitlistPanel,
  PatientProfilePage,
  PatientPrivacyCenter,
} from '../..';
import { PatientAIChat } from '../components/PatientAIChat';
import { useWaitlistStream, type WaitlistUpdatePayload } from '@/hooks/useWaitlistStream';

export const PatientDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // ── Always-on waitlist polling ────────────────────────────────────────────
  // Fires toast when a new 'notified' offer arrives, regardless of active tab.
  const handleWaitlistUpdate = useCallback((payload: WaitlistUpdatePayload) => {
    if (payload.event === 'UPDATE' && payload.entry.status === 'notified') {
      toast.info('A slot opened up! Check your waitlist.', {
        duration: 10000,
        action: {
          label: 'View Waitlist',
          onClick: () => setActiveTab('waitlist'),
        },
      });
    }
  }, []);

  useWaitlistStream(true, handleWaitlistUpdate);

  const handleOfferAccepted = (slot: any, lockedUntil: string) => {
  navigate('/patient/discover', {
    state: { waitlistSlot: { ...slot, locked_until: lockedUntil } },
  });
};

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <PatientHome setActiveTab={setActiveTab} />;
      case 'appointments':
        return <PatientAppointments setActiveTab={setActiveTab} />;
      case 'waitlist':
        return <WaitlistPanel onOfferAccepted={handleOfferAccepted} />;
      case 'passport':
        return <PatientHealthPassport />;
      case 'profile':
        return <PatientProfilePage />;
      case 'privacy':
        return <PatientPrivacyCenter />;
      default:
        return <PatientHome setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <PatientDashboardHeader activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="w-full max-w-7xl mx-auto">
        {renderContent()}
      </main>
      <PatientAIChat />
    </div>
  );
};
