from __future__ import annotations

import logging
import os
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    import whisperx
except ImportError:  # pragma: no cover
    whisperx = None


MODEL_NAME = os.getenv("WHISPERX_MODEL", "base")
DEVICE = os.getenv("WHISPERX_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPERX_COMPUTE_TYPE", "int8")
BATCH_SIZE = int(os.getenv("WHISPERX_BATCH_SIZE", "8"))
ENABLE_ALIGNMENT = os.getenv("WHISPERX_ENABLE_ALIGNMENT", "false").lower() == "true"
ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("WHISPERX_ALLOW_ORIGINS", "*").split(",")
    if origin.strip()
]
ALLOW_CREDENTIALS = "*" not in ALLOW_ORIGINS
RECOVERABLE_AUDIO_ERRORS = (
    "invalid data found when processing input",
    "error opening input",
    "end of file",
    "moov atom not found",
    "could not find codec parameters",
)

logger = logging.getLogger("spatial-whisperx")


class WhisperXService:
    def __init__(self) -> None:
        self._model: Any | None = None
        self._align_cache: dict[str, tuple[Any, Any]] = {}
        self._lock = threading.Lock()

    def available(self) -> bool:
        return whisperx is not None

    def model_loaded(self) -> bool:
        return self._model is not None

    def ensure_model(self) -> Any:
        if whisperx is None:
            raise RuntimeError("WhisperX is not installed in this Python environment.")

        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = whisperx.load_model(
                        MODEL_NAME,
                        DEVICE,
                        compute_type=COMPUTE_TYPE,
                    )

        return self._model

    def transcribe_file(self, audio_path: Path) -> dict[str, Any]:
        model = self.ensure_model()
        audio = whisperx.load_audio(str(audio_path))
        result = model.transcribe(audio, batch_size=BATCH_SIZE)

        if ENABLE_ALIGNMENT and whisperx is not None:
            language = result.get("language")

            if language:
                if language not in self._align_cache:
                    align_model, metadata = whisperx.load_align_model(
                        language_code=language,
                        device=DEVICE,
                    )
                    self._align_cache[language] = (align_model, metadata)

                align_model, metadata = self._align_cache[language]
                result = whisperx.align(
                    result["segments"],
                    align_model,
                    metadata,
                    audio,
                    DEVICE,
                    return_char_alignments=False,
                )

        return result


service = WhisperXService()

app = FastAPI(title="Spatial Presentation WhisperX Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def is_recoverable_audio_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(fragment in message for fragment in RECOVERABLE_AUDIO_ERRORS)


@app.get("/api/health")
def health() -> dict[str, Any]:
    supported_python = sys.version_info < (3, 13)

    return {
        "ok": service.available() and supported_python,
        "model_loaded": service.model_loaded(),
        "python_version": sys.version.split()[0],
        "requires_python": "<3.13",
        "whisperx_available": service.available(),
        "note": (
            "WhisperX requires a Python version below 3.13. "
            "Use Python 3.10 to 3.12 for the backend."
        ),
    }


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    supported_python = sys.version_info < (3, 13)

    if not supported_python:
        raise HTTPException(
            status_code=503,
            detail="WhisperX requires Python below 3.13. Start this service with Python 3.11.",
        )

    if not service.available():
        raise HTTPException(
            status_code=503,
            detail="WhisperX is not installed in this Python environment.",
        )

    suffix = Path(file.filename or "chunk.webm").suffix or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(await file.read())
        temp_path = Path(handle.name)

    try:
        result = service.transcribe_file(temp_path)
    except Exception as exc:  # pragma: no cover
        if is_recoverable_audio_error(exc):
            logger.warning("Ignoring undecodable audio chunk: %s", exc)
            return {
                "language": None,
                "transcript": "",
            }

        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)

    transcript = " ".join(
        segment.get("text", "").strip()
        for segment in result.get("segments", [])
        if segment.get("text")
    ).strip()

    return {
        "language": result.get("language"),
        "transcript": transcript,
    }
