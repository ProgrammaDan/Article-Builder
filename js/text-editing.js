'use strict';
// Typing in the page: binding editable fields to the project, paste, and the toolbar that floats above the field in use.

/* ---------- Text editing ---------- */
function applyBind(el) {
  const [kind, rowId, cellId] = el.dataset.bind.split(':');
  const p = S.project;
  const plain = () => el.textContent.replace(/\s+/g, ' ').trim();
  if (kind === 'title' || kind === 'subtitle' || kind === 'meta') { p[kind] = plain(); return; }
  if (kind === 'section') { const r = findRow(p, rowId); if (r) r.text = plain(); return; }
  if (kind === 'slide') {   // slide:<cell id>:<slide id>, a step's caption in the steps panel
    const sc = findCellById(p, rowId), s = sc && sc.cell.kind === 'slides' && sc.cell.slides.find((x) => x.id === cellId);
    if (s) s.caption = sanitizeInline(el.innerHTML);
    return;
  }
  const f = findCell(p, rowId, cellId); if (!f) return;
  if (kind === 'text' && f.cell.kind === 'text') f.cell.html = sanitize(el.innerHTML);
  if (kind === 'caption' && (f.cell.kind === 'media' || f.cell.kind === 'slides')) f.cell.caption = sanitizeInline(el.innerHTML);
  if (kind === 'alt' && f.cell.kind === 'media') f.cell.alt = plain();
}
// What a paste puts into a rich field: the clipboard's HTML cut down to the allowed tags. inline says it is a single run
// of text, which joins the line it's pasted into (a caption always is; in a text cell, a lone paragraph is); otherwise
// it is whole paragraphs or lists. html is '' when there is nothing usable, and the paste falls back to plain text.
function pasteMarkup(el, clip) {
  const raw = pastedHTML(clip.getData('text/html'));
  const run = (html) => ({ html: html.trim() ? html : '', inline: true });
  if (el.classList.contains('caption')) return run(sanitizeInline(raw, true));
  const tpl = document.createElement('template'); tpl.innerHTML = sanitize(raw);
  const only = tpl.content.childNodes.length === 1 && tpl.content.firstChild;
  return only && only.tagName === 'P' ? run(only.innerHTML) : { html: tpl.innerHTML, inline: false };
}
function setupEditing() {
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch {}
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el) return;
    if (!el.textContent.trim() && !el.querySelector('li')) el.innerHTML = '';   // lets the placeholder show again
    applyBind(el); scheduleSave();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el) return;
    if (!S.editSnap) S.editSnap = snapshot();
    if (!el.classList.contains('alt')) showTextbar(el);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el) return;
    flushEdit();
    if (!TEXTBAR.contains(e.relatedTarget)) hideTextbar();   // it stays while its own font menu has focus
    if (el.classList.contains('alt')) closeAlt(el);
  });
  let pastePlain = false;   // Ctrl+Shift+V: paste without formatting
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') pastePlain = e.shiftKey;
    const el = e.target.closest && e.target.closest('[data-single]'); if (!el) return;
    const isAlt = el.classList.contains('alt');
    if (e.key === 'Enter' || (isAlt && e.key === 'Escape')) {
      e.preventDefault();
      const nextCap = el.classList.contains('slide-cap') && $('.slide-cap', el.closest('.slide-card').nextElementSibling || el);
      el.blur();
      if (isAlt) el.closest('.cell').querySelector('.alt-chip').focus();   // hand focus back to the chip that opened it
      if (nextCap) nextCap.focus();                                        // Enter steps through the captions of a slideshow
    }
  });
  document.addEventListener('paste', (e) => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el) return;
    e.preventDefault();
    const plainOnly = pastePlain; pastePlain = false;
    if (!plainOnly && (el.classList.contains('prose') || el.classList.contains('caption'))) {
      const paste = pasteMarkup(el, e.clipboardData);
      // A single run is put in directly. The browser's insertHTML can't be trusted with one: it drops a space at either
      // end, and strips a font span that lands next to another.
      if (paste.html && paste.inline) { insertAtCaret(paste.html); applyBind(el); scheduleSave(); return; }
      if (paste.html) { document.execCommand('insertHTML', false, paste.html); return; }
    }
    let text = e.clipboardData.getData('text/plain');
    if (el.hasAttribute('data-single')) text = text.replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  });
  document.addEventListener('selectionchange', () => {
    const sel = getSelection(), field = TB.field;
    if (!field || !sel.rangeCount || !field.contains(sel.anchorNode)) return;
    TB.range = sel.getRangeAt(0).cloneRange();
    if (TB.pending && (!sel.isCollapsed || sel.anchorNode !== TB.pending.node || sel.anchorOffset !== TB.pending.offset)) TB.pending = null;   // the caret moved on
    syncTextbar();
  });
  document.addEventListener('beforeinput', (e) => {   // the first text typed after choosing a font with nothing selected takes it
    const pend = TB.pending, field = TB.field, sel = getSelection();
    if (!pend || !field || e.inputType !== 'insertText' || !e.data || !sel.isCollapsed || !field.contains(sel.anchorNode)) return;
    e.preventDefault();
    insertWrappedText(e.data, () => fontSpan(pend.font));
    TB.pending = null; applyBind(field); scheduleSave(); syncTextbar();
  });
  $('#textFont').replaceChildren(...Object.entries(FONTS).map(([key, [name, stack]]) => h('option', { value: key, style: { 'font-family': stack } }, name)));
  $('#textFont').addEventListener('change', (e) => applyFont(e.target.value));
  TEXTBAR.addEventListener('mousedown', (e) => { if (!e.target.closest('select')) e.preventDefault(); });   // buttons mustn't take the text selection; the menu has to take focus to open
  TEXTBAR.addEventListener('focusout', (e) => { if (TB.field && e.relatedTarget !== TB.field && !TEXTBAR.contains(e.relatedTarget)) hideTextbar(); });
  TEXTBAR.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) runCmd(b.dataset.cmd); });
}

/* ---------- The floating toolbar and fonts ---------- */
// The toolbar floats above whichever editable field has focus. Every field gets the font menu; text cells also get the
// formatting buttons. TB.range is the field's last selection, kept so the menu can act on it after taking focus, and
// TB.pending is a font chosen with nothing selected, waiting for the next typed character.
const TEXTBAR = document.getElementById('textbar');   // held here because it moves around the page, and re-renders can detach it
const TB = { field: null, range: null, pending: null };
const isRichField = (el) => el.contentEditable === 'true';   // text cells and captions; titles and headings hold plain text
function showTextbar(field) {
  Object.assign(TB, { field, range: null, pending: null });
  TEXTBAR.classList.toggle('rich', field.classList.contains('prose'));
  field.offsetParent.append(TEXTBAR); TEXTBAR.hidden = false;
  TEXTBAR.style.left = field.offsetLeft - 4 + 'px'; TEXTBAR.style.top = field.offsetTop - TEXTBAR.offsetHeight - 6 + 'px';
  syncTextbar();
}
function hideTextbar() {
  Object.assign(TB, { field: null, range: null, pending: null });   // first: moving the bar blurs its menu, which calls back in here
  TEXTBAR.hidden = true;
  if (TEXTBAR.parentElement !== document.body) document.body.append(TEXTBAR);
}
// Called before anything rebuilds part of the page the toolbar may be sitting in.
function parkTextbar() { if (TEXTBAR.parentElement !== document.body) hideTextbar(); }
// Shows the font at the caret, or of the whole field for a plain one. Blank where the text is in none of the fonts on
// offer, such as inline code.
function syncTextbar() {
  const field = TB.field; if (!field) return;
  const sel = getSelection(), node = isRichField(field) && sel.rangeCount && field.contains(sel.focusNode) ? sel.focusNode : field;
  $('#textFont').value = TB.pending ? TB.pending.font : fontOf(getComputedStyle(node.nodeType === 3 ? node.parentElement : node)) || '';
}
const fontSpan = (font) => { const s = document.createElement('span'); s.dataset.font = font; return s; };
// After a font change: drops font spans that no longer affect any text, and ones that only repeat the font their text
// would have without them (which is how choosing a field's usual font removes an earlier choice).
function tidyFontSpans(field) {
  rebuildKeepingSelection(field, () => {
    unwrapShadowed(field, 'span[data-font]');
    for (const s of $$('span[data-font]', field)) if (fontOf(getComputedStyle(s)) === fontOf(getComputedStyle(s.parentElement))) s.replaceWith(...s.childNodes);
    field.normalize();                         // rejoin the pieces of text that wrapping split apart
  });
}
// The font menu. In a text cell or caption it acts on the selected text, or on what is typed next when nothing is
// selected, by wrapping it in <span data-font>. A title, summary, date line or section heading holds plain text, so it
// takes the font as a whole and the choice is stored beside it in the project.
function applyFont(font) {
  const field = TB.field, range = TB.range;
  if (!field || !Object.hasOwn(FONTS, font)) return;
  if (!isRichField(field)) {
    const bind = field.dataset.bind, [kind, rowId] = bind.split(':');
    hideTextbar();                             // the change re-renders the rows it may be sitting in
    commit((p) => { if (kind === 'section') { const r = findRow(p, rowId); if (r) r.font = font; } else p.fonts[kind] = font; });
    const again = $(`[data-bind="${CSS.escape(bind)}"]`); if (again) again.focus();
    return;
  }
  refocusBox(field, range);                    // starts a new typing session, so this change is its own undo step
  const sel = getSelection();
  if (!sel.rangeCount || !field.contains(sel.anchorNode)) return;
  if (sel.isCollapsed) { TB.pending = { font, node: sel.anchorNode, offset: sel.anchorOffset }; syncTextbar(); return; }
  wrapTextInRange(field, sel.getRangeAt(0), () => fontSpan(font));
  tidyFontSpans(field);
  applyBind(field); scheduleSave(); syncTextbar();
}
function runCmd(cmd) {
  const sel = getSelection();
  const prose = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('.prose');
  if (!prose) return;
  switch (cmd) {
    case 'bold': document.execCommand('bold'); break;
    case 'italic': document.execCommand('italic'); break;
    case 'ul': document.execCommand('insertUnorderedList'); break;
    case 'ol': document.execCommand('insertOrderedList'); break;
    case 'h3': {
      const cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, cur === 'h3' ? 'p' : 'h3'); break;
    }
    case 'code': {
      if (sel.isCollapsed) { toast('Select some text first, then press Code.', 2500); return; }
      document.execCommand('insertHTML', false, '<code>' + escapeHTML(sel.toString()) + '</code>'); break;
    }
    case 'link': {
      if (sel.isCollapsed) { toast('Select the text you want to link first.', 2500); return; }
      const range = sel.getRangeAt(0).cloneRange();
      const url = prompt('Link address', 'https://');
      prose.focus(); sel.removeAllRanges(); sel.addRange(range);
      if (url && url !== 'https://' && safeHref(url)) document.execCommand('createLink', false, url.trim());
      break;
    }
  }
  applyBind(prose); scheduleSave();
}
