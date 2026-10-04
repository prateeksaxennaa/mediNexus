import { IconHeartbeat, IconArrowLeft, IconStethoscope } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import LoginForm from "../components/LoginForm";
import { useNavigate, Link } from "react-router-dom";

const DoctorLoginPage = () => {
  const navigate = useNavigate();

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Portion - Doctor Clinical Theme */}
      <div className="relative hidden h-full flex-col bg-muted p-8 text-white lg:flex dark:border-r overflow-hidden">
        <div className="absolute inset-0 bg-emerald-700 dark:bg-emerald-950" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
        
        <div className="relative z-20 flex items-center gap-2 font-serif text-2xl">
          <IconHeartbeat className="h-8 w-8 text-emerald-300" />
          <span>mediNexus</span>
          <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600/50 text-emerald-200 border border-emerald-400/30 ml-2">
            Clinical Portal
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
              "The AI pre-consultation briefs and instant longitudinal report trends save me 15 minutes per patient consultation."
            </p>
            <footer className="text-sm text-emerald-200/80">
              <span className="block font-medium text-white">Dr. Rajesh Sharma, MD</span>
              <span className="block">Senior Cardiologist, City General Hospital</span>
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
              <span className="text-muted-foreground text-xs sm:text-sm">Patient or Member?</span>
              <Button 
                variant="outline" 
                size="sm"
                className="font-medium text-xs sm:text-sm rounded-full"
                onClick={() => navigate("/login")}
              >
                Patient Login
              </Button>
            </div>
          </div>
          
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-100 mt-6 sm:mt-12">
            <div className="flex flex-col space-y-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-1 text-emerald-600 dark:text-emerald-400">
                <IconStethoscope className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-light tracking-tight font-serif">
                Doctor Portal
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in with your clinical credentials or verified doctor phone
              </p>
            </div>

            <LoginForm role="doctor" />
            
            <div className="pt-4 border-t border-border/50 text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                Received an invitation from your hospital?{' '}
                <Link to="/doctor/setup" className="font-semibold text-primary hover:underline">
                  Complete Doctor Setup
                </Link>
              </p>

              <p className="text-xs text-muted-foreground">
                Hospital administrator?{' '}
                <Link to="/admin" className="font-semibold text-primary hover:underline">
                  Hospital Admin Portal
                </Link>
                {' · '}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Patient Login
                </Link>
              </p>
              
              <p className="text-xs text-muted-foreground/80">
                Authorized clinical medical staff access only. Activity is monitored and logged under HIPAA/NABH compliance.
              </p>
            </div>
          </div>
        </div>

        <div className="py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} mediNexus Health Cloud · Clinical Gateway
        </div>
      </div>
    </div>
  );
};

export default DoctorLoginPage;
