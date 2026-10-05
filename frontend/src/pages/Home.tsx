import type { ReactElement } from "react";

import {
  Heart,
  ImageOff,
} from "lucide-react";

import { ImportPanel } from "../components/ImportPanel";
import { StatCard } from "../components/StatCard";

import type { StatCardData } from "../components/StatCard";
import type { PhotoItem } from "../types/photos";

interface HomeProps {
  stats: StatCardData[];
  photos: PhotoItem[];
  isScanning: boolean;
  onChooseFolder: () => void;
  favoritePaths: Set<string>;
  onToggleFavorite: (path: string) => void;
}

function favoritePathKey(path: string): string {
  return path
    .trim()
    .replace(/^file:\/\/\/?/i, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+([A-Za-z]:)/, "$1")
    .toLowerCase();
}

export function Home({
  stats,
  photos,
  isScanning,
  onChooseFolder,
  favoritePaths,
  onToggleFavorite,
}: HomeProps): ReactElement {
  const recentPhotos =
    photos.slice(0, 6);

  const homeStats =
    stats.slice(0, 10);

  return (
    <section className="content-area">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <h1>Welcome to AI Photo Intelligence</h1>

      <p className="subtitle">
        Your private, AI-powered photo library.
        All processing happens locally on your device.
      </p>

      {/* =====================================================
          PHOTO STATISTICS
      ===================================================== */}

      <div
        className="stats-grid"
      >
        {homeStats.map(
          (item) => (
            <StatCard
              key={item.label}
              item={item}
            />
          ),
        )}
      </div>

      {/* =====================================================
          IMPORT PHOTOS
      ===================================================== */}

      <ImportPanel
        title="Import Your Photos"
        description={
          photos.length > 0
            ? "Add more folders to keep finding moments faster."
            : "Please import a folder to get started."
        }
        buttonLabel={
          photos.length > 0
            ? "Add Another Folder"
            : "Choose Folder"
        }
        onChooseFolder={
          onChooseFolder
        }
        loading={isScanning}
      />

      {photos.length === 0 && !isScanning && (
        <div className="before-import-placeholder">
          <div className="before-import-placeholder-item">
            <strong>Smart Albums</strong>
            <span>Your photos will be organized automatically.</span>
          </div>
          <div className="before-import-placeholder-item">
            <strong>Favorites</strong>
            <span>Like photos to collect them for custom albums.</span>
          </div>
          <div className="before-import-placeholder-item">
            <strong>Private by design</strong>
            <span>Analysis stays on this device.</span>
          </div>
        </div>
      )}

      {/* =====================================================
          RECENT PHOTOS
      ===================================================== */}

      <div className="recent-panel">
        <div className="section-heading">
          <h3>
            Recent Photos
          </h3>

          {photos.length > 6 && (
            <span className="photo-count">
              Showing 6 of{" "}
              {photos.length}
            </span>
          )}
        </div>

        {/* ===================================================
            ONLY SHOW IMPORT MESSAGE DURING REAL IMPORT
        =================================================== */}

        {isScanning ? (
          <div className="empty-state">
            <p className="scan-message">
              Importing photos...
            </p>

            <p>
              Reading your selected folder.
            </p>
          </div>
        ) : recentPhotos.length > 0 ? (
          /* =================================================
             PHOTOS
          ================================================= */

          <div
            className="recent-grid"
            role="list"
            aria-label="Recent photos"
          >
            {recentPhotos.map(
              (
                photo: PhotoItem,
              ) => (
                <div
                  className="recent-photo-card"
                  key={photo.path}
                  role="listitem"
                >
                  <img
                    src={photo.src}
                    alt={photo.name}
                    loading="lazy"
                  />

                  <button
                    type="button"
                    className="home-favorite-button"
                    aria-label={
                      favoritePaths.has(favoritePathKey(photo.path))
                        ? `Remove ${photo.name} from favorites`
                        : `Add ${photo.name} to favorites`
                    }
                    aria-pressed={favoritePaths.has(favoritePathKey(photo.path))}
                    onClick={() => onToggleFavorite(photo.path)}
                  >
                    <Heart
                      size={17}
                      fill={
                        favoritePaths.has(favoritePathKey(photo.path))
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </div>
              ),
            )}
          </div>
        ) : (
          /* =================================================
             EMPTY STATE
          ================================================= */

          <div className="empty-state">
            <div className="empty-box">
              <ImageOff size={42} />
            </div>

            <p>
              Please import photos first.
            </p>

            <p>
              Import a folder to get started.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}