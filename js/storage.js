'use strict';
// Reading and writing the project folder, and remembering it between visits.

/* ---------- IndexedDB (remembers the last folder) ---------- */
const idb = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('article-builder', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  },
};

/* ---------- File system ---------- */
async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(text); await w.close();
}
async function readText(dir, name) {
  try { const fh = await dir.getFileHandle(name); return await (await fh.getFile()).text(); }
  catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
}
async function ensurePath(root, relPath) {   // creates parent folders, returns {dir, name}
  const parts = relPath.split('/'); const name = parts.pop(); let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  return { dir, name };
}
async function fileExists(dir, name) { try { await dir.getFileHandle(name); return true; } catch { return false; } }

async function scanMedia() {
  const out = [];
  async function walk(dir, prefix, depth) {
    if (depth > 8) return;
    const entries = [];
    for await (const entry of dir.entries()) entries.push(entry);
    for (const [name, handle] of entries) {
      if (name.startsWith('.')) continue;
      const path = prefix ? prefix + '/' + name : name;
      if (handle.kind === 'directory') {
        if (!prefix && (name === EXPORT_DIR || name === 'node_modules')) continue;
        await walk(handle, path, depth + 1);
      } else {
        const kind = kindOf(name);
        if (kind) out.push({ path, name, dir: prefix, kind, handle });
      }
    }
  }
  await walk(S.root, '', 0);
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  out.sort((a, b) => coll.compare(a.dir, b.dir) || coll.compare(a.name, b.name));
  S.media = out; S.mediaByPath = new Map(out.map((m) => [m.path, m]));
}

// The address to load a path's picture or video from: a blob URL for a file in the folder, the link itself for a link.
function getURL(path) {
  const link = linkMedia(path); if (link) return Promise.resolve(link.kind === 'youtube' ? null : path);
  if (S.urls.has(path)) return S.urls.get(path);
  const m = S.mediaByPath.get(path); if (!m) return Promise.resolve(null);
  const p = m.handle.getFile().then((f) => URL.createObjectURL(f)).catch(() => { S.urls.delete(path); return null; });
  S.urls.set(path, p); return p;
}
