#!/usr/bin/env python3
"""Word-level Hebrew transcription with ivrit-ai/whisper-large-v3-turbo (downloaded once, then offline).

usage: transcribe.py video_or_audio out_words.json [--start 0] [--end 0]
Output: [{"w": "word", "s": 1.23, "e": 1.56}, ...] in seconds of the SOURCE file.
Use it on the raw footage to pick phrase boundaries (cut.py), and on the cut to time captions (align.py).
Prints the transcript in rows of 8 words with the start second of each row.
"""
import argparse, json, subprocess
import numpy as np
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=0)
ap.add_argument("--model", default="ivrit-ai/whisper-large-v3-turbo-ct2")
A = ap.parse_args()
cmd = ["ffmpeg", "-v", "error", "-ss", str(A.start)] + (["-to", str(A.end)] if A.end else []) + ["-i", A.src, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]
audio = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.int16).astype(np.float32) / 32768
m = WhisperModel(A.model, device="cpu", compute_type="int8")
segs, _ = m.transcribe(audio, language="he", word_timestamps=True, vad_filter=False)
out = [{"w": x.word.strip(), "s": round(x.start + A.start, 2), "e": round(x.end + A.start, 2)} for s in segs for x in s.words]
json.dump(out, open(A.out, "w"), ensure_ascii=False, indent=0)
for i in range(0, len(out), 8):
    print(f"{out[i]['s']:7.2f}  " + " ".join(f"[{j}]{w['w']}" for j, w in enumerate(out[i:i + 8], i)))
