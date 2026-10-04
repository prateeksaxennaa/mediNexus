import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { IconUser, IconBuildingHospital, IconStethoscope } from "@tabler/icons-react";

const HowItWorksSection = () => {
  const [activeTab, setActiveTab] = useState<"patients" | "hospitals" | "doctors">("patients");

  const tabs = [
    { id: "patients", label: "Patients", icon: <IconUser className="w-4 h-4 mr-2" /> },
    { id: "hospitals", label: "Hospitals", icon: <IconBuildingHospital className="w-4 h-4 mr-2" /> },
    { id: "doctors", label: "Doctors", icon: <IconStethoscope className="w-4 h-4 mr-2" /> }
  ] as const;

  const content = {
    patients: [
      { step: "01", title: "Create Health ID", desc: "Sign up and consolidate your past medical records into a single, highly secure profile." },
      { step: "02", title: "Find & Book", desc: "Search for hospitals or specialists based on symptoms, availability, and wait times." },
      { step: "03", title: "Instant Access", desc: "View prescriptions, lab results, and follow-up schedules instantly on your dashboard." }
    ],
    hospitals: [
      { step: "01", title: "Onboard Facility", desc: "Register your hospital and cleanly define departments, staff capacity, and beds." },
      { step: "02", title: "Manage Flow", desc: "Utilize smart queues to route patients efficiently, reducing wait times across departments." },
      { step: "03", title: "Analyze & Optimize", desc: "Access high-level analytics to understand resource utilization and staff bottlenecks." }
    ],
    doctors: [
      { step: "01", title: "Set Availability", desc: "Manage your calendar and let the system handle shift adjustments and double-bookings." },
      { step: "02", title: "Access Records", desc: "Review patient history and prior diagnostics before they even step into the consultation room." },
      { step: "03", title: "Prescribe & Track", desc: "Issue digital prescriptions and monitor patient adherence seamlessly through the portal." }
    ]
  };

  return (
    <section id="how-it-works" className="py-24 container mx-auto max-w-6xl px-4">
      <div className="text-center mb-12">
        <Badge variant="outline" className="mb-6 rounded-full px-4 py-1.5 font-medium bg-primary/5">
          How It Works
        </Badge>
        <h2 className="text-4xl md:text-5xl font-light mb-6 font-serif">
          Tailored for every stakeholder
        </h2>
        <p className="text-muted-foreground max-w-4xl mx-auto text-lg leading-relaxed">
          Whether you are seeking care, providing it, or managing an entire facility, mediNexus seamlessly adapts to your workflow.
        </p>
      </div>

      <div className="flex justify-center mb-12">
        <div className="inline-flex items-center p-1.5 bg-muted/50 rounded-full border shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 relative">
        {content[activeTab].map((item, idx) => (
          <div 
            key={idx} 
            className="relative p-8 border rounded-2xl bg-card shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 group"
          >
            <span className="text-8xl font-serif font-light text-primary/10 absolute top-2 right-6 group-hover:text-primary/20 transition-colors">
              {item.step}
            </span>
            <div className="relative z-10">
              <h3 className="text-xl font-medium mb-3 mt-4">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HowItWorksSection;