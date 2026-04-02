"""Tests for the storage module."""

import os
import tempfile
import time
import pytest

from musicgpt.storage import Storage


@pytest.fixture
def storage(tmp_path):
    """Return a fresh Storage instance backed by a temporary directory."""
    return Storage(data_dir=str(tmp_path))


# ---------- session tests ----------

def test_create_and_list_sessions(storage):
    assert storage.list_sessions() == []
    s1 = storage.create_session(name="First")
    time.sleep(0.01)
    s2 = storage.create_session(name="Second")
    sessions = storage.list_sessions()
    assert len(sessions) == 2
    assert sessions[0]["name"] == "Second"   # ordered by created DESC
    assert sessions[1]["name"] == "First"


def test_get_session(storage):
    s = storage.create_session(name="Test")
    fetched = storage.get_session(s["id"])
    assert fetched is not None
    assert fetched["name"] == "Test"


def test_get_session_missing(storage):
    assert storage.get_session("does-not-exist") is None


def test_rename_session(storage):
    s = storage.create_session(name="Old")
    result = storage.rename_session(s["id"], "New")
    assert result is True
    assert storage.get_session(s["id"])["name"] == "New"


def test_rename_session_missing(storage):
    assert storage.rename_session("ghost", "X") is False


def test_delete_session(storage):
    s = storage.create_session(name="ToDelete")
    assert storage.delete_session(s["id"]) is True
    assert storage.get_session(s["id"]) is None


def test_delete_session_missing(storage):
    assert storage.delete_session("ghost") is False


# ---------- entry tests ----------

def test_create_and_list_entries(storage):
    s = storage.create_session()
    e = storage.create_entry(s["id"], "lofi chill beats")
    assert e["status"] == "pending"
    assert e["audio_file"] is None

    entries = storage.list_entries(s["id"])
    assert len(entries) == 1
    assert entries[0]["prompt"] == "lofi chill beats"


def test_update_entry(storage):
    s = storage.create_session()
    e = storage.create_entry(s["id"], "jazz piano")
    assert storage.update_entry(e["id"], "/tmp/out.wav", "done") is True
    updated = storage.get_entry(e["id"])
    assert updated["status"] == "done"
    assert updated["audio_file"] == "/tmp/out.wav"


def test_get_entry_missing(storage):
    assert storage.get_entry("ghost") is None


def test_entries_ordered_by_created(storage):
    s = storage.create_session()
    e1 = storage.create_entry(s["id"], "first")
    time.sleep(0.01)
    e2 = storage.create_entry(s["id"], "second")
    entries = storage.list_entries(s["id"])
    assert entries[0]["id"] == e1["id"]
    assert entries[1]["id"] == e2["id"]


def test_new_audio_path(storage):
    path1 = storage.new_audio_path()
    path2 = storage.new_audio_path()
    assert path1 != path2
    assert path1.endswith(".wav")
    assert os.path.isdir(os.path.dirname(path1))
