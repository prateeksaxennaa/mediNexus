import { useState } from 'react';
import { DoctorDashboardHeader, DoctorQueue, DoctorSchedule, DoctorPrescriptions, DoctorReferrals, DoctorProfilePage } from '../..';

export const DoctorDashboard = () => {
  // We use "queue" as the default home view since it's their daily workspace
  const [activeTab, setActiveTab] = useState('queue');

  const renderContent = () => {
    switch (activeTab) {
      case 'queue':
        return <DoctorQueue />;
      case 'schedule':
        return <DoctorSchedule />;
      case 'prescriptions':
        return <DoctorPrescriptions />;
      case 'referrals':
        return <DoctorReferrals />;
      case 'profile':
        return <DoctorProfilePage />;
      default:
        return <DoctorQueue />;
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 overflow-x-hidden">
      <DoctorDashboardHeader activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="w-full max-w-7xl mx-auto py-8">
        {renderContent()}
      </main>
    </div>
  );
};