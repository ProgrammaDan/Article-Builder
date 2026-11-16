'use strict';
// Pages: an article can be split over several, each with its own title lines and rows. Once there is more than one,
// every page shows a button for each at its top right, in the editor as in the exported article. project.page is the id
// of the page open in the editor, and p.rows, p.title and the like mean that page's (see pageShortcuts in project.js).

/* ---------- Pages ---------- */
let pageRenaming = null;   // id of the page whose button is a text box just now

// What belongs to the page being left: its open slideshow panel, a half-made group, the selected rows.
function leavePage() {
  closeSlides();
  S.grouping = null; S.rowSel.clear(); S.rowAnchor = null; pageRenaming = null;
}
function goToPage(id) {
  const p = S.project; if (p.page === id || !p.pages.some((pg) => pg.id === id)) return;
  flushEdit(); leavePage();
  p.page = id;                 // not an undo step: nothing in the article changed
  render(); scheduleSave();
  $('#canvas').scrollTop = 0;
  const btn = $('#pageNav .page-btn.on'); if (btn) btn.focus({ preventScroll: true });
}
// Adds a page after the others, opens it, and puts its button straight into renaming. The first page gets a label too
// the first time, since until then it had no button to label.
function addPage() {
  const page = newPage();
  flushEdit(); leavePage();
  pageRenaming = page.id;
  commit((p) => {
    if (!p.pages[0].label) p.pages[0].label = 'Page 1';
    page.label = `Page ${p.pages.length + 1}`;
    p.pages.push(page); p.page = page.id;
  });
  $('#canvas').scrollTop = 0;
  focusPageRename();
}
function movePage(id, delta) {
  commit((p) => {
    const i = p.pages.findIndex((pg) => pg.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= p.pages.length) return;
    const [pg] = p.pages.splice(i, 1); p.pages.splice(j, 0, pg);
  });
  const btn = $('#pageMoreBtn'); if (btn) btn.focus({ preventScroll: true });
}
function deletePage(id) {
  let label = null;
  flushEdit(); leavePage();
  commit((p) => {
    const i = p.pages.findIndex((pg) => pg.id === id); if (i < 0 || p.pages.length < 2) return;
    label = p.pages[i].label;
    p.pages.splice(i, 1);
    if (p.page === id) p.page = p.pages[Math.max(0, i - 1)].id;
  });
  if (label === null) return;
  $('#canvas').scrollTop = 0;
  toast(`The page “${label}” and everything on it was deleted. Press Ctrl+Z to bring it back.`, 7000);
}
// A row with nothing in it: what a new page starts with, and what is left behind when a cell is emptied.
const isBlankRow = (r) => (r.type === 'section' ? !r.text.trim() : r.cells.every((c) => c.kind === 'empty' || (c.kind === 'text' && !textOf(c.html))));
// Moves rows off the open page to the end of another. A page that holds nothing yet gives up its blank starting rows
// for them.
function moveRowsToPage(rowIds, pageId) {
  let n = 0, label = '';
  commit((p) => {
    const from = openPage(p), to = p.pages.find((pg) => pg.id === pageId); if (!to || to === from) return;
    const moving = from.rows.filter((r) => rowIds.includes(r.id)); if (!moving.length) return;
    from.rows = from.rows.filter((r) => !rowIds.includes(r.id));
    if (to.rows.every(isBlankRow)) to.rows = [];
    to.rows.push(...moving);
    n = moving.length; label = to.label;
  });
  if (n) toast(`Moved ${n} row${n === 1 ? '' : 's'} to the end of “${label}”. Press Ctrl+Z to undo.`, 5000);
}

/* ---------- The page buttons in the editor ---------- */
function renderPageNav() {
  const p = S.project, open = openPage(p), many = p.pages.length > 1, nav = $('#pageNav');
  closePageMenu();
  if (!p.pages.some((pg) => pg.id === pageRenaming)) pageRenaming = null;
  $('#docHead').classList.toggle('has-pages', many);
  $('#docTitle').dataset.ph = open === p.pages[0] ? 'Project title' : 'Page title';
  nav.hidden = !many;
  const parts = [];
  for (const pg of many ? p.pages : []) {
    const on = pg === open;
    if (pg.id === pageRenaming) {
      parts.push(h('input', {
        class: 'page-rename', type: 'text', value: pg.label, maxlength: PAGE_LABEL_MAX, size: Math.max(6, pg.label.length + 1), 'aria-label': 'Label for this page’s button',
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); finishPageRename(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishPageRename(false); }
        },
        onblur: () => finishPageRename(true),
      }));
    } else parts.push(pageButton(pg, on));
    if (on) parts.push(h('button', { class: 'page-more', id: 'pageMoreBtn', type: 'button', title: 'Rename, move or delete this page', 'aria-label': 'Page options', 'aria-expanded': 'false', 'aria-controls': 'pageMenu', onclick: (e) => { e.stopPropagation(); togglePageMenu(); } }, '⋯'));
  }
  nav.replaceChildren(...parts);
  fillPageNavFoot();
  fillPageDropBar();
  const i = p.pages.indexOf(open);
  $('#pageLeftBtn').disabled = i === 0; $('#pageRightBtn').disabled = i === p.pages.length - 1;
}
// Every button but the open page's takes rows dropped on it (.page-drop; see setupDnD). Those in the row at the end of
// the page only go to their page: renaming happens at the top.
function pageButton(pg, on, atEnd = false) {
  return h('button', {
    class: 'page-btn' + (on ? ' on' : ' page-drop'), type: 'button', 'aria-current': on ? 'page' : null, dataset: { pageId: pg.id },
    title: on ? (atEnd ? 'The page you are on' : 'The page you are on. Double-click to rename it.') : 'Go to this page. Rows dragged here move to it.',
    onclick: () => goToPage(pg.id), ondblclick: atEnd ? null : () => startPageRename(pg.id),
  }, pg.label || 'Untitled');
}
// The same buttons again at the end of the page, as the article has them.
function fillPageNavFoot() {
  const p = S.project, open = openPage(p), foot = $('#pageNavFoot');
  foot.hidden = p.pages.length < 2;
  foot.replaceChildren(...(foot.hidden ? [] : p.pages.map((pg) => pageButton(pg, pg === open, true))));
}
function fillPageDropBar() {
  const p = S.project, open = openPage(p);
  $('#pageDropTargets').replaceChildren(...p.pages.filter((pg) => pg !== open).map((pg) => h('div', { class: 'page-drop', dataset: { pageId: pg.id } }, pg.label || 'Untitled')));
}
function focusPageRename() { const inp = $('#pageNav .page-rename'); if (inp) { inp.focus({ preventScroll: true }); inp.select(); } }
function startPageRename(id) { pageRenaming = id; renderPageNav(); focusPageRename(); }
// Ends renaming. An empty label is not taken; the button keeps the one it had. Only the text box is swapped back for
// its button, and the other buttons are left alone: renaming often ends with a click on one of them, and a button
// replaced under the pointer would lose that click.
function finishPageRename(save) {
  const id = pageRenaming, inp = $('#pageNav .page-rename'); if (!id) return;
  pageRenaming = null;        // first: taking the box out of the page blurs it, which calls back in here
  const label = pageLabel(inp ? inp.value : ''), keepFocus = document.activeElement === inp;
  if (save && label) commit((p) => { const pg = p.pages.find((x) => x.id === id); if (pg) pg.label = label; }, { rerender: false });
  const pg = S.project.pages.find((x) => x.id === id), btn = pg && pageButton(pg, pg === openPage(S.project));
  if (inp && btn) inp.replaceWith(btn); else renderPageNav();
  fillPageNavFoot();
  fillPageDropBar();
  if (btn && keepFocus) btn.focus({ preventScroll: true });
}
// The small menu for the open page, under its "⋯" button.
function closePageMenu() {
  $('#pageMenu').hidden = true;
  const btn = $('#pageMoreBtn'); if (btn) btn.setAttribute('aria-expanded', 'false');
}
function togglePageMenu() {
  const menu = $('#pageMenu'), btn = $('#pageMoreBtn');
  if (!menu.hidden || !btn) { closePageMenu(); return; }
  menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
  menu.style.top = btn.offsetTop + btn.offsetHeight + 4 + 'px';
  menu.style.right = Math.max(0, $('#docHead').clientWidth - btn.offsetLeft - btn.offsetWidth) + 'px';
  $('#pageRenameBtn').focus({ preventScroll: true });
}
// The bar that appears at the top of the page while rows are dragged, so they can be dropped on another page from
// anywhere in a long one.
function showPageDropBar() { if (dragState && dragState.type === 'row' && S.project.pages.length > 1) $('#pageDropBar').hidden = false; }
function hidePageDropBar() { $('#pageDropBar').hidden = true; }
function setupPages() {
  $('#addPageBtn').addEventListener('click', addPage);
  $('#pageRenameBtn').addEventListener('click', () => startPageRename(openPage(S.project).id));
  $('#pageLeftBtn').addEventListener('click', () => movePage(openPage(S.project).id, -1));
  $('#pageRightBtn').addEventListener('click', () => movePage(openPage(S.project).id, 1));
  $('#pageDeleteBtn').addEventListener('click', () => deletePage(openPage(S.project).id));
  document.addEventListener('click', (e) => { if (!$('#pageMenu').hidden && !$('#pageMenu').contains(e.target)) closePageMenu(); });
}
