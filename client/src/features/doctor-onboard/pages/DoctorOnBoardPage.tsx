import { IconHeartbeat } from "@tabler/icons-react";
import DoctorOnBoardForm from "../components/DoctorOnBoardForm";

const DoctorOnBoardPage = () => {
  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      
      {/* Left Portion */}
      <div className="relative hidden h-full flex-col bg-muted p-8 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-primary/90" />
        <div className="relative z-20 flex items-center gap-2 font-serif text-2xl">
          <IconHeartbeat className="h-8 w-8 text-white" />
          mediNexus
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "Providing detailed context to your profile enhances patient trust and ensures smooth scheduling operations."
            </p>
          </blockquote>
        </div>
      </div>
      
      {/* Right Portion */}
      <div className="p-8 h-full flex flex-col py-6 overflow-y-auto">
        <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[550px] mt-6 mb-12">
          
          <div className="flex flex-col space-y-2 text-center md:text-left">
            <h1 className="text-4xl font-light tracking-tight">
              Complete Your Profile
            </h1>
            <p className="text-md text-muted-foreground pb-2">
              Please provide your professional details to finalize your setup.
            </p>
          </div>

          <DoctorOnBoardForm />
          
        </div>
      </div>
    </div>
  );
};

export default DoctorOnBoardPage;