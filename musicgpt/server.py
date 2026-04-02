"""FastAPI web server for pyMusicGPT."""

import logging
import mimetypes
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

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

from .model import MusicGenerator, save_audio
from .storage import Storage

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")


def create_app(
    generator: MusicGenerator,
    storage: Storage,
) -> FastAPI:
    """Build and return the FastAPI application."""

    app = FastAPI(title="pyMusicGPT", version="0.1.0")

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

    # ------------------------------------------------------------------
    # Session endpoints
    # ------------------------------------------------------------------

    @app.get("/api/sessions")
    def list_sessions():
        return storage.list_sessions()

    @app.post("/api/sessions", status_code=201)
    def create_session(body: SessionCreate):
        return storage.create_session(name=body.name)

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

    @app.post("/api/sessions/{session_id}/generate", status_code=202)
    def generate(session_id: str, body: GenerateRequest, background_tasks: BackgroundTasks):
        if not storage.get_session(session_id):
            raise HTTPException(status_code=404, detail="Session not found")

        entry = storage.create_entry(session_id, body.prompt)

        def _run():
            try:
                audio = generator.generate(body.prompt, body.duration_secs)
                path = storage.new_audio_path()
                save_audio(audio, path)
                storage.update_entry(entry["id"], path, "done")
            except Exception as exc:
                logger.exception("Generation failed for entry %s: %s", entry["id"], exc)
                storage.update_entry(entry["id"], None, "error")

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
