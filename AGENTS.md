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
  - `musicgpt/system_metrics.py`: CPU/RAM (psutil), Apple GPU (`ioreg`), and NVIDIA GPU (pynvml) readings for `/api/system/metrics`, shown as coloured percentages in the sidebar footer.
- **Frontend**: Vanilla JS, CSS, and HTML located in `static/`. The backend serves these files directly. `static/ideas.js` holds the card decks (`window.Cards`: card types/art/prompts and `composePrompt`; `window.IdeaDeck`: full-prompt idea cards; `window.BuildTable`: Style/Drums/Bass/Rhythm/Lead piles composed into one prompt). `app.js` renders each chat as a card table: the deck docked on top (Ideas/Build tabs) and generations as “played cards” below. Which card/hand a track came from is stored client-side in `localStorage` (`pmg-card-meta`, keyed by entry id); unknown tracks render as Custom. No backend schema changes.
- **Looping**: `make_seamless_loop()` in `musicgpt/model.py` crossfades each clip's last ~1 s into its start; the server applies it when `loop` is true (default) and the CLI unless `--no-loop`.

## Important Constraints
- **Model Downloads**: Models are automatically downloaded from HuggingFace Hub on first use. This may take significant time and disk space depending on the selected model size (`small`, `medium`, `large`).
- **GPU Usage**: `--device auto` (default) uses CUDA, then Apple Silicon MPS, then CPU. Use `--device {cpu,cuda,mps}` to force one; `--gpu` is a compatibility alias for `auto`. MPS sets `PYTORCH_ENABLE_MPS_FALLBACK=1` so unsupported ops run on the CPU.
- **Remote Access**: Use `--ui-expose` to bind the server to `0.0.0.0` for remote connections.
