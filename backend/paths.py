from __future__ import annotations

import os
from pathlib import Path


def get_data_directory() -> Path:
    configured_directory = os.environ.get(
        "AI_PHOTO_DATA_DIR",
    )

    if configured_directory:
        data_directory = Path(
            configured_directory,
        )
    else:
        data_directory = (
            Path(__file__).resolve().parent
            / "data"
        )

    data_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    return data_directory
