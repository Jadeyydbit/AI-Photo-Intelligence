import { useState } from "react";
import { ChevronDown } from "lucide-react";

const questions = [
  ["Is my data uploaded to the cloud?", "The desktop app is designed for local processing. Its photo import, classification, search and duplicate workflows run on your device. This website does not upload your photo library."],
  ["Where are my photos stored?", "Your original photos stay in the folders you import. The desktop app maintains local indexes and metadata to make the library searchable."],
  ["Does the application work offline?", "The core photo library workflows are designed to run locally. Initial model setup and future application updates may require an internet connection."],
  ["Which operating systems are supported?", "Installer downloads are provided for Windows, macOS and Linux. Check the release notes for the exact supported versions of each release."],
  ["How do I uninstall the application?", "Use your operating system's normal application uninstall process. Your original photo files are not deleted by the desktop app."],
  ["How do I update the application?", "Download and install the latest release from this website. Release-specific instructions will be included with each production version."],
] as const;

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return <section className="section faq-section" id="faq"><div className="section-heading centered"><span className="eyebrow">FAQ</span><h2>Good to know before you begin.</h2></div><div className="faq-list">{questions.map(([question, answer], index) => <div className={`faq-item ${open === index ? "open" : ""}`} key={question}><button type="button" onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index}><span>{question}</span><ChevronDown size={18} /></button>{open === index && <p>{answer}</p>}</div>)}</div></section>;
}
