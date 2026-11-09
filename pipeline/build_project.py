#!/usr/bin/env python3
"""Build the HyperFrames project for a talking-head edit.

usage: python3 build_project.py --brand netivey-hakama --video fx.mp4 --words base.words.json \
          --edit edit.json --fxplan plan.json --out <project-dir>

Writes: index.html (footage + captions host + outro host + SFX <audio> clips),
        compositions/captions.html, compositions/outro.html, assets/ (video, font, logo, sfx).

edit.json (all optional):
  fixes      {"wrong":"right"}  transcription fixes, matched on the word without trailing . or ,
  keywords   ["word", ...]      words painted in the accent colour (max ~1 per caption line)
  groups     [3,3,4,...]        words per caption line, in order; must sum to the word count. Omit for auto.
  outro_start  seconds          when the logo drops in (default: duration - 6)
  outro      false              no logo card
  sfx        "auto" | false     auto = one sound per effect in the fx plan + a pop on the logo
  extra_sfx  [{"file":"pop","at":12.3,"vol":0.4}]
"""
import argparse, html, json, os, shutil, subprocess, sys

K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
for a in ('brand', 'video', 'words', 'edit', 'fxplan', 'out'): ap.add_argument('--' + a)
A = ap.parse_args()
brand_dir = os.path.join(K, 'brands', A.brand or 'octaloom', 'video')
B = json.load(open(os.path.join(brand_dir, 'brand.json')))
E = json.load(open(A.edit)) if A.edit and os.path.exists(A.edit) else {}
FX = json.load(open(A.fxplan)).get('effects', []) if A.fxplan and os.path.exists(A.fxplan) else []
words = json.load(open(A.words))

probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                   '-show_entries', 'format=duration', '-of', 'json', A.video], capture_output=True, text=True).stdout)
W, H = probe['streams'][0]['width'], probe['streams'][0]['height']
DUR = round(float(probe['format']['duration']) - 0.03, 2)

P = os.path.abspath(A.out)
if not os.path.exists(os.path.join(P, 'hyperframes.json')):
    subprocess.run(['npx', '-y', 'hyperframes', 'init', os.path.basename(P), '--skip-skills', '--skill=hyperframes'],
                   cwd=os.path.dirname(P), check=True, capture_output=True)
for d in ('assets/fonts', 'assets/sfx', 'compositions'): os.makedirs(os.path.join(P, d), exist_ok=True)
shutil.copy(A.video, os.path.join(P, 'assets/footage.mp4'))
cap = B['caption']
shutil.copy(os.path.join(brand_dir, cap['font_file']), os.path.join(P, 'assets/fonts/caption.woff2'))

# ---------------- captions ----------------
fix = E.get('fixes', {}); KEY = set(E.get('keywords', []))
ws = []
for w in words:
    t = w['w'].strip(); brk = t.endswith(('.', ',', '?', '!')); core = t.rstrip('.,')
    core = fix.get(core, core)
    if not core: continue
    ws.append(dict(t=core, s=w['s'], e=max(w['e'], w['s'] + 0.2), brk=brk))

if E.get('groups'):
    assert sum(E['groups']) == len(ws), f"groups sum {sum(E['groups'])} != {len(ws)} words"
    groups, i = [], 0
    for n in E['groups']: groups.append(ws[i:i + n]); i += n
else:  # auto: break on punctuation / pause / 4 words, then fold orphans into a neighbour
    groups, cur = [], []
    for i, w in enumerate(ws):
        cur.append(w); nxt = ws[i + 1] if i + 1 < len(ws) else None
        if w['brk'] or not nxt or nxt['s'] - w['e'] >= 0.3 or len(cur) >= 4: groups.append(cur); cur = []
    merged = []
    for g in groups:
        if len(g) == 1 and merged and len(merged[-1]) <= 4: merged[-1] += g
        else: merged.append(g)
    groups = merged

top = {True: 0.778}.get(abs(W / H - 0.8) < 0.02, None)
if top is None: top = 0.615 if H / W > 1.6 else (0.76 if abs(W - H) < 10 else 0.80)
items, js = [], []
for gi, g in enumerate(groups):
    st = max(0.15, g[0]['s'] - 0.1)
    nxt = groups[gi + 1][0]['s'] - 0.1 if gi + 1 < len(groups) else DUR - 0.05
    en = min(max(g[-1]['e'] + 0.35, g[-1]['s'] + 0.6), nxt)
    spans = []
    for wi, w in enumerate(g):
        cls = 'w key' if w['t'] in KEY else 'w'
        spans.append(f'<span id="c{gi}w{wi}" class="{cls}">{html.escape(w["t"])}</span>')
        js.append(f'tl.fromTo("#c{gi}w{wi}",{{opacity:{cap["dim_opacity"]},y:4}},{{opacity:1,y:0,duration:0.14,ease:"power3.out"}},{max(st, w["s"] - 0.05):.2f});')
    items.append(f'<div id="cg{gi}" class="clip grp" data-start="{st:.2f}" data-duration="{en - st:.2f}"><div class="pill">{" ".join(spans)}</div></div>')
    js.append(f'tl.fromTo("#cg{gi} .pill",{{scale:0.92}},{{scale:1,duration:0.2,ease:"back.out(2)"}},{st:.2f});')
fs = cap['font_size'] * (W / 1080)
open(os.path.join(P, 'compositions/captions.html'), 'w').write(f'''<template>
  <style>
    @font-face {{ font-family: "{cap['font_family']}"; src: url("assets/fonts/caption.woff2"); font-weight: {cap['font_weight']}; }}
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .grp {{ position: absolute; left: 0; right: 0; top: {int(H * top)}px; display: flex; justify-content: center; direction: rtl; overflow: visible; }}
    .pill {{ font-family: "{cap['font_family']}", sans-serif; font-weight: {cap['font_weight']}; font-size: {fs:.0f}px; line-height: 1.12; color: {cap['text']};
             background: {cap['box']}; padding: 14px 34px 18px; border-radius: {cap['radius']}px; max-width: {int(W * 0.84)}px; text-align: center;
             box-shadow: 0 10px 30px rgba(0,0,0,0.28); }}
    .w {{ display: inline-block; }}
    .key {{ color: {cap['keyword']}; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{chr(10).join("    " + x for x in items)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{chr(10).join("    " + x for x in js)}
    window.__timelines["captions"] = tl;
  </script>
</template>
''')

# ---------------- outro ----------------
O = B.get('outro'); outro_on = O and E.get('outro', True) is not False
o_start = float(E.get('outro_start', max(0, DUR - 6)))
if outro_on:
    shutil.copy(os.path.join(brand_dir, O['logo']), os.path.join(P, 'assets/logo.png'))
    open(os.path.join(P, 'compositions/outro.html'), 'w').write(f'''<template>
  <style>
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    #outro-card {{ position: absolute; left: 0; right: 0; top: {int(H * 0.052)}px; display: flex; justify-content: center; }}
    #outro-pill {{ background: {O['box']}; border-radius: 26px; padding: 26px 46px; display: flex; flex-direction: column; align-items: center; gap: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.3); }}
    #outro-logo {{ width: {O['logo_width']}px; height: auto; display: block; }}
    #outro-bar {{ width: 0px; height: 6px; background: {O['bar']}; border-radius: 3px; }}
  </style>
  <div id="root" data-composition-id="outro" data-width="{W}" data-height="{H}">
    <div id="outro-card" class="clip" data-start="0" data-duration="{DUR - o_start:.2f}">
      <div id="outro-pill"><img id="outro-logo" src="assets/logo.png" alt="logo" /><div id="outro-bar"></div></div>
    </div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.fromTo("#outro-pill", {{ opacity: 0, y: -40, scale: 0.96 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }}, 0);
    tl.fromTo("#outro-bar", {{ width: 0 }}, {{ width: 320, duration: 0.6, ease: "power2.out" }}, 0.35);
    window.__timelines["outro"] = tl;
  </script>
</template>
''')

# ---------------- sound effects ----------------
sfx = []
if E.get('sfx', 'auto') == 'auto':
    whooshes = ['whoosh-short', 'whoosh']; wi = 0
    for f in FX:
        s = float(f['start']); n = f['fx']
        if n == 'backdrop-word': sfx.append(('whoosh-cinematic', s, 0.35))
        elif n == 'huge-strike':
            sfx.append(('whoosh-short', s, 0.28)); sfx.append(('impact-bass-1', s + float(f.get('at', 0.6)), 0.22))
        elif n in ('lean-in', 'locked-on'): sfx.append((whooshes[wi % 2], max(0, s - 0.05), 0.3)); wi += 1
        elif n == 'slow-push': sfx.append(('riser', s, 0.12))
        elif n == 'spotlight': sfx.append(('impact-bass-1', s, 0.28))
        else: sfx.append((whooshes[wi % 2], s, 0.28)); wi += 1
    if outro_on: sfx.append(('pop', o_start + 0.05, 0.4))
for x in E.get('extra_sfx', []): sfx.append((x['file'], float(x['at']), float(x.get('vol', 0.35))))
audio_tags = []
for i, (name, at, vol) in enumerate(sorted(sfx, key=lambda x: x[1])):
    src = os.path.join(K, 'pipeline', 'sfx', name + '.mp3')
    if not os.path.exists(src): print('missing sfx', name, file=sys.stderr); continue
    shutil.copy(src, os.path.join(P, 'assets/sfx', name + '.mp3'))
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout or 1)
    d = min(d, DUR - at - 0.01)
    if d <= 0.05: continue
    audio_tags.append(f'<audio id="sfx{i}" class="clip" src="assets/sfx/{name}.mp3" data-start="{at:.2f}" data-duration="{d:.2f}" data-track-index="{4 + i}" data-volume="{vol}"></audio>')

# ---------------- index ----------------
open(os.path.join(P, 'index.html'), 'w').write(f'''<!doctype html>
<html lang="he">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: {B['colors']['navy']}; }}
      #root {{ width: 100%; height: 100%; position: relative; }}
      #footage {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; object-fit: cover; z-index: 1; }}
      #captions {{ z-index: 2; }}
      #outro {{ z-index: 3; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="{W}" data-height="{H}">
      <video id="footage" class="clip" src="assets/footage.mp4" data-start="0" data-duration="{DUR}" data-track-index="0" playsinline data-has-audio="true"></video>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html"
           data-start="0" data-duration="{DUR}" data-track-index="1" data-track-kind="captions" data-width="{W}" data-height="{H}"></div>
      {f'<div id="outro" data-composition-id="outro" data-composition-src="compositions/outro.html" data-start="{o_start:.2f}" data-duration="{DUR - o_start:.2f}" data-track-index="2" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>' if outro_on else ''}
      {chr(10).join("      " + t for t in audio_tags)}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
''')
print(f'{len(groups)} caption lines | {len(audio_tags)} sfx | outro {"at " + str(o_start) if outro_on else "off"} | {W}x{H} {DUR}s')
print(' | '.join(' '.join(w['t'] for w in g) for g in groups))
