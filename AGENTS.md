# AGENTS.md · OctaLoom Studio

You are the agent behind the Studio (`npm start` → http://localhost:4321). The human never talks to you through code: every primary button in the Studio writes a **request** to `projects/<pid>/inbox.json`, and you answer by writing files. The page refreshes by itself. Read `docs/UX.md` once to understand what the human sees.

Works with Claude Code and with ChatGPT Work / Codex. **No paid service is required.** If you have an image/video/music/voice tool (Kolbo, etc.), you may use it where marked *optional*; never make it a requirement.

## What the human will say (and what you do)

| They say | You do |
|---|---|
| "תתקין את הסטודיו" | `npm run setup` until it prints `READY`. Missing Node/Python/ffmpeg → install them (Mac: `brew install node python ffmpeg`) and run again. |
| "תפעיל את הסטודיו" | Start `npm start` **in the background** (it never exits; do not wait for it), then give them http://localhost:4321. |
| "יש בקשות חדשות בסטודיו, תטפל לפי AGENTS.md" | The loop below, until no request is `new`. |
| a question about a video | Read `projects/*/clips/<id>.json` and answer; change files only through the loop. |

Answer the human in Hebrew, short, masculine address. They are not a developer: never ask them to edit JSON or run code themselves.

## The loop

1. Read `projects/*/inbox.json`. Take requests with `status: "new"`, oldest first.
2. Set `status: "in-progress"` and keep `progress` to one short Hebrew line the human sees (e.g. `"מנקה את הקול"`, `"מרנדר גרסה 3"`).
3. Do the work for the request `type` (below).
4. Set `status: "done"`. For notes you handled, set each note's `status` (`done` / `declined`) and a short `reply` saying what changed.

Hard rules, always:
- **No edit before an approved storyboard** (a note `kind: "approve", stage: "storyboard"`).
- **Every word on screen is heard at that moment.** Captions = the exact spoken words. Effect text only while it is being said. Unclear audio → cut the phrase, never guess.
- **Never invent** results, clients, numbers. Respect every ⚠️ in `brands/<brand>/voice/04-story-bank.md`.
- **Voice files first.** If `brands/<brand>/voice/` is missing, stop and tell the human: put `mplifyai-private.zip` in the Studio folder and run `npm run setup`. Never write a script without them.
- `projects/sabba/` is the worked example (a finished 2-episode series with storyboards, notes and versions). Learn from it; leave its `in-progress` request alone.
- **Self-QA before every delivery** (section QA). The human should never be the first to find a clipped word.

## Files

```
projects/<pid>/
  project.json             {"title"}
  inbox.json               requests from the Studio (you set status/progress)
  clips/<id>.json          YOURS: scripts, storyboard, versions, post
  clips/<id>.user.json     THE STUDIO'S: idea, scriptChoice, scriptFinal, links, shot, done (read only)
  notes/<id>.json          the human's notes (you set status/reply only)
  source/<id>/             raw footage uploaded in the Studio
  media/                   images used in storyboards/cards
  renders/                 videos (vN.mp4 for review, final-*.mp4 for download). Not in git.
work/<id>/                 your scratch folder per video (cut, base, fx, hf/ ...). Not in git.
brands/<brand>/            brand.json (Studio colours), video/ (captions/effects), voice/ (how the speaker talks), design-system/
```
The Studio derives the stage from these files, so writing the right file is how you move a video forward.

## Requests

### `script` / `scripts-more`
Follow `skills/short-video-scriptwriting/SKILL.md` (sections 0 and "Studio integration"). Input: `user.idea`; for `scripts-more` also `message`. Output: 3 scripts appended to `clips/<id>.json` → `scripts`, each with `lines` and roles `hook` / `body` / `rehook` / `end`. Max 1:30 (≈260 words); shorter is great.

### `storyboard`
Footage is in `source/<id>/` (or a Drive link in `user.links`: download it into `source/<id>/` first).
1. `transcribe.py source/<id>/<file> work/<id>/raw.words.json` and compare with `user.scriptFinal`: the storyboard follows what was **actually said**, in the script's order. Pick the best take of each line.
2. Phrase boundaries → `work/<id>/phrases.in.json` (`[{start, end, text}]`, text = exactly what is heard).
3. Write `clips/<id>.json` → `script`: one entry per line `{t, text, kw[], events[], thumb?}` with `t` in the **edited** timeline (estimate: raw seconds ÷ 1.1 minus trimmed pauses), `kw` = one keyword per caption line, `events` = what happens at that second (`hook`, `text`, `zoom`, `push`, `broll`, `sfx`; put the second in the `label`). Also `summary`, `duration`, `format`, `cut` (what was left out and why).
4. If there were storyboard notes, answer each one.

### `edit` (storyboard approved) and `fix` (notes on a version)
Run the pipeline (next section), publish a version (below), answer notes.

### `post`
A LinkedIn post that goes with the video, in the speaker's voice (`brands/<brand>/voice/03-voice.md`). Write it to `clips/<id>.json` → `post`.

## The editing pipeline

Python = `vendor/effects/.venv/bin/python` (created by `setup.sh`). `W=work/<id>`.

| Step | Command | Notes |
|---|---|---|
| Cut + pace | `python3 pipeline/cut.py <raw> $W/phrases.in.json $W --crop 4x5` | snaps every edge to silence, shortens pauses >0.2 s, 1.1x, 1 s hold at the end. Use `pin_start/pin_end` for hand-checked edges (fillers like אה/אמ glued to a word). |
| QA the cut | `$PY pipeline/align.py $W/cut.mp4 $W/phrases.json $W/words.json` | prints every word that differs. Leftover words at a join = fix the boundary and re-cut. |
| Look | `$PY pipeline/look.py $W/cut.mp4 <plate.png or none> $W/base.mp4` | grade + fill light; with a plate, swaps the background (local segmentation). |
| Effects | `cd vendor/effects && FX_HEB_FONT=plexhebrew .venv/bin/python scripts/fx.py --plan $W/plan.json $W/base.mp4 $W/fx.mp4` | `plan.json`: max ~3 text effects (`backdrop-word`, `huge-strike`) + camera (`lean-in`, `slow-push`), 2-3 s apart. Check with `--still t1,t2` first. Hebrew-safe effects only (see vendor/effects SKILL + `pipeline/patches`). |
| Photo cards | `python3 pipeline/cards.py $W/fx.mp4 $W/fxb.mp4 img.png:start:dur ...` | speaker blurs behind the card. Only images whose content the viewer understands. |
| Voice + music | `python3 pipeline/mix.py $W/cut.mp4 $W/mix.wav [--voice clean.wav] [--music track.mp3]` | local denoise by default; music from `assets/music/` if any. Then mux: `ffmpeg -i fxb.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac fxc.mp4` |
| Captions + SFX | `python3 pipeline/build_project.py --brand <brand> --video $W/fxc.mp4 --words $W/words.json --edit $W/edit.json --fxplan $W/plan.json --out $W/hf` | `edit.json`: `keywords`, `groups` (words per caption line, by meaning), `outro: false`, `sfx: false`, `extra_sfx` (`ping-short` on listed items, `chime-short`, `whoosh-short`, `impact-bass-1`, `riser`, ...). No sound on the opening. |
| Render | `bash pipeline/render.sh $W/hf $W/out.mp4` then `ffmpeg -i out.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5 final.mp4` | |

Optional with an AI tool: a cleaner voice track (pass with `--voice`), a background plate, illustrative b-roll, music. Say in the version's `changes` when something is AI-generated.

Formats: `--crop 4x5` (LinkedIn, default) and `--crop 9x16` (Instagram; captions move up automatically, keep any top overlay below y≈300).

## Publishing a version
1. Review copy: `ffmpeg -i final.mp4 -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 128k -movflags +faststart projects/<pid>/renders/vN.mp4`
2. Full quality for download: `renders/final-<id>-4x5.mp4` (and `-9x16`).
3. Append to `clips/<id>.json` → `versions`: `{"v": N, "file": "renders/vN.mp4", "final": "...", "final916": "...", "at": "...", "changes": "one line per note you handled"}`.

## QA (before every version)
- `align.py` on the final file: only spelling differences allowed (`mplifyAI`→`אמפליפיי`, digits). Report the rest.
- Frames at every effect, card and the last second (`ffmpeg -ss T -i final.mp4 -frames:v 1 x.jpg`): text readable, not on the face, gone when the line ends.
- Loudness: `ffmpeg -i final.mp4 -af ebur128=peak=true -f null -` → I ≈ -14 LUFS, peak < -1.
- Say in `changes` what you measured and that you did not listen.
