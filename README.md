# AI Photo Intelligence

## Team responsibilities

This project is divided into four ownership areas so each team member has a
clear primary responsibility. The areas are connected, so changes that affect
another area should be discussed before merging.

The detailed repository map is available in
[project structure.md](<project%20structure.md>), and setup commands are
available in [how to run.md](<how%20to%20run.md>).

### 1. Siddesh — Frontend and user experience

**Primary area:** `frontend/src/`

Siddesh owns the React, TypeScript, and CSS experience of the desktop
application.

Responsibilities:

- Main application layout and navigation in [App.tsx](<frontend/src/App.tsx>)
- Home, Search, Favorites, Smart Albums, Duplicates, and Settings screens
- Reusable components in `frontend/src/components/`
- Page components in `frontend/src/pages/`
- Responsive layouts, dark-theme styling, accessibility, and user feedback
- Connecting UI actions to the existing backend API without changing API
  response contracts
- Frontend TypeScript checks and Vite production builds
- Keeping frontend state local and predictable
- Preserving existing routing, empty states, loading states, and error
  messages when improving a screen
- Reviewing changes to shared types in `frontend/src/types/`
- Checking desktop and narrow-window layouts before merging
- Avoiding direct filesystem mutation from presentation components

Siddesh should review changes that modify `App.tsx`, page components, shared
CSS, frontend services, or frontend API calls.

### 2. Jaden — Backend APIs and application integration

**Primary area:** `backend/main.py` and `backend/api/`

Jaden owns the FastAPI service and the integration between the frontend and
the local backend.

Responsibilities:

- FastAPI routes and request validation
- API compatibility with the React frontend
- Photo indexing, search, classification, duplicate, album, and metadata
  endpoints
- Error handling, local service startup, and backend version reporting
- Keeping frontend API contracts stable when backend internals change
- Backend run instructions and API smoke testing
- Maintaining clear request and response models
- Handling invalid paths, unavailable files, and service failures explicitly
- Coordinating endpoint changes with the frontend before changing payloads
- Keeping local-only processing behavior intact
- Maintaining development and packaged startup compatibility
- Verifying affected endpoints with realistic local requests

Jaden should review changes to `backend/main.py`, backend route behavior,
request/response models, CORS configuration, and frontend/backend integration
assumptions.

### 3. Sebastian — AI, image processing, and data systems

**Primary area:** `backend/ai/`, `backend/vector/`, and `backend/database/`

Sebastian owns the local intelligence and persistence layers.

Responsibilities:

- Local AI models for classification, embeddings, OCR, and object detection
- Duplicate detection and similarity calculations
- Qdrant vector storage and retrieval
- SQLite photo-library persistence
- Image metadata extraction and processing performance
- Model loading, caching, and resource usage
- Verifying that AI and data changes preserve existing result structures
- Measuring changes to inference time and memory use
- Preserving model fallback and unavailable-model error behavior
- Keeping embedding dimensions and Qdrant collection expectations compatible
- Avoiding accidental re-indexing or destructive database migrations
- Documenting model files, downloads, and runtime requirements

Sebastian should review changes to `backend/ai/`, `backend/vector/`,
`backend/database/`, model-loading code, similarity thresholds, and persistent
data formats.

### 4. Hemant — Tauri desktop, packaging, releases, and website

**Primary areas:** `frontend/src-tauri/`, `scripts/`, and `website/`

Hemant owns the desktop distribution and public product experience.

Responsibilities:

- Tauri configuration and Rust commands in `frontend/src-tauri/`
- Packaging the Python backend with the desktop installer
- Starting and stopping the bundled backend safely
- Persistent application-data paths during upgrades
- Windows installer builds, release artifacts, and future updater work
- Public download website and installer download configuration
- Release version coordination between frontend, backend, Tauri, and website
- Code signing and production distribution preparation
- Maintaining the installer resource layout
- Ensuring the packaged backend starts on a local-only address
- Ensuring updates replace binaries without replacing user data
- Maintaining Windows installer output and release naming
- Keeping website download URLs pointed at real release artifacts
- Coordinating release builds and documenting release checklists

Hemant should review changes to `frontend/src-tauri/`, `scripts/`, release
configuration, website download configuration, installer resources, and
version metadata.

## Collaboration and review process

### Before starting work

1. Identify which ownership area the change belongs to.
2. Check the relevant documentation and existing implementation.
3. Confirm whether the change affects an API contract, persistent data, or
   installer behavior.
4. Tell the relevant owner before changing a shared boundary.

### Pull request expectations

Every pull request should include:

- A short summary of the user-visible or technical change
- The files or ownership areas affected
- Any API, data, model, or release impact
- Commands used for validation
- Screenshots for meaningful UI changes
- A note confirming that unrelated functionality was preserved

### Shared boundaries

- Frontend and backend communicate through the existing local API.
- Backend response structures should not be changed casually.
- AI and persistence changes must preserve existing user data.
- Tauri updates must not overwrite SQLite, Qdrant, favorites, albums, or
  imported photo paths.
- Website changes must remain independent from the desktop runtime.

### Recommended review ownership

| Change | Required reviewer |
|---|---|
| React page, component, or CSS | Siddesh |
| FastAPI endpoint or API payload | Jaden |
| Model, embeddings, duplicate detection, SQLite, or Qdrant | Sebastian |
| Tauri, packaging, installer, updater, or website downloads | Hemant |
| Cross-layer feature | Owner of the changed boundary plus the other affected owner |

## GitHub repository guidance

Do not commit local dependencies, generated installers, private photo data,
SQLite files, Qdrant indexes, Python virtual environments, or downloaded model
weights. The root [.gitignore](<.gitignore>) excludes these items.

Commit source code, manifests, lockfiles, documentation, configuration, and
small static assets required to build the application. Release installers
should be attached to GitHub Releases or hosted by the public download
website, not committed into the source repository.
