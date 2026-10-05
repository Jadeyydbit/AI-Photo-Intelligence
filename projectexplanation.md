# AI Photo Intelligence — Project Explanation

## Project overview

AI Photo Intelligence is a privacy-focused desktop photo library. It helps
users import local photo folders, organize images, search using natural
language, classify photos with local AI, find duplicates, manage favorites,
and create downloadable albums.

The application is designed to process photos locally. The desktop interface,
backend, AI services, databases, and public download website are kept as
separate layers so each part can be developed and released safely.

## Main project parts

### Desktop frontend

Location: `frontend/`

The frontend is built with React, TypeScript, Vite, and CSS. It provides:

- Home dashboard
- Photo import controls
- Photo library and metadata views
- Natural-language search
- Favorites
- Smart Albums
- Duplicate detection results
- Custom album creation and ZIP downloads
- Settings

The main application routing and shared state are in
`frontend/src/App.tsx`. Reusable UI components are in
`frontend/src/components/`, while larger screen implementations are in
`frontend/src/pages/`.

### FastAPI backend

Location: `backend/`

The backend is a local FastAPI service. It exposes the API used by the
frontend for:

- Importing and indexing photo paths
- Synchronizing the local photo database
- Searching photos
- Classifying images
- Detecting duplicate groups
- Reading database and vector-store status
- Reporting the backend version

The backend runs on `127.0.0.1:8000` during development. The packaged Tauri
application starts its bundled backend automatically.

### AI and image processing

Location: `backend/ai/`

The local AI layer handles image understanding tasks such as:

- Image embeddings
- Natural-language image search support
- Photo classification
- Object detection
- OCR
- Duplicate and similarity analysis

AI results are consumed by the backend and returned to the frontend using the
existing typed response structures.

### SQLite and Qdrant persistence

Locations:

- `backend/database/`
- `backend/vector/`

SQLite stores persistent photo-library records and related metadata. Qdrant
stores and searches vector embeddings used by semantic search and AI photo
features.

The packaged application stores these files in the persistent application-data
directory instead of the installer directory. This prevents an application
update from deleting the user's local photo index or vector data.

### Tauri desktop shell

Location: `frontend/src-tauri/`

Tauri wraps the React frontend as a native desktop application. Its Rust
commands handle desktop-specific operations such as scanning local photo
folders and extracting image metadata.

Tauri also:

- Starts the packaged FastAPI backend
- Provides the backend with its persistent data directory
- Bundles the backend executable into the installer
- Produces the Windows NSIS installer

### Public website

Location: `website/`

The website is an independent React/Vite project for:

- Explaining the product
- Showing application features
- Detecting the visitor's operating system
- Providing installer download links
- Hosting the public download page

The website does not run the desktop backend and does not access the user's
photo library.

## Data and request flow

1. The user opens the desktop application.
2. Tauri starts the bundled FastAPI backend.
3. The React frontend sends requests to `http://127.0.0.1:8000`.
4. The backend validates the request and performs the requested operation.
5. AI modules process images or text when needed.
6. SQLite and Qdrant persist the local library and embeddings.
7. The backend returns the existing response shape to the frontend.
8. The frontend updates the relevant screen without changing the user's
   original photo files.

## Update and release model

The desktop release contains both:

- The Tauri/React application
- The packaged Python/FastAPI backend

The backend package is generated with the `scripts/build-backend.ps1` script.
The Tauri build then includes that executable as an installer resource.

User data is stored outside the installation folder. Therefore, a future
installer or updater can replace the application binaries while preserving:

- SQLite photo records
- Qdrant vectors
- Imported photo paths
- Favorites and custom album data
- Local caches

## Important design rules

- Do not add automatic photo deletion.
- Do not change backend API response structures without coordinating with the
  frontend owner.
- Do not store user data inside the install directory.
- Do not replace local processing with cloud uploads without an explicit
  product decision.
- Keep the public website independent from the desktop application's runtime.
