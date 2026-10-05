import {
  type ReactElement,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Heart,
  ImageOff,
  LoaderCircle,
  Sparkles,
} from "lucide-react";

import { AlbumCard } from "../components/AlbumCard";

import type { PhotoItem } from "../types/photos";

/* =========================================================
   TYPES
========================================================= */

interface AlbumsProps {
  photos: PhotoItem[];

  classifications: Record<
    string,
    AIClassification
  >;

  analyzing: boolean;

  analyzedCount: number;

  analysisError: string | null;

  analysisComplete: boolean;

  /* FAVORITES */
  favoritePaths: Set<string>;

  onToggleFavorite: (
    path: string,
  ) => void;
}

interface AIPrediction {
  category: string;
  confidence: number;
}

interface AIClassification {
  path: string;
  predictions: AIPrediction[];
  albums: string[];
}

interface SmartAlbum {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  photos: PhotoItem[];
}

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

  /*
   * Remove file:/// if present.
   */
  normalized =
    normalized.replace(
      /^file:\/\/\/?/i,
      "",
    );

  /*
   * Convert \\?\C:\... to C:\...
   */
  if (
    normalized.startsWith(
      "\\\\?\\",
    )
  ) {
    normalized =
      normalized.slice(4);
  }

  /*
   * Normalize separators.
   */
  normalized =
    normalized.replace(
      /\\/g,
      "/",
    );

  /*
   * Repair /C:/... -> C:/...
   */
  normalized =
    normalized.replace(
      /^\/+([A-Za-z]:)/,
      "$1",
    );

  /*
   * Collapse repeated separators.
   */
  normalized =
    normalized.replace(
      /\/+/g,
      "/",
    );

  return normalized.toLowerCase();
}

function pathKey(
  path: string,
): string {
  return normalizePath(path);
}

/* =========================================================
   ALBUM DEFINITIONS
========================================================= */

const ALBUM_DEFINITIONS = [
  {
    id: "travel",
    title: "Travel",
    description:
      "Travel, vacations and destinations with strong travel evidence",
    icon: "✈️",
    category: "Travel",
  },
  {
    id: "scenery",
    title: "Scenery",
    description:
      "Nature, landscapes, beaches, mountains, water and plants",
    icon: "🌿",
    category: "Scenery",
  },
  {
    id: "people",
    title: "People",
    description:
      "People, portraits and group photographs",
    icon: "👨‍👩‍👧",
    category: "People",
  },
  {
    id: "animals",
    title: "Animals",
    description:
      "Animals, pets and wildlife",
    icon: "🐾",
    category: "Animals",
  },
  {
    id: "food",
    title: "Food",
    description:
      "Food, meals, dishes and restaurants",
    icon: "🍔",
    category: "Food",
  },
  {
    id: "vehicles",
    title: "Vehicles",
    description:
      "Cars, motorcycles, buses and other vehicles",
    icon: "🚗",
    category: "Vehicles",
  },
  {
    id: "places",
    title: "Places",
    description:
      "Buildings, cities, streets and architecture",
    icon: "🏙️",
    category: "Places",
  },
  {
    id: "screenshots",
    title: "Screenshots",
    description:
      "Screenshots and screen captures",
    icon: "📱",
    category: "Screenshots",
  },
  {
    id: "products",
    title: "Products",
    description:
      "Clothes, shopping items, accessories and sports products",
    icon: "🛍️",
    category: "Products",
  },
  {
    id: "other",
    title: "Other",
    description:
      "Photos that do not fit the other smart album categories",
    icon: "📦",
    category: "Other",
  },
] as const;

/* =========================================================
   COMPONENT
========================================================= */

export function Albums({
  photos,
  classifications,
  analyzing,
  analyzedCount,
  analysisError,
  analysisComplete,
  favoritePaths,
  onToggleFavorite,
}: AlbumsProps): ReactElement {
  const [
    selectedAlbumId,
    setSelectedAlbumId,
  ] = useState<string | null>(
    null,
  );

  /* =======================================================
     FAVORITES LOOKUP
  ======================================================= */

  const favoriteSet =
  useMemo(
    () => new Set(favoritePaths),
    [favoritePaths],
  );

  const isFavorite = (
    path: string,
  ): boolean =>
    favoriteSet.has(
      pathKey(path),
    );

  /* =======================================================
     CLASSIFICATION LOOKUP
  ======================================================= */

  const classificationByPath =
    useMemo(() => {
      const map = new Map<
        string,
        AIClassification
      >();

      for (
        const classification of Object.values(
          classifications,
        )
      ) {
        if (
          !classification ||
          typeof classification.path !==
            "string"
        ) {
          continue;
        }

        map.set(
          pathKey(
            classification.path,
          ),
          classification,
        );
      }

      return map;
    }, [classifications]);

  /* =======================================================
     BUILD SMART ALBUMS
  ======================================================= */

  const albums =
    useMemo<SmartAlbum[]>(
      () =>
        ALBUM_DEFINITIONS.map(
          (definition) => {
            const albumPhotos =
              photos.filter(
                (photo) => {
                  const result =
                    classificationByPath.get(
                      pathKey(
                        photo.path,
                      ),
                    );

                  if (!result) {
                    return definition.category === "Other";
                  }

                  /*
                   * IMPORTANT:
                   *
                   * App.tsx owns classification.
                   *
                   * The backend's `albums`
                   * array is the final source
                   * of truth.
                   */
                  if (!Array.isArray(result.albums)) {
                    return false;
                  }

                  if (definition.category === "Other") {
                    const recognizedCategories =
                      ALBUM_DEFINITIONS
                        .filter(
                          (item) => item.category !== "Other",
                        )
                        .map((item) => item.category);

                    return (
                      result.albums.length === 0 ||
                      !result.albums.some((category) =>
                        recognizedCategories.includes(category as never),
                      )
                    );
                  }

                  return result.albums.includes(
                    definition.category,
                  );
                },
              );

            return {
              id: definition.id,
              title:
                definition.title,
              description:
                definition.description,
              icon:
                definition.icon,
              category:
                definition.category,
              photos:
                albumPhotos,
            };
          },
        ),
      [
        photos,
        classificationByPath,
      ],
    );

  /* =======================================================
     COUNTS
  ======================================================= */

  const categoryCounts =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      for (
        const album of albums
      ) {
        counts[
          album.category
        ] = album.photos.length;
      }

      return counts;
    }, [albums]);

  /* =======================================================
     SELECTED ALBUM
  ======================================================= */

  const selectedAlbum =
    albums.find(
      (album) =>
        album.id === selectedAlbumId,
    );

  /* =======================================================
     EMPTY LIBRARY
  ======================================================= */

  if (photos.length === 0) {
    return (
      <section className="content-area">
        <div className="page-header">
          <div className="smart-albums-heading">
            <div>
              <h1>
                Smart Albums
              </h1>

              <p className="subtitle">
                Automatically organize
                your photos using
                local AI.
              </p>
            </div>
          </div>
        </div>

        <div className="all-photos-panel">
          <div className="empty-state">
            <div className="empty-box">
              <ImageOff
                size={42}
              />
            </div>

            <p>
              Please import photos
              first.
            </p>

            <p>
              Smart Albums will appear
              after your photos are
              analyzed.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* =======================================================
     ALBUM DETAIL
  ======================================================= */

  if (selectedAlbum) {
    return (
      <section className="content-area">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            setSelectedAlbumId(null)
          }
        >
          <ArrowLeft size={18} />
          Back to Smart Albums
        </button>

        <div className="smart-album-detail-header">
          <div className="smart-title-icon">
            {selectedAlbum.icon}
          </div>

          <div>
            <h1>
              {selectedAlbum.title}
            </h1>

            <p className="subtitle">
              {
                selectedAlbum.description
              }
            </p>
          </div>
        </div>

        <div className="all-photos-panel">
          {selectedAlbum.photos
            .length === 0 ? (
            <div className="empty-state">
              <div className="empty-box">
                <ImageOff size={42} />
              </div>

              <p>
                No photos match this
                album yet.
              </p>

              <p>
                The AI has not found a
                reliable match.
              </p>
            </div>
          ) : (
            <div
              className="album-detail-grid"
              role="list"
            >
              {selectedAlbum.photos.map(
                (photo) => {
                  const photoIsFavorite =
                    isFavorite(
                      photo.path,
                    );

                  return (
                    <div
                      className="all-photo-card"
                      key={photo.path}
                      role="listitem"
                      style={{
                        position:
                          "relative",
                      }}
                    >
                      <img
                        src={photo.src}
                        alt={photo.name}
                        loading="lazy"
                      />

                      {/* FAVORITE HEART */}
                      <button
                        type="button"
                        className="album-favorite-button"
                        aria-label={
                          photoIsFavorite
                            ? `Remove ${photo.name} from favorites`
                            : `Add ${photo.name} to favorites`
                        }
                        aria-pressed={
                          photoIsFavorite
                        }
                        onClick={() =>
                          onToggleFavorite(
                            photo.path,
                          )
                        }
                      >
                        <Heart
                          size={20}
                          strokeWidth={2.2}
                          fill={
                            photoIsFavorite
                              ? "#ef4444"
                              : "none"
                          }
                          color={
                            photoIsFavorite
                              ? "#ef4444"
                              : "#ffffff"
                          }
                        />
                      </button>

                      <div className="photo-name">
                        {photo.name}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  /* =======================================================
     PROGRESS
  ======================================================= */

  const progress =
    photos.length > 0
      ? Math.min(
          100,
          Math.round(
            (analyzedCount /
              photos.length) *
              100,
          ),
        )
      : 0;

  /* =======================================================
     MAIN PAGE
  ======================================================= */

  return (
    <section className="content-area">
      <div className="page-header">
        <div className="smart-albums-heading">
          <div>
            <h1>
              Smart Albums
            </h1>

            <p className="subtitle">
              Your photos are
              organized using local
              AI classification.
            </p>
          </div>
        </div>
      </div>

      <div className="smart-album-info">
        <Sparkles size={17} />

        <span>
          Smart Albums use the
          classification results
          produced by the local AI
          backend. Each card below
          contains the actual photos
          assigned to that category.
        </span>
      </div>

      {/* =================================================
          ANALYSIS
      ================================================= */}

      {analyzing && (
        <div className="smart-album-analysis">
          <LoaderCircle
            size={19}
            className="spin"
          />

          <div className="analysis-status-content">
            <strong>
              Analyzing your photos
            </strong>

            <span>
              {analyzedCount} of{" "}
              {photos.length} photos
              analyzed
            </span>
          </div>

          <div className="analysis-progress">
            <div
              className="analysis-progress-bar"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <span className="analysis-percent">
            {progress}%
          </span>
        </div>
      )}

      {/* =================================================
          CATEGORY SUMMARY
      ================================================= */}

      <div className="smart-album-info">
        <Sparkles size={17} />

        <span>
          Travel:{" "}
          <strong>
            {categoryCounts.Travel ??
              0}
          </strong>
          {" • "}
          Scenery:{" "}
          <strong>
            {categoryCounts.Scenery ??
              0}
          </strong>
          {" • "}
          People:{" "}
          <strong>
            {categoryCounts.People ??
              0}
          </strong>
          {" • "}
          Animals:{" "}
          <strong>
            {categoryCounts.Animals ??
              0}
          </strong>
          {" • "}
          Food:{" "}
          <strong>
            {categoryCounts.Food ??
              0}
          </strong>
          {" • "}
          Vehicles:{" "}
          <strong>
            {categoryCounts.Vehicles ??
              0}
          </strong>
          {" • "}
          Places:{" "}
          <strong>
            {categoryCounts.Places ??
              0}
          </strong>
          {" • "}
          Screenshots:{" "}
          <strong>
            {categoryCounts.Screenshots ??
              0}
          </strong>
          {" • "}
          Other:{" "}
          <strong>
            {categoryCounts.Other ?? 0}
          </strong>
        </span>
      </div>

      {/* =================================================
          SUCCESS
      ================================================= */}

      {analysisComplete &&
        !analyzing && (
          <div className="smart-album-success">
            <Sparkles size={17} />

            <span>
              AI analysis complete.
              Your Smart Albums are
              ready.
            </span>
          </div>
        )}

      {/* =================================================
          ERROR
      ================================================= */}

      {analysisError && (
        <div className="smart-album-error">
          {analysisError}
        </div>
      )}

      {/* =================================================
          ALBUM CARDS
      ================================================= */}

      <div className="albums-grid">
        {albums.map((album) => (
          <AlbumCard
            key={album.id}
            title={album.title}
            description={
              album.description
            }
            icon={album.icon}
            photos={album.photos}
            onClick={() =>
              setSelectedAlbumId(
                album.id,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}