import { useState } from "react";
import { IconHeartbeat, IconArrowLeft } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { SignupForm } from "..";
import { type SignupRole } from "@/types";

const SignupPage = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState<SignupRole>('patient'); 

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      
      {/* Left Portion */}
      <div className="relative hidden h-full flex-col bg-muted p-8 text-white lg:flex dark:border-r overflow-hidden">
        <div className="absolute inset-0 bg-primary" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
        
        <div className="relative z-20 flex items-center gap-2 font-serif text-2xl">
          <IconHeartbeat className="h-8 w-8 text-white" />
          mediNexus
        </div>
        <Button 
          variant="ghost" 
          className="absolute top-8 right-8 text-white/80 hover:bg-white/10 hover:text-white z-20 font-medium text-sm backdrop-blur-sm"
          onClick={() => navigate("/")}
        >
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-4">
            <p className="text-xl leading-relaxed font-light">
              "Joining mediNexus gave our clinic the digital infrastructure we critically needed to grow seamlessly."
            </p>
            <footer className="text-sm text-white/70">
              <span className="block font-medium text-white">Dr. Emily Chen</span>
              <span className="block">Director, Sunrise Medical Center</span>
            </footer>
          </blockquote>
          
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              </div>
              <span className="text-sm text-white/80">HIPAA Compliant</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
              </div>
              <span className="text-sm text-white/80">Bank-grade Security</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
              </div>
              <span className="text-sm text-white/80">24/7 Support</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Portion */}
      <div className="p-8 h-full flex flex-col">
        <div className="flex justify-end lg:hidden mb-8 w-full">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <IconArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
        <div className="flex justify-end items-center gap-4 w-full">
          <span className="text-muted-foreground text-sm">Already have an account?</span>
          <Button variant="outline" className="font-medium text-sm rounded-full" onClick={() => navigate("/login")}>
            Log in
          </Button>
        </div>
        
        <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-125 mt-12">
          <div className="flex flex-col space-y-3 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <IconHeartbeat className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-light tracking-tight font-serif">
              Create an account
            </h1>
            <p className="text-muted-foreground">
              Register as a <span className="text-primary font-medium capitalize">{role}</span>
            </p>
          </div>

          <Tabs value={role} onValueChange={(v) => setRole(v as SignupRole)} className="w-full">
             <TabsList className="grid w-full grid-cols-2 rounded-full p-1">
               <TabsTrigger value="patient" className="text-sm font-medium rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Patient</TabsTrigger>
               <TabsTrigger value="hospital" className="text-sm font-medium rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Hospital / Clinic</TabsTrigger>
             </TabsList>
          </Tabs>

          <SignupForm role={role} />
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            By clicking register, you agree to our{" "}
            <a href="#" className="underline underline-offset-4 hover:text-primary">Terms of Service</a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;