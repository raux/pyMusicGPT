"""Tests for host CPU / RAM / GPU metrics (no real GPU required)."""

import pytest

import musicgpt.system_metrics as sm
from musicgpt.system_metrics import SystemMetrics, parse_ioreg_gpu

# Trimmed real output of `ioreg -r -d 1 -w 0 -c IOAccelerator` on an Apple M5.
IOREG_SAMPLE = (
    '+-o AGXAcceleratorG17X  <class AGXAcceleratorG17X>\n'
    '    "PerformanceStatistics" = {"In use system memory (driver)"=0,'
    '"Alloc system memory"=42103504896,"Tiler Utilization %"=4,'
    '"Renderer Utilization %"=36,"Device Utilization %"=44,'
    '"In use system memory"=419856384}\n'
)


# ---------- ioreg parsing ----------

def test_parse_ioreg_gpu_sample():
    parsed = parse_ioreg_gpu(IOREG_SAMPLE)
    assert parsed == {"utilization": 44, "memory_in_use": 419856384}


def test_parse_ioreg_gpu_ignores_renderer_and_tiler():
    # Only "Device Utilization %" should be used, not renderer/tiler values.
    assert parse_ioreg_gpu(IOREG_SAMPLE)["utilization"] != 36


def test_parse_ioreg_gpu_multiple_accelerators_uses_busiest():
    text = '"Device Utilization %"=10 ... "Device Utilization %"=73'
    assert parse_ioreg_gpu(text)["utilization"] == 73


def test_parse_ioreg_gpu_no_stats():
    assert parse_ioreg_gpu("") is None
    assert parse_ioreg_gpu("+-o IOAccelerator <class IOAccelerator>") is None


# ---------- GPU readings ----------

def _no_nvml(monkeypatch):
    monkeypatch.setattr(sm, "pynvml", None)


def test_gpu_from_ioreg(monkeypatch):
    _no_nvml(monkeypatch)
    metrics = SystemMetrics(ioreg_runner=lambda: IOREG_SAMPLE)
    gpu = metrics.gpu(device="mps")
    assert gpu["percent"] == 44
    assert gpu["name"] == "Apple GPU"
    assert gpu["memory_used_mb"] == pytest.approx(419856384 / sm.MB)


def test_gpu_prefers_model_device_memory(monkeypatch):
    _no_nvml(monkeypatch)
    metrics = SystemMetrics(ioreg_runner=lambda: IOREG_SAMPLE)
    gpu = metrics.gpu(
        device="mps",
        device_memory={"gpu_memory_used": 7766.0, "gpu_memory_total": 25559.0},
    )
    assert gpu["percent"] == 44
    assert gpu["memory_used_mb"] == 7766.0
    assert gpu["memory_total_mb"] == 25559.0


def test_gpu_ioreg_failure_is_na(monkeypatch):
    _no_nvml(monkeypatch)

    def boom():
        raise OSError("ioreg missing")

    gpu = SystemMetrics(ioreg_runner=boom).gpu()
    assert gpu["percent"] is None


def test_gpu_ioreg_result_is_cached(monkeypatch):
    _no_nvml(monkeypatch)
    calls = []

    def runner():
        calls.append(1)
        return IOREG_SAMPLE

    metrics = SystemMetrics(ioreg_runner=runner, ioreg_ttl=60)
    metrics.gpu()
    metrics.gpu()
    assert len(calls) == 1


# ---------- CPU / RAM ----------

def test_cpu_and_ram_with_psutil():
    pytest.importorskip("psutil")
    metrics = SystemMetrics(ioreg_runner=lambda: "")
    cpu, ram = metrics.cpu(), metrics.ram()
    assert 0 <= cpu["percent"] <= 100
    assert cpu["cores"] >= 1
    assert 0 <= ram["percent"] <= 100
    assert 0 < ram["used_mb"] <= ram["total_mb"]
    assert ram["process_mb"] > 0


def test_cpu_and_ram_without_psutil(monkeypatch):
    monkeypatch.setattr(sm, "psutil", None)
    metrics = SystemMetrics(ioreg_runner=lambda: "")
    assert metrics.cpu()["percent"] is None
    assert metrics.ram()["percent"] is None


def test_snapshot_shape():
    snap = SystemMetrics(ioreg_runner=lambda: "").snapshot()
    assert set(snap) == {"cpu", "gpu", "ram"}
    for section in snap.values():
        assert "percent" in section
