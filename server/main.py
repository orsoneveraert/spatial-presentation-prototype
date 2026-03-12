from __future__ import annotations

import json
import logging
import mimetypes
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    import whisperx
except ImportError:  # pragma: no cover
    whisperx = None


BACKEND = os.getenv("WHISPER_BACKEND", "whisperx").strip().lower() or "whisperx"
MODEL_NAME = os.getenv("WHISPERX_MODEL", "large-v3")
DEVICE = os.getenv("WHISPERX_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPERX_COMPUTE_TYPE", "int8")
BATCH_SIZE = int(os.getenv("WHISPERX_BATCH_SIZE", "8"))
ENABLE_ALIGNMENT = os.getenv("WHISPERX_ENABLE_ALIGNMENT", "false").lower() == "true"
TRANSCRIBE_LANGUAGE = os.getenv("WHISPERX_LANGUAGE", "fr").strip().lower() or "fr"
WHISPERCPP_BASE_URL = os.getenv("WHISPERCPP_BASE_URL", "http://127.0.0.1:8178").rstrip("/")
WHISPERCPP_MODEL_PATH = Path(
    os.getenv(
        "WHISPERCPP_MODEL",
        str(Path(__file__).resolve().parent.parent / "models" / "ggml-large-v3.bin"),
    )
)
WHISPERCPP_TIMEOUT = float(os.getenv("WHISPERCPP_TIMEOUT", "60"))
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
        result = model.transcribe(
            audio,
            batch_size=BATCH_SIZE,
            language=TRANSCRIBE_LANGUAGE,
        )

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


class WhisperCppHttpService:
    def available(self) -> bool:
        request = urllib.request.Request(f"{WHISPERCPP_BASE_URL}/", method="GET")

        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                return 200 <= response.status < 500
        except OSError:
            return False
        except urllib.error.URLError:
            return False

    def model_loaded(self) -> bool:
        return self.available()

    def transcribe_file(self, audio_path: Path) -> dict[str, Any]:
        payload = self._post_multipart(
            f"{WHISPERCPP_BASE_URL}/inference",
            fields={
                "response_format": "json",
            },
            file_field="file",
            file_path=audio_path,
        )
        transcript = str(payload.get("text", "")).strip()

        return {
            "language": TRANSCRIBE_LANGUAGE,
            "segments": ([{"text": transcript}] if transcript else []),
        }

    def _post_multipart(
        self,
        url: str,
        *,
        fields: dict[str, str],
        file_field: str,
        file_path: Path,
    ) -> dict[str, Any]:
        boundary = f"----codex-{uuid.uuid4().hex}"
        body = bytearray()

        for name, value in fields.items():
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8")
            )
            body.extend(str(value).encode("utf-8"))
            body.extend(b"\r\n")

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"

        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{file_field}"; '
                f'filename="{file_path.name}"\r\n'
            ).encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(file_path.read_bytes())
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode("utf-8"))

        request = urllib.request.Request(
            url,
            data=bytes(body),
            headers={
                "Accept": "application/json",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=WHISPERCPP_TIMEOUT) as response:
            raw_payload = response.read().decode("utf-8")

        return json.loads(raw_payload)


def build_service() -> WhisperXService | WhisperCppHttpService:
    if BACKEND in {"whispercpp", "whispercpp-http"}:
        return WhisperCppHttpService()

    return WhisperXService()


service = build_service()

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
    supported_python = sys.version_info < (3, 13) or BACKEND in {"whispercpp", "whispercpp-http"}
    model_name = WHISPERCPP_MODEL_PATH.name if BACKEND in {"whispercpp", "whispercpp-http"} else MODEL_NAME

    return {
        "ok": service.available() and supported_python,
        "model_loaded": service.model_loaded(),
        "backend": BACKEND,
        "language": TRANSCRIBE_LANGUAGE,
        "model": model_name,
        "python_version": sys.version.split()[0],
        "requires_python": "<3.13" if BACKEND == "whisperx" else "any",
        "whisperx_available": service.available(),
        "note": (
            "WhisperX requires a Python version below 3.13. "
            "Use Python 3.10 to 3.12 for the backend."
            if BACKEND == "whisperx"
            else "Using whisper.cpp over a local HTTP bridge."
        ),
    }


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    supported_python = sys.version_info < (3, 13) or BACKEND in {"whispercpp", "whispercpp-http"}

    if not supported_python:
        raise HTTPException(
            status_code=503,
            detail="WhisperX requires Python below 3.13. Start this service with Python 3.11.",
        )

    if not service.available():
        raise HTTPException(
            status_code=503,
            detail=(
                "The whisper.cpp server is not reachable."
                if BACKEND in {"whispercpp", "whispercpp-http"}
                else "WhisperX is not installed in this Python environment."
            ),
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
