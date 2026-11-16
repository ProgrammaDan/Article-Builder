'use strict';
// Every change to rows and cells. Each goes through commit(), which makes it undoable and saves it.

/* ---------- Mutations ---------- */
function focusBind(bind) {
  // Focus right away (render() is synchronous) so the first keystroke isn't lost; scroll after layout.
  const el = document.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: REDUCE_MOTION ? 'auto' : 'smooth' }));
}
function setCols(rowId, n) {
  let removed = 0;
  commit((p) => {
    const r = findRow(p, rowId);
    while (r.cells.length < n) r.cells.push(emptyCell());
    while (r.cells.length > n) {
      let ei = -1; for (let i = r.cells.length - 1; i >= 0; i--) if (r.cells[i].kind === 'empty') { ei = i; break; }
      if (ei >= 0) r.cells.splice(ei, 1); else { r.cells.pop(); removed++; }
    }
    r.widths = WIDTH_PRESETS[n][0].slice();
  });
  if (removed) toast(`Removed ${removed} cell${removed > 1 ? 's' : ''} with content. Press Ctrl+Z to undo.`);
}
// The Widths button steps through the fixed ratios for the row's number of columns, then "equal heights" where the row
// has two or more pictures or videos to equalize, then back to the first ratio.
function cycleWidths(rowId) {
  commit((p) => {
    const r = findRow(p, rowId), list = WIDTH_PRESETS[r.cells.length];
    if (r.fit) { delete r.fit; r.widths = list[0].slice(); return; }
    const i = list.findIndex((w) => w.join(':') === r.widths.join(':'));
    if (i === list.length - 1 && r.cells.filter(showsMedia).length > 1) r.fit = 'height';
    else r.widths = list[(i + 1) % list.length].slice();
  });
}
function toggleAlign(rowId) { commit((p) => { const r = findRow(p, rowId); r.align = r.align === 'center' ? 'start' : 'center'; }); }
function moveRow(rowId, delta) {
  commit((p) => {
    const i = p.rows.findIndex((r) => r.id === rowId); const j = i + delta;
    if (i < 0 || j < 0 || j >= p.rows.length) return;
    const [r] = p.rows.splice(i, 1); p.rows.splice(j, 0, r);
  });
}
// Moves one or more rows so that they sit, together and in their existing order, just before what is now at insertIndex.
function moveRowsTo(rowIds, insertIndex) {
  commit((p) => {
    const moving = p.rows.filter((r) => rowIds.includes(r.id)); if (!moving.length) return;
    const before = p.rows.slice(0, insertIndex).filter((r) => !rowIds.includes(r.id)).length;   // where that is once they are lifted out
    p.rows = p.rows.filter((r) => !rowIds.includes(r.id));
    p.rows.splice(before, 0, ...moving);
  });
}
const moveRowTo = (rowId, insertIndex) => moveRowsTo([rowId], insertIndex);
function deleteRow(rowId) { commit((p) => { p.rows = p.rows.filter((r) => r.id !== rowId); }); toast('Row deleted. Press Ctrl+Z to undo.', 3000); }
function duplicateRow(rowId) {
  commit((p) => {
    const i = p.rows.findIndex((r) => r.id === rowId);
    const copy = JSON.parse(JSON.stringify(p.rows[i])); copy.id = uid();
    if (copy.cells) copy.cells.forEach((c) => { c.id = uid(); });
    p.rows.splice(i + 1, 0, copy);
  });
}
function insertRowAfter(rowId, kind) {
  const row = kind === 'section' ? { id: uid(), type: 'section', text: '' } : gridRow(2);
  commit((p) => { const i = p.rows.findIndex((r) => r.id === rowId); p.rows.splice(i + 1, 0, row); });
  if (kind === 'section') focusBind('section:' + row.id);
}
function addRow(kind) {
  let row;
  if (kind === 'section') row = { id: uid(), type: 'section', text: '' };
  else if (kind === '1') row = { id: uid(), type: 'grid', align: 'start', widths: [1], cells: [{ id: uid(), kind: 'text', html: '' }] };
  else row = gridRow(Number(kind));
  commit((p) => { p.rows.push(row); });
  if (kind === 'section') focusBind('section:' + row.id);
  else if (kind === '1') focusBind(`text:${row.id}:${row.cells[0].id}`);
  else requestAnimationFrame(() => { const el = $(`.row[data-row-id="${row.id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); });
}
function addOutline() {
  commit((p) => {
    for (const title of OUTLINE) { p.rows.push({ id: uid(), type: 'section', text: title }); p.rows.push(gridRow(2)); }
  });
}
function setCellKind(rowId, cellId, kind) {
  commit((p) => {
    const f = findCell(p, rowId, cellId); if (!f) return;
    f.row.cells[f.idx] = kind === 'text' ? { id: f.cell.id, kind: 'text', html: '' } : kind === 'slides' ? slidesCell([], f.cell.id) : { id: f.cell.id, kind: 'empty' };
  });
  if (kind === 'text') focusBind(`text:${rowId}:${cellId}`);
  if (kind === 'slides') openSlides(cellId);
}
async function placeMedia(rowId, cellId, path) {
  await ensureDurations([path]);
  commit((p) => {
    const f = findCell(p, rowId, cellId); if (!f) return;
    const caption = f.cell.kind === 'media' ? f.cell.caption : '';
    const next = mediaCell(path, caption, f.cell.id);
    if (f.cell.kind === 'media' && f.cell.group) next.group = f.cell.group;   // swapping the picture keeps its place in a group
    f.row.cells[f.idx] = next;
  });
}
function swapCells(aRow, aCell, bRow, bCell) {
  commit((p) => {
    const a = findCell(p, aRow, aCell), b = findCell(p, bRow, bCell);
    if (!a || !b || (a.row === b.row && a.idx === b.idx)) return;
    a.row.cells[a.idx] = b.cell; b.row.cells[b.idx] = a.cell;
  });
}
// Keyboard version of dragging the Move chip: swap with the next cell in that direction.
// Up and down go to the nearest grid row, skipping section headings.
function nudgeCell(rowId, cellId, dx, dy) {
  const p = S.project; const f = findCell(p, rowId, cellId); if (!f) return;
  let row = f.row, idx = f.idx + dx;
  if (dy) {
    let i = p.rows.indexOf(f.row) + dy;
    while (p.rows[i] && p.rows[i].type !== 'grid') i += dy;
    row = p.rows[i]; if (!row) return;
    idx = Math.min(f.idx, row.cells.length - 1);
  }
  const target = row.cells[idx]; if (!target) return;
  swapCells(rowId, cellId, row.id, target.id);
  const chip = $(`.cell[data-cell-id="${CSS.escape(cellId)}"] .chip.grip`); if (chip) chip.focus();   // the re-render dropped focus
}
function toggleVideoMode(rowId, cellId) {
  commit((p) => { const f = findCell(p, rowId, cellId); if (f) f.cell.video.mode = f.cell.video.mode === 'loop' ? 'player' : 'loop'; });
}
async function appendMediaRows(paths, afterRowId = null) {
  if (!paths.length) return;
  await ensureDurations(paths);
  const rows = [];
  if (paths.length === 1) {
    rows.push({ id: uid(), type: 'grid', align: 'start', widths: [3, 2], cells: [mediaCell(paths[0]), { id: uid(), kind: 'text', html: '' }] });
  } else {
    const per = paths.length <= 4 ? paths.length : 3;
    for (let i = 0; i < paths.length; i += per) {
      const chunk = paths.slice(i, i + per);
      rows.push({ id: uid(), type: 'grid', align: 'start', widths: WIDTH_PRESETS[chunk.length][0].slice(), cells: chunk.map((pp) => mediaCell(pp)) });
    }
  }
  commit((p) => {
    const i = afterRowId ? p.rows.findIndex((r) => r.id === afterRowId) : -1;
    if (i >= 0) p.rows.splice(i + 1, 0, ...rows); else p.rows.push(...rows);
  });
  requestAnimationFrame(() => { const el = $(`.row[data-row-id="${rows[rows.length - 1].id}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); });
}
