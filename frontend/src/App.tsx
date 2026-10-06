import {
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FolderOpen,
  ImageIcon,
  Home as HomeIcon,
  MapPinned,
  Settings,
  Users,
  Heart,
  Copy,
  Plane,
  Mountain,
  Utensils,
  Car,
  FolderPlus,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  Sidebar,
  type SidebarItem,
  type AppView,
} from "./components/Sidebar";

import {
  SearchBar,
  type SearchResult,
} from "./components/SearchBar";

import { Home } from "./pages/Home";
import { AllPhotos } from "./pages/AllPhotos";
import { Albums } from "./pages/Albums";
import { Duplicates } from "./pages/Duplicates";
import { Favorites } from "./pages/Favorites";
import { CreateAlbums } from "./pages/CreateAlbums";

import {
  importLocalPhotoFolder,
} from "./services/photoImport";

import type {
  StatCardData,
} from "./components/StatCard";

import type {
  PhotoItem,
} from "./types/photos";

/* =========================================================
   SIDEBAR
========================================================= */

const sidebarItems: SidebarItem[] = [
  {
    icon: HomeIcon,
    label: "Home",
    view: "home",
  },
  {
    icon: ImageIcon,
    label: "All Photos",
    view: "all-photos",
  },
  {
    icon: FolderOpen,
    label: "Albums",
    view: "albums",
  },
  {
    icon: Copy,
    label: "Duplicates",
    view: "duplicates",
  },
  {
    icon: Heart,
    label: "Favorites",
    view: "favorites",
  },
  {
    icon: FolderPlus,
    label: "Create Albums",
    view: "create-albums",
  },
  {
    icon: Settings,
    label: "Settings",
    view: "settings",
  },
];

/* =========================================================
   AI TYPES
========================================================= */

type AlbumCategory =
  | "People"
  | "Places"
  | "Screenshots"
  | "Travel"
  | "Scenery"
  | "Animals"
  | "Food"
  | "Vehicles"
  | "Products";

export type ClassificationPrediction = {
  category: string;
  confidence: number;
};

export type ClassificationResult = {
  path: string;
  predictions: ClassificationPrediction[];
  albums: string[];
};

type ClassificationResponse = {
  results: ClassificationResult[];
  requested: number;
  returned: number;
  cached: number;
  analyzed: number;
  failed: number;
};

type ClassificationRunResult = {
  results: Record<string, ClassificationResult>;
  failedBatches: number;
  totalBatches: number;
};

export type DuplicatePrediction = {
  path_a: string;
  path_b: string;
  similarity: number;
  prediction: string;
  confidence: number;
};

export type DuplicateGroup = {
  id: string;
  photos: string[];
  similarity: number;
  prediction: string;
  predictions: DuplicatePrediction[];
};

export type DuplicateResponse = {
  groups: DuplicateGroup[];
  photos_analyzed: number;
};

/* =========================================================
   API
========================================================= */

const AI_API_URL =
  "http://127.0.0.1:8000";

const APP_VERSION =
  "0.1.1";

const RELEASES_API_URL =
  "https://api.github.com/repos/Jadeyydbit/AI-Photo-Intelligence/releases/latest";

const DOWNLOAD_WEBSITE_URL =
  "https://github.com/Jadeyydbit/AI-Photo-Intelligence/releases/latest";

/* =========================================================
   STORAGE
========================================================= */

const PHOTO_STORAGE_KEY =
  "ai-photo-library";

const FOLDER_PATH_STORAGE_KEY =
  "ai-photo-folder-path";

const FOLDER_NAME_STORAGE_KEY =
  "ai-photo-folder-name";

const CLASSIFICATION_STORAGE_KEY =
  "ai-photo-classification-results-v3";

const CLASSIFICATION_CACHE_VERSION_KEY =
  "ai-photo-classification-cache-version";

const CLASSIFICATION_CACHE_VERSION =
  "5";

const DUPLICATE_CACHE_KEY =
  "ai-photo-duplicate-results";

const FAVORITES_STORAGE_KEY =
  "ai-photo-favorites";

export const FAVORITES_CHANGED_EVENT =
  "ai-photo-favorites-changed";

/* =========================================================
   PATH HELPERS
========================================================= */

/**
 * Normalize ONLY for comparisons.
 *
 * Never write this value back into PhotoItem.path.
 */
function normalizePath(
  path: string,
): string {
  let normalized = String(
    path ?? "",
  ).trim();

  if (!normalized) {
    return "";
  }

  // Decode URL-encoded paths when possible.
  try {
    normalized = decodeURIComponent(
      normalized,
    );
  } catch {
    // Keep original value if decoding fails.
  }

  // Remove file:// URLs.
  normalized = normalized.replace(
    /^file:\/\/\/?/i,
    "",
  );

  // Remove Windows extended path prefixes:
  // \\?\C:\...
  // \?\C:\...
  if (
    normalized.startsWith(
      "\\\\?\\",
    )
  ) {
    normalized =
      normalized.slice(4);
  } else if (
    normalized.startsWith(
      "\\?\\",
    )
  ) {
    normalized =
      normalized.slice(3);
  }

  // Convert Windows separators to one canonical form.
  normalized =
    normalized.replace(
      /\\/g,
      "/",
    );

  // Repair /C:/... -> C:/...
  normalized =
    normalized.replace(
      /^\/+([A-Za-z]:)/,
      "$1",
    );

  // Collapse repeated separators.
  normalized =
    normalized.replace(
      /\/+/g,
      "/",
    );

  // Windows paths are case-insensitive.
  return normalized.toLowerCase();
}
/**
 * Prepare a path for the Python backend.
 *
 * The original PhotoItem.path is never changed.
 */
function prepareApiPath(
  path: string,
): string {
  let prepared = path.trim();

  if (!prepared) {
    return "";
  }

  /*
   * Remove file:// prefixes.
   */
  if (
    prepared
      .toLowerCase()
      .startsWith("file:///")
  ) {
    prepared =
      prepared.slice(8);
  } else if (
    prepared
      .toLowerCase()
      .startsWith("file://")
  ) {
    prepared =
      prepared.slice(7);
  }

  /*
   * Remove Windows extended prefixes.
   */
  if (
    prepared.startsWith("\\\\?\\")
  ) {
    prepared =
      prepared.slice(4);
  }

  if (
    prepared.startsWith("\\?\\")
  ) {
    prepared =
      prepared.slice(3);
  }

  /*
   * Python on Windows is happiest receiving
   * a normal Windows path.
   */
  prepared =
    prepared.replace(
      /\//g,
      "\\",
    );

  /*
   * Repair malformed:
   *
   * C:Users\...
   *
   * into:
   *
   * C:\Users\...
   */
  if (
    /^[A-Za-z]:/.test(prepared) &&
    !/^[A-Za-z]:\\/.test(prepared)
  ) {
    prepared =
      `${prepared.slice(0, 2)}\\${prepared.slice(2)}`;
  }

  return prepared;
}

function pathKey(
  path: string,
): string {
  return normalizePath(path);
}

/* =========================================================
   LOAD PHOTOS
========================================================= */

function loadPhotos(): PhotoItem[] {
  try {
    const raw =
      localStorage.getItem(
        PHOTO_STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (
        photo,
      ): photo is PhotoItem => {
        if (
          !photo ||
          typeof photo !== "object"
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
  } catch (error) {
    console.error(
      "Unable to load saved photos:",
      error,
    );

    return [];
  }
}

/* =========================================================
   FOLDER STORAGE
========================================================= */

function loadSavedFolderPath():
  | string
  | null {
  try {
    return (
      localStorage.getItem(
        FOLDER_PATH_STORAGE_KEY,
      ) ?? null
    );
  } catch {
    return null;
  }
}

function loadSavedFolderName():
  | string
  | null {
  try {
    return (
      localStorage.getItem(
        FOLDER_NAME_STORAGE_KEY,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/* =========================================================
   FAVORITES
========================================================= */

export function loadFavoritePaths(): Set<string> {
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

    const normalized =
      parsed
        .filter(
          (path): path is string =>
            typeof path === "string",
        )
        .map(pathKey)
        .filter(Boolean);

    return new Set<string>(
      normalized,
    );
  } catch (error) {
    console.error(
      "Unable to load favorites:",
      error,
    );

    return new Set<string>();
  }
}

export function saveFavoritePaths(
  favorites: Set<string>,
): void {
  try {
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(
        Array.from(favorites),
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

export function toggleFavoritePath(
  path: string,
): Set<string> {
  const favorites =
    loadFavoritePaths();

  const key = pathKey(path);

  if (!key) {
    return favorites;
  }

  if (favorites.has(key)) {
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
   CLASSIFICATION CACHE
========================================================= */

function isClassificationResult(
  value: unknown,
): value is ClassificationResult {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const result =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof result.path ===
      "string" &&
    Array.isArray(
      result.predictions,
    ) &&
    Array.isArray(
      result.albums,
    )
  );
}

function loadClassificationResults():
  Record<
    string,
    ClassificationResult
  > {
  try {
    const raw =
      localStorage.getItem(
        CLASSIFICATION_STORAGE_KEY,
      );

    if (!raw) {
      return {};
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return {};
    }

    const normalized: Record<
      string,
      ClassificationResult
    > = {};

    for (
      const value of Object.values(
        parsed as Record<
          string,
          unknown
        >,
      )
    ) {
      if (
        !isClassificationResult(
          value,
        )
      ) {
        continue;
      }

      normalized[
        pathKey(value.path)
      ] = value;
    }

    return normalized;
  } catch (error) {
    console.error(
      "Unable to load classification cache:",
      error,
    );

    return {};
  }
}

function saveClassificationResults(
  results: Record<
    string,
    ClassificationResult
  >,
): void {
  try {
    const output: Record<
      string,
      ClassificationResult
    > = {};

    for (
      const result of Object.values(
        results,
      )
    ) {
      output[result.path] =
        result;
    }

    localStorage.setItem(
      CLASSIFICATION_STORAGE_KEY,
      JSON.stringify(output),
    );
  } catch (error) {
    console.error(
      "Unable to save classifications:",
      error,
    );
  }
}

/* =========================================================
   DUPLICATE CACHE
========================================================= */

function createLibraryKey(
  photos: PhotoItem[],
): string {
  return photos
    .map((photo) =>
      pathKey(photo.path),
    )
    .filter(Boolean)
    .sort()
    .join("|");
}

type DuplicateCache = {
  libraryKey: string;
  result: DuplicateResponse;
};

function loadDuplicateCache(
  libraryKey: string,
): DuplicateResponse | null {
  try {
    const raw =
      localStorage.getItem(
        DUPLICATE_CACHE_KEY,
      );

    if (!raw) {
      return null;
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return null;
    }

    const cache =
      parsed as DuplicateCache;

    if (
      cache.libraryKey !==
      libraryKey
    ) {
      return null;
    }

    if (
      !cache.result ||
      !Array.isArray(
        cache.result.groups,
      )
    ) {
      return null;
    }

    return cache.result;
  } catch {
    return null;
  }
}

function saveDuplicateCache(
  libraryKey: string,
  result: DuplicateResponse,
): void {
  try {
    localStorage.setItem(
      DUPLICATE_CACHE_KEY,
      JSON.stringify({
        libraryKey,
        result,
      }),
    );
  } catch (error) {
    console.error(
      "Unable to save duplicate cache:",
      error,
    );
  }
}

/* =========================================================
   API ERROR
========================================================= */

async function getApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const contentType =
      response.headers.get(
        "content-type",
      ) ?? "";

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      const data: unknown =
        await response.json();

      if (
        data &&
        typeof data === "object"
      ) {
        const record =
          data as Record<
            string,
            unknown
          >;

        if (
          typeof record.detail ===
          "string"
        ) {
          return record.detail;
        }

        if (
          typeof record.message ===
          "string"
        ) {
          return record.message;
        }
      }

      return JSON.stringify(data);
    }

    const text =
      await response.text();

    return (
      text ||
      `${fallback} (${response.status})`
    );
  } catch {
    return fallback;
  }
}

/* =========================================================
   SQLITE PHOTO DATABASE SYNC
========================================================= */

/**
 * Save the imported photo records into the persistent
 * SQLite database through the backend.
 *
 * This does NOT replace Qdrant indexing. It only adds
 * permanent library records to photos.db.
 */
async function syncPhotosToDatabase(
  photos: PhotoItem[],
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  try {
    const response =
      await fetch(
        `${AI_API_URL}/api/database/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            photos: photos.map((photo) => ({
              original_path:
                prepareApiPath(
                  photo.path,
                ),
              filename: photo.name,
              date_taken:
                photo.dateTaken,
              latitude:
                photo.latitude,
              longitude:
                photo.longitude,
              camera_make:
                photo.cameraMake,
              camera_model:
                photo.cameraModel,
              width: photo.width,
              height: photo.height,
              file_size:
                photo.fileSize,
              sha256: null,
            })),
          }),
        },
      );

    if (!response.ok) {
      console.error(
        "[SQLITE] Database sync failed:",
        await getApiErrorMessage(
          response,
          "SQLite database sync failed.",
        ),
      );

      return;
    }

    const data =
      (await response.json()) as {
        stored?: number;
        total?: number;
        database?: string;
      };

    console.log(
      "[SQLITE] Database sync successful:",
      data,
    );
  } catch (error) {
    /*
     * SQLite is an additional persistence layer.
     * A database sync problem must not break the
     * existing import, classification, Qdrant,
     * duplicate, or search pipeline.
     */
    console.error(
      "[SQLITE] Database sync error:",
      error,
    );
  }
}

/* =========================================================
   INDEX PHOTOS
========================================================= */

async function indexPhotos(
  photos: PhotoItem[],
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  /*
   * =========================================================
   * SQLITE
   * =========================================================
   *
   * Save the photo records permanently first.
   * This is independent of the existing Qdrant index.
   */
  await syncPhotosToDatabase(
    photos,
  );

  const apiPaths =
    photos
      .map((photo) =>
        prepareApiPath(
          photo.path,
        ),
      )
      .filter(Boolean);

  if (apiPaths.length === 0) {
    return;
  }

  console.log(
    "[INDEX] Sending paths:",
    apiPaths,
  );

  const response =
    await fetch(
      `${AI_API_URL}/api/index`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          paths: apiPaths,
        }),
      },
    );

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        "Photo indexing failed.",
      ),
    );
  }

  const data =
    (await response.json()) as {
      indexed?: number;
      total_vectors?: number;
    };

  console.log(
    "[INDEX] Success:",
    data,
  );
}

/* =========================================================
   CLASSIFY PHOTOS
========================================================= */


async function classifyPhotoLibrary(
  photos: PhotoItem[],
  onProgress?: (
    analyzed: number,
  ) => void,
): Promise<ClassificationRunResult> {
  if (photos.length === 0) {
    return {
      results: {},
      failedBatches: 0,
      totalBatches: 0,
    };
  }

  const existing =
    loadClassificationResults();

  const updated: Record<
    string,
    ClassificationResult
  > = {
    ...existing,
  };

  /*
   * A result counts as cached only when it contains
   * an actual category.
   *
   * This allows old empty classifications to be retried.
   */
  const photosToClassify =
    photos.filter(
      (photo) => {
        const cached =
          updated[
            pathKey(photo.path)
          ];

        return (
          !cached ||
          !Array.isArray(
            cached.albums,
          ) ||
          cached.albums.length === 0
        );
      },
    );

  const cachedCount =
    photos.length -
    photosToClassify.length;

  if (onProgress) {
    onProgress(cachedCount);
  }

  if (
    photosToClassify.length ===
    0
  ) {
    return {
      results: updated,
      failedBatches: 0,
      totalBatches: 0,
    };
  }

  /*
   * Keep batches reasonably small because
   * the Python backend runs YOLO + CLIP on CPU.
   */
  const batchSize = 8;

  const totalBatches =
    Math.ceil(
      photosToClassify.length /
        batchSize,
    );

  let failedBatches = 0;

  for (
    let start = 0;
    start <
    photosToClassify.length;
    start += batchSize
  ) {
    const batch =
      photosToClassify.slice(
        start,
        start + batchSize,
      );

    const apiPaths =
      batch
        .map((photo) =>
          prepareApiPath(
            photo.path,
          ),
        )
        .filter(Boolean);

    if (
      apiPaths.length ===
      0
    ) {
      failedBatches += 1;
      continue;
    }

    console.log(
      `[CLASSIFY] Starting batch ${
        start / batchSize + 1
      }/${totalBatches}`,
    );

    try {
      const response =
        await fetch(
          `${AI_API_URL}/api/classify-batch`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              paths: apiPaths,
            }),
          },
        );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "AI classification failed.",
          ),
        );
      }

      const data =
        (await response.json()) as ClassificationResponse;

      console.log(
        `[CLASSIFY] Finished batch ${
          start / batchSize + 1
        }/${totalBatches}`,
        {
          requested:
            data.requested,
          returned:
            data.returned,
          analyzed:
            data.analyzed,
          failed:
            data.failed,
        },
      );

      if (
        Array.isArray(
          data.results,
        )
      ) {
        for (
          const result of
            data.results
        ) {
          if (
            !isClassificationResult(
              result,
            )
          ) {
            continue;
          }

          updated[
            pathKey(result.path)
          ] = result;
        }
      }
    } catch (error) {
      failedBatches += 1;

      console.error(
        `[CLASSIFY] Batch failed (${start}):`,
        error,
      );
    }

    saveClassificationResults(
      updated,
    );

    const analyzedCount =
      photos.filter(
        (photo) => {
          const result =
            updated[
              pathKey(photo.path)
            ];

          return Boolean(
            result &&
            Array.isArray(
              result.albums,
            ) &&
            result.albums.length >
              0,
          );
        },
      ).length;

    if (onProgress) {
      onProgress(
        analyzedCount,
      );
    }
  }

  return {
    results: updated,
    failedBatches,
    totalBatches,
  };
}

/* =========================================================
   DUPLICATE DETECTION
========================================================= */

async function detectDuplicates(
  photos: PhotoItem[],
): Promise<DuplicateResponse> {
  if (photos.length < 2) {
    return {
      groups: [],
      photos_analyzed:
        photos.length,
    };
  }

  const apiPaths =
    photos
      .map((photo) =>
        prepareApiPath(
          photo.path,
        ),
      )
      .filter(Boolean);

  const response =
    await fetch(
      `${AI_API_URL}/api/duplicates`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          paths: apiPaths,
        }),
      },
    );

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        "Duplicate detection failed.",
      ),
    );
  }

  const data =
    (await response.json()) as DuplicateResponse;

  if (
    !data ||
    !Array.isArray(
      data.groups,
    )
  ) {
    throw new Error(
      "The duplicate API returned an invalid response.",
    );
  }

  return data;
}

/* =========================================================
   PLACEHOLDER
========================================================= */

function Placeholder({
  title,
}: {
  title: string;
}): ReactElement {
  return (
    <section className="content-area">
      <div className="page-header">
        <h1>{title}</h1>

        <p className="subtitle">
          This section will be added next.
        </p>
      </div>
    </section>
  );
}

/* =========================================================
   APP
========================================================= */

function App(): ReactElement {
  const [
    photos,
    setPhotos,
  ] = useState<PhotoItem[]>(
    loadPhotos,
  );

  const [
    folderPath,
    setFolderPath,
  ] = useState<
    string | null
  >(loadSavedFolderPath);

  const [
    folderName,
    setFolderName,
  ] = useState<
    string | null
  >(loadSavedFolderName);

  const [
    activeView,
    setActiveView,
  ] = useState<AppView>(
    "home",
  );

  /*
   * IMPORTANT:
   * This state is ONLY the folder-import operation.
   * AI analysis must not turn this into true.
   */
  const [
    isScanning,
    setIsScanning,
  ] = useState(false);

  const [
    searchResults,
    setSearchResults,
  ] = useState<SearchResult[]>(
    [],
  );

  const [
    isSearching,
    setIsSearching,
  ] = useState(false);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    classificationResults,
    setClassificationResults,
  ] = useState<
    Record<
      string,
      ClassificationResult
    >
  >(loadClassificationResults);

  const [
    isClassifying,
    setIsClassifying,
  ] = useState(false);

  const [
    classificationAnalyzedCount,
    setClassificationAnalyzedCount,
  ] = useState(0);

  const [
    classificationError,
    setClassificationError,
  ] = useState<
    string | null
  >(null);

  const [
    classificationComplete,
    setClassificationComplete,
  ] = useState(false);

  const [
    classificationRefreshToken,
    setClassificationRefreshToken,
  ] = useState(0);

  const [
    duplicateResult,
    setDuplicateResult,
  ] = useState<
    DuplicateResponse | null
  >(null);

  const [
    isDuplicateScanning,
    setIsDuplicateScanning,
  ] = useState(false);

  const [
    duplicateError,
    setDuplicateError,
  ] = useState<
    string | null
  >(null);

  const [
    settingsNotice,
    setSettingsNotice,
  ] = useState<string | null>(null);

  const [
    availableUpdateVersion,
    setAvailableUpdateVersion,
  ] = useState<string | null>(null);

  const [
    isCheckingForUpdates,
    setIsCheckingForUpdates,
  ] = useState(false);

  const [
    favoritePaths,
    setFavoritePaths,
  ] = useState<Set<string>>(
    loadFavoritePaths,
  );

  const analyzedLibraryRef =
    useRef<string | null>(
      null,
    );

  const analysisGenerationRef =
    useRef(0);

  const indexedLibraryRef =
    useRef<string | null>(
      null,
    );

  const checkForUpdates = async (): Promise<void> => {
      setIsCheckingForUpdates(true);

      try {
        const response = await fetch(
          RELEASES_API_URL,
          {
            headers: {
              Accept: "application/vnd.github+json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Release service returned ${response.status}.`,
          );
        }

        const release = (await response.json()) as {
          tag_name?: unknown;
        };

        const latestVersion =
          typeof release.tag_name === "string"
            ? release.tag_name.replace(/^v/, "")
            : null;

        if (!latestVersion) {
          throw new Error(
            "The latest release did not include a version.",
          );
        }

        const hasUpdate =
          latestVersion !== APP_VERSION;
        setAvailableUpdateVersion(
          hasUpdate
            ? latestVersion
            : null,
        );
        setSettingsNotice(
          hasUpdate
            ? `Version ${latestVersion} is available.`
            : "You are using the latest version.",
        );
      } catch (error) {
        setSettingsNotice(
          `Unable to check for updates: ${
            error instanceof Error
              ? error.message
              : "Update service is unavailable."
          }`,
        );
      } finally {
        setIsCheckingForUpdates(false);
      }
  };

  const openUpdateDownload = async (): Promise<void> => {
    try {
      await openUrl(
        DOWNLOAD_WEBSITE_URL,
      );
      setSettingsNotice(
        "The latest installer opened. Close this app, then run the installer to update it.",
      );
    } catch (error) {
      setSettingsNotice(
        `Unable to open the update page: ${
          error instanceof Error
            ? error.message
            : "The update page could not be opened."
        }`,
      );
    }
  };

  useEffect(() => {
    void checkForUpdates();
  }, []);

  /* =======================================================
     CLASSIFICATION CACHE VERSION
  ======================================================= */

  useEffect(() => {
    try {
      const savedVersion =
        localStorage.getItem(
          CLASSIFICATION_CACHE_VERSION_KEY,
        );

      if (
        savedVersion ===
        CLASSIFICATION_CACHE_VERSION
      ) {
        return;
      }

      /*
       * Only invalidate the classification cache when
       * the classifier/cache version actually changes.
       *
       * This prevents every render/revisit from forcing
       * another full AI classification.
       */
      localStorage.removeItem(
        "ai-photo-classification-results",
      );

      localStorage.removeItem(
        CLASSIFICATION_STORAGE_KEY,
      );

      localStorage.setItem(
        CLASSIFICATION_CACHE_VERSION_KEY,
        CLASSIFICATION_CACHE_VERSION,
      );

      analyzedLibraryRef.current =
        null;

      setClassificationResults({});
      setClassificationAnalyzedCount(0);
      setClassificationComplete(false);
    } catch (error) {
      console.error(
        "Unable to update classification cache version:",
        error,
      );
    }
  }, []);

  /* =======================================================
     SAVE PHOTOS
  ======================================================= */

  useEffect(() => {
    try {
      localStorage.setItem(
        PHOTO_STORAGE_KEY,
        JSON.stringify(photos),
      );
    } catch (error) {
      console.error(
        "Unable to save photos:",
        error,
      );
    }
  }, [photos]);

  /* =======================================================
     SYNC EXISTING LIBRARY TO SQLITE

     Existing photos may already be present in localStorage
     from an earlier session. Sync them into photos.db when
     the app starts, without changing the existing localStorage
     behavior.
  ======================================================= */

  useEffect(() => {
    if (photos.length === 0) {
      return;
    }

    void syncPhotosToDatabase(
      photos,
    );
  }, [photos]);

  /* =======================================================
     SAVE FOLDER PATH
  ======================================================= */

  useEffect(() => {
    try {
      if (folderPath) {
        localStorage.setItem(
          FOLDER_PATH_STORAGE_KEY,
          folderPath,
        );
      } else {
        localStorage.removeItem(
          FOLDER_PATH_STORAGE_KEY,
        );
      }
    } catch {
      // Ignore storage errors.
    }
  }, [folderPath]);

  /* =======================================================
     SAVE FOLDER NAME
  ======================================================= */

  useEffect(() => {
    try {
      if (folderName) {
        localStorage.setItem(
          FOLDER_NAME_STORAGE_KEY,
          folderName,
        );
      } else {
        localStorage.removeItem(
          FOLDER_NAME_STORAGE_KEY,
        );
      }
    } catch {
      // Ignore storage errors.
    }
  }, [folderName]);

  /* =======================================================
     FAVORITES STORAGE SYNC
  ======================================================= */

  useEffect(() => {
    const syncFavorites = (): void => {
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

  useEffect(() => {
    /*
     * Photos load asynchronously from local storage. Do not treat the
     * initial empty state as an empty library or saved favorites would be
     * removed before the photo list is restored.
     */
    if (photos.length === 0) {
      return;
    }

    const validKeys =
      new Set(
        photos.map((photo) =>
          pathKey(photo.path),
        ),
      );

    setFavoritePaths((current) => {
      let changed = false;
      const next = new Set<string>();

      for (const key of current) {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      }

      if (changed) {
        saveFavoritePaths(next);
        return next;
      }

      return current;
    });
  }, [photos]);

  /* =======================================================
     CLEAN CLASSIFICATION CACHE
  ======================================================= */

  useEffect(() => {
    const validKeys =
      new Set(
        photos.map((photo) =>
          pathKey(photo.path),
        ),
      );

    setClassificationResults(
      (current) => {
        let changed = false;

        const next: Record<
          string,
          ClassificationResult
        > = {};

        for (
          const result of
            Object.values(current)
        ) {
          const key =
            pathKey(result.path);

          if (
            validKeys.has(key)
          ) {
            next[key] =
              result;
          } else {
            changed = true;
          }
        }

        if (changed) {
          saveClassificationResults(
            next,
          );

          return next;
        }

        return current;
      },
    );
  }, [photos]);

  /* =======================================================
     VERIFY QDRANT INDEX

     Only verify once per library key.
     The classification refresh should NOT
     trigger another indexing pass.
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function ensureLibraryIndexed(): Promise<void> {
      if (photos.length === 0) {
        return;
      }

      const libraryKey =
        createLibraryKey(
          photos,
        );

      if (
        indexedLibraryRef.current ===
        libraryKey
      ) {
        return;
      }

      indexedLibraryRef.current =
        libraryKey;

      try {
        const response =
          await fetch(
            `${AI_API_URL}/api/vectors`,
          );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as {
            vectors?: number;
          };

        if (cancelled) {
          return;
        }

        const vectorCount =
          typeof data.vectors ===
          "number"
            ? data.vectors
            : 0;

        if (
          vectorCount <
          photos.length
        ) {
          console.log(
            `[INDEX] Qdrant has ${vectorCount} vectors for ${photos.length} photos. Re-indexing library...`,
          );

          await indexPhotos(
            photos,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Unable to verify Qdrant index:",
            error,
          );
        }
      }
    }

    void ensureLibraryIndexed();

    return () => {
      cancelled = true;
    };
  }, [photos]);

  /* =======================================================
     BACKGROUND AI ANALYSIS

     IMPORTANT:
     - Analyze a library only once.
     - Reuse cached classifications on revisit/restart.
     - If new photos are added, analyze only the missing
       photos.
     - Opening Albums never starts another classification.
     - Manual category rebuild still works through
       classificationRefreshToken.
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function analyzeLibrary(): Promise<void> {
      const generation =
        ++analysisGenerationRef.current;

      if (photos.length === 0) {
        analyzedLibraryRef.current =
          null;

        setClassificationResults({});
        setClassificationAnalyzedCount(0);
        setClassificationError(null);
        setClassificationComplete(false);

        setDuplicateResult({
          groups: [],
          photos_analyzed: 0,
        });

        setDuplicateError(null);

        setIsClassifying(false);
        setIsDuplicateScanning(false);

        return;
      }

      const libraryKey =
        createLibraryKey(
          photos,
        );

      /*
       * Do not restart an already-completed library
       * unless the user explicitly requested a manual
       * category rebuild.
       *
       * The ref is assigned only AFTER the work is
       * successfully allowed to finish. This is important
       * for React Strict Mode, where effects can be invoked
       * twice during development.
       */
      if (
        analyzedLibraryRef.current ===
          libraryKey &&
        classificationRefreshToken ===
          0
      ) {
        return;
      }

      /*
       * Rehydrate the current cache.
       *
       * Only classifications with at least one actual
       * category are considered completed.
       */
      const cached =
        loadClassificationResults();

      const currentCachedResults: Record<
        string,
        ClassificationResult
      > = {};

      for (
        const photo of photos
      ) {
        const key =
          pathKey(photo.path);

        const result =
          cached[key];

        if (
          result &&
          Array.isArray(
            result.albums,
          ) &&
          result.albums.length > 0
        ) {
          currentCachedResults[key] =
            result;
        }
      }

      setClassificationResults(
        currentCachedResults,
      );

      const cachedCount =
        Object.keys(
          currentCachedResults,
        ).length;

      setClassificationAnalyzedCount(
        cachedCount,
      );

      /*
       * Find only photos that actually need AI work.
       */
      const photosNeedingAnalysis =
        photos.filter(
          (photo) =>
            !currentCachedResults[
              pathKey(photo.path)
            ],
        );

      /*
       * Load duplicate cache for this exact library.
       */
      const cachedDuplicates =
        loadDuplicateCache(
          libraryKey,
        );

      if (cachedDuplicates) {
        setDuplicateResult(
          cachedDuplicates,
        );

        setDuplicateError(null);
        setIsDuplicateScanning(false);
      } else {
        setDuplicateResult(null);
        setDuplicateError(null);
        setIsDuplicateScanning(false);
      }

      /*
       * Nothing needs to be classified.
       *
       * This is the normal path when the user simply
       * opens the application again or visits Albums.
       */
      if (
        photosNeedingAnalysis.length ===
        0
      ) {
        setClassificationAnalyzedCount(
          photos.length,
        );

        setClassificationError(null);
        setClassificationComplete(true);
        setIsClassifying(false);

        /*
         * Mark the library as analyzed before returning
         * when duplicate results are already cached.
         */
        if (cachedDuplicates) {
          analyzedLibraryRef.current =
            libraryKey;

          return;
        }

        /*
         * Classification is complete. If duplicates for
         * this exact library have not yet been scanned,
         * run that once and cache the result.
         */
        if (
          photos.length >= 2
        ) {
          setIsDuplicateScanning(true);

          try {
            const result =
              await detectDuplicates(
                photos,
              );

            if (
              cancelled ||
              analysisGenerationRef.current !==
                generation
            ) {
              return;
            }

            saveDuplicateCache(
              libraryKey,
              result,
            );

            setDuplicateResult(
              result,
            );

            setDuplicateError(null);
          } catch (error) {
            console.error(
              "Duplicate detection failed:",
              error,
            );

            if (!cancelled) {
              setDuplicateError(
                error instanceof Error
                  ? error.message
                  : "Duplicate detection failed.",
              );
            }
          } finally {
            if (!cancelled) {
              setIsDuplicateScanning(
                false,
              );
            }
          }
        }

        if (!cancelled) {
          analyzedLibraryRef.current =
            libraryKey;
        }

        return;
      }

      /*
       * New/unclassified photos exist.
       *
       * ONLY these photos are sent to the AI backend.
       */
      setClassificationError(null);
      setClassificationComplete(false);
      setIsClassifying(true);

      try {
        const classificationRun =
          await classifyPhotoLibrary(
            photosNeedingAnalysis,
            (analyzedNewPhotos) => {
              if (
                cancelled ||
                analysisGenerationRef.current !==
                  generation
              ) {
                return;
              }

              setClassificationAnalyzedCount(
                Math.min(
                  photos.length,
                  cachedCount +
                    analyzedNewPhotos,
                ),
              );
            },
          );

        if (
          cancelled ||
          analysisGenerationRef.current !==
            generation
        ) {
          return;
        }

        /*
         * Keep the existing cached results and merge in
         * the classifications produced for the new photos.
         */
        const mergedResults: Record<
          string,
          ClassificationResult
        > = {
          ...currentCachedResults,
        };

        for (
          const result of Object.values(
            classificationRun.results,
          )
        ) {
          if (
            !isClassificationResult(
              result,
            )
          ) {
            continue;
          }

          mergedResults[
            pathKey(result.path)
          ] = result;
        }

        saveClassificationResults(
          mergedResults,
        );

        setClassificationResults(
          mergedResults,
        );

        const finalAnalyzedCount =
          photos.filter(
            (photo) => {
              const result =
                mergedResults[
                  pathKey(
                    photo.path,
                  )
                ];

              return Boolean(
                result &&
                Array.isArray(
                  result.albums,
                ) &&
                result.albums.length >
                  0,
              );
            },
          ).length;

        setClassificationAnalyzedCount(
          finalAnalyzedCount,
        );

        if (
          classificationRun.failedBatches >
          0
        ) {
          /*
           * Keep successful classifications visible,
           * but do not start another automatic retry loop.
           */
          setClassificationError(
            `${classificationRun.failedBatches} AI batch${
              classificationRun.failedBatches ===
              1
                ? ""
                : "es"
            } failed. Successful classifications are still shown.`,
          );

          setClassificationComplete(
            true,
          );
        } else {
          setClassificationError(null);
          setClassificationComplete(true);
        }

        /*
         * Classification is now considered complete for
         * this library. Future renders/revisits will use
         * the cache instead of starting the AI again.
         */
        analyzedLibraryRef.current =
          libraryKey;
      } catch (error) {
        console.error(
          "Library classification failed:",
          error,
        );

        if (!cancelled) {
          setClassificationError(
            error instanceof Error
              ? error.message
              : "AI classification failed.",
          );

          setClassificationComplete(
            false,
          );
        }
      } finally {
        if (!cancelled) {
          setIsClassifying(false);
        }
      }

      /*
       * Run duplicate detection once for this library
       * after classification, unless a cached result exists.
       */
      if (
        cancelled ||
        analysisGenerationRef.current !==
          generation ||
        cachedDuplicates
      ) {
        return;
      }

      if (
        photos.length < 2
      ) {
        setDuplicateResult({
          groups: [],
          photos_analyzed:
            photos.length,
        });

        setDuplicateError(null);
        setIsDuplicateScanning(false);

        return;
      }

      setIsDuplicateScanning(true);

      try {
        const result =
          await detectDuplicates(
            photos,
          );

        if (
          cancelled ||
          analysisGenerationRef.current !==
            generation
        ) {
          return;
        }

        saveDuplicateCache(
          libraryKey,
          result,
        );

        setDuplicateResult(
          result,
        );

        setDuplicateError(null);
      } catch (error) {
        console.error(
          "Duplicate detection failed:",
          error,
        );

        if (!cancelled) {
          setDuplicateError(
            error instanceof Error
              ? error.message
              : "Duplicate detection failed.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsDuplicateScanning(
            false,
          );
        }
      }
    }

    void analyzeLibrary();

    return () => {
      cancelled = true;

      analysisGenerationRef.current +=
        1;
    };
  }, [
    photos,
    classificationRefreshToken,
  ]);

  /* =======================================================
     SEARCH RESULTS
  ======================================================= */

  const searchCategory =
    useMemo<
      AlbumCategory | null
    >(() => {
      const query =
        searchQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return null;
      }

      /*
       * Use the already-computed AI Smart Album
       * classification for common object/topic searches.
       *
       * This prevents CLIP from returning unrelated
       * screenshots just because their text/image embedding
       * happens to be close to the query.
       */
      const keywordMap: Record<
        AlbumCategory,
        string[]
      > = {
        People: [
          "person",
          "people",
          "man",
          "men",
          "woman",
          "women",
          "boy",
          "girl",
          "family",
          "portrait",
        ],
        Places: [
          "place",
          "places",
          "building",
          "buildings",
          "city",
          "cities",
          "street",
          "architecture",
          "landmark",
        ],
        Screenshots: [
          "screenshot",
          "screenshots",
          "screen capture",
          "screen captures",
        ],
        Travel: [
          "travel",
          "travelling",
          "traveling",
          "trip",
          "vacation",
          "vacations",
          "holiday",
          "holidays",
          "destination",
        ],
        Scenery: [
          "scenery",
          "landscape",
          "landscapes",
          "mountain",
          "mountains",
          "beach",
          "beaches",
          "ocean",
          "sea",
          "lake",
          "nature",
        ],
        Animals: [
          "animal",
          "animals",
          "dog",
          "dogs",
          "puppy",
          "puppies",
          "cat",
          "cats",
          "kitten",
          "kittens",
          "bird",
          "birds",
          "pet",
          "pets",
          "wildlife",
        ],
        Food: [
          "food",
          "meal",
          "meals",
          "dish",
          "dishes",
          "restaurant",
          "restaurants",
          "pizza",
          "burger",
          "burgers",
          "cake",
          "dessert",
        ],
        Vehicles: [
          "vehicle",
          "vehicles",
          "car",
          "cars",
          "truck",
          "trucks",
          "suv",
          "motorcycle",
          "motorcycles",
          "bike",
          "bikes",
          "bus",
          "buses",
          "van",
          "vans",
        ],
        Products: [
          "product",
          "products",
          "clothes",
          "clothing",
          "fashion",
          "shoes",
          "shopping",
          "shop",
          "item",
          "items",
          "sports",
          "football",
          "soccer",
          "jersey",
          "equipment",
          "accessory",
          "accessories",
          "bag",
          "bags",
          "watch",
          "phone",
          "shirt",
          "dress",
          "uniform",
        ],
      };

      for (
        const category of Object.keys(
          keywordMap,
        ) as AlbumCategory[]
      ) {
        if (
          keywordMap[
            category
          ].some((keyword) =>
            query.includes(
              keyword,
            ),
          )
        ) {
          return category;
        }
      }

      return null;
    }, [searchQuery]);

  const displayedPhotos =
    useMemo(() => {
      if (!isSearching) {
        return photos;
      }

      const photoMap =
        new Map<
          string,
          PhotoItem
        >();

      for (
        const photo of photos
      ) {
        photoMap.set(
          pathKey(photo.path),
          photo,
        );
      }

      const qdrantMatches =
        searchResults
          .map((result) =>
            photoMap.get(
              pathKey(
                result.path,
              ),
            ),
          )
          .filter(
            (
              photo,
            ): photo is PhotoItem =>
              photo !==
              undefined,
          );

      /*
       * When the query maps to a Smart Album category,
       * use the AI classification as the final semantic filter.
       *
       * Example:
       *   "dog" -> Animals
       *   "car" -> Vehicles
       *
       * This removes unrelated screenshots that CLIP may
       * rank above weaker but genuinely relevant matches.
       */
      if (
        searchCategory
      ) {
        const categoryMatches =
          photos.filter(
            (photo) => {
              const classification =
                classificationResults[
                  pathKey(
                    photo.path,
                  )
                ];

              return (
                classification &&
                Array.isArray(
                  classification.albums,
                ) &&
                classification.albums.includes(
                  searchCategory,
                )
              );
            },
          );

        if (
          categoryMatches.length > 0
        ) {
          return categoryMatches;
        }
      }

      return qdrantMatches;
    }, [
      photos,
      searchResults,
      isSearching,
      searchCategory,
      classificationResults,
    ]);

  /* =======================================================
     CATEGORY COUNTS
  ======================================================= */

  const categoryCounts =
    useMemo(() => {
      const counts: Record<
        AlbumCategory,
        number
      > = {
        People: 0,
        Places: 0,
        Screenshots: 0,
        Travel: 0,
        Scenery: 0,
        Animals: 0,
        Food: 0,
        Vehicles: 0,
        Products: 0,
      };

      for (
        const photo of photos
      ) {
        const result =
          classificationResults[
            pathKey(
              photo.path,
            )
          ];

        if (!result) {
          continue;
        }

        for (
          const rawAlbum of new Set(
            result.albums,
          )
        ) {
          const album =
            typeof rawAlbum ===
            "string"
              ? rawAlbum.trim()
              : "";

          if (
            album in counts
          ) {
            counts[
              album as AlbumCategory
            ] += 1;
          }
        }
      }

      return counts;
    }, [
      photos,
      classificationResults,
    ]);

  const totalCategorizedPhotos =
    useMemo(
      () =>
        Object.values(
          categoryCounts,
        ).reduce(
          (sum, count) =>
            sum + count,
          0,
        ),
      [categoryCounts],
    );

  /* =======================================================
     MANUAL CATEGORY REBUILD
  ======================================================= */

  const resetAndRescanCategories =
    (): void => {
      /*
       * This is the ONLY path that deliberately forces
       * a complete category rebuild.
       *
       * Normal navigation, renders, and opening Albums
       * never call this function.
       */
      analyzedLibraryRef.current =
        null;

      saveClassificationResults(
        {},
      );

      setClassificationResults(
        {},
      );

      setClassificationAnalyzedCount(
        0,
      );

      setClassificationError(
        null,
      );

      setClassificationComplete(
        false,
      );

      setClassificationRefreshToken(
        (current) =>
          current + 1,
      );
    };

  const clearDuplicateCache =
    (): void => {
      try {
        localStorage.removeItem(
          DUPLICATE_CACHE_KEY,
        );
        setDuplicateResult(null);
        setDuplicateError(null);
        setSettingsNotice(
          "Duplicate scan cache cleared.",
        );
      } catch (error) {
        console.error(
          "Unable to clear duplicate cache:",
          error,
        );
        setSettingsNotice(
          "Unable to clear duplicate scan cache.",
        );
      }
    };

  const clearClassificationCache =
    (): void => {
      resetAndRescanCategories();
      setSettingsNotice(
        "AI classification cache cleared. Open Smart Albums to analyze again.",
      );
    };

  /* =======================================================
     DUPLICATE COUNT
  ======================================================= */

  const duplicateCount =
    useMemo(() => {
      if (!duplicateResult) {
        return 0;
      }

      const uniquePaths =
        new Set<string>();

      for (
        const group of
          duplicateResult.groups
      ) {
        for (
          const path of
            group.photos
        ) {
          uniquePaths.add(
            pathKey(path),
          );
        }
      }

      return uniquePaths.size;
    }, [
      duplicateResult,
    ]);

  /* =======================================================
     STATS
  ======================================================= */

  const stats =
    useMemo<
      StatCardData[]
    >(
      () => [
        {
          icon: ImageIcon,
          label: "Photos",
          value: String(
            photos.length,
          ),
          tone: "purple",
        },
        {
          icon: Users,
          label: "People",
          value: String(
            categoryCounts.People,
          ),
          tone: "green",
        },
        {
          icon: MapPinned,
          label: "Places",
          value: String(
            categoryCounts.Places,
          ),
          tone: "blue",
        },
        {
          icon: ImageIcon,
          label: "Screenshots",
          value: String(
            categoryCounts.Screenshots,
          ),
          tone: "amber",
        },
        {
          icon: Plane,
          label: "Travel",
          value: String(
            categoryCounts.Travel,
          ),
          tone: "purple",
        },
        {
          icon: Mountain,
          label: "Scenery",
          value: String(
            categoryCounts.Scenery,
          ),
          tone: "green",
        },
        {
          icon: Users,
          label: "Animals",
          value: String(
            categoryCounts.Animals,
          ),
          tone: "blue",
        },
        {
          icon: Utensils,
          label: "Food",
          value: String(
            categoryCounts.Food,
          ),
          tone: "amber",
        },
        {
          icon: Car,
          label: "Vehicles",
          value: String(
            categoryCounts.Vehicles,
          ),
          tone: "red",
        },
        {
          icon: Copy,
          label: "Duplicates",
          value: String(
            duplicateCount,
          ),
          tone: "red",
        },
      ],
      [
        photos.length,
        categoryCounts,
        duplicateCount,
      ],
    );

  /* =======================================================
     FAVORITES ACTIONS
  ======================================================= */

  const toggleFavorite = (
    path: string,
  ): void => {
    const next =
      toggleFavoritePath(path);

    setFavoritePaths(next);
  };

  const isFavorite = (
    path: string,
  ): boolean =>
    favoritePaths.has(
      pathKey(path),
    );

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const openView = (
    view: AppView,
  ): void => {
    setActiveView(view);
  };

  /* =======================================================
     RESCAN DUPLICATES
  ======================================================= */

  const rescanDuplicates =
    async (): Promise<void> => {
      if (
        photos.length < 2 ||
        isDuplicateScanning
      ) {
        return;
      }

      const libraryKey =
        createLibraryKey(
          photos,
        );

      setIsDuplicateScanning(
        true,
      );

      setDuplicateError(
        null,
      );

      setFavoritePaths(
        new Set<string>(),
      );

      try {
        const result =
          await detectDuplicates(
            photos,
          );

        saveDuplicateCache(
          libraryKey,
          result,
        );

        setDuplicateResult(
          result,
        );
      } catch (error) {
        console.error(
          "Duplicate rescan failed:",
          error,
        );

        setDuplicateError(
          error instanceof Error
            ? error.message
            : "Duplicate detection failed.",
        );
      } finally {
        setIsDuplicateScanning(
          false,
        );
      }
    };

  /* =======================================================
     IMPORT PHOTOS
  ======================================================= */

  const importPhotos =
    async (): Promise<void> => {
      if (isScanning) {
        return;
      }

      setIsScanning(true);

      try {
        const result =
          await importLocalPhotoFolder();

        if (
          result.status ===
          "cancelled"
        ) {
          return;
        }

        if (
          result.status ===
          "failed"
        ) {
          console.error(
            result.message ??
              "Failed to import folder.",
          );

          return;
        }

        if (
          result.photos.length ===
          0
        ) {
          console.warn(
            "No supported images found.",
          );

          return;
        }

        const existingPaths =
          new Set(
            photos.map((photo) =>
              pathKey(
                photo.path,
              ),
            ),
          );

        const newPhotos =
          result.photos.filter(
            (photo) =>
              !existingPaths.has(
                pathKey(
                  photo.path,
                ),
              ),
          );

        if (
          newPhotos.length ===
          0
        ) {
          console.log(
            "Photos already imported.",
          );

          return;
        }

        if (
          result.folderPath
        ) {
          setFolderPath(
            result.folderPath,
          );
        }

        if (
          result.folderName
        ) {
          setFolderName(
            result.folderName,
          );
        }

        /*
         * Preserve every original PhotoItem.path.
         */
        setPhotos(
          (current) => [
            ...current,
            ...newPhotos,
          ],
        );

        setActiveView(
          "home",
        );

        /*
         * IMPORTANT:
         *
         * Do NOT await indexing here.
         *
         * The photos are already imported.
         * Indexing should happen in the background.
         */
        void indexPhotos(
          newPhotos,
        ).catch((error) => {
          console.error(
            "Background photo indexing failed:",
            error,
          );
        });
      } catch (error) {
        console.error(
          "Photo import failed:",
          error,
        );
      } finally {
        /*
         * Importing is finished as soon as
         * the PhotoItems have been loaded.
         *
         * AI classification/indexing can continue
         * in the background.
         */
        setIsScanning(false);
      }
    };

  /* =======================================================
     REMOVE FOLDER
  ======================================================= */

  const handleRemoveFolder =
    (): void => {
      const name =
        folderName ??
        "this folder";

      const confirmed =
        window.confirm(
          `Remove "${name}" from AI Photo Intelligence?\n\nYour original photos will NOT be deleted.`,
        );

      if (!confirmed) {
        return;
      }

      analysisGenerationRef.current +=
        1;

      analyzedLibraryRef.current =
        null;

      indexedLibraryRef.current =
        null;

      setPhotos([]);
      setFolderPath(null);
      setFolderName(null);

      setSearchResults([]);
      setIsSearching(false);

      setClassificationResults(
        {},
      );

      setClassificationAnalyzedCount(
        0,
      );

      setClassificationError(
        null,
      );

      setClassificationComplete(
        false,
      );

      setDuplicateResult({
        groups: [],
        photos_analyzed: 0,
      });

      setDuplicateError(
        null,
      );

      try {
        localStorage.removeItem(
          PHOTO_STORAGE_KEY,
        );

        localStorage.removeItem(
          FOLDER_PATH_STORAGE_KEY,
        );

        localStorage.removeItem(
          FOLDER_NAME_STORAGE_KEY,
        );

        localStorage.removeItem(
          CLASSIFICATION_STORAGE_KEY,
        );

        localStorage.removeItem(
          DUPLICATE_CACHE_KEY,
        );

        localStorage.removeItem(
          FAVORITES_STORAGE_KEY,
        );
      } catch (error) {
        console.error(
          "Unable to clear library:",
          error,
        );
      }

      setActiveView("home");
    };

  /* =======================================================
     VIEW ROUTER
  ======================================================= */

  const renderView =
    (): ReactElement => {
      switch (activeView) {
        case "home":
          return (
            <Home
              stats={stats}
              photos={displayedPhotos}
              isScanning={
                isScanning
              }
              onChooseFolder={
                importPhotos
              }
              favoritePaths={favoritePaths}
              onToggleFavorite={toggleFavorite}
            />
          );

        case "all-photos":
          return (
            <AllPhotos
              photos={
                displayedPhotos
              }
              folderName={
                folderName
              }
              onRemoveFolder={
                handleRemoveFolder
              }
              isSearching={
                isSearching
              }
            />
          );

        case "albums":
          return (
            <Albums
              photos={photos}
              classifications={
                classificationResults
              }
              analyzing={
                isClassifying
              }
              analyzedCount={
                classificationAnalyzedCount
              }
              analysisError={
                classificationError
              }
              analysisComplete={
                classificationComplete
              }
              favoritePaths={favoritePaths}
              onToggleFavorite={toggleFavorite}
            />
          );

        case "duplicates":
          return (
            <Duplicates
              photos={photos}
              result={
                duplicateResult
              }
              scanning={
                isDuplicateScanning
              }
              error={
                duplicateError
              }
              onRescan={
                rescanDuplicates
              }
            />
          );

        case "settings":
          return (
            <section className="settings-page">
              <div className="settings-page-heading">
                <div>
                  <h1>Settings</h1>
                  <p className="subtitle">
                    Manage the local library, AI analysis, appearance, and app information.
                  </p>
                </div>
              </div>

              {settingsNotice && (
                <div className="settings-notice" role="status">
                  {settingsNotice}
                  <button
                    type="button"
                    onClick={() => setSettingsNotice(null)}
                    aria-label="Dismiss settings notification"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="settings-grid">
                <div className="panel-card settings-card">
                  <h2>Photo library</h2>
                  <div className="settings-group">
                    <div className="setting-row">
                      <div>
                        <div className="setting-label">Imported folder</div>
                        <div className="setting-help">
                          {folderName ?? "No folder imported"}
                        </div>
                      </div>
                      <span className="setting-pill">
                        {photos.length} photos
                      </span>
                    </div>
                    <div className="setting-row settings-action-row">
                      <div>
                        <div className="setting-label">Change folder</div>
                        <div className="setting-help">
                          Import another local photo folder.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button"
                        onClick={importPhotos}
                        disabled={isScanning}
                      >
                        {isScanning ? "Importing..." : "Choose folder"}
                      </button>
                    </div>
                    <div className="setting-row settings-action-row">
                      <div>
                        <div className="setting-label">Remove imported folder</div>
                        <div className="setting-help">
                          Removes the library reference, not your original files.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button danger"
                        onClick={handleRemoveFolder}
                        disabled={photos.length === 0}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel-card settings-card">
                  <h2>AI processing</h2>
                  <div className="settings-group">
                    <div className="setting-row settings-action-row">
                      <div>
                        <div className="setting-label">Smart Albums analysis</div>
                        <div className="setting-help">
                          Rebuild local photo classifications.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button"
                        onClick={clearClassificationCache}
                        disabled={isClassifying || photos.length === 0}
                      >
                        {isClassifying ? "Analyzing..." : "Re-analyze"}
                      </button>
                    </div>
                    <div className="setting-row settings-action-row">
                      <div>
                        <div className="setting-label">Duplicate detection</div>
                        <div className="setting-help">
                          Clear saved results before the next scan.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-button"
                        onClick={clearDuplicateCache}
                        disabled={isDuplicateScanning}
                      >
                        Clear results
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel-card settings-card">
                  <h2>Privacy and storage</h2>
                  <div className="settings-group">
                    <div className="setting-row">
                      <div>
                        <div className="setting-label">Local processing</div>
                        <div className="setting-help">
                          Photo analysis is designed to run on this device.
                        </div>
                      </div>
                      <span className="setting-pill enabled">Enabled</span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="setting-label">Original photos</div>
                        <div className="setting-help">
                          The app does not delete original photo files.
                        </div>
                      </div>
                      <span className="setting-pill">On device</span>
                    </div>
                  </div>
                </div>

                <div className="panel-card settings-card">
                  <h2>About</h2>
                  <div className="settings-group">
                    <div className="setting-row">
                      <div>
                        <div className="setting-label">AI Photo Intelligence</div>
                        <div className="setting-help">
                          Local photo organization and discovery.
                        </div>
                      </div>
                      <span className="setting-pill">
                        Version {APP_VERSION}
                      </span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="setting-label">Data architecture</div>
                        <div className="setting-help">
                          SQLite metadata with local vector search.
                        </div>
                      </div>
                      <span className="setting-pill">Local mode</span>
                    </div>
                    <div className="setting-row settings-action-row">
                      <div>
                        <div className="setting-label">Application updates</div>
                        <div className="setting-help">
                          Check for a newer desktop app and bundled backend.
                        </div>
                      </div>
                      {availableUpdateVersion ? (
                        <button
                          type="button"
                          className="settings-action-button"
                          onClick={() => {
                            void openUpdateDownload();
                          }}
                        >
                          Download update
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="settings-action-button"
                          onClick={checkForUpdates}
                          disabled={isCheckingForUpdates}
                        >
                          {isCheckingForUpdates
                            ? "Checking..."
                            : "Check for updates"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );

        case "people":
          return (
            <Placeholder
              title="People"
            />
          );

        case "places":
          return (
            <Placeholder
              title="Places"
            />
          );

        case "favorites": {
          const favoritePhotos =
            photos.filter((photo) =>
              isFavorite(photo.path),
            );

          return (
            <section className="content-area">
              <div className="page-header">
                <h1>Favorites</h1>

                <p className="subtitle">
                  Keep the photos you love most in one place.
                </p>
              </div>

              {favoritePhotos.length === 0 ? (
                <div className="recent-panel">
                  <div className="empty-state">
                    <div className="empty-box">
                      <Heart size={42} />
                    </div>

                    <h2>
                      No favorite photos yet
                    </h2>

                    <p>
                      Like a photo to keep it as a favorite.
                    </p>

                    <p>
                      Your favorite photos will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="all-photos-panel">
                  <div className="section-heading">
                    <h3>
                      Favorite Photos
                    </h3>

                    <span className="photo-count">
                      {favoritePhotos.length} {
                        favoritePhotos.length === 1
                          ? "photo"
                          : "photos"
                      }
                    </span>
                  </div>

                  <div className="all-photos-grid">
                    {favoritePhotos.map((photo) => (
                      <div
                        className="all-photo-card"
                        key={photo.path}
                      >
                        <img
                          src={photo.src}
                          alt={photo.name}
                          loading="lazy"
                        />

                        <button
                          type="button"
                          className="favorite-photo-button"
                          aria-label={
                            isFavorite(photo.path)
                              ? `Remove ${photo.name} from favorites`
                              : `Add ${photo.name} to favorites`
                          }
                          aria-pressed={
                            isFavorite(photo.path)
                          }
                          onClick={() =>
                            toggleFavorite(photo.path)
                          }
                        >
                          <Heart
                            size={18}
                            fill={
                              isFavorite(photo.path)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>

                        <div className="photo-name">
                          {photo.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        }

        case "create-albums":
          return (
            <CreateAlbums
              photos={photos}
              favoritePaths={favoritePaths}
            />
          );

        case "profile":
          return (
            <Placeholder
              title="Profile"
            />
          );

        default:
          return (
            <Home
              stats={stats}
              photos={displayedPhotos}
              isScanning={
                isScanning
              }
              onChooseFolder={
                importPhotos
              }
              favoritePaths={favoritePaths}
              onToggleFavorite={toggleFavorite}
            />
          );
      }
    };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="app-shell dark">
      <Sidebar
        items={sidebarItems}
        activeView={activeView}
        onOpenView={openView}
      />

      <main className="main-panel">
        <header className="topbar">
          {activeView !== "home" &&
            activeView !== "settings" &&
            activeView !== "albums" &&
            activeView !== "duplicates" &&
            activeView !== "favorites" && (
              <SearchBar
                onResults={
                  setSearchResults
                }
                onSearchChange={
                  setIsSearching
                }
                onQueryChange={
                  setSearchQuery
                }
              />
            )}

        </header>

        {availableUpdateVersion && (
          <div className="app-update-banner" role="status">
            <span>
              AI Photo Intelligence {availableUpdateVersion} is available.
            </span>
            <button
              type="button"
              onClick={() => {
                void openUpdateDownload();
              }}
            >
              Download update
            </button>
          </div>
        )}

        {renderView()}
      </main>
    </div>
  );
}

export default App;
