import { Button } from "@/components/ui/button";
import { IconHeartbeat, IconMenu2, IconX, IconSun, IconMoon } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

const navItems = [
  { label: "Hero", href: "#hero" },
  { label: "Problem", href: "#problem" },
  { label: "Solution", href: "#solution" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "CTA", href: "#cta" },
];

const Header = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100; // offset
      
      let currentSelection = activeSection;
      
      for (const item of navItems) {
        const id = item.href.replace('#', '');
        const element = document.getElementById(id);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            currentSelection = id;
          }
        }
      }
      
      if (currentSelection !== activeSection) {
        setActiveSection(currentSelection);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeSection]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace('#', '');
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 80,
        behavior: 'smooth'
      });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="pt-4 sticky top-0 z-50 transition-all duration-300">
      <header className="mx-auto w-[calc(100%-2rem)] max-w-7xl rounded-full border border-white/10 bg-background/80 backdrop-blur-xl shadow-lg supports-[backdrop-filter]:bg-background/50">
        <div className="px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80" 
            onClick={() => {
              navigate("/");
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="relative">
              <IconHeartbeat className="h-7 w-7 text-primary" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary/30 rounded-full animate-pulse" />
            </div>
            <span className="font-serif text-xl font-light tracking-wide">mediNexus</span>
          </div>
          
          <nav className="hidden md:flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 p-1.5 rounded-full bg-secondary/40 border border-border/50 backdrop-blur-md shadow-inner">
              {navItems.map((item) => {
                const isActive = activeSection === item.href.replace('#', '');
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(e) => scrollToSection(e, item.href)}
                    className={`px-6 py-2 text-[15px] font-medium rounded-full transition-all duration-300 ${
                      isActive 
                        ? "bg-[#5d0ec0]/80 text-white shadow-lg shadow-[#5d0ec0]/30 ring-1 ring-white/20 backdrop-blur-md" 
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </nav>
          
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full w-9 h-9"
            >
              {theme === "dark" ? (
                <IconSun className="h-5 w-5 text-amber-500" />
              ) : (
                <IconMoon className="h-5 w-5 text-slate-700" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="font-medium text-sm rounded-full hover:bg-muted"
              onClick={() => navigate("/login")}
            >
              Log in
            </Button>
            <Button size="lg" className="font-medium text-sm rounded-full px-6" onClick={() => navigate("/register")}>
              Get Started
            </Button>
          </div>

          <button 
            className="md:hidden p-2 rounded-full hover:bg-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-background/95 backdrop-blur-xl rounded-b-3xl absolute w-full left-0 top-16 shadow-lg overflow-hidden animate-in slide-in-from-top-2">
            <nav className="px-6 py-4 flex flex-col gap-2">
              {navItems.map((item) => {
                const isActive = activeSection === item.href.replace('#', '');
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(e) => scrollToSection(e, item.href)}
                    className={`px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                      isActive 
                        ? "bg-[#5d0ec0]/20 text-[#5d0ec0] dark:text-[#9d4edd]"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
              <div className="flex gap-2 mt-2 pt-4 border-t border-white/10">
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}
                >
                  Log in
                </Button>
                <Button 
                  className="flex-1 rounded-full"
                  onClick={() => { navigate("/register"); setMobileMenuOpen(false); }}
                >
                  Get Started
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>
    </div>
  );
};

export default Header;