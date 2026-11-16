'use strict';
// Constants, the app's state, and small helpers used everywhere.

/* ---------- Constants ---------- */
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const UNSUPPORTED_EXT = ['heic', 'heif', 'tif', 'tiff', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'raw'];
const PROJECT_FILE = 'project.json';
const EXPORT_DIR = 'export';
const IMPORT_DIR = 'imported';
const MANIFEST_FILE = '.export-manifest.json';
const POSTER_DIR = '_posters';
const LOOP_MAX_SECONDS = 12;          // videos this short default to "Loop"
const BIG_VIDEO_BYTES = 50 * 1024 * 1024;
const WIDTH_PRESETS = {
  1: [[1]],
  2: [[1, 1], [3, 2], [2, 3], [2, 1], [1, 2]],
  3: [[1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2]],
  4: [[1, 1, 1, 1]],
};
const WIDTH_PX = { standard: 880, wide: 1120 };   // the exported page's max width, side padding included
const WIDTH_MIN = 480, WIDTH_MAX = 3000;          // limits for a custom width
const MARK_COLORS = [['#FFFFFF', 'White'], ['#111111', 'Black'], ['#E5352B', 'Red'], ['#F28C28', 'Orange'], ['#FFD60A', 'Yellow'], ['#2FB344', 'Green'], ['#2D7FF9', 'Blue'], ['#E64980', 'Pink']];
const MARK_DEFAULT_COLOR = '#FFD60A';
// The fonts text can be set in, in the article and in image labels: the name shown in the menus, and the CSS font
// stack. FONT_URL below has to load every one of them in weights 400, 500, 600 and 700 with italics: a missing weight
// makes the browser substitute another, and the text looks bolder or lighter than its neighbors. (In labels the first
// font is the default and is never stored.)
const FONTS = {
  sans: ['Sans', "'IBM Plex Sans', system-ui, sans-serif"],
  serif: ['Serif', "'Source Serif 4', Georgia, serif"],
  mono: ['Mono', "'IBM Plex Mono', ui-monospace, Consolas, monospace"],
  condensed: ['Condensed', "'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif"],
};
const MARK_SIZES = { s: 18, m: 26, l: 36, xl: 50 };   // line weight presets, as the text height (in thousandths of the image's width) each one suits
const MARK_TEXT_DEFAULT = 26, MARK_TEXT_MIN = 6, MARK_TEXT_MAX = 300;   // label text height, same unit
const MARK_SNAP_DEG = 15;                             // every segment after a line's first point runs at a multiple of this
const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const EDITOR_THEME_KEY = 'article-builder:editor-theme';   // localStorage: 'light' | 'dark'; absent means follow the system
const LIBRARY_WIDTH_KEY = 'article-builder:library-width';  // localStorage: the media panel's width in pixels
const LIBRARY_WIDTH = { min: 220, max: 720, usual: 296 };
const PAGE_LABEL_MAX = 40;                            // the most characters a page's button can say
const OUTLINE = ['The problem', 'Constraints', 'Design', 'Build', 'What went wrong', 'Results'];
const FONT_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,500;1,8..60,700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=IBM+Plex+Sans+Condensed:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&display=swap';
// Which of FONTS a computed style is using, going by the first family in its font stack. null when it is none of them
// (inline code, for one, has a stack of its own).
function fontOf(cs) {
  const first = (stack) => stack.split(',')[0].replace(/["']/g, '').trim().toLowerCase(), used = first(cs.fontFamily);
  return Object.keys(FONTS).find((key) => first(FONTS[key][1]) === used) || null;
}
// The CSS that makes data-font="..." take effect. The editor and the exported page both use it, so they can't disagree.
const fontRulesCSS = () => Object.entries(FONTS).map(([key, [, stack]]) => `[data-font="${key}"][data-font] { font-family: ${stack}; }`).join('\n');
const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- State ---------- */
const S = {
  root: null,              // FileSystemDirectoryHandle of the project folder
  project: null,           // the layout (saved as project.json)
  media: [],               // [{path, name, dir, kind, handle}]
  mediaByPath: new Map(),
  urls: new Map(),         // path -> Promise<blob URL>
  thumbs: new Map(),       // path -> blob URL | 'pending' | 'error'
  dims: new Map(),         // path -> {w, h}
  durations: new Map(),    // path -> seconds
  selected: new Set(),
  hiddenOpen: false,       // whether the media panel's "Hidden media" folder is open
  rowSel: new Set(),       // ids of the rows selected by their handles, to be dragged together
  rowAnchor: null,         // the row a Shift-click extends the selection from
  slidesOpen: null,        // id of the slideshow cell whose steps panel is open
  grouping: null,          // {picked, editing} while media is being picked for a group (see groups.js)
  undo: [], redo: [],
  editSnap: null,
  saveTimer: null, saving: false, savePending: false, unsaved: false,
};
let dragState = null;      // {type:'media', path, paths} | {type:'cell', rowId, cellId} | {type:'row', rowId} | {type:'slide', slideId}

/* ---------- Small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const ext = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const str = (v, d) => (typeof v === 'string' ? v : d);
function kindOf(name) {
  const e = ext(name);
  if (IMAGE_EXT.includes(e)) return 'image';
  if (VIDEO_EXT.includes(e)) return 'video';
  if (UNSUPPORTED_EXT.includes(e)) return 'unsupported';
  return null;
}
function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function textOf(html) { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content.textContent.replace(/\s+/g, ' ').trim(); }
function encPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function fmtBytes(n) { return n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(0) + ' MB'; }
function fmtDuration(s) { if (!isFinite(s)) return ''; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;           // only ever given sanitized HTML
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const ICONS = {
  grip: '<svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></g></svg>',
};
function icon(name) { const s = document.createElement('span'); s.className = 'ico'; s.innerHTML = ICONS[name]; return s; }

let toastTimer = null;
function toast(msg, ms = 4500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
