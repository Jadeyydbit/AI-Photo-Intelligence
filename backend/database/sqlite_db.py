from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from backend.paths import (
    get_data_directory,
)


# ============================================================
# DATABASE PATH
# ============================================================

DATABASE_PATH = (
    get_data_directory()
    / "photos.db"
)


# ============================================================
# CONNECTION
# ============================================================

def get_connection() -> sqlite3.Connection:
    """
    Create a connection to the SQLite database.
    """

    DATABASE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    connection = sqlite3.connect(
        DATABASE_PATH
    )

    connection.row_factory = (
        sqlite3.Row
    )

    return connection


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def initialize_database() -> None:
    """
    Create the photos table if it does not exist.
    """

    with get_connection() as connection:

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,

                path TEXT NOT NULL UNIQUE,

                sha256 TEXT,

                predictions TEXT,

                albums TEXT,

                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        connection.commit()


# ============================================================
# UPSERT PHOTO
# ============================================================

def save_photo(
    photo_id: str,
    path: str,
    sha256: str | None = None,
    predictions: list[dict[str, Any]] | None = None,
    albums: list[str] | None = None,
) -> None:
    """
    Insert or update photo metadata.
    """

    predictions_json = json.dumps(
        predictions or []
    )

    albums_json = json.dumps(
        albums or []
    )

    with get_connection() as connection:

        connection.execute(
            """
            INSERT INTO photos (
                id,
                path,
                sha256,
                predictions,
                albums
            )

            VALUES (?, ?, ?, ?, ?)

            ON CONFLICT(path)
            DO UPDATE SET

                id = excluded.id,
                sha256 = excluded.sha256,
                predictions = excluded.predictions,
                albums = excluded.albums
            """,
            (
                photo_id,
                path,
                sha256,
                predictions_json,
                albums_json,
            ),
        )

        connection.commit()


# ============================================================
# GET PHOTO
# ============================================================

def get_photo(
    photo_id: str,
) -> dict[str, Any] | None:
    """
    Get a photo by its ID.
    """

    with get_connection() as connection:

        cursor = connection.execute(
            """
            SELECT *
            FROM photos
            WHERE id = ?
            """,
            (photo_id,),
        )

        row = cursor.fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "path": row["path"],
        "sha256": row["sha256"],

        "predictions": json.loads(
            row["predictions"]
            or "[]"
        ),

        "albums": json.loads(
            row["albums"]
            or "[]"
        ),

        "created_at": row[
            "created_at"
        ],
    }


# ============================================================
# GET PHOTO BY PATH
# ============================================================

def get_photo_by_path(
    path: str,
) -> dict[str, Any] | None:

    with get_connection() as connection:

        cursor = connection.execute(
            """
            SELECT *
            FROM photos
            WHERE path = ?
            """,
            (path,),
        )

        row = cursor.fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "path": row["path"],
        "sha256": row["sha256"],

        "predictions": json.loads(
            row["predictions"]
            or "[]"
        ),

        "albums": json.loads(
            row["albums"]
            or "[]"
        ),

        "created_at": row[
            "created_at"
        ],
    }


# ============================================================
# GET MULTIPLE PHOTOS
# ============================================================

def get_photos(
    photo_ids: list[str],
) -> list[dict[str, Any]]:
    """
    Get multiple photos while preserving
    the order of the supplied IDs.
    """

    if not photo_ids:
        return []

    placeholders = ",".join(
        "?"
        for _ in photo_ids
    )

    with get_connection() as connection:

        cursor = connection.execute(
            f"""
            SELECT *
            FROM photos
            WHERE id IN ({placeholders})
            """,
            photo_ids,
        )

        rows = cursor.fetchall()

    photos_by_id: dict[
        str,
        dict[str, Any]
    ] = {}

    for row in rows:

        photos_by_id[
            row["id"]
        ] = {
            "id": row["id"],
            "path": row["path"],
            "sha256": row["sha256"],

            "predictions": json.loads(
                row["predictions"]
                or "[]"
            ),

            "albums": json.loads(
                row["albums"]
                or "[]"
            ),

            "created_at": row[
                "created_at"
            ],
        }

    return [
        photos_by_id[photo_id]
        for photo_id in photo_ids
        if photo_id in photos_by_id
    ]


# ============================================================
# DATABASE STATS
# ============================================================

def get_photo_count() -> int:

    with get_connection() as connection:

        cursor = connection.execute(
            """
            SELECT COUNT(*)
            AS count
            FROM photos
            """
        )

        row = cursor.fetchone()

    return int(
        row["count"]
    )


# ============================================================
# INITIALIZE ON IMPORT
# ============================================================

initialize_database()