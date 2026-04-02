"""Tests for the model module (no GPU / model download required)."""

import numpy as np
import pytest

from musicgpt.model import (
    DEFAULT_MODEL,
    DEFAULT_SECS,
    MAX_SECS,
    MODELS,
    MusicGenerator,
    save_audio,
    unique_filename,
)


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
    assert gen._model is None   # not loaded yet


def test_save_audio(tmp_path):
    scipy = pytest.importorskip("scipy")
    path = str(tmp_path / "test.wav")
    audio = np.zeros(1000, dtype=np.float32)
    save_audio(audio, path)
    import os
    assert os.path.exists(path)
    assert os.path.getsize(path) > 0


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
