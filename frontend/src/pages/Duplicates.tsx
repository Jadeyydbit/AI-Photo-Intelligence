import {
  type ReactElement,
  useMemo,
  useState,
} from "react";

import {
  Brain,
  Calendar,
  ChevronRight,
  Copy,
  Images,
  Loader2,
  MapPin,
  ScanSearch,
  X,
} from "lucide-react";

import type { PhotoItem } from "../types/photos";

import type {
  DuplicateGroup,
  DuplicateResponse,
} from "../App";

type DuplicatesProps = {
  photos: PhotoItem[];
  result: DuplicateResponse | null;
  scanning: boolean;
  error: string | null;
  onRescan: () => void;
};

type DuplicateFilter =
  | "all"
  | "exact"
  | "duplicate"
  | "very-similar";

function normalizePath(path: string): string {
  let normalized = String(path ?? "").trim();

  if (!normalized) {
    return "";
  }

  normalized = normalized.replace(/^file:\/\/\/?/i, "");
  normalized = normalized.replace(/^\\\\\?\\/, "");
  normalized = normalized.replace(/^\\\?\\?/, "");
  normalized = normalized.replace(/^[/\\]+(?=[A-Za-z]:)/, "");
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+/g, "/");

  return normalized.toLowerCase();
}

function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function getPredictionLabel(prediction: string): string {
  switch (prediction.toUpperCase()) {
    case "EXACT DUPLICATE":
      return "Exact duplicates";
    case "DUPLICATE":
      return "Duplicate photos";
    case "VERY SIMILAR":
      return "Very similar photos";
    default:
      return "Similar photos";
  }
}

function getPredictionDescription(prediction: string): string {
  switch (prediction.toUpperCase()) {
    case "EXACT DUPLICATE":
      return "The AI model believes these photos are essentially the same image.";
    case "DUPLICATE":
      return "The AI model found a strong visual match between these photos.";
    case "VERY SIMILAR":
      return "The AI model found very similar visual content.";
    default:
      return "The AI model found visually similar photos.";
  }
}

function getStatusLabel(prediction: string): string {
  const normalized = prediction.toUpperCase();
  return normalized === "EXACT DUPLICATE"
    ? "EXACT DUPLICATE"
    : normalized === "DUPLICATE"
      ? "DUPLICATE"
      : "VERY SIMILAR";
}

function getFilterForPrediction(
  prediction: string,
): Exclude<DuplicateFilter, "all"> {
  const normalized = prediction.toUpperCase();
  return normalized === "EXACT DUPLICATE"
    ? "exact"
    : normalized === "DUPLICATE"
      ? "duplicate"
      : "very-similar";
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) {
    return "Not available";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const normalized = value.replace(/^"|"$/g, "").trim();
  const match = normalized.match(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  );

  return match
    ? `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}:${match[6]}`
    : normalized;
}

function formatCoordinate(
  value: number | null,
  positive: string,
  negative: string,
): string {
  if (value === null) {
    return "Not available";
  }

  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
}

function getConfidence(group: DuplicateGroup): number | null {
  if (!group.predictions || group.predictions.length === 0) {
    return null;
  }

  return Math.max(
    ...group.predictions.map(
      (prediction) => Number(prediction.confidence) || 0,
    ),
  );
}

export function Duplicates({
  photos,
  result,
  scanning,
  error,
  onRescan,
}: DuplicatesProps): ReactElement {
  const [filter, setFilter] = useState<DuplicateFilter>("all");
  const [compareGroup, setCompareGroup] = useState<PhotoItem[] | null>(null);

  const photoLookup = useMemo(() => {
    const byPath = new Map<string, PhotoItem>();
    const byName = new Map<string, PhotoItem[]>();

    for (const photo of photos) {
      const normalized = normalizePath(photo.path);
      if (normalized) {
        byPath.set(normalized, photo);
      }

      const name = getFileName(photo.path);
      if (name) {
        byName.set(name, [...(byName.get(name) ?? []), photo]);
      }
    }

    return { byPath, byName };
  }, [photos]);

  const getPhoto = (path: string): PhotoItem | undefined => {
    const normalized = normalizePath(path);
    const exact = photoLookup.byPath.get(normalized);
    if (exact) {
      return exact;
    }

    const candidates = photoLookup.byName.get(getFileName(path));
    return candidates?.length === 1 ? candidates[0] : undefined;
  };

  const groups = result?.groups ?? [];
  const duplicatePhotoCount = new Set(
    groups.flatMap((group) => group.photos).map(normalizePath),
  ).size;
  const exactGroups = groups.filter(
    (group) => getFilterForPrediction(group.prediction) === "exact",
  ).length;
  const duplicateGroupsCount = groups.filter(
    (group) => getFilterForPrediction(group.prediction) === "duplicate",
  ).length;
  const similarGroups = groups.filter(
    (group) => getFilterForPrediction(group.prediction) === "very-similar",
  ).length;

  const filteredGroups = groups.filter(
    (group) =>
      filter === "all" || getFilterForPrediction(group.prediction) === filter,
  );

  if (photos.length === 0) {
    return (
      <section className="content-area duplicates-page">
        <div className="page-header">
          <h1>Duplicates</h1>
          <p className="subtitle">
            AI-powered duplicate and visual similarity detection.
          </p>
        </div>
        <div className="recent-panel">
          <div className="empty-state duplicate-empty-state">
            <Images size={42} />
            <h2>No photos imported</h2>
            <p>Import a photo folder first, then AI can scan your library.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="content-area duplicates-page">
      <div className="page-header duplicates-page-header">
        <div>
          <h1>Duplicates</h1>
          <p className="subtitle">
            AI-powered duplicate and visually similar photo detection.
          </p>
        </div>
        <button
          type="button"
          className="duplicate-action-button"
          onClick={onRescan}
          disabled={scanning}
        >
          {scanning ? <Loader2 size={16} className="duplicate-spinner" /> : <ScanSearch size={16} />}
          {scanning ? "Scanning..." : "Rescan"}
        </button>
      </div>

      <div className="duplicate-summary-grid" aria-label="Duplicate scan summary">
        <div className="duplicate-summary-card duplicate-summary-card-primary">
          <Brain size={18} />
          <strong>{scanning ? "..." : groups.length}</strong>
          <span>AI groups</span>
        </div>
        <div className="duplicate-summary-card">
          <strong>{duplicatePhotoCount}</strong>
          <span>Photos involved</span>
        </div>
        <div className="duplicate-summary-card">
          <strong>{exactGroups}</strong>
          <span>Exact groups</span>
        </div>
        <div className="duplicate-summary-card">
          <strong>{duplicateGroupsCount}</strong>
          <span>Duplicate groups</span>
        </div>
        <div className="duplicate-summary-card">
          <strong>{similarGroups}</strong>
          <span>Very similar groups</span>
        </div>
      </div>

      {error && (
        <div className="recent-panel">
          <div className="empty-state duplicate-empty-state">
            <Copy size={42} />
            <h2>AI scan failed</h2>
            <p>{error}</p>
            <button
              type="button"
              className="duplicate-action-button"
              onClick={onRescan}
              disabled={scanning}
            >
              <ScanSearch size={16} />
              {scanning ? "Scanning..." : "Scan again"}
            </button>
          </div>
        </div>
      )}

      {scanning && !error && (
        <div className="recent-panel">
          <div className="empty-state duplicate-empty-state duplicate-scanning-state">
            <ScanSearch size={34} />
            <h2>AI is scanning your photos</h2>
            <p>Comparing photo embeddings to detect duplicates and near-duplicates.</p>
            <span>
              Analyzed {result?.photos_analyzed ?? 0} / {photos.length} photos
            </span>
          </div>
        </div>
      )}

      {!scanning && !error && groups.length === 0 && (
        <div className="recent-panel">
          <div className="empty-state duplicate-empty-state">
            <Brain size={42} />
            <h2>No duplicate groups found</h2>
            <p>The AI model did not find any photos similar enough to group.</p>
            <span>Scanned {result?.photos_analyzed ?? 0} photos.</span>
            <button type="button" className="duplicate-action-button" onClick={onRescan}>
              <ScanSearch size={16} />
              Scan again
            </button>
          </div>
        </div>
      )}

      {!scanning && !error && groups.length > 0 && (
        <div className="duplicates-content">
          <div className="duplicates-toolbar">
            <div className="duplicate-filter-tabs" role="tablist" aria-label="Filter duplicate groups">
              {(
                [
                  ["all", "All", groups.length],
                  ["exact", "Exact", exactGroups],
                  ["duplicate", "Duplicate", duplicateGroupsCount],
                  ["very-similar", "Very Similar", similarGroups],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={`duplicate-filter-tab ${filter === value ? "active" : ""}`}
                  key={value}
                  onClick={() => setFilter(value)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            <div className="duplicate-detection-info">
              <Brain size={15} />
              {filteredGroups.length} of {groups.length} groups shown
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="recent-panel">
              <div className="empty-state duplicate-empty-state">
                <Brain size={34} />
                <h2>No {filter.replace("-", " ")} groups</h2>
                <p>Try another filter to view the available AI results.</p>
              </div>
            </div>
          ) : (
            <div className="duplicate-groups">
              {filteredGroups.map((group, groupIndex) => {
                const matchedPhotos = group.photos
                  .map((path) => getPhoto(path))
                  .filter((photo): photo is PhotoItem => photo !== undefined);
                const confidence = getConfidence(group);

                return (
                  <article
                    className="duplicate-group"
                    key={group.id || `duplicate-group-${groupIndex}`}
                  >
                    <div className="duplicate-group-header">
                      <div className="duplicate-group-heading">
                        <div className="duplicate-status-row">
                          <span className={`duplicate-status-badge duplicate-status-${getFilterForPrediction(group.prediction)}`}>
                            {getStatusLabel(group.prediction)}
                          </span>
                          <span className="duplicate-similarity-badge">
                            {Math.round(group.similarity * 100)}% AI similarity
                          </span>
                        </div>
                        <h2>{getPredictionLabel(group.prediction)}</h2>
                        <p>{getPredictionDescription(group.prediction)}</p>
                      </div>
                      <div className="duplicate-group-actions">
                        <span className="duplicate-group-stat">
                          {matchedPhotos.length} photos
                        </span>
                        {confidence !== null && (
                          <span className="duplicate-group-stat">
                            {Math.round(confidence * 100)}% confidence
                          </span>
                        )}
                        {matchedPhotos.length >= 2 && (
                          <button
                            type="button"
                            className="duplicate-compare-button"
                            onClick={() => setCompareGroup(matchedPhotos)}
                          >
                            Compare <ChevronRight size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="duplicate-photo-grid">
                      {matchedPhotos.length > 0 ? (
                        matchedPhotos.map((photo) => (
                            <div className="duplicate-photo-card" key={photo.path}>
                              <div className="duplicate-photo-image">
                                <img src={photo.src} alt={photo.name} loading="lazy" />
                              </div>
                              <div className="duplicate-photo-info">
                                <strong title={photo.name}>{photo.name}</strong>
                                <span title={photo.path}>{photo.path}</span>
                              </div>
                            </div>
                        ))
                      ) : (
                        <div className="empty-state duplicate-empty-state">
                          <Images size={34} />
                          <h3>Photos could not be matched</h3>
                          <p>The AI returned this group, but its paths do not match the imported library.</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {compareGroup && (
        <div
          className="duplicate-compare-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Compare duplicate photos"
          onClick={() => setCompareGroup(null)}
        >
          <div className="duplicate-compare-modal" onClick={(event) => event.stopPropagation()}>
            <div className="duplicate-compare-header">
              <div>
                <h2>Compare photos</h2>
                <p>{compareGroup.length} photos in this AI group</p>
              </div>
              <button
                type="button"
                className="duplicate-modal-close"
                aria-label="Close comparison"
                onClick={() => setCompareGroup(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="duplicate-compare-grid">
              {compareGroup.map((photo) => (
                <div className="duplicate-compare-photo" key={photo.path}>
                  <img src={photo.src} alt={photo.name} />
                  <h3 title={photo.name}>{photo.name}</h3>
                  <div className="duplicate-compare-metadata">
                    <span><Calendar size={14} /> {formatDate(photo.dateTaken)}</span>
                    <span>Dimensions: {photo.width && photo.height ? `${photo.width} × ${photo.height}` : "Not available"}</span>
                    <span>File size: {formatFileSize(photo.fileSize)}</span>
                    <span>
                      <MapPin size={14} />
                      {photo.latitude !== null && photo.longitude !== null
                        ? `${formatCoordinate(photo.latitude, "N", "S")}, ${formatCoordinate(photo.longitude, "E", "W")}`
                        : "Location: Not available"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
