import { IconHeartbeat, IconArrowLeft, IconBuildingHospital } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import LoginForm from "../components/LoginForm";
import { useNavigate, Link } from "react-router-dom";

const AdminLoginPage = () => {
  const navigate = useNavigate();

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Portion - Hospital Admin Theme */}
      <div className="relative hidden h-full flex-col bg-muted p-8 text-white lg:flex dark:border-r overflow-hidden">
        <div className="absolute inset-0 bg-slate-900" />
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />
        
        <div className="relative z-20 flex items-center gap-2 font-serif text-2xl">
          <IconHeartbeat className="h-8 w-8 text-sky-400" />
          <span>mediNexus</span>
          <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 ml-2">
            Admin Console
          </span>
        </div>

        <Button 
          variant="ghost" 
          className="absolute top-8 right-8 text-white/80 hover:bg-white/10 hover:text-white z-20 font-medium text-sm backdrop-blur-sm"
          onClick={() => navigate("/")}
        >
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Home
        </Button>

        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-4">
            <p className="text-xl leading-relaxed font-light">
              "Real-time OPD queue telemetry and centralized doctor scheduling have significantly reduced patient waiting times across all departments."
            </p>
            <footer className="text-sm text-sky-200/80">
              <span className="block font-medium text-white">City General Hospital</span>
              <span className="block">Hospital Administration & Operations</span>
            </footer>
          </blockquote>
        </div>
      </div>
      
      {/* Right Portion - Form */}
      <div className="p-8 h-full flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-6 w-full">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <IconArrowLeft className="mr-2 h-4 w-4" /> Home
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs sm:text-sm">New Hospital?</span>
              <Button 
                variant="outline" 
                size="sm"
                className="font-medium text-xs sm:text-sm rounded-full"
                onClick={() => navigate("/register")}
              >
                Register Facility
              </Button>
            </div>
          </div>
          
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-100 mt-6 sm:mt-12">
            <div className="flex flex-col space-y-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center mb-1 text-sky-600 dark:text-sky-400">
                <IconBuildingHospital className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-light tracking-tight font-serif">
                Hospital Admin Portal
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage medical departments, doctor rosters, and operational capacity
              </p>
            </div>

            <LoginForm role="admin" />
            
            <div className="pt-4 border-t border-border/50 text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                Are you a clinical doctor?{' '}
                <Link to="/doctor" className="font-semibold text-primary hover:underline">
                  Doctor Portal
                </Link>
                {' · '}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Patient Login
                </Link>
              </p>
              
              <p className="text-xs text-muted-foreground/80">
                Authorized hospital administrative access only. Two-factor authentication & IP logging enforced.
              </p>
            </div>
          </div>
        </div>

        <div className="py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} mediNexus Health Cloud · Administration Suite
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
