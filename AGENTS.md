# AGENTS.md

## Core Commands
- **Install as package**: `pip install -e .` (provides `musicgpt` CLI)
- **Run Web UI**: `python main.py` or `musicgpt`
- **Run Tests**: `pytest tests/` (requires `pytest` and `httpx`)

## Architecture & Workflow
- **Entry Points**: 
  - `musicgpt.cli:main`: CLI interface.
  	- `musicgpt.server:app`: FastAPI application instance.
  - `main.py`: Convenience script to launch the Web UI.
- **Key Modules**:
  - `musicgpt/model.py`: Wrapper for HuggingFace MusicGen models.
  - `musicgpt/storage.py`: SQLite persistence for chat history and audio metadata.
  - `musicgpt/server.py`: FastAPI server handling REST API and static UI serving.
- **Frontend**: Vanilla JS, CSS, and HTML located in `static/`. The backend serves these files directly.

## Important Constraints
- **Model Downloads**: Models are automatically downloaded from HuggingFace Hub on first use. This may take significant time and disk space depending on the selected model size (`small`, `medium`, `large`).
- **GPU Usage**: Use the `--gpu` flag to enable CUDA acceleration if available.
- **Remote Access**: Use `--ui-expose` to bind the server to `0.0.0.0` for remote connections.
