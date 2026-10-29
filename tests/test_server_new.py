import numpy as np
import pytest
from fastapi.testclient import TestClient
from musicgpt.model import MusicGenerator, SAMPLE_RATE
from musicgpt.server import create_app
from musicgpt.storage import Storage

class _FakeGenerator(MusicGenerator):
    def __init__(self):
        super().__init__(model_size="small", use_gpu=False)

    def generate(self, prompt: str, duration_secs: int = 10) -> np.ndarray:
        samples = int(SAMPLE_RATE * 0.1)
        return np.zeros(samples, dtype=np.float32)

@pytest.fixture
def client(tmp_path):
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)
    return TestClient(app)

def test_metrics_endpoint(client):
    r = client.get("/api/system/metrics")
    assert r.status_code == 200
    data = r.json()
    assert "gpu_utilization" in data
    assert "gpu_memory_used" in data
    assert data["device"] == "auto"   # fake generator never resolves a device
    assert {"cpu", "gpu", "ram"} <= set(data)
    for key in ("cpu", "gpu", "ram"):
        assert "percent" in data[key]


class _FakeSystemMetrics:
    def __init__(self):
        self.calls = []

    def snapshot(self, device=None, device_memory=None):
        self.calls.append((device, device_memory))
        return {
            "cpu": {"percent": 23.0, "cores": 10},
            "gpu": {
                "percent": 87,
                "name": "Apple GPU",
                "memory_used_mb": (device_memory or {}).get("gpu_memory_used"),
                "memory_total_mb": (device_memory or {}).get("gpu_memory_total"),
            },
            "ram": {"percent": 61.0, "used_mb": 19968.0, "total_mb": 32768.0, "process_mb": 2300.0},
        }


def test_metrics_reports_mps_memory(tmp_path):
    gen = _FakeGenerator()
    gen.device = "mps"
    gen.memory_stats = lambda: {"gpu_memory_used": 2048.0, "gpu_memory_total": 24576.0}
    fake = _FakeSystemMetrics()
    app = create_app(gen, Storage(data_dir=str(tmp_path)), system_metrics=fake)
    data = TestClient(app).get("/api/system/metrics").json()
    assert fake.calls[0][0] == "mps"
    assert data["device"] == "mps"
    assert data["cpu"]["percent"] == 23.0
    assert data["ram"]["percent"] == 61.0
    assert data["gpu"]["percent"] == 87
    # flat backward-compatible fields
    assert data["gpu_utilization"] == 87
    assert data["gpu_memory_used"] == 2048.0
    assert data["gpu_memory_total"] == 24576.0

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

def test_list_entries_empty(client):
    s = client.post("/api/sessions", json={"name": "test"}).json()
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
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)
    session = storage.create_session(name="s")
    entry = storage.create_entry(session["id"], "test")
    with TestClient(app) as c:
        r = c.get(f"/api/entries/{entry['id']}/audio")
    assert r.status_code == 404

def test_audio_available_after_generation(tmp_path):
    gen = _FakeGenerator()
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(gen, storage)
    with TestClient(app) as c:
        s = c.post("/api/sessions", json={}).json()
        e = c.post(
            f"/api/sessions/{s['id']}/generate",
            json={"prompt": "test", "duration_secs": 1},
        ).json()
        entry = c.get(f"/api/entries/{e['id']}").json()
        assert entry["status"] == "done"
        r = c.get(f"/api/entries/{e['id']}/audio")
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/wav"


@pytest.mark.parametrize("loop, expected", [(True, 2400), (False, 3200)])
def test_generate_loop_option_crossfades_audio(tmp_path, loop, expected):
    """Fake clip = 3200 samples; looping crossfades n//4 = 800 samples away."""
    wavfile = pytest.importorskip("scipy.io.wavfile")
    storage = Storage(data_dir=str(tmp_path))
    app = create_app(_FakeGenerator(), storage)
    with TestClient(app) as c:
        s = c.post("/api/sessions", json={}).json()
        e = c.post(
            f"/api/sessions/{s['id']}/generate",
            json={"prompt": "loop me", "duration_secs": 1, "loop": loop},
        ).json()
    _, data = wavfile.read(storage.get_entry(e["id"])["audio_file"])
    assert len(data) == expected
