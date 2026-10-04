import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminDashboardHeader } from '../components/AdminDashboardHeader';
import { AdminOverview } from '../components/AdminOverview';
import { AdminDoctors } from '../components/AdminDoctors';
import { AdminServices } from '../components/AdminServices';
import { AdminAppointments } from '../components/AdminAppointments';
import { AdminServiceSlots } from '../components/AdminServiceSlots';
import { AdminServiceAppointments } from '../components/AdminServiceAppointments';
import { AdminProfilePage } from '../components/AdminProfilePage';
import { AdminReports } from '../components/AdminReports';
import { AdminDoctorSlots } from '../components/AdminDoctorSlots';

const AdminDashboard = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <AdminOverview setActiveTab={setActiveTab} />;
      case 'doctors':
        return <AdminDoctors />;
      case 'services':
        return <AdminServices />;
      case 'service-slots':
        return <AdminServiceSlots />;
      case 'service-appointments':
        return <AdminServiceAppointments />;
      case 'doctor-slots':
        return <AdminDoctorSlots />;
      case 'appointments':
        return <AdminAppointments />;
      case 'reports':
        return <AdminReports />;
      case 'profile':
        return <AdminProfilePage />;
      default:
        return <AdminOverview setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 overflow-x-hidden">
      <AdminDashboardHeader activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="w-full px-6 py-8">
        {renderContent()}
      </main>
    </div>
  );
};

export default AdminDashboard;
