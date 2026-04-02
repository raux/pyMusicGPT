"""SQLite-backed storage for chat sessions and generated audio entries."""

import os
import sys
import sqlite3
import time
import uuid
from typing import Dict, List, Optional


def _data_dir() -> str:
    """Return the default application data directory."""
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        base = xdg
    elif os.name == "nt":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "musicgpt")


class Storage:
    """Manage chat sessions and their audio generation entries in SQLite."""

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = data_dir or _data_dir()
        os.makedirs(self.data_dir, exist_ok=True)
        self.db_path = os.path.join(self.data_dir, "musicgpt.db")
        self.audio_dir = os.path.join(self.data_dir, "audio")
        os.makedirs(self.audio_dir, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id      TEXT PRIMARY KEY,
                    name    TEXT NOT NULL,
                    created REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS entries (
                    id         TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    prompt     TEXT NOT NULL,
                    audio_file TEXT,
                    status     TEXT NOT NULL DEFAULT 'pending',
                    created    REAL NOT NULL
                );
                """
            )

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    def create_session(self, name: Optional[str] = None) -> Dict:
        sid = uuid.uuid4().hex
        ts = time.time()
        name = name or f"Chat {int(ts)}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (id, name, created) VALUES (?, ?, ?)",
                (sid, name, ts),
            )
        return {"id": sid, "name": name, "created": ts}

    def list_sessions(self) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, created FROM sessions ORDER BY created DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def get_session(self, session_id: str) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, created FROM sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
        return dict(row) if row else None

    def rename_session(self, session_id: str, name: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE sessions SET name = ? WHERE id = ?",
                (name, session_id),
            )
        return cur.rowcount > 0

    def delete_session(self, session_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Entries
    # ------------------------------------------------------------------

    def create_entry(self, session_id: str, prompt: str) -> Dict:
        eid = uuid.uuid4().hex
        ts = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO entries (id, session_id, prompt, status, created) VALUES (?, ?, ?, 'pending', ?)",
                (eid, session_id, prompt, ts),
            )
        return {"id": eid, "session_id": session_id, "prompt": prompt, "audio_file": None, "status": "pending", "created": ts}

    def update_entry(self, entry_id: str, audio_file: Optional[str], status: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE entries SET audio_file = ?, status = ? WHERE id = ?",
                (audio_file, status, entry_id),
            )
        return cur.rowcount > 0

    def list_entries(self, session_id: str) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, session_id, prompt, audio_file, status, created FROM entries WHERE session_id = ? ORDER BY created ASC",
                (session_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_entry(self, entry_id: str) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, session_id, prompt, audio_file, status, created FROM entries WHERE id = ?",
                (entry_id,),
            ).fetchone()
        return dict(row) if row else None

    def new_audio_path(self) -> str:
        """Return a unique path for a new audio file."""
        return os.path.join(self.audio_dir, f"{uuid.uuid4().hex}.wav")
