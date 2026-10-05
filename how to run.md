# How to Run AI Photo Intelligence

The project has a FastAPI backend and a Vite/React frontend. Start them in
two separate PowerShell windows.

## 1. Start the backend

From the project root, run:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2"

& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend will be available at:

```text
http://127.0.0.1:8000
```

The project already contains the backend virtual environment at
`backend\.venv`. Using its Python executable directly avoids accidentally
using the system Python installation.

### Optional: activate the backend environment

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\.venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

## 2. Start the frontend

In a second PowerShell window, run:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

## 3. Build the frontend

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm run build
```

Preview the production build:

```powershell
npm run preview
```

## 4. Build the Tauri installer

The installer includes the packaged Python/FastAPI backend and starts it
automatically:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm run tauri -- build
```

For a release build that rebuilds the backend executable first:

```powershell
$env:AI_PHOTO_FORCE_BACKEND_BUILD = "1"
npm run tauri -- build
Remove-Item Env:AI_PHOTO_FORCE_BACKEND_BUILD
```

Normal local Tauri builds reuse the existing
`frontend\backend-dist\ai-photo-backend.exe` when it is already present.

## Troubleshooting

### `No module named uvicorn`

Use the backend Python executable directly:

```powershell
& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### The virtual environment cannot be activated

The virtual environment is inside the `backend` folder:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

Do not use `.\.venv\Scripts\Activate.ps1` from the project root.

### Start order

Start the backend before using features that call the AI API, including photo
indexing and duplicate scanning. Keep both terminal windows open while using
the development application.
