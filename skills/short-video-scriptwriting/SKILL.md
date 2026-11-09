---
name: short-video-scriptwriting
description: "Write, improve, or audit short talking-head video scripts (LinkedIn video, Reels, Shorts) in Hebrew, up to 1:30. Strong hook, a rehook in the middle, a concrete ending. Four methods: STARR structure, curiosity-gap hooks, series episodes, and the Hook Audit as a quality gate. Use for a new script, a hook, a series episode, or feedback on an existing script. In the OctaLoom Studio it answers the `script` and `scripts-more` requests in inbox.json."
---

# Short-video scriptwriting

Scripts in Hebrew, written for spoken delivery, ready to film. Instructions stay in English.

## 1. House rules (always)

- **Length:** 1:30 maximum spoken. About 2.9 words per second after the edit's 1.1x pace, so **~260 Hebrew words** at most. Shorter is great.
- **Hook (first 3 seconds):** either a bold claim that the rest of the video dismantles, or a question the viewer answers for themselves (*"מה יהיה לי קשה יותר לקבל?"*). It is about the viewer, not the speaker's résumé. Up to 2 short lines. Specific: a name, a number, or a feeling the viewer recognises. No vague openers ("לא תאמינו", "בואו אספר לכם").
- **Rehook:** one line between 0:12 and 0:40 that reopens curiosity: a turn (*"ואז..."*, *"אבל..."*), a new stake, or a promise of what is coming.
- **Ending:** a concrete landing (what he did, what changed). An open loop to the next video is welcome. No vague moral.
- **Every line stands alone when heard.** Nothing that depends on something off-screen ("בתמונה הזאת..."). The editor only puts on screen words that are actually spoken.
- **Voice:** the speaker's voice from `brands/<brand>/voice/03-voice.md`. Stories and the numbers allowed to be said: `04-story-bank.md`. Every ⚠️ there is a hard publishing rule. Never invent results, clients, or numbers; a suspense device only works if the reveal is real.
- **Hebrew:** spoken Israeli Hebrew. Long sentences with commas are fine; no strings of 3-word sentences, no "זה לא X אלא Y".
- Collect only missing inputs. The one that matters most is the audience; take it from the voice files and the idea before asking.

## 2. Choose the method

| Situation | Method |
|---|---|
| New single script, a clear lesson or method to teach | STARR (A) |
| A hook or concept built on suspense and a reveal at the end | Curiosity gap (B) |
| An episode of a series | Series episode (C) |
| An existing script or transcript that should perform better | Hook Audit (D) first |

Every new or rewritten script ends with the Hook Audit (D) as a quality gate.

## Method A: STARR

Five beats, in order, fast delivery.
1. **S, shocking statement.** One line straight to camera, no warm-up.
2. **T, text hook.** On-screen text that complements the statement, not a repeat of it.
3. **A, achievement.** Proof that backs the claim, verified and relevant. If there is none, use a transparent demonstration or another method. Never invent credentials.
4. **R, roadmap.** Concrete, countable steps from point A to point B.
5. **R, recipe.** A distinct name for the roadmap, so viewers stay to the end.

## Method B: Curiosity gap

Two gaps: one that makes people **watch to the end**, one that makes them **follow**.
1. Open a question the audience needs answered: the final verdict, the result, "can it be done?".
2. Add a score, verdict or result device that sets up an expectation.
3. Keep the answer for the end. Best when the answer depends on the speaker's expertise, so the reveal proves it.
4. The follow gap: an open-ended frame ("until…", "day 1", a long-term goal) whose answer cannot fit in one video.
5. Keep the business at the centre: the reveal teaches the buyer something or sets up the offer.

Check: does the viewer need the answer, is it withheld until the end, is there a reason to follow, is it really about the business, can the promise be fulfilled. Plan at least 3 episodes before using a follow gap.

## Method C: Series episode

1. Name the series and the episode number in the first line.
2. One short line for newcomers: who the speaker is.
3. Point back to the previous episode (skip in episode 1).
4. Optional honest line that lowers the bar, only if it is true.
5. The one thing this episode teaches.
6. Tease 2-3 coming topics; ask to follow.
7. The lesson itself, one lesson only.
8. Seed the next episode.

## Method D: Hook Audit (quality gate)

1. **Specific, clear, direct hook**: the first line says exactly what the video is about.
2. **Plain words for this audience**: flag jargon and long structures; keep necessary professional terms.
3. **A name, number or emotional phrase in the hook** that the ideal viewer relates to.
4. **Best line within the first 10 seconds**: if the strongest line sits later, rebuild the hook around it.
5. **Cut fluff**: delete every sentence that does not serve the hook's promise, and say what was cut.
6. **Don't give away the payoff early**: lead with the stakes, keep the answer for the end. (Checks 4 and 6 pull in opposite directions: open with the premise, never with the reveal.)

Delivering an audit: one line per check (pass / fail + why), then the rewritten script, new hook first, in the speaker's voice.

## Studio integration (OctaLoom Studio)

**Trigger:** a request in `projects/<pid>/inbox.json` with `type: "script"` (first round) or `"scripts-more"` (another round; its `message` says what to change). Inputs: `clips/<id>.user.json` → `idea` (`topic`, `story`, `audience`, `takeaway`) and the voice files.

**Produce 3 scripts**, each a different angle: e.g. one bold-claim hook, one viewer-question hook, one story-moment hook. Run the Hook Audit on each.

**Write** them to `clips/<id>.json` → `scripts` (append; keep earlier rounds; new ids):
```json
{"id": "s4", "title": "השאלה", "angle": "one line: what makes this angle different",
 "lines": [{"role": "hook", "text": "..."}, {"role": "body", "text": "..."}, {"role": "rehook", "text": "..."},
           {"role": "body", "text": "..."}, {"role": "end", "text": "..."}]}
```
One `hook` (first), at least one `rehook`, one `end` (last); one or two spoken sentences per line. The Studio shows a timer (words ÷ 2.9) and a checklist (hook ≤ 22 words, rehook between 0:12 and 0:40, ≤ 1:30, has an ending). Make all four pass.

**Then** set the request `status: "done"` (use `progress` while working, e.g. `"כותב תסריט 2 מתוך 3"`). Answer any script notes (`notes/<id>.json`, `stage: "script"`) with `status` + `reply`.
