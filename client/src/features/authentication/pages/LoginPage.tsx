import { useState } from "react";
import { IconHeartbeat, IconArrowLeft } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoginForm from "../components/LoginForm";
import { useNavigate } from "react-router-dom";
import { type LoginRole as Role } from "@/types";

const LoginPage = () => {
  const navigate = useNavigate(); 
  const [role, setRole] = useState<Role>('patient'); 

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
              "This platform has completely transformed how I manage my appointments and patient records. It's intuitive, fast, and secure."
            </p>
            <footer className="text-sm text-white/70">
              <span className="block font-medium text-white">Dr. Sofia Davis</span>
              <span className="block">Chief Medical Officer, City Clinic</span>
            </footer>
          </blockquote>
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
          <span className="text-muted-foreground text-sm">Need help?</span>
          <Button 
            variant="outline" 
            className="font-medium text-sm rounded-full"
            onClick={() => navigate("/register")}
          >
            Register
          </Button>
        </div>
        
        <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-100 mt-16">
          <div className="flex flex-col space-y-3 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <IconHeartbeat className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-light tracking-tight font-serif">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              Sign in to your <span className="text-primary font-medium capitalize">{role}</span> account
            </p>
          </div>

          {/* Role Section Tabs */}
          <Tabs value={role} onValueChange={(v) => setRole(v as Role)} className="w-full">
             <TabsList className="grid w-full grid-cols-3 rounded-full p-1">
               <TabsTrigger value="patient" className="text-sm font-medium rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Patient</TabsTrigger>
               <TabsTrigger value="doctor" className="text-sm font-medium rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Doctor</TabsTrigger>
               <TabsTrigger value="admin" className="text-sm font-medium rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Admin</TabsTrigger>
             </TabsList>
          </Tabs>

          <LoginForm role={role} />
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            By continuing, you agree to our{" "}
            <a href="#" className="underline underline-offset-4 hover:text-primary">Terms of Service</a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;