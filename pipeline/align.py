# Transcribe a video with the Hebrew ivrit-ai model and align the approved caption text to it.
# usage: python align.py video.mp4 phrases.json out_words.json  -> prints a word-level diff (the QA report)
import sys, json, subprocess, difflib, re, numpy as np
from faster_whisper import WhisperModel
vid, phr, out = sys.argv[1:4]
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
m = WhisperModel("ivrit-ai/whisper-large-v3-turbo-ct2", device="cpu", compute_type="int8")
segs, _ = m.transcribe(audio, language="he", word_timestamps=True, vad_filter=False)
heard = [dict(w=x.word.strip(), s=x.start, e=x.end) for s in segs for x in s.words]

norm = lambda w: re.sub(r"[^\w]", "", w.replace("׳", "").replace("'", "")).replace("mplifyai", "")
script = [w for p in json.load(open(phr))["phrases"] for w in p.split()]
# ivrit hears mplifyAI as "אמפליפי איי" and 10-15 as "10 -15": fold both sides to comparable tokens
H = [norm(h["w"]) for h in heard]; S = [norm(w) for w in script]
sm = difflib.SequenceMatcher(a=S, b=H, autojunk=False)
times = [None] * len(script); diffs = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal":
        for k in range(i2 - i1): times[i1 + k] = (heard[j1 + k]["s"], heard[j1 + k]["e"])
    else:
        diffs.append((tag, " ".join(script[i1:i2]), " ".join(h["w"] for h in heard[j1:j2]), round(heard[j1]["s"], 2) if j1 < len(heard) else None))
        if i2 > i1 and j2 > j1:   # spread the heard span across the script words
            s0, e0 = heard[j1]["s"], heard[j2 - 1]["e"]
            for k in range(i2 - i1): times[i1 + k] = (s0 + (e0 - s0) * k / (i2 - i1), s0 + (e0 - s0) * (k + 1) / (i2 - i1))
for k in range(len(times)):  # words with nothing heard: interpolate between neighbours
    if times[k] is None:
        prev = next((times[j][1] for j in range(k - 1, -1, -1) if times[j]), 0)
        nxt = next((times[j][0] for j in range(k + 1, len(times)) if times[j]), prev + 0.3)
        times[k] = (prev, max(prev + 0.15, nxt))
json.dump([dict(w=w, s=round(t[0], 2), e=round(max(t[1], t[0] + 0.12), 2)) for w, t in zip(script, times)], open(out, "w"), ensure_ascii=False, indent=0)
print(f"script words {len(script)} | heard words {len(heard)} | matched exactly {sum(1 for t,*_ in sm.get_opcodes() if t=='equal')} blocks")
print("DIFFS (script -> heard @sec):")
for d in diffs: print("  ", d)
