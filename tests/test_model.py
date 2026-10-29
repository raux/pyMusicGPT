"""Tests for the model module (no GPU / model download required)."""

import numpy as np
import pytest
from types import SimpleNamespace

from musicgpt.model import (
    DEFAULT_MODEL,
    DEFAULT_SECS,
    MAX_SECS,
    MODELS,
    MusicGenerator,
    resolve_device,
    save_audio,
    unique_filename,
)


def _fake_torch(cuda: bool, mps: bool):
    """Minimal stand-in for torch's accelerator availability checks."""
    return SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: cuda),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)),
    )


@pytest.mark.parametrize(
    "cuda, mps, expected",
    [
        (True, True, "cuda"),
        (False, True, "mps"),
        (False, False, "cpu"),
    ],
)
def test_resolve_device_auto_preference(cuda, mps, expected):
    assert resolve_device("auto", torch=_fake_torch(cuda, mps)) == expected


def test_resolve_device_explicit_mps():
    assert resolve_device("mps", torch=_fake_torch(False, True)) == "mps"


@pytest.mark.parametrize("requested", ["mps", "cuda"])
def test_resolve_device_unavailable_falls_back_to_cpu(requested):
    assert resolve_device(requested, torch=_fake_torch(False, False)) == "cpu"


def test_resolve_device_cpu_needs_no_torch():
    assert resolve_device("cpu", torch=None) == "cpu"


def test_resolve_device_invalid():
    with pytest.raises(ValueError, match="Unknown device"):
        resolve_device("tpu")


def test_music_generator_invalid_device():
    with pytest.raises(ValueError, match="Unknown device"):
        MusicGenerator(device="tpu")


def test_models_dict_contains_expected_sizes():
    for size in ("small", "medium", "large"):
        assert size in MODELS


def test_music_generator_invalid_model():
    with pytest.raises(ValueError, match="Unknown model size"):
        MusicGenerator(model_size="giant")


def test_music_generator_attributes():
    gen = MusicGenerator(model_size="small", use_gpu=False)
    assert gen.model_size == "small"
    assert gen.model_name == MODELS["small"]
    assert gen.use_gpu is False
    assert gen.requested_device == "auto"
    assert gen.device is None   # resolved lazily
    assert gen._model is None   # not loaded yet
    assert gen.memory_stats() == {}


def test_save_audio(tmp_path):
    scipy = pytest.importorskip("scipy")
    path = str(tmp_path / "test.wav")
    audio = np.zeros(1000, dtype=np.float32)
    save_audio(audio, path)
    import os
    assert os.path.exists(path)
    assert os.path.getsize(path) > 0


def test_save_audio_clips_out_of_range_samples(tmp_path):
    wavfile = pytest.importorskip("scipy.io.wavfile")
    path = str(tmp_path / "loud.wav")
    audio = np.array([1.107, -1.5, 0.5], dtype=np.float32)
    save_audio(audio, path)
    _, data = wavfile.read(path)
    assert data.tolist() == [32767, -32767, 16383]   # no int16 wrap-around


def test_unique_filename(tmp_path):
    d = str(tmp_path / "audio")
    p1 = unique_filename(d)
    p2 = unique_filename(d)
    assert p1 != p2
    assert p1.endswith(".wav")
    import os
    assert os.path.isdir(d)


def test_default_secs_within_bounds():
    assert 1 <= DEFAULT_SECS <= MAX_SECS
