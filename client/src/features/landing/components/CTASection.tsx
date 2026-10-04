import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { IconArrowRight } from "@tabler/icons-react";

const CTASection = () => {
  const navigate = useNavigate();

  return (
    <section id="cta" className="py-32 bg-primary/5 border-t relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-30 -z-10" />
      <div className="container mx-auto max-w-4xl px-4 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-light mb-6 font-serif text-foreground">
          Ready to transform your practice?
        </h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Join thousands of healthcare providers streamlining their operations, managing schedules, and prioritizing patient care.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            className="px-8 py-6 text-md font-medium rounded-full hover-lift group"
            onClick={() => navigate("/register")}
          >
            Start for free
            <IconArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="px-8 py-6 text-md font-medium rounded-full"
            onClick={() => navigate("/login")}
          >
            Schedule Demo
          </Button>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          No credit card required • Free 14-day trial • Cancel anytime
        </p>
      </div>
    </section>
  );
};

export default CTASection;