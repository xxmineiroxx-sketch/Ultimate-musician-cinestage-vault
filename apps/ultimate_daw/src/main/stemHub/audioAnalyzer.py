#!/usr/bin/env python3
"""CineStage desktop audio analyzer.

Reads a local audio file and emits JSON metadata for the Desktop Stem Hub.
The implementation is intentionally self-contained so the Electron worker can
call it as an optional capability. If librosa/numpy are not installed, the worker
keeps processing stems and records the analyzer error instead of failing jobs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np


PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def waveform_summary(audio: np.ndarray, points: int = 1200) -> dict:
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    points = max(1, int(points))
    if samples.size == 0:
        return {
            "points": points,
            "mins": [0.0] * points,
            "maxs": [0.0] * points,
            "peaks": [0.0] * points,
            "rms": [0.0] * points,
        }

    pad = (-samples.size) % points
    if pad:
        samples = np.pad(samples, (0, pad), mode="constant")

    chunks = samples.reshape(points, -1)
    mins = chunks.min(axis=1)
    maxs = chunks.max(axis=1)
    peaks = np.maximum(np.abs(mins), np.abs(maxs))
    rms = np.sqrt(np.mean(chunks * chunks, axis=1))

    peak_scale = float(peaks.max()) if peaks.size else 1.0
    if peak_scale <= 0:
        peak_scale = 1.0
    rms_scale = float(rms.max()) if rms.size else 1.0
    if rms_scale <= 0:
        rms_scale = 1.0

    return {
        "points": points,
        "mins": (mins / peak_scale).astype(np.float32).tolist(),
        "maxs": (maxs / peak_scale).astype(np.float32).tolist(),
        "peaks": (peaks / peak_scale).astype(np.float32).tolist(),
        "rms": (rms / rms_scale).astype(np.float32).tolist(),
    }


def detect_tempo(audio: np.ndarray, sr: int) -> dict:
    tempo, beats = librosa.beat.beat_track(y=audio, sr=sr)
    beat_times = librosa.frames_to_time(beats, sr=sr)
    tempo_value = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0
    return {
        "bpm": round(tempo_value, 2),
        "beat_frames": beats.astype(int).tolist(),
        "beat_times_s": beat_times.astype(float).tolist(),
    }


def detect_key(audio: np.ndarray, sr: int) -> dict:
    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    key_strength = chroma.mean(axis=1)
    key_index = int(np.argmax(key_strength))
    return {
        "key_index": key_index,
        "key": PITCH_CLASSES[key_index % 12],
        "confidence": float(key_strength[key_index] / (np.sum(key_strength) + 1e-9)),
    }


def detect_sections(audio: np.ndarray, sr: int) -> dict:
    hop_length = 512
    duration_s = float(librosa.get_duration(y=audio, sr=sr))
    if duration_s <= 0:
        return {"k": 0, "sections": []}

    k = int(np.clip(round(duration_s / 20.0), 4, 12))
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20, hop_length=hop_length)
    mfcc = librosa.util.normalize(mfcc, axis=1)
    labels = np.asarray(librosa.segment.agglomerative(mfcc, k=k), dtype=int)
    changes = np.flatnonzero(labels[1:] != labels[:-1]) + 1
    boundaries = np.concatenate(([0], changes, [len(labels)]))
    times = librosa.frames_to_time(boundaries, sr=sr, hop_length=hop_length)

    label_map: dict[int, str] = {}
    next_code = ord("A")
    sections = []
    for i, label_id in enumerate(labels[boundaries[:-1]]):
        label_id_int = int(label_id)
        if label_id_int not in label_map:
            label_map[label_id_int] = chr(next_code)
            next_code = ord("A") if next_code >= ord("Z") else next_code + 1
        sections.append(
            {
                "id": label_id_int,
                "label": label_map[label_id_int],
                "start_s": float(times[i]),
                "end_s": float(times[i + 1]),
            }
        )
    return {"k": k, "sections": sections}


def analyze(audio_path: str, points: int) -> dict:
    path = Path(audio_path).expanduser().resolve()
    audio, sr = librosa.load(str(path), sr=48000, mono=True)
    duration_s = float(librosa.get_duration(y=audio, sr=sr))
    tempo = detect_tempo(audio, sr)
    key = detect_key(audio, sr)
    return {
        "source": str(path),
        "sample_rate": int(sr),
        "duration_s": duration_s,
        "bpm": tempo["bpm"],
        "key": key["key"],
        "key_confidence": key["confidence"],
        "tempo": tempo,
        "sections": detect_sections(audio, sr),
        "waveform": waveform_summary(audio, points=points),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path")
    parser.add_argument("--points", type=int, default=1200)
    args = parser.parse_args()
    print(json.dumps(analyze(args.audio_path, args.points), separators=(",", ":")))


if __name__ == "__main__":
    main()
