(function () {
"use strict";
// OctaLoom Studio UI. One primary action per screen, always in the bottom bar (see docs/UX.md).
const STEPS = [
  ["idea", "רעיון"], ["script", "תסריט"], ["shoot", "צילום"], ["footage", "חומרים"],
  ["storyboard", "סטוריבורד"], ["review", "סרטון"], ["done", "מוכן"]];
const STEP_OF = { idea: 0, script: 1, shoot: 2, footage: 3, storyboard: 4, editing: 5, review: 5, done: 6 };
const STAGE_CHIP = { idea: "רעיון", script: "בוחרים תסריט", shoot: "לצילום", footage: "חומרים", storyboard: "סטוריבורד לאישור",
  editing: "בעריכה", review: "מחכה להערות", done: "מוכן" };
const TYPE = { hook: "הוק", text: "אפקט טקסט", zoom: "זום", push: "דחיפה איטית", broll: "תמונה", card: "כרטיס", sfx: "סאונד" };
const WORK = { script: "הסוכן כותב 3 תסריטים", "scripts-more": "הסוכן כותב עוד אפשרויות", storyboard: "הסוכן מכין סטוריבורד מהחומרים",
  edit: "הסוכן עורך את הסרטון", fix: "הסוכן מתקן לפי ההערות", post: "הסוכן כותב פוסט" };
const WPS = 2.9;                      // spoken words per second after the 1.1x pace (measured on Dennis)
const MAX_SEC = 90;

const S = { cfg: null, pid: null, p: null, cid: null, view: null, v: null, drafts: {}, pin: {}, mode: {}, openLine: null, scriptEdit: null, vid: null, tp: null, editNote: null };
const $ = (s, el = document) => el.querySelector(s);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v; else e.setAttribute(k, v === true ? "" : v); }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); } return e; };
const fmt = t => { t = Math.max(0, +t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + String(s).padStart(2, "0"); };
const media = p => !p ? "" : /^(https?:)?\//.test(p) ? p : `/media/${encodeURIComponent(S.pid)}/${p.split("/").map(encodeURIComponent).join("/")}`;
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const api = (path, opt = {}) => fetch(`/api/projects/${encodeURIComponent(S.pid)}${path}`, { headers: { "Content-Type": "application/json" }, ...opt, body: opt.body && typeof opt.body !== "string" ? JSON.stringify(opt.body) : opt.body })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; });
const capi = (path, opt) => api(`/clips/${encodeURIComponent(S.cid)}${path}`, opt);
function toast(m, bad) { const t = $("#toast"); t.textContent = m; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2800); }
const fail = e => toast("לא נשמר: " + (e.message || e) + ". לבדוק שחלון npm start פתוח", true);
const clip = () => S.p && S.p.clips.find(c => c.id === S.cid);

/* ---------- small building blocks ---------- */
function hl(text, kws) {
  const p = el("p", { class: "txt" });
  if (!kws || !kws.length) { p.textContent = text; return p; }
  const re = new RegExp("(" + kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  for (const part of String(text).split(re)) if (part) p.append(kws.includes(part) ? el("mark", {}, part) : document.createTextNode(part));
  return p;
}
// one text box: Enter adds, Shift+Enter = new line. Drafts survive live redraws.
function draftBox({ key, placeholder, onSubmit, onType, prefix, autofocus, rows = 2 }) {
  const ta = el("textarea", { "data-key": key, rows: String(rows), placeholder, "aria-label": placeholder });
  ta.value = S.drafts[key] ?? "";
  const go = async () => { const v = ta.value.trim(); if (!v) return ta.focus(); const ok = await onSubmit(v); if (ok !== false) { delete S.drafts[key]; ta.value = ""; render(); } };
  ta.addEventListener("input", () => { S.drafts[key] = ta.value; onType && onType(); });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
  if (autofocus) setTimeout(() => ta.focus(), 0);
  return el("div", { class: "draftbox" }, prefix || null, ta, el("button", { class: "btn", type: "button", title: "Enter", onclick: go }, "הוספה ↵"));
}
function noteRow(n, { seek, editable }) {
  const st = n.status === "done" ? ["תוקן", "ok"] : n.status === "declined" ? ["נשאר כמו שהוא", ""] : n.sent ? ["נשלח, ממתין", "wait"] : ["טיוטה", "draft"];
  const editing = S.editNote === n.id;
  const body = editing ? draftBox({ key: "edit:" + n.id, placeholder: "עריכת ההערה, Enter שומר", autofocus: true,
      onSubmit: v => capi(`/notes/${n.id}`, { method: "PATCH", body: { text: v } }).then(() => { S.editNote = null; return load(); }).catch(fail) })
    : el("p", {}, n.text);
  return el("li", { class: "note" + (n.sent ? "" : " is-draft") },
    el("div", { class: "hd" },
      n.stage === "video" ? (n.t != null ? el("button", { class: "tbtn", type: "button", title: "לקפוץ לרגע הזה", disabled: !seek || null, onclick: () => seek && seek(n.t) }, "▶ " + fmt(n.t)) : el("span", { class: "gen" }, "כל הסרטון")) : null,
      el("span", { class: "chip " + st[1] }, st[0]),
      editable && !n.sent ? el("span", { class: "row-actions" },
        el("button", { class: "icon", type: "button", "aria-label": "עריכת ההערה", title: "עריכה", onclick: () => { S.editNote = editing ? null : n.id; S.drafts["edit:" + n.id] = n.text; render(); } }, "✎"),
        el("button", { class: "icon", type: "button", "aria-label": "מחיקת ההערה", title: "מחיקה", onclick: () => capi(`/notes/${n.id}`, { method: "DELETE" }).then(load).catch(fail) }, "🗑")) : null),
    body, n.reply ? el("div", { class: "reply" }, "תשובה: " + n.reply) : null);
}
function card(title, ...kids) { return el("section", { class: "card" }, title ? el("h3", {}, title) : null, ...kids); }
function actionBar({ status, primary }) {
  return el("div", { class: "actionbar", role: "region", "aria-label": "הפעולה הבאה" },
    el("div", { class: "ab-status" }, status || ""),
    primary ? el("button", { class: "btn primary big", type: "button", disabled: primary.disabled || null, onclick: primary.onclick }, primary.label) : null);
}
async function ask(type, extra = {}) { try { await capi("/request", { method: "POST", body: { type, ...extra } }); toast("נשלח לסוכן ✓"); await load(); } catch (e) { fail(e); } }

/* ---------- 1 · idea ---------- */
function viewIdea(c) {
  const u = c.user.idea || {};
  const f = (k, label, ph, rows) => el("label", { class: "field" }, el("span", {}, label),
    el(rows ? "textarea" : "input", { id: "idea-" + k, rows: rows ? String(rows) : null, placeholder: ph, value: S.drafts["idea:" + k] ?? u[k] ?? "", oninput: e => { S.drafts["idea:" + k] = e.target.value; } }));
  const box = el("div", { class: "panel" },
    card("על מה הסרטון?",
      el("p", { class: "lead" }, "כמה מילים מספיקות. הסוכן יחזור עם 3 תסריטים בקול שלך: הוק חזק, ריהוק באמצע, ועד דקה וחצי (קצר יותר זה מצוין)."),
      f("topic", "הנושא *", "למשל: למה עזבתי משכורת כדי לבנות עסק שישי", 2),
      f("story", "סיפור או רגע אמיתי שקשור", "מה קרה, מתי, מי היה שם", 3),
      f("audience", "למי זה מיועד", "למשל: בעלי סוכנויות ביטוח"),
      f("takeaway", "מה הצופה ייקח מזה", "משפט אחד")));
  const busy = c.working.some(r => r.type === "script");
  return { box, bar: { status: busy ? "⏳ " + WORK.script + "…" : "התסריטים יופיעו בשלב הבא לבד",
    primary: { label: busy ? "התסריטים בדרך…" : "תכתוב לי 3 תסריטים ←", disabled: busy, onclick: async () => {
      const idea = {}; for (const k of ["topic", "story", "audience", "takeaway"]) idea[k] = ($("#idea-" + k) || {}).value || "";
      if (!idea.topic.trim()) { toast("צריך לפחות נושא", true); $("#idea-topic").focus(); return; }
      try { await capi("", { method: "PATCH", body: { idea } }); await ask("script"); } catch (e) { fail(e); } } } } };
}

/* ---------- 2 · script ---------- */
const ROLE = { hook: "הוק", body: "", rehook: "ריהוק", end: "סיום" };
function scriptStats(lines) {
  const w = lines.reduce((a, l) => a + words(l.text), 0), sec = Math.round(w / WPS);
  const hook = lines.find(l => l.role === "hook");
  let t = 0, reAt = null; for (const l of lines) { if (l.role === "rehook" && reAt == null) reAt = t / WPS; t += words(l.text); }
  return { w, sec, checks: [
    ["הוק קצר (עד 2 שורות)", !!hook && words(hook.text) <= 22],
    ["ריהוק בין 0:12 ל-0:40" + (reAt != null ? ` (${fmt(reAt)})` : ""), reAt != null && reAt >= 12 && reAt <= 40],
    ["עד 1:30", sec <= MAX_SEC],
    ["יש סיום", lines.some(l => l.role === "end")]] };
}
function scriptCard(s, onPick) {
  const st = scriptStats(s.lines || []);
  return el("article", { class: "scard" },
    el("div", { class: "scard-hd" }, el("b", {}, s.title || "תסריט"), el("span", { class: "chip " + (st.sec <= MAX_SEC ? "ok" : "wait") }, "⏱ " + fmt(st.sec))),
    s.angle ? el("p", { class: "cut" }, s.angle) : null,
    el("div", { class: "scard-body" }, (s.lines || []).map(l => el("p", { class: "sl r-" + l.role }, ROLE[l.role] ? el("span", { class: "role" }, ROLE[l.role]) : null, l.text))),
    el("ul", { class: "checks" }, st.checks.map(([k, ok]) => el("li", { class: ok ? "ok" : "no" }, (ok ? "✓ " : "✗ ") + k))),
    el("button", { class: "btn", type: "button", onclick: onPick }, "לעבוד על התסריט הזה"));
}
function viewScript(c) {
  const scripts = c.scripts || []; const u = c.user;
  const chosen = u.scriptChoice && scripts.find(s => s.id === u.scriptChoice);
  const box = el("div", { class: "panel" });
  const busy = c.working.find(r => r.type === "script" || r.type === "scripts-more");
  if (!chosen) {
    if (!scripts.length) { box.append(card(null, el("div", { class: "waiting" }, el("div", { class: "spinner" }), el("b", {}, "⏳ " + WORK.script), el("span", {}, "התסריטים יופיעו כאן לבד.")))); return { box, bar: { status: "מחכים לתסריטים" } }; }
    box.append(el("div", { class: "scards" }, scripts.map(s => scriptCard(s, () => { S.scriptEdit = null; capi("", { method: "PATCH", body: { scriptChoice: s.id } }).then(load).catch(fail); }))));
    box.append(card("אף אחד לא זה? בקשו כיוון אחר", draftBox({ key: "more:" + c.id, placeholder: "מה לשנות? למשל: הוק אישי יותר, פחות מספרים. Enter שולח", onSubmit: v => ask("scripts-more", { message: v }) })));
    return { box, bar: { status: busy ? "⏳ " + WORK[busy.type] + "…" : "לוחצים ״לעבוד על התסריט הזה״ על אחד מהם", primary: null } };
  }
  if (!S.scriptEdit || S.scriptEdit.id !== chosen.id) S.scriptEdit = { id: chosen.id, lines: (u.scriptFinal && u.scriptFinal.length ? u.scriptFinal : chosen.lines).map(l => ({ ...l })) };
  const lines = S.scriptEdit.lines;
  const statsBox = el("div", { class: "sstats" });
  const paintStats = () => { const s2 = scriptStats(lines); statsBox.replaceChildren(el("span", { class: "chip " + (s2.sec <= MAX_SEC ? "ok" : "wait") }, `⏱ ${fmt(s2.sec)} · ${s2.w} מילים`),
    el("ul", { class: "checks inline" }, s2.checks.map(([k, ok]) => el("li", { class: ok ? "ok" : "no" }, (ok ? "✓ " : "✗ ") + k)))); };
  paintStats();
  const list = el("ol", { class: "sedit" }, lines.map((l, i) => el("li", { class: "r-" + l.role },
    el("select", { "aria-label": "סוג השורה", onchange: e => { l.role = e.target.value; render(); } },
      Object.entries({ hook: "הוק", body: "גוף", rehook: "ריהוק", end: "סיום" }).map(([k, v]) => el("option", { value: k, selected: l.role === k || null }, v))),
    el("textarea", { rows: "2", "data-key": `sl:${i}`, "aria-label": "שורה " + (i + 1), oninput: e => { l.text = e.target.value; paintStats(); } }, l.text),
    el("button", { class: "icon", type: "button", title: "מחיקת השורה", "aria-label": "מחיקת השורה", onclick: () => { lines.splice(i, 1); render(); } }, "🗑"))));
  box.append(card(chosen.title || "התסריט", el("p", { class: "lead" }, "עורכים ישירות. הטיימר והצ׳קליסט מתעדכנים תוך כדי."), statsBox, list,
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", onclick: () => { lines.push({ role: "body", text: "" }); render(); } }, "+ שורה"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn ghost", type: "button", onclick: () => { S.scriptEdit = null; capi("", { method: "PATCH", body: { scriptChoice: null, scriptFinal: null } }).then(load); } }, "→ חזרה לשלוש האפשרויות"))));
  const st = scriptStats(lines);
  return { box, bar: { status: st.sec > MAX_SEC ? "⚠ ארוך מ-1:30. כדאי לקצר לפני הצילום" : "קוראים בקול. אם זה נשמע כמוך, ממשיכים",
    primary: { label: "זה התסריט, אני מצלם ←", onclick: () => capi("", { method: "PATCH", body: { scriptFinal: lines.filter(l => l.text.trim()) } }).then(() => { S.scriptEdit = null; S.view = null; return load(); }).catch(fail) } } };
}

/* ---------- 3 · shoot (teleprompter) ---------- */
function viewShoot(c) {
  const lines = c.user.scriptFinal || [];
  const tp = S.tp || (S.tp = { speed: +(store.get("tp.speed") || 3), running: false, y: 0 });
  const text = el("div", { class: "tp-text" }, lines.map(l => el("p", { class: "r-" + l.role }, l.text)));
  const stage = el("div", { class: "tp", tabindex: "0", "aria-label": "טלפרומפטר. רווח עוצר וממשיך" }, el("div", { class: "tp-line", "aria-hidden": "true" }), text);
  const step = () => { if (!tp.running || !document.body.contains(stage)) return; tp.y += tp.speed * 0.5; text.style.transform = `translateY(${-tp.y}px)`; requestAnimationFrame(step); };
  const toggle = () => { tp.running = !tp.running; playBtn.textContent = tp.running ? "⏸ עצירה" : "▶ התחלה"; if (tp.running) requestAnimationFrame(step); };
  const playBtn = el("button", { class: "btn primary", type: "button", onclick: toggle }, tp.running ? "⏸ עצירה" : "▶ התחלה");
  stage.addEventListener("keydown", e => { if (e.code === "Space") { e.preventDefault(); toggle(); } });
  setTimeout(() => { text.style.transform = `translateY(${-tp.y}px)`; if (tp.running) requestAnimationFrame(step); }, 0);
  const speed = d => { tp.speed = Math.max(1, Math.min(10, tp.speed + d)); store.set("tp.speed", tp.speed); spd.textContent = "מהירות " + tp.speed; };
  const spd = el("span", { class: "chip" }, "מהירות " + tp.speed);
  const box = el("div", { class: "panel" },
    card("טלפרומפטר",
      el("div", { class: "row" }, playBtn,
        el("button", { class: "btn", type: "button", onclick: () => { tp.y = 0; text.style.transform = "translateY(0)"; } }, "↺ מההתחלה"),
        el("span", { class: "spacer" }),
        el("button", { class: "btn", type: "button", "aria-label": "לאט יותר", onclick: () => speed(-1) }, "−"), spd,
        el("button", { class: "btn", type: "button", "aria-label": "מהר יותר", onclick: () => speed(1) }, "+"),
        el("button", { class: "btn", type: "button", onclick: () => stage.requestFullscreen && stage.requestFullscreen().catch(() => {}) }, "⛶ מסך מלא")),
      stage),
    card("לפני שמצלמים", el("ul", { class: "checks" }, ["אור מהחלון מולך, לא מאחוריך", "מצלמה בגובה העיניים", "טלפון לאורך (אנכי)", "חדר שקט, בלי מזגן", "שני טייקים של ההוק", "שנייה של שקט לפני ואחרי"].map(t => el("li", {}, "☐ " + t)))));
  return { box, bar: { status: "מצלמים, ואז מעלים את הקובץ בשלב הבא", primary: { label: "צילמתי, להעלאה ←", onclick: () => capi("", { method: "PATCH", body: { shot: true } }).then(() => { S.view = null; return load(); }).catch(fail) } } };
}

/* ---------- 4 · footage ---------- */
function viewFootage(c) {
  const files = c.footage || [], links = c.user.links || [];
  const prog = el("div", { class: "progress", hidden: true }, el("div", { class: "bar" }), el("span", {}));
  const input = el("input", { type: "file", accept: "video/*,.mov,.mp4", multiple: true, hidden: true, onchange: e => upload([...e.target.files]) });
  const drop = el("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "העלאת סרטון", onclick: () => input.click(),
    onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } } },
    el("b", {}, "⬆ גוררים לכאן את הסרטון"), el("span", {}, "או לוחצים לבחירה מהמחשב · mp4 / mov · גם קבצים גדולים"), input);
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => upload([...e.dataTransfer.files]));
  async function upload(list) {
    for (const f of list) {
      prog.hidden = false;
      await new Promise(res => { const x = new XMLHttpRequest();
        x.open("POST", `/api/projects/${encodeURIComponent(S.pid)}/clips/${encodeURIComponent(S.cid)}/upload?name=${encodeURIComponent(f.name)}`);
        x.upload.onprogress = e => { const p = e.total ? Math.round(e.loaded / e.total * 100) : 0; prog.querySelector(".bar").style.width = p + "%"; prog.querySelector("span").textContent = `${f.name} · ${p}%`; };
        x.onload = () => { x.status < 300 ? toast("הועלה ✓ " + f.name) : toast("לא הועלה: " + ((JSON.parse(x.responseText || "{}") || {}).error || x.status), true); res(); };
        x.onerror = () => { toast("ההעלאה נכשלה", true); res(); }; x.send(f); });
    }
    prog.hidden = true; load();
  }
  const mb = n => (n / 1048576).toFixed(0) + "MB";
  const box = el("div", { class: "panel" },
    card("הסרטון שצילמת", drop, prog,
      files.length ? el("ul", { class: "files" }, files.map(f => el("li", {}, "🎬 ", el("b", {}, f.name), el("span", {}, " · " + mb(f.size))))) : null),
    card("או קישור לדרייב", el("p", { class: "lead" }, "קובץ או תיקייה בדרייב, עם הרשאת צפייה. הסוכן ימשוך משם."),
      links.length ? el("ul", { class: "files" }, links.map(l => el("li", {}, "🔗 ", el("a", { href: l, target: "_blank", rel: "noopener" }, l)))) : null,
      draftBox({ key: "link:" + c.id, rows: 1, placeholder: "https://drive.google.com/… ואז Enter",
        onSubmit: v => { if (!/^https?:\/\//.test(v)) { toast("צריך קישור שמתחיל ב-https", true); return false; } return capi("", { method: "PATCH", body: { links: [...links, v] } }).then(load).catch(fail); } })));
  const has = files.length || links.length; const busy = c.working.some(r => r.type === "storyboard");
  return { box, bar: { status: busy ? "⏳ " + WORK.storyboard + "…" : has ? "יש חומרים. הסוכן יכין סטוריבורד לאישור" : "מחכה לסרטון",
    primary: { label: busy ? "הסטוריבורד בהכנה…" : "החומרים כאן, תכינו סטוריבורד ←", disabled: !has || busy, onclick: () => ask("storyboard") } } };
}

/* ---------- 5 · storyboard ---------- */
function viewStoryboard(c) {
  const notes = c.notes.filter(n => n.stage === "storyboard" && n.kind === "note");
  const drafts = notes.filter(n => !n.sent);
  const box = el("div", { class: "panel" });
  if (c.summary || c.duration) box.append(card(null, c.summary ? el("p", { class: "lead" }, c.summary) : null, el("p", { class: "cut" }, [c.duration ? "כ-" + Math.round(c.duration) + " שניות" : "", c.format].filter(Boolean).join(" · "))));
  const ol = el("ol", { class: "script" });
  (c.script || []).forEach((ln, i) => {
    const open = S.openLine === i; const mine = notes.filter(n => n.line === i);
    const li = el("li", { class: "ln" + (open ? " open" : "") });
    li.append(el("button", { class: "lnbtn", type: "button", "aria-expanded": String(open), onclick: () => { S.openLine = open ? null : i; render(); } },
      el("span", { class: "tc" }, fmt(ln.t)),
      el("span", { class: "body" }, hl(ln.text, ln.kw),
        ln.events && ln.events.length ? el("span", { class: "ev" }, ln.events.map(e => el("span", { class: "k-" + e.type }, el("b", {}, TYPE[e.type] || e.type), e.label ? " · " + e.label : ""))) : null,
        ln.thumb ? el("span", { class: "thumbrow" }, el("img", { src: media(ln.thumb), alt: "", loading: "lazy" }), ln.thumbLabel || "") : null),
      el("span", { class: "plus", "aria-hidden": "true" }, mine.length ? "💬 " + mine.length : "+ הערה")));
    if (mine.length) li.append(el("ul", { class: "notes" }, mine.map(n => noteRow(n, { editable: true }))));
    if (open) li.append(draftBox({ key: `sb:${c.id}:${i}`, autofocus: true, placeholder: "מה לשנות בשורה הזו? Enter מוסיף",
      onSubmit: v => capi("/notes", { method: "POST", body: { stage: "storyboard", kind: "note", line: i, t: ln.t, text: v } }).then(() => { S.openLine = null; return load(); }).catch(fail) }));
    ol.append(li);
  });
  box.append(card("לוחצים על שורה כדי להעיר עליה", ol, c.cut ? el("p", { class: "cut" }, "יוצא מהסרטון: " + c.cut) : null));
  const general = notes.filter(n => n.line == null);
  box.append(card("הערה על כל הסטוריבורד", general.length ? el("ul", { class: "notes" }, general.map(n => noteRow(n, { editable: true }))) : null,
    draftBox({ key: "sbg:" + c.id, placeholder: "משהו כללי? Enter מוסיף", onSubmit: v => capi("/notes", { method: "POST", body: { stage: "storyboard", kind: "note", text: v } }).then(load).catch(fail) })));
  const busy = c.working[0];
  if (busy) return { box, bar: { status: "⏳ " + WORK[busy.type] + "…", primary: { label: "בעבודה…", disabled: true } } };
  if (drafts.length) return { box, bar: { status: `${drafts.length} הערות מוכנות. אפשר לערוך או למחוק עד השליחה`, primary: { label: `סיימתי להעיר, שלח לסוכן (${drafts.length}) ←`, onclick: () => ask("storyboard") } } };
  return { box, bar: { status: "הכל טוב? העריכה מתחילה עם האישור", primary: { label: "מאשר, תערכו ←", onclick: () => capi("/notes", { method: "POST", body: { stage: "storyboard", kind: "approve", text: "מאשר את הסטוריבורד" } }).then(() => { toast("אושר ✓ העריכה מתחילה"); return load(); }).catch(fail) } } };
}

/* ---------- 6 · editing / review ---------- */
function viewEditing(c) {
  const w = c.working[0];
  return { box: el("div", { class: "panel" }, card(null, el("div", { class: "waiting" }, el("div", { class: "spinner", "aria-hidden": "true" }),
    el("b", {}, "⏳ " + (w ? WORK[w.type] : "העריכה מתחילה")), el("span", {}, w && w.progress ? w.progress : "הגרסה תופיע כאן לבד. אפשר לסגור את הדף ולחזור.")))),
    bar: { status: "אין מה לעשות כרגע", primary: null } };
}
function viewReview(c) {
  const vs = (c.versions || []).slice().sort((a, b) => a.v - b.v);
  if (!vs.length) return viewEditing(c);
  if (S.v == null || !vs.some(x => x.v === S.v)) S.v = vs[vs.length - 1].v;
  const cur = vs.find(x => x.v === S.v); const latest = S.v === vs[vs.length - 1].v;
  const key = `vid:${c.id}:${S.v}`; const mode = S.mode[key] || "moment";
  const vNotes = c.notes.filter(n => n.stage === "video" && n.kind === "note" && n.v === S.v).sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  const drafts = vNotes.filter(n => !n.sent);
  const src = media(cur.file || cur.url);
  if (!S.vid || S.vid.src !== src) S.vid = { src, el: el("video", { id: "player", src, controls: true, playsinline: true, preload: "metadata" }) };
  const video = S.vid.el; const now = () => Math.round(video.currentTime * 10) / 10;
  const seek = t => { video.currentTime = t; video.pause(); };

  const bar = el("div", { class: "markers", "aria-label": "ההערות על ציר הזמן" }); const prog = el("div", { class: "prog" }); bar.append(prog);
  const place = () => { const d = video.duration || c.duration || 60; bar.querySelectorAll("button").forEach(b => b.remove());
    for (const n of vNotes.filter(n => n.t != null)) bar.append(el("button", { type: "button", class: n.sent ? (n.status === "done" ? "done" : "") : "draft", style: "left:" + Math.min(100, n.t / d * 100) + "%", title: fmt(n.t) + " · " + n.text.slice(0, 60), "aria-label": "הערה ב-" + fmt(n.t), onclick: () => seek(n.t) })); };
  video.onloadedmetadata = place; place();
  bar.addEventListener("click", e => { if (e.target !== bar || !video.duration) return; const r = bar.getBoundingClientRect(); video.currentTime = (e.clientX - r.left) / r.width * video.duration; });

  // explicit two-way switch: [בשנייה X | כל הסרטון]
  const momentBtn = el("button", { type: "button", class: "seg" + (mode === "moment" ? " on" : ""), "aria-pressed": String(mode === "moment"), onclick: () => { S.mode[key] = "moment"; render(); } });
  const wholeBtn = el("button", { type: "button", class: "seg" + (mode === "whole" ? " on" : ""), "aria-pressed": String(mode === "whole"), onclick: () => { S.mode[key] = "whole"; render(); } }, "כל הסרטון");
  const paint = () => { momentBtn.textContent = "בשנייה " + fmt(S.pin[key] ?? video.currentTime); };
  video.ontimeupdate = () => { prog.style.width = (video.currentTime / (video.duration || 1)) * 100 + "%"; if (video.paused) S.pin[key] = now(); paint(); };
  video.onseeked = () => { S.pin[key] = now(); paint(); };
  video.onplay = () => { delete S.pin[key]; };
  paint();
  const input = draftBox({ key, placeholder: mode === "moment" ? "מה לשנות ברגע הזה? מתחילים להקליד והסרטון נעצר · Enter מוסיף" : "הערה על כל הסרטון (מוזיקה, קצב, צבע…) · Enter מוסיף",
    prefix: el("div", { class: "segs", role: "group", "aria-label": "על מה ההערה" }, momentBtn, wholeBtn),
    onType: () => { if (mode === "moment") { if (!video.paused) video.pause(); if (S.pin[key] == null) S.pin[key] = now(); paint(); } },
    onSubmit: v => capi("/notes", { method: "POST", body: { stage: "video", kind: "note", v: S.v, t: mode === "moment" ? (S.pin[key] ?? now()) : null, text: v } }).then(load).catch(e => { fail(e); return false; }) });

  const prevV = vs.length > 1 && latest ? vs[vs.length - 2].v : null;
  const prev = prevV != null ? c.notes.filter(n => n.stage === "video" && n.kind === "note" && n.v === prevV) : [];
  const box = el("div", { class: "panel review" },
    vs.length > 1 ? el("div", { class: "vtabs", role: "tablist", "aria-label": "גרסאות" }, vs.slice().reverse().map(x => el("button", { class: "vtab", role: "tab", type: "button", "aria-selected": String(x.v === S.v), onclick: () => { S.v = x.v; render(); } }, "גרסה " + x.v + (x.v === vs[vs.length - 1].v ? " · חדשה" : "")))) : null,
    cur.changes ? el("p", { class: "changes" }, "מה השתנה בגרסה הזו: " + cur.changes) : null,
    el("div", { class: "split" },
      el("div", { class: "stage-col" }, video, bar, latest ? input : el("p", { class: "cut" }, "זו גרסה ישנה, לצפייה בלבד. הערות כותבים על הגרסה החדשה."),
        el("p", { class: "kbd" }, "רווח: נגן/עצור · ← →: שנייה · N: הערה")),
      el("aside", { class: "notes-col", "aria-label": "ההערות" },
        el("h3", {}, "ההערות על גרסה " + S.v + (vNotes.length ? ` (${vNotes.length})` : "")),
        vNotes.length ? el("ul", { class: "notes" }, vNotes.map(n => noteRow(n, { seek, editable: latest })))
          : el("p", { class: "empty" }, latest ? "עוד אין הערות. צופים, ובכל רגע שצריך לשנות פשוט מתחילים לכתוב." : "לא היו הערות על הגרסה הזו."),
        prev.length ? el("details", { class: "prev" }, el("summary", {}, `ההערות מגרסה ${prevV} ומה נעשה בהן (${prev.length})`), el("ul", { class: "notes" }, prev.map(n => noteRow(n, { seek: null, editable: false })))) : null)));
  const busy = c.working[0];
  let barCfg;
  if (busy) barCfg = { status: "⏳ " + WORK[busy.type] + (busy.progress ? " · " + busy.progress : "") + "…", primary: { label: "הגרסה הבאה בדרך…", disabled: true } };
  else if (!latest) barCfg = { status: "צופים בגרסה " + S.v, primary: { label: "לגרסה החדשה ←", onclick: () => { S.v = null; render(); } } };
  else if (drafts.length) barCfg = { status: `${drafts.length} הערות מוכנות · אפשר לערוך ✎ או למחוק 🗑 עד השליחה`, primary: { label: `סיימתי להעיר, שלח הכל לעריכה (${drafts.length}) ←`, onclick: () => ask("fix") } };
  else barCfg = { status: "אין הערות? אז הגרסה הזו מוכנה", primary: { label: "הכל טוב, מאשר את הגרסה ✓", onclick: () => capi("/notes", { method: "POST", body: { stage: "video", kind: "approve", v: S.v, text: "מאשר את גרסה " + S.v } }).then(() => { toast("אושר ✓"); S.view = null; return load(); }).catch(fail) } };
  return { box, bar: barCfg };
}

/* ---------- 7 · done ---------- */
function viewDone(c) {
  const vs = (c.versions || []).slice().sort((a, b) => a.v - b.v); const last = vs[vs.length - 1] || {};
  const dl = (label, f) => f ? el("a", { class: "btn", href: media(f) + "?download=1" }, "⬇ " + label) : null;
  const post = c.post || ""; const writing = c.working.some(r => r.type === "post");
  return { box: el("div", { class: "panel" },
    card("הסרטון מוכן 🎉", el("p", { class: "lead" }, "גרסה " + (last.v || "") + " אושרה."),
      el("div", { class: "row" }, dl("4:5 ללינקדאין", last.final || last.file), dl("9:16 לאינסטגרם", last.final916 || last.file916))),
    card("פוסט ללינקדאין", post ? el("div", {}, el("pre", { class: "post" }, post), el("button", { class: "btn", type: "button", onclick: () => (navigator.clipboard ? navigator.clipboard.writeText(post) : Promise.reject()).then(() => toast("הועתק ✓"), () => toast("סמנו והעתיקו ידנית")) }, "העתקה"))
      : el("div", {}, el("p", { class: "lead" }, "הסוכן יכתוב טיוטת פוסט בקול שלך שמלווה את הסרטון."), el("button", { class: "btn", type: "button", disabled: writing || null, onclick: () => ask("post") }, writing ? "⏳ בכתיבה…" : "תכתוב לי פוסט")))),
    bar: { status: "", primary: { label: "סרטון חדש +", onclick: newClip } } };
}

/* ---------- shell ---------- */
function modal(title, placeholder, onOk) {
  const inp = el("input", { type: "text", placeholder, "aria-label": title });
  const close = () => dlg.remove();
  const ok = () => { const v = inp.value.trim(); if (!v) return inp.focus(); close(); onOk(v); };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") ok(); if (e.key === "Escape") close(); });
  const dlg = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, onclick: e => { if (e.target === dlg) close(); } },
    el("div", { class: "modal-box" }, el("h3", {}, title), inp, el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn ghost", type: "button", onclick: close }, "ביטול"), el("button", { class: "btn primary", type: "button", onclick: ok }, "יצירה"))));
  document.body.append(dlg); setTimeout(() => inp.focus(), 0);
}
function newClip() { modal("סרטון חדש", "שם עבודה, למשל: למה עזבתי משכורת", async t => { const r = await api("/clips", { method: "POST", body: { title: t } }).catch(fail); if (r) { S.cid = r.id; store.set("studio.clip." + S.pid, r.id); S.view = null; await load(); } }); }
function newProject() { modal("פרויקט חדש", "סדרה או נושא, למשל: סבא והדרך", async t => { const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }) }).then(r => r.json()).catch(fail); if (r && r.id) { S.cfg = await (await fetch("/api/config")).json(); openProject(r.id); } }); }

function render() {
  const app = $("#app"); if (!S.cfg) return;
  const projects = S.cfg.projects || [];
  if (!projects.length) { app.replaceChildren(card("ברוכים הבאים לסטודיו", el("p", { class: "lead" }, "פרויקט הוא סדרה או נושא. בתוכו כל סרטון עובר 7 שלבים: רעיון, תסריט, צילום, חומרים, סטוריבורד, סרטון, מוכן."), el("button", { class: "btn primary big", type: "button", onclick: newProject }, "פרויקט חדש +"))); return; }
  if (!S.p) { app.replaceChildren(el("div", { class: "status" }, "טוען…")); return; }
  const clips = S.p.clips.slice().sort((a, b) => (a.order ?? a.n ?? 0) - (b.order ?? b.n ?? 0));
  if (!clips.some(c => c.id === S.cid)) S.cid = store.get("studio.clip." + S.pid); if (!clips.some(c => c.id === S.cid)) S.cid = clips[0] && clips[0].id;

  const act = document.activeElement; const focusKey = act && act.dataset ? act.dataset.key : null; const caret = focusKey ? act.selectionStart : null;
  const oldV = $("#player"); const wasPlaying = oldV && !oldV.paused; const y = window.scrollY;

  const head = el("div", { class: "projhead" },
    el("div", { class: "projpick" }, el("label", { for: "projsel" }, "פרויקט"),
      el("select", { id: "projsel", onchange: e => e.target.value === "__new" ? (e.target.value = S.pid, newProject()) : openProject(e.target.value) },
        projects.map(p => el("option", { value: p.id, selected: p.id === S.pid || null }, p.title || p.id)), el("option", { value: "__new" }, "+ פרויקט חדש…"))),
    el("nav", { class: "clips", "aria-label": "סרטונים" }, clips.map(x => el("button", { class: "clipbtn", type: "button", "aria-current": String(x.id === S.cid),
      onclick: () => { S.cid = x.id; store.set("studio.clip." + S.pid, x.id); S.view = null; S.v = null; S.openLine = null; S.scriptEdit = null; render(); } },
      el("span", { class: "t" }, x.title || x.id), el("span", { class: "chip " + (x.stage === "done" ? "ok" : x.working.length ? "work" : "wait") }, x.working.length ? "⏳ בעבודה" : STAGE_CHIP[x.stage]))),
      el("button", { class: "clipbtn add", type: "button", onclick: newClip }, "+ סרטון חדש")));
  const c = clip();
  if (!c) { app.replaceChildren(head, card(null, el("p", { class: "lead" }, "אין עדיין סרטונים בפרויקט."), el("button", { class: "btn primary", type: "button", onclick: newClip }, "+ סרטון חדש"))); return; }

  const cur = STEP_OF[c.stage]; const view = S.view ?? c.stage; const vstep = STEP_OF[view];
  const stepper = el("ol", { class: "stepper", "aria-label": "שלבי הסרטון" }, STEPS.map(([k, label], i) => {
    const state = i < cur ? "past" : i === cur ? "now" : "future"; const viewing = i === vstep;
    return el("li", { class: state + (viewing ? " viewing" : "") }, el("button", { type: "button", disabled: state === "future" || null, "aria-current": viewing ? "step" : null,
      title: state === "future" ? "ייפתח כשנגיע לשלב הזה" : null,
      onclick: () => { S.view = i === cur ? null : k; render(); } },
      el("span", { class: "dot" }, state === "past" ? "✓" : String(i + 1)), el("span", { class: "lbl" }, label)));
  }));
  const V = { idea: viewIdea, script: viewScript, shoot: viewShoot, footage: viewFootage, storyboard: viewStoryboard, editing: viewEditing, review: viewReview, done: viewDone }[view] || viewIdea;
  let out; try { out = V(c); } catch (e) { console.error(e); out = { box: card(null, el("p", { class: "lead" }, "השלב הזה דולג בסרטון הזה.")), bar: {} }; }
  const peeking = STEP_OF[view] < cur && view !== c.stage;
  const frag = document.createDocumentFragment();
  frag.append(head, el("div", { class: "clipttl" }, el("h2", {}, c.title || ""), stepper));
  if (peeking) frag.append(el("div", { class: "peek" }, "מציצים בשלב שכבר עבר. ", el("button", { class: "btn ghost", type: "button", onclick: () => { S.view = null; render(); } }, "חזרה לשלב הנוכחי ←")));
  frag.append(out.box);
  frag.append(peeking ? actionBar({ status: "מציצים בשלב קודם", primary: { label: "חזרה לשלב הנוכחי ←", onclick: () => { S.view = null; render(); } } }) : actionBar(out.bar || {}));
  app.replaceChildren(frag);

  const v = $("#player"); if (v && v === oldV && wasPlaying) v.play().catch(() => {});
  if (focusKey) { const ta = app.querySelector(`[data-key="${CSS.escape(focusKey)}"]`); if (ta) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(caret, caret); } catch {} } }
  window.scrollTo(0, y);
}

async function load() { if (!S.pid) return; try { S.p = await api(""); } catch (e) { console.error(e); } render(); }
async function openProject(id) { S.pid = id; store.set("studio.project", id); S.p = null; S.cid = null; S.view = null; S.v = null; render(); await load(); }
function applyBrand(b) {
  const tok = o => Object.entries(o || {}).map(([k, v]) => `--${k}:${v}`).join(";");
  $("#brand-tokens").textContent = `:root{${tok(b.light)};--brand-font:"${(b.font && b.font.family) || "system-ui"}"}
@media (prefers-color-scheme:dark){:root{${tok(b.dark || b.light)};color-scheme:dark}}`;
  if (b.font && b.font.css) document.head.append(el("link", { rel: "stylesheet", href: b.font.css }));
  const logo = b.logo || {}; const box = $("#brand"); box.replaceChildren();
  if (logo.light) box.append(el("img", { class: "logo-light", src: "/brand/" + logo.light, alt: b.name || "" }));
  if (logo.dark || logo.light) box.append(el("img", { class: "logo-dark", src: "/brand/" + (logo.dark || logo.light), alt: b.name || "" }));
  box.append(el("span", { class: "sep", "aria-hidden": "true" }), el("h1", {}, "הסטודיו"));
  document.title = "הסטודיו" + (b.name ? " · " + b.name : "");
}
// review keyboard: space play/pause, arrows ±1s, N = new note (never while typing)
document.addEventListener("keydown", e => {
  const v = $("#player"); const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
  if (!v || typing || $(".modal")) return;
  if (e.code === "Space") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  else if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 1);
  else if (e.key === "ArrowRight") v.currentTime = v.currentTime + 1;
  else if (e.key === "n" || e.key === "N" || e.key === "מ") { const ta = $(".stage-col textarea"); if (ta) { e.preventDefault(); v.pause(); ta.focus(); } }
});
async function boot() {
  S.cfg = await (await fetch("/api/config")).json(); applyBrand(S.cfg.brand || {});
  const ps = S.cfg.projects || []; const want = store.get("studio.project");
  if (ps.length) await openProject(ps.some(p => p.id === want) ? want : ps[0].id); else render();
  new EventSource("/api/events").addEventListener("changed", async () => { S.cfg = await (await fetch("/api/config")).json(); await load(); });
}
boot().catch(e => { $("#app").replaceChildren(el("div", { class: "status" }, "השרת לא עונה. לוודא שהחלון עם npm start עדיין פתוח.")); console.error(e); });
})();
