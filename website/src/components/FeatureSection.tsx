import { BrainCircuit, Copy, Database, Heart, Images, Map, Search, ShieldCheck, Tags } from "lucide-react";

const features = [
  ["Smart Albums", "Let local classification organize photos into useful categories.", Images],
  ["AI Photo Classification", "Understand the subjects and categories in your library.", BrainCircuit],
  ["Natural Language Search", "Find photos using the way you remember them.", Search],
  ["Duplicate Detection", "Spot exact duplicates and visually similar photos.", Copy],
  ["Favorites", "Keep the photos you love most in one place.", Heart],
  ["Local AI Processing", "Run the intelligence on your own computer.", ShieldCheck],
  ["Persistent Photo Library", "Keep indexed photo records with SQLite.", Database],
  ["Metadata Organization", "Use dates, dimensions, locations and other metadata.", Tags],
  ["Privacy-focused by design", "Your photo library stays on your device.", Map],
] as const;

export function FeatureSection() {
  return <section className="section" id="features"><div className="section-heading"><span className="eyebrow"><SparkIcon /> Features</span><h2>A calmer way to manage a growing library.</h2><p>Tools that help you find and understand your photos without sending the library away.</p></div><div className="feature-grid">{features.map(([title, description, Icon]) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{description}</p></article>)}</div></section>;
}

function SparkIcon() {
  return <span aria-hidden="true">✦</span>;
}
