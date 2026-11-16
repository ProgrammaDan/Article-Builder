'use strict';
// The HTML cleaner. Everything typed, pasted, loaded or exported as HTML passes through this allowlist.

/* ---------- HTML sanitizing (allowlist) ---------- */
const INLINE_MAP = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', CODE: 'code', A: 'a', BR: 'br' };
const BLOCKISH = new Set(['P', 'H3', 'LI', 'STRONG', 'EM', 'A', 'CODE', 'SPAN']);
function safeHref(href) {
  if (!href) return null;
  href = href.trim();
  if (/^(https?:|mailto:|#|\/|\.{1,2}\/)/i.test(href)) return href;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;   // relative link without a scheme
  return null;                                            // javascript:, data:, etc.
}
function cleanChildren(src, dst) {
  for (const n of src.childNodes) {
    if (n.nodeType === 3) { dst.append(document.createTextNode(n.textContent.replace(/ /g, ' '))); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'IMG', 'VIDEO', 'SVG'].includes(t)) continue;
    const inBlock = dst.nodeType === 1 && BLOCKISH.has(dst.tagName);
    let el = null;
    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(t)) {
      if (inBlock) { if (dst.textContent) dst.append(document.createElement('br')); cleanChildren(n, dst); continue; }
      el = document.createElement(/^H\d$/.test(t) ? 'h3' : 'p');
    } else if (t === 'UL' || t === 'OL') {
      if (inBlock) { cleanChildren(n, dst); continue; }
      el = document.createElement(t.toLowerCase());
    } else if (t === 'LI') {
      const parentList = dst.nodeType === 1 && (dst.tagName === 'UL' || dst.tagName === 'OL');
      el = document.createElement(parentList ? 'li' : 'p');
    } else if (INLINE_MAP[t]) {
      el = document.createElement(INLINE_MAP[t]);
      if (t === 'A') {
        const href = safeHref(n.getAttribute('href'));
        if (!href) { cleanChildren(n, dst); continue; }
        el.setAttribute('href', href);
      }
    } else if (t === 'SPAN' && Object.hasOwn(FONTS, n.getAttribute('data-font'))) {
      el = document.createElement('span');     // the one span that is kept: a font chosen for this text
      el.setAttribute('data-font', n.getAttribute('data-font'));
    } else { cleanChildren(n, dst); continue; }   // unwrap any other span, font, etc.
    if (el.tagName !== 'BR') cleanChildren(n, el);
    dst.append(el);
  }
}
function sanitize(html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html || '';
  const tmp = document.createElement('div'); cleanChildren(tpl.content, tmp);
  const out = document.createElement('div'); let para = null;
  for (const n of [...tmp.childNodes]) {
    if (n.nodeType === 1 && ['P', 'H3', 'UL', 'OL'].includes(n.tagName)) { para = null; out.append(n); continue; }
    if (n.nodeType === 1 && n.tagName === 'BR' && !para) continue;
    if (n.nodeType === 3 && !n.textContent.trim() && !para) continue;
    if (!para) { para = document.createElement('p'); out.append(para); }
    para.append(n);
  }
  for (const el of [...out.querySelectorAll('span')]) if (!el.textContent) el.remove();
  for (const el of [...out.querySelectorAll('p, h3, li')]) if (!el.textContent.trim()) el.remove();
  for (const el of [...out.querySelectorAll('ul, ol')]) if (!el.querySelector('li')) el.remove();
  for (const el of [...out.querySelectorAll('p, h3, li')]) {   // drop trailing <br>s
    while (el.lastChild && el.lastChild.nodeName === 'BR') el.lastChild.remove();
  }
  return out.innerHTML.trim();
}
function sanitizeInline(html, keepEdgeSpaces = false) {
  const tpl = document.createElement('template'); tpl.innerHTML = html || '';
  const tmp = document.createElement('div'); cleanChildren(tpl.content, tmp);
  const out = document.createElement('div');
  (function flatten(src, dst) {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) { dst.append(n.textContent); continue; }
      if (['P', 'H3', 'UL', 'OL', 'LI'].includes(n.tagName)) { if (dst.textContent) dst.append(' '); flatten(n, dst); continue; }
      if (n.tagName === 'BR') { dst.append(' '); continue; }
      const c = n.cloneNode(false); flatten(n, c); dst.append(c);
    }
  })(tmp, out);
  for (const el of [...out.querySelectorAll('span')]) if (!el.textContent) el.remove();
  const flat = out.innerHTML.replace(/\s+/g, ' ');
  return keepEdgeSpaces ? flat : flat.trim();
}
// Clipboard HTML often marks bold and italic with inline styles on spans, and Google Docs wraps everything in a
// <b style="font-weight:normal">. Turn those into the tags the sanitizer keeps, before it strips the styles.
function pastedHTML(html) {
  const frag = /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/.exec(html || '');   // Windows wraps the copied part in these
  const tpl = document.createElement('template'); tpl.innerHTML = frag ? frag[1] : html || '';
  const isBold = (el) => { const w = el.style.fontWeight; return w === 'bold' || w === 'bolder' || Number(w) >= 700; };
  for (const el of [...tpl.content.querySelectorAll('b, strong, span')]) {
    if (el.tagName !== 'SPAN') { if (el.style.fontWeight && !isBold(el)) el.replaceWith(...el.childNodes); continue; }
    for (const [on, tag] of [[isBold(el), 'strong'], [el.style.fontStyle === 'italic', 'em']]) {
      if (!on) continue;
      const wrap = document.createElement(tag); wrap.append(...el.childNodes); el.append(wrap);
    }
  }
  return tpl.innerHTML;
}
