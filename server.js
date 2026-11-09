// OctaLoom Studio: local server. Zero dependencies (Node 18+).
// One project = a series; one clip = one video that walks through 7 stages (see docs/UX.md).
// Files are the contract with the agent (see AGENTS.md):
//   clips/<id>.json       agent-owned  (scripts, storyboard, versions)
//   clips/<id>.user.json  studio-owned (idea, chosen/edited script, stage marks)
//   notes/<id>.json       studio appends notes; agent sets status/reply
//   inbox.json            studio appends requests; agent sets status/progress
//   source/<id>/          raw footage uploaded from the studio
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec, execFile } = require("child_process");

const ROOT = __dirname;
const CONFIG = readJSON(path.join(ROOT, "room.config.json"), {});
const PORT = Number(process.env.PORT || CONFIG.port || 4321);
const BRAND = process.env.ROOM_BRAND || CONFIG.brand || "mplifyai";
const PROJECTS = path.resolve(ROOT, process.env.ROOM_PROJECTS || CONFIG.projectsDir || "projects");
const PUBLIC = path.join(ROOT, "public");
const BRANDS = path.join(ROOT, "brands");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2" };
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|hevc)$/i;

function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n"); fs.renameSync(tmp, file); }
function safeJoin(base, rel) { const p = path.resolve(base, "." + path.sep + rel); return p === base || p.startsWith(base + path.sep) ? p : null; }
const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const slug = s => (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "v") + "-" + crypto.randomUUID().slice(0, 4);
const now = () => new Date().toISOString();

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: "not found" });
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;
    const dl = new URL(req.url, "http://x").searchParams.get("download");
    const extra = dl ? { "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(file))}"` } : {};
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : st.size - 1;
      if (start >= st.size || end >= st.size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...extra });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache", ...extra });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- model ----------
const P = pid => path.join(PROJECTS, pid);
function listProjects() {
  if (!fs.existsSync(PROJECTS)) return [];
  return fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter(d => d.isDirectory() && ID.test(d.name) && fs.existsSync(path.join(PROJECTS, d.name, "project.json")))
    .map(d => Object.assign({ id: d.name }, readJSON(path.join(PROJECTS, d.name, "project.json"), {})))
    .sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
}
function footage(pid, cid) {
  const dir = path.join(P(pid), "source", cid);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => VIDEO_EXT.test(f) && !f.startsWith(".")).map(f => {
    const st = fs.statSync(path.join(dir, f)); return { name: f, file: `source/${cid}/${f}`, size: st.size, at: st.mtime.toISOString() }; }) : [];
  return files;
}
// The stage is derived from what exists, so the studio and the agent never disagree.
function stageOf(c, u, notes, inbox) {
  const pending = t => inbox.some(r => r.clip === c.id && r.type === t && r.status !== "done");
  if (u.done) return "done";
  if ((c.versions || []).length) {
    const last = Math.max(...c.versions.map(v => v.v));
    return notes.some(n => n.kind === "approve" && n.stage === "video" && n.v === last) ? "done" : "review";
  }
  const sbApproved = notes.some(n => n.kind === "approve" && n.stage === "storyboard");
  if ((c.script || []).length) return sbApproved ? "editing" : "storyboard";
  if (footage(c.project, c.id).length || (u.links || []).length || u.shot) return "footage";
  if (u.scriptFinal && u.scriptFinal.length) return "shoot";
  if ((c.scripts || []).length) return "script";
  return "idea";
}
function loadProject(pid) {
  const dir = P(pid);
  const project = readJSON(path.join(dir, "project.json"), null);
  if (!project) return null;
  const inbox = readJSON(path.join(dir, "inbox.json"), []).map(r => ({ type: "fix", ...r }));   // requests from before typed requests were fixes
  const clipsDir = path.join(dir, "clips");
  const clips = fs.existsSync(clipsDir) ? fs.readdirSync(clipsDir).filter(f => f.endsWith(".json") && !f.endsWith(".user.json")).map(f => {
    const id = f.replace(/\.json$/, "");
    const c = Object.assign({ id, project: pid }, readJSON(path.join(clipsDir, f), {}));
    const u = readJSON(path.join(clipsDir, id + ".user.json"), {});
    const notes = readJSON(path.join(dir, "notes", id + ".json"), []);
    return { ...c, user: u, notes, footage: footage(pid, id), stage: stageOf(c, u, notes, inbox),
             working: inbox.filter(r => r.clip === id && r.status !== "done") };
  }) : [];
  return { id: pid, ...project, clips };
}

function readBody(req, max = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > max) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } });
  });
}
function request(pid, clip, type, extra = {}) {
  const f = path.join(P(pid), "inbox.json"); const q = readJSON(f, []);
  const r = { id: crypto.randomUUID().slice(0, 8), type, clip, at: now(), status: "new", progress: "", ...extra };
  q.push(r); writeJSON(f, q); return r;
}

// ---------- live reload (SSE) ----------
const clients = new Set();
let pending = null;
function broadcast() { clearTimeout(pending); pending = setTimeout(() => { for (const r of clients) r.write("event: changed\ndata: {}\n\n"); }, 150); }
try { fs.mkdirSync(PROJECTS, { recursive: true }); fs.watch(PROJECTS, { recursive: true }, (_e, f) => { if (f && !String(f).endsWith(".tmp") && !String(f).includes(".part")) broadcast(); }); }
catch { setInterval(broadcast, 5000); }

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const M = req.method;
  try {
    if (M === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 2000\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    if (M === "GET" && url.pathname === "/api/config") {
      const brand = readJSON(path.join(BRANDS, BRAND, "brand.json"), {});
      return send(res, 200, { brand: { id: BRAND, ...brand }, projects: listProjects() });
    }
    if (M === "POST" && url.pathname === "/api/projects") {          // new project (series)
      const b = await readBody(req); const title = String(b.title || "").trim().slice(0, 120); if (!title) return send(res, 400, { error: "title" });
      const id = slug(title); writeJSON(path.join(P(id), "project.json"), { title, updated: now() }); return send(res, 201, { id });
    }
    if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
      const pid = parts[2]; if (!ID.test(pid) || !fs.existsSync(P(pid))) return send(res, 404, { error: "no such project" });
      const sub = parts[3], cid = parts[4], act = parts[5];
      if (M === "GET" && !sub) { const p = loadProject(pid); return p ? send(res, 200, p) : send(res, 404, { error: "no such project" }); }

      if (M === "POST" && sub === "clips" && !cid) {                    // new video
        const b = await readBody(req); const title = String(b.title || "").trim().slice(0, 120) || "סרטון חדש";
        const clips = loadProject(pid).clips; const id = slug(title);
        writeJSON(path.join(P(pid), "clips", id + ".json"), { title, n: clips.length + 1, order: clips.length + 1, versions: [] });
        writeJSON(path.join(P(pid), "clips", id + ".user.json"), {}); return send(res, 201, { id });
      }
      if (sub === "clips" && cid) {
        if (!ID.test(cid) || !fs.existsSync(path.join(P(pid), "clips", cid + ".json"))) return send(res, 404, { error: "no such clip" });
        const uf = path.join(P(pid), "clips", cid + ".user.json");
        if (M === "PATCH" && !act) {                                    // studio-owned fields only
          const b = await readBody(req); const u = readJSON(uf, {});
          for (const k of ["idea", "scriptChoice", "scriptFinal", "links", "shot", "done", "teleprompter"]) if (k in b) u[k] = b[k];
          u.updated = now(); writeJSON(uf, u); return send(res, 200, u);
        }
        if (M === "POST" && act === "request") {                         // a primary button that hands work to the agent
          const b = await readBody(req); const type = String(b.type || "");
          if (!["script", "scripts-more", "storyboard", "edit", "fix", "post"].includes(type)) return send(res, 400, { error: "type" });
          let notesSent = [];
          if (["fix", "storyboard", "scripts-more", "edit"].includes(type)) {        // sending also locks the drafts
            const nf = path.join(P(pid), "notes", cid + ".json"); const list = readJSON(nf, []); const at = now();
            for (const n of list) if (!n.sent && n.kind === "note") { n.sent = at; notesSent.push(n.id); }
            if (notesSent.length) writeJSON(nf, list);
          }
          return send(res, 201, request(pid, cid, type, { notes: notesSent, message: String(b.message || "").slice(0, 2000) }));
        }
        if (M === "POST" && act === "upload") {                          // raw footage, streamed to disk
          const name = path.basename(String(url.searchParams.get("name") || "")).replace(/[^\w.\-א-ת ]+/g, "_");
          if (!VIDEO_EXT.test(name)) return send(res, 400, { error: "רק קבצי וידאו (mp4 / mov)" });
          const dir = path.join(P(pid), "source", cid); fs.mkdirSync(dir, { recursive: true });
          const final = path.join(dir, name), part = final + ".part"; const ws = fs.createWriteStream(part);
          req.pipe(ws); ws.on("finish", () => { fs.renameSync(part, final); send(res, 201, { name }); });
          ws.on("error", e => send(res, 500, { error: String(e) })); return;
        }
        if (M === "POST" && act === "notes") {
          const b = await readBody(req);
          const kind = ["note", "approve", "choice"].includes(b.kind) ? b.kind : "note";
          const text = String(b.text || "").trim().slice(0, 4000); if (!text) return send(res, 400, { error: "empty note" });
          const num = v => (v === null || v === undefined || v === "" || !isFinite(+v)) ? null : Math.round(+v * 10) / 10;
          const note = { id: crypto.randomUUID().slice(0, 8), clip: cid, stage: ["video", "script"].includes(b.stage) ? b.stage : "storyboard", kind,
            v: num(b.v), t: num(b.t), line: Number.isInteger(b.line) ? b.line : null, script: b.script ? String(b.script).slice(0, 40) : undefined,
            choiceKey: b.choiceKey ? String(b.choiceKey).slice(0, 60) : undefined, value: b.value ? String(b.value).slice(0, 60) : undefined,
            text, author: String(b.author || CONFIG.reviewer || "").trim().slice(0, 60), at: now(),
            status: kind === "note" ? "open" : "done", reply: "", sent: kind === "note" ? undefined : now() };
          const file = path.join(P(pid), "notes", cid + ".json"); const list = readJSON(file, []); list.push(note); writeJSON(file, list);
          if (kind === "approve" && note.stage === "storyboard") request(pid, cid, "edit");
          return send(res, 201, note);
        }
        if ((M === "PATCH" || M === "DELETE") && act === "notes" && parts[6]) {   // drafts only: edit or remove
          const file = path.join(P(pid), "notes", cid + ".json"); const list = readJSON(file, []);
          const i = list.findIndex(n => n.id === parts[6]); if (i < 0) return send(res, 404, { error: "no such note" });
          if (list[i].sent) return send(res, 409, { error: "ההערה כבר נשלחה" });
          if (M === "DELETE") list.splice(i, 1); else { const b = await readBody(req); list[i].text = String(b.text || "").trim().slice(0, 4000) || list[i].text; if ("t" in b) list[i].t = b.t; }
          writeJSON(file, list); return send(res, 200, { ok: true });
        }
      }
    }
    if (M === "GET" && parts[0] === "media" && parts[1] && ID.test(parts[1])) {
      const f = safeJoin(P(parts[1]), parts.slice(2).join("/")); return f ? serveFile(req, res, f) : send(res, 400, { error: "bad path" });
    }
    if (M === "GET" && parts[0] === "brand") {
      const f = safeJoin(path.join(BRANDS, BRAND), parts.slice(1).join("/")); return f ? serveFile(req, res, f) : send(res, 400, { error: "bad path" });
    }
    if (M === "GET") {
      const f = safeJoin(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname.slice(1)); return f ? serveFile(req, res, f) : send(res, 404, { error: "not found" });
    }
    send(res, 405, { error: "method not allowed" });
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
});

server.listen(PORT, "127.0.0.1", () => {
  const u = `http://localhost:${PORT}`;
  console.log(`\n  הסטודיו פתוח: ${u}\n  (לעצור: Ctrl+C)\n`);
  if (!process.env.NO_OPEN) exec((process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open") + " " + u);
});
