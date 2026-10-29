"""MusicGen model wrapper for generating audio from text prompts."""

import os
import time
import uuid
import logging
import numpy as np

# Let PyTorch run any operator that Apple's Metal (MPS) backend does not
# implement on the CPU instead of raising. Must be set before torch is imported.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

logger = logging.getLogger(__name__)

MODELS = {
    "small": "facebook/musicgen-small",
    "medium": "facebook/musicgen-medium",
    "large": "facebook/musicgen-large",
}

DEFAULT_MODEL = "small"
DEFAULT_SECS = 600
MAX_SECS = 600
SAMPLE_RATE = 32000
LOOP_CROSSFADE_SECS = 1.0

DEVICES = ("auto", "cpu", "cuda", "mps")
DEFAULT_DEVICE = "auto"

DEVICE_LABELS = {
    "cpu": "CPU",
    "cuda": "NVIDIA GPU (CUDA)",
    "mps": "Apple GPU (MPS)",
}


def _mps_available(torch) -> bool:
    backend = getattr(torch.backends, "mps", None)
    return bool(backend is not None and backend.is_available())


def resolve_device(requested: str = DEFAULT_DEVICE, torch=None) -> str:
    """Map a requested device to one that is actually available.

    ``auto`` prefers CUDA, then Apple MPS, then CPU. An explicitly requested
    accelerator that is unavailable falls back to CPU with a warning.
    """
    if requested not in DEVICES:
        raise ValueError(
            f"Unknown device '{requested}'. Choose from: {', '.join(DEVICES)}"
        )
    if requested == "cpu":
        return "cpu"

    if torch is None:
        import torch  # noqa: F811  (lazy import keeps startup light)

    cuda_ok = torch.cuda.is_available()
    mps_ok = _mps_available(torch)

    if requested == "auto":
        if cuda_ok:
            return "cuda"
        if mps_ok:
            return "mps"
        return "cpu"

    if requested == "cuda" and cuda_ok:
        return "cuda"
    if requested == "mps" and mps_ok:
        return "mps"

    logger.warning("Device '%s' is not available, falling back to CPU.", requested)
    return "cpu"


class MusicGenerator:
    """Wraps HuggingFace MusicGen to generate audio from text prompts."""

    def __init__(
        self,
        model_size: str = DEFAULT_MODEL,
        use_gpu: bool = False,
        device: str = DEFAULT_DEVICE,
    ):
        """Initialise the generator, loading the model lazily on first use.

        Args:
            model_size: One of 'small', 'medium', or 'large'.
            use_gpu: Deprecated. Kept for compatibility; ``device='auto'``
                already prefers an available GPU (CUDA or Apple MPS).
            device: One of 'auto', 'cpu', 'cuda', or 'mps'.
        """
        if model_size not in MODELS:
            raise ValueError(
                f"Unknown model size '{model_size}'. Choose from: {', '.join(MODELS)}"
            )
        if device not in DEVICES:
            raise ValueError(
                f"Unknown device '{device}'. Choose from: {', '.join(DEVICES)}"
            )
        self.model_size = model_size
        self.model_name = MODELS[model_size]
        self.use_gpu = use_gpu
        self.requested_device = device
        self.device = None  # resolved lazily so construction never imports torch
        self._processor = None
        self._model = None

    def resolve_device(self) -> str:
        """Resolve (once) and return the device that inference will use."""
        if self.device is None:
            self.device = resolve_device(self.requested_device)
            logger.info("Using device: %s", DEVICE_LABELS[self.device])
        return self.device

    def memory_stats(self) -> dict:
        """Return accelerator memory use in MB (Apple MPS only; empty otherwise)."""
        if self.device != "mps":
            return {}
        import torch

        mps = torch.mps
        used = mps.driver_allocated_memory() / (1024 ** 2)
        total_fn = getattr(mps, "recommended_max_memory", None)
        total = total_fn() / (1024 ** 2) if total_fn else 0
        return {"gpu_memory_used": used, "gpu_memory_total": total}

    def _load(self) -> None:
        """Load the model and processor (called lazily)."""
        try:
            import torch  # noqa: F401
            from transformers import AutoProcessor, MusicgenForConditionalGeneration
        except ImportError as exc:
            raise ImportError(
                "The 'transformers' and 'torch' packages are required for music generation. "
                "Install them with: pip install transformers torch"
            ) from exc

        device = self.resolve_device()
        logger.info("Loading model %s …", self.model_name)
        self._processor = AutoProcessor.from_pretrained(self.model_name)
        # float32 on every device: float16 on MPS was measured as no faster.
        model = MusicgenForConditionalGeneration.from_pretrained(self.model_name)
        self._model = model.to(device).eval()
        logger.info("Model loaded on %s.", DEVICE_LABELS[device])

    def generate(self, prompt: str, duration_secs: int = DEFAULT_SECS) -> np.ndarray:
        """Generate audio samples for *prompt*.

        Args:
            prompt: Natural-language music description.
            duration_secs: Length of the generated clip in seconds (1–600).

        Returns:
            1-D NumPy array of float32 audio samples at SAMPLE_RATE Hz.
        """
        duration_secs = max(1, min(duration_secs, MAX_SECS))

        if self._model is None:
            self._load()

        try:
            import torch
        except ImportError as exc:
            raise ImportError("torch is required") from exc

        inputs = self._processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        )

        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        max_new_tokens = int(duration_secs * 50)  # ~50 tokens/second for MusicGen

        logger.info("Generating %.0f s of audio for prompt: %r", duration_secs, prompt)
        start = time.time()

        with torch.no_grad():
            audio_values = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
            )
        if self.device == "mps":
            torch.mps.synchronize()  # make the timing below reflect real work

        elapsed = time.time() - start
        logger.info("Generation took %.1f s", elapsed)

        audio = audio_values[0, 0].float().cpu().numpy()
        return audio


def make_seamless_loop(
    audio: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    crossfade_secs: float = LOOP_CROSSFADE_SECS,
) -> np.ndarray:
    """Return a copy of *audio* that loops without a click or jump.

    The last ``crossfade_secs`` are blended (equal-power) into the start, so
    the final sample flows directly into the first one on repeat. The result is
    ``fade`` samples shorter than the input, where ``fade`` is the crossfade
    length capped at a quarter of the clip. Very short clips are returned
    unchanged.
    """
    audio = np.asarray(audio, dtype=np.float32)
    n = len(audio)
    fade = int(min(crossfade_secs * sample_rate, n // 4))
    if fade < 2:
        return audio.copy()

    t = np.arange(fade, dtype=np.float32) / fade        # 0 → 1 (exclusive)
    fade_in = np.sin(t * np.pi / 2)
    fade_out = np.cos(t * np.pi / 2)

    head = audio[:fade]
    tail = audio[n - fade:]
    blended = tail * fade_out + head * fade_in          # starts as tail, ends as head
    return np.concatenate([blended, audio[fade:n - fade]]).astype(np.float32)


def save_audio(audio: np.ndarray, output_path: str) -> None:
    """Save *audio* as a WAV file at *output_path*.

    Args:
        audio: Float32 array of audio samples.
        output_path: Destination file path (should end with '.wav').
    """
    try:
        import scipy.io.wavfile as wavfile
    except ImportError as exc:
        raise ImportError(
            "scipy is required to save audio. Install it with: pip install scipy"
        ) from exc

    # MusicGen can exceed full scale; clip so int16 conversion cannot wrap around.
    audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    wavfile.write(output_path, SAMPLE_RATE, audio_int16)
    logger.info("Audio saved to %s", output_path)


def unique_filename(directory: str) -> str:
    """Return a unique WAV filename inside *directory*."""
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f"{uuid.uuid4().hex}.wav")
