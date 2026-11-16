'use strict';
// Slideshows in the editor: the changes you can make to one, its cell in the page, and the steps panel.
// How a slideshow is written into the exported page is in article.js; the viewer is in template.js.

/* ---------- Slideshows: changes ---------- */
// Slideshows. A new one gets a text cell beside it, like a single dropped photo does.
function addSlideshow(paths) {
  const cell = slidesCell(paths);
  const row = { id: uid(), type: 'grid', align: 'start', widths: [3, 2], cells: [cell, { id: uid(), kind: 'text', html: '' }] };
  commit((p) => { p.rows.push(row); });
  const el = $(`.row[data-row-id="${row.id}"]`); if (el) el.scrollIntoView({ block: 'center' });
  openSlides(cell.id);
}
function editSlides(cellId, fn) {
  return commit((p) => { const f = findCellById(p, cellId); if (f && f.cell.kind === 'slides') fn(f.cell); });
}
function addSlides(cellId, paths, index = Infinity) {
  editSlides(cellId, (c) => { c.slides.splice(Math.min(index, c.slides.length), 0, ...slidesCell(paths).slides); });
}
function moveSlideTo(cellId, slideId, index) {
  editSlides(cellId, (c) => {
    const i = c.slides.findIndex((s) => s.id === slideId); if (i < 0) return;
    const [s] = c.slides.splice(i, 1);
    c.slides.splice(Math.max(0, Math.min(index > i ? index - 1 : index, c.slides.length)), 0, s);
  });
}
function removeSlide(cellId, slideId) {
  editSlides(cellId, (c) => { c.slides = c.slides.filter((s) => s.id !== slideId); if (c.cover === slideId) c.cover = null; });
}
function toggleCover(cellId, slideId) { editSlides(cellId, (c) => { c.cover = c.cover === slideId ? null : slideId; }); }
// A video step is a player with controls unless it is set to loop.
function toggleSlideLoop(cellId, slideId) {
  editSlides(cellId, (c) => { const s = c.slides.find((x) => x.id === slideId); if (s && s.loop) delete s.loop; else if (s) s.loop = true; });
  const again = $(`#slidesList .slide-card[data-slide-id="${CSS.escape(slideId)}"] .slide-mark`); if (again) again.focus({ preventScroll: true });   // the panel was rebuilt
}

/* ---------- Slideshows: the cell and the steps panel ---------- */
// A slideshow in a row shows only its cover. Its steps are edited in the panel below.
function renderSlidesCell(r, c, base) {
  const cover = coverSlide(c), n = c.slides.length;
  let face;
  if (!cover) face = h('div', { class: 'slides-empty' }, n ? 'None of this slideshow’s files are in the folder any more. Put them back and press Rescan.' : 'Drop photos or videos here to add steps');
  else if (S.mediaByPath.get(cover.path).kind === 'video') face = h('video', { class: 'media-el', 'data-src': cover.path, preload: 'metadata', playsinline: true, draggable: 'false', ...knownSize(cover.path) });
  else face = h('img', { class: 'media-el', 'data-src': cover.path, alt: '', draggable: 'false', ...knownSize(cover.path) });
  return h('div', base, cellTools(r, c, null),
    h('figure', { class: 'fig' },
      h('div', { class: 'media-wrap slides-face', title: 'Click to edit the steps', onclick: () => openSlides(c.id) }, face,
        cover && face.tagName === 'IMG' && h('div', { class: 'marks-layer', 'data-marks': cover.path }),
        h('span', { class: 'slides-badge' }, `Slideshow · ${n} step${n === 1 ? '' : 's'}`)),
      h('figcaption', { class: 'caption', contenteditable: 'true', spellcheck: 'true', 'data-bind': `caption:${r.id}:${c.id}`, 'data-ph': 'Add a caption for the slideshow', 'data-single': '', html: c.caption })));
}
function openSlides(cellId) {
  S.slidesOpen = cellId; renderSlidesPanel(); updateSelFoot();
  if (S.slidesOpen) { $('#slidesList').scrollTop = 0; $('#slidesDoneBtn').focus(); }
}
function closeSlides() {
  const cellId = S.slidesOpen; if (!cellId) return;
  flushEdit(); S.slidesOpen = null; renderSlidesPanel(); updateSelFoot();
  const chip = $(`.cell[data-cell-id="${CSS.escape(cellId)}"] .cell-tools button`); if (chip) chip.focus();
}
function renderSlidesPanel() {
  const panel = $('#slidesPanel');
  parkTextbar();
  const f = S.slidesOpen && findCellById(S.project, S.slidesOpen);
  if (!f || f.cell.kind !== 'slides') {      // closed, or the slideshow was undone or removed
    if (S.slidesOpen) { S.slidesOpen = null; updateSelFoot(); }
    panel.hidden = true; $('#slidesList').replaceChildren(); return;
  }
  const c = f.cell, cover = coverSlide(c), n = c.slides.length;
  $('#slidesCount').textContent = n ? ' ' + n : '';
  $('#slidesList').replaceChildren(...c.slides.map((s, i) => slideCard(c, s, i, cover)),
    h('div', { class: 'slide-add', id: 'slidesAdd' }, h('div', {},
      h('div', {}, n ? 'Drop more photos or videos here,' : 'Drop photos or videos here,'),
      h('div', {}, 'or select them in the library and press “Add to this slideshow”.'))));
  panel.hidden = false;
  hydrateThumbs($('#slidesList'));
  drawMarks($('#slidesList'));
}
function slideCard(c, s, i, cover) {
  const m = S.mediaByPath.get(s.path), isCover = cover === s;
  const act = (name) => () => slideAct(c.id, s.id, name);
  return h('div', { class: 'slide-card', dataset: { slideId: s.id } },
    h('div', {
      class: 'slide-thumb', draggable: 'true', title: s.path,
      ondragstart: (e) => {
        const card = e.currentTarget.closest('.slide-card');
        dragState = { type: 'slide', slideId: s.id };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-ab-slide', s.id);
        try { e.dataTransfer.setDragImage(card, 24, 24); } catch {}
        requestAnimationFrame(() => card.classList.add('dragging'));
      },
      ondragend: endDrag,
    },
      m ? h('img', { 'data-thumb': s.path, alt: '', draggable: 'false' }) : h('span', { class: 'thumb-note' }, 'This file is no longer in the folder'),
      m && m.kind === 'image' && h('div', { class: 'marks-layer', 'data-marks': s.path, 'data-fit': 'slice' }),
      h('span', { class: 'slide-num' }, String(i + 1)),
      m && m.kind === 'image' && h('button', { class: 'chip slide-mark', title: 'Draw indicator lines with labels on this image', onclick: () => openMarkup(s.path) }, S.project.marks[s.path] ? 'Mark up ✓' : 'Mark up'),
      m && m.kind === 'video' && h('span', { class: 'slide-kind' }, 'Video'),
      m && m.kind === 'video' && h('button', { class: 'chip slide-mark', title: 'Loop plays silently on repeat while this step is showing, like a GIF. Player shows normal video controls.', onclick: () => toggleSlideLoop(c.id, s.id) }, s.loop ? 'Loop' : 'Player'),
      isCover && h('span', { class: 'slide-flag' }, 'Cover')),
    h('div', { class: 'caption slide-cap', contenteditable: 'true', spellcheck: 'true', 'data-bind': `slide:${c.id}:${s.id}`, 'data-ph': `Describe step ${i + 1}`, 'data-single': '', html: s.caption }),
    h('div', { class: 'slide-tools' },
      h('button', { class: 'tb', 'data-act': 'earlier', title: 'Move earlier', 'aria-label': `Move step ${i + 1} earlier`, disabled: i === 0, onclick: act('earlier') }, '←'),
      h('button', { class: 'tb', 'data-act': 'later', title: 'Move later', 'aria-label': `Move step ${i + 1} later`, disabled: i === c.slides.length - 1, onclick: act('later') }, '→'),
      h('button', { class: 'tb' + (isCover ? ' on' : ''), 'data-act': 'cover', 'aria-pressed': String(isCover), disabled: !m, title: 'Use this as the picture visitors click to open the slideshow. Unless one is picked, the last step is the cover.', onclick: act('cover') }, 'Cover'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'tb danger', 'data-act': 'remove', 'aria-label': `Remove step ${i + 1}`, onclick: act('remove') }, 'Remove')));
}
function slideAct(cellId, slideId, name) {
  const f = findCellById(S.project, cellId); if (!f) return;
  const i = f.cell.slides.findIndex((s) => s.id === slideId);
  if (name === 'earlier') moveSlideTo(cellId, slideId, i - 1);
  else if (name === 'later') moveSlideTo(cellId, slideId, i + 2);
  else if (name === 'cover') toggleCover(cellId, slideId);
  else if (name === 'remove') removeSlide(cellId, slideId);
  // The panel was rebuilt, so put focus back where the keyboard user was.
  const card = `#slidesList .slide-card[data-slide-id="${CSS.escape(slideId)}"]`;
  const again = $(`${card} [data-act="${name}"]:not(:disabled)`) || $(`${card} [data-act]:not(:disabled)`) || $('#slidesDoneBtn');
  again.focus();
}
