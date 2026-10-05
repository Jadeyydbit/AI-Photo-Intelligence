from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO


# ============================================================
# MODELS
# ============================================================

CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"

# YOLO11s is used for real object detection.
#
# YOLO is responsible for:
#
#     People
#     Animals
#
# CLIP is responsible for semantic categories:
#
#     Food
#     Vehicles
#     Scenery
#     Places
#     Travel
#     Screenshots
#
YOLO_MODEL_NAME = "yolo11s.pt"


# ============================================================
# SMART ALBUM CATEGORIES
# ============================================================

SMART_ALBUM_CATEGORIES: dict[str, list[str]] = {

    # --------------------------------------------------------
    # PEOPLE / ANIMALS ARE NOT HERE.
    #
    # They are handled by YOLO object detection.
    # --------------------------------------------------------

    "Food": [
        "a photo of food",
        "a photo of a meal",
        "a photo of a restaurant dish",
        "a photo of cooking",
        "a food photograph",
    ],

    "Vehicles": [
        "a photo of a car",
        "a photo of a vehicle",
        "a photo of a motorcycle",
        "a photo of a bus or truck",
        "a photograph of transportation",
    ],

    "Scenery": [
        "a photo of nature",
        "a photo of mountains",
        "a photo of a forest",
        "a photo of a lake or river",
        "a photo of plants or flowers",
        "a photo of a beach landscape",
        "a photo of a sunset landscape",
        "a photo of an ocean landscape",
        "a landscape photograph",
        "a scenic photograph",
    ],

    "Places": [
        "a photo of a city",
        "a photo of a building",
        "a photo of architecture",
        "a photo of a street",
        "a photograph of a place",
    ],

    "Travel": [
        "a travel photograph",
        "a tourist attraction",
        "a famous landmark",
        "a vacation photograph",
        "a photograph of a tourist destination",
        "a photograph taken while travelling",
    ],

    "Screenshots": [
        "a screenshot of a computer screen",
        "a screenshot of a phone screen",
        "a screenshot of a website",
        "a screenshot of an application",
        "a screen capture",
        "a mobile phone screenshot",
        "a desktop screenshot",
    ],

    "Products": [
        "a photo of a product or item for sale",
        "a photo of clothes, fashion, shoes or accessories",
        "a photo of sports clothing, a jersey or sports equipment",
        "a photo of shopping items or a product display",
        "a product photograph for shopping",
        "a photo of a bag, watch, phone or consumer product",
    ],
}


# ============================================================
# YOLO PEOPLE / ANIMAL CLASSES
# ============================================================

PERSON_CLASS_NAME = "person"


# COCO animal classes supported by the standard YOLO model.
#
# Deliberately excludes:
#
#     teddy bear
#
# because that can be a stuffed toy.
#
ANIMAL_CLASS_NAMES = {
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
}


# ============================================================
# YOLO SETTINGS
# ============================================================

# FAST local detection settings.
#
# The previous implementation ran three YOLO passes for every
# normal photo (768px, 960px, and 960px TTA). That made a full
# library scan unnecessarily slow on CPU.
#
# Keep the same YOLO decision logic, but use one 640px inference
# pass by default. This is the main performance optimization.
YOLO_IMAGE_SIZES = (
    640,
)

YOLO_TTA_IMAGE_SIZE = 640

# TTA is deliberately disabled for the normal interactive scan.
# It can be turned back on later for a slower high-accuracy
# rebuild without changing the classification API.
YOLO_ENABLE_TTA = False


# ------------------------------------------------------------
# Candidate confidence
#
# We allow YOLO to return weaker candidate boxes.
# Final album decisions are made below.
# ------------------------------------------------------------

YOLO_INFERENCE_CONFIDENCE = 0.15


# ------------------------------------------------------------
# PEOPLE
#
# A clearly detected person at 50%+ is accepted from one pass.
#
# A moderately detected person at 35%+ can also be accepted
# if detected in at least two independent passes.
#
# This is important for:
#
#     person holding a dog
#     person hugging a dog
#     partially occluded person
#     person behind an animal
# ------------------------------------------------------------

PERSON_STRONG_THRESHOLD = 0.50

PERSON_MODERATE_THRESHOLD = 0.35

PERSON_MIN_MODERATE_PASSES = 2


# ------------------------------------------------------------
# PERSON SUBJECT SIZE
#
# YOLO can correctly detect a person without that person being
# the subject of the photograph. For example:
#
#     church + distant person      -> Places
#     monument + tiny tourist     -> Travel / Places
#     building + tiny person      -> Places
#
# A person must therefore occupy a meaningful part of the frame
# before it can create the People album.
#
# The largest individual person box is used first. We also allow
# a group of smaller people to count when their combined visible
# area is large enough.
# ------------------------------------------------------------

PERSON_MIN_AREA_RATIO = 0.06
PERSON_GROUP_MIN_AREA_RATIO = 0.10


# ------------------------------------------------------------
# ANIMALS
#
# Animals are independent from People.
# ------------------------------------------------------------

ANIMAL_DETECTION_THRESHOLD = 0.35

ANIMAL_MIN_PASSES = 1


# ------------------------------------------------------------
# YOLO BATCH SIZE
# ------------------------------------------------------------

YOLO_CPU_BATCH_SIZE = 4

YOLO_GPU_BATCH_SIZE = 16


# ============================================================
# NORMAL CLIP SETTINGS
# ============================================================

CONFIDENCE_THRESHOLD = 0.65

# People + Animals can both be assigned.
#
# Normal semantic categories remain one primary category.
MAX_ALBUMS_PER_PHOTO = 3


# ============================================================
# SCREENSHOTS
# ============================================================

SCREENSHOT_CONFIDENCE_THRESHOLD = 0.70


# ============================================================
# TRAVEL / SCENERY
# ============================================================

TRAVEL_CONFIDENCE_THRESHOLD = 0.82

TRAVEL_SCENERY_MARGIN = 0.12

TRAVEL_PLACES_MARGIN = 0.08

SCENERY_CONFIDENCE_THRESHOLD = 0.68


# ============================================================
# OTHER CLIP CATEGORIES
# ============================================================

FOOD_CONFIDENCE_THRESHOLD = 0.72

VEHICLES_CONFIDENCE_THRESHOLD = 0.72

PLACES_CONFIDENCE_THRESHOLD = 0.72

PRODUCTS_CONFIDENCE_THRESHOLD = 0.70


# ============================================================
# CLIP BATCH SIZE
# ============================================================

# A slightly larger CPU batch reduces Python/model call overhead while
# keeping memory usage conservative for typical desktop systems.
CPU_BATCH_SIZE = 8

GPU_BATCH_SIZE = 32


# ============================================================
# RESULT TYPES
# ============================================================

@dataclass
class AlbumPrediction:

    category: str

    confidence: float

    def to_dict(
        self,
    ) -> dict[str, Any]:

        return asdict(
            self
        )


@dataclass
class PhotoClassification:

    path: str

    predictions: list[
        AlbumPrediction
    ]

    albums: list[str]

    def to_dict(
        self,
    ) -> dict[str, Any]:

        return {
            "path": self.path,

            "predictions": [
                prediction.to_dict()
                for prediction in self.predictions
            ],

            "albums": self.albums,
        }


# ============================================================
# DEVICE
# ============================================================

def get_device() -> torch.device:
    """
    Use NVIDIA CUDA when available.
    Otherwise use CPU.
    """

    if torch.cuda.is_available():

        return torch.device(
            "cuda"
        )

    return torch.device(
        "cpu"
    )


# ============================================================
# NORMALIZE
# ============================================================

def normalize(
    tensor: torch.Tensor,
    dim: int = -1,
) -> torch.Tensor:

    return torch.nn.functional.normalize(
        tensor,
        p=2,
        dim=dim,
    )


# ============================================================
# CLIP MODEL
# ============================================================

@lru_cache(maxsize=1)
def get_clip_bundle():
    """
    Load CLIP once.

    CLIP handles semantic categories:

        Food
        Vehicles
        Scenery
        Places
        Travel
        Screenshots

    CLIP does NOT decide whether a person or animal exists.

    People and Animals come from YOLO.
    """

    device = get_device()

    print()
    print(
        "=============================================="
    )
    print(
        "Loading Smart Albums CLIP model..."
    )
    print(
        f"Device: {device}"
    )
    print(
        "=============================================="
    )

    processor = (
        CLIPProcessor.from_pretrained(
            CLIP_MODEL_NAME
        )
    )

    model = (
        CLIPModel.from_pretrained(
            CLIP_MODEL_NAME
        )
    )

    model = model.to(
        device
    )

    model.eval()

    # --------------------------------------------------------
    # Category names
    # --------------------------------------------------------

    category_names = list(
        SMART_ALBUM_CATEGORIES.keys()
    )

    # --------------------------------------------------------
    # Flatten prompts
    # --------------------------------------------------------

    all_prompts: list[str] = []

    category_prompt_indexes: dict[
        str,
        list[int],
    ] = {}

    for (
        category,
        prompts,
    ) in SMART_ALBUM_CATEGORIES.items():

        indexes: list[int] = []

        for prompt in prompts:

            indexes.append(
                len(all_prompts)
            )

            all_prompts.append(
                prompt
            )

        category_prompt_indexes[
            category
        ] = indexes

    # --------------------------------------------------------
    # Tokenize
    # --------------------------------------------------------

    text_inputs = processor(
        text=all_prompts,
        return_tensors="pt",
        padding=True,
        truncation=True,
    )

    input_ids = text_inputs[
        "input_ids"
    ].to(
        device
    )

    attention_mask = (
        text_inputs.get(
            "attention_mask"
        )
    )

    if attention_mask is not None:

        attention_mask = (
            attention_mask.to(
                device
            )
        )

    # --------------------------------------------------------
    # Direct CLIP text embeddings
    # --------------------------------------------------------

    with torch.inference_mode():

        text_output = (
            model.text_model(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
        )

        text_pooler = (
            text_output.pooler_output
        )

        text_features = (
            model.text_projection(
                text_pooler
            )
        )

    text_features = normalize(
        text_features
    )

    # --------------------------------------------------------
    # Category embeddings
    # --------------------------------------------------------

    category_features: list[
        torch.Tensor
    ] = []

    for category in category_names:

        indexes = (
            category_prompt_indexes[
                category
            ]
        )

        prompt_features = (
            text_features[
                indexes
            ]
        )

        category_embedding = (
            prompt_features.mean(
                dim=0
            )
        )

        category_embedding = normalize(
            category_embedding,
            dim=0,
        )

        category_features.append(
            category_embedding
        )

    category_features_tensor = (
        torch.stack(
            category_features
        )
    )

    # --------------------------------------------------------
    # Neutral feature
    # --------------------------------------------------------

    other_feature = normalize(
        text_features.mean(
            dim=0
        ),
        dim=0,
    )

    # --------------------------------------------------------
    # CLIP temperature
    # --------------------------------------------------------

    logit_scale = (
        model.logit_scale.exp()
    )

    print(
        "Smart Albums CLIP model loaded."
    )

    print(
        f"CLIP categories: "
        f"{len(category_names)}"
    )

    print(
        "Fast embedding mode enabled."
    )

    print(
        "People/Animals delegated to YOLO."
    )

    print(
        "=============================================="
    )

    print()

    return (
        model,
        processor,
        device,
        category_names,
        category_features_tensor,
        other_feature,
        logit_scale,
    )


# ============================================================
# CLIP TEXT EMBEDDING
# ============================================================

def create_text_embedding(
    query: str,
) -> list[float]:
    """
    Convert a natural-language query into the same
    normalized CLIP text-embedding space used by the
    image embeddings stored in Qdrant.
    """
    cleaned_query = query.strip()

    if not cleaned_query:
        raise ValueError(
            "Search query cannot be empty."
        )

    (
        model,
        processor,
        device,
        _category_names,
        _category_features,
        _other_feature,
        _logit_scale,
    ) = get_clip_bundle()

    text_inputs = processor(
        text=[cleaned_query],
        return_tensors="pt",
        padding=True,
        truncation=True,
    )

    input_ids = text_inputs["input_ids"].to(device)
    attention_mask = text_inputs.get("attention_mask")

    if attention_mask is not None:
        attention_mask = attention_mask.to(device)

    with torch.inference_mode():
        text_output = model.text_model(
            input_ids=input_ids,
            attention_mask=attention_mask,
        )

        text_features = model.text_projection(
            text_output.pooler_output
        )

    if not isinstance(text_features, torch.Tensor):
        raise TypeError(
            "CLIP text projection did not return "
            "a torch.Tensor."
        )

    text_features = normalize(
        text_features,
        dim=-1,
    )

    return (
        text_features[0]
        .detach()
        .cpu()
        .float()
        .tolist()
    )


# ============================================================
# YOLO MODEL
# ============================================================

@lru_cache(maxsize=1)
def get_yolo_model():
    """
    Load YOLO once.

    YOLO is the source of truth for:

        People
        Animals

    No CLIP People/Animals score is used for album assignment.
    """

    device = get_device()

    print()
    print(
        "=============================================="
    )
    print(
        "Loading Smart Albums YOLO detector..."
    )
    print(
        f"Device: {device}"
    )
    print(
        "=============================================="
    )

    try:

        detector = YOLO(
            YOLO_MODEL_NAME
        )

    except Exception as exc:

        raise RuntimeError(
            "Unable to load YOLO.\n\n"
            "Install Ultralytics with:\n"
            "pip install ultralytics"
        ) from exc

    print(
        "YOLO object detector loaded."
    )

    print(
        f"YOLO model: "
        f"{YOLO_MODEL_NAME}"
    )

    print(
        f"YOLO image sizes: "
        f"{YOLO_IMAGE_SIZES}"
    )

    print(
        f"YOLO TTA image size: "
        f"{YOLO_TTA_IMAGE_SIZE}"
    )

    print(
        f"YOLO TTA enabled: "
        f"{YOLO_ENABLE_TTA}"
    )

    print(
        f"YOLO candidate confidence: "
        f"{YOLO_INFERENCE_CONFIDENCE:.2f}"
    )

    print(
        f"Person strong threshold: "
        f"{PERSON_STRONG_THRESHOLD:.2f}"
    )

    print(
        f"Person moderate threshold: "
        f"{PERSON_MODERATE_THRESHOLD:.2f}"
    )

    print(
        f"Person repeated passes: "
        f"{PERSON_MIN_MODERATE_PASSES}"
    )

    print(
        f"Animal threshold: "
        f"{ANIMAL_DETECTION_THRESHOLD:.2f}"
    )

    print(
        f"Person minimum subject area: "
        f"{PERSON_MIN_AREA_RATIO:.1%}"
    )

    print(
        f"Person group area threshold: "
        f"{PERSON_GROUP_MIN_AREA_RATIO:.1%}"
    )

    print(
        "People detection: ENABLED"
    )

    print(
        "Animal detection: ENABLED"
    )

    print(
        "People + Animals: SUPPORTED"
    )

    print(
        "=============================================="
    )

    print()

    return detector


# ============================================================
# IMAGE VALIDATION
# ============================================================

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".gif",
}


def validate_image_path(
    path: str | Path,
) -> Path:

    image_path = Path(
        path
    )

    if not image_path.exists():

        raise FileNotFoundError(
            f"Photo does not exist: "
            f"{image_path}"
        )

    if not image_path.is_file():

        raise ValueError(
            f"Photo path is not a file: "
            f"{image_path}"
        )

    if (
        image_path.suffix.lower()
        not in SUPPORTED_EXTENSIONS
    ):

        raise ValueError(
            f"Unsupported image format: "
            f"{image_path.suffix}"
        )

    return image_path


# ============================================================
# SCREENSHOT PATH DETECTION
# ============================================================

def is_obvious_screenshot_path(
    path: str | Path,
) -> bool:

    image_path = Path(
        path
    )

    filename = (
        image_path.stem
        .lower()
        .replace(
            "-",
            "_",
        )
        .replace(
            " ",
            "_",
        )
    )

    screenshot_patterns = (
        "screenshot",
        "screen_shot",
        "screen_capture",
        "screen-capture",
        "screenclip",
        "snip",
    )

    if any(
        pattern in filename
        for pattern in screenshot_patterns
    ):

        return True

    for parent in image_path.parents:

        folder_name = (
            parent.name
            .lower()
            .replace(
                "-",
                "_",
            )
            .replace(
                " ",
                "_",
            )
        )

        if folder_name in {
            "screenshots",
            "screenshot",
            "screen_shots",
            "screen_captures",
            "screen_capture",
        }:

            return True

    return False


# ============================================================
# SCREENSHOT RESULT
# ============================================================

def create_screenshot_result(
    path: str | Path,
    confidence: float = 1.0,
) -> PhotoClassification:

    image_path = Path(
        path
    )

    return PhotoClassification(
        path=str(
            image_path
        ),

        predictions=[
            AlbumPrediction(
                category="Screenshots",
                confidence=confidence,
            )
        ],

        albums=[
            "Screenshots"
        ],
    )


# ============================================================
# OPEN IMAGE
# ============================================================

def open_image(
    path: str | Path,
) -> Image.Image:

    image_path = (
        validate_image_path(
            path
        )
    )

    try:

        with Image.open(
            image_path
        ) as image:

            return image.convert(
                "RGB"
            ).copy()

    except Exception as exc:

        raise RuntimeError(
            f"Unable to open image "
            f"'{image_path}': {exc}"
        ) from exc


# ============================================================
# YOLO CLASS NAME HELPER
# ============================================================

def get_yolo_class_name(
    result: Any,
    class_id: int,
) -> str:
    """
    Safely resolve a YOLO class name.

    Ultralytics normally provides result.names
    as a dictionary, but this also supports list-like names.
    """

    names = getattr(
        result,
        "names",
        {},
    )

    if isinstance(
        names,
        dict,
    ):

        return str(
            names.get(
                class_id,
                "",
            )
        ).lower()

    try:

        return str(
            names[class_id]
        ).lower()

    except Exception:

        return ""


# ============================================================
# YOLO PEOPLE / ANIMAL DETECTION
# ============================================================

def detect_people_animals(
    images: list[Image.Image],
) -> list[tuple[float, float, float, bool]]:
    """
    Detect real people and animals using YOLO.

    YOLO normally uses one fast inference pass. TTA can be enabled
    through YOLO_ENABLE_TTA when a slower high-accuracy rebuild is desired.

    PEOPLE
    ------
    A person is first detected using the existing confidence rules:

        1. Any pass detects a person >= 0.50

        OR:

        2. At least two passes detect a person >= 0.35

    Then a second rule is applied: the detected person must also be
    visually significant in the frame. This prevents an incidental
    tourist/person in a church, monument, building, or landscape from
    forcing the image into the People album.

    A person is considered album-worthy when either:

        largest person box >= PERSON_MIN_AREA_RATIO

    OR:

        combined person box area >= PERSON_GROUP_MIN_AREA_RATIO

    ANIMALS
    -------
    An animal is accepted when at least one pass detects a supported
    animal >= 0.35. Animal detection is independent from People.

    Returns one tuple per image:

        (person_confidence, animal_confidence,
         person_area_ratio, person_is_album_subject)

    ``person_confidence`` is set to 0 when YOLO detects a person but
    that person is only incidental. This keeps the existing downstream
    album API unchanged: a zero People score means People is not added.
    """

    if not images:

        return []

    detector = get_yolo_model()

    device = get_device()

    if device.type == "cuda":

        batch_size = (
            YOLO_GPU_BATCH_SIZE
        )

        yolo_device: int | str = 0

    else:

        batch_size = (
            YOLO_CPU_BATCH_SIZE
        )

        yolo_device = "cpu"

    total_passes = (
        len(YOLO_IMAGE_SIZES)
        + (1 if YOLO_ENABLE_TTA else 0)
    )

    # --------------------------------------------------------
    # Storage
    #
    # For every person detection we keep both confidence and
    # bounding-box area ratio. This is the important difference
    # from the previous implementation: detection confidence
    # alone no longer decides the People album.
    # --------------------------------------------------------

    detections_per_image = [

        [

            {
                "person": [],
                "animal": [],
            }

            for _ in range(
                total_passes
            )

        ]

        for _ in images
    ]

    # ========================================================
    # RESULT COLLECTOR
    # ========================================================

    def collect_results(
        results: Any,
        pass_index: int,
    ) -> None:

        if len(results) != len(images):

            raise RuntimeError(
                "YOLO returned an unexpected "
                "number of image results."
            )

        for (
            image_index,
            result,
        ) in enumerate(
            results
        ):

            boxes = result.boxes

            if boxes is None:

                continue

            classes = boxes.cls
            confidences = boxes.conf
            xyxy = boxes.xyxy

            if (
                classes is None
                or confidences is None
                or xyxy is None
            ):

                continue

            # Original image dimensions. YOLO boxes are expressed
            # in these coordinates by Ultralytics.
            try:

                original_height, original_width = (
                    result.orig_shape
                )

                image_area = (
                    float(original_width)
                    * float(original_height)
                )

            except Exception:

                image_area = 0.0

            for (
                box_index,
                (
                    class_id,
                    confidence,
                ),
            ) in enumerate(
                zip(
                    classes.tolist(),
                    confidences.tolist(),
                )
            ):

                class_name = (
                    get_yolo_class_name(
                        result,
                        int(class_id),
                    )
                )

                confidence_float = float(
                    confidence
                )

                # ------------------------------------------------
                # PERSON
                # ------------------------------------------------

                if (
                    class_name
                    == PERSON_CLASS_NAME
                ):

                    person_area_ratio = 0.0

                    if image_area > 0:

                        try:

                            x1, y1, x2, y2 = (
                                xyxy[box_index]
                                .tolist()
                            )

                            box_width = max(
                                0.0,
                                float(x2) - float(x1),
                            )

                            box_height = max(
                                0.0,
                                float(y2) - float(y1),
                            )

                            box_area = (
                                box_width
                                * box_height
                            )

                            person_area_ratio = min(
                                1.0,
                                max(
                                    0.0,
                                    box_area
                                    / image_area,
                                ),
                            )

                        except Exception:

                            person_area_ratio = 0.0

                    detections_per_image[
                        image_index
                    ][
                        pass_index
                    ][
                        "person"
                    ].append(
                        (
                            confidence_float,
                            person_area_ratio,
                        )
                    )

                # ------------------------------------------------
                # ANIMAL
                # ------------------------------------------------

                elif (
                    class_name
                    in ANIMAL_CLASS_NAMES
                ):

                    detections_per_image[
                        image_index
                    ][
                        pass_index
                    ][
                        "animal"
                    ].append(
                        confidence_float
                    )

    # ========================================================
    # PASS 1 + PASS 2
    # ========================================================

    for (
        pass_index,
        image_size,
    ) in enumerate(
        YOLO_IMAGE_SIZES
    ):

        print(
            f"[YOLO] pass "
            f"{pass_index + 1}/"
            f"{total_passes}: "
            f"imgsz={image_size}"
        )

        try:

            results = detector.predict(
                source=images,

                conf=YOLO_INFERENCE_CONFIDENCE,

                imgsz=image_size,

                batch=batch_size,

                device=yolo_device,

                # FP16 is useful on CUDA and ignored on CPU.
                half=(device.type == "cuda"),

                augment=False,

                verbose=False,

                agnostic_nms=False,

                max_det=100,
            )

        except Exception as exc:

            raise RuntimeError(
                f"YOLO detection failed at "
                f"imgsz={image_size}: {exc}"
            ) from exc

        collect_results(
            results,
            pass_index,
        )

    # ========================================================
    # OPTIONAL TTA PASS
    # ========================================================

    if YOLO_ENABLE_TTA:
        tta_pass_index = (
            len(YOLO_IMAGE_SIZES)
        )

        print(
            f"[YOLO] pass "
            f"{tta_pass_index + 1}/"
            f"{total_passes}: "
            f"imgsz={YOLO_TTA_IMAGE_SIZE} "
            f"TTA=True"
        )

        try:

            tta_results = detector.predict(
                source=images,

                conf=YOLO_INFERENCE_CONFIDENCE,

                imgsz=YOLO_TTA_IMAGE_SIZE,

                batch=batch_size,

                device=yolo_device,

                # FP16 is useful on CUDA and ignored on CPU.
                half=(device.type == "cuda"),

                augment=True,

                verbose=False,

                agnostic_nms=False,

                max_det=100,
            )

        except Exception as exc:

            raise RuntimeError(
                f"YOLO TTA verification failed: "
                f"{exc}"
            ) from exc

        collect_results(
            tta_results,
            tta_pass_index,
        )

    # ========================================================
    # FINAL DECISION
    # ========================================================

    final_detections: list[
        tuple[float, float, float, bool]
    ] = []

    for (
        image_index,
        image_passes,
    ) in enumerate(
        detections_per_image
    ):

        # ====================================================
        # PERSON EVIDENCE
        # ====================================================

        person_pass_confidences: list[
            float
        ] = []

        person_pass_max_areas: list[
            float
        ] = []

        person_pass_total_areas: list[
            float
        ] = []

        for pass_data in image_passes:

            person_values = [

                item

                for item in pass_data[
                    "person"
                ]

                if (
                    item[0]
                    >= PERSON_MODERATE_THRESHOLD
                )

            ]

            if person_values:

                person_pass_confidences.append(
                    max(
                        item[0]
                        for item in person_values
                    )
                )

                person_pass_max_areas.append(
                    max(
                        item[1]
                        for item in person_values
                    )
                )

                # Multiple small people can collectively be the
                # subject of a group photo. Cap at 100% so bad
                # duplicate boxes cannot produce an invalid ratio.
                person_pass_total_areas.append(
                    min(
                        1.0,
                        sum(
                            item[1]
                            for item in person_values
                        ),
                    )
                )

        # ====================================================
        # ANIMAL EVIDENCE
        # ====================================================

        animal_pass_confidences: list[
            float
        ] = []

        for pass_data in image_passes:

            animal_values = [

                value

                for value in pass_data[
                    "animal"
                ]

                if (
                    value
                    >= ANIMAL_DETECTION_THRESHOLD
                )

            ]

            if animal_values:

                animal_pass_confidences.append(
                    max(
                        animal_values
                    )
                )

        # ====================================================
        # PERSON DETECTION DECISION
        # ====================================================

        strong_persons = [

            value

            for value
            in person_pass_confidences

            if (
                value
                >= PERSON_STRONG_THRESHOLD
            )
        ]

        repeated_moderate_person = (
            len(
                person_pass_confidences
            )
            >= PERSON_MIN_MODERATE_PASSES
        )

        if strong_persons:

            detected_person_confidence = max(
                strong_persons
            )

            person_detection_reason = (
                "strong detection"
            )

        elif repeated_moderate_person:

            detected_person_confidence = max(
                person_pass_confidences
            )

            person_detection_reason = (
                "repeated detection"
            )

        else:

            detected_person_confidence = 0.0

            person_detection_reason = (
                "rejected"
            )

        # ====================================================
        # PERSON SUBJECT-SIZE DECISION
        # ====================================================

        person_area_ratio = max(
            person_pass_max_areas,
            default=0.0,
        )

        combined_person_area_ratio = max(
            person_pass_total_areas,
            default=0.0,
        )

        person_is_album_subject = (
            detected_person_confidence > 0.0
            and (
                person_area_ratio
                >= PERSON_MIN_AREA_RATIO
                or
                combined_person_area_ratio
                >= PERSON_GROUP_MIN_AREA_RATIO
            )
        )

        if detected_person_confidence <= 0.0:

            person_confidence = 0.0

            person_reason = "rejected"

        elif person_is_album_subject:

            person_confidence = (
                detected_person_confidence
            )

            if (
                combined_person_area_ratio
                >= PERSON_GROUP_MIN_AREA_RATIO
                and person_area_ratio
                < PERSON_MIN_AREA_RATIO
            ):

                person_reason = (
                    f"{person_detection_reason}; "
                    f"group area "
                    f"{combined_person_area_ratio:.1%}"
                )

            else:

                person_reason = (
                    f"{person_detection_reason}; "
                    f"subject area "
                    f"{person_area_ratio:.1%}"
                )

        else:

            # YOLO really saw a person, but the person is too small
            # to make this a People photo. Returning zero here is
            # intentional: build_classification() treats zero as
            # "do not add People" and continues to CLIP Places,
            # Travel, Scenery, Food, or Vehicles.
            person_confidence = 0.0

            person_reason = (
                f"incidental person; "
                f"largest area "
                f"{person_area_ratio:.1%} "
                f"< {PERSON_MIN_AREA_RATIO:.1%}"
            )

        # ====================================================
        # ANIMAL DECISION
        # ====================================================

        if (
            len(
                animal_pass_confidences
            )
            >= ANIMAL_MIN_PASSES
        ):

            animal_confidence = max(
                animal_pass_confidences
            )

            animal_reason = (
                "detected"
            )

        else:

            animal_confidence = 0.0

            animal_reason = (
                "not detected"
            )

        # ====================================================
        # DEBUG
        # ====================================================

        person_debug = (
            ", ".join(
                f"{value:.0%}"
                for value
                in person_pass_confidences
            )
            or "none"
        )

        animal_debug = (
            ", ".join(
                f"{value:.0%}"
                for value
                in animal_pass_confidences
            )
            or "none"
        )

        print(
            f"[YOLO] image "
            f"{image_index + 1}: "
            f"person=[{person_debug}] "
            f"animal=[{animal_debug}]"
        )

        print(
            f"[YOLO] accepted image "
            f"{image_index + 1}: "
            f"person={person_confidence:.0%} "
            f"({person_reason}) "
            f"animal={animal_confidence:.0%} "
            f"({animal_reason})"
        )

        print(
            f"[YOLO] person area image "
            f"{image_index + 1}: "
            f"largest={person_area_ratio:.1%} "
            f"combined={combined_person_area_ratio:.1%}"
        )

        final_detections.append(
            (
                person_confidence,
                animal_confidence,
                person_area_ratio,
                person_is_album_subject,
            )
        )

    # ========================================================
    # SAFETY CHECK
    # ========================================================

    if (
        len(final_detections)
        != len(images)
    ):

        raise RuntimeError(
            "YOLO returned an unexpected "
            "number of final detections."
        )

    return final_detections


# ============================================================
# SCORE NORMAL CLIP CATEGORIES
# ============================================================

def score_clip_images(
    images: list[Image.Image],
) -> list[list[AlbumPrediction]]:

    if not images:

        return []

    (
        model,
        processor,
        device,
        category_names,
        category_features,
        other_feature,
        logit_scale,
    ) = get_clip_bundle()

    # --------------------------------------------------------
    # Process images.
    # --------------------------------------------------------

    image_inputs = processor(
        images=images,
        return_tensors="pt",
    )

    pixel_values = image_inputs[
        "pixel_values"
    ].to(
        device
    )

    # --------------------------------------------------------
    # Direct vision embeddings.
    # --------------------------------------------------------

    with torch.inference_mode():

        vision_output = (
            model.vision_model(
                pixel_values=pixel_values
            )
        )

        vision_pooler = (
            vision_output.pooler_output
        )

        image_features = (
            model.visual_projection(
                vision_pooler
            )
        )

    image_features = normalize(
        image_features
    )

    # --------------------------------------------------------
    # Category logits.
    # --------------------------------------------------------

    category_logits = (
        image_features
        @ category_features.T
    )

    # --------------------------------------------------------
    # Neutral comparison.
    # --------------------------------------------------------

    other_logits = (
        image_features
        @ other_feature.unsqueeze(
            1
        )
    ).squeeze(
        1
    )

    category_logits = (
        category_logits
        * logit_scale
    )

    other_logits = (
        other_logits
        * logit_scale
    )

    # --------------------------------------------------------
    # Build predictions.
    # --------------------------------------------------------

    all_predictions: list[
        list[AlbumPrediction]
    ] = []

    for image_index in range(
        len(images)
    ):

        predictions: list[
            AlbumPrediction
        ] = []

        for (
            category_index,
            category,
        ) in enumerate(
            category_names
        ):

            category_logit = (
                category_logits[
                    image_index,
                    category_index,
                ]
            )

            other_logit = (
                other_logits[
                    image_index
                ]
            )

            pair = torch.stack(
                [
                    category_logit,
                    other_logit,
                ]
            )

            probability = (
                torch.softmax(
                    pair,
                    dim=0,
                )[0]
            )

            confidence = float(
                probability.item()
            )

            predictions.append(
                AlbumPrediction(
                    category=category,
                    confidence=confidence,
                )
            )

        predictions.sort(
            key=lambda item:
                item.confidence,
            reverse=True,
        )

        all_predictions.append(
            predictions
        )

    return all_predictions


# ============================================================
# SCORE COMPLETE IMAGE BATCH
# ============================================================

def score_images(
    images: list[Image.Image],
) -> list[list[AlbumPrediction]]:

    if not images:

        return []

    # ========================================================
    # CLIP
    #
    # Food
    # Vehicles
    # Scenery
    # Places
    # Travel
    # Screenshots
    # ========================================================

    clip_predictions = (
        score_clip_images(
            images
        )
    )

    # ========================================================
    # YOLO
    #
    # People
    # Animals
    # ========================================================

    try:
        presence_results = detect_people_animals(images)
    except Exception as exc:
        print()
        print(
            "========== YOLO WARNING =========="
        )
        print(
            f"YOLO detection failed: "
            f"{type(exc).__name__}: {exc}"
        )
        print(
            "Continuing with CLIP-only album classification."
        )
        print(
            "=================================="
        )
        print()

        presence_results = [
            (0.0, 0.0, 0.0, False)
            for _ in images
        ]

    all_predictions: list[
        list[AlbumPrediction]
    ] = []

    for (
        predictions,
        (
            person_confidence,
            animal_confidence,
            _person_area_ratio,
            _person_is_album_subject,
        ),
    ) in zip(
        clip_predictions,
        presence_results,
    ):

        # ----------------------------------------------------
        # These values are YOLO detection confidence.
        #
        # They are NOT CLIP scores.
        # ----------------------------------------------------

        predictions.append(
            AlbumPrediction(
                category="People",
                confidence=person_confidence,
            )
        )

        predictions.append(
            AlbumPrediction(
                category="Animals",
                confidence=animal_confidence,
            )
        )

        predictions.sort(
            key=lambda item:
                item.confidence,
            reverse=True,
        )

        all_predictions.append(
            predictions
        )

    return all_predictions


# ============================================================
# BUILD CLASSIFICATION
# ============================================================

def build_classification(
    path: str | Path,
    predictions: list[AlbumPrediction],
) -> PhotoClassification:

    """
    Convert model predictions into final Smart Album
    assignments.

    People and Animals are ONLY controlled by YOLO.

    Examples:

        person only
            -> People

        animal only
            -> Animals

        person + animal
            -> People + Animals

        neither
            -> CLIP category

    A CLIP score can NEVER create People or Animals.
    """

    image_path = Path(
        path
    )

    score_by_category = {
        prediction.category:
            prediction.confidence
        for prediction in predictions
    }

    # ========================================================
    # PEOPLE
    #
    # IMPORTANT:
    #
    # YOLO has already made the two-stage decision:
    #
    #   1. Is there a real person?
    #   2. Is that person large enough to be a meaningful subject?
    #
    # A score of 0 means either no person was detected OR the
    # detected person was only incidental (for example a tiny
    # tourist in front of a church). In that case we deliberately
    # continue to CLIP so Places / Travel / Scenery can win.
    # ========================================================

    people_score = (
        score_by_category.get(
            "People",
            0.0,
        )
    )

    has_people = (
        people_score > 0.0
    )

    # ========================================================
    # ANIMALS
    #
    # Completely independent from People.
    # ========================================================

    animals_score = (
        score_by_category.get(
            "Animals",
            0.0,
        )
    )

    has_animals = (
        animals_score > 0.0
    )

    # ========================================================
    # PEOPLE + ANIMALS
    # ========================================================

    object_albums: list[str] = []

    if has_people:

        object_albums.append(
            "People"
        )

    if has_animals:

        object_albums.append(
            "Animals"
        )

    # ========================================================
    # OBJECT ALBUMS HAVE PRIORITY
    #
    # Only meaningful YOLO subjects reach this point. An incidental
    # person has a People score of 0 and therefore does NOT block
    # the semantic category underneath the person.
    #
    # Meaningful person + dog:
    #
    #     People + Animals
    # ========================================================

    if object_albums:

        return PhotoClassification(
            path=str(
                image_path
            ),

            predictions=predictions,

            albums=object_albums,
        )

    # ========================================================
    # NO PEOPLE / ANIMALS
    #
    # Continue with CLIP categories.
    # ========================================================

    # ========================================================
    # TRAVEL / SCENERY
    # ========================================================

    travel_score = (
        score_by_category.get(
            "Travel",
            0.0,
        )
    )

    scenery_score = (
        score_by_category.get(
            "Scenery",
            0.0,
        )
    )

    places_score = (
        score_by_category.get(
            "Places",
            0.0,
        )
    )

    travel_is_reliable = (

        travel_score
        >= TRAVEL_CONFIDENCE_THRESHOLD

        and travel_score
        >= (
            scenery_score
            + TRAVEL_SCENERY_MARGIN
        )

        and travel_score
        >= (
            places_score
            + TRAVEL_PLACES_MARGIN
        )
    )

    eligible: dict[
        str,
        float,
    ] = {}

    # --------------------------------------------------------
    # Travel
    # --------------------------------------------------------

    if travel_is_reliable:

        eligible["Travel"] = (
            travel_score
        )

    # --------------------------------------------------------
    # Scenery
    # --------------------------------------------------------

    if (
        scenery_score
        >= SCENERY_CONFIDENCE_THRESHOLD
    ):

        eligible["Scenery"] = (
            scenery_score
        )

    # ========================================================
    # FOOD
    # ========================================================

    food_score = (
        score_by_category.get(
            "Food",
            0.0,
        )
    )

    if (
        food_score
        >= FOOD_CONFIDENCE_THRESHOLD
    ):

        eligible["Food"] = (
            food_score
        )

    # ========================================================
    # VEHICLES
    # ========================================================

    vehicles_score = (
        score_by_category.get(
            "Vehicles",
            0.0,
        )
    )

    if (
        vehicles_score
        >= VEHICLES_CONFIDENCE_THRESHOLD
    ):

        eligible["Vehicles"] = (
            vehicles_score
        )

    # ========================================================
    # PLACES
    # ========================================================

    if (
        places_score
        >= PLACES_CONFIDENCE_THRESHOLD
    ):

        eligible["Places"] = (
            places_score
        )

    # ========================================================
    # PRODUCTS
    # ========================================================

    products_score = (
        score_by_category.get(
            "Products",
            0.0,
        )
    )

    if (
        products_score
        >= PRODUCTS_CONFIDENCE_THRESHOLD
    ):

        eligible["Products"] = (
            products_score
        )

    # ========================================================
    # TRAVEL VS SCENERY
    # ========================================================

    if (
        "Travel" in eligible
        and "Scenery" in eligible
    ):

        eligible.pop(
            "Scenery",
            None,
        )

    # ========================================================
    # CHOOSE STRONGEST RELIABLE CATEGORY
    # ========================================================

    albums: list[str] = []

    if eligible:

        best_category = max(
            eligible,
            key=eligible.get,
        )

        albums = [
            best_category
        ][
            :MAX_ALBUMS_PER_PHOTO
        ]

    # ========================================================
    # RESULT
    # ========================================================

    return PhotoClassification(
        path=str(
            image_path
        ),

        predictions=predictions,

        albums=albums,
    )


# ============================================================
# SINGLE PHOTO
# ============================================================

def classify_photo(
    path: str | Path,
) -> PhotoClassification:

    image_path = (
        validate_image_path(
            path
        )
    )

    # --------------------------------------------------------
    # Screenshot shortcut.
    # --------------------------------------------------------

    if is_obvious_screenshot_path(
        image_path
    ):

        return create_screenshot_result(
            image_path
        )

    # --------------------------------------------------------
    # Open image.
    # --------------------------------------------------------

    image = open_image(
        image_path
    )

    # --------------------------------------------------------
    # CLIP + YOLO.
    # --------------------------------------------------------

    predictions = (
        score_images(
            [image]
        )[0]
    )

    # --------------------------------------------------------
    # Final classification.
    # --------------------------------------------------------

    return build_classification(
        image_path,
        predictions,
    )


# ============================================================
# BATCH CLASSIFICATION
# ============================================================

def classify_photos(
    paths: list[str | Path],
) -> list[PhotoClassification]:

    if not paths:

        return []

    results: list[
        PhotoClassification
    ] = []

    normal_paths: list[
        Path
    ] = []

    # ========================================================
    # STEP 1
    #
    # Fast screenshot detection.
    # ========================================================

    for raw_path in paths:

        try:

            image_path = (
                validate_image_path(
                    raw_path
                )
            )

            if is_obvious_screenshot_path(
                image_path
            ):

                results.append(
                    create_screenshot_result(
                        image_path
                    )
                )

                print(
                    f"[SCREENSHOT] "
                    f"{image_path.name}"
                )

            else:

                normal_paths.append(
                    image_path
                )

        except Exception as exc:

            print(
                f"[SKIP] "
                f"{raw_path}: "
                f"{exc}"
            )

    # ========================================================
    # NOTHING LEFT FOR AI
    # ========================================================

    if not normal_paths:

        print()

        print(
            f"Finished processing "
            f"{len(results)} photo(s)."
        )

        return results

    # ========================================================
    # STEP 2
    #
    # Select CLIP batch size.
    # ========================================================

    device = get_device()

    if device.type == "cuda":

        batch_size = (
            GPU_BATCH_SIZE
        )

    else:

        batch_size = (
            CPU_BATCH_SIZE
        )

    print()

    print(
        f"Processing "
        f"{len(normal_paths)} "
        f"normal photos..."
    )

    print(
        f"CLIP batch size: "
        f"{batch_size}"
    )

    print(
        f"Device: "
        f"{device}"
    )

    print()

    # ========================================================
    # STEP 3
    #
    # Batch processing.
    # ========================================================

    for start in range(
        0,
        len(normal_paths),
        batch_size,
    ):

        batch_paths = normal_paths[
            start:
            start + batch_size
        ]

        images: list[
            Image.Image
        ] = []

        valid_paths: list[
            Path
        ] = []

        # ====================================================
        # LOAD IMAGES
        # ====================================================

        for image_path in batch_paths:

            try:

                image = open_image(
                    image_path
                )

                images.append(
                    image
                )

                valid_paths.append(
                    image_path
                )

            except Exception as exc:

                print(
                    f"[SKIP] "
                    f"{image_path}: "
                    f"{exc}"
                )

        if not images:

            continue

        # ====================================================
        # RUN CLIP + YOLO
        # ====================================================

        try:

            batch_predictions = (
                score_images(
                    images
                )
            )

        except Exception as exc:

            print()
            print(
                "========== AI BATCH ERROR =========="
            )
            print(
                f"Batch start: {start}"
            )
            print(
                f"Batch size: {len(batch_paths)}"
            )
            print(
                f"Error type: {type(exc).__name__}"
            )
            print(
                f"Error message: {exc}"
            )
            print(
                "Skipping this batch and continuing."
            )
            print(
                "===================================="
            )
            print()

            continue

        # ====================================================
        # BUILD RESULTS
        # ====================================================

        for (
            image_path,
            predictions,
        ) in zip(
            valid_paths,
            batch_predictions,
        ):

            result = (
                build_classification(
                    image_path,
                    predictions,
                )
            )

            results.append(
                result
            )

            album_text = (
                ", ".join(
                    result.albums
                )
                if result.albums
                else "No confident category"
            )

            # ------------------------------------------------
            # YOLO scores for debugging.
            # ------------------------------------------------

            people_score = next(
                (
                    prediction.confidence

                    for prediction
                    in predictions

                    if (
                        prediction.category
                        == "People"
                    )
                ),
                0.0,
            )

            animal_score = next(
                (
                    prediction.confidence

                    for prediction
                    in predictions

                    if (
                        prediction.category
                        == "Animals"
                    )
                ),
                0.0,
            )

            print(
                f"[AI] "
                f"{image_path.name}: "
                f"{album_text}"
                f" | person="
                f"{people_score:.0%}"
                f" animal="
                f"{animal_score:.0%}"
            )

    # ========================================================
    # FINISHED
    # ========================================================

    print()

    print(
        f"Finished processing "
        f"{len(results)} photo(s)."
    )

    return results


# ============================================================
# COMMAND LINE TEST
# ============================================================

if __name__ == "__main__":

    import sys

    if len(sys.argv) < 2:

        print(
            "Usage:"
        )

        print(
            "  python -m backend.ai.objects "
            "<photo-path>"
        )

        print()

        print(
            "Multiple photos:"
        )

        print(
            "  python -m backend.ai.objects "
            "<photo1> <photo2> ..."
        )

        raise SystemExit(
            1
        )

    photo_paths = sys.argv[
        1:
    ]

    results = classify_photos(
        photo_paths
    )

    print()

    print(
        "Smart Album classification"
    )

    print(
        "---------------------------"
    )

    for result in results:

        print()

        print(
            result.path
        )

        for prediction in (
            result.predictions
        ):

            print(
                f"  "
                f"{prediction.category:12} "
                f"{prediction.confidence:.2%}"
            )

        print()

        print(
            "  Albums:",
            ", ".join(
                result.albums
            )
            if result.albums
            else "None",
        )

    print()

    print(
        f"Processed "
        f"{len(results)} photo(s)."
    )