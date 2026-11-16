'use strict';
// Writes the finished pages and their media into the project folder's export/ folder.

/* ---------- Export ---------- */
async function readJSON(dir, name) { try { const t = await readText(dir, name); return t ? JSON.parse(t) : null; } catch { return null; } }
async function pruneMedia(exportDir, keep) {
  let mediaDir; try { mediaDir = await exportDir.getDirectoryHandle('media'); } catch { return; }
  async function walk(dir, prefix) {
    const entries = []; for await (const e of dir.entries()) entries.push(e);
    let kept = 0;
    for (const [name, handle] of entries) {
      const key = prefix + '/' + name;
      if (handle.kind === 'directory') {
        if (await walk(handle, key)) kept++; else await dir.removeEntry(name, { recursive: true });
      } else if (keep.has(key)) kept++;
      else await dir.removeEntry(name);
    }
    return kept;
  }
  await walk(mediaDir, 'media');
}
// The Export button asks first, so that a stray click doesn't overwrite the last export. Cancel has the focus, so a
// stray Enter doesn't either; Escape cancels as well.
function confirmExport() {
  const n = S.project.pages.length;
  $('#exportConfirmText').replaceChildren(`This writes the ${n > 1 ? `article’s ${n} pages` : 'page'} and ${n > 1 ? 'their' : 'its'} media into `, h('code', {}, `${S.root.name}/${EXPORT_DIR}/`), ', replacing what the last export put there.');
  $('#exportConfirm').showModal();
  $('#exportCancelBtn').focus();
}
async function exportArticle() {
  flushEdit(); await saveNow();
  const dlg = $('#exportDialog'), bodyEl = $('#exportBody'), prog = $('#exportProg'), closeBtn = $('#exportCloseBtn');
  $('#exportTitle').textContent = 'Exporting';
  bodyEl.replaceChildren(h('p', {}, 'Preparing…')); prog.hidden = false; prog.value = 0; closeBtn.disabled = true;
  dlg.showModal();
  const say = (msg) => bodyEl.replaceChildren(h('p', {}, msg));
  try {
    const allUsed = [...usedPaths()];
    const used = allUsed.filter((p) => S.mediaByPath.has(p));
    const missing = allUsed.filter((p) => !mediaOf(p));
    const links = allUsed.filter((p) => linkMedia(p));   // loaded from the web by the published page, so not copied
    // Only "Player" videos show a still frame before playing; loops start on their own. Slideshow videos get one too,
    // so opening a slideshow doesn't download every clip in it.
    const videos = [...new Set(allRows(S.project).flatMap((r) => (r.type === 'grid' ? r.cells : []))
      .flatMap((c) => (c.kind === 'media' && c.video.mode === 'player' ? [c.path] : c.kind === 'slides' ? c.slides.map((s) => s.path) : []))
      .filter((path) => S.mediaByPath.has(path) && S.mediaByPath.get(path).kind === 'video'))];
    const steps = used.length + videos.length + 2; let step = 0;
    const tick = () => { prog.value = ++step / steps; };

    const exp = await S.root.getDirectoryHandle(EXPORT_DIR, { create: true });
    const oldManifest = (await readJSON(exp, MANIFEST_FILE)) || {};
    const manifest = {}; const big = [];

    let copied = 0;
    for (const path of used) {
      say(`Copying media (${step + 1} of ${used.length})…`);
      const file = await S.mediaByPath.get(path).handle.getFile();
      if (S.mediaByPath.get(path).kind === 'video' && file.size > BIG_VIDEO_BYTES) big.push(`${path} (${fmtBytes(file.size)})`);
      await ensureDims(path);
      const key = 'media/' + path;
      const rec = { size: file.size, lastModified: file.lastModified };
      const prev = oldManifest[key];
      const { dir, name } = await ensurePath(exp, key);
      const unchanged = prev && prev.size === rec.size && prev.lastModified === rec.lastModified && (await fileExists(dir, name));
      if (!unchanged) {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await file.stream().pipeTo(w); copied++;
      }
      manifest[key] = rec; tick();
    }

    // A still frame for each video, so "Player" videos show a picture before they're played.
    const posters = {};
    for (const path of videos) {
      say('Making video preview frames…');
      const key = `media/${POSTER_DIR}/${path}.jpg`;
      const file = await S.mediaByPath.get(path).handle.getFile();
      const rec = { size: file.size, lastModified: file.lastModified, poster: true };
      const prev = oldManifest[key];
      const { dir, name } = await ensurePath(exp, key);
      let ok = prev && prev.size === rec.size && prev.lastModified === rec.lastModified && (await fileExists(dir, name));
      if (!ok) {
        try {
          const blob = await grabVideoFrame(path, 1600);
          const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
          await w.write(blob); await w.close(); ok = true;
        } catch { ok = false; }
      }
      if (ok) { manifest[key] = rec; posters[path] = 'media/' + encPath(`${POSTER_DIR}/${path}.jpg`); }
      tick();
    }

    say('Writing the page…');
    await pruneMedia(exp, new Set(Object.keys(manifest)));
    // One file per page. The manifest lists them, so that a page renamed or deleted since the last export has its old
    // file removed; nothing else in the folder is touched.
    const files = pageFiles(S.project), names = [...files.values()];
    for (const pg of S.project.pages) await writeText(exp, files.get(pg.id), await buildArticle(S.project, { mode: 'export', posters, page: pg }));
    for (const old of Array.isArray(oldManifest.pages) ? oldManifest.pages : []) {
      if (typeof old === 'string' && /^[a-z0-9-]+\.html$/.test(old) && !names.includes(old)) { try { await exp.removeEntry(old); } catch {} }
    }
    manifest.pages = names;
    await writeText(exp, 'style.css', articleCSS() + '\n');
    await writeText(exp, 'script.js', ARTICLE_JS + '\n');
    await writeText(exp, MANIFEST_FILE, JSON.stringify(manifest, null, 1));
    tick(); tick();

    $('#exportTitle').textContent = 'Export finished';
    const many = names.length > 1;
    const parts = [
      h('p', {}, many ? `The ${names.length} pages are in ` : 'The page is in ', h('code', {}, `${S.root.name}/${EXPORT_DIR}/${many ? '' : 'index.html'}`),
        many ? ` (${names.join(', ')}). They use ` : '. It uses ', `${used.length} media file${used.length === 1 ? '' : 's'}`,
        used.length ? ` (${copied} copied this time, the rest unchanged).` : '.'),
      h('p', {}, many ? 'Open index.html in Chrome to check them; it is the first page, and its buttons lead to the others. To publish, upload everything inside the export folder.'
        : 'Open that file in Chrome to check it. To publish, upload everything inside the export folder.'),
    ];
    if (links.length) parts.push(h('p', {}, `${links.length} picture${links.length === 1 ? '' : 's'} or video${links.length === 1 ? '' : 's'} ${links.length === 1 ? 'comes' : 'come'} from a link and ${links.length === 1 ? 'is' : 'are'} not copied: the page loads ${links.length === 1 ? 'it' : 'them'} from the web, so ${links.length === 1 ? 'it has' : 'they have'} to stay online.`));
    if (missing.length) parts.push(h('p', {}, 'Left out because the files are missing from the folder:'), h('ul', {}, missing.map((m) => h('li', {}, h('code', {}, m)))));
    if (big.length) parts.push(h('p', {}, 'These videos are large and will load slowly. Consider compressing them to 1080p H.264. GitHub Pages also rejects files over 100 MB.'), h('ul', {}, big.map((b) => h('li', {}, b))));
    bodyEl.replaceChildren(...parts);
    prog.hidden = true;
  } catch (e) {
    $('#exportTitle').textContent = 'Export failed';
    bodyEl.replaceChildren(h('p', {}, e.message || String(e)), h('p', {}, 'Nothing outside the export folder was changed. Check that the folder is still there and that Chrome still has access to it, then try again.'));
    prog.hidden = true;
  } finally {
    closeBtn.disabled = false; closeBtn.focus();
  }
}
