#!/usr/bin/env python3
"""Cut a talking-head clip from approved phrases, at the pace Hanita approved.

usage: cut.py raw.mp4 phrases.json out_dir [--crop 4x5|9x16] [--tempo 1.1] [--hold 1.0]

phrases.json: [{"start": 7.6, "end": 12.4, "text": "exact spoken words", "pin_start": false, "pin_end": false}, ...]
  start/end = first/last word times from the transcription (transcribe.py). Each edge is snapped to the
  nearest silence so no word is clipped (pin_* keeps a hand-checked time as-is).
Writes out_dir/cut.mp4 (clean audio, -14 LUFS) and out_dir/phrases.json (the caption text, in order).
Inner pauses longer than 0.2 s shrink to 0.16 s; then the whole cut runs at --tempo (pitch kept).
"""
import argparse, json, os, subprocess

ap = argparse.ArgumentParser()
ap.add_argument("raw"); ap.add_argument("phrases"); ap.add_argument("out")
ap.add_argument("--crop", default="4x5"); ap.add_argument("--tempo", type=float, default=1.10); ap.add_argument("--hold", type=float, default=1.0)
ap.add_argument("--top", type=int, default=180, help="4:5 crop top offset in px (1080x1920 source)")
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
MAX_GAP, KEEP = 0.20, 0.08

# silences of the whole raw clip (-34 dB, >=0.15 s)
r = subprocess.run(["ffmpeg", "-nostats", "-i", A.raw, "-vn", "-af", "silencedetect=n=-34dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
vals = [float(l.split(": ")[1].split()[0]) for l in r.splitlines() if "silence_start:" in l or "silence_end:" in l]
sil = list(zip(vals[0::2], vals[1::2]))

def snap_start(s):
    for a, b in sil:                       # a silence right before (or around) the first word: start at its end
        if a <= s + 0.15 and s - 0.6 <= b <= s + 0.35: return b - 0.05
    return s - 0.05
def snap_end(e):
    for a, b in sil:                       # a silence right after the last word: stop just inside it
        if e - 0.3 <= a <= e + 0.5: return a + 0.06
    return e + 0.06

P = json.load(open(A.phrases))
pieces = []
for p in P:
    a = p["start"] if p.get("pin_start") else snap_start(p["start"])
    b = p["end"] if p.get("pin_end") else snap_end(p["end"])
    p["cut"] = [round(a, 3), round(b, 3)]
    cur = a
    for s, e in sil:
        if s > a + 0.05 and e < b - 0.05 and e - s > MAX_GAP:
            pieces.append((cur, s + KEEP)); cur = e - KEEP
    pieces.append((cur, b))

crop = {"4x5": f",crop=1080:1350:0:{A.top}", "9x16": "", "none": ""}[A.crop]
fc = []
for i, (a, b) in enumerate(pieces):
    d = b - a
    fc.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS{crop}[v{i}]")
    fc.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={max(0, d - 0.012):.3f}:d=0.012[a{i}]")
fc.append("".join(f"[v{i}][a{i}]" for i in range(len(pieces))) + f"concat=n={len(pieces)}:v=1:a=1[vc][ac]")
fc.append(f"[vc]setpts=PTS/{A.tempo},tpad=stop_mode=clone:stop_duration={A.hold}[v]")
AF = ("highpass=f=85,lowpass=f=12500,afftdn=nf=-32:nr=14:tn=1,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=2.5,"
      "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2,loudnorm=I=-14:TP=-1.5:LRA=7")
fc.append(f"[ac]atempo={A.tempo},{AF},apad=pad_dur={A.hold}[a]")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", A.raw, "-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]", "-r", "30",
                "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                os.path.join(A.out, "cut.mp4")], check=True)
json.dump({"phrases": [p["text"] for p in P], "cuts": [p["cut"] for p in P], "pieces": pieces, "tempo": A.tempo, "hold": A.hold},
          open(os.path.join(A.out, "phrases.json"), "w"), ensure_ascii=False, indent=1)
raw = sum(b - a for a, b in pieces)
print(f"{len(P)} phrases, {len(pieces)} pieces, {raw:.1f}s -> {raw / A.tempo + A.hold:.1f}s")
