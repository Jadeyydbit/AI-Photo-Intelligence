from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)
from backend.paths import (
    get_data_directory,
)


# ============================================================
# SETTINGS
# ============================================================

QDRANT_PATH = get_data_directory() / "qdrant"

COLLECTION_NAME = "photo_embeddings"


# ============================================================
# CLIENT
# ============================================================

_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    """
    Get the persistent local Qdrant client.
    """

    global _client

    if _client is None:
        QDRANT_PATH.mkdir(
            parents=True,
            exist_ok=True,
        )

        _client = QdrantClient(
            path=str(QDRANT_PATH),
        )

    return _client


# ============================================================
# PATH NORMALIZATION
# ============================================================

def normalize_path(
    path: str,
) -> str:
    """
    Normalize a path for stable comparisons and IDs.

    This is only used internally. The original path
    is still stored in the Qdrant payload.
    """

    return (
        str(path)
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


# ============================================================
# COLLECTION HELPERS
# ============================================================

def collection_exists() -> bool:
    """
    Return True if the photo embedding collection exists.
    """

    client = get_qdrant_client()

    collections = client.get_collections()

    return any(
        collection.name == COLLECTION_NAME
        for collection in collections.collections
    )


def get_collection_vector_size() -> int | None:
    """
    Get the configured vector dimension for the collection.

    Supports common Qdrant client versions and both
    unnamed and named vector configurations.
    """

    if not collection_exists():
        return None

    client = get_qdrant_client()

    info = client.get_collection(
        collection_name=COLLECTION_NAME,
    )

    vectors_config = (
        info
        .config
        .params
        .vectors
    )

    if hasattr(
        vectors_config,
        "size",
    ):
        return int(
            vectors_config.size
        )

    if isinstance(
        vectors_config,
        dict,
    ):
        if "" in vectors_config:
            config = vectors_config[""]

            if hasattr(
                config,
                "size",
            ):
                return int(
                    config.size
                )

        for config in vectors_config.values():
            if hasattr(
                config,
                "size",
            ):
                return int(
                    config.size
                )

    return None


# ============================================================
# PHOTO ID
# ============================================================

def create_photo_id(
    path: str,
) -> str:
    """
    Create a stable UUID-compatible ID from the photo path.

    The ID remains stable across application restarts.
    """

    normalized_path = path_key(
        path
    )

    digest = hashlib.md5(
        normalized_path.encode(
            "utf-8",
        )
    ).hexdigest()

    return (
        f"{digest[:8]}-"
        f"{digest[8:12]}-"
        f"{digest[12:16]}-"
        f"{digest[16:20]}-"
        f"{digest[20:32]}"
    )


# ============================================================
# COLLECTION
# ============================================================

def ensure_collection(
    vector_size: int,
) -> None:
    """
    Ensure the Qdrant collection exists and has the
    expected embedding dimension.
    """

    if vector_size <= 0:
        raise ValueError(
            "Vector size must be greater than zero."
        )

    client = get_qdrant_client()

    if collection_exists():
        existing_size = (
            get_collection_vector_size()
        )

        if existing_size is None:
            raise RuntimeError(
                "Unable to determine the existing "
                "Qdrant collection vector dimension."
            )

        if existing_size != vector_size:
            raise RuntimeError(
                "Qdrant vector dimension mismatch. "
                f"Collection has {existing_size}, "
                f"but embedding has {vector_size}. "
                "Delete the old collection before "
                "re-indexing."
            )

        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=vector_size,
            distance=Distance.COSINE,
        ),
    )

    print(
        f"[QDRANT] Created collection: "
        f"{COLLECTION_NAME} "
        f"({vector_size} dimensions)"
    )


# ============================================================
# STORE ONE EMBEDDING
# ============================================================

def store_embedding(
    photo_id: str,
    embedding: list[float],
    path: str,
) -> int:
    """
    Store one embedding in Qdrant.
    """

    if not embedding:
        raise ValueError(
            "Cannot store an empty embedding."
        )

    if not path.strip():
        raise ValueError(
            "Cannot store an embedding without a path."
        )

    ensure_collection(
        len(embedding)
    )

    client = get_qdrant_client()

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            PointStruct(
                id=photo_id,
                vector=embedding,
                payload={
                    "path": path,
                },
            )
        ],
        wait=True,
    )

    return 1


# ============================================================
# STORE MULTIPLE EMBEDDINGS
# ============================================================

def store_embeddings(
    embeddings: list[Any],
) -> int:
    """
    Store multiple PhotoEmbedding objects.

    Each object must provide:

        item.path
        item.embedding

    Optionally:

        item.sha256

    Returns the number of vectors stored.
    """

    if not embeddings:
        return 0

    valid_embeddings: list[Any] = []

    expected_dimension: int | None = None

    for item in embeddings:
        embedding = getattr(
            item,
            "embedding",
            None,
        )

        path = getattr(
            item,
            "path",
            None,
        )

        if not isinstance(
            embedding,
            list,
        ):
            continue

        if not embedding:
            continue

        if not isinstance(
            path,
            str,
        ):
            continue

        if not path.strip():
            continue

        dimension = len(
            embedding
        )

        if expected_dimension is None:
            expected_dimension = dimension

        if dimension != expected_dimension:
            raise ValueError(
                "All embeddings must have the same "
                "vector dimension. "
                f"Expected {expected_dimension}, "
                f"received {dimension}."
            )

        valid_embeddings.append(
            item
        )

    if not valid_embeddings:
        return 0

    if expected_dimension is None:
        return 0

    ensure_collection(
        expected_dimension
    )

    points: list[PointStruct] = []

    seen_paths: set[str] = set()

    for item in valid_embeddings:
        path = str(
            item.path
        )

        normalized_key = path_key(
            path
        )

        if normalized_key in seen_paths:
            continue

        seen_paths.add(
            normalized_key
        )

        photo_id = create_photo_id(
            path
        )

        embedding = item.embedding

        points.append(
            PointStruct(
                id=photo_id,
                vector=embedding,
                payload={
                    "path": path,
                    "sha256": str(
                        getattr(
                            item,
                            "sha256",
                            "",
                        )
                        or ""
                    ),
                },
            )
        )

    if not points:
        return 0

    client = get_qdrant_client()

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
        wait=True,
    )

    print(
        f"[QDRANT] Indexed "
        f"{len(points)} photo embeddings."
    )

    return len(points)


# ============================================================
# SEARCH
# ============================================================

def search_embeddings(
    query_embedding: list[float],
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Search Qdrant for vectors similar to the supplied
    CLIP text embedding.

    Existing behavior is preserved:
      - validate the query
      - validate dimensions
      - query Qdrant
      - preserve original photo paths
      - deduplicate paths

    The relevance stage is intentionally conservative.
    We do not use an aggressive score-gap cutoff because
    that can discard legitimate matches such as multiple
    photos of the same object.
    """

    if not query_embedding:
        return []

    if limit <= 0:
        return []

    if not collection_exists():
        print(
            f"[QDRANT SEARCH] "
            f"Collection '{COLLECTION_NAME}' "
            f"does not exist yet."
        )

        return []

    collection_size = (
        get_collection_vector_size()
    )

    if collection_size is None:
        raise RuntimeError(
            "Unable to determine Qdrant collection "
            "vector dimension."
        )

    query_dimension = len(
        query_embedding
    )

    if query_dimension != collection_size:
        raise ValueError(
            "Query embedding dimension mismatch. "
            f"Collection expects {collection_size}, "
            f"but query has {query_dimension}."
        )

    client = get_qdrant_client()

    collection_info = client.get_collection(
        collection_name=COLLECTION_NAME,
    )

    point_count = int(
        collection_info.points_count
        or 0
    )

    print(
        f"[QDRANT SEARCH] "
        f"Collection: {COLLECTION_NAME} | "
        f"Vectors: {point_count} | "
        f"Query dimensions: "
        f"{query_dimension}"
    )

    if point_count == 0:
        return []

    # Ask Qdrant for more candidates than the final UI limit.
    # This gives us enough candidates to retain legitimate
    # visually related photos.
    candidate_limit = min(
        point_count,
        max(
            limit,
            20,
        ),
    )

    # --------------------------------------------------------
    # NEWER QDRANT CLIENT
    # --------------------------------------------------------

    if hasattr(
        client,
        "query_points",
    ):
        response = client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_embedding,
            limit=candidate_limit,
            with_payload=True,
        )

        results = response.points

    # --------------------------------------------------------
    # OLDER QDRANT CLIENT
    # --------------------------------------------------------

    else:
        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_embedding,
            limit=candidate_limit,
            with_payload=True,
        )

    # --------------------------------------------------------
    # DEDUPLICATE PATHS
    # --------------------------------------------------------

    best_by_path: dict[
        str,
        dict[str, Any],
    ] = {}

    for result in results:
        payload = (
            result.payload
            or {}
        )

        path = payload.get(
            "path"
        )

        if not isinstance(
            path,
            str,
        ):
            continue

        if not path.strip():
            continue

        score = getattr(
            result,
            "score",
            0.0,
        )

        try:
            numeric_score = float(
                score
            )
        except (
            TypeError,
            ValueError,
        ):
            numeric_score = 0.0

        item = {
            "id": str(
                result.id
            ),
            "score": numeric_score,
            "path": path,
        }

        key = path_key(
            path
        )

        previous = best_by_path.get(
            key
        )

        if (
            previous is None
            or numeric_score
            > float(
                previous["score"]
            )
        ):
            best_by_path[key] = item

    matches = list(
        best_by_path.values()
    )

    matches.sort(
        key=lambda item: float(
            item["score"]
        ),
        reverse=True,
    )

    print(
        f"[QDRANT SEARCH] "
        f"Raw unique matches: "
        f"{len(matches)}"
    )

    if not matches:
        print(
            "[QDRANT SEARCH] "
            "No valid matches."
        )

        return []

    # --------------------------------------------------------
    # RELEVANCE
    # --------------------------------------------------------
    #
    # We intentionally avoid the previous "largest score gap"
    # algorithm. That algorithm could produce:
    #
    #     result 1
    #     result 2
    #     result 3
    #
    # while throwing away result 4 even though result 4 was
    # another genuine match.
    #
    # Instead:
    #
    # 1. Take the strongest candidates.
    # 2. Use a mild relative cutoff.
    # 3. Always keep at least one result.
    #
    # CLIP scores are model-dependent, so the cutoff is relative
    # to the best result rather than an absolute 0.8/0.9 value.
    # --------------------------------------------------------

    top_score = float(
        matches[0]["score"]
    )

    relative_cutoff = (
        top_score * 0.82
    )

    relevant_matches = [
        match
        for match in matches
        if float(
            match["score"]
        ) >= relative_cutoff
    ]

    # Always preserve the strongest result.
    if not relevant_matches:
        relevant_matches = [
            matches[0]
        ]

    # Limit the response to what the frontend requested.
    final_matches = (
        relevant_matches[
            :limit
        ]
    )

    print(
        f"[QDRANT SEARCH] "
        f"Returning {len(final_matches)} "
        f"relevant matches."
    )

    for match in final_matches:
        print(
            f"  Score: "
            f"{float(match['score']):.4f} | "
            f"{match['path']}"
        )

    return final_matches


# ============================================================
# VECTOR COUNT
# ============================================================

def get_vector_count() -> int:
    """
    Return the number of vectors currently stored
    in the photo collection.
    """

    if not collection_exists():
        return 0

    client = get_qdrant_client()

    try:
        info = client.get_collection(
            collection_name=COLLECTION_NAME,
        )

        return int(
            info.points_count
            or 0
        )

    except Exception as error:
        print(
            f"[QDRANT COUNT ERROR] "
            f"{type(error).__name__}: {error}"
        )

        return 0


# ============================================================
# DELETE COLLECTION
# ============================================================

def delete_collection() -> bool:
    """
    Delete the complete photo embedding collection.

    Useful when changing embedding models or when
    rebuilding the photo index.
    """

    if not collection_exists():
        return False

    client = get_qdrant_client()

    try:
        client.delete_collection(
            collection_name=COLLECTION_NAME,
        )

        print(
            f"[QDRANT] Deleted collection: "
            f"{COLLECTION_NAME}"
        )

        return True

    except Exception as error:
        print(
            f"[QDRANT DELETE ERROR] "
            f"{type(error).__name__}: {error}"
        )

        return False