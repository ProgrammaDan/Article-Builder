'use strict';
// Builds the article's HTML from the project. The preview and the export both use it.

/* ---------- Building the article HTML (used by preview and export) ---------- */
function uniqueSlug(text, used, fallback = 'section') {
  let s = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
  let out = s; for (let n = 2; used.has(out); n++) out = `${s}-${n}`;
  used.add(out); return out;
}
// A slideshow in the page: the cover is a button, and the steps are a hidden list that script.js reads when it's clicked.
async function slidesFigure(c, srcFor, posters) {
  const esc = escapeHTML, slides = liveSlides(c), cover = coverSlide(c), n = slides.length;
  const items = [];
  for (const s of slides) {
    const sd = S.dims.get(s.path), size = sd ? ` data-w="${sd.w}" data-h="${sd.h}"` : '';
    const poster = posters[s.path] ? ` data-poster="${esc(posters[s.path])}"` : '';
    const kind = S.mediaByPath.get(s.path).kind, marks = kind === 'image' ? marksSVG(S.project.marks[s.path], sd) : '';
    items.push(`<li data-kind="${kind}" data-src="${esc(await srcFor(s.path))}"${size}${poster}${kind === 'video' && s.loop ? ' data-loop' : ''}><span class="slide-caption">${sanitizeInline(s.caption)}</span>${marks}</li>`);
  }
  const d = S.dims.get(cover.path), wh = d ? ` width="${d.w}" height="${d.h}"` : '';
  const isVideo = S.mediaByPath.get(cover.path).kind === 'video';
  const face = isVideo && !posters[cover.path]
    ? `<video src="${esc(await srcFor(cover.path))}"${wh} muted playsinline preload="metadata"></video>`
    : `<img src="${esc(isVideo ? posters[cover.path] : await srcFor(cover.path))}" alt=""${wh} loading="lazy" decoding="async">`;
  const capHTML = sanitizeInline(c.caption), label = textOf(capHTML), steps = `${n} step${n === 1 ? '' : 's'}`;
  const id = 'slides-' + esc(c.id);
  return `<figure class="cell cell-slides">
<button class="slides-cover" type="button" data-slides="${id}" aria-haspopup="dialog" aria-label="${esc(`Open slideshow${label ? ': ' + label : ''} (${steps})`)}">
${face}${isVideo ? '' : marksSVG(S.project.marks[cover.path], d)}
<span class="slides-badge" aria-hidden="true">${n}</span>
</button>${capHTML ? `\n<figcaption>${capHTML}</figcaption>` : ''}
<ol class="slides-data" id="${id}" hidden>
${items.join('\n')}
</ol>
</figure>`;
}
const chevron = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SLIDESHOW_DIALOG = `<dialog class="slideshow" aria-label="Slideshow">
<button class="ss-close" type="button">Close</button>
<div class="ss-stage">
<div class="ss-track"></div>
<button class="ss-nav ss-prev" type="button" aria-label="Previous step">${chevron('M12.5 4l-6 6 6 6')}</button>
<button class="ss-nav ss-next" type="button" aria-label="Next step">${chevron('M7.5 4l6 6-6 6')}</button>
</div>
<div class="ss-foot"><p class="ss-count" aria-live="polite"></p><p class="ss-cap"></p></div>
</dialog>`;
// The exported page's stylesheet: the fixed part, then the rules for fonts chosen in the editor.
const articleCSS = () => ARTICLE_CSS + '\n\n/* Fonts chosen for particular text */\n' + fontRulesCSS();
// The file each page is exported as, by page id. The first page is index.html, the one a visitor lands on; the others
// are named after their buttons.
function pageFiles(p) {
  const used = new Set(['index']), files = new Map();
  p.pages.forEach((pg, i) => files.set(pg.id, (i ? uniqueSlug(pg.label, used, 'page') : 'index') + '.html'));
  return files;
}
// One page of the article as a whole HTML document: the page open in the editor, unless another is asked for.
async function buildArticle(p, { mode, posters = {}, page = openPage(p) }) {
  const esc = escapeHTML;
  const srcFor = async (path) => (linkMedia(path) ? path : mode === 'preview' ? (await getURL(path)) || '' : 'media/' + encPath(path));   // a link is used as it is
  const slugs = new Set();
  const body = [];
  const font = (key) => (key ? ` data-font="${key}"` : '');   // keys come from normalizeProject, so they are known good
  const many = p.pages.length > 1, files = pageFiles(p);
  const title = page.title || (many && page.label) || 'Untitled project';
  let lines = `<h1${font(page.fonts.title)}>${esc(title)}</h1>`;
  if (page.subtitle) lines += `\n<p class="subtitle"${font(page.fonts.subtitle)}>${esc(page.subtitle)}</p>`;
  if (page.meta) lines += `\n<p class="meta"${font(page.fonts.meta)}>${esc(page.meta)}</p>`;
  // A button for every page, at the top and again at the end. In the preview they carry the page's id, and the editor
  // swaps the preview's page itself (see setupUI): there are no files to link to yet.
  const links = many ? p.pages.map((pg) => `<a href="${mode === 'preview' ? '#' : esc(files.get(pg.id))}"${mode === 'preview' ? ` data-page="${esc(pg.id)}"` : ''}${pg === page ? ' aria-current="page"' : ''}>${esc(pg.label || 'Untitled')}</a>`).join('\n') : '';
  if (many) body.push(`<header class="article-header has-pages">\n<nav class="pages" aria-label="Pages">\n${links}\n</nav>\n<div class="article-head-text">\n${lines}\n</div>\n</header>`);
  else body.push(`<header class="article-header">\n${lines}\n</header>`);
  let sectionOpen = false, hasSlides = false;

  for (const r of page.rows) {
    if (r.type === 'section') {
      if (!r.text.trim()) continue;
      if (sectionOpen) body.push('</section>');
      const id = uniqueSlug(r.text, slugs);
      body.push(`<section aria-labelledby="${id}">\n<h2 id="${id}"${font(r.font)}>${esc(r.text)}</h2>`);
      sectionOpen = true; continue;
    }
    const cells = r.cells.map((c) => (c.kind === 'media' && !mediaOf(c.path)) || (c.kind === 'text' && !textOf(c.html)) || (c.kind === 'slides' && !coverSlide(c)) ? { kind: 'empty' } : c);
    if (cells.every((c) => c.kind === 'empty')) continue;
    const n = cells.length;
    const cls = ['row'];
    if (n >= 3 && cells.every((c) => c.kind === 'media' || c.kind === 'slides')) cls.push('row-gallery');
    if (n > 1 && r.align === 'center') cls.push('align-middle');
    const style = n > 1 ? ` style="--cols: ${rowWidths(r).map((w) => `minmax(0, ${w}fr)`).join(' ')}"` : '';
    const inner = [];
    for (const c of cells) {
      if (c.kind === 'text') { inner.push(`<div class="cell cell-text">\n${sanitize(c.html)}\n</div>`); continue; }
      if (c.kind === 'slides') { inner.push(await slidesFigure(c, srcFor, posters)); hasSlides = true; continue; }
      if (c.kind !== 'media') { inner.push('<div class="cell cell-empty" aria-hidden="true"></div>'); continue; }
      const m = mediaOf(c.path);
      const src = esc(await srcFor(c.path));
      const d = S.dims.get(c.path);
      const wh = d ? ` width="${d.w}" height="${d.h}"` : '';
      const capHTML = sanitizeInline(c.caption);
      const alt = esc(c.alt || textOf(capHTML));
      const cap = capHTML ? `\n<figcaption>${capHTML}</figcaption>` : '';
      if (m.kind === 'youtube') {
        // The video's still and a play button, linking to it on YouTube; script.js swaps in YouTube's player when it is
        // clicked. Not a .cell-media, so the enlarged view, groups and the hover frame leave it alone.
        const label = c.alt || textOf(capHTML) || 'YouTube video';
        inner.push(`<figure class="cell cell-embed">\n<a class="yt" href="${esc(c.path)}" data-yt="${esc(m.id)}"${m.start ? ` data-start="${m.start}"` : ''} target="_blank" rel="noopener" style="aspect-ratio: ${m.tall ? '9 / 16' : '16 / 9'}" aria-label="${esc('Play video: ' + label)}">\n<img src="${esc(ytThumb(m))}" alt="" loading="lazy">\n<span class="yt-play" aria-hidden="true"></span>\n</a>${cap}\n</figure>`);
        continue;
      }
      let el;
      if (m.kind === 'image') {
        el = `<img src="${src}" alt="${alt}"${wh} loading="lazy" decoding="async">`;
        const marks = marksSVG(p.marks[c.path], d);
        if (marks) el = `<div class="marked">\n${el}\n${marks}\n</div>`;
      }
      else if (c.video.mode === 'loop') el = `<video class="loop" src="${src}"${wh} autoplay muted loop playsinline preload="metadata"${alt ? ` aria-label="${alt}"` : ''}></video>`;
      else el = `<video src="${src}"${wh} controls playsinline preload="metadata"${posters[c.path] ? ` poster="${esc(posters[c.path])}"` : ''}${alt ? ` aria-label="${alt}"` : ''}></video>`;
      // data-group marks the media a reader can flip through together (the author's "Group media" choice).
      inner.push(`<figure class="cell cell-media"${c.group ? ` data-group="${c.group}"` : ''}>\n${el}${cap}\n</figure>`);
    }
    body.push(`<div class="${cls.join(' ')}"${style}>\n${inner.join('\n')}\n</div>`);
  }
  if (sectionOpen) body.push('</section>');
  if (many) body.push(`<nav class="pages pages-foot" aria-label="Pages, at the end">\n${links}\n</nav>`);

  const css = articleCSS();
  const js = ARTICLE_JS;
  const styleTag = mode === 'preview' ? `<style>\n${css}\n</style>` : '<link rel="stylesheet" href="style.css">';
  const scriptTag = mode === 'preview' ? `<script>\n${js}\n<\/script>` : '<script src="script.js" defer><\/script>';
  return `<!doctype html>
<html lang="en" data-theme="${esc(p.settings.theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${page.subtitle ? `<meta name="description" content="${esc(page.subtitle)}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
${styleTag}
</head>
<body>
<article class="article${p.settings.width === 'wide' ? ' wide' : ''}${p.settings.captions === 'center' ? ' captions-center' : ''}"${p.settings.width === 'custom' ? ` style="max-width: ${articleWidth(p.settings) / 16}rem"` : ''}>
${body.join('\n')}
</article>
<dialog class="lightbox${p.settings.captions === 'center' ? ' captions-center' : ''}" aria-label="Enlarged picture or video">
<div class="lightbox-col">
<div class="lightbox-above lightbox-cap"></div>
<div class="lightbox-fig"></div>
<div class="lightbox-below lightbox-cap"></div>
</div>
<p class="lightbox-count" aria-live="polite"></p>
<button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous">${chevron('M12.5 4l-6 6 6 6')}</button>
<button class="lightbox-nav lightbox-next" type="button" aria-label="Next">${chevron('M7.5 4l6 6-6 6')}</button>
<button class="lightbox-close" type="button">Close</button>
</dialog>
${hasSlides ? SLIDESHOW_DIALOG + '\n' : ''}${scriptTag}
</body>
</html>
`;
}

/* ---------- Preview ---------- */
// Shows a page as a visitor will see it: the one open in the editor, or the one whose button was clicked in the preview.
async function openPreview(pageId) {
  flushEdit();
  const used = [...usedPaths()].filter((p) => mediaOf(p));
  await Promise.all(used.map(ensureDims));
  const p = S.project;
  $('#previewFrame').srcdoc = await buildArticle(p, { mode: 'preview', page: p.pages.find((pg) => pg.id === pageId) || openPage(p) });
  $('#preview').hidden = false;
  $('#closePreviewBtn').focus();
}
function closePreview() { $('#preview').hidden = true; $('#previewFrame').srcdoc = ''; $('#previewBtn').focus(); }
function setPreviewDevice(dev) {
  $('#previewStage').classList.toggle('phone', dev === 'phone');
  for (const b of $$('#preview [data-dev]')) { const on = b.dataset.dev === dev; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
}
