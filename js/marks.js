'use strict';
// Image markup, the data and the drawing: what a mark is, how a label is laid out, and the SVG overlay that the
// editor, the preview and the export all use. The markup editor itself is in markup.js.

/* ---------- Image markup: model and drawing ---------- */
// Image markup. project.marks maps an image's path to its indicator lines, so the markup follows the image wherever it's
// used. Points are fractions of the image's width (x) and height (y); a line's label hangs off its last point.
const cleanLabel = (text) => String(text).replace(/\r/g, '').split('\n').map((ln) => ln.replace(/\s+/g, ' ').trim()).join('\n').trim().slice(0, 300);
// A label is lines of runs, so one box can hold a title and body text: [[{t: 'Drive gear', s: 40, b: true}], [{t: '40 teeth', s: 22}]].
// s is the text height in thousandths of the image's width; b and i (bold, italic) are present only when true, and f
// (a key of FONTS) only when the font isn't the default.
const sameLook = (a, b) => a.s === b.s && !!a.b === !!b.b && !!a.i === !!b.i && a.f === b.f;
const clampText = (n) => Math.min(MARK_TEXT_MAX, Math.max(MARK_TEXT_MIN, Math.round(Number(n)) || MARK_TEXT_DEFAULT));
const labelText = (it) => it.label.map((ln) => ln.map((r) => r.t).join('')).join('\n');
function normLabel(label) {
  const lines = [];
  for (const ln of Array.isArray(label) ? label.slice(0, 12) : []) {
    const runs = [];
    for (const r of Array.isArray(ln) ? ln : []) {
      const t = r && typeof r.t === 'string' ? r.t.replace(/[\u0000-\u001f\u007f​]/g, ' ').replace(/\s+/g, ' ').slice(0, 300) : '';
      if (!t) continue;
      const run = { t, s: clampText(r.s) }, last = runs[runs.length - 1];
      if (r.b) run.b = true;
      if (r.i) run.i = true;
      if (r.f !== 'sans' && Object.hasOwn(FONTS, r.f)) run.f = r.f;
      if (last && sameLook(last, run)) last.t = (last.t + t).replace(/ {2,}/g, ' ');   // same look: one run
      else runs.push(run);
    }
    if (runs.length) { runs[0].t = runs[0].t.trimStart(); runs[runs.length - 1].t = runs[runs.length - 1].t.trimEnd(); }
    lines.push(runs.filter((r) => r.t));
  }
  while (lines.length && !lines[0].length) lines.shift();
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  return lines;
}
function normMark(it, fallbackSize = 'm') {
  const unit = (n) => Math.min(1, Math.max(0, Math.round(Number(n) * 1e4) / 1e4));
  const pair = (pt) => Array.isArray(pt) && isFinite(pt[0]) && isFinite(pt[1]);
  const color = (v) => (MARK_COLORS.find(([hex]) => hex === String(v).toUpperCase()) || [MARK_DEFAULT_COLOR])[0];
  const points = (it && Array.isArray(it.points) ? it.points : []).filter(pair).map((pt) => [unit(pt[0]), unit(pt[1])]);
  if (points.length < 2) return null;
  // Labels saved before rich text were one string with one preset size (the item's, or else the image's).
  const oldSize = MARK_SIZES[Object.hasOwn(MARK_SIZES, it.size) ? it.size : fallbackSize];
  const label = Array.isArray(it.label) ? normLabel(it.label) : normLabel(cleanLabel(str(it.text, '')).split('\n').map((ln) => [{ t: ln, s: oldSize }]));
  const out = { id: typeof it.id === 'string' && /^[a-z0-9]+$/i.test(it.id) ? it.id : uid(), color: color(it.color), textColor: color(it.textColor), label, points };
  if (pair(it.at)) out.at = [unit(it.at[0]), unit(it.at[1])];   // only once the label has been dragged somewhere
  if (Number(it.w) > 0) out.w = Math.min(1, Math.max(LABEL_MIN_WIDTH / 1000, Math.round(Number(it.w) * 1e4) / 1e4));   // only once an edge of its box has been dragged
  return out;
}
const r1 = (n) => Math.round(n * 10) / 10;
const markHalo = (color) => (color === '#111111' ? '#FFFFFF' : '#000000');   // a faint outline keeps marks readable on busy photos
const LABEL_MIN_WIDTH = 40;   // the narrowest a label's box can be dragged, in drawing units (thousandths of the image's width)
// Measuring a label: how wide its text is, and where its lines break when its box has a set width (w, a fraction of the
// image's width). The browser does this, in a hidden copy of the label box laid out at one screen pixel per drawing
// unit. Working it out here by arithmetic would never quite agree with the box the author types in, and the two have to
// agree. The result is the label as the lines it will be drawn on, and the width of its box, in drawing units.
const labelMeasures = new Map();
let labelRuler = null;
function measureLabel(label, w) {
  const key = JSON.stringify([label, w || 0]);
  if (labelMeasures.has(key)) return labelMeasures.get(key);
  if (!labelRuler) {
    labelRuler = h('div', { class: 'mark-edit mark-ruler', 'aria-hidden': 'true' });
    labelRuler.style.setProperty('--u', '1px');
    document.body.append(labelRuler);
  }
  const box = labelRuler, runs = labelToRuns(label), sizes = label.flat().map((r) => r.s);
  box.style.width = w ? w * 1000 + 'px' : 'max-content';
  box.style.whiteSpace = w ? 'pre-wrap' : 'pre';
  box.style.fontSize = (sizes.length ? Math.min(...sizes) : MARK_TEXT_DEFAULT) + 'px';
  box.innerHTML = runsHTML(runs);
  // Read the lines back, one character at a time. Text runs left to right along a line, so a character that starts to
  // the left of where the one before it ended has wrapped onto a new line.
  const lines = [[]], range = document.createRange();
  let edge = -Infinity;
  for (const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); walker.nextNode();) {
    const node = walker.currentNode, cs = getComputedStyle(node.parentElement), font = fontOf(cs) || 'sans';
    const look = { s: Math.round(parseFloat(cs.fontSize)) };
    if (Number(cs.fontWeight) >= 600) look.b = true;
    if (cs.fontStyle === 'italic') look.i = true;
    if (font !== 'sans') look.f = font;
    for (let i = 0; i < node.length; i++) {
      const ch = node.data[i];
      if (ch === '\n') { lines.push([]); edge = -Infinity; continue; }
      if (ch !== ' ') {                         // a space at a break hangs off the end of its line, so spaces don't decide
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.left < edge - 0.5 && lines[lines.length - 1].length) lines.push([]);
        edge = r.right;
      }
      const line = lines[lines.length - 1], last = line[line.length - 1];
      if (last && sameLook(last, look)) last.t += ch; else line.push({ ...look, t: ch });
    }
  }
  for (const line of lines) {                   // no spaces at either end of a line
    while (line.length && !line[0].t.trimStart()) line.shift();
    while (line.length && !line[line.length - 1].t.trimEnd()) line.pop();
    if (line.length) { line[0].t = line[0].t.trimStart(); line[line.length - 1].t = line[line.length - 1].t.trimEnd(); }
  }
  const measured = { lines, width: w ? w * 1000 : box.getBoundingClientRect().width };
  box.textContent = '';
  if (labelMeasures.size > 400) labelMeasures.clear();
  labelMeasures.set(key, measured);
  return measured;
}
// Lays a label out in drawing units. A label is a box with its lines of text centered in it: as wide as the text needs,
// or the width the author dragged it to, in which case the text wraps. Unless it has been dragged somewhere (it.at, its
// middle), the box hangs beyond the line's last point, on the side the line was heading. Returned: the side, the box,
// its center line (cx), and each line of text with its baseline (y). The metrics match the label editor's CSS (lines
// 1.25 times their tallest text, baseline one text height below the line's top), so what is typed and what is drawn
// line up. base is the text size to assume while the label is still empty.
function labelLayout(it, pts, vh, base = MARK_TEXT_DEFAULT) {
  const sizes = it.label.flat().map((r) => r.s), small = sizes.length ? Math.min(...sizes) : base;
  const measured = measureLabel(it.label, it.w), width = measured.width;
  const tall = measured.lines.map((ln) => (ln.length ? Math.max(...ln.map((r) => r.s)) : small));   // an empty line is as tall as the smallest text
  const height = tall.reduce((sum, m) => sum + m * 1.25, 0), gap = (sizes[0] || base) * 0.45;
  let side, cx, top, ref;
  if (it.at) { ref = [it.at[0] * 1000, it.at[1] * vh]; side = 'free'; cx = ref[0]; top = ref[1] - height / 2; }
  else {
    const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2], dx = ex - px, dy = ey - py;
    ref = [ex, ey];
    if (Math.abs(dx) < Math.hypot(dx, dy) * 0.2) {   // heading straight up or down
      side = dy < 0 ? 'above' : 'below'; cx = ex; top = dy < 0 ? ey - gap - height : ey + gap;
    } else { side = dx > 0 ? 'right' : 'left'; cx = ex + (dx > 0 ? 1 : -1) * (gap + width / 2); top = ey - height / 2; }
  }
  const box = { x: cx - width / 2, y: top, w: width, h: height };
  const lines = measured.lines.map((runs, i) => { const y = top + tall[i]; top += tall[i] * 1.25; return { runs, y }; });
  return { side, cx, ref, gap, box, lines };
}
const markPoints = (it, vh) => it.points.map(([x, y]) => [r1(x * 1000), r1(y * vh)]);
// lineSize is the image's line weight setting; each piece of label text carries its own size.
function markSVG(it, vh, lineSize, withText = true) {
  const pts = markPoints(it, vh), sw = r1(MARK_SIZES[lineSize] * 0.12);
  const line = `points="${pts.map((pt) => pt.join(',')).join(' ')}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  let out = `<polyline ${line} stroke="${markHalo(it.color)}" stroke-opacity=".45" stroke-width="${r1(sw * 2.2)}"/><polyline ${line} stroke="${it.color}" stroke-width="${sw}"/>`;
  if (withText && it.label.length) {
    const a = labelLayout(it, pts, vh);
    out += `<g fill="${it.textColor}" stroke="${markHalo(it.textColor)}" stroke-opacity=".55" stroke-linejoin="round" paint-order="stroke">`
      + a.lines.map((ln) => `<text x="${r1(a.cx)}" y="${r1(ln.y)}" text-anchor="middle" xml:space="preserve">`
        + ln.runs.map((r) => `<tspan font-size="${r.s}" font-weight="${r.b ? 700 : 500}"${r.i ? ' font-style="italic"' : ''}${r.f ? ` font-family="${FONTS[r.f][1]}"` : ''} stroke-width="${r1(r.s * 0.16)}">${escapeHTML(r.t)}</tspan>`).join('')
        + '</text>').join('')
      + '</g>';
  }
  return `<g data-id="${it.id}">${out}</g>`;
}
// The whole overlay for one image, used as is by the editor, the preview and the export. The drawing area is 1000 units
// wide and as tall as the image's shape makes it, so everything scales with the picture.
function marksSVG(mk, dims, skipTextOf = null) {
  if (!mk || !mk.items.length || !dims) return '';
  const vh = r1(1000 * dims.h / dims.w);
  const labels = mk.items.map((it) => labelText(it).replace(/\n/g, ' ')).filter(Boolean);
  const a11y = labels.length ? `role="img" aria-label="${escapeHTML('Labels: ' + labels.join('; '))}"` : 'aria-hidden="true"';
  return `<svg class="marks" viewBox="0 0 1000 ${vh}" preserveAspectRatio="none" ${a11y} font-family="'IBM Plex Sans', system-ui, sans-serif">`
    + mk.items.map((it) => markSVG(it, vh, mk.size, it.id !== skipTextOf)).join('') + '</svg>';
}
// Fills every marks layer under root: the page's cells, and the step cards in the slideshow panel. A layer over a picture
// cropped to fill its box (object-fit: cover, as the step cards are) says data-fit="slice", and its drawing is cropped
// the same way so the lines stay on what they point at.
function drawMarks(root = document) {
  for (const el of $$('[data-marks]', root)) {
    el.innerHTML = marksSVG(S.project.marks[el.dataset.marks], S.dims.get(el.dataset.marks));
    if (el.dataset.fit && el.firstElementChild) el.firstElementChild.setAttribute('preserveAspectRatio', 'xMidYMid ' + el.dataset.fit);
  }
}
