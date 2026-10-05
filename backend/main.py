from __future__ import annotations

import re
import sqlite3
import traceback
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.ai.embeddings import (
    create_embeddings,
    find_duplicate_groups,
)

from backend.ai.objects import (
    PhotoClassification,
    classify_photos,
    create_text_embedding,
)
from backend.ai.ocr import extract_text

from backend.vector.qdrant_store import (
    get_vector_count,
    search_embeddings,
    store_embeddings,
)
from backend.paths import (
    get_data_directory,
)
from backend.version import (
    BACKEND_VERSION,
)


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="AI Photo Intelligence",
    version=BACKEND_VERSION,
)


# ============================================================
# SQLITE PHOTO LIBRARY
# ============================================================
#
# This is a small persistent local database used only to keep
# track of the photos that have been imported/indexed.
#
# It does NOT replace Qdrant, CLIP, YOLO, Smart Albums,
# duplicate detection, or the existing photo files.
#
# The database file is:
#
#     backend/data/photos.db
#
# Every successful /api/index request records its valid photo
# paths here. Because SQLite is an on-disk database, the data
# remains after the app/backend is closed.
# ============================================================

SQLITE_DATABASE_PATH = (
    get_data_directory()
    / "photos.db"
)


def get_sqlite_connection() -> sqlite3.Connection:
    """Open the persistent local SQLite database."""

    SQLITE_DATABASE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    connection = sqlite3.connect(
        str(SQLITE_DATABASE_PATH),
        timeout=30,
    )

    connection.row_factory = sqlite3.Row

    return connection


def initialize_sqlite_database() -> None:
    """Create the photo table/indexes if they do not exist."""

    with get_sqlite_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                path TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                ocr_text TEXT NOT NULL DEFAULT '',
                favorite INTEGER NOT NULL DEFAULT 0,
                imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        columns = {
            str(row[1])
            for row in connection.execute(
                "PRAGMA table_info(photos)"
            ).fetchall()
        }

        if "ocr_text" not in columns:
            connection.execute(
                "ALTER TABLE photos ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''"
            )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS
            idx_photos_filename
            ON photos(filename)
            """
        )

        connection.commit()


def save_imported_photo_paths(
    paths: list[Path],
) -> int:
    """Persist imported/validated photo paths in SQLite."""

    if not paths:
        return 0

    initialize_sqlite_database()

    stored = 0

    with get_sqlite_connection() as connection:
        for path in paths:
            path_string = str(path)

            if not path_string.strip():
                continue

            filename = path.name or path_string

            connection.execute(
                """
                INSERT INTO photos (
                    path,
                    filename
                )
                VALUES (?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    filename = excluded.filename,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    path_string,
                    filename,
                ),
            )

            stored += 1

        connection.commit()

    print(
        f"[SQLITE] Saved {stored} photo record(s) "
        f"to {SQLITE_DATABASE_PATH}"
    )

    return stored


def get_sqlite_photo_count() -> int:
    """Return the number of photo records in SQLite."""

    initialize_sqlite_database()

    with get_sqlite_connection() as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS count FROM photos"
        ).fetchone()

    return int(row["count"] if row else 0)


def get_sqlite_photos() -> list[dict[str, Any]]:
    """Return all imported photo records for inspection."""

    initialize_sqlite_database()

    with get_sqlite_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                path,
                filename,
                ocr_text,
                favorite,
                imported_at,
                updated_at
            FROM photos
            ORDER BY imported_at ASC, filename ASC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def update_photo_ocr(paths: list[Path]) -> None:
    """Persist OCR text used by precise search."""

    if not paths:
        return

    with get_sqlite_connection() as connection:
        for path in paths:
            connection.execute(
                "UPDATE photos SET ocr_text = ?, updated_at = CURRENT_TIMESTAMP WHERE path = ?",
                (extract_text(path), str(path)),
            )

        connection.commit()


def tokenize_search_text(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.casefold())
        if len(token) >= 2
    }


def lexical_search_score(query: str, filename: str, ocr_text: str) -> float:
    query_tokens = tokenize_search_text(query)
    if not query_tokens:
        return 0.0

    filename_tokens = tokenize_search_text(filename)
    ocr_tokens = tokenize_search_text(ocr_text)
    filename_matches = len(query_tokens & filename_tokens)
    ocr_matches = len(query_tokens & ocr_tokens)
    phrase = query.casefold().strip()
    filename_lower = filename.casefold()
    ocr_lower = ocr_text.casefold()

    score = (filename_matches / len(query_tokens)) * 0.85
    score += (ocr_matches / len(query_tokens)) * 0.70
    if phrase and phrase in filename_lower:
        score += 0.45
    if phrase and phrase in ocr_lower:
        score += 0.35

    return min(score, 1.0)


initialize_sqlite_database()


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Vite / browser development
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:1420",
        "http://127.0.0.1:1420",

        # Tauri
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_origin_regex=(
        r"^(https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https?://tauri\.localhost"
        r"|tauri://localhost)$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class SearchRequest(BaseModel):
    query: str = Field(
        min_length=1,
        max_length=500,
    )

    limit: int = Field(
        default=50,
        ge=1,
        le=100,
    )


class SearchResult(BaseModel):
    path: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]


class IndexRequest(BaseModel):
    paths: list[str] = Field(
        default_factory=list,
    )


class IndexResponse(BaseModel):
    indexed: int
    total_vectors: int


class HealthResponse(BaseModel):
    status: str
    vectors: int


class ClassificationRequest(BaseModel):
    paths: list[str] = Field(
        default_factory=list,
    )


class ClassificationPredictionResponse(BaseModel):
    category: str
    confidence: float


class ClassificationResultResponse(BaseModel):
    path: str
    predictions: list[
        ClassificationPredictionResponse
    ]
    albums: list[str]


class ClassificationResponse(BaseModel):
    results: list[
        ClassificationResultResponse
    ]

    requested: int
    returned: int
    cached: int
    analyzed: int
    failed: int


class DuplicateRequest(BaseModel):
    paths: list[str] = Field(
        default_factory=list,
    )


class DuplicatePredictionResponse(BaseModel):
    path_a: str
    path_b: str
    similarity: float
    prediction: str
    confidence: float


class DuplicateGroupResponse(BaseModel):
    id: str
    photos: list[str]
    similarity: float
    prediction: str

    predictions: list[
        DuplicatePredictionResponse
    ]


class DuplicateResponse(BaseModel):
    groups: list[
        DuplicateGroupResponse
    ]

    photos_analyzed: int


# ============================================================
# PATH HELPERS
# ============================================================

_WINDOWS_DRIVE_RE = re.compile(
    r"^[A-Za-z]:"
)


def repair_windows_path(
    raw_path: str,
) -> str:
    """    Convert Tauri/JavaScript Windows paths into normal filesystem paths.

    Handles normal drive paths, file URLs, and Windows extended-length
    path prefixes. The real filesystem path is returned.
    """

    path = unquote(str(raw_path).strip())

    if not path:
        return ""

    # --------------------------------------------------------
    # file:// URL forms
    # --------------------------------------------------------

    lowered = path.lower()

    if lowered.startswith("file:///"):
        path = path[8:]
    elif lowered.startswith("file://"):
        path = path[7:]

    # --------------------------------------------------------
    # Normalize separators.
    # --------------------------------------------------------

    path = path.replace("/", "\\")

    # --------------------------------------------------------
    # Remove Windows extended-path prefixes.
    #
    # \\?\C:\Users\...
    # \?\C:\Users\...
    #
    # Both become:
    #
    # C:\Users\...
    # --------------------------------------------------------

    if path.startswith("\\\\?\\"):
        path = path[4:]
    elif path.startswith("\\?\\"):
        path = path[3:]

    # --------------------------------------------------------
    # Support extended UNC paths:
    #
    # \\?\UNC\server\share\file.jpg
    #
    # becomes:
    #
    # \\server\share\file.jpg
    # --------------------------------------------------------

    if path.upper().startswith("UNC\\"):
        path = "\\\\" + path[4:]

    # --------------------------------------------------------
    # Remove a single accidental leading slash before a drive.
    #
    # \C:\Users\...
    #
    # becomes:
    #
    # C:\Users\...
    # --------------------------------------------------------

    if re.match(
        r"^\\[A-Za-z]:\\",
        path,
    ):
        path = path[1:]

    # --------------------------------------------------------
    # Fix drive-relative corruption:
    #
    # C:Users\Jaden\...
    #
    # becomes:
    #
    # C:\Users\Jaden\...
    # --------------------------------------------------------

    if _WINDOWS_DRIVE_RE.match(path):
        if (
            len(path) >= 3
            and path[2] != "\\"
        ):
            path = (
                path[:2]
                + "\\"
                + path[2:]
            )

    return path

def normalize_path(
    path: str,
) -> str:
    """
    Normalize a path ONLY for comparison.

    The real path itself is never replaced by this function.
    """

    repaired = repair_windows_path(
        str(path)
    )

    return (
        repaired
        .replace("\\", "/")
        .strip()
    )


def path_key(
    path: str,
) -> str:
    """
    Create a case-insensitive comparison key.
    """

    return normalize_path(
        path
    ).casefold()


def clean_paths(
    paths: list[str],
) -> list[Path]:
    """
    Convert frontend paths into valid local filesystem paths.

    This function is intentionally shared by:

        /api/index
        /api/classify-batch
        /api/duplicates

    so all AI features use exactly the same path handling.
    """

    valid_paths: list[Path] = []
    seen: set[str] = set()

    for raw_path in paths:

        if not isinstance(
            raw_path,
            str,
        ):
            print(
                f"[PATH SKIP] Not a string: "
                f"{raw_path!r}"
            )
            continue

        original = raw_path.strip()

        if not original:
            print(
                "[PATH SKIP] Empty path."
            )
            continue

        # ----------------------------------------------------
        # Repair path.
        # ----------------------------------------------------

        cleaned = repair_windows_path(
            original
        )

        if not cleaned:
            print(
                "[PATH SKIP] Empty repaired path."
            )
            continue

        print(
            f"[PATH INPUT] {original}"
        )

        if cleaned != original:
            print(
                f"[PATH REPAIRED] {cleaned}"
            )

        # ----------------------------------------------------
        # Create Path object.
        # ----------------------------------------------------

        try:
            path = Path(cleaned).expanduser()

        except Exception as error:
            print(
                f"[PATH SKIP] "
                f"Unable to create Path: "
                f"{cleaned!r} | {error}"
            )
            continue

        # ----------------------------------------------------
        # Resolve without requiring strict=True.
        # ----------------------------------------------------

        try:
            resolved = path.resolve(
                strict=False
            )

        except Exception as error:
            print(
                f"[PATH SKIP] "
                f"Unable to resolve: "
                f"{cleaned!r} | {error}"
            )
            continue

        # ----------------------------------------------------
        # Existence check.
        # ----------------------------------------------------

        if not resolved.exists():
            print(
                f"[PATH SKIP] File does not exist: "
                f"{resolved}"
            )
            continue

        if not resolved.is_file():
            print(
                f"[PATH SKIP] Path is not a file: "
                f"{resolved}"
            )
            continue

        # ----------------------------------------------------
        # Deduplicate.
        # ----------------------------------------------------

        key = path_key(
            str(resolved)
        )

        if key in seen:
            continue

        seen.add(key)
        valid_paths.append(
            resolved
        )

    print(
        f"[PATH] Received: {len(paths)} | "
        f"Valid: {len(valid_paths)}"
    )

    return valid_paths


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": (
            "AI Photo Intelligence API is running."
        ),
    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/health",
    response_model=HealthResponse,
)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        vectors=get_vector_count(),
    )


# ============================================================
# SEARCH
# ============================================================

@app.post(
    "/api/search",
    response_model=SearchResponse,
)
def search_photos(
    request: SearchRequest,
) -> SearchResponse:

    cleaned_query = (
        request.query.strip()
    )

    if not cleaned_query:
        return SearchResponse(
            results=[],
        )

    try:
        print(
            f"[SEARCH] Creating text embedding "
            f"for: '{cleaned_query}'"
        )

        query_embedding = (
            create_text_embedding(
                cleaned_query
            )
        )

        print(
            f"[SEARCH] Text embedding dimensions: "
            f"{len(query_embedding)}"
        )

        matches = search_embeddings(
            query_embedding=query_embedding,
            limit=request.limit,
        )

    except Exception as error:
        print(
            "\n========== SEARCH ERROR =========="
        )

        print(
            f"Error type: "
            f"{type(error).__name__}"
        )

        print(
            f"Error message: "
            f"{error}"
        )

        traceback.print_exc()

        print(
            "==================================\n"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: "
                f"{error}"
            ),
        ) from error

    ranked: dict[str, tuple[str, float]] = {}

    for match in matches:
        if not isinstance(match, dict):
            continue

        path = match.get("path")
        if not isinstance(path, str) or not path.strip():
            continue

        try:
            semantic_score = float(match.get("score", 0.0))
        except (TypeError, ValueError):
            semantic_score = 0.0

        ranked[path_key(path)] = (
            path,
            max(0.0, semantic_score) * 0.55,
        )

    for record in get_sqlite_photos():
        path = record.get("path")
        if not isinstance(path, str) or not path.strip():
            continue

        lexical_score = lexical_search_score(
            cleaned_query,
            str(record.get("filename", "")),
            str(record.get("ocr_text", "")),
        )

        if lexical_score <= 0.0:
            continue

        key = path_key(path)
        previous = ranked.get(key)
        semantic_score = previous[1] / 0.55 if previous else 0.0
        ranked[key] = (
            path,
            min(
                1.0,
                semantic_score * 0.55 + lexical_score * 0.45,
            ),
        )

    results = [
        SearchResult(path=path, score=score)
        for path, score in sorted(
            ranked.values(),
            key=lambda item: item[1],
            reverse=True,
        )[: request.limit]
    ]

    print(
        f"[SEARCH] "
        f"Query: '{cleaned_query}' | "
        f"Results: {len(results)}"
    )

    return SearchResponse(
        results=results,
    )


# ============================================================
# INDEX PHOTOS
# ============================================================

@app.post(
    "/api/index",
    response_model=IndexResponse,
)
def index_photos(
    request: IndexRequest,
) -> IndexResponse:

    if not request.paths:
        return IndexResponse(
            indexed=0,
            total_vectors=get_vector_count(),
        )

    valid_paths = clean_paths(
        request.paths
    )

    if not valid_paths:
        return IndexResponse(
            indexed=0,
            total_vectors=get_vector_count(),
        )

    # --------------------------------------------------------
    # PERSIST IMPORTED PHOTO RECORDS
    # --------------------------------------------------------
    #
    # Keep the existing Qdrant/AI indexing exactly as before.
    # SQLite is simply updated alongside it so the imported
    # library remains available after the app is restarted.
    # --------------------------------------------------------

    try:
        save_imported_photo_paths(
            valid_paths
        )

        update_photo_ocr(valid_paths)
    except Exception as sqlite_error:
        # Never break the existing AI indexing pipeline just
        # because the auxiliary SQLite record write failed.
        print(
            "[SQLITE ERROR] Failed to save imported photos: "
            f"{type(sqlite_error).__name__}: {sqlite_error}"
        )

    try:
        print(
            f"[INDEX] Creating embeddings "
            f"for {len(valid_paths)} photos..."
        )

        embeddings = create_embeddings(
            valid_paths
        )

        if not embeddings:
            return IndexResponse(
                indexed=0,
                total_vectors=get_vector_count(),
            )

        indexed_count = (
            store_embeddings(
                embeddings
            )
        )

        total_vectors = (
            get_vector_count()
        )

        print(
            f"[INDEX] Indexed "
            f"{indexed_count} photos."
        )

        print(
            f"[INDEX] Total vectors: "
            f"{total_vectors}"
        )

        return IndexResponse(
            indexed=indexed_count,
            total_vectors=total_vectors,
        )

    except Exception as error:
        print(
            "\n========== INDEX ERROR =========="
        )

        print(
            f"Error type: "
            f"{type(error).__name__}"
        )

        print(
            f"Error message: "
            f"{error}"
        )

        traceback.print_exc()

        print(
            "=================================\n"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: "
                f"{error}"
            ),
        ) from error


# ============================================================
# CLASSIFY BATCH
# ============================================================

@app.post(
    "/api/classify-batch",
    response_model=ClassificationResponse,
)
def classify_batch(
    request: ClassificationRequest,
) -> ClassificationResponse:
    """
    Classify photos into Smart Albums.

    The actual AI classification is performed by:

        backend.ai.objects.classify_photos()
    """

    requested_count = len(
        request.paths
    )

    print(
        f"[CLASSIFY] Request received: "
        f"{requested_count} paths"
    )

    if requested_count == 0:
        return ClassificationResponse(
            results=[],
            requested=0,
            returned=0,
            cached=0,
            analyzed=0,
            failed=0,
        )

    valid_paths = clean_paths(
        request.paths
    )

    print(
        f"[CLASSIFY] Valid paths: "
        f"{len(valid_paths)}"
    )

    if not valid_paths:
        return ClassificationResponse(
            results=[],
            requested=requested_count,
            returned=0,
            cached=0,
            analyzed=0,
            failed=requested_count,
        )

    try:
        print(
            f"[CLASSIFY] Running AI "
            f"on {len(valid_paths)} photos..."
        )

        classifications = (
            classify_photos(
                [
                    str(path)
                    for path in valid_paths
                ]
            )
        )

    except Exception as error:
        print(
            "\n========== CLASSIFICATION ERROR =========="
        )

        print(
            f"Error type: "
            f"{type(error).__name__}"
        )

        print(
            f"Error message: "
            f"{error}"
        )

        traceback.print_exc()

        print(
            "===========================================\n"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: "
                f"{error}"
            ),
        ) from error

    results: list[
        ClassificationResultResponse
    ] = []

    for classification in classifications:

        if not isinstance(
            classification,
            PhotoClassification,
        ):
            continue

        predictions = [
            ClassificationPredictionResponse(
                category=prediction.category,
                confidence=float(
                    prediction.confidence
                ),
            )
            for prediction
            in classification.predictions
        ]

        result = ClassificationResultResponse(
            path=str(
                classification.path
            ),
            predictions=predictions,
            albums=[
                str(album)
                for album
                in classification.albums
            ],
        )

        results.append(
            result
        )

        print(
            f"[CLASSIFY] "
            f"{Path(result.path).name}: "
            f"{result.albums or ['No confident category']}"
        )

    returned_count = len(
        results
    )

    failed_count = max(
        0,
        len(valid_paths)
        - returned_count,
    )

    print(
        f"[CLASSIFY] "
        f"Requested: {requested_count} | "
        f"Returned: {returned_count} | "
        f"Failed: {failed_count}"
    )

    return ClassificationResponse(
        results=results,
        requested=requested_count,
        returned=returned_count,
        cached=0,
        analyzed=returned_count,
        failed=failed_count,
    )


# ============================================================
# DUPLICATE DETECTION
# ============================================================

@app.post(
    "/api/duplicates",
    response_model=DuplicateResponse,
)
def detect_duplicates(
    request: DuplicateRequest,
) -> DuplicateResponse:

    requested_count = len(
        request.paths
    )

    print(
        f"[DUPLICATES] Request received: "
        f"{requested_count} paths"
    )

    if requested_count < 2:
        return DuplicateResponse(
            groups=[],
            photos_analyzed=requested_count,
        )

    valid_paths = clean_paths(
        request.paths
    )

    print(
        f"[DUPLICATES] Valid paths: "
        f"{len(valid_paths)}"
    )

    if len(valid_paths) < 2:
        return DuplicateResponse(
            groups=[],
            photos_analyzed=len(
                valid_paths
            ),
        )

    try:
        print(
            f"[DUPLICATES] "
            f"Analyzing {len(valid_paths)} photos..."
        )

        result = find_duplicate_groups(
            [
                str(path)
                for path in valid_paths
            ]
        )

        if not isinstance(
            result,
            dict,
        ):
            result = {}

        raw_groups = result.get(
            "groups",
            [],
        )

        raw_analyzed = result.get(
            "photos_analyzed",
            len(valid_paths),
        )

        if not isinstance(
            raw_groups,
            list,
        ):
            raw_groups = []

        try:
            analyzed_count = int(
                raw_analyzed
            )

        except (
            TypeError,
            ValueError,
        ):
            analyzed_count = len(
                valid_paths
            )

        response_groups: list[
            DuplicateGroupResponse
        ] = []

        for group in raw_groups:

            if not isinstance(
                group,
                dict,
            ):
                continue

            group_id = str(
                group.get(
                    "id",
                    "",
                )
            )

            raw_photos = group.get(
                "photos",
                [],
            )

            if not isinstance(
                raw_photos,
                list,
            ):
                raw_photos = []

            try:
                numeric_similarity = float(
                    group.get(
                        "similarity",
                        0.0,
                    )
                )

            except (
                TypeError,
                ValueError,
            ):
                numeric_similarity = 0.0

            prediction = str(
                group.get(
                    "prediction",
                    "VERY SIMILAR",
                )
            )

            raw_predictions = (
                group.get(
                    "predictions",
                    [],
                )
            )

            if not isinstance(
                raw_predictions,
                list,
            ):
                raw_predictions = []

            response_predictions: list[
                DuplicatePredictionResponse
            ] = []

            for item in raw_predictions:

                if not isinstance(
                    item,
                    dict,
                ):
                    continue

                try:
                    pair_similarity = float(
                        item.get(
                            "similarity",
                            0.0,
                        )
                    )

                except (
                    TypeError,
                    ValueError,
                ):
                    pair_similarity = 0.0

                try:
                    confidence = float(
                        item.get(
                            "confidence",
                            0.0,
                        )
                    )

                except (
                    TypeError,
                    ValueError,
                ):
                    confidence = 0.0

                response_predictions.append(
                    DuplicatePredictionResponse(
                        path_a=str(
                            item.get(
                                "path_a",
                                "",
                            )
                        ),
                        path_b=str(
                            item.get(
                                "path_b",
                                "",
                            )
                        ),
                        similarity=pair_similarity,
                        prediction=str(
                            item.get(
                                "prediction",
                                "DIFFERENT",
                            )
                        ),
                        confidence=confidence,
                    )
                )

            response_groups.append(
                DuplicateGroupResponse(
                    id=group_id,
                    photos=[
                        str(path)
                        for path
                        in raw_photos
                    ],
                    similarity=numeric_similarity,
                    prediction=prediction,
                    predictions=response_predictions,
                )
            )

        print(
            f"[DUPLICATES] "
            f"Analyzed: {analyzed_count} | "
            f"Groups: {len(response_groups)}"
        )

        return DuplicateResponse(
            groups=response_groups,
            photos_analyzed=analyzed_count,
        )

    except Exception as error:
        print(
            "\n========== DUPLICATE ERROR =========="
        )

        print(
            f"Error type: "
            f"{type(error).__name__}"
        )

        print(
            f"Error message: "
            f"{error}"
        )

        traceback.print_exc()

        print(
            "======================================\n"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: "
                f"{error}"
            ),
        ) from error


# ============================================================
# SQLITE DATABASE STATUS
# ============================================================

@app.get("/api/database/count")
def database_count() -> dict[str, Any]:
    """Return how many imported photo records are in SQLite."""

    try:
        return {
            "database": str(
                SQLITE_DATABASE_PATH
            ),
            "count": get_sqlite_photo_count(),
        }
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: {error}"
            ),
        ) from error


@app.get("/api/database/photos")
def database_photos() -> dict[str, Any]:
    """Return the imported photo records stored in SQLite."""

    try:
        photos = get_sqlite_photos()

        return {
            "database": str(
                SQLITE_DATABASE_PATH
            ),
            "count": len(photos),
            "photos": photos,
        }
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"{type(error).__name__}: {error}"
            ),
        ) from error


# ============================================================
# VECTOR DATABASE STATUS
# ============================================================

@app.get("/api/version")
def version() -> dict[str, str]:
    return {
        "backend": BACKEND_VERSION,
    }

@app.get("/api/vectors")
def vector_status() -> dict[str, Any]:
    return {
        "vectors": get_vector_count(),
    }


# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--host",
        default="127.0.0.1",
    )
    parser.add_argument(
        "--port",
        default=8000,
        type=int,
    )
    arguments = parser.parse_args()

    uvicorn.run(
        app,
        host=arguments.host,
        port=arguments.port,
        reload=False,
    )