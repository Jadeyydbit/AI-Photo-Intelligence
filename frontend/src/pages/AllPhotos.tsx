import {
  type ReactElement,
  useEffect,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  FolderX,
  Heart,
  ImageOff,
  MapPin,
  Trash2,
  X,
} from "lucide-react";

import type { PhotoItem } from "../types/photos";

interface AllPhotosProps {
  photos: PhotoItem[];
  folderName: string | null;
  onRemoveFolder: () => void;
  isSearching?: boolean;
}

/* =========================================================
   FAVORITES STORAGE
========================================================= */

const FAVORITES_STORAGE_KEY =
  "ai-photo-favorites";

const FAVORITES_CHANGED_EVENT =
  "ai-photo-favorites-changed";

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function normalizePath(
  path: string,
): string {
  let normalized =
    path.trim();

  if (!normalized) {
    return "";
  }

  if (
    normalized
      .toLowerCase()
      .startsWith("file:///")
  ) {
    normalized =
      normalized.slice(8);
  } else if (
    normalized
      .toLowerCase()
      .startsWith("file://")
  ) {
    normalized =
      normalized.slice(7);
  }

  if (
    normalized.startsWith(
      "\\\\?\\",
    )
  ) {
    normalized =
      normalized.slice(4);
  }

  if (
    normalized.startsWith(
      "\\?\\",
    )
  ) {
    normalized =
      normalized.slice(3);
  }

  normalized =
    normalized.replace(
      /[\\/]+/g,
      "/",
    );

  normalized =
    normalized.replace(
      /^\/+([A-Za-z]:\/)/,
      "$1",
    );

  return normalized.toLowerCase();
}

function loadFavoritePaths(): Set<string> {
  try {
    const raw =
      localStorage.getItem(
        FAVORITES_STORAGE_KEY,
      );

    if (!raw) {
      return new Set<string>();
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
        .map(normalizePath)
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

function saveFavoritePaths(
  favorites: Set<string>,
): void {
  try {
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(
        Array.from(
          favorites,
        ),
      ),
    );

    window.dispatchEvent(
      new CustomEvent(
        FAVORITES_CHANGED_EVENT,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save favorites:",
      error,
    );
  }
}

function toggleFavorite(
  path: string,
): Set<string> {
  const favorites =
    loadFavoritePaths();

  const key =
    normalizePath(path);

  if (!key) {
    return favorites;
  }

  if (
    favorites.has(key)
  ) {
    favorites.delete(key);
  } else {
    favorites.add(key);
  }

  saveFavoritePaths(
    favorites,
  );

  return favorites;
}

/* =========================================================
   METADATA HELPERS
========================================================= */

function formatFileSize(
  bytes: number | null,
): string {
  if (bytes === null || bytes <= 0) {
    return "Not available";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  let value = bytes;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex <
      units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(
    unitIndex === 0 ? 0 : 1,
  )} ${units[unitIndex]}`;
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const normalized =
    value
      .replace(/^"|"$/g, "")
      .trim();

  const match =
    normalized.match(
      /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
    );

  if (!match) {
    return normalized;
  }

  return `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
}

function formatCoordinate(
  value: number | null,
  positive: string,
  negative: string,
): string {
  if (value === null) {
    return "Not available";
  }

  const direction =
    value >= 0
      ? positive
      : negative;

  return `${Math.abs(
    value,
  ).toFixed(5)}° ${direction}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export function AllPhotos({
  photos,
  folderName,
  onRemoveFolder,
  isSearching = false,
}: AllPhotosProps): ReactElement {
  const [
    selectedIndex,
    setSelectedIndex,
  ] = useState<number | null>(
    null,
  );

  const [
    favoritePaths,
    setFavoritePaths,
  ] = useState<Set<string>>(
    loadFavoritePaths,
  );

  const selectedPhoto =
    selectedIndex !== null
      ? photos[selectedIndex]
      : null;

  /* =======================================================
     FAVORITES SYNC
  ======================================================= */

  useEffect(() => {
    const syncFavorites =
      (): void => {
        setFavoritePaths(
          loadFavoritePaths(),
        );
      };

    window.addEventListener(
      FAVORITES_CHANGED_EVENT,
      syncFavorites,
    );

    return () => {
      window.removeEventListener(
        FAVORITES_CHANGED_EVENT,
        syncFavorites,
      );
    };
  }, []);

  /* =======================================================
     REMOVE INVALID FAVORITES
  ======================================================= */

  useEffect(() => {
    const validKeys =
      new Set(
        photos.map(
          (photo) =>
            normalizePath(
              photo.path,
            ),
        ),
      );

    let changed = false;

    const cleaned =
      new Set<string>();

    for (
      const key of favoritePaths
    ) {
      if (
        validKeys.has(key)
      ) {
        cleaned.add(key);
      } else {
        changed = true;
      }
    }

    if (changed) {
      setFavoritePaths(
        cleaned,
      );

      saveFavoritePaths(
        cleaned,
      );
    }
  }, [
    photos,
    favoritePaths,
  ]);

  const isFavorite = (
    path: string,
  ): boolean =>
    favoritePaths.has(
      normalizePath(path),
    );

  const handleFavoriteClick =
    (
      event: React.MouseEvent,
      path: string,
    ): void => {
      event.stopPropagation();

      const next =
        toggleFavorite(path);

      setFavoritePaths(next);
    };

  /* =======================================================
     KEYBOARD VIEWER
  ======================================================= */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ): void => {
      if (
        selectedIndex === null
      ) {
        return;
      }

      if (
        event.key === "Escape"
      ) {
        setSelectedIndex(
          null,
        );
      }

      if (
        event.key ===
          "ArrowRight" &&
        photos.length > 1
      ) {
        setSelectedIndex(
          (current) =>
            current === null
              ? 0
              : (current + 1) %
                photos.length,
        );
      }

      if (
        event.key ===
          "ArrowLeft" &&
        photos.length > 1
      ) {
        setSelectedIndex(
          (current) =>
            current === null
              ? 0
              : (current -
                  1 +
                  photos.length) %
                photos.length,
        );
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
  }, [
    selectedIndex,
    photos.length,
  ]);

  const showPrevious =
    (): void => {
      if (
        photos.length === 0
      ) {
        return;
      }

      setSelectedIndex(
        (current) =>
          current === null
            ? 0
            : (current -
                1 +
                photos.length) %
              photos.length,
      );
    };

  const showNext =
    (): void => {
      if (
        photos.length === 0
      ) {
        return;
      }

      setSelectedIndex(
        (current) =>
          current === null
            ? 0
            : (current + 1) %
              photos.length,
      );
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <section className="content-area">
      <div className="page-header">
        <h1>
          All Photos
        </h1>

        <p className="subtitle">
          {isSearching
            ? photos.length > 0
              ? `Showing ${photos.length} matching photo${
                  photos.length ===
                  1
                    ? ""
                    : "s"
                }.`
              : "No photos matched your search."
            : photos.length > 0
              ? `Showing all ${photos.length} photos in your library.`
              : "Your complete imported photo library."}
        </p>

        {folderName &&
          photos.length > 0 &&
          !isSearching && (
            <div className="imported-folder-label">
              <FolderX size={16} />

              <span>
                Imported folder:{" "}
                <strong>
                  {folderName}
                </strong>
              </span>
            </div>
          )}
      </div>

      <div className="all-photos-panel">
        {photos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-box">
              <ImageOff
                size={42}
              />
            </div>

            <p>
              {isSearching
                ? "No matching photos found."
                : "Please import photos first."}
            </p>

            <p>
              {isSearching
                ? "Try a different search."
                : "Choose a folder from Home to get started."}
            </p>
          </div>
        ) : (
          <div
            className="all-photos-grid"
            role="list"
            aria-label="All imported photos"
          >
            {photos.map(
              (
                photo,
                index,
              ) => (
                <button
                  key={photo.path}
                  type="button"
                  className="all-photo-card"
                  onClick={() =>
                    setSelectedIndex(
                      index,
                    )
                  }
                  aria-label={`Open ${photo.name}`}
                >
                  <img
                    src={photo.src}
                    alt={photo.name}
                    loading="lazy"
                  />

                  {/* FAVORITE HEART */}
                  <span
                    className="favorite-photo-button"
                    role="button"
                    tabIndex={0}
                    aria-label={
                      isFavorite(
                        photo.path,
                      )
                        ? `Remove ${photo.name} from favorites`
                        : `Add ${photo.name} to favorites`
                    }
                    aria-pressed={isFavorite(
                      photo.path,
                    )}
                    onClick={(
                      event,
                    ) =>
                      handleFavoriteClick(
                        event,
                        photo.path,
                      )
                    }
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        event.key ===
                          "Enter" ||
                        event.key ===
                          " "
                      ) {
                        event.preventDefault();

                        handleFavoriteClick(
                          event as unknown as React.MouseEvent,
                          photo.path,
                        );
                      }
                    }}
                  >
                    <Heart
                      size={18}
                      fill={
                        isFavorite(
                          photo.path,
                        )
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </span>

                  <div className="photo-name">
                    {photo.name}
                  </div>
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {photos.length > 0 &&
        !isSearching && (
          <div className="remove-folder-bar">
            <div className="remove-folder-info">
              <FolderX
                size={18}
              />

              <div>
                <strong>
                  Finished with this folder?
                </strong>

                <span>
                  Remove it from AI
                  Photo Intelligence.
                  Your original
                  files will stay
                  on your computer.
                </span>
              </div>
            </div>

            <button
              type="button"
              className="remove-folder-button"
              onClick={
                onRemoveFolder
              }
            >
              <Trash2
                size={17}
              />
              Remove Folder
            </button>
          </div>
        )}

      {/* ===================================================
          PHOTO VIEWER
      =================================================== */}

      {selectedPhoto && (
        <div
          className="photo-viewer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() =>
            setSelectedIndex(
              null,
            )
          }
        >
          <button
            type="button"
            className="photo-viewer-close"
            onClick={(
              event,
            ) => {
              event.stopPropagation();

              setSelectedIndex(
                null,
              );
            }}
            aria-label="Close photo viewer"
          >
            <X size={24} />
          </button>

          {photos.length > 1 && (
            <button
              type="button"
              className="photo-viewer-arrow photo-viewer-prev"
              onClick={(
                event,
              ) => {
                event.stopPropagation();
                showPrevious();
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft
                size={30}
              />
            </button>
          )}

          <div
            className="photo-viewer-content"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="photo-viewer-image-wrap">
              <img
                src={
                  selectedPhoto.src
                }
                alt={
                  selectedPhoto.name
                }
                className="photo-viewer-image"
              />
            </div>

            {/* VIEWER FOOTER */}
            <div className="photo-viewer-footer">
              <div className="photo-viewer-name">
                {
                  selectedPhoto.name
                }
              </div>

              <div className="photo-viewer-count">
                {(selectedIndex ??
                  0) + 1}{" "}
                /{" "}
                {photos.length}
              </div>
            </div>

            {/* VIEWER FAVORITE HEART */}
            <button
              type="button"
              className="photo-viewer-favorite"
              aria-label={
                isFavorite(
                  selectedPhoto.path,
                )
                  ? `Remove ${selectedPhoto.name} from favorites`
                  : `Add ${selectedPhoto.name} to favorites`
              }
              aria-pressed={isFavorite(
                selectedPhoto.path,
              )}
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                const next =
                  toggleFavorite(
                    selectedPhoto.path,
                  );

                setFavoritePaths(
                  next,
                );
              }}
            >
              <Heart
                size={22}
                fill={
                  isFavorite(
                    selectedPhoto.path,
                  )
                    ? "currentColor"
                    : "none"
                }
              />
            </button>

            <div className="photo-metadata-panel">
              <div className="metadata-item">
                <span className="metadata-label">
                  Date Taken
                </span>

                <span className="metadata-value">
                  {formatDate(
                    selectedPhoto.dateTaken,
                  )}
                </span>
              </div>

              <div className="metadata-item">
                <span className="metadata-label">
                  Dimensions
                </span>

                <span className="metadata-value">
                  {selectedPhoto.width &&
                  selectedPhoto.height
                    ? `${selectedPhoto.width} × ${selectedPhoto.height}`
                    : "Not available"}
                </span>
              </div>

              <div className="metadata-item">
                <span className="metadata-label">
                  File Size
                </span>

                <span className="metadata-value">
                  {formatFileSize(
                    selectedPhoto.fileSize,
                  )}
                </span>
              </div>

              <div className="metadata-item metadata-location">
                <span className="metadata-label">
                  <MapPin
                    size={14}
                  />
                  Location
                </span>

                <span className="metadata-value">
                  {selectedPhoto.latitude !==
                    null &&
                  selectedPhoto.longitude !==
                    null
                    ? `${formatCoordinate(
                        selectedPhoto.latitude,
                        "N",
                        "S",
                      )}, ${formatCoordinate(
                        selectedPhoto.longitude,
                        "E",
                        "W",
                      )}`
                    : "Not available"}
                </span>
              </div>
            </div>
          </div>

          {photos.length > 1 && (
            <button
              type="button"
              className="photo-viewer-arrow photo-viewer-next"
              onClick={(
                event,
              ) => {
                event.stopPropagation();
                showNext();
              }}
              aria-label="Next photo"
            >
              <ChevronRight
                size={30}
              />
            </button>
          )}
        </div>
      )}
    </section>
  );
}