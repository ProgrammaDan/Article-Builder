'use strict';
// Draws the editor's page from the project: rows, cells and their tools.

/* ---------- Rendering the editor ---------- */
function render() {
  const p = S.project;
  parkTextbar();
  document.documentElement.style.setProperty('--page-w', articleWidth(p.settings) - 48 + 'px');   // less the exported page's side padding
  for (const [id, key] of [['#docTitle', 'title'], ['#docSubtitle', 'subtitle'], ['#docMeta', 'meta']]) {
    const el = $(id); if (document.activeElement !== el) el.textContent = p[key];
    if (p.fonts[key]) $(id).dataset.font = p.fonts[key]; else delete $(id).dataset.font;
  }
  renderPageNav();
  const rowsEl = $('#rows');
  rowsEl.replaceChildren(...p.rows.map((r, i) => (r.type === 'section' ? renderSection(r, i) : renderGrid(r, i))));
  $('#outlineOffer').hidden = p.rows.length > 3;
  for (const inp of $$('#settingsPop input[name=theme]')) inp.checked = inp.value === p.settings.theme;
  for (const inp of $$('#settingsPop input[name=width]')) inp.checked = inp.value === p.settings.width;
  for (const inp of $$('#settingsPop input[name=captions]')) inp.checked = inp.value === p.settings.captions;
  $('#page').classList.toggle('captions-center', p.settings.captions === 'center');
  if (document.activeElement !== $('#widthPx')) $('#widthPx').value = p.settings.widthPx || articleWidth(p.settings);
  renderSlidesPanel();
  renderGroupBar();
  renderMarkup();
  drawMarks();
  hydrateMedia();
  refreshLibraryUsage();
  updateUndoButtons();
  showRowSelection();
}
// A row's handle. Dragging it moves the row. Clicking it selects the row, and dragging any selected row's handle moves
// all the selected rows together.
function rowGrip(r) {
  return h('div', {
    class: 'row-grip', draggable: 'true', role: 'button', tabindex: '0', 'aria-pressed': 'false', 'aria-label': 'Select this row, or drag to move it',
    title: 'Drag to move. Click to select; Shift-click selects a run; double-click a heading’s handle selects its whole section. Drag any selected handle to move them all.',
    onclick: (e) => selectRow(r.id, e.shiftKey),
    ondblclick: () => { if (r.type === 'section') selectSection(r.id); },
    onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); selectRow(r.id, e.shiftKey); } },
    ondragstart: (e) => {
      const rowEl = e.currentTarget.closest('.row');
      // Grabbing one of several selected rows carries them all, in page order; grabbing any other row carries just it.
      const rowIds = S.rowSel.has(r.id) && S.rowSel.size > 1 ? S.project.rows.filter((x) => S.rowSel.has(x.id)).map((x) => x.id) : [r.id];
      dragState = { type: 'row', rowId: r.id, rowIds };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-ab-row', r.id);
      try { e.dataTransfer.setDragImage(rowEl, 24, 16); } catch {}
      requestAnimationFrame(() => { for (const id of rowIds) { const el = $(`.row[data-row-id="${CSS.escape(id)}"]`); if (el) el.classList.add('dragging'); } showPageDropBar(); });
    },
    ondragend: endDrag,
  }, icon('grip'));
}
function rowTools(r, i) {
  const n = S.project.rows.length;
  const tools = h('div', { class: 'row-tools', role: 'toolbar', 'aria-label': r.type === 'section' ? 'Section heading options' : 'Row options' });
  if (r.type === 'grid') {
    const seg = h('div', { class: 'seg' });
    for (const c of [1, 2, 3, 4]) {
      const on = r.cells.length === c;
      seg.append(h('button', { class: 'tb' + (on ? ' on' : ''), 'aria-pressed': String(on), title: `${c} column${c > 1 ? 's' : ''}`, onclick: () => setCols(r.id, c) }, String(c)));
    }
    tools.append(h('span', { class: 'tb-label' }, 'Columns'), seg);
    if (WIDTH_PRESETS[r.cells.length].length > 1 || r.fit || r.cells.filter(showsMedia).length > 1) {
      tools.append(h('button', { class: 'tb', title: 'Step through column width ratios. After the last comes “equal heights”, which sizes the columns so the pictures and videos in the row are all the same height.', onclick: () => cycleWidths(r.id) }, 'Widths ' + (r.fit ? 'equal heights' : r.widths.join(':'))));
    }
    if (r.cells.length > 1) tools.append(h('button', { class: 'tb', title: 'Vertical alignment of the cells', onclick: () => toggleAlign(r.id) }, r.align === 'center' ? 'Align middle' : 'Align top'));
  }
  tools.append(
    h('span', { class: 'tb-gap' }),
    h('button', { class: 'tb', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => moveRow(r.id, -1) }, '↑'),
    h('button', { class: 'tb', title: 'Move down', 'aria-label': 'Move down', disabled: i === n - 1, onclick: () => moveRow(r.id, 1) }, '↓'),
    h('button', { class: 'tb', title: 'Insert an empty two-column row below', onclick: () => insertRowAfter(r.id, 'grid') }, '+ Row'),
    h('button', { class: 'tb', title: 'Insert a section heading below', onclick: () => insertRowAfter(r.id, 'section') }, '+ Section'),
  );
  if (r.type === 'grid') tools.append(h('button', { class: 'tb', onclick: () => duplicateRow(r.id) }, 'Duplicate'));
  tools.append(h('button', { class: 'tb danger', onclick: () => deleteRow(r.id) }, 'Delete'));
  return tools;
}
function renderSection(r, i) {
  return h('div', { class: 'row section', dataset: { rowId: r.id } },
    rowGrip(r), rowTools(r, i),
    h('h2', { class: 'section-title', contenteditable: 'plaintext-only', spellcheck: 'true', 'data-bind': 'section:' + r.id, 'data-ph': 'Section heading', 'data-single': '', 'data-font': r.font }, r.text));
}
/* ---------- Selecting rows ---------- */
// Which rows are selected is not part of the project; it lives in S.rowSel and is shown again after every re-render.
function showRowSelection() {
  for (const id of [...S.rowSel]) if (!findRow(S.project, id)) S.rowSel.delete(id);   // a selected row was deleted
  for (const el of $$('#rows > .row')) {
    const on = S.rowSel.has(el.dataset.rowId);
    el.classList.toggle('selected', on);
    el.querySelector('.row-grip').setAttribute('aria-pressed', String(on));
  }
}
let rowHintShown = false;
function selectRow(rowId, extend = false) {
  const ids = S.project.rows.map((r) => r.id), from = ids.indexOf(S.rowAnchor), to = ids.indexOf(rowId);
  if (extend && from >= 0 && to >= 0) for (const id of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) S.rowSel.add(id);   // Shift: the run from the last one clicked
  else if (S.rowSel.has(rowId)) S.rowSel.delete(rowId);
  else S.rowSel.add(rowId);
  S.rowAnchor = rowId;
  showRowSelection();
  if (S.rowSel.size > 1 && !rowHintShown) { rowHintShown = true; toast('Drag the handle of any selected row to move them all together. Esc clears the selection.', 5000); }
}
// A heading with everything under it, up to the next heading.
function selectSection(rowId) {
  const rows = S.project.rows, start = rows.findIndex((r) => r.id === rowId); if (start < 0) return;
  let end = start + 1; while (end < rows.length && rows[end].type !== 'section') end++;
  for (const r of rows.slice(start, end)) S.rowSel.add(r.id);
  S.rowAnchor = rowId;
  showRowSelection();
}
function clearRowSelection() { S.rowSel.clear(); S.rowAnchor = null; showRowSelection(); }
const colsCSS = (r) => rowWidths(r).map((w) => `minmax(0, ${w}fr)`).join(' ');
// An "equal heights" row can only be laid out once its pictures' sizes are known, so it is laid out again when one loads.
function refitRow(el) {
  const rowEl = el.closest('.row'), r = rowEl && findRow(S.project, rowEl.dataset.rowId);
  if (r && r.fit) rowEl.querySelector('.row-grid').style.setProperty('--cols', colsCSS(r));
}
function renderGrid(r, i) {
  const grid = h('div', { class: 'row-grid', style: { '--cols': colsCSS(r), '--align': r.align } });
  for (const c of r.cells) grid.append(renderCell(r, c));
  return h('div', { class: 'row grid', dataset: { rowId: r.id } }, rowGrip(r), rowTools(r, i), grid);
}
function cellTools(r, c, m) {
  const t = h('div', { class: 'cell-tools' });
  t.append(h('div', {
    class: 'chip grip', draggable: 'true', role: 'button', tabindex: '0',
    title: 'Drag onto another cell to swap them. With the keyboard, focus this and press an arrow key.',
    'aria-label': `Move cell, column ${r.cells.indexOf(c) + 1} of ${r.cells.length}. Arrow keys swap it with the neighboring cell.`,
    onkeydown: (e) => {
      const d = ARROW_STEPS[e.key]; if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); nudgeCell(r.id, c.id, d[0], d[1]);
    },
    ondragstart: (e) => {
      dragState = { type: 'cell', rowId: r.id, cellId: c.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-ab-cell', c.id);
      const cellEl = e.currentTarget.closest('.cell');
      try { e.dataTransfer.setDragImage(cellEl, 20, 20); } catch {}
    },
    ondragend: endDrag,
  }, icon('grip'), 'Move'));
  if (c.kind === 'media' && m && m.kind === 'video') {
    t.append(h('button', { class: 'chip', title: 'Loop plays silently on repeat, like a GIF. Player shows normal video controls.', onclick: () => toggleVideoMode(r.id, c.id) }, c.video.mode === 'loop' ? 'Loop' : 'Player'));
  }
  if (c.kind === 'media' && m) {
    t.append(h('button', {
      class: 'chip alt-chip', 'aria-expanded': 'false', title: 'Describe this for people who can’t see it. If left blank, the caption is used.',
      onmousedown: (e) => e.preventDefault(),   // keep focus in the alt field, so a click while it's open closes it
      onclick: (e) => toggleAlt(e.currentTarget.closest('.cell')),
    }, altChipLabel(c.alt)));
  }
  if (c.kind === 'media' && m && m.kind === 'image') t.append(h('button', { class: 'chip', title: 'Draw indicator lines with labels on this image', onclick: () => openMarkup(c.path) }, 'Mark up'));
  if (c.kind === 'slides') t.append(h('button', { class: 'chip', title: 'Reorder the steps, write their captions and pick the cover', onclick: () => openSlides(c.id) }, 'Edit steps'));
  t.append(h('button', { class: 'chip', onclick: () => {
    setCellKind(r.id, c.id, 'empty');
    if (c.kind === 'slides' && c.slides.length) toast('Slideshow removed. Press Ctrl+Z to undo.', 3000);
  } }, 'Remove'));
  return t;
}
const altChipLabel = (alt) => (alt ? 'Alt ✓' : 'Alt');
function toggleAlt(cellEl) {
  const field = cellEl.querySelector('.alt');
  if (cellEl.classList.contains('alt-open')) { field.blur(); return; }   // focusout closes it
  cellEl.classList.add('alt-open'); cellEl.querySelector('.alt-chip').setAttribute('aria-expanded', 'true');
  field.focus(); getSelection().selectAllChildren(field); getSelection().collapseToEnd();
}
function closeAlt(field) {
  const cellEl = field.closest('.cell'), chip = cellEl.querySelector('.alt-chip');
  cellEl.classList.remove('alt-open');
  if (chip) { chip.setAttribute('aria-expanded', 'false'); chip.textContent = altChipLabel(field.textContent.trim()); }
}
function renderCell(r, c) {
  const base = { class: 'cell ' + c.kind, dataset: { rowId: r.id, cellId: c.id } };
  if (c.kind === 'empty') {
    return h('div', base, h('div', {},
      h('div', {}, 'Drop a photo or video'),
      h('div', {}, h('button', { class: 'linkish', onclick: () => setCellKind(r.id, c.id, 'text') }, 'or write text')),
      h('div', {}, h('button', { class: 'linkish', onclick: () => setCellKind(r.id, c.id, 'slides') }, 'or start a slideshow')),
      h('div', {}, h('button', { class: 'linkish', title: 'A YouTube video, or a picture or video file on the web', onclick: () => askForLink({ rowId: r.id, cellId: c.id }) }, 'or use a link'))));
  }
  if (c.kind === 'slides') return renderSlidesCell(r, c, base);
  if (c.kind === 'text') {
    return h('div', base, cellTools(r, c, null),
      h('div', { class: 'prose', contenteditable: 'true', spellcheck: 'true', 'data-bind': `text:${r.id}:${c.id}`, 'data-ph': 'Write a description…', html: c.html }));
  }
  const m = mediaOf(c.path);
  let mediaEl;
  if (!m) mediaEl = h('div', { class: 'missing' }, 'This file is no longer in the folder: ', h('code', {}, c.path), '. Put it back and press Rescan, or remove it.');
  // A YouTube video shows its still and a play button. It can only play on the published page (YouTube's player won't
  // run in a page opened from a file), so a click here opens it on YouTube.
  else if (m.kind === 'youtube') mediaEl = h('a', { class: 'media-el yt', href: c.path, target: '_blank', rel: 'noopener', draggable: 'false', title: 'Plays here on the published page. Click to watch it on YouTube.', style: { 'aspect-ratio': m.tall ? '9 / 16' : '16 / 9' } },
    h('img', { src: ytThumb(m), alt: '', draggable: 'false' }), h('span', { class: 'yt-play', 'aria-hidden': 'true' }));
  else if (m.kind === 'video') mediaEl = h('video', { class: 'media-el', 'data-src': c.path, 'data-silent': c.video.mode === 'loop', controls: true, preload: 'metadata', playsinline: true, draggable: 'false', ...knownSize(c.path) });
  else mediaEl = h('img', { class: 'media-el', 'data-src': c.path, alt: '', draggable: 'false', ...knownSize(c.path) });
  const isImage = !!m && m.kind === 'image';
  // A grouped cell always wears a badge with its group's number, in that group's color. In picking mode a button
  // covers the whole cell instead.
  const number = groupNumbers().get(c.group), picked = !!S.grouping && S.grouping.picked.has(c.id);
  if (number) { base.class += ' has-group'; base.style = { '--g': groupColor(number) }; }
  const name = h('div', { class: 'cell-name' + (isImage ? ' low' : ''), title: c.path }, m && m.link ? (m.kind === 'youtube' ? 'YouTube' : `${m.name} · ${m.host}`) : c.path);
  const pick = h('button', {
    class: 'group-pick' + (picked ? ' picked' : ''), 'aria-pressed': String(picked), 'aria-label': `${c.path}${number ? `, in group ${number}` : ''}`,
    onclick: () => pickForGroup(c.id),
  }, h('span', { class: 'group-tag' + (number && !picked ? ' in-group' : '') }, picked ? '✓ Selected' : number ? `Group ${number}` : 'Click to add'));
  return h('div', base,
    !isImage && name,
    number && h('div', { class: 'group-badge' }, `Group ${number}`),
    m && m.kind !== 'youtube' && pick,   // the enlarged view can't step to a YouTube video, so it is in no group
    cellTools(r, c, m),
    h('figure', { class: 'fig' },
      h('div', { class: 'media-wrap' }, mediaEl, isImage && h('div', { class: 'marks-layer', 'data-marks': c.path }), isImage && name, m && h('div', { class: 'alt-box' },
        h('span', { class: 'alt-label' }, 'Alt text'),
        h('div', { class: 'alt', role: 'textbox', 'aria-label': 'Alt text', contenteditable: 'plaintext-only', spellcheck: 'true', 'data-bind': `alt:${r.id}:${c.id}`, 'data-ph': 'Describe what this shows. Blank uses the caption.', 'data-single': '' }, c.alt))),
      h('figcaption', { class: 'caption', contenteditable: 'true', spellcheck: 'true', 'data-bind': `caption:${r.id}:${c.id}`, 'data-ph': 'Add a caption', 'data-single': '', html: c.caption })));
}
// The width and height of a file whose size has been seen before, as attributes for its element. Every change redraws
// the rows, and a picture has no height until it has loaded again; without these the page would collapse for a moment
// on each redraw and lose its scroll position.
function knownSize(path) { const d = S.dims.get(path); return d ? { width: d.w, height: d.h } : {}; }
function hydrateMedia() {
  for (const el of $$('#rows [data-src]')) {
    const path = el.dataset.src;
    if (el.tagName === 'VIDEO') {
      // A video plays with its sound on, as it will for a reader. The silent ones are those the article shows silently:
      // a clip set to "Loop", and a slideshow's cover, which is only a still.
      el.muted = !el.controls || el.hasAttribute('data-silent');
      el.addEventListener('loadedmetadata', () => {
        if (el.videoWidth) { S.dims.set(path, { w: el.videoWidth, h: el.videoHeight }); refitRow(el); }
        if (isFinite(el.duration)) S.durations.set(path, el.duration);
        if (!el.videoWidth) showMediaError(el, path);
      }, { once: true });
      el.addEventListener('error', () => showMediaError(el, path), { once: true });
    } else {
      el.addEventListener('load', () => {
        if (el.naturalWidth) S.dims.set(path, { w: el.naturalWidth, h: el.naturalHeight });
        if (el.parentElement) drawMarks(el.parentElement);   // the overlay needs the image's shape
        refitRow(el);
      }, { once: true });
      el.addEventListener('error', () => showMediaError(el, path), { once: true });
    }
    getURL(path).then((url) => { if (url) el.src = url; });
  }
}
function showMediaError(el, path) {
  if (!el.isConnected) return;
  const isVideo = el.tagName === 'VIDEO';
  el.replaceWith(h('div', { class: 'media-error' },
    linkMedia(path) ? 'This link didn’t load. Check that the address is right, that the file is public, and that you are online.'
    : isVideo ? 'Chrome can’t play this video. It is probably HEVC, which is common for phone footage. Convert it to an H.264 MP4 and press Rescan.'
    : 'Chrome can’t display this image. Convert it to JPG or PNG and press Rescan.',
    h('br'), h('code', {}, path)));
}
