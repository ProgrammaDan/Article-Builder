'use strict';
// Drag and drop: library items, cells, rows, slideshow steps, and files dropped in from the desktop.

/* ---------- Files dropped from outside the browser ---------- */
async function importDropped(dt) {
  // Handles must be requested synchronously, before any await, or the drop data is gone.
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const handlePromises = items.map((i) => (typeof i.getAsFileSystemHandle === 'function' ? i.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)));
  const files = items.map((i) => i.getAsFile());
  const paths = []; let copied = 0; const skipped = [];
  for (let k = 0; k < items.length; k++) {
    const handle = await handlePromises[k];
    if (handle && handle.kind !== 'file') { skipped.push(handle.name + '/'); continue; }
    const file = files[k] || (handle ? await handle.getFile() : null);
    const name = (handle && handle.name) || (file && file.name); if (!name) continue;
    const kind = kindOf(name);
    if (kind !== 'image' && kind !== 'video') { skipped.push(name); continue; }
    let rel = null;
    if (handle) { try { const parts = await S.root.resolve(handle); if (parts) rel = parts.join('/'); } catch {} }
    if (!rel) { rel = await copyIntoFolder(file, name); copied++; }
    paths.push(rel);
  }
  if (copied || paths.some((p) => !S.mediaByPath.has(p))) { await scanMedia(); renderLibrary(); }
  if (copied) toast(`Copied ${copied} file${copied > 1 ? 's' : ''} into the “${IMPORT_DIR}” folder inside your project folder.`);
  if (skipped.length) toast(`Skipped ${skipped.join(', ')}: only photos and videos that Chrome can display are supported.`);
  return paths;
}
async function copyIntoFolder(file, name) {
  const dir = await S.root.getDirectoryHandle(IMPORT_DIR, { create: true });
  let final = name; const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name, ex = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; await fileExists(dir, final); n++) final = `${base} (${n})${ex}`;
  const fh = await dir.getFileHandle(final, { create: true });
  const w = await fh.createWritable(); await file.stream().pipeTo(w);
  return `${IMPORT_DIR}/${final}`;
}

/* ---------- Drag and drop ---------- */
function dragKind(e) {
  if (dragState) return dragState.type;
  if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) return 'files';
  return null;
}
function clearDropMarks() { for (const el of $$('.drop-ok, .drop-before, .drop-after')) el.classList.remove('drop-ok', 'drop-before', 'drop-after'); }
function endDrag() { dragState = null; stopDragScroll(); hidePageDropBar(); clearDropMarks(); for (const el of $$('.dragging')) el.classList.remove('dragging'); }
function canDropOnCell(kind, cellEl) {
  if (kind === 'media' || kind === 'files') return ['empty', 'media', 'slides'].some((k) => cellEl.classList.contains(k));
  if (kind === 'cell') return cellEl.dataset.cellId !== dragState.cellId;
  return false;
}
function rowDropIndex(e) {
  const rows = $$('#rows > .row');
  for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) return i; }
  return rows.length;
}
function markRowDrop(idx) {
  const rows = $$('#rows > .row');
  if (!rows.length) return;
  if (idx < rows.length) rows[idx].classList.add('drop-before'); else rows[rows.length - 1].classList.add('drop-after');
}
function setupDnD() {
  const rowsEl = $('#rows');
  rowsEl.addEventListener('dragover', (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault();               // also stops text cells from accepting dropped text
    clearDropMarks();
    if (k === 'row') { e.dataTransfer.dropEffect = 'move'; markRowDrop(rowDropIndex(e)); return; }
    const cellEl = e.target.closest('.cell');
    if (!cellEl || !canDropOnCell(k, cellEl)) { e.dataTransfer.dropEffect = 'none'; return; }
    e.dataTransfer.dropEffect = k === 'cell' ? 'move' : 'copy';
    cellEl.classList.add('drop-ok');
  });
  rowsEl.addEventListener('dragleave', (e) => { if (!rowsEl.contains(e.relatedTarget)) clearDropMarks(); });
  rowsEl.addEventListener('drop', async (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault();
    const state = dragState; clearDropMarks();
    if (k === 'row') { moveRowsTo(state.rowIds, rowDropIndex(e)); endDrag(); return; }
    const cellEl = e.target.closest('.cell');
    if (!cellEl || !canDropOnCell(k, cellEl)) { endDrag(); return; }
    const { rowId, cellId } = cellEl.dataset, intoSlides = cellEl.classList.contains('slides');
    if (k === 'media' && intoSlides) { addSlides(cellId, state.paths); if (state.paths.length > 1) clearSelection(); }
    else if (k === 'media') placeMedia(rowId, cellId, state.path);
    else if (k === 'cell') swapCells(state.rowId, state.cellId, rowId, cellId);
    else if (k === 'files') {
      const paths = await importDropped(e.dataTransfer);
      if (intoSlides) addSlides(cellId, paths);
      else {
        if (paths.length) await placeMedia(rowId, cellId, paths[0]);
        if (paths.length > 1) await appendMediaRows(paths.slice(1), rowId);
      }
    }
    endDrag();
  });

  // The steps panel: reorder by dragging a step, or drop media from the library or the desktop at a position.
  const panel = $('#slidesPanel');
  const slideDropTarget = (e) => {
    const card = e.target.closest('.slide-card'); if (!card) return { index: Infinity };
    const r = card.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    return { card, after, index: $$('#slidesList .slide-card').indexOf(card) + (after ? 1 : 0) };
  };
  panel.addEventListener('dragover', (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault(); clearDropMarks();
    if (k !== 'slide' && k !== 'media' && k !== 'files') { e.dataTransfer.dropEffect = 'none'; return; }
    const t = slideDropTarget(e);
    if (t.card) t.card.classList.add(t.after ? 'drop-after' : 'drop-before'); else $('#slidesAdd').classList.add('drop-ok');
    e.dataTransfer.dropEffect = k === 'slide' ? 'move' : 'copy';
  });
  panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) clearDropMarks(); });
  panel.addEventListener('drop', async (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault();
    const state = dragState, cellId = S.slidesOpen, { index } = slideDropTarget(e); clearDropMarks();
    if (k === 'slide') moveSlideTo(cellId, state.slideId, index);
    else if (k === 'media') { addSlides(cellId, state.paths, index); if (state.paths.length > 1) clearSelection(); }
    else if (k === 'files') addSlides(cellId, await importDropped(e.dataTransfer), index);
    endDrag();
  });

  const zone = $('#addZone');
  zone.addEventListener('dragover', (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault(); clearDropMarks();
    if (k === 'cell') { e.dataTransfer.dropEffect = 'none'; return; }
    if (k === 'row') { markRowDrop(Infinity); e.dataTransfer.dropEffect = 'move'; return; }
    zone.classList.add('drop-ok'); e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-ok'); });
  zone.addEventListener('drop', async (e) => {
    const k = dragKind(e); if (!k) return;
    e.preventDefault(); const state = dragState; clearDropMarks();
    if (k === 'media') appendMediaRows([state.path]);
    else if (k === 'row') moveRowsTo(state.rowIds, S.project.rows.length);
    else if (k === 'files') appendMediaRows(await importDropped(e.dataTransfer));
    endDrag();
  });

  // Rows dropped on another page's button move to that page. The buttons are the ones at the top right of the page and
  // the ones in the bar that appears while rows are dragged; both carry .page-drop and the page's id.
  const canvas = $('#canvas');
  const pageTarget = (e) => (dragKind(e) === 'row' && e.target.closest ? e.target.closest('.page-drop') : null);
  canvas.addEventListener('dragover', (e) => {
    const t = pageTarget(e); if (!t) return;
    e.preventDefault(); clearDropMarks();
    e.dataTransfer.dropEffect = 'move'; t.classList.add('drop-ok');
  });
  canvas.addEventListener('dragleave', (e) => { const t = e.target.closest && e.target.closest('.page-drop'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-ok'); });
  canvas.addEventListener('drop', (e) => {
    const t = pageTarget(e); if (!t) return;
    e.preventDefault();
    const state = dragState; endDrag();
    moveRowsToPage(state.rowIds, t.dataset.pageId);
  });

  // Never let a stray file drop navigate the tab away from the editor.
  window.addEventListener('dragover', (e) => { if (dragKind(e)) { e.preventDefault(); dragScrollAt(e); } });
  window.addEventListener('drop', (e) => { e.preventDefault(); endDrag(); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) stopDragScroll(); });   // the drag left the window
}
/* ---------- Scrolling while dragging ---------- */
// Holding a drag near the top or bottom edge of the page scrolls it, faster the nearer the edge, so that something can
// be carried from one end of a long article to the other. It applies to every kind of drag, and to the slideshow's
// steps when that panel is open. The scrolling is advanced both by animation frames and by the drag events themselves,
// whichever comes: a browser may hold back one or the other during a drag.
const DRAG_SCROLL = { edge: 90, slowest: 140, fastest: 1500 };   // the zone's depth in pixels, and speeds in pixels a second
const dragScroll = { box: null, speed: 0, last: 0, frame: 0 };
function dragScrollAt(e) {
  const box = $('#slidesPanel').hidden ? $('#canvas') : $('#slidesList'), r = box.getBoundingClientRect(), { edge, slowest, fastest } = DRAG_SCROLL;
  const into = (depth) => { const t = Math.min(1, depth / edge); return slowest + (fastest - slowest) * t * t; };   // gentle at the zone's start
  let speed = 0;
  if (e.target.closest && e.target.closest('.page-drop-bar')) speed = 0;   // held over the bar of pages to drop on, which sits in the top zone
  else if (e.clientX >= r.left && e.clientX <= r.right) {   // only while the pointer is over the page, not beside it in the library
    if (e.clientY < r.top + edge) speed = -into(r.top + edge - e.clientY);            // also above the page, over the toolbar
    else if (e.clientY > r.bottom - edge) speed = into(e.clientY - (r.bottom - edge));
  }
  advanceDragScroll();                         // moves by the speed it had until now
  dragScroll.box = box; dragScroll.speed = speed;
  if (speed && !dragScroll.frame) { dragScroll.last = performance.now(); dragScroll.frame = requestAnimationFrame(dragScrollFrame); }
}
function advanceDragScroll() {
  const now = performance.now(), ms = Math.min(100, now - dragScroll.last);
  dragScroll.last = now;
  if (dragScroll.box && dragScroll.speed) dragScroll.box.scrollTop += dragScroll.speed * ms / 1000;
}
function dragScrollFrame() {
  dragScroll.frame = 0;
  if (!dragScroll.speed) return;
  advanceDragScroll();
  dragScroll.frame = requestAnimationFrame(dragScrollFrame);
}
function stopDragScroll() { dragScroll.speed = 0; if (dragScroll.frame) { cancelAnimationFrame(dragScroll.frame); dragScroll.frame = 0; } }
