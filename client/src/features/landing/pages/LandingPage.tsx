import { 
  Header, 
  HeroSection, 
  ProblemSection, 
  SolutionSection, 
  HowItWorksSection, 
  FeaturesSection, 
  CTASection, 
  Footer 
} from '..';

const LandingPage = () => {
  return (
    <div className="bg-background min-h-screen flex flex-col font-sans">
      <Header />
      <main className="grow">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;