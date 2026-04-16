import { useEffect } from "preact/hooks";
import {
  Server,
  Shield,
  Code,
  Smartphone,
  Globe,
  Lock,
  Users,
  Zap,
  ChevronRight,
  Github,
  ArrowRight,
  Layers,
  ServerCog,
} from "lucide-react";
import "./LandingPage.css";
import { VNode } from "preact";

interface LandingPageProps {
  onOpenApp: () => void;
}

function Btn({
  href,
  onClick,
  label,
  icon,
  size = "",
  variant = "secondary",
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  icon: VNode;
  size?: string;
  variant?: "primary" | "secondary";
}) {
  const cls = `btn btn-${variant}${size ? ` btn-${size}` : ""}`;
  return href ? (
    <a href={href} class={cls} target="_blank" rel="noopener">
      {icon}
      {label}
    </a>
  ) : (
    <button class={cls} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function GhLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {label}
    </a>
  );
}

const FEATURES = [
  {
    icon: <Shield size={24} />,
    title: "Privacy-First",
    subtitle:
      "No data mining, no ads, no tracking. Your conversations stay yours. We cannot read them even if we wanted to.",
  },
  {
    icon: <Server size={24} />,
    title: "Self-Host Your Server",
    subtitle:
      "Run your own server with full control. Self-hosting is the recommended way to use originChats for complete data sovereignty.",
  },
  {
    icon: <Code size={24} />,
    title: "Build Your Own Client",
    subtitle:
      "We encourage you to create your own clients. The open API and protocol make it easy to build exactly what you want.",
  },
  {
    icon: <Smartphone size={24} />,
    title: "Cross-Platform",
    subtitle:
      "Works everywhere. Web, desktop, and mobile. Your conversations sync seamlessly across all devices.",
  },
  {
    icon: <Users size={24} />,
    title: "Community Servers",
    subtitle:
      "Create servers with text and voice channels. Perfect for communities of any size, from friends to organizations.",
  },
  {
    icon: <Zap size={24} />,
    title: "Fast and Lightweight",
    subtitle:
      "Built for performance. Minimal memory footprint with efficient WebSocket connections. Runs smoothly on any device.",
  },
];

const SELF_HOST_BENEFITS = [
  "Full data sovereignty. Your data never leaves your infrastructure.",
  "Customize everything. Branding, moderation, features.",
  "No vendor lock-in. Open source with permissive licensing.",
  "Federate with other servers or stay completely private.",
];

const DEV_FEATURES = [
  {
    title: "Open Source",
    body: "Every component is open source. Client, server, protocols, all available on GitHub under permissive licenses.",
  },
  {
    title: "WebSocket API",
    body: "Real-time bidirectional communication. Build responsive applications with instant message delivery.",
  },
  {
    title: "Bot Framework",
    body: "Create powerful bots that interact with servers. Moderation, utilities, games. The possibilities are endless.",
  },
];

const CLIENTS = [
  {
    icon: <Code size={32} />,
    title: "Official Web Client",
    body: "The web client you are looking at right now. Full featured and ready to use.",
    href: "https://github.com/originChats/client",
    label: "View Source",
  },
  {
    icon: <Layers size={32} />,
    title: "Community Clients",
    body: "Browse community-built clients or submit your own. Desktop, mobile, terminal, and more.",
    href: "https://github.com/originChats/server/blob/main/clients.md",
    label: "Browse Clients",
  },
];

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#self-host", label: "Self-Hosting" },
      { href: "#clients", label: "Clients" },
    ],
    webApp: true,
  },
  {
    title: "Developers",
    links: [
      { href: "https://github.com/originChats", label: "GitHub" },
      { href: "https://github.com/originChats/server/tree/main/docs", label: "Documentation" },
      { href: "https://github.com/originChats/server/blob/main/clients.md", label: "Client List" },
    ],
  },
  {
    title: "Source Code",
    links: [
      { href: "https://github.com/originChats/server", label: "Server" },
      { href: "https://github.com/originChats/client", label: "Client" },
    ],
  },
];

function Hero({ onOpenApp }: LandingPageProps) {
  return (
    <section class="hero">
      <div class="hero-content">
        <div class="hero-badge-spacer" />
        <h1 class="hero-title">Own your conversations.</h1>
        <p class="hero-subtitle">
          A chat platform where you control your content. Self-host your servers, build your own
          clients, or just hang out! The choice is yours.
        </p>
        <div class="hero-actions">
          <Btn
            onClick={onOpenApp}
            label="Open Web App"
            icon={<Globe size={20} />}
            variant="primary"
            size="lg"
          />
          <Btn
            href="https://github.com/originChats/server"
            label="Self-Host"
            icon={<ServerCog size={20} />}
            size="lg"
          />
          <Btn
            href="https://github.com/originChats"
            label="Follow on GitHub"
            icon={<Github size={20} />}
            size="lg"
          />
        </div>
        <div class="hero-screenshot">
          <img src="/hero.png" alt="originChats application screenshot" />
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" class="features-section">
      <div class="section-content">
        <h2 class="section-title">Everything you need.</h2>
        <p class="section-subtitle">All the features you expect, none of the compromises.</p>
        <div class="features-grid">
          {FEATURES.map(({ icon, title, subtitle }) => (
            <div key={title} class="feature-card">
              <div class="feature-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SelfHostSection() {
  return (
    <section id="self-host" class="self-host-section">
      <div class="section-content">
        <div class="self-host-grid">
          <div class="self-host-content">
            <h2>Your server, your rules.</h2>
            <p>
              Unlike centralized platforms, originChats is designed for self-hosting. Spin up your
              own server in minutes and have complete control over your community data.
            </p>
            <ul class="self-host-benefits">
              {SELF_HOST_BENEFITS.map((b) => (
                <li key={b}>
                  <ChevronRight size={16} />
                  {b}
                </li>
              ))}
            </ul>
            <Btn
              href="https://github.com/originChats/server"
              label="Get Started on GitHub"
              icon={<Github size={18} />}
              variant="primary"
            />
          </div>
          <div class="self-host-visual">
            <div class="architecture-diagram">
              <div class="diagram-node yours">
                <Lock size={20} />
                <span>Your Server</span>
              </div>
              <div class="diagram-connections">
                <div class="connection-line" />
              </div>
              <div class="diagram-nodes-row">
                {[
                  { icon: <Users size={16} />, label: "Users" },
                  { icon: <Code size={16} />, label: "Bots" },
                  { icon: <Server size={16} />, label: "Other Servers" },
                ].map(({ icon, label }) => (
                  <div key={label} class="diagram-node small">
                    {icon}
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DevelopersSection() {
  return (
    <section id="developers" class="developers-section">
      <div class="section-content">
        <h2 class="section-title">Built for developers.</h2>
        <p class="section-subtitle">
          originChats is open source and built with developers in mind. Extend it, modify it, or
          build something entirely new.
        </p>
        <div class="dev-features">
          {DEV_FEATURES.map(({ title, body }) => (
            <div key={title} class="dev-feature">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClientsSection() {
  return (
    <section id="clients" class="clients-section">
      <div class="section-content">
        <h2 class="section-title">Build your own client.</h2>
        <p class="section-subtitle">
          originChats encourages you to create your own clients. Use our existing clients as
          reference or start from scratch.
        </p>
        <div class="clients-grid">
          {CLIENTS.map(({ icon, title, body, href, label }) => (
            <div key={title} class="client-card">
              <div class="client-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{body}</p>
              <Btn href={href} label={label} icon={<Github size={16} />} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ onOpenApp }: LandingPageProps) {
  return (
    <section class="cta-section">
      <div class="section-content">
        <h2>Ready to get started?</h2>
        <p>Join thousands of users who have taken back control of their conversations.</p>
        <div class="cta-actions">
          <Btn
            onClick={onOpenApp}
            label="Open Web App"
            icon={<Globe size={20} />}
            variant="primary"
            size="lg"
          />
          <Btn
            href="https://github.com/originChats/server"
            label="View on GitHub"
            icon={<Github size={20} />}
            size="lg"
          />
        </div>
      </div>
    </section>
  );
}

function Footer({ onOpenApp }: LandingPageProps) {
  return (
    <footer class="landing-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <img src="/dms.png" alt="originChats" class="footer-logo" />
          <span>originChats</span>
        </div>
        <div class="footer-links">
          {FOOTER_COLS.map(({ title, links, webApp }) => (
            <div key={title} class="footer-column">
              <h4>{title}</h4>
              {links.map(({ href, label }) =>
                href.startsWith("http") ? (
                  <GhLink key={label} href={href} label={label} />
                ) : (
                  <a key={label} href={href}>
                    {label}
                  </a>
                )
              )}
              {webApp && (
                <button onClick={onOpenApp} class="footer-link-btn">
                  Web App
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div class="footer-bottom">
        <p>Open source, open conversations.</p>
      </div>
    </footer>
  );
}

export function LandingPage({ onOpenApp }: LandingPageProps) {
  useEffect(() => {
    window.history.replaceState({}, document.title, "/");
  }, []);

  return (
    <div class="landing-page">
      <nav class="landing-nav">
        <div class="nav-content">
          <div class="nav-brand">
            <img src="/dms.png" alt="originChats" class="nav-logo" />
            <span class="nav-title">originChats</span>
          </div>
          <div class="nav-links">
            {["features", "self-host", "clients"].map((id) => (
              <a key={id} href={`#${id}`} class="nav-link">
                {id.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </a>
            ))}
          </div>
          <div class="nav-actions">
            <button class="btn btn-primary" onClick={onOpenApp}>
              Open Web App <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      <Hero onOpenApp={onOpenApp} />
      <FeaturesSection />
      <SelfHostSection />
      <DevelopersSection />
      <ClientsSection />
      <CtaSection onOpenApp={onOpenApp} />
      <Footer onOpenApp={onOpenApp} />
    </div>
  );
}
