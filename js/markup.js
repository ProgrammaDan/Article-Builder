'use strict';
// Image markup mode: drawing indicator lines, dragging points and labels, and the rich text label box.
// What a mark is and how it is drawn is in marks.js.

/* ---------- Image markup mode ---------- */
// sel: id of the selected line. draw: the points of the line being drawn, in drawing units (see marksSVG). hover: where the
// next point would land. edit: {id, item} while a label is being typed; id is null for a line that isn't saved yet.
// drag: {item, i, ...} while a point (i) or a label (i null) of a saved line is being dragged; item is a working copy.
// color, textColor, textSize and textFont are what the next line gets; size is the open image's line weight. While a label is
// being typed, range is the last text selection in it (kept so a toolbar control can act on it after taking focus) and
// pending is a text size or font chosen with nothing selected ({size, font}), waiting for the next typed character.
const MK = { path: null, sel: null, draw: null, hover: null, edit: null, drag: null, range: null, pending: null, swallowClick: false, color: MARK_DEFAULT_COLOR, textColor: MARK_DEFAULT_COLOR, textSize: MARK_TEXT_DEFAULT, textFont: 'sans', size: 'm', vh: 0, back: null };

async function openMarkup(path) {
  const m = mediaOf(path); if (!m || m.kind !== 'image') return;
  const dims = await ensureDims(path), url = await getURL(path);
  if (!dims || !url) { toast('Chrome can’t display this image, so it can’t be marked up.'); return; }
  flushEdit();
  Object.assign(MK, { path, sel: null, draw: null, hover: null, edit: null, drag: null, vh: 1000 * dims.h / dims.w, size: (S.project.marks[path] || {}).size || 'm', back: document.activeElement });
  $('#markupName').textContent = path; $('#markupName').title = path;
  $('#mkImg').src = url; $('#markup').hidden = false;
  renderMarkup(); $('#markupDoneBtn').focus();
}
function closeMarkup() {
  if (!MK.path) return;
  endLabel();                                  // keeps a label that was still being typed
  MK.path = MK.draw = MK.hover = MK.sel = MK.drag = null;
  $('#markup').hidden = true; $('#mkImg').removeAttribute('src'); $('#mkMarks').replaceChildren(); $('#mkUI').replaceChildren();
  if (MK.back && MK.back.isConnected) MK.back.focus();
}
// Every change to the open image's marks goes through here, so it is undoable and saved like any other edit.
function editMarks(fn) {
  const path = MK.path;
  return commit((p) => {
    const mk = p.marks[path] || { size: MK.size, items: [] };
    fn(mk);
    if (mk.items.length) p.marks[path] = mk; else delete p.marks[path];
  });
}
function renderMarkup() {
  if (!MK.path) return;
  const d = S.dims.get(MK.path);
  if (!mediaOf(MK.path) || !d) { closeMarkup(); return; }
  const mk = S.project.marks[MK.path]; if (mk) MK.size = mk.size;
  // A label being typed or something being dragged is shown from its working copy, so changes appear at once.
  const working = MK.edit && MK.edit.id ? MK.edit.item : MK.drag && MK.drag.moved ? MK.drag.item : null;
  const items = (mk ? mk.items : []).map((it) => (working && it.id === working.id ? working : it));
  if (MK.sel && !items.some((it) => it.id === MK.sel)) MK.sel = null;
  const sel = items.find((it) => it.id === MK.sel);

  // Set the hint first: its height decides how much room the picture gets.
  const hint = MK.edit ? 'Type the label. Enter finishes it, Shift+Enter starts a new line. Leave it empty for a line with no label.'
    : MK.draw ? 'Click to add a corner; the line snaps to 15° steps. Double-click or press Enter to finish, Backspace to take back a point, Esc to cancel.'
    : MK.sel ? 'Drag a point to reshape the line (it stays on 15° steps) or drag the label to move it; drag either side of the label’s box to set its width. Click the label to edit its text; colors and text size apply to this line. Delete removes it.'
    : 'Click the part of the image you want to point out to start a line. Click a line to select it, or drag any label to move it.';
  if ($('#markupHint').textContent !== hint) $('#markupHint').textContent = hint;

  // Fit the picture to the stage. k is drawing units per screen pixel, for things that must stay a fixed size on screen.
  const stage = $('#markupStage'), img = $('#mkImg');
  const w = Math.max(60, Math.floor(Math.min(stage.clientWidth - 48, (stage.clientHeight - 48) * d.w / d.h)));
  img.style.width = w + 'px'; img.style.height = w * d.h / d.w + 'px';
  const k = 1000 / w, vh = MK.vh;

  for (const [id, key] of [['#mkLineColors', 'color'], ['#mkTextColors', 'textColor']]) {
    for (const b of $$(id + ' .swatch')) b.setAttribute('aria-pressed', String(b.dataset.color === MK[key]));
  }
  for (const b of $$('#mkSizes .tb')) { const on = b.dataset.size === MK.size; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  syncTextTools();
  $('#mkDeleteBtn').disabled = !sel;
  $('#mkResetBtn').disabled = !(sel && (sel.at || sel.w));

  // The saved marks, drawn by the same code as the export. A label being typed is left out; the editor box stands in for it.
  $('#mkMarks').innerHTML = marksSVG({ size: MK.size, items }, d, MK.edit && MK.edit.id);

  // On top: click targets, the selection, and the line in progress.
  const ui = $('#mkUI'); ui.setAttribute('viewBox', `0 0 1000 ${r1(vh)}`);
  ui.classList.toggle('drawing', !!MK.draw); ui.classList.toggle('dragging', !!(MK.drag && MK.drag.moved));
  const pad = 4 * k, handle = (x, y) => `<circle class="mk-handle" cx="${r1(x)}" cy="${r1(y)}" r="${r1(4.5 * k)}"/>`;
  let out = '';
  for (const it of items) {
    out += `<polyline class="mk-hit" data-id="${it.id}" points="${markPoints(it, vh).map((pt) => pt.join(',')).join(' ')}" fill="none" stroke="transparent" stroke-width="${r1(16 * k)}" pointer-events="stroke"/>`;
  }
  for (const it of items) {                    // each label's box: the target to select or drag it by
    if (!it.label.length || (MK.edit && it.id === MK.edit.id)) continue;
    const b = labelLayout(it, markPoints(it, vh), vh).box;
    const box = `x="${r1(b.x - pad)}" y="${r1(b.y - pad)}" width="${r1(b.w + 2 * pad)}" height="${r1(b.h + 2 * pad)}"`;
    out += `<rect class="mk-hit" data-id="${it.id}" data-label ${box} fill="transparent" pointer-events="all"/>`;
    if (it.id !== MK.sel) continue;
    out += `<rect class="mk-selbox" ${box}/>`;
    for (const [edge, x] of [['l', b.x - pad], ['r', b.x + b.w + pad]]) {   // its left and right edges: drag to set the box's width
      out += `<rect class="mk-edge" data-id="${it.id}" data-edge="${edge}" x="${r1(x - 6 * k)}" y="${r1(b.y - pad)}" width="${r1(12 * k)}" height="${r1(b.h + 2 * pad)}"/>`
        + `<rect class="mk-edge-mark" x="${r1(x - 2.5 * k)}" y="${r1(b.y + b.h / 2 - 9 * k)}" width="${r1(5 * k)}" height="${r1(18 * k)}" rx="${r1(2.5 * k)}"/>`;
    }
  }
  if (sel) {             // the selected line's points: a visible dot, and a larger invisible target to grab it by
    markPoints(sel, vh).forEach(([x, y], i) => { out += handle(x, y) + `<circle class="mk-grab" data-id="${sel.id}" data-i="${i}" cx="${x}" cy="${y}" r="${r1(10 * k)}"/>`; });
  }
  const live = MK.draw ? { id: 'live', color: MK.color, textColor: MK.textColor, label: [], points: MK.draw.map(([x, y]) => [x / 1000, y / vh]) } : MK.edit && !MK.edit.id ? MK.edit.item : null;
  if (live && live.points.length > 1) out += `<g pointer-events="none">${markSVG(live, vh, MK.size, false)}</g>`;
  if (MK.draw) {
    const [lx, ly] = MK.draw[MK.draw.length - 1], sw = r1(MARK_SIZES[MK.size] * 0.12);
    if (MK.hover) {      // where the next click would put a point
      out += `<line class="mk-preview" x1="${r1(lx)}" y1="${r1(ly)}" x2="${r1(MK.hover[0])}" y2="${r1(MK.hover[1])}" stroke="${MK.color}" stroke-width="${sw}" stroke-dasharray="${r1(sw * 2.5)} ${r1(sw * 2.5)}"/>`
        + `<circle class="mk-preview" cx="${r1(MK.hover[0])}" cy="${r1(MK.hover[1])}" r="${r1(sw * 1.6)}" style="fill:${MK.color}"/>`;
    }
    out += handle(lx, ly);
  }
  ui.innerHTML = out;

  // The label editor sits where the label will be drawn.
  const ed = $('#mkEdit');
  if (MK.edit) placeLabelEditor();
  ed.hidden = !MK.edit;
}
// Puts the label box where the label will be drawn. Its gap from the line follows the first text size, as labelLayout's does.
function placeLabelEditor() {
  const ed = $('#mkEdit'), it = MK.edit.item, vh = MK.vh, u = parseFloat($('#mkImg').style.width) / 1000;
  const a = labelLayout({ ...it, label: [] }, markPoints(it, vh), vh, MK.edit.base), gap = r1(a.gap * u);
  ed.style.left = a.ref[0] / 10 + '%'; ed.style.top = a.ref[1] / vh * 100 + '%';
  ed.style.setProperty('--u', u + 'px');       // one drawing unit in screen pixels; every text size in the box is a multiple of it
  ed.style.color = it.textColor;
  // As wide as its text, or the width its box was dragged to, in which case the text wraps as it is typed.
  ed.style.width = it.w ? it.w * 1000 * u + 'px' : 'max-content';
  ed.style.whiteSpace = it.w ? 'pre-wrap' : 'pre';
  ed.style.transform = { right: `translate(${gap}px, -50%)`, left: `translate(calc(-100% - ${gap}px), -50%)`, above: `translate(-50%, calc(-100% - ${gap}px))`, below: `translate(-50%, ${gap}px)`, free: 'translate(-50%, -50%)' }[a.side];
}
function finishLine() {
  const pts = MK.draw; MK.draw = MK.hover = null;
  if (!pts || pts.length < 2) { renderMarkup(); return; }   // a single point isn't a line
  MK.sel = null;
  MK.edit = { id: null, item: { id: uid(), color: MK.color, textColor: MK.textColor, label: [], points: pts.map(([x, y]) => [x / 1000, y / MK.vh]) } };
  startLabel();
}
const savedMark = (id) => { const mk = S.project.marks[MK.path]; return mk && mk.items.find((x) => x.id === id); };
// Selecting a line also loads its colors into the toolbar.
function selectMark(it) { Object.assign(MK, { sel: it.id, color: it.color, textColor: it.textColor }); }
function editLabel(id) {
  const it = savedMark(id); if (!it) return;
  selectMark(it); MK.edit = { id, item: JSON.parse(JSON.stringify(it)) };
  startLabel();
}

// The label editor is a rich text box. Sizes inside it are written as multiples of --u (one drawing unit in screen pixels)
// so it shows exactly what will be drawn, at any zoom.
const sizeCSS = (size) => `calc(var(--u) * ${size})`;
// Inside the box a label is one flat run of characters, line breaks included (as newline characters, which is how the
// browser stores Shift+Enter here). Runs of text with the same look are each wrapped once and never nested, and the line
// breaks sit between the wrappers, not inside them: an element holds open every line it touches at its own text size, so
// anything else would make the box lay out differently from the drawn label.
function runsHTML(runs) {
  return runs.map((r) => r.t.split('\n').map((part) => {
    if (!part) return '';
    let t = escapeHTML(part);
    if (r.i) t = `<i>${t}</i>`;
    if (r.b) t = `<b>${t}</b>`;
    return `<font style="font-size: ${sizeCSS(r.s)}${r.f ? `; font-family: ${FONTS[r.f][1]}` : ''}">${t}</font>`;
  }).join('\n')).join('');
}
const labelToRuns = (label) => label.flatMap((ln, i) => (i ? [{ t: '\n', s: MARK_TEXT_DEFAULT }, ...ln] : ln));
// Reads the box as it stands. It goes by how each piece of text actually looks (its computed size, weight, slant and
// font), not by which tags the browser happened to use for it.
function labelRuns() {
  const ed = $('#mkEdit'), u = parseFloat(ed.style.getPropertyValue('--u')) || 1, runs = [];
  const add = (t, el) => {
    const cs = getComputedStyle(el), run = { t, s: clampText(parseFloat(cs.fontSize) / u) }, last = runs[runs.length - 1];
    if (Number(cs.fontWeight) >= 600) run.b = true;
    if (cs.fontStyle === 'italic') run.i = true;
    if ((fontOf(cs) || 'sans') !== 'sans') run.f = fontOf(cs);
    if (last && sameLook(last, run)) last.t += t; else runs.push(run);
  };
  (function walk(node) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.textContent) add(n.textContent, n.parentElement); }
      else if (n.nodeType === 1 && n.tagName === 'BR') add('\n', n.parentElement);
      else if (n.nodeType === 1) walk(n);
    }
  })(ed);
  return runs;
}
function readLabel() {
  const lines = [[]];
  for (const r of labelRuns()) {
    r.t.split('\n').forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, t: part });
    });
  }
  return normLabel(lines);
}
// A wrapper that gives its text a size, a font, or both. Formats are only ever applied with these, through rich-text.js.
function styledFont({ size, font }) {
  const f = document.createElement('font');
  if (size) f.style.fontSize = sizeCSS(size);
  if (font) f.style.fontFamily = FONTS[font][1];
  return f;
}
// Rewrites the box as flat runs after a size or font change, keeping the caret or selection where it was in the text.
function flattenLabel() {
  const ed = $('#mkEdit');
  if (rebuildKeepingSelection(ed, () => { ed.innerHTML = runsHTML(labelRuns()); })) MK.range = getSelection().getRangeAt(0).cloneRange();
}
// Keeps the box in a shape that lays out like the drawn label. Everything typed gets an explicit size and font (text
// typed into an empty box or on a new line arrives bare), and the box's own font size is held at the smallest size in
// use, so that it never props a line of small text open. style is what bare text should get.
function tidyLabel(style = MK.pending || { size: MK.textSize, font: MK.textFont }) {
  const size = style.size;
  const ed = $('#mkEdit'), sel = getSelection(), keep = sel.rangeCount && ed.contains(sel.anchorNode) ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
  let moved = false;
  for (const n of [...ed.childNodes]) {
    if (n.nodeType === 3 ? !n.textContent.replace(/\n/g, '') : n.nodeType !== 1 || n.tagName === 'BR') continue;   // line breaks stay bare
    if (n.nodeType === 1 && n.tagName === 'FONT') { if (!n.style.fontSize) n.style.fontSize = sizeCSS(size); continue; }
    const f = styledFont(style);
    n.before(f); f.append(n); moved = true;
  }
  if (moved && keep) sel.setBaseAndExtent(...keep);   // wrapping moved the node the caret was in
  const u = parseFloat(ed.style.getPropertyValue('--u')) || 1, sizes = [];
  for (const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); w.nextNode();) if (w.currentNode.textContent) sizes.push(Math.round(parseFloat(getComputedStyle(w.currentNode.parentElement).fontSize) / u));
  ed.style.fontSize = sizeCSS(sizes.length ? Math.min(...sizes) : size);
  if (MK.edit) { MK.edit.base = sizes.length ? sizes[0] : size; placeLabelEditor(); }
}
function startLabel() {
  const ed = $('#mkEdit'), label = MK.edit.item.label;
  MK.range = MK.pending = null;
  if (label.length) MK.textSize = label[0][0] ? label[0][0].s : MK.textSize;
  MK.edit.base = MK.textSize;                  // the size the label's gap from its line is worked out from while typing
  ed.innerHTML = runsHTML(labelToRuns(label));
  renderMarkup(); tidyLabel(); ed.focus(); getSelection().selectAllChildren(ed); getSelection().collapseToEnd();
}
function endLabel() {
  const edit = MK.edit; if (!edit) return;
  const label = readLabel();                   // while the box is still laid out
  MK.edit = MK.range = MK.pending = null; MK.sel = null;   // nothing selected afterwards, so the next click starts a new line
  if (!putMark(normMark({ ...edit.item, label }))) renderMarkup();
}
// Saves a line: replaces the one with the same id, or adds it.
function putMark(item) {
  return editMarks((mk) => { const i = mk.items.findIndex((x) => x.id === item.id); if (i < 0) mk.items.push(item); else mk.items[i] = item; });
}
// A color for one line or its label. It applies to the label being typed, else to the selected line, and either way
// becomes what the next line gets.
function setMarkProp(key, value) {
  MK[key] = value;
  if (MK.edit) MK.edit.item[key] = value;
  else if (MK.sel && editMarks((mk) => { const it = mk.items.find((x) => x.id === MK.sel); if (it) it[key] = value; })) return;
  renderMarkup();
}
// Font, text size, bold and italic follow the usual text box convention: while a box is open they act on the selected
// text, or on what is typed next when nothing is selected; with a label selected but not open they act on all of its text.
const backToLabel = () => refocusBox($('#mkEdit'), MK.range);
function applyTextSize(raw) {
  const n = Number(raw);
  if (!String(raw).trim() || !isFinite(n)) { syncTextTools(); return; }
  const size = clampText(n);
  MK.textSize = size;
  if (MK.edit) {
    const ed = $('#mkEdit'), sel = getSelection();
    backToLabel();
    if (!ed.textContent) { MK.pending = null; tidyLabel({ size, font: MK.textFont }); }                                  // an empty box: the size it starts with
    else if (sel.isCollapsed) MK.pending = { size, font: MK.textFont, node: sel.anchorNode, offset: sel.anchorOffset };   // nothing selected: what is typed next
    else { wrapTextInRange(ed, sel.getRangeAt(0), () => styledFont({ size })); flattenLabel(); tidyLabel(); }             // the selected text only
    syncTextTools();
  } else if (!(MK.sel && editMarks((mk) => { const it = mk.items.find((x) => x.id === MK.sel); if (it) for (const r of it.label.flat()) r.s = size; }))) renderMarkup();
}
function applyTextFont(font) {
  if (!Object.hasOwn(FONTS, font)) { syncTextTools(); return; }
  MK.textFont = font;
  const set = (r) => { if (font === 'sans') delete r.f; else r.f = font; };   // the default font isn't stored
  if (MK.edit) {
    const ed = $('#mkEdit'), sel = getSelection();
    backToLabel();
    if (!ed.textContent) MK.pending = null;                                                                               // an empty box: the font it starts with
    else if (sel.isCollapsed) MK.pending = { size: MK.textSize, font, node: sel.anchorNode, offset: sel.anchorOffset };   // nothing selected: what is typed next
    else { wrapTextInRange(ed, sel.getRangeAt(0), () => styledFont({ font })); flattenLabel(); tidyLabel(); }             // the selected text only
    syncTextTools();
  } else if (!(MK.sel && editMarks((mk) => { const it = mk.items.find((x) => x.id === MK.sel); if (it) it.label.flat().forEach(set); }))) renderMarkup();
}
function toggleTextStyle(key) {   // 'b' or 'i'
  if (MK.edit) { backToLabel(); document.execCommand(key === 'b' ? 'bold' : 'italic'); tidyLabel(); syncTextTools(); return; }
  if (!MK.sel) return;
  editMarks((mk) => {
    const it = mk.items.find((x) => x.id === MK.sel), runs = it ? it.label.flat() : [], on = !runs.every((r) => r[key]);
    for (const r of runs) { if (on) r[key] = true; else delete r[key]; }
  });
}
// Shows in the toolbar what applies at the caret (or to the selected label): its font and size, and whether it is bold or
// italic. Font and size go blank when a selected label mixes them.
function syncTextTools() {
  const ed = $('#mkEdit'), sel = getSelection(), it = !MK.edit && MK.sel ? savedMark(MK.sel) : null;
  let size = MK.textSize, font = MK.textFont, bold = false, italic = false;
  if (MK.edit) {
    const [node, offset] = sel.rangeCount && ed.contains(sel.focusNode) ? [sel.focusNode, sel.focusOffset] : MK.range ? [MK.range.endContainer, MK.range.endOffset] : [ed, 0];
    let el = node.nodeType === 3 ? node.parentElement : node;
    if (el === ed) {                           // on a new line, between runs: go by the text just before the caret
      let prev = node.nodeType === 3 ? node.previousSibling : node.childNodes[offset - 1];
      while (prev && prev.nodeName !== 'FONT') prev = prev.previousSibling;
      if (prev) el = prev;
    }
    const cs = getComputedStyle(el), u = parseFloat(ed.style.getPropertyValue('--u')) || 1;
    size = MK.pending ? MK.pending.size : ed.textContent ? Math.round(parseFloat(cs.fontSize) / u) : MK.textSize;
    font = MK.pending ? MK.pending.font : ed.textContent ? fontOf(cs) || 'sans' : MK.textFont;
    MK.textFont = font;
    if (document.activeElement === ed) { bold = document.queryCommandState('bold'); italic = document.queryCommandState('italic'); }
    else { bold = Number(cs.fontWeight) >= 600; italic = cs.fontStyle === 'italic'; }
    MK.textSize = size;
  } else if (it && it.label.length) {
    const runs = it.label.flat(), sizes = new Set(runs.map((r) => r.s)), fonts = new Set(runs.map((r) => r.f || 'sans'));
    size = sizes.size === 1 ? runs[0].s : '';
    font = fonts.size === 1 ? runs[0].f || 'sans' : '';
    bold = runs.every((r) => r.b); italic = runs.every((r) => r.i);
    if (size) MK.textSize = size;
    if (font) MK.textFont = font;
  }
  if (document.activeElement !== $('#mkFontSize')) $('#mkFontSize').value = size;
  $('#mkFont').value = font;
  for (const [id, on] of [['#mkBold', bold], ['#mkItalic', italic]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
}
// Back to where and how wide the label would be by itself: at the end of its line, as wide as its text.
function resetLabel() {
  if (!editMarks((mk) => { const it = mk.items.find((x) => x.id === MK.sel); if (it) { delete it.at; delete it.w; } })) renderMarkup();
}
function setMarkSize(size) {
  MK.size = size;
  if (!(S.project.marks[MK.path] && editMarks((mk) => { mk.size = size; }))) renderMarkup();
}
function deleteMark() {
  const id = MK.sel; if (!id) return;
  MK.sel = null;
  if (!editMarks((mk) => { mk.items = mk.items.filter((x) => x.id !== id); })) renderMarkup();
}
function setupMarkup() {
  const ui = $('#mkUI'), keepFocus = (e) => e.preventDefault();   // toolbar clicks mustn't end a label that's being typed
  for (const [id, key] of [['#mkLineColors', 'color'], ['#mkTextColors', 'textColor']]) {
    $(id).replaceChildren(...MARK_COLORS.map(([hex, name]) => h('button', {
      class: 'swatch', style: { '--c': hex }, dataset: { color: hex }, title: name, 'aria-label': name, 'aria-pressed': 'false',
      onmousedown: keepFocus, onclick: () => setMarkProp(key, hex),
    })));
  }
  $('#mkSizes').replaceChildren(...Object.keys(MARK_SIZES).map((s) => h('button', { class: 'tb', dataset: { size: s }, 'aria-pressed': 'false', onmousedown: keepFocus, onclick: () => setMarkSize(s) }, s.toUpperCase())));
  for (const [id, key] of [['#mkBold', 'b'], ['#mkItalic', 'i']]) { $(id).addEventListener('mousedown', keepFocus); $(id).addEventListener('click', () => toggleTextStyle(key)); }
  $('#mkFontSize').addEventListener('change', (e) => applyTextSize(e.target.value));
  $('#mkFont').replaceChildren(...Object.entries(FONTS).map(([key, [name, stack]]) => h('option', { value: key, style: { 'font-family': stack } }, name)));
  $('#mkFont').addEventListener('change', (e) => applyTextFont(e.target.value));
  $('#mkResetBtn').addEventListener('click', resetLabel);
  $('#mkDeleteBtn').addEventListener('click', deleteMark);
  $('#markupDoneBtn').addEventListener('click', closeMarkup);
  // The label box. Typing a size takes focus to the size field without ending the label; leaving both does end it.
  const ed = $('#mkEdit'), inTools = (el) => !!el && !!el.closest('.mk-tools');
  ed.addEventListener('blur', (e) => { if (!inTools(e.relatedTarget)) endLabel(); });
  $('.mk-tools').addEventListener('focusout', (e) => { if (MK.edit && e.relatedTarget !== ed && !inTools(e.relatedTarget)) endLabel(); });
  ed.addEventListener('beforeinput', (e) => {   // the first text typed after choosing a size or font with nothing selected takes it
    const pend = MK.pending, sel = getSelection();
    if (!pend || e.inputType !== 'insertText' || !e.data || !sel.isCollapsed || !ed.contains(sel.anchorNode)) return;
    e.preventDefault();
    insertWrappedText(e.data, () => styledFont(pend));
    MK.pending = null; flattenLabel(); tidyLabel(pend); syncTextTools();
  });
  ed.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') flattenLabel();   // moves the new break out of the run it was typed in
    tidyLabel(); MK.pending = null; syncTextTools();
  });
  ed.addEventListener('compositionend', () => { tidyLabel(); MK.pending = null; });
  ed.addEventListener('paste', (e) => {        // text only; formatting is applied here, with the toolbar
    e.preventDefault();
    e.clipboardData.getData('text/plain').replace(/\r/g, '').split('\n').forEach((ln, i) => {
      if (i) document.execCommand('insertLineBreak');
      if (ln) document.execCommand('insertText', false, ln);
    });
  });
  document.addEventListener('selectionchange', () => {
    const sel = getSelection();
    if (!MK.edit || !sel.rangeCount || !ed.contains(sel.anchorNode)) return;
    MK.range = sel.getRangeAt(0).cloneRange();
    if (MK.pending && (!sel.isCollapsed || sel.anchorNode !== MK.pending.node || sel.anchorOffset !== MK.pending.offset)) MK.pending = null;   // the caret moved on
    syncTextTools();
  });
  window.addEventListener('resize', renderMarkup);

  const at = (e) => { const r = ui.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 1000, (e.clientY - r.top) / r.height * MK.vh]; };
  // The next point: as far from the last one as the pointer is, at the nearest allowed angle, and kept inside the picture
  // by shortening the segment (never by bending it).
  const snap = (from, to) => {
    const step = MARK_SNAP_DEG * Math.PI / 180, a = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / step) * step;
    const ux = Math.cos(a), uy = Math.sin(a), reach = (p, u, max) => (u > 1e-9 ? (max - p) / u : u < -1e-9 ? -p / u : Infinity);
    const len = Math.max(0, Math.min(Math.hypot(to[0] - from[0], to[1] - from[1]), reach(from[0], ux, 1000), reach(from[1], uy, MK.vh)));
    return [from[0] + ux * len, from[1] + uy * len];
  };
  ui.addEventListener('mousemove', (e) => { if (MK.draw) { MK.hover = snap(MK.draw[MK.draw.length - 1], at(e)); renderMarkup(); } });
  ui.addEventListener('mouseleave', () => { if (MK.draw && MK.hover) { MK.hover = null; renderMarkup(); } });
  // Dragging a point of the selected line. An end point turns about its one neighbor in 15° steps, like a point being drawn.
  // A middle point has to keep both of its segments on 15° steps, so it jumps between the places where a 15° line from
  // each neighbor cross, taking the one nearest the pointer (or slides along the line when both neighbors are on one).
  const inside = (pt) => [Math.min(1000, Math.max(0, pt[0])), Math.min(MK.vh, Math.max(0, pt[1]))];
  const between = (A, B, to) => {
    const step = MARK_SNAP_DEG * Math.PI / 180, turns = Math.round(Math.PI / step), far = (P, Q) => Math.hypot(P[0] - Q[0], P[1] - Q[1]);
    let best = null;
    const offer = (pt) => {
      if (pt[0] < -0.01 || pt[0] > 1000.01 || pt[1] < -0.01 || pt[1] > MK.vh + 0.01 || far(pt, A) < 2 || far(pt, B) < 2) return;
      if (!best || far(pt, to) < far(best, to)) best = pt;
    };
    for (let i = 0; i < turns; i++) {
      const ux = Math.cos(i * step), uy = Math.sin(i * step), bx = B[0] - A[0], by = B[1] - A[1];
      if (Math.abs(bx * uy - by * ux) < 0.5) {   // both neighbors lie on this line: anywhere along it keeps both angles
        const t = (to[0] - A[0]) * ux + (to[1] - A[1]) * uy; offer([A[0] + ux * t, A[1] + uy * t]); continue;
      }
      for (let j = 0; j < turns; j++) {
        if (j === i) continue;
        const vx = Math.cos(j * step), vy = Math.sin(j * step), t = (bx * vy - by * vx) / (ux * vy - uy * vx);
        offer([A[0] + ux * t, A[1] + uy * t]);
      }
    }
    return best;
  };
  ui.addEventListener('mousedown', (e) => {
    MK.swallowClick = !!MK.edit;   // a click away from a label only finishes the label
    if (MK.edit || MK.draw || e.button !== 0) return;
    const grip = e.target.closest('[data-i], [data-edge], [data-label]'), it = grip && savedMark(grip.dataset.id); if (!it) return;
    const pt = at(e), isPoint = grip.hasAttribute('data-i'), lay = isPoint ? null : labelLayout(it, markPoints(it, MK.vh), MK.vh);
    MK.drag = {
      item: JSON.parse(JSON.stringify(it)), i: isPoint ? Number(grip.dataset.i) : null, edge: grip.dataset.edge || null, from: [e.clientX, e.clientY], moved: false,
      box: lay && lay.box, side: lay && lay.side,   // the label's box and placement when the drag began
      off: lay ? [lay.box.x + lay.box.w / 2 - pt[0], lay.box.y + lay.box.h / 2 - pt[1]] : null,   // from the pointer to the label's middle
    };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    const d = MK.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.from[0], e.clientY - d.from[1]) < 4) return;   // not a drag yet, maybe just a click
    const pt = at(e), vh = MK.vh;
    if (d.edge) {
      // An edge of the label's box: the opposite edge stays where it is. A box still hanging off its line keeps doing so
      // if the edge dragged is its far one; dragging the near one (or either edge of a box that has been moved) pins the
      // box in place. A box centered above or below its line widens evenly about its center.
      const x = inside(pt)[0], b = d.box, right = b.x + b.w;
      let w, cx = null;
      if (d.side === 'above' || d.side === 'below') w = 2 * Math.abs(x - (b.x + b.w / 2));
      else if (d.edge === 'r') { w = x - b.x; if (d.side !== 'right') cx = b.x + Math.max(LABEL_MIN_WIDTH, w) / 2; }
      else { w = right - x; if (d.side !== 'left') cx = right - Math.max(LABEL_MIN_WIDTH, w) / 2; }
      d.item.w = Math.min(1000, Math.max(LABEL_MIN_WIDTH, w)) / 1000;
      if (cx !== null) d.item.at = [cx / 1000, (b.y + b.h / 2) / vh];
    } else if (d.i === null) { const mid = inside([pt[0] + d.off[0], pt[1] + d.off[1]]); d.item.at = [mid[0] / 1000, mid[1] / vh]; }
    else {
      const pts = d.item.points.map(([x, y]) => [x * 1000, y * vh]), to = inside(pt);
      const next = pts[d.i - 1] && pts[d.i + 1] ? between(pts[d.i - 1], pts[d.i + 1], to) : snap(pts[d.i - 1] || pts[d.i + 1], to);
      if (next && Math.hypot(next[0] - (pts[d.i - 1] || pts[d.i + 1])[0], next[1] - (pts[d.i - 1] || pts[d.i + 1])[1]) >= 2) d.item.points[d.i] = [next[0] / 1000, next[1] / vh];
    }
    if (!d.moved) { d.moved = true; selectMark(d.item); }
    renderMarkup();
  });
  window.addEventListener('mouseup', () => {
    const d = MK.drag; if (!d) return;
    MK.drag = null;
    if (!d.moved) return;          // it was a click; the click handler deals with it
    MK.swallowClick = true;
    if (!putMark(normMark(d.item))) renderMarkup();
  });
  ui.addEventListener('click', (e) => {
    if (MK.swallowClick) { MK.swallowClick = false; return; }
    if (MK.draw) {
      if (e.detail > 1) return;   // the second click of a double-click; dblclick finishes the line
      const last = MK.draw[MK.draw.length - 1], pt = snap(last, at(e)), px = ui.getBoundingClientRect().width / 1000;
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * px >= 4) MK.draw.push(pt);   // not two points on the same spot
      renderMarkup(); return;
    }
    const hit = e.target.closest('[data-id]');
    if (hit && hit.dataset.id === MK.sel && hit.hasAttribute('data-label')) { editLabel(MK.sel); return; }
    if (hit) selectMark(savedMark(hit.dataset.id));
    else if (MK.sel) MK.sel = null;
    else { const pt = at(e); MK.draw = [[Math.min(1000, Math.max(0, pt[0])), Math.min(MK.vh, Math.max(0, pt[1]))]]; MK.hover = null; }
    renderMarkup();
  });
  ui.addEventListener('dblclick', (e) => {
    if (MK.draw) { finishLine(); return; }
    const hit = e.target.closest('[data-id]'); if (hit) editLabel(hit.dataset.id);
  });

  // Capture phase, and stopped here, so these keys never reach the editor underneath.
  document.addEventListener('keydown', (e) => {
    if (!MK.path) return;
    const k = e.key, own = () => { e.preventDefault(); e.stopPropagation(); };
    if (MK.drag && MK.drag.moved) { own(); return; }   // mid-drag: let the mouse finish first
    if (e.target === $('#mkFontSize') || e.target === $('#mkFont')) {   // in the size field or font menu: they apply through their own change event; Esc backs out
      if (k === 'Escape') { own(); if (MK.edit) backToLabel(); else e.target.blur(); syncTextTools(); }
      return;
    }
    if (MK.edit) { if ((k === 'Enter' && !e.shiftKey) || k === 'Escape') { own(); $('#mkEdit').blur(); } return; }
    if (MK.draw) {
      if (k === 'Enter') { own(); finishLine(); return; }
      if (k === 'Escape') MK.draw = MK.hover = null;
      else if (k === 'Backspace' || ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z')) { MK.draw.pop(); MK.hover = null; if (!MK.draw.length) MK.draw = null; }
      else return;
      own(); renderMarkup(); return;
    }
    const onButton = e.target.closest && e.target.closest('button');
    if (k === 'Escape') { own(); if (MK.sel) { MK.sel = null; renderMarkup(); } else closeMarkup(); }
    else if (MK.sel && (k === 'Delete' || k === 'Backspace')) { own(); deleteMark(); }
    else if (MK.sel && k === 'Enter' && !onButton) { own(); editLabel(MK.sel); }
  }, true);
}
