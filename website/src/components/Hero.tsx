import { ArrowRight, Download, Search, Sparkles } from "lucide-react";

type HeroProps = {
  onExplore: () => void;
};

export function Hero({ onExplore }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={15} /> Local intelligence for your memories</span>
        <h1>Your photos.<br /><span>Understood.</span></h1>
        <p className="hero-subtitle">Your private AI-powered photo library. Organize, search, classify and find duplicates locally on your device.</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#download"><Download size={18} /> Download AI Photo Intelligence</a>
          <button className="button button-ghost" type="button" onClick={onExplore}>Explore features <ArrowRight size={17} /></button>
        </div>
        <div className="hero-proof"><span><span className="status-dot" /> Local-first by design</span><span>No cloud upload required</span></div>
      </div>
      <div className="product-mockup" aria-label="AI Photo Intelligence desktop application preview">
        <div className="mockup-topbar"><span className="mockup-brand"><span className="brand-mark">AI</span> AI Photo Intelligence</span><span className="mockup-window-controls">— □ ×</span></div>
        <div className="mockup-body">
          <aside className="mockup-sidebar"><strong>AI Photo<br />Intelligence</strong><span className="mockup-nav active">⌂ Home</span><span className="mockup-nav">▧ All Photos</span><span className="mockup-nav">◫ Albums</span><span className="mockup-nav">◇ Duplicates</span><span className="mockup-nav">♡ Favorites</span></aside>
          <div className="mockup-content"><div className="mockup-search"><Search size={13} /> Search your photos...</div><div className="mockup-title"><span><small>YOUR LIBRARY</small><strong>Photo intelligence, at home.</strong></span><span className="mockup-pill">Local AI</span></div><div className="mockup-stats"><span><b>248</b> Photos</span><span><b>12</b> Smart albums</span><span><b>4</b> Duplicate groups</span></div><div className="mockup-photo-grid"><div className="mock-photo photo-one" /><div className="mock-photo photo-two" /><div className="mock-photo photo-three" /><div className="mock-photo photo-four" /></div></div>
        </div>
      </div>
    </section>
  );
}
