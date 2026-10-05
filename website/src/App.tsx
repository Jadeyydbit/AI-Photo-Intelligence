import { useEffect, useState, type MouseEvent } from "react";
import { ArrowRight, CheckCircle2, Menu, ShieldCheck, X } from "lucide-react";
import { DownloadSection } from "./components/DownloadSection";
import { Faq } from "./components/Faq";
import { FeatureSection } from "./components/FeatureSection";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { APP_VERSION } from "./config";
import "./styles.css";

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDownloadPage, setIsDownloadPage] = useState(window.location.pathname === "/download");

  useEffect(() => {
    const onPopState = () => setIsDownloadPage(window.location.pathname === "/download");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goHome = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    setIsDownloadPage(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goDownload = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    window.history.pushState({}, "", "/download");
    setIsDownloadPage(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <div className="site-shell">
    <header className="site-header"><a className="site-logo" href="/" onClick={goHome}><span className="brand-mark">AI</span><span>AI Photo Intelligence</span></a><button className="mobile-menu" type="button" aria-label="Toggle navigation" onClick={() => setIsMenuOpen(!isMenuOpen)}>{isMenuOpen ? <X /> : <Menu />}</button><nav className={isMenuOpen ? "open" : ""}><a href="/#features" onClick={() => setIsMenuOpen(false)}>Features</a><a href="/#how-it-works" onClick={() => setIsMenuOpen(false)}>How it works</a><a href="/#faq" onClick={() => setIsMenuOpen(false)}>FAQ</a><a className="header-download" href="/download" onClick={goDownload}>Download <ArrowRight size={15} /></a></nav></header>
    {isDownloadPage ? <main><section className="download-page-hero"><span className="eyebrow"><ShieldCheck size={15} /> Local-first photo intelligence</span><h1>Download AI Photo Intelligence</h1><p>Install a private photo library that runs on your device. Choose your platform below.</p></section><DownloadSection compact /><section className="release-details section"><div><span className="eyebrow">Release information</span><h2>Ready when you are.</h2><p>Version {APP_VERSION}. Production release notes will appear here when installers are published.</p></div><div className="release-card"><CheckCircle2 size={20} /><strong>Installation</strong><span>Download the installer, open it, and follow your operating system's installation steps.</span></div></section></main> : <main><Hero onExplore={() => document.querySelector("#features")?.scrollIntoView({ behavior: "smooth" })} /><FeatureSection /><HowItWorks /><section className="privacy-section section" id="privacy"><div className="privacy-icon"><ShieldCheck size={26} /></div><div><span className="eyebrow">Private by design</span><h2>Your photos stay on your device.</h2><p>AI Photo Intelligence is designed around local processing. Import your folders, run classification and search your library without making your personal photos part of a cloud workflow.</p></div><a className="text-link" href="/download" onClick={goDownload}>Get the app <ArrowRight size={16} /></a></section><section className="section preview-section" id="preview"><div className="section-heading centered"><span className="eyebrow">Product preview</span><h2>See your library differently.</h2><p>Replace these preview slots with production screenshots in <code>website/public/screenshots/</code> when they are ready.</p></div><div className="screenshot-slots"><div className="screenshot-slot"><span>Screenshot 01</span><small>Smart Albums</small></div><div className="screenshot-slot"><span>Screenshot 02</span><small>Duplicates</small></div><div className="screenshot-slot"><span>Screenshot 03</span><small>Natural language search</small></div></div></section><DownloadSection /><Faq /></main>}
    <footer className="site-footer"><a className="site-logo" href="/" onClick={goHome}><span className="brand-mark">AI</span><span>AI Photo Intelligence</span></a><div><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="mailto:contact@example.com">Contact</a><a href="/download" onClick={goDownload}>Download</a></div><span>© 2026 AI Photo Intelligence</span></footer>
  </div>;
}

export default App;
