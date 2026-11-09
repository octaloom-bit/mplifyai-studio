#!/usr/bin/env python3
"""Clean voice + optional music bed, ducked under the voice. Works fully offline.

usage: mix.py cut.mp4 out.wav [--voice voice.wav] [--music assets/music/track.mp3]

--voice  an already-isolated voice track (from any separation tool). Optional.
         Without it the voice is cleaned locally: RNNoise (models/rnnoise.rnnn, fetched by setup.sh)
         or, if that model is missing, ffmpeg's FFT denoiser.
--music  any track. Without it: the first file in assets/music/, or no music at all.
Levels (approved by ear on Dennis's videos): voice -15 LUFS, music ~-26 LUFS under it, ducking ~5 dB.
"""
import argparse, glob, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("cut"); ap.add_argument("out")
ap.add_argument("--voice"); ap.add_argument("--music"); ap.add_argument("--music-vol", type=float, default=0.66)
A = ap.parse_args()
dur = lambda f: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
D = dur(A.cut)
music = A.music or next(iter(sorted(glob.glob(os.path.join(ROOT, "assets", "music", "*.mp3")) + sorted(glob.glob(os.path.join(ROOT, "assets", "music", "*.wav"))))), None)
rnn = os.path.join(ROOT, "models", "rnnoise.rnnn")

if A.voice:
    src, clean = A.voice, ""
else:
    src = A.cut
    clean = f"arnndn=m='{rnn}':mix=0.85," if os.path.exists(rnn) else "afftdn=nf=-30:nr=18:tn=1,"
voice = (f"[0:a]apad,atrim=0:{D:.3f},{clean}highpass=f=75,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=2800:t=q:w=1.0:g=3,"
         f"equalizer=f=6500:t=q:w=1.2:g=1.5,acompressor=threshold=-22dB:ratio=3:attack=6:release=120:makeup=2,loudnorm=I=-15:TP=-2:LRA=6")
inputs = ["-i", src]
if music:
    inputs += ["-i", music]
    fc = (voice + ",asplit=2[v][vk];"
          f"[1:a]atrim=0:{D:.3f},asetpts=PTS-STARTPTS,volume={A.music_vol},afade=t=in:d=0.8,afade=t=out:st={max(0, D - 2.0):.3f}:d=2.0[m];"
          "[m][vk]sidechaincompress=threshold=0.06:ratio=3:attack=60:release=500:makeup=1[md];"
          "[v][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]")
else:
    fc = voice + ",loudnorm=I=-14:TP=-1.5:LRA=7[a]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[a]", "-ar", "48000", A.out], check=True)
print("voice:", "given track" if A.voice else ("RNNoise" if os.path.exists(rnn) else "FFT denoise"), "| music:", os.path.basename(music) if music else "none")
