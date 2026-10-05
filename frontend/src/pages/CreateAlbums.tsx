import {
  type ReactElement,
  useMemo,
  useState,
} from "react";

import {
  Check,
  Download,
  FolderPlus,
  LoaderCircle,
  X,
} from "lucide-react";

import JSZip from "jszip";

import type { PhotoItem } from "../types/photos";

const CUSTOM_ALBUMS_STORAGE_KEY =
  "ai-photo-custom-albums";

interface CustomAlbum {
  id: string;
  name: string;
  paths: string[];
}

interface CreateAlbumsProps {
  photos: PhotoItem[];
  favoritePaths: Set<string>;
}

function normalizePath(path: string): string {
  let normalized = path.trim();

  if (!normalized) {
    return "";
  }

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original path when it is not a valid encoded URL.
  }

  normalized = normalized.replace(/^file:\/\/\/?/i, "");
  normalized = normalized.replace(/^\\\\\?\\/, "");
  normalized = normalized.replace(/^\\\?\\/, "");
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/^\/+([A-Za-z]:)/, "$1");
  normalized = normalized.replace(/\/+/g, "/");

  return normalized.toLowerCase();
}

function loadCustomAlbums(): CustomAlbum[] {
  try {
    const raw = localStorage.getItem(
      CUSTOM_ALBUMS_STORAGE_KEY,
    );
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (album): album is CustomAlbum =>
        Boolean(
          album &&
            typeof album === "object" &&
            typeof (album as CustomAlbum).id === "string" &&
            typeof (album as CustomAlbum).name === "string" &&
            Array.isArray((album as CustomAlbum).paths),
        ),
    );
  } catch {
    return [];
  }
}

function saveCustomAlbums(albums: CustomAlbum[]): void {
  localStorage.setItem(
    CUSTOM_ALBUMS_STORAGE_KEY,
    JSON.stringify(albums),
  );
}

export function CreateAlbums({
  photos,
  favoritePaths,
}: CreateAlbumsProps): ReactElement {
  const [albumName, setAlbumName] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    new Set(),
  );
  const [customAlbums, setCustomAlbums] = useState<CustomAlbum[]>(
    loadCustomAlbums,
  );
  const [downloadingAlbumId, setDownloadingAlbumId] = useState<string | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const favoritePhotos = useMemo(
    () =>
      photos.filter((photo) =>
        favoritePaths.has(normalizePath(photo.path)),
      ),
    [photos, favoritePaths],
  );

  const photoByPath = useMemo(() => {
    const lookup = new Map<string, PhotoItem>();

    for (const photo of photos) {
      lookup.set(normalizePath(photo.path), photo);
    }

    return lookup;
  }, [photos]);

  const togglePhoto = (path: string): void => {
    const key = normalizePath(path);
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const createAlbum = (): void => {
    const trimmedName = albumName.trim();
    if (!trimmedName || selectedPaths.size === 0) {
      return;
    }

    const nextAlbum: CustomAlbum = {
      id: `${Date.now()}-${trimmedName.toLowerCase().replace(/\s+/g, "-")}`,
      name: trimmedName,
      paths: Array.from(selectedPaths),
    };
    const nextAlbums = [...customAlbums, nextAlbum];

    saveCustomAlbums(nextAlbums);
    setCustomAlbums(nextAlbums);
    setAlbumName("");
    setSelectedPaths(new Set());
  };

  const downloadAlbum = async (album: CustomAlbum): Promise<void> => {
    setDownloadingAlbumId(album.id);
    setDownloadError(null);
    setDownloadSuccess(null);

    try {
      const albumPhotos = album.paths
        .map((path) => photoByPath.get(normalizePath(path)))
        .filter((photo): photo is PhotoItem => photo !== undefined);

      if (albumPhotos.length === 0) {
        throw new Error(
          "None of the photos in this album are available in the current library.",
        );
      }

      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const photo of albumPhotos) {
        const response = await fetch(photo.src);
        if (!response.ok) {
          throw new Error(`Unable to read ${photo.name}.`);
        }

        let filename = photo.name.trim() || "photo";
        const originalFilename = filename;
        let suffix = 2;

        while (usedNames.has(filename.toLowerCase())) {
          const extensionIndex = originalFilename.lastIndexOf(".");
          const extension =
            extensionIndex > 0
              ? originalFilename.slice(extensionIndex)
              : "";
          const basename =
            extensionIndex > 0
              ? originalFilename.slice(0, extensionIndex)
              : originalFilename;
          filename = `${basename} (${suffix})${extension}`;
          suffix += 1;
        }

        usedNames.add(filename.toLowerCase());
        zip.file(filename, await response.blob());
      }

      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${album.name.trim() || "album"}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadSuccess(
        `${album.name.trim() || "Album"}.zip downloaded successfully.`,
      );
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Unable to download this album.",
      );
    } finally {
      setDownloadingAlbumId(null);
    }
  };

  return (
    <section className="content-area create-albums-page">
      <div className="page-header">
        <div>
          <h1>Create Albums</h1>
          <p className="subtitle">
            Build personal albums from the photos you have saved as favorites.
          </p>
        </div>
      </div>

      <div className="create-album-form panel-card">
        <div className="create-album-form-heading">
          <div>
            <h2>New album</h2>
            <p>Select favorites below, name the album, and create it.</p>
          </div>
          <span className="photo-count">
            {selectedPaths.size} selected
          </span>
        </div>

        <div className="create-album-controls">
          <input
            value={albumName}
            onChange={(event) => setAlbumName(event.target.value)}
            placeholder="Album name"
            aria-label="Album name"
            maxLength={60}
          />
          <button
            type="button"
            className="create-album-button"
            onClick={createAlbum}
            disabled={!albumName.trim() || selectedPaths.size === 0}
          >
            <FolderPlus size={17} />
            Create album
          </button>
        </div>
      </div>

      {favoritePhotos.length === 0 ? (
        <div className="recent-panel create-album-empty">
          <h2>No favorite photos yet</h2>
          <p>Use the heart button on a photo, then return here to make an album.</p>
        </div>
      ) : (
        <div className="favorite-picker-grid">
          {favoritePhotos.map((photo) => {
            const path = normalizePath(photo.path);
            const selected = selectedPaths.has(path);

            return (
              <button
                type="button"
                className={`favorite-picker-card ${selected ? "selected" : ""}`}
                key={photo.path}
                onClick={() => togglePhoto(photo.path)}
                aria-pressed={selected}
                aria-label={`${selected ? "Remove" : "Add"} ${photo.name}`}
              >
                <img src={photo.src} alt={photo.name} loading="lazy" />
                <span className="favorite-picker-check">
                  {selected && <Check size={15} />}
                </span>
                <span className="favorite-picker-name">{photo.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {customAlbums.length > 0 && (
        <div className="custom-albums-section">
          <div className="section-heading">
            <h2>Your albums</h2>
            <span className="photo-count">{customAlbums.length}</span>
          </div>
          <div className="custom-albums-list">
            {customAlbums.map((album) => (
              <div className="custom-album-row" key={album.id}>
                <div>
                  <strong>{album.name}</strong>
                  <span>{album.paths.length} {album.paths.length === 1 ? "photo" : "photos"}</span>
                </div>
                <button
                  type="button"
                  className="custom-album-download-button"
                  onClick={() => void downloadAlbum(album)}
                  disabled={downloadingAlbumId !== null}
                  aria-label={`Download ${album.name} as ZIP`}
                >
                  {downloadingAlbumId === album.id ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Download size={17} />
                  )}
                  {downloadingAlbumId === album.id
                    ? "Preparing..."
                    : "Download ZIP"}
                </button>
              </div>
            ))}
          </div>
          {downloadError && (
            <p className="custom-album-download-error" role="alert">
              {downloadError}
            </p>
          )}
        </div>
      )}

      {(downloadSuccess || downloadError) && (
        <div
          className={`album-download-toast ${
            downloadSuccess
              ? "album-download-toast-success"
              : "album-download-toast-error"
          }`}
          role={downloadSuccess ? "status" : "alert"}
        >
          <div>
            <strong>{downloadSuccess ? "ZIP downloaded" : "Download failed"}</strong>
            <span>{downloadSuccess ?? downloadError}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss download notification"
            onClick={() => {
              setDownloadSuccess(null);
              setDownloadError(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
