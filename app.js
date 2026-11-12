'use strict';

const $ = (s) => document.querySelector(s);
const { parse, fold, matchIngredients, categoryOf, categories, catalog } = window.RecipeParser;

let recipes = []; // { raw, p, title, ings, ingSet, hay }
const state = { q: '', view: 'recettes', selected: new Set(), fav: false, showHidden: false, sort: 'recent' };
let current = null; // fiche ouverte

/* ---------- Utilitaires ---------- */

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

// replaceChildren() sans les valeurs vides (null s'afficherait « null »).
const fill = (node, ...kids) => node.replaceChildren(...kids.filter((k) => k != null && k !== false && k !== ''));

const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtSize = (n) => n < 1048576 ? Math.round(n / 1024) + ' Ko' : (n / 1048576).toFixed(1) + ' Mo';
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Données ---------- */

function compute(raw) {
  const p = parse(raw.caption, raw.author);
  const removed = new Set(raw.ingRemoved || []);
  const ings = [...new Set([...p.ingredients.filter((i) => !removed.has(i)), ...(raw.ingAdded || [])])];
  const title = raw.title || p.title;
  return {
    raw, p, title, ings,
    ingSet: new Set(ings),
    hay: fold([title, raw.author, raw.authorName, raw.caption, raw.text, raw.note, ings.join(' ')].join(' ')),
  };
}

async function load() {
  recipes = (await dbAll()).map(compute);
  render();
  updateStorageInfo();
}

// Enregistre une fiche modifiée et la recalcule.
async function commit(raw) {
  await dbPut(raw);
  const r = compute(raw);
  const i = recipes.findIndex((x) => x.raw.code === raw.code);
  if (i >= 0) recipes[i] = r; else recipes.push(r);
  return r;
}

async function updateStorageInfo() {
  let txt = plural(recipes.length, 'recette', 'recettes');
  if (navigator.storage?.estimate) {
    const { usage = 0 } = await navigator.storage.estimate();
    txt += ` · ${fmtSize(usage)} sur cet appareil`;
  }
  $('#storage-info').textContent = txt;
}

/* ---------- Filtres ---------- */

// Recettes correspondant aux ingrédients choisis / favoris (sans la recherche texte).
function baseSet() {
  return recipes.filter((r) =>
    (state.showHidden || !r.raw.hidden) &&
    (!state.fav || r.raw.fav) &&
    [...state.selected].every((i) => r.ingSet.has(i)));
}

function sortList(list) {
  const by = {
    recent: (a, b) => (b.raw.savedAt || 0) - (a.raw.savedAt || 0),
    az: (a, b) => collator.compare(a.title, b.title),
    author: (a, b) => collator.compare(a.raw.author, b.raw.author) || collator.compare(a.title, b.title),
  }[state.sort];
  return list.sort(by);
}

function ingredientCounts(list) {
  const counts = new Map();
  list.forEach((r) => r.ings.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1)));
  return counts;
}

function toggleIngredient(name) {
  if (state.selected.has(name)) state.selected.delete(name); else state.selected.add(name);
  render();
}

/* ---------- Rendu ---------- */

function chip(label, { active = false, onClick, cls = '' } = {}) {
  return el('button', { type: 'button', class: `chip ${cls}${active ? ' active' : ''}`, onclick: onClick }, label);
}

function render() {
  const base = baseSet();
  const q = fold(state.q);
  const words = q ? q.split(' ') : [];
  const inIndex = state.view === 'ingredients';

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === state.view));
  $('#btn-fav').setAttribute('aria-pressed', String(state.fav));
  $('#search').placeholder = inIndex ? 'Filtrer les ingrédients…' : 'Rechercher une recette, un auteur…';

  // Ingrédients choisis
  fill($('#selected'), ...[...state.selected].map((i) =>
    chip([i, el('span', { class: 'x' }, '✕')], { active: true, onClick: () => toggleIngredient(i) })),
    state.selected.size > 1 ? chip('Tout retirer', { cls: 'ghost', onClick: () => { state.selected.clear(); render(); } }) : null);

  const list = inIndex ? [] : sortList(base.filter((r) => words.every((w) => r.hay.includes(w))));
  const counts = ingredientCounts(inIndex ? base : list);

  // Suggestions d'ingrédients pendant la recherche
  const sugg = !inIndex && q
    ? [...counts.keys()].filter((i) => !state.selected.has(i) && fold(i).includes(q))
      .sort((a, b) => counts.get(b) - counts.get(a)).slice(0, 12)
    : [];
  $('#suggest').replaceChildren(...sugg.map((i) =>
    chip(['+ ', i, el('span', { class: 'n' }, counts.get(i))], {
      onClick: () => { state.selected.add(i); state.q = ''; $('#search').value = ''; render(); },
    })));

  $('#list').hidden = inIndex;
  $('#index').hidden = !inIndex;
  $('#sort').hidden = inIndex;

  if (inIndex) renderIndex(base, counts, q);
  else $('#list').replaceChildren(...list.map(card));

  const hiddenCount = recipes.filter((r) => r.raw.hidden).length;
  const shown = inIndex ? base.length : list.length;
  const countTxt = !recipes.length ? '' :
    inIndex ? `${plural(counts.size, 'ingrédient', 'ingrédients')} dans ${plural(base.length, 'recette', 'recettes')}` :
    shown === recipes.length - (state.showHidden ? 0 : hiddenCount) && !state.selected.size && !state.fav && !q
      ? plural(shown, 'recette', 'recettes')
      : `${shown} sur ${plural(recipes.length, 'recette', 'recettes')}`;
  fill($('#count'), countTxt,
    hiddenCount ? el('button', { type: 'button', class: 'link-btn', style: 'margin-left:8px',
      onclick: () => { state.showHidden = !state.showHidden; render(); } },
    state.showHidden ? 'cacher les masquées' : `+ ${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''}`) : null);

  $('#empty').hidden = recipes.length > 0;
  $('#noresult').hidden = !(recipes.length && !inIndex && !list.length);
}

function card(r) {
  const sel = r.ings.filter((i) => state.selected.has(i));
  const others = r.ings.filter((i) => !state.selected.has(i));
  const parts = [...sel.map((i) => el('b', {}, i)), ...others];
  const ings = parts.flatMap((x, k) => (k ? [' · ', x] : [x]));
  return el('button', { type: 'button', class: 'card', onclick: () => openDetail(r) },
    r.raw.thumb ? el('img', { src: r.raw.thumb, class: 'thumb', alt: '', loading: 'lazy' }) : el('div', { class: 'thumb' }, '🍽️'),
    el('div', { class: 'card-body' },
      el('div', { class: 'card-title' }, r.raw.fav ? '★ ' : '', r.title),
      el('div', { class: 'card-meta' }, '@' + r.raw.author,
        r.p.hasRecipe ? '' : ' · recette absente du texte',
        r.raw.hidden ? ' · masquée' : ''),
      ings.length ? el('div', { class: 'card-ings' }, ings) : null));
}

function renderIndex(base, counts, q) {
  const groups = new Map(categories.map((c) => [c, []]));
  const names = new Set([...counts.keys(), ...state.selected]);
  for (const name of names) {
    if (q && !fold(name).includes(q)) continue;
    const cat = categoryOf.get(name) || 'Autres';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(name);
  }
  const sections = [];
  if (state.selected.size) {
    sections.push(el('p', {},
      el('button', { type: 'button', class: 'btn primary',
        onclick: () => { state.view = 'recettes'; render(); window.scrollTo(0, 0); } },
      `Voir les ${plural(base.length, 'recette', 'recettes')}`),
      el('span', { class: 'muted small', style: 'margin-left:10px' }, 'Les nombres tiennent compte de ta sélection.')));
  }
  for (const [cat, list] of groups) {
    if (!list.length) continue;
    list.sort(collator.compare);
    sections.push(el('section', {},
      el('h2', {}, cat),
      el('div', { class: 'chips' }, list.map((i) =>
        chip([i, el('span', { class: 'n' }, counts.get(i) || 0)], {
          active: state.selected.has(i), onClick: () => toggleIngredient(i),
        })))));
  }
  if (!recipes.length) sections.length = 0;
  else if (sections.length === (state.selected.size ? 1 : 0)) sections.push(el('p', { class: 'muted empty' }, 'Aucun ingrédient ne correspond.'));
  $('#index').replaceChildren(...sections);
}

/* ---------- Fiche recette ---------- */

const detail = $('#detail');

function openDetail(r) {
  current = r;
  const { raw, p } = r;
  $('#d-thumb').hidden = !raw.thumb;
  if (raw.thumb) $('#d-thumb').src = raw.thumb;
  $('#d-title').value = r.title;
  $('#d-meta').textContent = ['@' + raw.author, raw.mediaType, raw.takenAt ? 'publié le ' + dateFmt.format(raw.takenAt) : '']
    .filter(Boolean).join(' · ');
  $('#d-open').href = raw.url;
  $('#d-note').value = raw.note || '';
  $('#d-hidden').checked = !!raw.hidden;

  const warn = !p.hasRecipe
    ? "Le texte de ce post ne contient pas vraiment de recette : elle est sans doute dans les images, la vidéo ou un commentaire. Ouvre le post dans Instagram."
    : p.source === 'texte' ? "Pas de liste d'ingrédients trouvée : ceux ci-dessous sont devinés à partir de tout le texte, vérifie-les."
      : '';
  $('#d-warn').textContent = warn;
  $('#d-warn').hidden = !warn;

  $('#d-lines-wrap').hidden = !p.ingredientLines.length;
  $('#d-lines').replaceChildren(...p.ingredientLines.map((l) => el('li', {}, l)));

  showText(false);
  refreshDetail();
  detail.showModal();
  detail.querySelector('.sheet-body').scrollTop = 0;
  detail.scrollTop = 0;
}

function refreshDetail() {
  const r = current;
  $('#d-fav').textContent = r.raw.fav ? '★' : '☆';
  $('#d-ings').replaceChildren(...r.ings.map((i) =>
    chip([i, el('span', { class: 'x', 'aria-label': 'retirer' }, '✕')], { onClick: () => removeIng(i) })));
  if (!r.ings.length) $('#d-ings').append(el('span', { class: 'muted small' }, 'Aucun ingrédient reconnu.'));
  $('#d-text').textContent = r.raw.text ?? r.p.body;
  $('#d-reset-text').hidden = r.raw.text == null;
}

function showText(editing) {
  $('#d-text').hidden = editing;
  $('#d-text-edit').hidden = !editing;
  $('#d-edit-text').textContent = editing ? 'Terminé' : 'Modifier';
  if (editing) {
    $('#d-text-edit').value = current.raw.text ?? current.p.body;
    $('#d-text-edit').focus();
  }
}

async function update(changes) {
  Object.assign(current.raw, changes);
  for (const [k, v] of Object.entries(changes)) if (v == null) delete current.raw[k];
  current = await commit(current.raw);
  refreshDetail();
}

function removeIng(name) {
  const added = (current.raw.ingAdded || []).filter((i) => i !== name);
  const removed = new Set(current.raw.ingRemoved || []);
  if (current.p.ingredients.includes(name)) removed.add(name);
  update({ ingAdded: added, ingRemoved: [...removed] });
}

$('#d-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const typed = $('#d-add-input').value.trim().toLowerCase();
  if (!typed) return;
  const name = matchIngredients(typed)[0] || typed; // « tomates cerises » → tomate
  const removed = (current.raw.ingRemoved || []).filter((i) => i !== name);
  const added = new Set(current.raw.ingAdded || []);
  if (!current.p.ingredients.includes(name)) added.add(name);
  $('#d-add-input').value = '';
  update({ ingAdded: [...added], ingRemoved: removed });
  fillDatalist();
});

$('#d-title').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  update({ title: v && v !== current.p.title ? v : null });
  if (!v) e.target.value = current.p.title;
});
$('#d-fav').addEventListener('click', () => update({ fav: !current.raw.fav || null }));
$('#d-hidden').addEventListener('change', (e) => update({ hidden: e.target.checked || null }));
$('#d-note').addEventListener('input', debounce((e) => update({ note: e.target.value.trim() || null }), 400));
$('#d-edit-text').addEventListener('click', () => {
  const editing = !$('#d-text-edit').hidden;
  if (editing) {
    const v = $('#d-text-edit').value.replace(/\s+$/, '');
    update({ text: v && v !== current.p.body ? v : null });
  }
  showText(!editing);
});
$('#d-reset-text').addEventListener('click', () => {
  if (!confirm('Revenir au texte original du post ?')) return;
  update({ text: null });
  showText(false);
});
$('#d-close').addEventListener('click', () => detail.close());
$('#d-print').addEventListener('click', () => printRecipes([current], current.title));
detail.addEventListener('close', () => {
  if (!$('#d-text-edit').hidden) $('#d-edit-text').click(); // garde le texte en cours d'édition
  render();
});

function fillDatalist() {
  const names = new Set(catalog.map((c) => c.name));
  recipes.forEach((r) => (r.raw.ingAdded || []).forEach((i) => names.add(i)));
  $('#all-ings').replaceChildren(...[...names].sort(collator.compare).map((n) => el('option', { value: n })));
}

/* ---------- PDF (via l'impression du navigateur) ---------- */

function sheet(r) {
  const custom = r.raw.text != null;
  const s = el('article', { class: 'recipe-sheet' },
    el('div', { class: 'rs-head' },
      el('div', {},
        el('h1', {}, r.title),
        el('p', { class: 'src' }, `@${r.raw.author} · `, el('a', { href: r.raw.url }, r.raw.url))),
      r.raw.thumb ? el('img', { src: r.raw.thumb, alt: '' }) : null));
  if (!custom && r.p.ingredientLines.length) {
    s.append(el('h2', {}, 'Ingrédients'), el('ul', {}, r.p.ingredientLines.map((l) => el('li', {}, l))));
    if (r.p.steps) s.append(el('h2', {}, 'Préparation'), el('div', { class: 'txt' }, r.p.steps));
  } else {
    s.append(el('div', { class: 'txt' }, custom ? r.raw.text : r.p.body));
  }
  if (r.raw.note) s.append(el('div', { class: 'note' }, r.raw.note));
  return s;
}

function printRecipes(list, name) {
  if (!list.length) { toast('Aucune recette à exporter'); return; }
  $('#print-area').replaceChildren(...list.map(sheet));
  const prev = document.title;
  document.title = name.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80); // nom proposé pour le PDF
  window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
  setTimeout(() => window.print(), 60);
}

$('#btn-print-list').addEventListener('click', () => {
  $('.menu').open = false;
  const q = fold(state.q);
  const words = q ? q.split(' ') : [];
  const list = sortList(baseSet().filter((r) => words.every((w) => r.hay.includes(w))));
  if (list.length > 40 && !confirm(`Exporter ${list.length} recettes dans un seul PDF ?`)) return;
  printRecipes(list, `Recettes (${list.length})`);
});

/* ---------- Import / sauvegarde ---------- */

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Fichier illisible'); }
  if (data.app !== 'recettes-insta') throw new Error('Ce fichier ne vient pas de Recettes Insta');
  const byCode = new Map(recipes.map((r) => [r.raw.code, r.raw]));
  const now = Date.now();
  const out = [];
  let added = 0;
  let updated = 0;

  if (data.kind === 'sauvegarde') {
    for (const raw of data.recipes || []) {
      if (!raw.code) continue;
      out.push(raw);
      if (byCode.has(raw.code)) updated++; else added++;
    }
  } else {
    for (const [k, p] of (data.posts || []).entries()) {
      if (!p.code) continue;
      const fresh = {
        code: p.code,
        url: p.url || `https://www.instagram.com/p/${p.code}/`,
        author: p.author || '',
        authorName: p.authorName || '',
        caption: p.caption || '',
        takenAt: p.takenAt || null,
        mediaType: p.mediaType || '',
        collection: data.collection?.name || '',
      };
      if (p.thumb) fresh.thumb = p.thumb;
      const old = byCode.get(p.code);
      if (old) { out.push({ ...old, ...fresh }); updated++; } else {
        out.push({ ...fresh, savedAt: now - (p.savedIndex ?? k) }); added++;
      }
    }
  }
  await dbPutMany(out);
  navigator.storage?.persist?.();
  await load();
  fillDatalist();
  toast(`${plural(added, 'nouvelle recette', 'nouvelles recettes')}` + (updated ? `, ${updated} mise(s) à jour` : ''));
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

$('#file-import').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  $('.menu').open = false;
  if (f) importFile(f).catch((err) => toast(err.message || "L'import a échoué"));
});

$('#btn-export').addEventListener('click', () => {
  $('.menu').open = false;
  downloadJSON({
    app: 'recettes-insta', kind: 'sauvegarde', version: 1,
    exportedAt: new Date().toISOString(), recipes: recipes.map((r) => r.raw),
  }, `recettes-insta-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Sauvegarde téléchargée');
});

$('#btn-clear').addEventListener('click', async () => {
  $('.menu').open = false;
  if (!recipes.length || !confirm(`Effacer les ${recipes.length} recettes de cet appareil ? (pense à sauvegarder avant)`)) return;
  await dbClear();
  state.selected.clear();
  await load();
  toast('Tout est effacé');
});

/* ---------- Aide ---------- */

const help = $('#help');
const openHelp = () => { $('.menu').open = false; help.showModal(); };
$('#btn-help').addEventListener('click', openHelp);
$('#btn-help-empty').addEventListener('click', openHelp);
$('#h-close').addEventListener('click', () => help.close());
// Le favori (« bookmarklet ») contient tout le script d'extraction.
async function prepareBookmarklet() {
  try {
    const code = await (await fetch('extraction.js', { cache: 'no-cache' })).text();
    $('#h-bookmarklet').href = 'javascript:' + encodeURIComponent(code + '\nvoid 0;');
  } catch {}
}
$('#h-bookmarklet').addEventListener('click', (e) => {
  e.preventDefault();
  toast('Ne clique pas ici : fais glisser le bouton dans ta barre de favoris');
});
$('#h-copy').addEventListener('click', async () => {
  try {
    const code = await (await fetch('extraction.js', { cache: 'no-cache' })).text();
    await navigator.clipboard.writeText(code);
    toast('Script copié : colle-le dans la console d\'Instagram');
  } catch {
    window.open('extraction.js', '_blank');
    toast('Copie impossible : sélectionne tout le script (Ctrl+A) et copie-le');
  }
});

/* ---------- Barre du haut ---------- */

$('#search').addEventListener('input', debounce((e) => { state.q = e.target.value; render(); }, 150));
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.view = t.dataset.view;
  state.q = '';
  $('#search').value = '';
  render();
}));
$('#btn-fav').addEventListener('click', () => { state.fav = !state.fav; render(); });
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  try { localStorage.setItem('sort', state.sort); } catch {}
  render();
});
document.addEventListener('click', (e) => {
  const menu = $('.menu');
  if (menu.open && !menu.contains(e.target)) menu.open = false;
});

async function init() {
  try { state.sort = localStorage.getItem('sort') || 'recent'; } catch {}
  $('#sort').value = state.sort;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  await load();
  fillDatalist();
  prepareBookmarklet();
}

init();
