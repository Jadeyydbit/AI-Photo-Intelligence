# AI Photo Intelligence — Project Structure

This document explains the purpose of each source, configuration, and
documentation file in the repository. Dependency folders, generated build
folders, local databases, downloaded models, and installer binaries are not
part of the GitHub source tree.

## Repository overview

```text
AI-Photo-Intelligence/
├── backend/                  FastAPI service, AI, SQLite, and Qdrant
├── frontend/                 React/Vite desktop application
├── website/                  Independent public marketing/download website
├── scripts/                  Build and packaging automation
├── README.md                 Team ownership and collaboration rules
├── how to run.md             Development and release commands
├── projectexplanation.md     High-level architecture explanation
├── project structure.md      This file-by-file repository guide
└── .gitignore                Files excluded from GitHub
```

## Root files

### `README.md`

Defines the four-person ownership model:

- Siddesh: frontend and user experience
- Jaden: backend APIs and integration
- Sebastian: AI, image processing, SQLite, and Qdrant
- Hemant: Tauri, packaging, releases, and website

It also defines review boundaries, pull request expectations, shared rules,
and GitHub repository guidance.

### `how to run.md`

Contains the exact PowerShell commands for:

- Starting the FastAPI backend
- Starting the React frontend
- Activating the Python environment
- Building and previewing the frontend
- Building the Tauri installer
- Rebuilding the packaged backend
- Troubleshooting common startup errors

### `projectexplanation.md`

Explains the product architecture, request flow, persistence strategy, AI
layer, Tauri shell, website, and update model in conceptual terms.

### `project structure.md`

Provides this detailed map of the repository and explains the purpose of each
source and configuration file.

### `.gitignore`

Prevents local-only or generated files from being committed. This includes
`node_modules`, `.venv`, build output, Tauri targets, SQLite/Qdrant data,
model weights, installers, and editor caches.

## Backend

The `backend/` directory contains the local Python/FastAPI service.

### Backend package files

| File | Purpose |
|---|---|
| `backend/__init__.py` | Marks `backend` as a Python package. |
| `backend/main.py` | Creates the FastAPI app, defines API routes, validates requests, connects AI/data services, reports status, and starts the local server when run directly. |
| `backend/paths.py` | Resolves the persistent data directory. It supports `AI_PHOTO_DATA_DIR`, which lets the Tauri shell keep user data outside the installation directory. |
| `backend/version.py` | Stores the backend version used by FastAPI and `/api/version`. |
| `backend/requirements.txt` | Lists Python dependencies needed by the backend and local AI runtime. |

### `backend/ai/`

| File | Purpose |
|---|---|
| `backend/ai/__init__.py` | Marks the AI directory as a Python package. |
| `backend/ai/embeddings.py` | Creates image/text embeddings and supports vector-based similarity and duplicate grouping. |
| `backend/ai/face.py` | Contains face-related image-processing functionality used by the AI layer. |
| `backend/ai/objects.py` | Loads and uses the local CLIP/object-detection models for image classification and visual understanding. |
| `backend/ai/ocr.py` | Extracts readable text from images using OCR processing. |

### `backend/database/`

| File | Purpose |
|---|---|
| `backend/database/__init__.py` | Marks the database directory as a Python package. |
| `backend/database/photo_db.py` | Stores and reads photo-library records and related metadata in SQLite. |
| `backend/database/sqlite_db.py` | Provides SQLite connection and database helper functions used by the backend. |

### `backend/vector/`

| File | Purpose |
|---|---|
| `backend/vector/__init__.py` | Marks the vector directory as a Python package. |
| `backend/vector/qdrant_store.py` | Creates the local Qdrant client, manages the photo embedding collection, stores vectors, searches vectors, and reports vector status. |

### Backend data that should stay local

The following are runtime data, not source code:

- `backend/data/photos.db`
- `backend/data/qdrant/`
- `backend/data/smart_album_cache.json`
- Python `__pycache__/` folders
- `backend/.venv/`

These files contain local user state, indexes, caches, or installed
dependencies and are excluded by `.gitignore`.

## Frontend desktop application

The `frontend/` directory contains the React/Vite interface that runs in the
browser during development and inside Tauri in the installed desktop app.

### Frontend root files

| File | Purpose |
|---|---|
| `frontend/index.html` | Vite HTML entry document containing the application root element. |
| `frontend/package.json` | Defines frontend dependencies and scripts for development, builds, backend packaging, preview, and Tauri. |
| `frontend/package-lock.json` | Locks exact npm dependency versions for repeatable installs. |
| `frontend/tsconfig.json` | TypeScript compiler configuration for the frontend. |
| `frontend/vite.config.js` | Vite development and production build configuration. |

### `frontend/src/`

| File | Purpose |
|---|---|
| `frontend/src/main.tsx` | React entry point that mounts the application. |
| `frontend/src/App.tsx` | Main application shell, navigation, shared state, API calls, favorites, classification, duplicate scanning, settings, and screen routing. |
| `frontend/src/index.css` | Global dark-theme variables, layout rules, component styles, responsive rules, duplicate styles, album styles, and settings styles. |
| `frontend/src/vite-env.d.ts` | Vite and TypeScript environment declarations. |

### `frontend/src/components/`

| File | Purpose |
|---|---|
| `AlbumCard.tsx` | Displays an album summary and its photo count/preview. |
| `ImportPanel.tsx` | Provides the photo-folder import interface and import status. |
| `SearchBar.tsx` | Accepts natural-language photo searches and displays search activity/results integration. |
| `Sidebar.tsx` | Displays the main application navigation. |
| `StatCard.tsx` | Displays reusable dashboard statistics. |

### `frontend/src/pages/`

| File | Purpose |
|---|---|
| `Albums.tsx` | Displays Smart Albums and saved albums. |
| `AllPhotos.tsx` | Displays the complete imported photo collection. |
| `CreateAlbums.tsx` | Creates custom albums from available/favorite photos and generates ZIP downloads without deleting source files. |
| `Duplicates.tsx` | Presents duplicate groups, filters, similarity labels, photo grids, metadata, and comparison views. |
| `Favorites.tsx` | Displays locally saved favorite photos. |
| `Home.tsx` | Displays the dashboard/home experience. |

### `frontend/src/services/`

| File | Purpose |
|---|---|
| `frontend/src/services/photoImport.ts` | Coordinates photo-folder import behavior and synchronizes imported photos with the backend. |

### `frontend/src/types/`

| File | Purpose |
|---|---|
| `frontend/src/types/photos.ts` | Shared TypeScript types for photo metadata, classification results, duplicate results, albums, and related frontend data. |

## Tauri desktop shell

The `frontend/src-tauri/` directory turns the frontend into a native desktop
application and bundles the backend.

| File or directory | Purpose |
|---|---|
| `frontend/src-tauri/Cargo.toml` | Rust package manifest and Tauri dependency definitions. |
| `frontend/src-tauri/Cargo.lock` | Locks Rust dependency versions. |
| `frontend/src-tauri/Build.rs` | Rust build script used by the Tauri build process. |
| `frontend/src-tauri/src/main.rs` | Native process entry point that calls the Tauri library entry point. |
| `frontend/src-tauri/src/lib.rs` | Tauri commands, local folder scanning, image metadata extraction, backend process startup, and application initialization. |
| `frontend/src-tauri/tauri.conf.json` | Product identity, window settings, frontend build commands, resource bundling, and Windows NSIS installer configuration. |
| `frontend/src-tauri/capabilities/default.json` | Tauri permissions/capabilities available to the application window. |
| `frontend/src-tauri/gen/schemas/acl-manifests.json` | Generated permission and access-control schema data. |
| `frontend/src-tauri/gen/schemas/capabilities.json` | Generated capability schema used by Tauri tooling. |
| `frontend/src-tauri/gen/schemas/desktop-schema.json` | Generated desktop API schema. |
| `frontend/src-tauri/gen/schemas/windows-schema.json` | Generated Windows-specific Tauri schema. |
| `frontend/src-tauri/icons/icon.png` | General application icon source. |
| `frontend/src-tauri/icons/icon.ico` | Windows icon bundle. |
| `frontend/src-tauri/icons/icon.icns` | macOS icon bundle. |
| `frontend/src-tauri/icons/32x32.png` | 32-pixel application icon. |
| `frontend/src-tauri/icons/128x128.png` | 128-pixel application icon. |
| `frontend/src-tauri/icons/128x128@2x.png` | Retina/high-density 128-pixel icon. |
| `frontend/src-tauri/icons/Square30x30Logo.png` | Windows 30-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square44x44Logo.png` | Windows 44-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square71x71Logo.png` | Windows 71-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square89x89Logo.png` | Windows 89-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square107x107Logo.png` | Windows 107-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square142x142Logo.png` | Windows 142-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square150x150Logo.png` | Windows 150-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square284x284Logo.png` | Windows 284-pixel tile/logo asset. |
| `frontend/src-tauri/icons/Square310x310Logo.png` | Windows 310-pixel tile/logo asset. |
| `frontend/src-tauri/icons/StoreLogo.png` | Windows Store logo asset. |
| `frontend/src-tauri/target/` | Generated Rust build output; do not commit it. |

## Build scripts

### `scripts/build-backend.ps1`

Uses PyInstaller to package `backend/main.py` and the local Python AI runtime
into `frontend/backend-dist/ai-photo-backend.exe`. It reuses an existing
package for normal local builds and supports
`AI_PHOTO_FORCE_BACKEND_BUILD=1` for release rebuilds.

### `frontend/backend-dist/`

Generated packaged backend output. It is intentionally excluded from Git and
is recreated before a release installer build.

## Public website

The `website/` directory is an independent React/Vite project. It does not
connect to the local desktop backend or access user photos.

| File | Purpose |
|---|---|
| `website/index.html` | Website HTML entry document. |
| `website/package.json` | Website dependencies and development/build scripts. |
| `website/package-lock.json` | Locks website npm dependencies. |
| `website/tsconfig.json` | Website TypeScript configuration. |
| `website/vite.config.ts` | Website Vite configuration. |
| `website/README.md` | Website-specific run, build, hosting, and installer release instructions. |
| `website/src/main.tsx` | Website React entry point. |
| `website/src/App.tsx` | Website page layout and homepage/download route handling. |
| `website/src/config.ts` | Central download URLs and release configuration. |
| `website/src/styles.css` | Website dark-first responsive marketing styles. |
| `website/src/vite-env.d.ts` | Vite environment declarations. |
| `website/src/components/Hero.tsx` | Hero section and primary product CTA. |
| `website/src/components/FeatureSection.tsx` | Product feature cards and descriptions. |
| `website/src/components/HowItWorks.tsx` | Three-step product workflow section. |
| `website/src/components/DownloadSection.tsx` | OS detection, platform cards, download links, and download feedback. |
| `website/src/components/Faq.tsx` | Frequently asked questions section. |
| `website/public/downloads/` | Local installer hosting path for testing; production installers should use releases or dedicated file hosting. |

The website's local Windows installer file, when present, is
`website/public/downloads/windows/AI-Photo-Intelligence-Setup.exe`. It is a
generated release artifact and should not be committed to the source
repository.

## Root model files

`yolo11n.pt` and `yolo11s.pt` are downloaded YOLO model weights used by local
object-detection code. They are large binary dependencies, not application
source files, and are excluded from GitHub by `.gitignore`. A clean setup
should document or automate their download rather than commit them.

## GitHub upload checklist

Before pushing the repository:

1. Confirm `.gitignore` is present.
2. Do not add `node_modules/`, `backend/.venv/`, `backend/data/`, Tauri
   `target/`, model weights, or installer binaries.
3. Keep `package-lock.json` and `Cargo.lock` because they make builds
   reproducible.
4. Check that no personal photo paths, credentials, `.env` files, or local
   databases are staged.
5. Run the frontend build and backend syntax checks.
6. Build release installers separately and attach them to a GitHub Release.
