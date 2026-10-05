export type Platform = "windows" | "macos" | "linux";

export type DownloadConfig = {
  label: string;
  fileName: string;
  url: string;
};

export const APP_VERSION = "0.1.0";

/*
 * Replace these paths with the final GitHub Release, R2, S3, or other
 * production URLs when installers are published. No installer files are
 * included in this website project.
 */
export const DOWNLOADS: Record<Platform, DownloadConfig> = {
  windows: {
    label: "Windows",
    fileName: "AI-Photo-Intelligence-Setup.exe",
    url: "/downloads/windows/AI-Photo-Intelligence-Setup.exe",
  },
  macos: {
    label: "macOS",
    fileName: "AI-Photo-Intelligence.dmg",
    url: "/downloads/macos/AI-Photo-Intelligence.dmg",
  },
  linux: {
    label: "Linux",
    fileName: "AI-Photo-Intelligence.AppImage",
    url: "/downloads/linux/AI-Photo-Intelligence.AppImage",
  },
};

export const PLATFORM_ORDER: Platform[] = ["windows", "macos", "linux"];
