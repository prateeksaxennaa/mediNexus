import { IconBrandX, IconBrandLinkedin, IconBrandGithub, IconHeartbeat } from "@tabler/icons-react";

const Footer = () => {
  return (
    <footer className="bg-background border-t py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <IconHeartbeat className="h-6 w-6 text-primary" />
              <span className="font-serif font-light text-xl tracking-wide">mediNexus</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
              Healthcare management made effortless. Connecting patients, doctors, and hospitals for better health outcomes.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all">
                <IconBrandX size={18} />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all">
                <IconBrandLinkedin size={18} />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all">
                <IconBrandGithub size={18} />
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-4 text-sm">Product</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Integrations</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Security</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-4 text-sm">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">About us</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Our team</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
            </ul>
          </div>

          <div>
             <h4 className="font-medium mb-4 text-sm">Resources</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Terms of use</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Support</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Documentation</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 mediNexus. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Made with care for healthcare
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer