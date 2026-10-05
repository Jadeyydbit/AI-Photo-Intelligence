# How to Run AI Photo Intelligence

Start the backend and frontend in two separate PowerShell windows.

## 1. Start the backend

From the project root:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2"

& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend runs at:

```text
http://127.0.0.1:8000
```

## 2. Start the frontend

Open a second PowerShell window:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"

npm install
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

## Optional backend activation

Instead of using the direct Python executable command, activate the backend
virtual environment:

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\.venv\Scripts\Activate.ps1

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

## Build the frontend

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm run build
```

## Build the Tauri installer

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

## Preview the production build

```powershell
cd "C:\Users\Jaden\Desktop\AI-Photo-Intelligence -2\frontend"
npm run preview
```

## Troubleshooting

If you see `No module named uvicorn`, use the backend Python executable
directly:

```powershell
& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The virtual environment is located at:

```text
backend\.venv
```

Therefore, from the project root, do not use:

```powershell
.\.venv\Scripts\Activate.ps1
```
