import {
  convertFileSrc,
  invoke,
} from "@tauri-apps/api/core";

import { open } from "@tauri-apps/plugin-dialog";

import type {
  PhotoItem,
  ScanResult,
} from "../types/photos";

export interface ImportOutcome {
  status:
    | "cancelled"
    | "completed"
    | "failed";

  photos: PhotoItem[];

  skippedFiles: number;

  readErrors: number;

  folderPath: string | null;

  folderName: string | null;

  message?: string;
}

/* =========================================================
   API
========================================================= */

const AI_API_URL =
  "http://127.0.0.1:8000";

/* =========================================================
   PATH HELPERS
========================================================= */

/**
 * Normalize only for comparison / filename extraction.
 *
 * IMPORTANT:
 * This must NEVER replace the original PhotoItem.path.
 */
function comparisonPath(
  path: string,
): string {
  return path
    .trim()
    .replace(
      /^file:\/\/\/?/i,
      "",
    )
    .replace(
      /^[\\/]+[?][\\/]+/,
      "",
    )
    .replace(
      /^[\\/]+[?]/,
      "",
    )
    .replace(
      /[\\/]+/g,
      "\\",
    );
}

/**
 * Extract filename from a filesystem path.
 */
function getFileName(
  path: string,
): string {
  const normalized =
    comparisonPath(path);

  return (
    normalized
      .split("\\")
      .filter(Boolean)
      .pop() ??
    normalized
  );
}

/**
 * Extract folder name from a folder path.
 */
function getFolderName(
  path: string,
): string {
  const normalized =
    comparisonPath(path);

  return (
    normalized
      .split("\\")
      .filter(Boolean)
      .pop() ??
    normalized
  );
}

/**
 * Comparison key for duplicate paths.
 *
 * Both slash types and Windows extended paths
 * resolve to the same comparison form.
 */
function pathKey(
  path: string,
): string {
  return comparisonPath(
    path,
  )
    .replace(
      /\\/g,
      "/",
    )
    .replace(
      /\/+/g,
      "/",
    )
    .toLowerCase();
}

/* =========================================================
   SQLITE DATABASE SYNC
========================================================= */

/**
 * Save imported photo records into SQLite.
 *
 * IMPORTANT:
 * - This does NOT modify PhotoItem.path.
 * - This does NOT copy/delete image files.
 * - A SQLite failure does NOT make the photo import fail.
 * - Existing AI/Qdrant processing continues normally.
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
            photos: photos.map(
              (photo) => ({
                original_path:
                  photo.path,

                filename:
                  photo.name,

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

                width:
                  photo.width,

                height:
                  photo.height,

                file_size:
                  photo.fileSize,

                /*
                 * SHA-256 is not currently
                 * produced by the Tauri scanner,
                 * so leave it empty for now.
                 */
                sha256: null,
              }),
            ),
          }),
        },
      );

    if (!response.ok) {
      let message =
        `SQLite sync failed (${response.status}).`;

      try {
        const data: unknown =
          await response.json();

        if (
          data &&
          typeof data ===
            "object"
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
            message =
              record.detail;
          }

          if (
            typeof record.message ===
            "string"
          ) {
            message =
              record.message;
          }
        }
      } catch {
        // Keep fallback message.
      }

      console.error(
        "[SQLITE] Database sync failed:",
        message,
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
      "[SQLITE] Imported photos saved:",
      data,
    );
  } catch (error) {
    /*
     * SQLite must never break the existing
     * photo-import pipeline.
     */
    console.error(
      "[SQLITE] Database sync error:",
      error,
    );
  }
}

/* =========================================================
   IMPORT PHOTO FOLDER
========================================================= */

export async function importLocalPhotoFolder(): Promise<ImportOutcome> {
  try {
    /* -------------------------------------------------------
       SELECT FOLDER
    ------------------------------------------------------- */

    const selected =
      await open({
        directory: true,
        multiple: false,
        title:
          "Choose Photo Folder",
      });

    if (!selected) {
      return {
        status: "cancelled",
        photos: [],
        skippedFiles: 0,
        readErrors: 0,
        folderPath: null,
        folderName: null,
      };
    }

    const folderPath =
      Array.isArray(selected)
        ? selected[0]
        : selected;

    if (
      typeof folderPath !==
        "string" ||
      !folderPath.trim()
    ) {
      return {
        status: "cancelled",
        photos: [],
        skippedFiles: 0,
        readErrors: 0,
        folderPath: null,
        folderName: null,
      };
    }

    console.log(
      "[IMPORT] Selected folder:",
      folderPath,
    );

    /* -------------------------------------------------------
       ASK TAURI/RUST TO SCAN THE FOLDER
    ------------------------------------------------------- */

    const result =
      await invoke<ScanResult>(
        "scan_photo_folder",
        {
          folderPath,
        },
      );

    console.log(
      "[IMPORT] Scan result:",
      result,
    );

    /* -------------------------------------------------------
       VALIDATE SCAN RESULT
    ------------------------------------------------------- */

    if (
      !result ||
      !Array.isArray(
        result.images,
      )
    ) {
      throw new Error(
        "The photo scanner returned an invalid result.",
      );
    }

    const metadata =
      Array.isArray(
        result.metadata,
      )
        ? result.metadata
        : [];

    /* -------------------------------------------------------
       BUILD PHOTO ITEMS

       IMPORTANT:
       Preserve rawPath exactly.
    ------------------------------------------------------- */

    const photos: PhotoItem[] =
      result.images
        .filter(
          (
            path,
          ): path is string =>
            typeof path ===
              "string" &&
            path.trim().length >
              0,
        )
        .map(
          (
            rawPath,
            index,
          ) => {
            const photoMetadata =
              metadata[index];

            /*
             * Do NOT normalize rawPath here.
             *
             * Tauri's exact filesystem path
             * is kept.
             */
            const originalPath =
              rawPath.trim();

            return {
              path: originalPath,

              src:
                convertFileSrc(
                  originalPath,
                ),

              name:
                getFileName(
                  originalPath,
                ),

              dateTaken:
                photoMetadata?.dateTaken ??
                null,

              latitude:
                photoMetadata?.latitude ??
                null,

              longitude:
                photoMetadata?.longitude ??
                null,

              cameraMake:
                photoMetadata?.cameraMake ??
                null,

              cameraModel:
                photoMetadata?.cameraModel ??
                null,

              width:
                photoMetadata?.width ??
                null,

              height:
                photoMetadata?.height ??
                null,

              fileSize:
                photoMetadata?.fileSize ??
                null,
            };
          },
        );

    /* -------------------------------------------------------
       REMOVE DUPLICATE PATHS
    ------------------------------------------------------- */

    const seenPaths =
      new Set<string>();

    const uniquePhotos =
      photos.filter(
        (photo) => {
          const key =
            pathKey(
              photo.path,
            );

          if (!key) {
            return false;
          }

          if (
            seenPaths.has(key)
          ) {
            return false;
          }

          seenPaths.add(key);

          return true;
        },
      );

    console.log(
      `[IMPORT] Found ${uniquePhotos.length} supported photos.`,
    );

    console.log(
      `[IMPORT] Skipped files: ${
        result.skipped_files ?? 0
      }`,
    );

    console.log(
      `[IMPORT] Read errors: ${
        result.read_errors ?? 0
      }`,
    );

    /* -------------------------------------------------------
       EXTRA DIAGNOSTICS
    ------------------------------------------------------- */

    if (
      uniquePhotos.length >
      0
    ) {
      console.log(
        "[IMPORT] First imported path:",
        uniquePhotos[0].path,
      );

      console.log(
        "[IMPORT] Last imported path:",
        uniquePhotos[
          uniquePhotos.length - 1
        ].path,
      );
    }

    /* -------------------------------------------------------
       SAVE PHOTO RECORDS TO SQLITE
    ------------------------------------------------------- */

    await syncPhotosToDatabase(
      uniquePhotos,
    );

    /* -------------------------------------------------------
       RETURN IMPORT RESULT
    ------------------------------------------------------- */

    return {
      status: "completed",

      photos:
        uniquePhotos,

      skippedFiles:
        Number(
          result.skipped_files ??
            0,
        ),

      readErrors:
        Number(
          result.read_errors ??
            0,
        ),

      folderPath,

      folderName:
        getFolderName(
          folderPath,
        ),
    };
  } catch (error) {
    console.error(
      "[IMPORT] Photo import failed:",
      error,
    );

    return {
      status: "failed",

      photos: [],

      skippedFiles: 0,

      readErrors: 0,

      folderPath: null,

      folderName: null,

      message:
        error instanceof Error
          ? error.message
          : "Failed to import photos.",
    };
  }
}