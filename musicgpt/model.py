"""MusicGen model wrapper for generating audio from text prompts."""

import os
import time
import uuid
import logging
import numpy as np

logger = logging.getLogger(__name__)

MODELS = {
    "small": "facebook/musicgen-small",
    "medium": "facebook/musicgen-medium",
    "large": "facebook/musicgen-large",
}

DEFAULT_MODEL = "small"
DEFAULT_SECS = 10
MAX_SECS = 600
SAMPLE_RATE = 32000


class MusicGenerator:
    """Wraps HuggingFace MusicGen to generate audio from text prompts."""

    def __init__(self, model_size: str = DEFAULT_MODEL, use_gpu: bool = False):
        """Initialise the generator, loading the model lazily on first use.

        Args:
            model_size: One of 'small', 'medium', or 'large'.
            use_gpu: Whether to use a CUDA GPU for inference.
        """
        if model_size not in MODELS:
            raise ValueError(
                f"Unknown model size '{model_size}'. Choose from: {', '.join(MODELS)}"
            )
        self.model_size = model_size
        self.model_name = MODELS[model_size]
        self.use_gpu = use_gpu
        self._processor = None
        self._model = None

    def _load(self) -> None:
        """Load the model and processor (called lazily)."""
        try:
            import torch
            from transformers import AutoProcessor, MusicgenForConditionalGeneration
        except ImportError as exc:
            raise ImportError(
                "The 'transformers' and 'torch' packages are required for music generation. "
                "Install them with: pip install transformers torch"
            ) from exc

        logger.info("Loading model %s …", self.model_name)
        self._processor = AutoProcessor.from_pretrained(self.model_name)
        self._model = MusicgenForConditionalGeneration.from_pretrained(self.model_name)

        if self.use_gpu and torch.cuda.is_available():
            self._model = self._model.to("cuda")
            logger.info("Model loaded on CUDA.")
        else:
            if self.use_gpu:
                logger.warning("CUDA not available, falling back to CPU.")
            logger.info("Model loaded on CPU.")

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

        if self.use_gpu and torch.cuda.is_available():
            inputs = {k: v.to("cuda") for k, v in inputs.items()}

        max_new_tokens = int(duration_secs * 50)  # ~50 tokens/second for MusicGen

        logger.info("Generating %.0f s of audio for prompt: %r", duration_secs, prompt)
        start = time.time()

        with torch.no_grad():
            audio_values = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
            )

        elapsed = time.time() - start
        logger.info("Generation took %.1f s", elapsed)

        audio = audio_values[0, 0].cpu().numpy()
        return audio


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

    audio_int16 = (audio * 32767).astype(np.int16)
    wavfile.write(output_path, SAMPLE_RATE, audio_int16)
    logger.info("Audio saved to %s", output_path)


def unique_filename(directory: str) -> str:
    """Return a unique WAV filename inside *directory*."""
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f"{uuid.uuid4().hex}.wav")
