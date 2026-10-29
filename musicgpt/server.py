"""FastAPI web server for pyMusicGPT."""

import logging
import mimetypes
import os
import threading
from typing import Optional

try:
    from fastapi import BackgroundTasks, FastAPI, HTTPException
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel
    import uvicorn
except ImportError as _exc:
    raise ImportError(
        "FastAPI, uvicorn, and pydantic are required for the web server. "
        "Install them with: pip install fastapi uvicorn pydantic"
    ) from _exc

from .model import MusicGenerator, make_seamless_loop, save_audio
from .storage import Storage
from .system_metrics import SystemMetrics

logger = logging.getLogger(__name__)

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")


def create_app(
    generator: MusicGenerator,
    storage: Storage,
    system_metrics: Optional[SystemMetrics] = None,
) -> FastAPI:
    """Build and return the FastAPI application."""

    app = FastAPI(title="pyMusicGPT", version="0.1.0")
    system_metrics = system_metrics or SystemMetrics()

    # ------------------------------------------------------------------
    # Request / response schemas
    # ------------------------------------------------------------------

    class SessionCreate(BaseModel):
        name: Optional[str] = None

    class SessionRename(BaseModel):
        name: str

    class GenerateRequest(BaseModel):
        prompt: str
        duration_secs: int = 10
        loop: bool = True   # crossfade the end into the start for seamless looping

    # ------------------------------------------------------------------
    # Session endpoints
    # ------------------------------------------------------------------

    @app.get("/api/sessions")
    def list_sessions():
        return storage.list_sessions()

    @app.post("/api/sessions", status_code=201)
    def create_session(body: SessionCreate):
        session = storage.create_session(name=body.name)
        return session

    @app.get("/api/sessions/{session_id}")
    def get_session(session_id: str):
        session = storage.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    @app.patch("/api/sessions/{session_id}")
    def rename_session(session_id: str, body: SessionRename):
        if not storage.rename_session(session_id, body.name):
            raise HTTPException(status_code=404, detail="Session not found")
        return storage.get_session(session_id)

    @app.delete("/api/sessions/{session_id}", status_code=204)
    def delete_session(session_id: str):
        if not storage.delete_session(session_id):
            raise HTTPException(status_code=404, detail="Session not found")

    # ------------------------------------------------------------------
    # Entry endpoints
    # ------------------------------------------------------------------

    @app.get("/api/sessions/{session_id}/entries")
    def list_entries(session_id: str):
        if not storage.get_session(session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        return storage.list_entries(session_id)

    @app.get("/api/system/metrics")
    def get_metrics():
        device_memory = {}
        if generator.device == "mps":
            try:
                device_memory = generator.memory_stats()
            except Exception:
                logger.debug("Could not read MPS memory stats", exc_info=True)

        snap = system_metrics.snapshot(device=generator.device, device_memory=device_memory)
        gpu = snap["gpu"]
        return {
            "device": generator.device or generator.requested_device,
            # Flat fields kept for backward compatibility with older clients.
            "gpu_utilization": gpu["percent"],
            "gpu_memory_used": gpu["memory_used_mb"] or 0,
            "gpu_memory_total": gpu["memory_total_mb"] or 0,
            **snap,
        }

    @app.post("/api/sessions/{session_id}/generate", status_code=202)
    def generate(session_id: str, body: GenerateRequest, background_tasks: BackgroundTasks):
        if not storage.get_session(session_id):
            raise HTTPException(status_code=404, detail="Session not found")

        entry = storage.create_entry(session_id, body.prompt)

        def _run():
            try:
                audio = generator.generate(body.prompt, body.duration_secs)
                if body.loop:
                    audio = make_seamless_loop(audio)
                path = storage.new_audio_path()
                save_audio(audio, path)
                storage.update_entry(entry["id"], path, "done")
            except Exception as exc:
                logger.exception("Generation failed for entry %s: %s", entry["id"], exc)
                storage.update_entry(entry["id"], None, "error")
            finally:
                # Log completion or failure to a place the frontend can see if we had a log endpoint
                # For now, we just ensure it's logged in the server console which is visible in terminal
                logger.info("Background task finished for entry %s", entry["id"])

        background_tasks.add_task(_run)
        return entry

    @app.get("/api/entries/{entry_id}")
    def get_entry(entry_id: str):
        entry = storage.get_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        return entry

    @app.get("/api/entries/{entry_id}/audio")
    def get_audio(entry_id: str):
        entry = storage.get_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        if entry["status"] != "done" or not entry["audio_file"]:
            raise HTTPException(status_code=404, detail="Audio not ready")
        if not os.path.exists(entry["audio_file"]):
            raise HTTPException(status_code=404, detail="Audio file missing")
        return FileResponse(entry["audio_file"], media_type="audio/wav")

    # ------------------------------------------------------------------
    # Serve the static frontend
    # ------------------------------------------------------------------

    static_dir = os.path.abspath(_STATIC_DIR)
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


def run_server(
    generator: MusicGenerator,
    storage: Storage,
    host: str = "127.0.0.1",
    port: int = 8642,
    expose: bool = False,
) -> None:
    """Start the uvicorn server (blocking)."""
    if expose:
        host = "0.0.0.0"

    app = create_app(generator, storage)
    logger.info("Starting pyMusicGPT server on http://%s:%d", host, port)
    uvicorn.run(app, host=host, port=port)
