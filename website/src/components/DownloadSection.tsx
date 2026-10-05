import { useMemo, useState } from "react";
import { ArrowDownToLine, Check, Download, Monitor, Terminal } from "lucide-react";
import {
  APP_VERSION,
  DOWNLOADS,
  PLATFORM_ORDER,
  type Platform,
} from "../config";

function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("mac")) return "macos";
  return "linux";
}

function platformIcon(platform: Platform): typeof Monitor {
  return platform === "linux" ? Terminal : Monitor;
}

type DownloadSectionProps = {
  compact?: boolean;
};

export function DownloadSection({ compact = false }: DownloadSectionProps) {
  const [recommended] = useState<Platform>(() => detectPlatform());
  const [notice, setNotice] = useState<string | null>(null);

  const orderedPlatforms = useMemo(
    () => [recommended, ...PLATFORM_ORDER.filter((platform) => platform !== recommended)],
    [recommended],
  );

  const download = (platform: Platform): void => {
    setNotice(`Your ${DOWNLOADS[platform].label} download should begin shortly.`);
  };

  return (
    <section className={compact ? "download-section compact" : "download-section"} id="download">
      <div className="section-heading centered">
        <span className="eyebrow"><ArrowDownToLine size={15} /> Download</span>
        <h2>Bring your library home.</h2>
        <p>Choose the installer for your computer. AI Photo Intelligence runs locally after installation.</p>
      </div>

      <div className="download-grid">
        {orderedPlatforms.map((platform) => {
          const config = DOWNLOADS[platform];
          const Icon = platformIcon(platform);
          const isRecommended = platform === recommended;
          return (
            <article className={`download-card ${isRecommended ? "recommended" : ""}`} key={platform}>
              {isRecommended && <span className="recommended-badge"><Check size={13} /> Recommended for your device</span>}
              <div className="platform-icon"><Icon size={24} /></div>
              <h3>{config.label}</h3>
              <p>{config.fileName}</p>
              <a className="button button-secondary full-width" href={config.url} download onClick={() => download(platform)}>
                <Download size={17} /> Download for {config.label}
              </a>
            </article>
          );
        })}
      </div>
      <p className="download-version">Version {APP_VERSION} · You will need to install the downloaded file manually.</p>
      {notice && <p className="download-notice" role="status">{notice}</p>}
    </section>
  );
}
