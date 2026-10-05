from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from PIL import Image

from backend.ai.objects import (
    get_clip_bundle,
    normalize,
    validate_image_path,
)

from backend.vector.qdrant_store import (
    store_embeddings,
)


# ============================================================
# SETTINGS
# ============================================================

DUPLICATE_THRESHOLD = 0.965
SIMILAR_THRESHOLD = 0.900

GPU_BATCH_SIZE = 32
CPU_BATCH_SIZE = 8


# ============================================================
# RESULT TYPES
# ============================================================

@dataclass
class PhotoEmbedding:
    path: str
    embedding: list[float]
    sha256: str


@dataclass
class SimilarityPrediction:
    path_a: str
    path_b: str
    similarity: float
    prediction: str
    confidence: float


# ============================================================
# PATH HELPERS
# ============================================================

def normalize_path_key(
    path: Path | str,
) -> str:
    """
    Create a stable path comparison key.

    The original path casing is preserved when returned to the
    frontend, but comparisons use a normalized case-insensitive key.
    """

    try:
        resolved = Path(path).expanduser().resolve()
    except Exception:
        resolved = Path(path).expanduser()

    return str(resolved).replace("\\", "/").casefold()


# ============================================================
# EXACT FILE HASH
# ============================================================

def calculate_sha256(
    path: Path,
) -> str:
    """
    Calculate the SHA-256 hash of a file.
    """

    digest = hashlib.sha256()

    with path.open("rb") as file:
        while True:
            chunk = file.read(1024 * 1024)

            if not chunk:
                break

            digest.update(chunk)

    return digest.hexdigest()


# ============================================================
# LOAD IMAGE
# ============================================================

def load_image(
    path: Path,
) -> Image.Image:
    """
    Open an image safely and convert it to RGB.
    """

    validate_image_path(path)

    try:
        with Image.open(path) as image:
            return image.convert("RGB").copy()

    except Exception as error:
        raise RuntimeError(
            f"Unable to open image '{path}': {error}"
        ) from error


# ============================================================
# EXTRACT IMAGE FEATURES
# ============================================================

def extract_image_features(
    model: Any,
    pixel_values: torch.Tensor,
) -> torch.Tensor:
    """
    Safely extract image embeddings from a CLIP-compatible model.
    """

    # --------------------------------------------------------
    # PREFERRED:
    # CLIPModel.get_image_features()
    # --------------------------------------------------------

    if hasattr(model, "get_image_features"):
        output = model.get_image_features(
            pixel_values=pixel_values,
        )

        if isinstance(output, torch.Tensor):
            return output

        if hasattr(output, "image_embeds"):
            image_embeds = output.image_embeds

            if isinstance(image_embeds, torch.Tensor):
                return image_embeds

        if hasattr(output, "pooler_output"):
            pooler_output = output.pooler_output

            if isinstance(pooler_output, torch.Tensor):
                return pooler_output

        if hasattr(output, "last_hidden_state"):
            hidden_state = output.last_hidden_state

            if isinstance(hidden_state, torch.Tensor):
                return hidden_state[:, 0, :]

        if isinstance(output, tuple) and output:
            first = output[0]

            if isinstance(first, torch.Tensor):
                if first.dim() == 3:
                    return first[:, 0, :]

                return first

    # --------------------------------------------------------
    # FALLBACK:
    # model.vision_model()
    # --------------------------------------------------------

    if not hasattr(model, "vision_model"):
        raise RuntimeError(
            "CLIP model does not provide "
            "get_image_features() or vision_model()."
        )

    vision_output = model.vision_model(
        pixel_values=pixel_values,
    )

    if isinstance(vision_output, torch.Tensor):
        vision_features = vision_output

        if vision_features.dim() == 3:
            vision_features = vision_features[:, 0, :]

    elif hasattr(vision_output, "pooler_output"):
        vision_features = vision_output.pooler_output

    elif hasattr(vision_output, "last_hidden_state"):
        hidden_state = vision_output.last_hidden_state
        vision_features = hidden_state[:, 0, :]

    elif isinstance(vision_output, tuple):
        if not vision_output:
            raise RuntimeError(
                "CLIP vision model returned an empty tuple."
            )

        vision_features = vision_output[0]

        if (
            isinstance(vision_features, torch.Tensor)
            and vision_features.dim() == 3
        ):
            vision_features = vision_features[:, 0, :]

    else:
        raise RuntimeError(
            "Unable to extract image features "
            f"from model output type: "
            f"{type(vision_output).__name__}"
        )

    if not isinstance(
        vision_features,
        torch.Tensor,
    ):
        raise RuntimeError(
            "Image features are not a torch Tensor. "
            f"Received: {type(vision_features).__name__}"
        )

    # --------------------------------------------------------
    # APPLY VISUAL PROJECTION
    # --------------------------------------------------------

    if hasattr(model, "visual_projection"):
        projected_features = model.visual_projection(
            vision_features,
        )

        if isinstance(
            projected_features,
            torch.Tensor,
        ):
            vision_features = projected_features

    return vision_features


# ============================================================
# IMAGE EMBEDDINGS
# ============================================================

def create_embeddings(
    paths: list[Path],
) -> list[PhotoEmbedding]:
    """
    Generate normalized CLIP visual embeddings
    for a list of image paths.
    """

    if not paths:
        return []

    (
        model,
        processor,
        device,
        _category_names,
        _category_features,
        _other_feature,
        _logit_scale,
    ) = get_clip_bundle()

    batch_size = (
        GPU_BATCH_SIZE
        if device.type == "cuda"
        else CPU_BATCH_SIZE
    )

    results: list[PhotoEmbedding] = []

    # --------------------------------------------------------
    # PROCESS IN BATCHES
    # --------------------------------------------------------

    for start in range(
        0,
        len(paths),
        batch_size,
    ):
        batch_paths = paths[
            start:start + batch_size
        ]

        images: list[Image.Image] = []
        valid_paths: list[Path] = []

        # ----------------------------------------------------
        # LOAD IMAGES
        # ----------------------------------------------------

        for path in batch_paths:
            try:
                image = load_image(path)

                images.append(image)
                valid_paths.append(path)

            except Exception as error:
                print(
                    f"[EMBEDDING SKIP] "
                    f"{path}: {error}"
                )

        if not images:
            continue

        # ----------------------------------------------------
        # PREPROCESS IMAGES
        # ----------------------------------------------------

        image_inputs = processor(
            images=images,
            return_tensors="pt",
        )

        if "pixel_values" not in image_inputs:
            raise RuntimeError(
                "CLIP processor did not return "
                "pixel_values."
            )

        pixel_values = image_inputs[
            "pixel_values"
        ].to(device)

        # ----------------------------------------------------
        # CREATE IMAGE FEATURES
        # ----------------------------------------------------

        with torch.inference_mode():
            image_features = extract_image_features(
                model=model,
                pixel_values=pixel_values,
            )

        if not isinstance(
            image_features,
            torch.Tensor,
        ):
            raise RuntimeError(
                "Image embedding extraction returned "
                f"{type(image_features).__name__} "
                "instead of torch.Tensor."
            )

        # ----------------------------------------------------
        # NORMALIZE
        # ----------------------------------------------------

        image_features = normalize(
            image_features,
        )

        # ----------------------------------------------------
        # SAVE RESULTS
        # ----------------------------------------------------

        for index, path in enumerate(valid_paths):
            try:
                resolved_path = path.resolve()

                embedding = (
                    image_features[index]
                    .detach()
                    .cpu()
                    .float()
                    .tolist()
                )

                sha256 = calculate_sha256(
                    resolved_path,
                )

                results.append(
                    PhotoEmbedding(
                        path=str(resolved_path),
                        embedding=embedding,
                        sha256=sha256,
                    )
                )

            except Exception as error:
                print(
                    f"[EMBEDDING SAVE SKIP] "
                    f"{path}: {error}"
                )

        print(
            f"[EMBEDDING] Processed "
            f"{len(valid_paths)} photos."
        )

    return results


# ============================================================
# CLEAN PATHS
# ============================================================

def clean_photo_paths(
    paths: list[str],
) -> list[Path]:
    """
    Validate, resolve and deduplicate image paths.
    """

    clean_paths: list[Path] = []
    seen: set[str] = set()

    for raw_path in paths:
        if not raw_path:
            continue

        cleaned = raw_path.strip()

        if not cleaned:
            continue

        try:
            resolved_path = (
                Path(cleaned)
                .expanduser()
                .resolve()
            )

        except Exception as error:
            print(
                f"[PATH SKIP] "
                f"{raw_path}: {error}"
            )
            continue

        if not resolved_path.exists():
            print(
                f"[PATH SKIP] "
                f"File does not exist: "
                f"{resolved_path}"
            )
            continue

        if not resolved_path.is_file():
            print(
                f"[PATH SKIP] "
                f"Not a file: "
                f"{resolved_path}"
            )
            continue

        key = normalize_path_key(
            resolved_path,
        )

        if key in seen:
            continue

        seen.add(key)
        clean_paths.append(resolved_path)

    return clean_paths


# ============================================================
# INDEX PHOTO EMBEDDINGS
# ============================================================

def index_photo_embeddings(
    paths: list[str],
) -> dict[str, int]:
    """
    Generate embeddings and store them in Qdrant.
    """

    clean_paths = clean_photo_paths(paths)

    if not clean_paths:
        return {
            "requested": len(paths),
            "indexed": 0,
        }

    print()
    print("=" * 46)
    print("AI Photo Indexing")
    print(f"Photos: {len(clean_paths)}")
    print("Model: CLIP visual embeddings")
    print("Database: Qdrant")
    print("=" * 46)

    embeddings = create_embeddings(
        clean_paths,
    )

    if not embeddings:
        return {
            "requested": len(paths),
            "indexed": 0,
        }

    try:
        indexed_count = store_embeddings(
            embeddings,
        )

    except Exception as error:
        print(
            f"[QDRANT INDEX ERROR] "
            f"{type(error).__name__}: {error}"
        )

        indexed_count = 0

    print()
    print(
        f"[INDEX COMPLETE] "
        f"{indexed_count} "
        f"photo embeddings stored."
    )
    print()

    return {
        "requested": len(paths),
        "indexed": indexed_count,
    }


# ============================================================
# COSINE SIMILARITY
# ============================================================

def cosine_similarity(
    first: list[float],
    second: list[float],
) -> float:
    """
    Calculate cosine similarity between two embeddings.
    """

    if (
        not first
        or not second
        or len(first) != len(second)
    ):
        return 0.0

    first_tensor = torch.tensor(
        first,
        dtype=torch.float32,
    )

    second_tensor = torch.tensor(
        second,
        dtype=torch.float32,
    )

    first_tensor = torch.nn.functional.normalize(
        first_tensor,
        p=2,
        dim=0,
    )

    second_tensor = torch.nn.functional.normalize(
        second_tensor,
        p=2,
        dim=0,
    )

    return float(
        torch.dot(
            first_tensor,
            second_tensor,
        ).item()
    )


# ============================================================
# PREDICT SIMILARITY
# ============================================================

def predict_similarity(
    first: PhotoEmbedding,
    second: PhotoEmbedding,
    similarity: float | None = None,
) -> SimilarityPrediction:
    """
    Classify the relationship between two photos.
    """

    if first.sha256 == second.sha256:
        return SimilarityPrediction(
            path_a=first.path,
            path_b=second.path,
            similarity=1.0,
            prediction="EXACT DUPLICATE",
            confidence=1.0,
        )

    if similarity is None:
        similarity = cosine_similarity(
            first.embedding,
            second.embedding,
        )

    similarity = max(
        -1.0,
        min(1.0, float(similarity)),
    )

    if similarity >= DUPLICATE_THRESHOLD:
        denominator = max(
            1e-12,
            1.0 - DUPLICATE_THRESHOLD,
        )

        confidence = (
            similarity - DUPLICATE_THRESHOLD
        ) / denominator

        confidence = max(
            0.0,
            min(1.0, confidence),
        )

        return SimilarityPrediction(
            path_a=first.path,
            path_b=second.path,
            similarity=similarity,
            prediction="DUPLICATE",
            confidence=confidence,
        )

    if similarity >= SIMILAR_THRESHOLD:
        denominator = max(
            1e-12,
            DUPLICATE_THRESHOLD
            - SIMILAR_THRESHOLD,
        )

        confidence = (
            similarity - SIMILAR_THRESHOLD
        ) / denominator

        confidence = max(
            0.0,
            min(1.0, confidence),
        )

        return SimilarityPrediction(
            path_a=first.path,
            path_b=second.path,
            similarity=similarity,
            prediction="VERY SIMILAR",
            confidence=confidence,
        )

    return SimilarityPrediction(
        path_a=first.path,
        path_b=second.path,
        similarity=similarity,
        prediction="DIFFERENT",
        confidence=0.0,
    )


# ============================================================
# FIND DUPLICATE GROUPS
# ============================================================

def find_duplicate_groups(
    paths: list[str],
) -> dict[str, Any]:
    """
    Find exact duplicates, duplicates and very similar photos.

    The response format is:

        {
            "groups": [...],
            "photos_analyzed": number
        }
    """

    clean_paths = clean_photo_paths(paths)

    if len(clean_paths) < 2:
        return {
            "groups": [],
            "photos_analyzed": len(clean_paths),
        }

    # --------------------------------------------------------
    # CREATE EMBEDDINGS
    # --------------------------------------------------------

    embeddings = create_embeddings(
        clean_paths,
    )

    if len(embeddings) < 2:
        return {
            "groups": [],
            "photos_analyzed": len(embeddings),
        }

    # --------------------------------------------------------
    # STORE IN QDRANT
    # --------------------------------------------------------

    try:
        stored_count = store_embeddings(
            embeddings,
        )

        print(
            f"[QDRANT] Stored "
            f"{stored_count} embeddings."
        )

    except Exception as error:
        print(
            f"[QDRANT INDEX ERROR] "
            f"{type(error).__name__}: {error}"
        )

    # --------------------------------------------------------
    # BUILD NORMALIZED EMBEDDING MATRIX
    # --------------------------------------------------------

    embedding_matrix = torch.tensor(
        [
            item.embedding
            for item in embeddings
        ],
        dtype=torch.float32,
    )

    embedding_matrix = torch.nn.functional.normalize(
        embedding_matrix,
        p=2,
        dim=1,
    )

    similarity_matrix = (
        embedding_matrix
        @ embedding_matrix.T
    )

    # --------------------------------------------------------
    # UNION FIND
    # --------------------------------------------------------

    parent = list(
        range(len(embeddings))
    )

    def find(value: int) -> int:
        while parent[value] != value:
            parent[value] = parent[
                parent[value]
            ]

            value = parent[value]

        return value

    def union(
        first: int,
        second: int,
    ) -> None:
        root_first = find(first)
        root_second = find(second)

        if root_first != root_second:
            parent[root_second] = root_first

    # --------------------------------------------------------
    # COMPARE PHOTOS
    # --------------------------------------------------------

    predictions: list[
        SimilarityPrediction
    ] = []

    for i in range(len(embeddings)):
        for j in range(
            i + 1,
            len(embeddings),
        ):
            similarity = float(
                similarity_matrix[i, j].item()
            )

            prediction = predict_similarity(
                embeddings[i],
                embeddings[j],
                similarity=similarity,
            )

            if prediction.prediction in {
                "EXACT DUPLICATE",
                "DUPLICATE",
                "VERY SIMILAR",
            }:
                union(i, j)

                predictions.append(
                    prediction,
                )

    # --------------------------------------------------------
    # BUILD GROUPS
    # --------------------------------------------------------

    grouped: dict[
        int,
        list[int],
    ] = {}

    for index in range(len(embeddings)):
        root = find(index)

        grouped.setdefault(
            root,
            [],
        ).append(index)

    groups: list[
        dict[str, Any]
    ] = []

    group_number = 1

    for indexes in grouped.values():
        if len(indexes) < 2:
            continue

        index_set = set(indexes)

        group_embeddings = [
            embeddings[index]
            for index in indexes
        ]

        group_paths = [
            item.path
            for item in group_embeddings
        ]

        group_predictions = [
            prediction
            for prediction in predictions
            if (
                any(
                    embeddings[index].path
                    == prediction.path_a
                    for index in index_set
                )
                and any(
                    embeddings[index].path
                    == prediction.path_b
                    for index in index_set
                )
            )
        ]

        if group_predictions:
            average_similarity = (
                sum(
                    prediction.similarity
                    for prediction in group_predictions
                )
                / len(group_predictions)
            )

        else:
            average_similarity = 1.0

        # ----------------------------------------------------
        # DETERMINE GROUP TYPE
        # ----------------------------------------------------

        if any(
            prediction.prediction
            == "EXACT DUPLICATE"
            for prediction in group_predictions
        ):
            group_type = "EXACT DUPLICATE"

        elif any(
            prediction.prediction
            == "DUPLICATE"
            for prediction in group_predictions
        ):
            group_type = "DUPLICATE"

        else:
            group_type = "VERY SIMILAR"

        groups.append(
            {
                "id": (
                    f"duplicate-group-"
                    f"{group_number}"
                ),
                "photos": group_paths,
                "similarity": round(
                    average_similarity,
                    4,
                ),
                "prediction": group_type,
                "predictions": [
                    {
                        "path_a": prediction.path_a,
                        "path_b": prediction.path_b,
                        "similarity": round(
                            prediction.similarity,
                            4,
                        ),
                        "prediction": prediction.prediction,
                        "confidence": round(
                            prediction.confidence,
                            4,
                        ),
                    }
                    for prediction in group_predictions
                ],
            }
        )

        group_number += 1

    # --------------------------------------------------------
    # SORT BEST MATCHES FIRST
    # --------------------------------------------------------

    groups.sort(
        key=lambda group: group[
            "similarity"
        ],
        reverse=True,
    )

    print(
        f"[DUPLICATES] Analyzed "
        f"{len(embeddings)} photos | "
        f"Found {len(groups)} groups."
    )

    return {
        "groups": groups,
        "photos_analyzed": len(embeddings),
    }