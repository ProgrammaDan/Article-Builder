'use strict';
// The exported page's own stylesheet and script. Export writes them to export/style.css and export/script.js, and the
// preview inlines them. They are kept here as a string and a function, not as .css and .js files of their own, because
// a page opened straight from disk can load other files as scripts but can't read them as text.

/* ---------- style.css ---------- */
const ARTICLE_CSS = String.raw`
:root {
  --bg: #FFFFFF;
  --ink: #1A1D1C;
  --muted: #5B6360;
  --surface: #F1F3F2;
  --accent: #1E7A5A;
  --serif: "Source Serif 4", Georgia, "Times New Roman", serif;
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --measure: 40rem;
  --gap: 1.25rem;
  color-scheme: light;
}
html[data-theme="dark"] {
  --bg: #141716; --ink: #E4E9E6; --muted: #99A29E; --surface: #1F2422; --accent: #5CC49A;
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  html[data-theme="auto"] {
    --bg: #141716; --ink: #E4E9E6; --muted: #99A29E; --surface: #1F2422; --accent: #5CC49A;
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--serif); font-size: 1.125rem; line-height: 1.65; }
.article { max-width: 55rem; margin: 0 auto; padding: 4.5rem 1.5rem 6rem; }
.article.wide { max-width: 70rem; }
.article-header { max-width: var(--measure); margin-bottom: 3.5rem; }
/* An article of more than one page has a button for each at the top right of every page. The title lines keep two
   thirds of the width and wrap within it, so the two never run into each other. */
.article-header.has-pages { max-width: none; display: flex; align-items: flex-start; gap: 1rem 1.5rem; }
.article-head-text { order: -1; flex: 2 1 0; min-width: 0; }   /* first to the eye; the buttons come first in the markup */
.pages { flex: 1 1 0; min-width: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .4rem; padding-top: .35rem; }
.pages a { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 .9375rem/1.2 var(--sans); color: var(--ink); background: var(--surface); text-decoration: none; padding: .5rem .85rem; border-radius: 4px; }
.pages a:hover { box-shadow: inset 0 0 0 1px var(--muted); }
.pages a[aria-current="page"] { background: var(--ink); color: var(--bg); }
.pages-foot { margin-top: 4.5rem; padding-top: 1.5rem; border-top: 1px solid var(--surface); }   /* the same buttons again at the end */
h1 { font-family: var(--sans); font-weight: 600; font-size: clamp(2rem, 5vw, 2.75rem); line-height: 1.15; letter-spacing: -0.015em; margin: 0 0 .75rem; }
.subtitle { font-size: 1.3rem; line-height: 1.45; color: var(--muted); margin: 0 0 1rem; }
.meta { font-family: var(--sans); font-size: .875rem; color: var(--muted); margin: 0; }
section { margin-top: 4rem; }
h2 { font-family: var(--sans); font-weight: 600; font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.01em; margin: 0 0 1.5rem; max-width: var(--measure); scroll-margin-top: 1.5rem; border-left: .25rem solid var(--accent); padding-left: .8rem; }   /* the bar before a section heading */
.row { display: grid; grid-template-columns: var(--cols, minmax(0, 1fr)); gap: var(--gap); align-items: start; margin: 0 0 2.25rem; }
.row.align-middle { align-items: center; }
.cell-text > :first-child { margin-top: 0; }
.cell-text > :last-child { margin-bottom: 0; }
.cell-text p { margin: 0 0 1em; }
.cell-text h3 { font-family: var(--sans); font-size: 1.125rem; font-weight: 600; line-height: 1.35; margin: 1.6em 0 .5em; }
.cell-text ul, .cell-text ol { padding-left: 1.3em; margin: 0 0 1em; }
.cell-text li { margin: .25em 0; }
a { color: var(--accent); text-underline-offset: .15em; }
code { font-family: var(--mono); font-size: .86em; background: var(--surface); padding: .1em .35em; border-radius: 3px; }
figure { margin: 0; }
.cell-media img, .cell-media video { display: block; width: 100%; height: auto; border-radius: 3px; background: var(--surface); }
/* Whatever opens larger when clicked (a picture, a looping clip, a slideshow's cover) gets a white frame while the mouse
   is over it. The frame is drawn just inside the edge, so it shows against the picture whatever color the page is, and a
   dark hairline outside it keeps it visible on a picture that is itself white. Only where there is a mouse: on a touch
   screen a hover would stick after the tap. */
.cell-media img, .cell-media video.loop { cursor: zoom-in; outline: 3px solid transparent; outline-offset: -3px; transition: outline-color .15s ease, box-shadow .15s ease; }
@media (hover: hover) {
  .cell-media img:hover, .cell-media video.loop:hover { outline-color: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .45); }
  .slides-cover:hover { box-shadow: 0 0 0 1px rgba(0, 0, 0, .45); }
  .slides-cover:hover::after { opacity: 1; }
}
figcaption { font-family: var(--sans); font-size: 1.05rem; line-height: 1.5; color: var(--muted); margin-top: .6rem; }
.captions-center figcaption { text-align: center; }
/* The enlarged view: a column holding the picture with its text above or below. script.js makes the column as wide as
   the picture, so the text never runs wider than what it describes. It scrolls if the text is long. */
.lightbox { border: 0; padding: 0; margin: 0; width: 100%; height: 100%; max-width: none; max-height: none; overflow-y: auto; background: transparent; color: #E4E9E6; }   /* 100%, not 100vw, which would run under a desktop scrollbar */
.lightbox::backdrop { background: rgba(10, 12, 11, .92); }
.lightbox[open] { display: flex; }
.lightbox-col { margin: auto; padding: 3.5rem 0 1.25rem; max-width: 94vw; display: flex; flex-direction: column; gap: .75rem; }   /* auto margins center it, and still let a tall one scroll from its top */
.lightbox img, .lightbox video { max-width: 94vw; max-height: 80vh; width: auto; height: auto; }
.lightbox.has-text img, .lightbox.has-text video { max-height: 62vh; }   /* smaller, to leave room for the row's text under it */
.lightbox img { cursor: zoom-out; }
.lightbox-fig { position: relative; line-height: 0; align-self: center; }
.lightbox-cap { font: 1.125rem/1.45 var(--sans); }
.lightbox.captions-center .lightbox-cap { text-align: center; }
.lightbox-above:empty, .lightbox-below:empty { display: none; }
/* Image markup: indicator lines and labels, drawn in an SVG laid exactly over the picture so they scale with it */
.marked { position: relative; }
.marks { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.lightbox a { color: #5CC49A; }
.lightbox code { background: #1F2422; }
.lightbox :focus-visible { outline-color: #5CC49A; }
.lightbox-nav { position: fixed; top: 50%; width: 2.75rem; height: 2.75rem; margin-top: -1.375rem; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(255, 255, 255, .16); cursor: pointer; }
.lightbox-nav:hover { background: rgba(255, 255, 255, .28); }
.lightbox-nav[aria-disabled="true"] { opacity: .25; cursor: default; }
.lightbox-nav[hidden] { display: none; }
.lightbox-prev { left: 1rem; }
.lightbox-next { right: 1rem; }
.lightbox-count { position: fixed; top: 1.4rem; left: 1.25rem; margin: 0; font: .8125rem var(--sans); letter-spacing: .05em; text-transform: uppercase; color: #99A29E; }
.lightbox-count:empty { display: none; }
.lightbox-close { position: fixed; top: 1rem; right: 1rem; font: 500 .875rem var(--sans); color: #fff; background: rgba(255, 255, 255, .14); border: 0; border-radius: 4px; padding: .5rem .8rem; cursor: pointer; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* Slideshow: the cover in the page */
/* A YouTube video: its still and a play button until clicked, then YouTube's own player in the same box */
.yt { position: relative; display: block; overflow: hidden; border-radius: 3px; background: #000; }
.yt img, .yt iframe { display: block; width: 100%; height: 100%; border: 0; object-fit: cover; }
.yt-play { position: absolute; left: 50%; top: 50%; width: 68px; height: 48px; margin: -24px 0 0 -34px; border-radius: 12px; background: rgba(23, 23, 23, .8); transition: background .15s ease; }
.yt-play::before { content: ""; position: absolute; left: 27px; top: 14px; border-style: solid; border-width: 10px 0 10px 17px; border-color: transparent transparent transparent #fff; }
.yt:hover .yt-play, .yt:focus-visible .yt-play { background: #f00; }
.slides-cover { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 3px; overflow: hidden; background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
.slides-cover img, .slides-cover video { display: block; width: 100%; height: auto; }
.slides-cover::after { content: ""; position: absolute; inset: 0; border: 3px solid #fff; border-radius: inherit; opacity: 0; transition: opacity .15s ease; pointer-events: none; }   /* the hover frame; an outline would sit under the cover's picture */
.slides-cover img, .slides-cover video, .slides-cover .marks { transition: transform .4s ease; }
.slides-cover:hover img, .slides-cover:hover video, .slides-cover:hover .marks { transform: scale(1.02); }
.slides-badge { position: absolute; left: .75rem; bottom: .75rem; display: inline-flex; align-items: center; gap: .75rem; font: 500 1.21875rem/1 var(--sans); color: #fff; background: rgba(10, 12, 11, .8); border-radius: 999px; padding: .75rem 1.275rem .75rem 1.125rem; }
.slides-badge::before { content: ""; border-style: solid; border-width: .45rem 0 .45rem .75rem; border-color: transparent transparent transparent currentColor; }

/* Slideshow: the full-screen viewer. script.js sizes and places each .ss-slide; the look of each position is set here. */
.slideshow { border: 0; padding: 0; margin: 0; width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; overflow: hidden; background: #0C0E0D; color: #E4E9E6; font-family: var(--sans); }
.slideshow::backdrop { background: #0C0E0D; }
.slideshow[open] { display: grid; grid-template-rows: 3.5rem minmax(0, 1fr) 7rem; }
.slideshow a { color: #5CC49A; }
.slideshow code { background: #1F2422; }
.slideshow :focus-visible { outline-color: #5CC49A; }
.ss-close { justify-self: end; align-self: center; margin-right: 1rem; font: 500 .875rem var(--sans); color: #fff; background: rgba(255, 255, 255, .14); border: 0; border-radius: 4px; padding: .5rem .8rem; cursor: pointer; }
.ss-stage { position: relative; min-height: 0; }
.ss-track { position: absolute; inset: 0; perspective: 1400px; }
.ss-slide {
  position: absolute; left: 50%; top: 50%; opacity: 0; visibility: hidden; cursor: pointer;
  transition: transform .55s cubic-bezier(.22, .8, .24, 1), opacity .55s ease, visibility 0s .55s;
}
.ss-slide[data-pos="cur"] { opacity: 1; visibility: visible; z-index: 3; cursor: default; transition-delay: 0s; }
.ss-slide[data-pos="side"] { opacity: .5; visibility: visible; z-index: 2; transition-delay: 0s; }
.ss-slide img, .ss-slide video { display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 3px; background: #1F2422; box-shadow: 0 .6rem 2.5rem rgba(0, 0, 0, .55); }
.ss-slide:not([data-pos="cur"]) > * { pointer-events: none; }
.ss-jump .ss-slide { transition: none; }
.ss-nav { position: absolute; top: 50%; z-index: 5; width: 2.75rem; height: 2.75rem; margin-top: -1.375rem; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(255, 255, 255, .16); cursor: pointer; }
.ss-nav:hover { background: rgba(255, 255, 255, .28); }
.ss-nav[aria-disabled="true"] { opacity: .25; cursor: default; }
.ss-prev { left: 1rem; }
.ss-next { right: 1rem; }
.ss-foot { padding: .75rem 1.5rem 1rem; overflow-y: auto; text-align: center; }
.ss-count { margin: 0 0 .3rem; font-size: .8125rem; letter-spacing: .05em; text-transform: uppercase; color: #99A29E; }
.ss-cap { margin: 0 auto; max-width: 44rem; font-size: 1rem; line-height: 1.5; }
@media (prefers-reduced-motion: reduce) { .ss-slide, .slides-cover img, .slides-cover video, .slides-cover .marks { transition: none; } }
@media (max-width: 720px) {
  body { font-size: 1.0625rem; }
  .article { padding: 3rem 1.125rem 4rem; }
  .article-header.has-pages { flex-direction: column; align-items: stretch; }   /* the page buttons go above the title */
  .article-head-text { order: 0; flex: none; }
  .pages { flex: none; justify-content: flex-start; padding-top: 0; }
  .row { grid-template-columns: minmax(0, 1fr); }
  .row-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
  .cell-empty { display: none; }
  section { margin-top: 3rem; }
  .ss-nav, .lightbox-nav { width: 2.25rem; height: 2.25rem; margin-top: -1.125rem; }
  .ss-prev, .lightbox-prev { left: .5rem; }
  .ss-next, .lightbox-next { right: .5rem; }
  .ss-foot { padding: .75rem 1rem 1rem; }
  .ss-cap { font-size: .9375rem; }
}
@media print {
  .lightbox, .slideshow, .pages { display: none; }
  .article { padding: 0; }
}
`.trim();

/* ---------- script.js ---------- */
// Never called in the editor. ARTICLE_JS below is this function's source, wrapped so that it runs when the exported
// page loads. Written in old-style JavaScript on purpose, so the exported page works in older browsers too.
function articleScript() {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loops = Array.prototype.slice.call(document.querySelectorAll('video.loop'));
  loops.forEach(function (v) {
    v.muted = true;
    if (reduce) { v.autoplay = false; v.removeAttribute('autoplay'); v.pause(); v.controls = true; }
  });
  // Looping clips only play while on screen.
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
        else { e.target.pause(); }
      });
    }, { threshold: 0.2 });
    loops.forEach(function (v) { io.observe(v); });
  }
  // A YouTube video is shown as its still with a play button, and becomes YouTube's player when clicked. The player has
  // to know which site it is on, so a page opened straight from a file (or the editor's preview) follows the link and
  // opens the video on YouTube instead.
  document.addEventListener('click', function (e) {
    var yt = e.target.closest && e.target.closest('a.yt');
    if (!yt || !/^https?:$/.test(location.protocol)) return;
    e.preventDefault();
    var ytFrame = document.createElement('iframe'), ytBox = document.createElement('div'), ytStart = yt.getAttribute('data-start');
    ytFrame.src = 'https://www.youtube-nocookie.com/embed/' + yt.getAttribute('data-yt') + '?autoplay=1&rel=0' + (ytStart ? '&start=' + ytStart : '');
    ytFrame.title = yt.getAttribute('aria-label').replace(/^Play video: /, '');
    ytFrame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    ytFrame.setAttribute('allowfullscreen', '');
    ytFrame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    ytBox.className = 'yt'; ytBox.style.aspectRatio = yt.style.aspectRatio;
    ytBox.appendChild(ytFrame); yt.parentNode.replaceChild(ytBox, yt); ytFrame.focus();
  });
  // Click a picture (or a looping clip) to see it full size. If the author grouped it with others (the figures sharing
  // its data-group), step through those with the arrow buttons, the arrow keys or a swipe.
  var box = document.querySelector('.lightbox');
  if (box && typeof box.showModal === 'function') {
    // Names here start with lb where the slideshow below has its own (count, cap, prevBtn, nextBtn, fit): a var is shared
    // by this whole function.
    var lbCol = box.querySelector('.lightbox-col'), fig = box.querySelector('.lightbox-fig'), lbCount = box.querySelector('.lightbox-count');
    var lbAbove = box.querySelector('.lightbox-above'), lbBelow = box.querySelector('.lightbox-below');
    var lbPrev = box.querySelector('.lightbox-prev'), lbNext = box.querySelector('.lightbox-next');
    var group = [], pos = 0;
    // The column is made as wide as the picture, so its text wraps to the picture's width. A very narrow picture gets a
    // little more than its own width, or its caption would be squeezed into a sliver.
    var lbFit = function () {
      var big = fig.firstChild, w = big ? big.getBoundingClientRect().width : 0;
      lbCol.style.width = w ? Math.max(w, Math.min(240, window.innerWidth - 32)) + 'px' : '';
    };
    var showItem = function () {
      var figure = group[pos], from = figure.querySelector('img, video'), caption = figure.querySelector('figcaption'), marks = figure.querySelector('.marks');
      var row = figure.parentNode.children, text = '', big, i;
      for (i = 0; i < row.length; i++) if (/(^| )cell-text( |$)/.test(row[i].className)) text += row[i].innerHTML;   // text sharing the picture's row
      fig.textContent = '';                     // also stops a video that was playing
      if (from.tagName === 'VIDEO') {
        big = document.createElement('video'); big.playsInline = true;
        if (from.className === 'loop') { big.muted = true; big.loop = true; big.autoplay = true; }   // a loop stays a loop
        else { big.controls = true; if (from.poster) big.poster = from.poster; }
        if (from.getAttribute('aria-label')) big.setAttribute('aria-label', from.getAttribute('aria-label'));
      } else { big = document.createElement('img'); big.alt = from.alt; }
      if (from.getAttribute('width')) { big.setAttribute('width', from.getAttribute('width')); big.setAttribute('height', from.getAttribute('height')); }
      big.addEventListener(from.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', lbFit);
      big.src = from.currentSrc || from.src;
      fig.appendChild(big);
      if (marks) fig.appendChild(marks.cloneNode(true));   // carry the image's markup over
      var many = group.length > 1;
      lbPrev.hidden = lbNext.hidden = !many;
      lbPrev.setAttribute('aria-disabled', String(pos === 0));
      lbNext.setAttribute('aria-disabled', String(pos === group.length - 1));
      lbCount.textContent = many ? (pos + 1) + ' of ' + group.length : '';
      // With text in the picture's row, that text goes under the picture and the caption above it. Otherwise the caption
      // goes under.
      if (text) box.classList.add('has-text'); else box.classList.remove('has-text');
      lbAbove.innerHTML = text && caption ? caption.innerHTML : '';
      lbBelow.className = 'lightbox-below ' + (text ? 'cell-text' : 'lightbox-cap');
      lbBelow.innerHTML = text || (caption ? caption.innerHTML : '');
      box.scrollTop = 0;
      lbFit();
    };
    var step = function (to) { if (to >= 0 && to < group.length && to !== pos) { pos = to; showItem(); } };
    document.addEventListener('click', function (e) {
      var t = e.target, on = function (sel) { return t.closest && t.closest(sel); };
      var hit = on('.cell-media img, .cell-media video.loop');   // a video with controls keeps its clicks for itself
      if (hit) {
        var figure = hit.closest('.cell-media'), id = figure.getAttribute('data-group');
        group = id ? Array.prototype.slice.call(document.querySelectorAll('.cell-media[data-group="' + id + '"]')) : [figure];
        pos = Math.max(0, group.indexOf(figure));
        showItem(); box.showModal(); lbFit();   // measured again now that it is on screen
        return;
      }
      if (!box.open) return;
      if (on('.lightbox-prev')) step(pos - 1);
      else if (on('.lightbox-next')) step(pos + 1);
      else if (t === box || t === lbCol || (t.tagName === 'IMG' && fig.contains(t)) || on('.lightbox-close')) box.close();
    });
    // The close event arrives a moment after closing. If something was opened again in between, leave it alone.
    box.addEventListener('close', function () { if (!box.open) { fig.textContent = ''; lbAbove.textContent = ''; lbBelow.textContent = ''; lbCount.textContent = ''; group = []; } });
    // Capture phase, so the arrow keys change picture even when a video has focus (where they would seek instead).
    document.addEventListener('keydown', function (e) {
      if (!box.open || e.altKey || e.ctrlKey || e.metaKey) return;
      var to = e.key === 'ArrowLeft' ? pos - 1 : e.key === 'ArrowRight' ? pos + 1 : null;
      if (to === null) return;
      e.preventDefault(); step(to);
    }, true);
    var startX = null;                          // a swipe that starts on a video is left to its controls
    box.addEventListener('touchstart', function (e) { startX = e.touches.length === 1 && e.target.tagName !== 'VIDEO' ? e.touches[0].clientX : null; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX; startX = null;
      if (Math.abs(dx) > 40) step(pos + (dx < 0 ? 1 : -1));
    }, { passive: true });
    window.addEventListener('resize', function () { if (box.open) lbFit(); });
  }
  // Slideshows: clicking a cover opens the viewer at step 1. The step before and the step after sit behind the
  // current one, smaller and turned away, and swing round like a dial when the visitor moves on.
  var show = document.querySelector('.slideshow');
  if (show && typeof show.showModal === 'function') {
    var SIDE_SCALE = 0.8, SIDE_MIN = 0.66, SIDE_TURN = 16, OVERLAP = 0.18;   // side slides: size range, angle (degrees), share tucked under the current one
    var track = show.querySelector('.ss-track'), count = show.querySelector('.ss-count'), cap = show.querySelector('.ss-cap');
    var prevBtn = show.querySelector('.ss-prev'), nextBtn = show.querySelector('.ss-next');
    var items = [], at = 0, opener = null;
    var fit = function (it, maxW, maxH) {      // never enlarges past the file's own size
      var w = it.w || 4, h = it.h || 3, k = Math.min(maxW / w, maxH / h, it.w ? 1 : Infinity);
      return { w: w * k, h: h * k };
    };
    var layout = function () {
      if (!items.length) return;
      var W = track.clientWidth, H = track.clientHeight - 16, maxW = W * (W < 720 ? 0.84 : 0.5);
      var cur = fit(items[at], maxW, H), room = (W - cur.w) / 2 - 16;   // room: the space beside the current slide
      items.forEach(function (it, i) {
        var d = i - at, dir = d < 0 ? -1 : 1, s = fit(it, maxW, H), x = 0, scale = 1, turn = 0;
        if (d) {
          // Shrink a side slide to fit the space beside the current one (within limits), and keep it shorter than the current one.
          scale = Math.min(SIDE_SCALE, 0.86 * cur.h / s.h, Math.max(SIDE_MIN, room / (s.w * (1 - OVERLAP))));
          turn = dir * SIDE_TURN;
          x = dir * (cur.w / 2 + s.w * scale * (0.5 - OVERLAP));
          if (d < -1 || d > 1) { x *= 1.5; scale = 0.6; turn *= 2; }   // where slides wait before coming in and go after leaving
        }
        it.el.style.width = s.w + 'px'; it.el.style.height = s.h + 'px';
        it.el.style.transform = 'translate(-50%, -50%) translateX(' + x + 'px) rotateY(' + turn + 'deg) scale(' + scale + ')';
        it.el.setAttribute('data-pos', d === 0 ? 'cur' : d === 1 || d === -1 ? 'side' : 'off');
      });
    };
    var sized = function (it, w, h) { if (!it.w && w) { it.w = w; it.h = h; layout(); } };
    var load = function (it) {                 // media is only fetched once a slide is near the current one
      if (it.media) return;
      var m;
      if (it.kind === 'video') {
        m = document.createElement('video'); m.playsInline = true; m.preload = it.poster ? 'none' : 'metadata';
        if (it.poster) m.poster = it.poster;
        if (it.loop) { m.muted = true; m.loop = true; }
        m.setAttribute('aria-label', it.alt);
        m.addEventListener('loadedmetadata', function () { sized(it, m.videoWidth, m.videoHeight); });
      } else {
        m = document.createElement('img'); m.decoding = 'async'; m.alt = it.alt;
        m.addEventListener('load', function () { sized(it, m.naturalWidth, m.naturalHeight); });
      }
      m.src = it.src; it.media = m; it.el.appendChild(m);
      if (it.marks) it.el.appendChild(it.marks.cloneNode(true));
    };
    var update = function () {
      items.forEach(function (it, i) {
        if (Math.abs(i - at) <= 2) load(it);
        it.el.setAttribute('aria-hidden', String(i !== at));
        if (it.media && it.kind === 'video') {
          // A looping step plays by itself, silently, while it is the one showing, and has no controls. For visitors who
          // ask for reduced motion it is an ordinary player instead, as looping clips in the page are.
          if (it.loop) { if (i === at) { var playing = it.media.play(); if (playing && playing.catch) playing.catch(function () {}); } else it.media.pause(); }
          else it.media.controls = i === at;
        }
      });
      count.textContent = (at + 1) + ' of ' + items.length;
      cap.innerHTML = items[at].cap;
      prevBtn.setAttribute('aria-disabled', String(at === 0));
      nextBtn.setAttribute('aria-disabled', String(at === items.length - 1));
      layout();
    };
    var go = function (i) {
      if (i < 0 || i >= items.length || i === at) return;
      var m = items[at].media; if (m && m.pause) m.pause();
      at = i; update();
    };
    var open = function (list) {
      track.textContent = '';
      items = Array.prototype.map.call(list.children, function (li, i) {
        var el = document.createElement('div'); el.className = 'ss-slide';
        var c = li.querySelector('.slide-caption'), text = c ? c.textContent.replace(/\s+/g, ' ').trim() : '';
        el.addEventListener('click', function () { go(i); });
        track.appendChild(el);
        return {
          el: el, kind: li.getAttribute('data-kind'), src: li.getAttribute('data-src'), poster: li.getAttribute('data-poster'),
          w: Number(li.getAttribute('data-w')) || 0, h: Number(li.getAttribute('data-h')) || 0, loop: li.hasAttribute('data-loop') && !reduce,
          cap: c ? c.innerHTML : '', alt: text || 'Step ' + (i + 1), marks: li.querySelector('.marks')
        };
      });
      if (!items.length) return;
      at = 0; show.showModal();
      track.classList.add('ss-jump'); update(); void track.offsetWidth; track.classList.remove('ss-jump');
    };
    document.addEventListener('click', function (e) {
      var cover = e.target.closest && e.target.closest('.slides-cover');
      var list = cover && document.getElementById(cover.getAttribute('data-slides'));
      if (list) { opener = cover; open(list); }
    });
    prevBtn.addEventListener('click', function () { go(at - 1); });
    nextBtn.addEventListener('click', function () { go(at + 1); });
    show.querySelector('.ss-close').addEventListener('click', function () { show.close(); });
    show.addEventListener('close', function () {
      if (show.open) return;                   // reopened before this late event arrived: leave it alone
      track.textContent = ''; items = [];      // also stops any video
      if (opener) opener.focus();              // not every browser focuses a button on click, so don't rely on the dialog for this
    });
    // Capture phase, so the arrow keys change step even when a video has focus (where they would seek instead).
    document.addEventListener('keydown', function (e) {
      if (!show.open || e.altKey || e.ctrlKey || e.metaKey) return;
      var to = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
      if (to === null) return;
      e.preventDefault(); go(to);
    }, true);
    var swipeX = null;                         // a swipe that starts on a video is left to its controls
    track.addEventListener('touchstart', function (e) { swipeX = e.touches.length === 1 && e.target.tagName !== 'VIDEO' ? e.touches[0].clientX : null; }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (swipeX === null) return;
      var dx = e.changedTouches[0].clientX - swipeX; swipeX = null;
      if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
    }, { passive: true });
    window.addEventListener('resize', function () { if (show.open) layout(); });
  }
}
const ARTICLE_JS = `(${articleScript})();`;
