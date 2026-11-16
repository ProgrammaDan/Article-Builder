'use strict';
// Media on the web, used by its address instead of a file in the folder: a link straight to a picture or video file
// (a Cloudflare R2 public address, say), or a YouTube video. A cell holding one has the address as its path, and
// mediaOf() answers for both kinds of path, so most of the code treats a link like a file. Links are not in the media
// panel and are not copied by Export: the published page loads them from where they are.

/* ---------- Reading an address ---------- */
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
// Seconds from a YouTube "t" or "start" value: 90, 90s, 1m30s or 1h2m3s.
function ytSeconds(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}
// A YouTube video's id, start time and shape from any of the addresses YouTube hands out (watch, youtu.be, shorts,
// embed, live), with the one standard address it is kept under. Null if the address is not a YouTube video.
function youTubeOf(u) {
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null, tall = false;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) { id = parts[1]; tall = parts[0] === 'shorts'; }
  } else return null;
  if (!id || !YT_ID.test(id)) return null;
  const start = ytSeconds(u.searchParams.get('t') || u.searchParams.get('start'));
  return { id, tall, start, path: tall ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}` };
}
const fileOf = (u) => { const last = u.pathname.split('/').pop(); try { return decodeURIComponent(last); } catch { return last; } };
// Reads an address the author typed or pasted. Returns { path }, the address to keep (a YouTube one in its standard
// form), or { error } saying in plain words what is wrong with it. A file is told apart from a page by its name, so a
// link has to end in a picture or video file's name.
function readLink(text) {
  let s = String(text || '').trim();
  if (!s) return { error: 'Paste or type an address first.' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { return { error: 'That isn’t a web address.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Only web addresses (starting https://) can be used.' };
  if (!/^[a-z0-9.-]+$/i.test(u.hostname)) return { error: 'That isn’t a web address.' };   // a space in the site's name, say
  const yt = youTubeOf(u);
  if (yt) return { path: yt.path };
  if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(u.hostname)) return { error: 'That YouTube address isn’t one video. Use the video’s own address, or the link from its Share button.' };
  const kind = kindOf(fileOf(u));
  if (kind === 'image' || kind === 'video') return { path: u.href };
  if (kind === 'unsupported') return { error: `Browsers can’t show .${ext(fileOf(u))} files. Convert it to JPG or MP4 first.` };
  return { error: 'That address doesn’t end in the name of a picture or video file (.jpg, .png, .mp4 and so on). Use the address of the file itself, not of a page that shows it.' };
}

/* ---------- What a path refers to ---------- */
const linkCache = new Map();
// A link path as a media item, like the ones scanMedia makes for files: { path, name, host, kind, link: true }, kind
// being 'image', 'video' or 'youtube'; a YouTube one also has id, start and tall. Null if the path is not a usable
// address (a file's path, or something hand-edited into project.json).
function linkMedia(path) {
  if (typeof path !== 'string' || !/^https?:\/\//i.test(path)) return null;
  if (linkCache.has(path)) return linkCache.get(path);
  let m = null;
  try {
    const u = new URL(path), yt = youTubeOf(u);
    if (yt) m = { path, name: 'YouTube video', host: 'youtube.com', kind: 'youtube', link: true, id: yt.id, start: yt.start, tall: yt.tall };
    else { const kind = kindOf(fileOf(u)); if (kind === 'image' || kind === 'video') m = { path, name: fileOf(u), host: u.hostname, kind, link: true }; }
  } catch {}
  linkCache.set(path, m); return m;
}
// The media item a cell's path refers to: a file in the folder, or a link. Null for a file that has gone missing.
const mediaOf = (path) => S.mediaByPath.get(path) || linkMedia(path);
// A picture's or video's size: as measured once loaded, or for YouTube the shape of its player.
function dimsOf(path) {
  const m = linkMedia(path);
  if (m && m.kind === 'youtube') return m.tall ? { w: 9, h: 16 } : { w: 16, h: 9 };
  return S.dims.get(path);
}
const ytThumb = (m) => `https://i.ytimg.com/vi/${m.id}/hqdefault.jpg`;
// Whether a link loads: a picture or a video's first details arrive within ten seconds. A video's size and length are
// kept, so that a short clip can start as a Loop. YouTube is not checked.
function tryLink(path) {
  const m = linkMedia(path);
  if (!m) return Promise.resolve(false);
  if (m.kind === 'youtube') return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const end = (ok) => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => end(false), 10000);
    if (m.kind === 'image') {
      const img = new Image();
      img.onload = () => { if (img.naturalWidth) S.dims.set(path, { w: img.naturalWidth, h: img.naturalHeight }); end(!!img.naturalWidth); };
      img.onerror = () => end(false);
      img.src = path;
    } else {
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      v.addEventListener('loadedmetadata', () => {
        if (v.videoWidth) S.dims.set(path, { w: v.videoWidth, h: v.videoHeight });
        if (isFinite(v.duration)) S.durations.set(path, v.duration);
        end(true);
      }, { once: true });
      v.addEventListener('error', () => end(false), { once: true });
      v.src = path;
    }
  });
}

/* ---------- Asking for one ---------- */
let linkTarget = null;   // where the link goes: { rowId, cellId } of an empty cell, or null for a new row at the end
function askForLink(target = null) {
  linkTarget = target;
  $('#linkInput').value = ''; linkProblem('');
  $('#linkDialog').showModal(); $('#linkInput').focus();
}
// Shows what is wrong, or clears it. anywayFor turns the button into "Add anyway" for that very address.
function linkProblem(msg, anywayFor = '') {
  $('#linkErr').textContent = msg; $('#linkErr').hidden = !msg;
  const btn = $('#linkAddBtn');
  btn.dataset.anyway = anywayFor; btn.textContent = anywayFor ? 'Add anyway' : 'Add';
}
async function addLink() {
  const btn = $('#linkAddBtn'), r = readLink($('#linkInput').value);
  if (r.error) { linkProblem(r.error); $('#linkInput').focus(); return; }
  if (btn.dataset.anyway !== r.path) {
    btn.disabled = true; btn.textContent = 'Checking…';
    const ok = await tryLink(r.path);
    btn.disabled = false;
    if (!$('#linkDialog').open) return;            // closed while it was checking
    if (!ok) { linkProblem('That address didn’t load. Check that it is spelled right and that the file is public. If it should work, press “Add anyway”.', r.path); return; }
  }
  $('#linkDialog').close();
  const target = linkTarget; linkTarget = null;
  if (target) await placeMedia(target.rowId, target.cellId, r.path);
  else await appendMediaRows([r.path]);
}
function setupLinks() {
  $('#addLinkBtn').addEventListener('click', () => askForLink());
  $('#linkCancelBtn').addEventListener('click', () => $('#linkDialog').close());
  $('#linkAddBtn').addEventListener('click', addLink);
  $('#linkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
  $('#linkInput').addEventListener('input', () => { if (!$('#linkErr').hidden || $('#linkAddBtn').dataset.anyway) linkProblem(''); });
}
