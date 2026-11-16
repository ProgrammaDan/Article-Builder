'use strict';
// The project (what project.json holds): creating one, repairing a loaded one, finding things in it, saving, and undo.

/* ---------- Project model ---------- */
function prettyName(folder) {
  const s = (folder || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Untitled project';
}
function emptyCell() { return { id: uid(), kind: 'empty' }; }
function gridRow(n) { return { id: uid(), type: 'grid', align: 'start', widths: WIDTH_PRESETS[n][0].slice(), cells: Array.from({ length: n }, emptyCell) }; }
// A page of the article: the label on its button, its own title lines, and its rows. It starts with a heading and a
// text block to type into.
function newPage() {
  return {
    id: uid(), label: '', title: '', subtitle: '', meta: '',
    fonts: {},
    rows: [
      { id: uid(), type: 'section', text: '' },
      { id: uid(), type: 'grid', align: 'start', widths: [1], cells: [{ id: uid(), kind: 'text', html: '' }] },
    ],
  };
}
function newProject(folderName) {
  const first = newPage(); first.title = prettyName(folderName); first.rows[0].text = 'Overview';
  return pageShortcuts({
    version: 2,
    settings: { theme: 'light', width: 'standard', captions: 'left' },
    marks: {},
    hidden: [],
    page: first.id,
    pages: [first],
  });
}
// A project holds pages, and the editor works on one of them at a time: p.page is its id. So that the rest of the code
// can say p.rows or p.title and mean the page being edited, those names are defined on the project as shortcuts to
// that page. They are not part of what is saved (JSON.stringify leaves them out), so every project object needs them
// put on: a new one, a loaded one, and one brought back by undo. Code that means every page says p.pages or allRows(p).
const PAGE_PARTS = ['title', 'subtitle', 'meta', 'fonts', 'rows'];
const openPage = (p) => p.pages.find((pg) => pg.id === p.page) || p.pages[0];
function pageShortcuts(p) {
  for (const key of PAGE_PARTS) Object.defineProperty(p, key, { get() { return openPage(this)[key]; }, set(v) { openPage(this)[key] = v; }, enumerable: false, configurable: true });
  return p;
}
const allRows = (p) => p.pages.flatMap((pg) => pg.rows);
const pageLabel = (v) => str(v, '').replace(/\s+/g, ' ').trim().slice(0, PAGE_LABEL_MAX);
const clampWidth = (n) => Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(n)));
const articleWidth = (st) => (st.width === 'custom' ? st.widthPx : WIDTH_PX[st.width]) || WIDTH_PX.standard;   // in px
function normCell(c) {
  if (c && c.kind === 'text') return { id: str(c.id, '') || uid(), kind: 'text', html: sanitize(str(c.html, '')) };
  if (c && c.kind === 'media' && typeof c.path === 'string' && c.path) {
    const cell = { id: str(c.id, '') || uid(), kind: 'media', path: c.path, caption: sanitizeInline(str(c.caption, '')), alt: str(c.alt, '').replace(/\s+/g, ' ').trim(), video: { mode: c.video && c.video.mode === 'loop' ? 'loop' : 'player' } };
    if (typeof c.group === 'string' && /^[a-z0-9]+$/i.test(c.group)) cell.group = c.group;   // set by "Group media"
    return cell;
  }
  if (c && c.kind === 'slides') {
    const seen = new Set(), slides = [];
    for (const s of Array.isArray(c.slides) ? c.slides : []) {
      if (!s || typeof s.path !== 'string' || !s.path) continue;
      let id = str(s.id, ''); while (!id || seen.has(id)) id = uid(); seen.add(id);
      const slide = { id, path: s.path, caption: sanitizeInline(str(s.caption, '')) };
      if (s.loop === true) slide.loop = true;   // a video step that plays silently on repeat; absent means a player with controls
      slides.push(slide);
    }
    return { id: str(c.id, '') || uid(), kind: 'slides', caption: sanitizeInline(str(c.caption, '')), cover: seen.has(c.cover) ? c.cover : null, slides };
  }
  return { id: (c && str(c.id, '')) || uid(), kind: 'empty' };
}
function normalizeProject(p) {
  p = p && typeof p === 'object' ? p : {};
  const st = p.settings || {};
  const out = {
    version: 2,
    settings: { theme: ['light', 'dark', 'auto'].includes(st.theme) ? st.theme : 'light', width: ['standard', 'wide', 'custom'].includes(st.width) ? st.width : 'standard', captions: st.captions === 'center' ? 'center' : 'left' },
    marks: {},
    hidden: [],
    page: '',
    pages: [],
  };
  // Files put away in the media panel's "Hidden media" folder. Like marks, a path is kept even while its file is
  // missing, in case it comes back.
  for (const path of Array.isArray(p.hidden) ? p.hidden : []) if (typeof path === 'string' && path && !out.hidden.includes(path)) out.hidden.push(path);
  for (const [path, mk] of Object.entries(p.marks && typeof p.marks === 'object' ? p.marks : {})) {
    const size = mk && Object.hasOwn(MARK_SIZES, mk.size) ? mk.size : 'm';   // the image's line weight; also the text size of older labels that have none
    const items = (mk && Array.isArray(mk.items) ? mk.items : []).map((it) => normMark(it, size)).filter(Boolean), ids = new Set();
    for (const it of items) { while (ids.has(it.id)) it.id = uid(); ids.add(it.id); }
    if (items.length && path !== '__proto__') out.marks[path] = { size, items };
  }
  const widthPx = Math.round(Number(st.widthPx));   // only present once a custom width has been set
  if (widthPx > 0) out.settings.widthPx = clampWidth(widthPx);
  else if (out.settings.width === 'custom') out.settings.width = 'standard';
  const seen = new Set();       // ids are unique across the whole project, since rows can move from page to page
  const freshId = (id) => { let v = typeof id === 'string' && id ? id : uid(); while (seen.has(v)) v = uid(); seen.add(v); return v; };
  // A project saved before there were pages is its one page: its title lines and rows sit on the project itself.
  const pagesIn = Array.isArray(p.pages) ? p.pages.filter((pg) => pg && typeof pg === 'object') : [];
  for (const pg of pagesIn.length ? pagesIn : [p]) {
    const page = {
      id: freshId(pg === p ? '' : pg.id), label: pageLabel(pg.label),
      title: str(pg.title, out.pages.length ? '' : 'Untitled project'), subtitle: str(pg.subtitle, ''), meta: str(pg.meta, ''),
      fonts: {},
      rows: [],
    };
    // A font for the title, summary or date line, each held only once one has been chosen. Fonts inside body text and
    // captions travel in their HTML, as <span data-font>.
    for (const key of ['title', 'subtitle', 'meta']) if (pg.fonts && Object.hasOwn(FONTS, pg.fonts[key])) page.fonts[key] = pg.fonts[key];
    for (const r of Array.isArray(pg.rows) ? pg.rows : []) {
      if (!r) continue;
      if (r.type === 'section') {
        const row = { id: freshId(r.id), type: 'section', text: str(r.text, '') };
        if (Object.hasOwn(FONTS, r.font)) row.font = r.font;
        page.rows.push(row); continue;
      }
      if (r.type !== 'grid') continue;
      let cells = (Array.isArray(r.cells) ? r.cells : []).slice(0, 4).map(normCell);
      if (!cells.length) cells = [emptyCell()];
      cells.forEach((c) => { c.id = freshId(c.id); });
      const okWidths = Array.isArray(r.widths) && r.widths.length === cells.length && r.widths.every((n) => Number(n) > 0 && Number(n) <= 12);
      const row = { id: freshId(r.id), type: 'grid', align: r.align === 'center' ? 'center' : 'start', widths: okWidths ? r.widths.map(Number) : cells.map(() => 1), cells };
      if (r.fit === 'height') row.fit = 'height';   // the "equal heights" choice; widths is then only what it falls back to
      page.rows.push(row);
    }
    out.pages.push(page);
  }
  out.page = out.pages.some((pg) => pg.id === p.page) ? p.page : out.pages[0].id;
  return pageShortcuts(out);
}
// The shape (width over height) of what a cell shows, if it shows a picture or video whose size is known.
function cellShape(c) {
  const path = c.kind === 'media' ? c.path : c.kind === 'slides' ? (coverSlide(c) || {}).path : null, d = path && dimsOf(path);
  return d ? d.w / d.h : null;
}
const showsMedia = (c) => c.kind === 'media' || c.kind === 'slides';
// The column widths a row is drawn with, as fr values. Normally row.widths. With "equal heights" (row.fit) each media
// column is as wide as its picture's shape, which makes them all the same height; other columns take the average. It
// needs two or more media whose sizes are all known, and falls back to row.widths until then.
function rowWidths(r) {
  if (r.fit !== 'height') return r.widths;
  const shapes = r.cells.map(cellShape), media = r.cells.filter(showsMedia), known = shapes.filter(Boolean);
  if (media.length < 2 || known.length < media.length) return r.widths;
  const average = known.reduce((a, b) => a + b, 0) / known.length;
  return shapes.map((s) => Math.round((s || average) * 1000) / 1000);
}
const findRow = (p, rowId) => p.rows.find((r) => r.id === rowId);
function findCell(p, rowId, cellId) {
  const row = findRow(p, rowId); if (!row || row.type !== 'grid') return null;
  const idx = row.cells.findIndex((c) => c.id === cellId);
  return idx < 0 ? null : { row, idx, cell: row.cells[idx] };
}
function findCellById(p, cellId) {
  for (const row of p.rows) {
    const idx = row.type === 'grid' ? row.cells.findIndex((c) => c.id === cellId) : -1;
    if (idx >= 0) return { row, idx, cell: row.cells[idx] };
  }
  return null;
}
// Every media file placed anywhere in the article, on any page.
function usedPaths() {
  const s = new Set();
  for (const r of allRows(S.project)) if (r.type === 'grid') for (const c of r.cells) {
    if (c.kind === 'media') s.add(c.path);
    if (c.kind === 'slides') for (const sl of c.slides) s.add(sl.path);
  }
  return s;
}
// A slideshow's steps whose files are still in the folder, and the one shown as its cover (the last, unless one is picked).
const liveSlides = (c) => c.slides.filter((s) => S.mediaByPath.has(s.path));
function coverSlide(c) { const live = liveSlides(c); return live.find((s) => s.id === c.cover) || live[live.length - 1] || null; }
function slidesCell(paths, id = uid()) {
  return { id, kind: 'slides', caption: '', cover: null, slides: paths.map((path) => ({ id: uid(), path, caption: '' })) };
}
function defaultVideoMode(path) {
  const d = S.durations.get(path);
  return d && d <= LOOP_MAX_SECONDS ? 'loop' : 'player';
}
// Short clips default to "Loop", so a video's length has to be known before it is placed.
function ensureDurations(paths) {
  return Promise.all(paths.filter((p) => !S.durations.has(p) && (mediaOf(p) || {}).kind === 'video').map((p) => probeVideo(p)));
}
function mediaCell(path, caption = '', id = uid()) {
  return { id, kind: 'media', path, caption, alt: '', video: { mode: defaultVideoMode(path) } };
}

/* ---------- Saving ---------- */
function setStatus(msg, isErr = false) { const el = $('#saveStatus'); el.textContent = msg; el.classList.toggle('err', isErr); }
function scheduleSave() {
  S.unsaved = true; setStatus('Unsaved changes');
  clearTimeout(S.saveTimer); S.saveTimer = setTimeout(saveNow, 600);
}
async function saveNow() {
  clearTimeout(S.saveTimer); S.saveTimer = null;
  if (!S.root || !S.project) return;
  if (S.saving) { S.savePending = true; return; }
  S.saving = true; setStatus('Saving…');
  try {
    await writeText(S.root, PROJECT_FILE, JSON.stringify(S.project, null, 2) + '\n');
    S.unsaved = false; setStatus('Saved');
  } catch (e) {
    setStatus('Not saved: ' + e.message, true);
  } finally {
    S.saving = false;
    if (S.savePending) { S.savePending = false; saveNow(); }
  }
}

/* ---------- Undo / redo ---------- */
const snapshot = () => JSON.stringify(S.project);
function pushUndo(snap) {
  S.undo.push(snap); if (S.undo.length > 300) S.undo.shift();
  S.redo = []; updateUndoButtons();
}
function flushEdit() {
  if (S.editSnap && S.editSnap !== snapshot()) pushUndo(S.editSnap);
  S.editSnap = null;
}
function commit(fn, { rerender = true } = {}) {
  flushEdit();
  const before = snapshot();
  fn(S.project);
  if (snapshot() === before) return false;
  pushUndo(before);
  if (rerender) render();
  scheduleSave();
  return true;
}
// Undo and redo put back the whole project as it was, including which page was open, so the editor turns to the page
// where the change was made and the change is seen going. What is set aside for the opposite direction is marked with
// that same page, so that going back again lands there too and not wherever the editor had wandered to since.
function stepHistory(from, to) {
  flushEdit(); if (!from.length) return;
  const next = pageShortcuts(JSON.parse(from.pop())), now = S.project, turned = openPage(next).id !== openPage(now).id;
  if (now.pages.some((pg) => pg.id === next.page)) now.page = next.page;
  to.push(snapshot());
  if (turned) leavePage();
  S.project = next;
  render(); scheduleSave(); updateUndoButtons();
  if (turned) $('#canvas').scrollTop = 0;
}
const undo = () => stepHistory(S.undo, S.redo);
const redo = () => stepHistory(S.redo, S.undo);
function updateUndoButtons() { $('#undoBtn').disabled = !S.undo.length; $('#redoBtn').disabled = !S.redo.length; }
