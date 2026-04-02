"""Command-line interface for pyMusicGPT."""

import argparse
import logging
import os
import sys

from .model import DEFAULT_MODEL, DEFAULT_SECS, MAX_SECS, MODELS, MusicGenerator, save_audio, unique_filename
from .storage import Storage


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="musicgpt",
        description="pyMusicGPT – generate music from natural language prompts.",
    )

    parser.add_argument(
        "prompt",
        nargs="?",
        metavar="PROMPT",
        help="Natural-language music description. If omitted, the web UI is launched.",
    )
    parser.add_argument(
        "--secs",
        type=int,
        default=DEFAULT_SECS,
        metavar="N",
        help=f"Duration of the generated clip in seconds (1–{MAX_SECS}). Default: {DEFAULT_SECS}.",
    )
    parser.add_argument(
        "--model",
        choices=list(MODELS),
        default=DEFAULT_MODEL,
        help=f"Model size to use for inference. Default: {DEFAULT_MODEL}.",
    )
    parser.add_argument(
        "--gpu",
        action="store_true",
        default=False,
        help="Use CUDA GPU for inference (if available).",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Path for the output WAV file (CLI mode only). Defaults to a unique file in the data directory.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8642,
        help="Port for the web UI server. Default: 8642.",
    )
    parser.add_argument(
        "--ui-expose",
        action="store_true",
        default=False,
        help="Bind the web server to 0.0.0.0 (all interfaces) instead of localhost.",
    )
    parser.add_argument(
        "--data-dir",
        metavar="DIR",
        default=None,
        help="Directory for storing the database and generated audio files.",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        default=False,
        help="Enable verbose logging.",
    )

    return parser


def main(argv=None) -> int:
    """Entry point for the CLI."""
    parser = _build_parser()
    args = parser.parse_args(argv)
    _configure_logging(args.verbose)

    generator = MusicGenerator(model_size=args.model, use_gpu=args.gpu)
    storage = Storage(data_dir=args.data_dir)

    if args.prompt:
        # CLI mode: generate audio and save to file
        logging.getLogger(__name__).info("Generating music for: %r", args.prompt)
        audio = generator.generate(args.prompt, duration_secs=args.secs)

        output_path = args.output or unique_filename(
            os.path.join(storage.data_dir, "audio")
        )
        save_audio(audio, output_path)
        print(f"Audio saved to: {output_path}")
        return 0
    else:
        # UI mode: start the web server and open the browser
        try:
            from .server import run_server
        except ImportError as exc:
            print(
                f"Web server dependencies are not installed: {exc}\n"
                "Install them with: pip install fastapi uvicorn",
                file=sys.stderr,
            )
            return 1

        import webbrowser
        import threading

        url = f"http://127.0.0.1:{args.port}"

        def _open_browser():
            import time
            time.sleep(1.0)
            webbrowser.open(url)

        threading.Thread(target=_open_browser, daemon=True).start()
        print(f"Starting pyMusicGPT web UI at {url}")

        run_server(
            generator=generator,
            storage=storage,
            port=args.port,
            expose=args.ui_expose,
        )
        return 0
