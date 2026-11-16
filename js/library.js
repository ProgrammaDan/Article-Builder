'use strict';
// The media library panel and its thumbnails.

/* ---------- Media library ---------- */
// The files put away with "Hide" (project.hidden). They are still in the folder and still work wherever the article
// already uses them; they are only kept out of the list, in a "Hidden media" folder at its end.
const hiddenPaths = () => new Set(S.project ? S.project.hidden : []);
let hiddenShown = '';      // the hidden list as the panel last drew it, to notice when undo or redo changes it
function renderLibrary() {
  const q = $('#libSearch').value.trim().toLowerCase();
  const hideUsed = $('#libHideUsed').checked;
  const used = usedPaths(), hidden = hiddenPaths();
  const list = $('#libList'); list.replaceChildren();
  const passes = (m) => !(q && !m.path.toLowerCase().includes(q)) && !(hideUsed && used.has(m.path));
  const inList = S.media.filter((m) => !hidden.has(m.path)), putAway = S.media.filter((m) => hidden.has(m.path));
  const multiDir = new Set(inList.map((m) => m.dir)).size > 1;
  let lastDir = null, shown = 0;
  for (const m of inList) {
    if (!passes(m)) continue;
    if (multiDir && m.dir !== lastDir) { lastDir = m.dir; list.append(h('div', { class: 'lib-dir', title: m.dir || 'Top level' }, m.dir || 'Top level')); }
    list.append(libItem(m, used)); shown++;
  }
  if (!S.media.length) list.append(h('p', { class: 'lib-empty' }, 'No photos or videos in this folder yet. Add some, then press Rescan.'));
  else if (!inList.length) list.append(h('p', { class: 'lib-empty' }, 'Everything is in “Hidden media”.'));
  else if (!shown) list.append(h('p', { class: 'lib-empty' }, hideUsed && !q ? 'Everything is already in the article.' : 'Nothing matches that filter.'));
  if (putAway.length) {
    list.append(h('button', {
      class: 'lib-hidden-head', id: 'libHiddenBtn', type: 'button', 'aria-expanded': String(S.hiddenOpen), title: 'Media you have hidden. Open it to look through them or bring one back.',
      onclick: () => { S.hiddenOpen = !S.hiddenOpen; renderLibrary(); $('#libHiddenBtn').focus({ preventScroll: true }); },
    }, h('span', { class: 'lib-hidden-arrow', 'aria-hidden': 'true' }, S.hiddenOpen ? '▾' : '▸'), 'Hidden media', h('span', { class: 'lib-count' }, String(putAway.length))));
    if (S.hiddenOpen) {
      const matching = putAway.filter(passes);
      for (const m of matching) list.append(libItem(m, used, true));
      if (!matching.length) list.append(h('p', { class: 'lib-empty' }, 'None of the hidden media matches that filter.'));
    }
  }
  $('#libCount').textContent = ' ' + inList.filter((m) => m.kind !== 'unsupported').length;
  hiddenShown = S.project ? S.project.hidden.join('\n') : '';
  observeThumbs(); updateSelFoot();
}
// Hides the given files, or brings them back. It is part of the project, so it is saved with it and can be undone.
function setHidden(paths, hide) {
  if (!paths.length) return;
  S.selected.clear();
  if (hide) S.hiddenOpen = false;
  const changed = commit((p) => { p.hidden = hide ? [...p.hidden, ...paths.filter((x) => !p.hidden.includes(x))] : p.hidden.filter((x) => !paths.includes(x)); });
  if (!changed) { renderLibrary(); return; }
  const n = paths.length, files = `${n} file${n === 1 ? '' : 's'}`, inUse = hide ? paths.filter((x) => usedPaths().has(x)).length : 0;
  toast(hide ? `Hid ${files}. ${n === 1 ? 'It is' : 'They are'} in “Hidden media” at the end of the media panel${inUse ? `, and ${inUse === n ? (n === 1 ? 'it stays' : 'they stay') : inUse + ' of them stay'} in the article` : ''}. Press Ctrl+Z to undo.`
    : `Brought back ${files}.`, hide ? 6000 : 3000);
}
function libItem(m, used, hidden = false) {
  const unsupported = m.kind === 'unsupported';
  const thumb = h('div', { class: 'thumb' });
  if (unsupported) thumb.append(h('span', { class: 'thumb-note' }, `.${ext(m.name)} won’t display in a browser. Convert to JPG or MP4.`));
  else {
    if (m.kind === 'video') thumb.append(h('span', { class: 'badge' }, S.durations.has(m.path) ? fmtDuration(S.durations.get(m.path)) : 'Video'));
    thumb.append(h('span', { class: 'used-badge' }, 'In article'));
  }
  const el = h('div', {
    class: 'lib-item' + (S.selected.has(m.path) ? ' selected' : '') + (used.has(m.path) ? ' used' : '') + (unsupported ? ' unsupported' : '') + (hidden ? ' put-away' : ''),
    dataset: { path: m.path }, title: hidden ? `${m.path} (hidden: select it and press Unhide to bring it back)` : m.path,
    draggable: unsupported || hidden ? 'false' : 'true',   // a hidden file is brought back before it is used
    tabindex: unsupported ? null : '0', role: unsupported ? null : 'button', 'aria-pressed': unsupported ? null : String(S.selected.has(m.path)),
    ondragstart: (e) => {
      // Dragging one of several selected items carries the whole selection; only slideshows take more than the first.
      dragState = { type: 'media', path: m.path, paths: S.selected.has(m.path) ? selectedPaths() : [m.path] };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-ab-media', m.path);
    },
    ondragend: endDrag,
    onclick: () => { if (!unsupported) toggleSelect(m.path); },
    onkeydown: (e) => { if ((e.key === ' ' || e.key === 'Enter') && !unsupported) { e.preventDefault(); toggleSelect(m.path); } },
  }, thumb, h('div', { class: 'lib-name' }, m.name));
  const t = S.thumbs.get(m.path);
  if (t && t !== 'pending') applyThumbTo(el, m.path, t);
  return el;
}
// A selection is either files in the list or files in "Hidden media", never both: what can be done with the two differs.
function toggleSelect(path) {
  const hidden = hiddenPaths(), mixed = [...S.selected].some((x) => hidden.has(x) !== hidden.has(path));
  if (mixed) { S.selected.clear(); S.selected.add(path); renderLibrary(); return; }
  if (S.selected.has(path)) S.selected.delete(path); else S.selected.add(path);
  const el = $(`.lib-item[data-path="${CSS.escape(path)}"]`);
  if (el) { el.classList.toggle('selected', S.selected.has(path)); el.setAttribute('aria-pressed', String(S.selected.has(path))); }
  updateSelFoot();
}
const selectedPaths = () => S.media.filter((m) => S.selected.has(m.path)).map((m) => m.path);   // in library order
function updateSelFoot() {
  for (const p of [...S.selected]) if (!S.mediaByPath.has(p)) S.selected.delete(p);
  const n = S.selected.size;
  $('#libFoot').hidden = n === 0;
  $('#selCount').textContent = `${n} selected`;
  $('#addSelBtn').textContent = n === 1 ? 'Add as new row' : n <= 4 ? 'Add as one row' : `Add as ${Math.ceil(n / 3)} rows`;
  // Hidden files can only be brought back; files in the list can be hidden or added.
  const putAway = n > 0 && hiddenPaths().has([...S.selected][0]);
  $('#hideSelBtn').hidden = putAway; $('#unhideSelBtn').hidden = !putAway;
  // While a slideshow's steps panel is open, the selection goes into that slideshow.
  $('#addSelBtn').hidden = putAway || !!S.slidesOpen;
  $('#addSlidesBtn').hidden = putAway || (!S.slidesOpen && n < 2);
  $('#addSlidesBtn').textContent = S.slidesOpen ? 'Add to this slideshow' : 'Add as slideshow';
  $('#addSlidesBtn').classList.toggle('primary', !!S.slidesOpen);
}
function clearSelection() { if (S.selected.size) { S.selected.clear(); renderLibrary(); } }
function refreshLibraryUsage() {
  if (!S.media.length) return;
  if ($('#libHideUsed').checked || S.project.hidden.join('\n') !== hiddenShown) { renderLibrary(); return; }   // the second: hiding was undone or redone
  const used = usedPaths();
  for (const el of $$('#libList .lib-item')) el.classList.toggle('used', used.has(el.dataset.path));
}

// Thumbnails are generated lazily, a few at a time, at 240px wide.
const thumbQueue = []; let thumbActive = 0; let thumbObserver = null;
function observeThumbs() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const path = e.target.dataset.path; thumbObserver.unobserve(e.target);
      const m = S.mediaByPath.get(path); if (!m || m.kind === 'unsupported') continue;
      if (!S.thumbs.has(path)) requestThumb(path);
    }
  }, { root: $('#libList'), rootMargin: '200px' });
  for (const el of $$('#libList .lib-item')) thumbObserver.observe(el);
}
function requestThumb(path) { S.thumbs.set(path, 'pending'); thumbQueue.push(path); pumpThumbs(); }
function pumpThumbs() {
  while (thumbActive < 3 && thumbQueue.length) {
    const path = thumbQueue.shift(); thumbActive++;
    makeThumb(path)
      .then((url) => S.thumbs.set(path, url))
      .catch(() => S.thumbs.set(path, 'error'))
      .finally(() => { thumbActive--; applyThumb(path); pumpThumbs(); });
  }
}
function applyThumb(path) {
  const el = $(`#libList .lib-item[data-path="${CSS.escape(path)}"]`);
  if (el) applyThumbTo(el, path, S.thumbs.get(path));
  hydrateThumbs($('#slidesList'));
  drawMarks($('#slidesList'));   // making the thumbnail also found the picture's shape, which its marks need
}
function applyThumbTo(el, path, t) {
  const thumb = el.querySelector('.thumb'); if (!thumb || thumb.querySelector('img, .thumb-note')) return;
  if (t === 'error') {
    const m = S.mediaByPath.get(path);
    thumb.prepend(h('span', { class: 'thumb-note' }, m && m.kind === 'video' ? 'Chrome can’t play this video (likely HEVC)' : 'Can’t preview this file'));
  } else if (t) thumb.prepend(h('img', { src: t, alt: '', draggable: 'false' }));
  const badge = thumb.querySelector('.badge');
  if (badge && S.durations.has(path)) badge.textContent = fmtDuration(S.durations.get(path));
}
function canvasToURL(source, w, hgt) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  c.getContext('2d').drawImage(source, 0, 0, w, hgt);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob'))), 'image/jpeg', 0.8));
}
async function makeThumb(path) {
  const m = S.mediaByPath.get(path);
  if (m.kind === 'image') {
    const file = await m.handle.getFile();
    if (ext(m.name) === 'svg') return URL.createObjectURL(file);
    const full = await createImageBitmap(file);
    S.dims.set(path, { w: full.width, h: full.height });
    const W = Math.min(240, full.width), H = Math.round(full.height * (W / full.width));
    const url = await canvasToURL(full, W, H); full.close(); return url;
  }
  const frame = await grabVideoFrame(path, 240);
  return URL.createObjectURL(frame);
}
// Loads a video, seeks a moment in, and returns a JPEG Blob of that frame.
async function grabVideoFrame(path, maxW) {
  const src = await getURL(path); if (!src) throw new Error('missing');
  return new Promise((resolve, reject) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
    let done = false;
    const finish = (err, blob) => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); err ? reject(err) : resolve(blob); };
    const timer = setTimeout(() => finish(new Error('timeout')), 20000);
    v.addEventListener('error', () => finish(new Error('decode')), { once: true });
    v.addEventListener('loadedmetadata', () => {
      if (isFinite(v.duration)) S.durations.set(path, v.duration);
      if (!v.videoWidth) { finish(new Error('no video track')); return; }
      S.dims.set(path, { w: v.videoWidth, h: v.videoHeight });
      v.currentTime = Math.min(1, (v.duration || 0) * 0.1);
    }, { once: true });
    v.addEventListener('seeked', () => {
      try {
        const W = Math.min(maxW, v.videoWidth), H = Math.round(v.videoHeight * (W / v.videoWidth));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(v, 0, 0, W, H);
        c.toBlob((b) => (b ? finish(null, b) : finish(new Error('toBlob'))), 'image/jpeg', 0.85);
      } catch (e) { finish(e); }
    }, { once: true });
    v.src = src;
  });
}
async function ensureDims(path) {
  if (dimsOf(path)) return dimsOf(path);
  const m = mediaOf(path); if (!m) return null;
  const url = await getURL(path); if (!url) return null;
  try {
    if (m.kind === 'image') {
      const img = new Image(); img.src = url; await img.decode();
      if (img.naturalWidth) S.dims.set(path, { w: img.naturalWidth, h: img.naturalHeight });
    } else await probeVideo(path);
  } catch {}
  return S.dims.get(path) || null;
}
// Reads a video's size and length from its metadata, without decoding a frame.
async function probeVideo(path) {
  const url = await getURL(path); if (!url) return;
  await new Promise((res) => {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    const t = setTimeout(res, 10000);
    v.addEventListener('loadedmetadata', () => { clearTimeout(t); if (v.videoWidth) S.dims.set(path, { w: v.videoWidth, h: v.videoHeight }); if (isFinite(v.duration)) S.durations.set(path, v.duration); res(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); res(); }, { once: true });
    v.src = url;
  });
}


// Small pictures outside the library (the steps panel) reuse the library's thumbnails.
function hydrateThumbs(root) {
  for (const img of $$('img[data-thumb]', root)) {
    const path = img.dataset.thumb, t = S.thumbs.get(path);
    if (!t) requestThumb(path);
    else if (t === 'error') img.alt = 'Can’t preview this file';
    else if (t !== 'pending') img.src = t;
  }
}

/* ---------- Resizing the panel ---------- */
// The panel's width is a per-browser preference, like the editor's appearance, and not part of the project. Drag the
// panel's right edge, or focus it and use the arrow keys; double-click puts it back to the usual width.
function setLibraryWidth(px, remember = true) {
  const w = Math.round(Math.min(LIBRARY_WIDTH.max, Math.max(LIBRARY_WIDTH.min, px)));
  document.documentElement.style.setProperty('--lib-w', w + 'px');
  $('#libResizer').setAttribute('aria-valuenow', w);
  if (remember) { try { localStorage.setItem(LIBRARY_WIDTH_KEY, w); } catch {} }
}
function setupLibraryResize() {
  const edge = $('#libResizer');
  let stored = 0; try { stored = Number(localStorage.getItem(LIBRARY_WIDTH_KEY)); } catch {}
  edge.setAttribute('aria-valuemin', LIBRARY_WIDTH.min); edge.setAttribute('aria-valuemax', LIBRARY_WIDTH.max);
  setLibraryWidth(stored > 0 ? stored : LIBRARY_WIDTH.usual, false);
  edge.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const left = $('#app').getBoundingClientRect().left;
    const move = (ev) => setLibraryWidth(ev.clientX - left, false);          // follow the pointer; remember only where it ends up
    const done = (ev) => {
      edge.removeEventListener('pointermove', move); edge.removeEventListener('pointerup', done); edge.removeEventListener('pointercancel', done);
      document.body.classList.remove('resizing');
      setLibraryWidth(ev.clientX - left);
    };
    edge.setPointerCapture(e.pointerId);        // keeps the drag going when the pointer runs ahead of the edge
    document.body.classList.add('resizing');
    edge.addEventListener('pointermove', move); edge.addEventListener('pointerup', done); edge.addEventListener('pointercancel', done);
  });
  edge.addEventListener('dblclick', () => setLibraryWidth(LIBRARY_WIDTH.usual));
  edge.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key]; if (!step) return;
    e.preventDefault(); setLibraryWidth(Number(edge.getAttribute('aria-valuenow')) + step);
  });
}
