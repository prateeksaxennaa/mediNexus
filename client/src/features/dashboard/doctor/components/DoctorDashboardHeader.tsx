import { IconHeartbeat, IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navigationItems = [
  { name: 'Appointments', key: 'queue' },
  { name: 'Schedules', key: 'schedule' },
  { name: 'Prescriptions', key: 'prescriptions' },
  { name: 'Referrals', key: 'referrals' },
];

export const DoctorDashboardHeader = ({ activeTab, setActiveTab }: HeaderProps) => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="pt-4 sticky top-0 z-50">
      <header className="mx-auto w-[calc(100%-2rem)] max-w-7xl rounded-full border border-white/10 bg-background/80 backdrop-blur-xl shadow-lg supports-[backdrop-filter]:bg-background/50">
        <div className="px-6 h-16 flex items-center justify-between">

        {/* Brand Name - Left */}
        <div
          className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => setActiveTab('queue')}
        >
          <IconHeartbeat className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-light">mediNexus</span>
        </div>

        {/* Navigation Links - Center */}
        <nav className="hidden md:flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 p-1.5 rounded-full bg-secondary/40 border border-border/50 backdrop-blur-md shadow-inner">
            {navigationItems.map((item) => (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                className={`text-[15px] font-medium rounded-full px-6 py-2 h-auto transition-all duration-300 ${
                  activeTab === item.key 
                    ? "bg-[#5d0ec0]/80 text-white shadow-lg shadow-[#5d0ec0]/30 ring-1 ring-white/20 backdrop-blur-md" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                onClick={() => setActiveTab(item.key)}
              >
                {item.name}
              </Button>
            ))}
          </div>
        </nav>

        {/* Action Buttons - Right */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-full w-9 h-9"
          >
            {theme === "dark" ? (
              <IconSun className="h-5 w-5 text-amber-500" />
            ) : (
              <IconMoon className="h-5 w-5 text-slate-700" />
            )}
          </Button>

          {/* Profile icon + name — clicking goes to profile tab */}
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 rounded-full px-2 py-1 transition-colors ${
              activeTab === 'profile' ? 'bg-secondary' : 'hover:bg-secondary/70'
            }`}
          >
            <span className="hidden sm:block text-sm font-light text-muted-foreground">
              Dr. {(user as any)?.user_metadata?.full_name?.split(' ')[0] ?? 'Doctor'}
            </span>
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary/50">
              <User className="h-5 w-5 text-foreground" />
            </span>
          </button>

          <Button
            variant="outline"
            className="font-normal text-md rounded-full px-6 hidden sm:flex border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
    </div>
  );
};