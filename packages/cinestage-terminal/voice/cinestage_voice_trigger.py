#!/usr/bin/env python3
"""
Optional local microphone trigger for CineStage Terminal.

This is a small, safe double-clap prototype. It listens locally, detects two
short transients, and runs a configured CineStage Terminal command. The default
command is read-only status; use the main JS CLI for guarded build/debug actions.
"""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
    import numpy as np
    import sounddevice as sd
except ImportError as exc:
    print(
        "Missing voice trigger dependencies. Run:\n"
        "  python3 -m pip install -r packages/cinestage-terminal/voice/requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc


REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")

SAMPLE_RATE = int(os.environ.get("CINESTAGE_VOICE_SAMPLE_RATE", "44100"))
BLOCK_MS = int(os.environ.get("CINESTAGE_VOICE_BLOCK_MS", "40"))
SPIKE_RATIO = float(os.environ.get("CINESTAGE_VOICE_SPIKE_RATIO", "7.0"))
MIN_RMS = float(os.environ.get("CINESTAGE_VOICE_MIN_RMS", "0.012"))
MIN_DOUBLE_GAP_S = float(os.environ.get("CINESTAGE_VOICE_MIN_DOUBLE_GAP_S", "0.05"))
MAX_DOUBLE_GAP_S = float(os.environ.get("CINESTAGE_VOICE_MAX_DOUBLE_GAP_S", "0.35"))
COOLDOWN_S = float(os.environ.get("CINESTAGE_VOICE_COOLDOWN_S", "1.25"))
RETRIGGER_RATIO = float(os.environ.get("CINESTAGE_VOICE_RETRIGGER_RATIO", "0.55"))
NOISE_FLOOR_ALPHA = float(os.environ.get("CINESTAGE_VOICE_NOISE_FLOOR_ALPHA", "0.992"))
QUIET_GATE_MULT = float(os.environ.get("CINESTAGE_VOICE_QUIET_GATE_MULT", "2.2"))
COMMAND = os.environ.get("CINESTAGE_VOICE_COMMAND", "npm run cinestage -- status").strip()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cinestage_voice_trigger")


def block_samples() -> int:
    return max(1, int(SAMPLE_RATE * BLOCK_MS / 1000))


def rms_mono(block: np.ndarray) -> float:
    samples = block.astype(np.float64)
    if samples.ndim > 1:
        samples = np.mean(samples, axis=1)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples**2)))


def run_command() -> None:
    if not COMMAND:
        log.info("CINESTAGE_VOICE_COMMAND is empty; trigger acknowledged only.")
        return
    args = shlex.split(COMMAND)
    if not args:
        return
    log.info("Running CineStage voice command: %s", COMMAND)
    try:
        subprocess.run(args, cwd=REPO_ROOT, check=False)
    except OSError as exc:
        log.error("Could not run voice command: %s", exc)


def main() -> int:
    blocksize = block_samples()
    noise_floor = 1e-4
    first_clap_time = None
    last_trigger_time = 0.0
    spike_armed = True

    log.info(
        "Listening for double clap: %.2f-%.2fs, rate=%d, block=%dms. Ctrl+C stops.",
        MIN_DOUBLE_GAP_S,
        MAX_DOUBLE_GAP_S,
        SAMPLE_RATE,
        BLOCK_MS,
    )
    log.info("Default action: %s", COMMAND or "(none)")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=blocksize,
        ) as stream:
            while True:
                data, overflowed = stream.read(blocksize)
                if overflowed:
                    log.warning("Input overflow; increase CINESTAGE_VOICE_BLOCK_MS")

                level = rms_mono(data)
                if level < noise_floor * QUIET_GATE_MULT:
                    noise_floor = max(
                        1e-7,
                        NOISE_FLOOR_ALPHA * noise_floor + (1 - NOISE_FLOOR_ALPHA) * level,
                    )

                threshold = max(noise_floor * SPIKE_RATIO, MIN_RMS)
                now = time.monotonic()

                if level < threshold * RETRIGGER_RATIO:
                    spike_armed = True

                if not spike_armed or level < threshold or now - last_trigger_time < COOLDOWN_S:
                    continue

                spike_armed = False
                if first_clap_time is None:
                    first_clap_time = now
                    continue

                gap = now - first_clap_time
                if MIN_DOUBLE_GAP_S <= gap <= MAX_DOUBLE_GAP_S:
                    first_clap_time = None
                    last_trigger_time = now
                    log.info("Double clap detected, gap=%.3fs, rms=%.5f", gap, level)
                    run_command()
                elif gap > MAX_DOUBLE_GAP_S:
                    first_clap_time = now

    except KeyboardInterrupt:
        log.info("Stopped.")
        return 0
    except sd.PortAudioError as exc:
        log.error("Audio error: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
