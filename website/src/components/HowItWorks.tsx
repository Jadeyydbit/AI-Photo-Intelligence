import { Download, FolderOpen, Sparkles } from "lucide-react";

const steps = [
  ["01", "Download the application", "Choose the installer for your operating system and install it on your computer.", Download],
  ["02", "Import your photo folders", "Point the app at your local folders. Your originals remain where they are.", FolderOpen],
  ["03", "Let local AI organize", "Classify, search, favorite and find duplicates from one private library.", Sparkles],
] as const;

export function HowItWorks() {
  return <section className="section soft-section" id="how-it-works"><div className="section-heading centered"><span className="eyebrow">How it works</span><h2>From folders to answers in three steps.</h2></div><div className="steps-grid">{steps.map(([number, title, description, Icon]) => <article className="step-card" key={number}><span className="step-number">{number}</span><Icon size={24} /><h3>{title}</h3><p>{description}</p></article>)}</div></section>;
}
