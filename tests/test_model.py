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


# ---------- seamless looping ----------

from musicgpt.model import SAMPLE_RATE, make_seamless_loop  # noqa: E402


def _tone(secs=3.0, freq=441.3):
    """A tone whose period does not divide the clip, so a raw loop would jump."""
    t = np.arange(int(SAMPLE_RATE * secs)) / SAMPLE_RATE
    return (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def test_seamless_loop_length_and_dtype():
    audio = _tone(3.0)
    looped = make_seamless_loop(audio, crossfade_secs=0.5)
    assert looped.dtype == np.float32
    assert len(looped) == len(audio) - int(0.5 * SAMPLE_RATE)


def test_seamless_loop_removes_seam_jump():
    audio = _tone(3.0)
    typical_step = np.max(np.abs(np.diff(audio)))
    raw_jump = abs(audio[0] - audio[-1])
    assert raw_jump > 2 * typical_step          # the unprocessed loop clicks

    looped = make_seamless_loop(audio, crossfade_secs=0.5)
    seam_jump = abs(looped[0] - looped[-1])
    assert seam_jump <= typical_step * 1.01      # no bigger than a normal sample step


def test_seamless_loop_joins_original_material():
    audio = _tone(3.0)
    fade = int(0.5 * SAMPLE_RATE)
    looped = make_seamless_loop(audio, crossfade_secs=0.5)
    n = len(audio)
    assert looped[0] == pytest.approx(audio[n - fade])        # starts as the tail
    assert looped[-1] == pytest.approx(audio[n - fade - 1])   # ends right before it
    np.testing.assert_allclose(looped[fade:], audio[fade:n - fade])


def test_seamless_loop_caps_crossfade_for_short_clips():
    audio = _tone(0.4)                                       # 12 800 samples
    looped = make_seamless_loop(audio, crossfade_secs=1.0)   # cap = n // 4
    assert len(looped) == len(audio) - len(audio) // 4


def test_seamless_loop_tiny_clip_unchanged():
    audio = np.array([0.1, -0.2, 0.3], dtype=np.float32)
    looped = make_seamless_loop(audio)
    np.testing.assert_array_equal(looped, audio)
    assert looped is not audio


def test_seamless_loop_does_not_modify_input():
    audio = _tone(1.0)
    before = audio.copy()
    make_seamless_loop(audio)
    np.testing.assert_array_equal(audio, before)
