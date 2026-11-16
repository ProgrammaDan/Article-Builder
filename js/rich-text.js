'use strict';
// Text formatting mechanics for rich text boxes (contenteditable elements). Nothing here knows which box it is working
// on or what a format means to it: the caller passes the box, and a function that makes the element to wrap text in.
// Image labels use them for size and font (markup.js); body text and captions use them for font (text-editing.js).

/* ---------- Rich text mechanics ---------- */
// Wraps exactly the text inside a range, piece by piece, in elements made by makeWrapper(), and leaves that text selected.
// The browser's own commands aren't used for this: fontSize in particular restyles neighboring text unpredictably.
function wrapTextInRange(box, range, makeWrapper) {
  const sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset, nodes = [];
  for (const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); w.nextNode();) if (range.intersectsNode(w.currentNode)) nodes.push(w.currentNode);
  let first = null, last = null;
  for (let n of nodes) {
    const from = n === sc ? so : 0, to = n === ec ? eo : n.length;
    if (from >= to) continue;
    if (to < n.length) n.splitText(to);
    if (from > 0) n = n.splitText(from);
    const wrapper = makeWrapper();
    n.before(wrapper); wrapper.append(n);
    first = first || n; last = n;
  }
  if (first) getSelection().setBaseAndExtent(first, 0, last, last.length);
}
// Puts text in at the caret inside a new wrapper and leaves the caret after it, so typing carries on inside the wrapper.
// This is how "what I type next should look like this" works when nothing is selected: call it from a beforeinput handler
// in place of the browser's own insertion.
function insertWrappedText(text, makeWrapper) {
  const sel = getSelection(), wrapper = makeWrapper();
  wrapper.textContent = text;
  sel.getRangeAt(0).insertNode(wrapper);
  sel.collapse(wrapper.firstChild, text.length);
}
// Replaces the selection with a piece of (already cleaned) HTML and leaves the caret after it. Unlike the browser's
// insertHTML command, it puts in exactly the markup it is given.
function insertAtCaret(html) {
  const sel = getSelection(), range = sel.getRangeAt(0), tpl = document.createElement('template');
  tpl.innerHTML = html;
  const last = tpl.content.lastChild;
  range.deleteContents(); range.insertNode(tpl.content);
  if (last) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
}
// How many characters come before a position in a box (a <br> counts as one), and the position a count of characters
// leads to. Together they carry a caret across a rebuild of the box's markup.
function textOffset(box, node, offset) {
  const r = document.createRange(); r.selectNodeContents(box); r.setEnd(node, offset);
  const part = r.cloneContents();
  return part.textContent.length + part.querySelectorAll('br').length;
}
function textPosition(box, count) {
  let node = null;
  for (const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); w.nextNode();) {
    node = w.currentNode;
    if (count <= node.length) return [node, count];
    count -= node.length;
  }
  return node ? [node, node.length] : [box, 0];
}
// Runs rebuild(), which may replace all of the box's markup as long as the text stays the same, then puts the caret or
// selection back where it was in the text. Returns whether there was a selection in the box to put back.
function rebuildKeepingSelection(box, rebuild) {
  const sel = getSelection(), inside = sel.rangeCount && box.contains(sel.anchorNode) && box.contains(sel.focusNode);
  const marks = inside ? [textOffset(box, sel.anchorNode, sel.anchorOffset), textOffset(box, sel.focusNode, sel.focusOffset)] : null;
  rebuild();
  if (marks) sel.setBaseAndExtent(...textPosition(box, marks[0]), ...textPosition(box, marks[1]));
  return !!marks;
}
// Gives focus back to a box after a toolbar field took it, restoring the selection the box had (pass the range saved
// while it was focused). Focusing a box on its own would leave the caret at its start.
function refocusBox(box, range) {
  const sel = getSelection(), away = document.activeElement !== box;
  box.focus();
  if (away && range) { sel.removeAllRanges(); sel.addRange(range); }
}
// Removes wrappers (elements matching selector) that no longer affect any text, because every piece of text inside one
// is also inside a nearer wrapper. Applying a second format over the same text leaves these behind.
function unwrapShadowed(box, selector) {
  for (const el of [...box.querySelectorAll(selector)]) {
    let own = false;
    for (const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); !own && w.nextNode();) own = w.currentNode.parentElement.closest(selector) === el;
    if (!own) el.replaceWith(...el.childNodes);
  }
}
