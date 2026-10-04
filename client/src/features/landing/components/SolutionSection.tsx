import { Badge } from "@/components/ui/badge";
import { IconStethoscope, IconLayoutDashboard, IconActivity, IconCheck } from "@tabler/icons-react";

const SolutionSection = () => {
  return (
    <section id="solution" className="py-24 bg-primary/5 border-y">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex flex-col md:flex-row gap-12 lg:gap-16 items-center">
          <div className="md:w-1/2">
            <Badge variant="outline" className="mb-6 rounded-full px-4 py-1.5 font-medium bg-background shadow-sm">
              The Solution
            </Badge>
            <h2 className="text-4xl md:text-5xl font-light mb-6 font-serif leading-tight">
              A unified platform for <span className="text-primary">better outcomes</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              mediNexus bridges the gap between patients and healthcare providers by centralizing data, automating scheduling, and enabling seamless, secure communication.
            </p>
            <ul className="space-y-4">
              {[
                "Universal Health ID for instant historical record access",
                "Automated appointment routing to minimize patient wait times",
                "Cross-department analytics for hospital administrators"
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 text-foreground">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <IconCheck className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:w-1/2 grid grid-cols-2 gap-4 w-full">
            <div className="space-y-4 mt-8">
              <div className="p-6 bg-background rounded-2xl shadow-sm border hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <IconStethoscope className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-medium text-lg">Clinical Excellence</h4>
                <p className="text-sm text-muted-foreground mt-2">Complete patient history at your fingertips</p>
              </div>
              <div className="p-6 bg-background rounded-2xl shadow-sm border hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <IconActivity className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-medium text-lg">Real-time Vitals</h4>
                <p className="text-sm text-muted-foreground mt-2">Monitor patient health in real-time</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-6 bg-background rounded-2xl shadow-sm border h-56 flex flex-col justify-end hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <IconLayoutDashboard className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-medium text-lg">Smart Dashboard</h4>
                <p className="text-sm text-muted-foreground mt-2">Analytics that drive decisions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;