"""Tests for the FastAPI server."""

import numpy as np
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from musicgpt.model import MusicGenerator, SAMPLE_RATE
from musicgpt.server import create_app
from musicgpt.storage import Storage


class _FakeGenerator(MusicGenerator):
    """Generator that returns silence instantly."""

    def __init__(self):
        super().__init__(model_size="small", use_gpu=False)

    def generate(self, prompt: str, duration_secs: int = 10) -> np.ndarray:
        samples = int(SAMPLE_RATE * 0.1)   # 100 ms of silence
        return np.zeros(samples, dtype=np.float32)


@pytest.fixture
def client(tmp_path):
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)
    return TestClient(app)


# ---------- session API ----------

def test_list_sessions_empty(client):
    r = client.get("/api/sessions")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list_sessions(client):
    r = client.post("/api/sessions", json={"name": "My Chat"})
    assert r.status_code == 201
    s = r.json()
    assert s["name"] == "My Chat"

    r2 = client.get("/api/sessions")
    assert len(r2.json()) == 1


def test_rename_session(client):
    s = client.post("/api/sessions", json={"name": "Old"}).json()
    r = client.patch(f"/api/sessions/{s['id']}", json={"name": "New"})
    assert r.status_code == 200
    assert r.json()["name"] == "New"


def test_delete_session(client):
    s = client.post("/api/sessions", json={}).json()
    r = client.delete(f"/api/sessions/{s['id']}")
    assert r.status_code == 204
    assert client.get(f"/api/sessions/{s['id']}").status_code == 404


def test_get_session_not_found(client):
    r = client.get("/api/sessions/ghost")
    assert r.status_code == 404


# ---------- entries API ----------

def test_list_entries_empty(client):
    s = client.post("/api/sessions", json={}).json()
    r = client.get(f"/api/sessions/{s['id']}/entries")
    assert r.status_code == 200
    assert r.json() == []


def test_generate_returns_202(client):
    s = client.post("/api/sessions", json={}).json()
    r = client.post(
        f"/api/sessions/{s['id']}/generate",
        json={"prompt": "upbeat jazz", "duration_secs": 5},
    )
    assert r.status_code == 202
    entry = r.json()
    assert entry["prompt"] == "upbeat jazz"
    assert entry["status"] == "pending"


def test_generate_unknown_session(client):
    r = client.post(
        "/api/sessions/ghost/generate",
        json={"prompt": "test"},
    )
    assert r.status_code == 404


def test_get_entry_not_found(client):
    r = client.get("/api/entries/ghost")
    assert r.status_code == 404


def test_audio_not_ready(tmp_path):
    """An entry whose status is still 'pending' should return 404 on the audio endpoint."""
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)

    # Create a session and entry directly via storage so status stays 'pending'
    session = storage.create_session(name="s")
    entry = storage.create_entry(session["id"], "test")   # status = pending

    with TestClient(app) as c:
        r = c.get(f"/api/entries/{entry['id']}/audio")
    assert r.status_code == 404


def test_audio_available_after_generation(tmp_path):
    """After a completed entry, the audio endpoint should serve the WAV file."""
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)

    with TestClient(app) as c:
        s = c.post("/api/sessions", json={}).json()
        e = c.post(
            f"/api/sessions/{s['id']}/generate",
            json={"prompt": "test", "duration_secs": 1},
        ).json()
        # TestClient runs background tasks synchronously — entry should be done
        entry = c.get(f"/api/entries/{e['id']}").json()
        assert entry["status"] == "done"
        r = c.get(f"/api/entries/{e['id']}/audio")
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/wav"
