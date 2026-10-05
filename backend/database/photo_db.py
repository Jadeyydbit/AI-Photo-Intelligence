from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from typing import Any

from backend.paths import (
    get_data_directory,
)


# ============================================================
# DATABASE LOCATION
# ============================================================

DATABASE_DIR = get_data_directory()

DATABASE_PATH = (
    DATABASE_DIR
    / "photos.db"
)


# ============================================================
# CONNECTION
# ============================================================

def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(
        str(DATABASE_PATH),
        timeout=30,
    )

    connection.row_factory = sqlite3.Row

    return connection


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def initialize_database() -> None:
    """
    Create the SQLite database and tables if they do not exist.
    """

    with get_connection() as connection:

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,

                original_path TEXT NOT NULL UNIQUE,

                filename TEXT NOT NULL,

                date_taken TEXT,

                latitude REAL,

                longitude REAL,

                camera_make TEXT,

                camera_model TEXT,

                width INTEGER,

                height INTEGER,

                file_size INTEGER,

                sha256 TEXT,

                favorite INTEGER NOT NULL DEFAULT 0,

                created_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_photos_original_path
            ON photos(original_path)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_photos_filename
            ON photos(filename)
            """
        )

        connection.commit()


# ============================================================
# PATH NORMALIZATION
# ============================================================

def normalize_path(
    path: str,
) -> str:
    return (
        str(path)
        .replace("\\", "/")
        .strip()
        .casefold()
    )


# ============================================================
# PHOTO ID
# ============================================================

def create_photo_id(
    path: str,
) -> str:
    normalized = normalize_path(
        path
    )

    return hashlib.sha256(
        normalized.encode("utf-8")
    ).hexdigest()


# ============================================================
# UPSERT ONE PHOTO
# ============================================================

def upsert_photo(
    *,
    original_path: str,
    filename: str,
    date_taken: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    camera_make: str | None = None,
    camera_model: str | None = None,
    width: int | None = None,
    height: int | None = None,
    file_size: int | None = None,
    sha256: str | None = None,
) -> None:

    photo_id = create_photo_id(
        original_path
    )

    with get_connection() as connection:

        connection.execute(
            """
            INSERT INTO photos (
                id,
                original_path,
                filename,
                date_taken,
                latitude,
                longitude,
                camera_make,
                camera_model,
                width,
                height,
                file_size,
                sha256,
                favorite
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)

            ON CONFLICT(original_path)
            DO UPDATE SET
                filename = excluded.filename,
                date_taken = excluded.date_taken,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                camera_make = excluded.camera_make,
                camera_model = excluded.camera_model,
                width = excluded.width,
                height = excluded.height,
                file_size = excluded.file_size,
                sha256 = excluded.sha256,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                photo_id,
                original_path,
                filename,
                date_taken,
                latitude,
                longitude,
                camera_make,
                camera_model,
                width,
                height,
                file_size,
                sha256,
            ),
        )

        connection.commit()


# ============================================================
# UPSERT MANY PHOTOS
# ============================================================

def upsert_photos(
    photos: list[dict[str, Any]],
) -> int:
    """
    Insert or update many photos.

    Returns the number of successfully processed records.
    """

    if not photos:
        return 0

    processed = 0

    with get_connection() as connection:

        for photo in photos:

            original_path = str(
                photo.get(
                    "original_path",
                    "",
                )
            ).strip()

            if not original_path:
                continue

            filename = str(
                photo.get(
                    "filename",
                    Path(
                        original_path
                    ).name,
                )
            )

            photo_id = create_photo_id(
                original_path
            )

            connection.execute(
                """
                INSERT INTO photos (
                    id,
                    original_path,
                    filename,
                    date_taken,
                    latitude,
                    longitude,
                    camera_make,
                    camera_model,
                    width,
                    height,
                    file_size,
                    sha256,
                    favorite
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)

                ON CONFLICT(original_path)
                DO UPDATE SET
                    filename = excluded.filename,
                    date_taken = excluded.date_taken,
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    camera_make = excluded.camera_make,
                    camera_model = excluded.camera_model,
                    width = excluded.width,
                    height = excluded.height,
                    file_size = excluded.file_size,
                    sha256 = excluded.sha256,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    photo_id,
                    original_path,
                    filename,
                    photo.get("date_taken"),
                    photo.get("latitude"),
                    photo.get("longitude"),
                    photo.get("camera_make"),
                    photo.get("camera_model"),
                    photo.get("width"),
                    photo.get("height"),
                    photo.get("file_size"),
                    photo.get("sha256"),
                ),
            )

            processed += 1

        connection.commit()

    return processed


# ============================================================
# GET ALL PHOTOS
# ============================================================

def get_all_photos() -> list[dict[str, Any]]:
    initialize_database()

    with get_connection() as connection:

        rows = connection.execute(
            """
            SELECT
                id,
                original_path,
                filename,
                date_taken,
                latitude,
                longitude,
                camera_make,
                camera_model,
                width,
                height,
                file_size,
                sha256,
                favorite,
                created_at,
                updated_at
            FROM photos
            ORDER BY created_at ASC
            """
        ).fetchall()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# COUNT PHOTOS
# ============================================================

def get_photo_count() -> int:
    initialize_database()

    with get_connection() as connection:

        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM photos
            """
        ).fetchone()

    return int(
        row["count"]
        if row
        else 0
    )


# ============================================================
# FAVORITE
# ============================================================

def set_favorite(
    path: str,
    favorite: bool,
) -> bool:

    normalized = normalize_path(
        path
    )

    with get_connection() as connection:

        cursor = connection.execute(
            """
            UPDATE photos
            SET
                favorite = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE lower(
                replace(
                    original_path,
                    '\\',
                    '/'
                )
            ) = ?
            """,
            (
                1 if favorite else 0,
                normalized,
            ),
        )

        connection.commit()

        return cursor.rowcount > 0


# ============================================================
# INITIALIZE ON IMPORT
# ============================================================

initialize_database()