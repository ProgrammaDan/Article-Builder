'use strict';
// Media groups: which pictures and videos a reader can flip through together once one of them is enlarged. A group is
// whatever the author picks with "Group media"; nothing about where cells sit in the page decides it. A member carries
// the group's id in cell.group, and the order of stepping is the order of the page.

/* ---------- Media groups ---------- */
// One color per group, in turn, so that the members of a group can be told from their neighbors at a glance.
const GROUP_COLORS = ['#1E7A5A', '#2D6FE0', '#B4532A', '#8A3FA0', '#9A7400', '#C2315A'];
const groupColor = (number) => GROUP_COLORS[(number - 1) % GROUP_COLORS.length];
const mediaCells = (p) => p.rows.flatMap((r) => (r.type === 'grid' ? r.cells.filter((c) => c.kind === 'media') : []));
// The groups, numbered in page order: a Map from group id to its number. One cell on its own is not a group.
function groupNumbers(p = S.project) {
  const counts = new Map(), numbers = new Map();
  for (const c of mediaCells(p)) if (c.group) counts.set(c.group, (counts.get(c.group) || 0) + 1);
  for (const c of mediaCells(p)) if (counts.get(c.group) > 1 && !numbers.has(c.group)) numbers.set(c.group, numbers.size + 1);
  return numbers;
}
// Picking mode. S.grouping.picked is the set of cell ids chosen so far; editing is the id of the existing group being
// changed, or null while a new one is being made.
function startGrouping() {
  parkTextbar(); closeSlides();
  S.grouping = { picked: new Set(), editing: null };
  render(); $('#groupCancelBtn').focus();
}
function stopGrouping() {
  if (!S.grouping) return;
  S.grouping = null; render(); $('#groupBtn').focus();
}
function pickForGroup(cellId) {
  const g = S.grouping, f = findCellById(S.project, cellId); if (!g || !f) return;
  const own = f.cell.group;
  if (!g.picked.size && !g.editing && groupNumbers().has(own)) {   // the first click lands on a grouped one: take up that group
    g.editing = own;
    for (const c of mediaCells(S.project)) if (c.group === own) g.picked.add(c.id);
  } else if (g.picked.has(cellId)) g.picked.delete(cellId);
  else g.picked.add(cellId);
  render();
  const again = $(`.cell[data-cell-id="${CSS.escape(cellId)}"] .group-pick`); if (again) again.focus({ preventScroll: true });   // the re-render dropped focus; it is already where the pointer is
}
// Leaves picking mode and saves what was picked: two or more become the group (a new one, or the one being changed);
// fewer than two means no group, which dissolves one that was being changed. dissolve forces that.
function finishGrouping(dissolve = false) {
  const g = S.grouping; if (!g) return;
  const picked = dissolve || g.picked.size < 2 ? new Set() : g.picked, id = g.editing || uid();
  S.grouping = null;
  const changed = commit((p) => {
    for (const c of mediaCells(p)) {
      if (picked.has(c.id)) c.group = id;       // this also moves it out of any other group it was in
      else if (c.group === id) delete c.group;
    }
    const counts = new Map();                   // a group that is down to one member is no longer a group
    for (const c of mediaCells(p)) if (c.group) counts.set(c.group, (counts.get(c.group) || 0) + 1);
    for (const c of mediaCells(p)) if (c.group && counts.get(c.group) < 2) delete c.group;
  });
  if (!changed) render();
  if (picked.size) toast(`Grouped ${picked.size} pictures and videos. A reader who enlarges one can flip through the rest.`, 4000);
  else if (!dissolve && !g.editing && g.picked.size === 1) toast('A group needs at least two. Nothing was grouped.', 3500);
  $('#groupBtn').focus();
}
function renderGroupBar() {
  const g = S.grouping;
  document.body.classList.toggle('grouping', !!g);
  $('#groupBar').hidden = !g;
  $('#groupBtn').setAttribute('aria-pressed', String(!!g));
  if (!g) return;
  for (const id of [...g.picked]) if (!findCellById(S.project, id)) g.picked.delete(id);   // its cell was removed meanwhile
  const n = g.picked.size, number = g.editing ? groupNumbers().get(g.editing) : null;
  $('#groupHint').textContent = g.editing ? `Changing group ${number || ''}: ${n} selected. Click a picture or video to add or remove it.`
    : n ? `${n} selected for a new group. Keep clicking the ones that belong with ${n === 1 ? 'it' : 'them'}.`
    : 'Click the pictures and videos that belong together. To change a group you already made, click one of its members first.';
  $('#groupUngroupBtn').hidden = !g.editing;
}
function setupGrouping() {
  $('#groupBtn').addEventListener('click', () => (S.grouping ? stopGrouping() : startGrouping()));
  $('#groupCancelBtn').addEventListener('click', stopGrouping);
  $('#groupDoneBtn').addEventListener('click', () => finishGrouping());
  $('#groupUngroupBtn').addEventListener('click', () => finishGrouping(true));
}
