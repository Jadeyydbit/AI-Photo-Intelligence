# AI Photo Intelligence Website

This is an independent React/Vite marketing and download website. It does
not modify or depend on the Tauri desktop application at `../frontend`.

## Local development

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\website"
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Production build

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\website"
npm run build
npm run preview
```

## Connecting real installers

Installer URLs are centralized in `src/config.ts` under `DOWNLOADS`. Replace
the three placeholder paths with URLs from GitHub Releases, Cloudflare R2, S3,
or another static file host.

The Windows path currently contains the locally generated `0.1.1` installer so
the download button works during local testing. The root `.gitignore` excludes
large installer binaries from the GitHub source repository.

For production:

1. Build the current desktop installer.
2. Upload the generated installer from
   `frontend\src-tauri\target\release\bundle\nsis\` to a GitHub Release,
   Cloudflare R2, S3, or another installer host.
3. Replace the Windows URL in `src/config.ts` with the hosted URL.
4. Rebuild and redeploy the website.

Replacing the installer on the development computer does not update a website
that has already been deployed. The website must be redeployed after changing
the download URL or release version.

The host must serve the installer files publicly over HTTPS:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: `.AppImage`

The desktop application's Tauri release workflow should build and publish
these artifacts. After publishing a new release, update only `APP_VERSION`
and the three `DOWNLOADS.*.url` values, then rebuild and redeploy this website.

The desktop installer is generated with:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm run tauri -- build
```

For a release build, the bundled FastAPI backend is rebuilt as a windowless
executable and included in the installer. Users should not see a backend
terminal window when launching the installed application.

The Windows NSIS installer is written to:

```text
frontend\src-tauri\target\release\bundle\nsis\
```

This unsigned development installer may trigger a Windows SmartScreen warning.
Code-signing is recommended before public distribution.

## Screenshot slots

The product preview is intentionally asset-free. Replace the visual slots in
`src/App.tsx` with images stored in `public/screenshots/` when production
screenshots are ready. This does not affect the desktop application.
