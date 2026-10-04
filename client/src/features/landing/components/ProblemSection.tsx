import { Badge } from "@/components/ui/badge";
import { IconClock, IconFileOff, IconHeartBroken } from "@tabler/icons-react";

const ProblemSection = () => {
  return (
    <section id="problem" className="py-32 container mx-auto max-w-6xl px-4">
      <div className="text-center mb-16">
        <Badge variant="outline" className="mb-6 rounded-full px-4 py-1.5 font-medium bg-destructive/5 text-destructive border-destructive/20">
          The Challenge
        </Badge>
        <h2 className="text-4xl md:text-5xl font-light mb-6 font-serif">
          Healthcare is too fragmented
        </h2>
        <p className="text-muted-foreground max-w-4xl mx-auto text-lg leading-relaxed">
          Patients and providers alike struggle with a disconnected ecosystem that wastes time, scatters data, and compromises care.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            icon: <IconFileOff className="w-10 h-10 text-destructive mb-4" />,
            title: "Scattered Records",
            desc: "Patient history is siloed across different clinics and hospitals, making it hard to get a comprehensive view."
          },
          {
            icon: <IconClock className="w-10 h-10 text-destructive mb-4" />,
            title: "Inefficient Scheduling",
            desc: "Long wait times and complex booking processes frustrate patients and reduce hospital throughput."
          },
          {
            icon: <IconHeartBroken className="w-10 h-10 text-destructive mb-4" />,
            title: "Coordination Gaps",
            desc: "Lack of real-time communication between different departments and external facilities leads to delays in care."
          }
        ].map((item, idx) => (
          <div 
            key={idx} 
            className="p-8 bg-card rounded-2xl border border-border/50 hover:border-destructive/20 hover:shadow-lg hover:bg-destructive/5 transition-all duration-300 card-elevated group"
          >
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 group-hover:bg-destructive/20 transition-colors">
              {item.icon}
            </div>
            <h3 className="text-xl font-medium mb-3">{item.title}</h3>
            <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProblemSection;