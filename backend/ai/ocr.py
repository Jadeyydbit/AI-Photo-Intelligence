from __future__ import annotations

from pathlib import Path

import pytesseract
from PIL import Image


def extract_text(path: str | Path) -> str:
	"""Extract searchable text without allowing OCR failures to break import."""

	try:
		with Image.open(path) as image:
			text = pytesseract.image_to_string(image)
	except Exception:
		return ""

	return " ".join(text.split())[:10_000]
