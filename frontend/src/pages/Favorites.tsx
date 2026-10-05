import {
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Heart,
  ImageOff,
} from "lucide-react";

import type { PhotoItem } from "../types/photos";

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

  normalized =
    normalized.replace(
      /^file:\/\/\/?/i,
      "",
    );

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
      /\\/g,
      "/",
    );

  normalized =
    normalized.replace(
      /^\/+([A-Za-z]:)/,
      "$1",
    );

  normalized =
    normalized.replace(
      /\/+/g,
      "/",
    );

  return normalized.toLowerCase();
}

/* =========================================================
   LOAD FAVORITES
========================================================= */

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
  } catch (error) {
    console.error(
      "Unable to load favorites:",
      error,
    );

    return new Set<string>();
  }
}

/* =========================================================
   SAVE FAVORITES
========================================================= */

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

/* =========================================================
   COMPONENT
========================================================= */

export function Favorites(): ReactElement {
  const [
    photos,
    setPhotos,
  ] = useState<PhotoItem[]>([]);

  const [
    favoritePaths,
    setFavoritePaths,
  ] = useState<Set<string>>(
    loadFavoritePaths,
  );

  /* =======================================================
     LOAD LIBRARY PHOTOS
  ======================================================= */

  useEffect(() => {
    const loadLibrary =
      (): void => {
        try {
          const raw =
            localStorage.getItem(
              "ai-photo-library",
            );

          if (!raw) {
            setPhotos([]);
            return;
          }

          const parsed: unknown =
            JSON.parse(raw);

          if (!Array.isArray(parsed)) {
            setPhotos([]);
            return;
          }

          const validPhotos =
            parsed.filter(
              (
                photo,
              ): photo is PhotoItem => {
                if (
                  !photo ||
                  typeof photo !==
                    "object"
                ) {
                  return false;
                }

                const item =
                  photo as Record<
                    string,
                    unknown
                  >;

                return (
                  typeof item.path ===
                    "string" &&
                  typeof item.src ===
                    "string" &&
                  typeof item.name ===
                    "string"
                );
              },
            );

          setPhotos(validPhotos);
        } catch (error) {
          console.error(
            "Unable to load photo library:",
            error,
          );

          setPhotos([]);
        }
      };

    loadLibrary();

    window.addEventListener(
      "storage",
      loadLibrary,
    );

    window.addEventListener(
      FAVORITES_CHANGED_EVENT,
      loadLibrary,
    );

    return () => {
      window.removeEventListener(
        "storage",
        loadLibrary,
      );

      window.removeEventListener(
        FAVORITES_CHANGED_EVENT,
        loadLibrary,
      );
    };
  }, []);

  /* =======================================================
     SYNC FAVORITES
  ======================================================= */

  useEffect(() => {
    const syncFavorites =
      (): void => {
        setFavoritePaths(
          loadFavoritePaths(),
        );
      };

    window.addEventListener(
      "storage",
      syncFavorites,
    );

    window.addEventListener(
      FAVORITES_CHANGED_EVENT,
      syncFavorites,
    );

    return () => {
      window.removeEventListener(
        "storage",
        syncFavorites,
      );

      window.removeEventListener(
        FAVORITES_CHANGED_EVENT,
        syncFavorites,
      );
    };
  }, []);

  /* =======================================================
     FAVORITE PHOTOS
  ======================================================= */

  const favoritePhotos =
    useMemo(() => {
      return photos.filter(
        (photo) =>
          favoritePaths.has(
            normalizePath(
              photo.path,
            ),
          ),
      );
    }, [
      photos,
      favoritePaths,
    ]);

  /* =======================================================
     REMOVE FAVORITE
  ======================================================= */

  const removeFavorite = (
    path: string,
  ): void => {
    const next =
      new Set(
        favoritePaths,
      );

    next.delete(
      normalizePath(path),
    );

    setFavoritePaths(next);

    saveFavoritePaths(next);
  };

  /* =======================================================
     EMPTY STATE
  ======================================================= */

  if (
    favoritePhotos.length === 0
  ) {
    return (
      <section className="content-area">
        <div className="page-header">
          <div className="smart-albums-heading">
            <Heart
              size={30}
              className="smart-sparkle"
            />

            <div>
              <h1>
                Favorites
              </h1>

              <p className="subtitle">
                Keep the photos you love
                most in one place.
              </p>
            </div>
          </div>
        </div>

        <div className="all-photos-panel">
          <div className="empty-state">
            <div className="empty-box">
              <Heart
                size={42}
              />
            </div>

            <p>
              No favorite photos yet.
            </p>

            <p>
              Open a photo and press the
              heart to keep it in your
              Favorites.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* =======================================================
     FAVORITES GRID
  ======================================================= */

  return (
    <section className="content-area">
      <div className="page-header">
        <div className="smart-albums-heading">
          <Heart
            size={30}
            className="smart-sparkle"
            fill="currentColor"
          />

          <div>
            <h1>
              Favorites
            </h1>

            <p className="subtitle">
              {favoritePhotos.length}{" "}
              favorite{" "}
              {favoritePhotos.length ===
              1
                ? "photo"
                : "photos"}{" "}
              saved in your library.
            </p>
          </div>
        </div>
      </div>

      <div className="all-photos-panel">
        <div
          className="all-photos-grid"
          role="list"
          aria-label="Favorite photos"
        >
          {favoritePhotos.map(
            (photo) => (
              <div
                key={photo.path}
                className="all-photo-card"
                role="listitem"
              >
                <img
                  src={photo.src}
                  alt={photo.name}
                  loading="lazy"
                />

                <button
                  type="button"
                  className="favorite-photo-button favorite-photo-button-active"
                  aria-label={`Remove ${photo.name} from favorites`}
                  onClick={() =>
                    removeFavorite(
                      photo.path,
                    )
                  }
                >
                  <Heart
                    size={18}
                    fill="currentColor"
                  />
                </button>

                <div className="photo-name">
                  {photo.name}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}