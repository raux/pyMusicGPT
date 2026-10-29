# pyMusicGPT

> A **Python** implementation of [MusicGPT](https://github.com/raux/MusicGPT) — generate music from natural language prompts using [Meta's MusicGen](https://audiocraft.metademolab.com/musicgen.html) model, running entirely on your machine.

---

## Overview

pyMusicGPT is a full Python port of the Rust-based MusicGPT application. It offers the same core features — a conversational web UI and a CLI — powered by HuggingFace `transformers` and FastAPI.

### Features

| Feature | Description |
|---|---|
| **Chat-style Web UI** | Conversational interface for writing prompts and playing back generated audio. |
| **Idea deck** | Draw animated prompt-idea cards in six styles (Chill, Energy, Retro, Cinematic, World, Jazz & Soul). |
| **Seamless loops** | Tracks are crossfaded end-to-start and play on repeat (🔁 toggle per track). |
| **CLI mode** | Generate music straight from the terminal. |
| **Dark / Light theme** | One-click toggle between dark and light mode. |
| **Chat history** | Persistent sessions stored in SQLite — revisit, rename, or delete them. |
| **Configurable duration** | Generate audio clips from 1 to 600 seconds. |
| **Multiple model sizes** | `small`, `medium`, and `large` MusicGen variants. |
| **GPU acceleration** | Uses CUDA (NVIDIA) or Apple Silicon (MPS) automatically when available. |
| **Cross-platform** | Runs wherever Python 3.9+ and PyTorch are available. |

---

## Requirements

- Python 3.9 or newer
- [PyTorch](https://pytorch.org/get-started/locally/) (CPU, CUDA, or Apple Silicon/MPS build — the standard macOS wheel includes MPS)

---

## Install

```bash
# 1. Clone the repo
git clone https://github.com/raux/pyMusicGPT.git
cd pyMusicGPT

# 2. Install dependencies
pip install -r requirements.txt

# — or install as a package —
pip install -e .
```

---

## Usage

### Web UI mode

Launch the web interface (opens a browser window automatically):

```bash
python main.py
# or, after pip install -e .
musicgpt
```

Options:

```bash
musicgpt --model medium --port 9000
musicgpt --device mps        # force the Apple Silicon GPU
musicgpt --ui-expose         # bind to 0.0.0.0 for remote access
```

#### Idea deck

An empty chat shows a deck of idea cards. Click the deck to draw a card (it flips over), **Skip** to flick it away and draw the next, **🔀 Shuffle** / **🎲 Surprise** to mix things up, and **✓ Use this** (or double-click the card) to drop its prompt into the input box for editing. The type chips limit the deck to one style:

| Type | Example ideas | Card animation |
|---|---|---|
| 🌧 Chill | lo-fi study beat, ambient drift, rainy café | falling rain, drifting note |
| ⚡ Energy | drum & bass, festival EDM, garage punk | pulsing equalizer |
| 🌆 Retro | synthwave, chiptune, city pop | striped sun over a scrolling neon grid |
| 🎬 Cinematic | orchestral rise, boss battle, fantasy village | sweeping light rays, sparkles |
| 🌍 World | Afrobeat, flamenco, koto & taiko, dub reggae | rhythm ripples |
| 🎷 Jazz & Soul | jazz piano trio, neo-soul | rising smoke |

Once a chat has tracks, open the deck from the 🃏 button next to the prompt box. Generating with no chat selected starts a new one automatically. Animations are disabled when the OS *Reduce motion* setting is on.

#### Looping playback

Generated tracks play on repeat; use the 🔁 button beside a player to switch a track to play-once. To avoid a click at the loop point, the server blends the last ~1 s of each new clip into its start (equal-power crossfade), so a loop is about 1 s shorter than the requested duration. The CLI does the same unless you pass `--no-loop`.

### CLI mode

Generate a WAV file from the terminal:

```bash
musicgpt "Create a relaxing lo-fi beat"
```

Common options:

```bash
musicgpt "80s synth pop" --secs 30
musicgpt "jazz piano solo" --model medium --output my_track.wav
musicgpt "ambient soundscape" --device cpu
musicgpt "dub reggae" --no-loop        # keep the raw clip (no loop crossfade)
```

Run `musicgpt --help` for all options.

### Choosing a device

`--device` accepts `auto` (default), `cpu`, `cuda`, or `mps`. `auto` picks CUDA, then the Apple Silicon GPU (MPS), then CPU; an unavailable device falls back to CPU with a warning. `--gpu` is kept for compatibility and behaves like `--device auto`.

On Apple Silicon, operators not yet implemented by MPS automatically fall back to the CPU (`PYTORCH_ENABLE_MPS_FALLBACK=1`). On an Apple M5 with the `small` model, MPS generated ~5 s of audio in ~22 s versus ~100 s on CPU. The first generation after start-up is slower while Metal kernels warm up.

### System metrics

The sidebar footer shows live **CPU**, **GPU**, and **RAM** usage as percentages, refreshed every 2 s and coloured green (< 60 %), amber (60–85 %), or red (> 85 %). CPU/RAM come from [`psutil`](https://pypi.org/project/psutil/); the Apple Silicon GPU from `ioreg` *Device Utilization %* (no `sudo` needed); NVIDIA GPUs from `pynvml` (optional: `pip install nvidia-ml-py`). A reading shows **n/a** when its source is unavailable.

---

## Project structure

```
pyMusicGPT/
├── musicgpt/
│   ├── __init__.py   # package metadata
│   ├── model.py      # MusicGen model wrapper (HuggingFace transformers)
│   ├── storage.py    # SQLite chat-history / audio-entry persistence
│   ├── server.py     # FastAPI web server (REST API + static UI)
│   ├── system_metrics.py  # CPU / GPU / RAM readings for the UI
│   └── cli.py        # argparse CLI entry point
├── static/
│   ├── index.html    # Chat UI
│   ├── style.css     # Light / dark theme styles
│   ├── app.js        # Vanilla JS client
│   └── ideas.js      # Animated idea card deck
├── tests/
│   ├── test_storage.py
│   ├── test_model.py
│   └── test_server.py
├── main.py           # Convenience entry point
├── setup.py
└── requirements.txt
```

---

## Running the tests

```bash
pip install pytest httpx
pytest tests/
```

---

## Model sizes

| Size | HuggingFace ID | Notes |
|---|---|---|
| `small` (default) | `facebook/musicgen-small` | ~300 MB, fast on CPU |
| `medium` | `facebook/musicgen-medium` | ~1.5 GB, better quality |
| `large` | `facebook/musicgen-large` | ~3.3 GB, best quality |

Models are downloaded automatically from HuggingFace Hub on first use and cached locally.

---

## License

MIT