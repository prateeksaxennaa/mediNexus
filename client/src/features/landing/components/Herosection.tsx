import { Button } from "@/components/ui/button";
import { IconHeartbeat } from "@tabler/icons-react";

const HeroSection = () => {
  return (
    <section id="hero" className="relative pt-32 pb-24 text-center container mx-auto max-w-6xl px-4">
      <div className="absolute inset-0 gradient-mesh opacity-50 -z-10" />

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 animate-in-up">
        <IconHeartbeat className="w-4 h-4" />
        <span>Your Health, Unified</span>
      </div>
      
      <h1 className="font-serif text-5xl md:text-7xl font-light tracking-tight text-foreground mb-6 leading-tight">
        Effortless healthcare <br className="hidden md:block" />
        management by <span className="text-primary">mediNexus</span>
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-4xl mx-auto leading-relaxed">
        Streamline your medical practice with seamless automation for patient scheduling, 
        unified records, and intelligent staff management.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button size="lg" className="px-8 py-6 text-md font-medium rounded-full hover-lift">
          Start for free
        </Button>
        <Button size="lg" variant="outline" className="px-8 py-6 text-md font-medium rounded-full">
          Watch Demo
        </Button>
      </div>
    </section>
  );
}

export default HeroSection