"""Host CPU, RAM, and GPU metrics for the web UI.

Every reading degrades gracefully: when a source is unavailable the
corresponding ``percent`` is ``None`` so the UI can show "n/a" rather than a
misleading 0 %.

Sources:
- CPU / RAM: ``psutil`` (optional dependency).
- NVIDIA GPU: ``pynvml`` (optional dependency).
- Apple Silicon GPU: ``ioreg`` ``PerformanceStatistics`` (no sudo required).
"""

import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from typing import Callable, Dict, Optional

try:
    import psutil
except ImportError:  # pragma: no cover - exercised via monkeypatch in tests
    psutil = None

try:
    import pynvml
except ImportError:
    pynvml = None

logger = logging.getLogger(__name__)

MB = 1024 ** 2

_IOREG_CMD = ["ioreg", "-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"]
_IOREG_UTIL_RE = re.compile(r'"Device Utilization %"\s*=\s*(\d+)')
_IOREG_MEM_RE = re.compile(r'"In use system memory"\s*=\s*(\d+)')


def parse_ioreg_gpu(text: str) -> Optional[Dict]:
    """Extract GPU utilisation and in-use memory from ``ioreg`` output.

    Returns ``None`` when no accelerator statistics are present. If several
    accelerators are listed, the busiest one is reported.
    """
    utils = [int(v) for v in _IOREG_UTIL_RE.findall(text)]
    if not utils:
        return None
    mems = [int(v) for v in _IOREG_MEM_RE.findall(text)]
    return {
        "utilization": max(0, min(100, max(utils))),
        "memory_in_use": max(mems) if mems else None,
    }


def _run_ioreg() -> str:
    result = subprocess.run(
        _IOREG_CMD, capture_output=True, text=True, timeout=2, check=False
    )
    return result.stdout


class SystemMetrics:
    """Collect CPU, RAM, and GPU readings; safe to call from worker threads."""

    def __init__(
        self,
        ioreg_runner: Optional[Callable[[], str]] = None,
        ioreg_ttl: float = 1.0,
    ):
        self._lock = threading.Lock()
        self._ioreg_ttl = ioreg_ttl
        self._ioreg_cache: Optional[Dict] = None
        self._ioreg_time = 0.0
        self._nvml_ready: Optional[bool] = None

        if ioreg_runner is not None:
            self._ioreg_runner = ioreg_runner
        elif sys.platform == "darwin" and shutil.which("ioreg"):
            self._ioreg_runner = _run_ioreg
        else:
            self._ioreg_runner = None

        self._process = None
        if psutil is not None:
            self._process = psutil.Process(os.getpid())
            psutil.cpu_percent(interval=None)  # prime: first call always returns 0

    # ------------------------------------------------------------------
    # CPU / RAM
    # ------------------------------------------------------------------

    def cpu(self) -> Dict:
        if psutil is None:
            return {"percent": None, "cores": os.cpu_count()}
        return {
            "percent": round(psutil.cpu_percent(interval=None), 1),
            "cores": psutil.cpu_count(logical=True),
        }

    def ram(self) -> Dict:
        if psutil is None:
            return {"percent": None, "used_mb": None, "total_mb": None, "process_mb": None}
        vm = psutil.virtual_memory()
        process_mb = None
        try:
            process_mb = self._process.memory_info().rss / MB
        except Exception:
            logger.debug("Could not read process RSS", exc_info=True)
        return {
            "percent": round(vm.percent, 1),
            "used_mb": (vm.total - vm.available) / MB,
            "total_mb": vm.total / MB,
            "process_mb": process_mb,
        }

    # ------------------------------------------------------------------
    # GPU
    # ------------------------------------------------------------------

    def _apple_gpu(self) -> Optional[Dict]:
        if self._ioreg_runner is None:
            return None
        with self._lock:
            now = time.monotonic()
            if self._ioreg_cache is None or now - self._ioreg_time >= self._ioreg_ttl:
                try:
                    self._ioreg_cache = parse_ioreg_gpu(self._ioreg_runner()) or {}
                except Exception:
                    logger.debug("ioreg GPU query failed", exc_info=True)
                    self._ioreg_cache = {}
                self._ioreg_time = now
            return self._ioreg_cache or None

    def _nvidia_gpu(self) -> Optional[Dict]:
        if pynvml is None:
            return None
        try:
            if self._nvml_ready is None:
                pynvml.nvmlInit()
                self._nvml_ready = True
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            return {
                "utilization": util.gpu,
                "memory_used_mb": mem.used / MB,
                "memory_total_mb": mem.total / MB,
            }
        except Exception:
            self._nvml_ready = False
            logger.debug("NVML query failed", exc_info=True)
            return None

    def gpu(self, device: Optional[str] = None, device_memory: Optional[Dict] = None) -> Dict:
        """Return GPU readings.

        Args:
            device: Resolved inference device ('cuda', 'mps', 'cpu') or None.
            device_memory: Optional ``{"gpu_memory_used", "gpu_memory_total"}``
                in MB for the model process (e.g. from MPS).
        """
        device_memory = device_memory or {}
        reading = {
            "percent": None,
            "name": None,
            "memory_used_mb": None,
            "memory_total_mb": None,
        }

        nvidia = self._nvidia_gpu() if self._nvml_ready is not False else None
        if nvidia:
            reading.update(
                percent=nvidia["utilization"],
                name="NVIDIA GPU",
                memory_used_mb=nvidia["memory_used_mb"],
                memory_total_mb=nvidia["memory_total_mb"],
            )
            return reading

        apple = self._apple_gpu()
        if apple:
            reading["percent"] = apple["utilization"]
            reading["name"] = "Apple GPU"
            if apple.get("memory_in_use") is not None:
                reading["memory_used_mb"] = apple["memory_in_use"] / MB

        # Prefer the model process's own accelerator memory when known.
        if device_memory.get("gpu_memory_used") is not None:
            reading["memory_used_mb"] = device_memory["gpu_memory_used"]
            reading["memory_total_mb"] = device_memory.get("gpu_memory_total") or None
        if device == "mps" and reading["name"] is None:
            reading["name"] = "Apple GPU"
        return reading

    # ------------------------------------------------------------------

    def snapshot(self, device: Optional[str] = None, device_memory: Optional[Dict] = None) -> Dict:
        return {
            "cpu": self.cpu(),
            "gpu": self.gpu(device=device, device_memory=device_memory),
            "ram": self.ram(),
        }
