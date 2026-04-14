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
} from "lucide-react";
import "./LandingPage.css";

interface LandingPageProps {
  onOpenApp: () => void;
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
            <a href="#features" class="nav-link">
              Features
            </a>
            <a href="#self-host" class="nav-link">
              Self-Host
            </a>
            <a href="#clients" class="nav-link">
              Clients
            </a>
          </div>
          <div class="nav-actions">
            <button class="btn btn-primary" onClick={onOpenApp}>
              Open Web App
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      <section class="hero">
        <div class="hero-content">
          <div class="hero-badge-spacer" />
          <h1 class="hero-title">Own your conversations.</h1>
          <p class="hero-subtitle">
            A decentralized chat platform where you control everything.
            Self-host your servers, build your own clients, or use our public
            network. The choice is yours.
          </p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" onClick={onOpenApp}>
              <Globe size={20} />
              Open Web App
            </button>
            <a
              href="https://github.com/originChats/server"
              class="btn btn-secondary btn-lg"
              target="_blank"
              rel="noopener"
            >
              <Github size={20} />
              Self-Host
            </a>
            <a
              href="https://github.com/originChats"
              class="btn btn-secondary btn-lg"
              target="_blank"
              rel="noopener"
            >
              <Github size={20} />
              Follow on GitHub
            </a>
          </div>
          <div class="hero-screenshot">
            <img src="/hero.png" alt="originChats application screenshot" />
          </div>
        </div>
      </section>

      <section id="features" class="features-section">
        <div class="section-content">
          <h2 class="section-title">Everything you need.</h2>
          <p class="section-subtitle">
            All the features you expect, none of the compromises.
          </p>

          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">
                <Shield size={24} />
              </div>
              <h3>Privacy-First</h3>
              <p>
                No data mining, no ads, no tracking. Your conversations stay
                yours. We cannot read them even if we wanted to.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <Server size={24} />
              </div>
              <h3>Self-Host Your Server</h3>
              <p>
                Run your own server with full control. Self-hosting is the
                recommended way to use originChats for complete data
                sovereignty.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <Code size={24} />
              </div>
              <h3>Build Your Own Client</h3>
              <p>
                We encourage you to create your own clients. The open API and
                protocol make it easy to build exactly what you want.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <Smartphone size={24} />
              </div>
              <h3>Cross-Platform</h3>
              <p>
                Works everywhere. Web, desktop, and mobile. Your conversations
                sync seamlessly across all devices.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <Users size={24} />
              </div>
              <h3>Community Servers</h3>
              <p>
                Create servers with text and voice channels. Perfect for
                communities of any size, from friends to organizations.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <Zap size={24} />
              </div>
              <h3>Fast and Lightweight</h3>
              <p>
                Built for performance. Minimal memory footprint with efficient
                WebSocket connections. Runs smoothly on any device.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="self-host" class="self-host-section">
        <div class="section-content">
          <div class="self-host-grid">
            <div class="self-host-content">
              <h2>Your server, your rules.</h2>
              <p>
                Unlike centralized platforms, originChats is designed for
                self-hosting. Spin up your own server in minutes and have
                complete control over your community data.
              </p>
              <ul class="self-host-benefits">
                <li>
                  <ChevronRight size={16} />
                  Full data sovereignty. Your data never leaves your
                  infrastructure.
                </li>
                <li>
                  <ChevronRight size={16} />
                  Customize everything. Branding, moderation, features.
                </li>
                <li>
                  <ChevronRight size={16} />
                  No vendor lock-in. Open source with permissive licensing.
                </li>
                <li>
                  <ChevronRight size={16} />
                  Federate with other servers or stay completely private.
                </li>
              </ul>
              <a
                href="https://github.com/originChats/server"
                class="btn btn-primary"
                target="_blank"
                rel="noopener"
              >
                <Github size={18} />
                Get Started on GitHub
              </a>
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
                  <div class="diagram-node small">
                    <Users size={16} />
                    <span>Users</span>
                  </div>
                  <div class="diagram-node small">
                    <Code size={16} />
                    <span>Bots</span>
                  </div>
                  <div class="diagram-node small">
                    <Server size={16} />
                    <span>Other Servers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="developers" class="developers-section">
        <div class="section-content">
          <h2 class="section-title">Built for developers.</h2>
          <p class="section-subtitle">
            originChats is open source and built with developers in mind. Extend
            it, modify it, or build something entirely new.
          </p>

          <div class="dev-features">
            <div class="dev-feature">
              <h3>Open Source</h3>
              <p>
                Every component is open source. Client, server, protocols, all
                available on GitHub under permissive licenses.
              </p>
            </div>
            <div class="dev-feature">
              <h3>WebSocket API</h3>
              <p>
                Real-time bidirectional communication. Build responsive
                applications with instant message delivery.
              </p>
            </div>
            <div class="dev-feature">
              <h3>Bot Framework</h3>
              <p>
                Create powerful bots that interact with servers. Moderation,
                utilities, games. The possibilities are endless.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="clients" class="clients-section">
        <div class="section-content">
          <h2 class="section-title">Build your own client.</h2>
          <p class="section-subtitle">
            originChats encourages you to create your own clients. Use our
            existing clients as reference or start from scratch.
          </p>

          <div class="clients-grid">
            <div class="client-card">
              <div class="client-icon">
                <Code size={32} />
              </div>
              <h3>Official Web Client</h3>
              <p>
                The web client you are looking at right now. Full featured and
                ready to use.
              </p>
              <a
                href="https://github.com/originChats/client"
                class="btn btn-secondary"
                target="_blank"
                rel="noopener"
              >
                <Github size={16} />
                View Source
              </a>
            </div>
            <div class="client-card">
              <div class="client-icon">
                <Layers size={32} />
              </div>
              <h3>Community Clients</h3>
              <p>
                Browse community-built clients or submit your own. Desktop,
                mobile, terminal, and more.
              </p>
              <a
                href="https://github.com/originChats/server/blob/main/clients.md"
                class="btn btn-secondary"
                target="_blank"
                rel="noopener"
              >
                <Github size={16} />
                Browse Clients
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="cta-section">
        <div class="section-content">
          <h2>Ready to get started?</h2>
          <p>
            Join thousands of users who have taken back control of their
            conversations.
          </p>
          <div class="cta-actions">
            <button class="btn btn-primary btn-lg" onClick={onOpenApp}>
              <Globe size={20} />
              Open Web App
            </button>
            <a
              href="https://github.com/originChats/server"
              class="btn btn-secondary btn-lg"
              target="_blank"
              rel="noopener"
            >
              <Github size={20} />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <footer class="landing-footer">
        <div class="footer-content">
          <div class="footer-brand">
            <img src="/dms.png" alt="originChats" class="footer-logo" />
            <span>originChats</span>
          </div>
          <div class="footer-links">
            <div class="footer-column">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#self-host">Self-Hosting</a>
              <a href="#clients">Clients</a>
              <button onClick={onOpenApp} class="footer-link-btn">
                Web App
              </button>
            </div>
            <div class="footer-column">
              <h4>Developers</h4>
              <a
                href="https://github.com/originChats"
                target="_blank"
                rel="noopener"
              >
                GitHub
              </a>
              <a
                href="https://github.com/originChats/server/tree/main/docs"
                target="_blank"
                rel="noopener"
              >
                Documentation
              </a>
              <a
                href="https://github.com/originChats/server/blob/main/clients.md"
                target="_blank"
                rel="noopener"
              >
                Client List
              </a>
            </div>
            <div class="footer-column">
              <h4>Source Code</h4>
              <a
                href="https://github.com/originChats/server"
                target="_blank"
                rel="noopener"
              >
                Server
              </a>
              <a
                href="https://github.com/originChats/client"
                target="_blank"
                rel="noopener"
              >
                Client
              </a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>Open source, open conversations.</p>
        </div>
      </footer>
    </div>
  );
}
