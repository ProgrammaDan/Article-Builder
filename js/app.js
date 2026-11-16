'use strict';
// Start-up: opening a folder, the welcome screen, the editor's appearance, and wiring the page's controls.
// This file must load last: it ends by starting the app.

/* ---------- Opening a folder ---------- */
async function openFolder(dir) {
  S.root = dir;
  try { await idb.set('root', dir); } catch {}
  $('#folderName').textContent = dir.name;
  $('#folderName').title = dir.name;
  await scanMedia();
  let text = await readText(dir, PROJECT_FILE);
  if (text == null) { S.project = newProject(dir.name); await saveNow(); }
  else {
    try { S.project = normalizeProject(JSON.parse(text)); }
    catch {
      const bak = `project.unreadable-${Date.now()}.json`;
      await writeText(dir, bak, text);
      S.project = newProject(dir.name); await saveNow();
      toast(`project.json couldn’t be read. It was kept as ${bak} and a new layout was started.`, 9000);
    }
  }
  S.undo = []; S.redo = []; S.slidesOpen = null; S.grouping = null; S.rowSel.clear(); S.rowAnchor = null; pageRenaming = null; S.selected.clear(); S.hiddenOpen = false;
  $('#welcome').hidden = true; $('#app').hidden = false;
  document.body.classList.remove('mat');
  render(); renderLibrary();
}
async function rescan() {
  for (const p of S.urls.values()) p.then((u) => u && URL.revokeObjectURL(u));
  S.urls.clear(); S.thumbs.clear(); thumbQueue.length = 0;
  await scanMedia(); render(); renderLibrary();
  toast(`Found ${S.media.length} file${S.media.length === 1 ? '' : 's'}.`, 2000);
}
async function initWelcome() {
  if (!('showDirectoryPicker' in window)) { $('#unsupported').hidden = false; $('#chooseBtn').disabled = true; return; }
  const err = (msg) => { const el = $('#welcomeErr'); el.textContent = msg; el.hidden = !msg; };
  $('#chooseBtn').addEventListener('click', async () => {
    err('');
    try { await openFolder(await window.showDirectoryPicker({ id: 'article-builder', mode: 'readwrite' })); }
    catch (e) { if (e.name !== 'AbortError') err(e.message); }
  });
  try {
    const last = await idb.get('root');
    if (last) {
      const btn = $('#reopenBtn'); btn.hidden = false; btn.textContent = `Reopen “${last.name}”`;
      btn.addEventListener('click', async () => {
        err('');
        try {
          const perm = await last.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') await openFolder(last);
          else err('Chrome didn’t get access to that folder. Choose it again to continue.');
        } catch (e) { err(`That folder can’t be opened anymore (${e.message}). Choose it again.`); }
      });
    }
  } catch {}
}

/* ---------- Editor appearance (a per-browser preference, not part of project.json) ---------- */
const DARK_MQ = matchMedia('(prefers-color-scheme: dark)');
let editorTheme = 'auto';
try { const t = localStorage.getItem(EDITOR_THEME_KEY); if (t === 'light' || t === 'dark') editorTheme = t; } catch {}
function applyEditorTheme() {
  document.documentElement.dataset.editorTheme = editorTheme === 'auto' ? (DARK_MQ.matches ? 'dark' : 'light') : editorTheme;
  for (const inp of $$('#settingsPop input[name=editorTheme]')) inp.checked = inp.value === editorTheme;
}
function setEditorTheme(t) {
  editorTheme = t;
  try { if (t === 'auto') localStorage.removeItem(EDITOR_THEME_KEY); else localStorage.setItem(EDITOR_THEME_KEY, t); } catch {}
  applyEditorTheme();
}

/* ---------- Wiring ---------- */
function setupUI() {
  applyEditorTheme();
  DARK_MQ.addEventListener('change', applyEditorTheme);
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#previewBtn').addEventListener('click', () => openPreview());
  $('#closePreviewBtn').addEventListener('click', closePreview);
  // In the preview a page's buttons can't be links, as the pages are not files yet. A click on one shows that page here.
  $('#previewFrame').addEventListener('load', (e) => {
    const doc = e.target.contentDocument; if (!doc) return;
    doc.addEventListener('click', (ev) => { const a = ev.target.closest && ev.target.closest('a[data-page]'); if (a) { ev.preventDefault(); openPreview(a.dataset.page); } });
  });
  for (const b of $$('#preview [data-dev]')) b.addEventListener('click', () => setPreviewDevice(b.dataset.dev));
  $('#exportBtn').addEventListener('click', confirmExport);
  $('#exportCancelBtn').addEventListener('click', () => $('#exportConfirm').close());
  $('#exportGoBtn').addEventListener('click', () => { $('#exportConfirm').close(); exportArticle(); });
  $('#exportCloseBtn').addEventListener('click', () => $('#exportDialog').close());
  $('#rescanBtn').addEventListener('click', rescan);
  $('#libSearch').addEventListener('input', renderLibrary);
  $('#libHideUsed').addEventListener('change', renderLibrary);
  $('#clearSelBtn').addEventListener('click', () => { S.selected.clear(); renderLibrary(); });
  $('#hideSelBtn').addEventListener('click', () => setHidden(selectedPaths(), true));
  $('#unhideSelBtn').addEventListener('click', () => setHidden(selectedPaths(), false));
  $('#addSelBtn').addEventListener('click', () => {
    const paths = selectedPaths();
    S.selected.clear(); appendMediaRows(paths); renderLibrary();
  });
  $('#addSlidesBtn').addEventListener('click', () => {
    const paths = selectedPaths();
    S.selected.clear();
    if (S.slidesOpen) addSlides(S.slidesOpen, paths); else addSlideshow(paths);
    renderLibrary();
  });
  $('#slidesDoneBtn').addEventListener('click', closeSlides);
  for (const b of $$('[data-add]')) b.addEventListener('click', () => addRow(b.dataset.add));
  $('#outlineBtn').addEventListener('click', addOutline);

  const pop = $('#settingsPop'), sBtn = $('#settingsBtn');
  const setPop = (open) => { pop.hidden = !open; sBtn.setAttribute('aria-expanded', String(open)); };
  sBtn.addEventListener('click', (e) => { e.stopPropagation(); setPop(pop.hidden); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
  pop.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'theme' || t.name === 'width' || t.name === 'captions') commit((p) => {
      if (t.value === 'custom' && !p.settings.widthPx) p.settings.widthPx = articleWidth(p.settings);   // start from the current preset
      p.settings[t.name] = t.value;
    });
    if (t.name === 'widthPx') {   // typing a width also selects Custom; an empty or silly entry is put back
      const n = Number(t.value);
      if (t.value.trim() && isFinite(n)) commit((p) => { p.settings.widthPx = clampWidth(n); p.settings.width = 'custom'; });
      t.value = S.project.settings.widthPx || articleWidth(S.project.settings);
    }
    if (t.name === 'editorTheme') setEditorTheme(t.value);
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey; const key = e.key.toLowerCase();
    if (mod && key === 's') { e.preventDefault(); if (S.root) saveNow(); return; }
    if (e.key === 'Escape') {
      if (!$('#preview').hidden) closePreview();
      else if (!pop.hidden) setPop(false);
      else if (!$('#pageMenu').hidden) { closePageMenu(); $('#pageMoreBtn').focus(); }
      else if (S.grouping) stopGrouping();
      else if (S.rowSel.size && S.slidesOpen === null && !$('dialog[open]')) clearRowSelection();
      else if (!$('dialog[open]')) closeSlides();
      return;
    }
    if (!S.root) return;
    const inEdit = e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    if (mod && key === 'z' && !inEdit) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && key === 'y' && !inEdit) { e.preventDefault(); redo(); }
  });
  window.addEventListener('beforeunload', (e) => { if (S.unsaved) { saveNow(); e.preventDefault(); e.returnValue = ''; } });
}

document.head.append(h('style', {}, fontRulesCSS()));   // makes data-font work in the editor, as it does in the export
// Labels are measured with the fonts on screen. When a web font arrives late, measure and draw them again.
document.fonts.addEventListener('loadingdone', () => { labelMeasures.clear(); if (S.project) { drawMarks(); renderMarkup(); } });
setupUI();
setupEditing();
setupDnD();
setupLibraryResize();
setupGrouping();
setupPages();
setupLinks();
$('#canvas').addEventListener('click', (e) => { if (e.target.id === 'canvas' || e.target.id === 'page') clearRowSelection(); });   // a click on the empty page clears the row selection
setupMarkup();
initWelcome();
