// Analyse du texte d'un post : titre, lignes d'ingrédients, préparation,
// et liste des ingrédients reconnus (noms canoniques du dictionnaire).
(function (root) {
  'use strict';

  // Dans le navigateur, ingredients.js est chargé avant (constantes globales).
  const D = typeof INGREDIENT_DATA !== 'undefined'
    ? { data: INGREDIENT_DATA, ignored: INGREDIENT_IGNORED }
    : (({ INGREDIENT_DATA: data, INGREDIENT_IGNORED: ignored }) => ({ data, ignored }))(require('./ingredients.js'));

  const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;

  // Texte → forme comparable : minuscules, sans accents ni ponctuation.
  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/maïs/g, ' corn ') // « mais » sans tréma est la conjonction
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function tokens(s) {
    return fold(s).split(' ').filter(Boolean).map((t) => {
      if (t === 'pates') return 'pasta'; // « pâtes » ≠ « pâte » (à tarte…)
      return t.length > 3 && /[sx]$/.test(t) ? t.slice(0, -1) : t;
    });
  }

  /* ---------- Dictionnaire ---------- */

  const aliasMap = new Map(); // « tok tok » → canonique (ou null si ignoré)
  const catalog = []; // { name, category }
  let maxLen = 1;

  function addAlias(alias, canon) {
    const key = tokens(alias).join(' ');
    if (!key || aliasMap.has(key)) return;
    aliasMap.set(key, canon);
    maxLen = Math.max(maxLen, key.split(' ').length);
  }

  for (const [category, block] of Object.entries(D.data)) {
    for (const line of block.split('\n')) {
      if (!line.trim()) continue;
      const [canon, rest = ''] = line.split(/:(.*)/s).map((x) => (x || '').trim());
      catalog.push({ name: canon, category });
      addAlias(canon, canon);
      rest.split(',').map((a) => a.trim()).filter(Boolean).forEach((a) => addAlias(a, canon));
    }
  }
  D.ignored.forEach((a) => addAlias(a, null));
  const categoryOf = new Map(catalog.map((c) => [c.name, c.category]));

  // Ingrédients reconnus dans un texte (correspondance la plus longue d'abord).
  function matchIngredients(text) {
    const found = new Set();
    const toks = tokens(text);
    for (let i = 0; i < toks.length;) {
      let hit = 0;
      for (let len = Math.min(maxLen, toks.length - i); len > 0; len--) {
        const key = toks.slice(i, i + len).join(' ');
        if (aliasMap.has(key)) {
          const canon = aliasMap.get(key);
          if (canon) found.add(canon);
          hit = len;
          break;
        }
      }
      i += hit || 1;
    }
    return [...found];
  }

  /* ---------- Découpage du texte ---------- */

  const EMOJI_ONE = new RegExp(EMOJI_RE.source, 'u');
  const stripEmoji =(s) => s.replace(EMOJI_RE, ' ');
  const isTagLine = (l) => /^([#@][^\s#@]+[\s.,]*)+$/u.test(l.trim());
  const isFiller = (l) => /^[\s.·•_\-–—|*~]*$/u.test(stripEmoji(l));
  const clean = (l) => stripEmoji(l).replace(/\s+/g, ' ').trim();
  const bare = (l) => clean(l).replace(/^[\s\-–—•*·▪◦✓→>+|:]+/u, '').replace(/[\s:.\-–—]+$/u, '').trim();

  const INGR_HEAD = /^(les |mes |liste des )?ingredients?\b|^il (vous|te) faut\b|^what you (ll )?need\b|^you ll need\b/;
  const STEP_HEAD = /^(la |les )?(preparation|realisation|etape|etapes|instructions?|methode|deroule|progression|recette|directions|method|steps|how to make|how to)\b/;
  const QTY_START = /^(\d|½|¼|¾|⅓|un |une |des |quelques |1\/2|une? (pincee|poignee|cuillere|c a|filet|botte|boite|sachet|tranche|gousse))/;
  const STEP_NUM = /^(\d{1,2}|etape \d+|step \d+)\s*[.)\/:\-–]\s*\S/;
  const TITLE_SKIP = /^((nouvelle|new|ma|la) )?(recette|recipe)s?( (du jour|facile|rapide|express|healthy|gourmande|de saison))?$|^(pub|ad|sponsorise|sponsored|partenariat|collab|annonce|concours|giveaway)\b/;

  function isBulleted(raw) {
    const t = raw.trim();
    return /^[\-–—•*·▪◦✓✔→>+]/u.test(t) || /^\p{Extended_Pictographic}/u.test(t);
  }

  function makeTitle(lines, author) {
    for (let raw of lines.slice(0, 4)) {
      // « Bowl de poulet 🍗 Tu as déjà testé ? » : un emoji sépare souvent titre et texte.
      const k = raw.search(EMOJI_ONE);
      if (k > 0 && raw.slice(0, k).replace(/[^\p{L}]/gu, '').length >= 8 &&
          clean(raw.slice(k)).replace(/[^\p{L}]/gu, '').length > 0) {
        raw = raw.slice(0, k);
      }
      let t = clean(raw).replace(/[#@][^\s#@]+/g, ' ').replace(/\s+/g, ' ')
        .replace(/^[\s\-–—•*·|:,.!]+|[\s\-–—•*·|:,]+$/gu, '').trim();
      t = t.replace(/^(recette|recipe)\s*[:\-–—]\s*/i, '');
      const f = fold(t);
      if (!f || f.length < 3 || TITLE_SKIP.test(f) || INGR_HEAD.test(f)) continue;
      if (t.length > 70) {
        const m = t.slice(10, 72).search(/[.!?](\s|$)|\s[\-–—|]\s/);
        t = m >= 0 ? t.slice(0, m + 10 + 1).replace(/[\s\-–—|]+$/, '') : t.slice(0, 60).replace(/\s+\S*$/, '') + '…';
      }
      const letters = t.replace(/[^\p{L}]/gu, '');
      if (letters.length > 3 && letters === letters.toUpperCase()) {
        t = t.charAt(0) + t.slice(1).toLowerCase();
      }
      return t.replace(/[.!?]+$/, '');
    }
    return author ? `Post de @${author}` : 'Sans titre';
  }

  function parse(caption, author = '') {
    const text = String(caption || '').replace(/\r/g, '');
    let lines = text.split('\n');
    // Retire les lignes de hashtags et les lignes « . » de fin.
    while (lines.length && (isTagLine(lines[lines.length - 1]) || isFiller(lines[lines.length - 1]))) lines.pop();
    const body = lines.filter((l, i, a) => !(isFiller(l) && l.trim() && isFiller(a[i - 1] || ''))).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim();
    lines = body.split('\n');

    const title = makeTitle(lines.filter((l) => l.trim()), author);

    // 1) Section « Ingrédients » explicite.
    let ingredientLines = [];
    let stepsFrom = -1;
    let source = 'aucune';
    const head = lines.findIndex((l) => {
      const f = fold(bare(l));
      return INGR_HEAD.test(f) && (f.length < 60 || /^\W*ingr[ée]dients?\s*(\([^)]*\))?\s*:/i.test(bare(l)));
    });
    if (head >= 0) {
      source = 'section';
      // Ce qui suit « Ingrédients : » sur la même ligne compte aussi.
      const after = bare(lines[head]).replace(/^.*?ingr[ée]dients?\s*(\([^)]*\))?\s*:?\s*/i, '');
      if (after && after.length > 2 && !/^pour \d/i.test(after)) ingredientLines.push(...after.split(/\s*[,;]\s*/));
      let i = head + 1;
      let blank = 0;
      for (; i < lines.length && ingredientLines.length < 45; i++) {
        const raw = lines[i];
        const b = bare(raw);
        const f = fold(b);
        if (!f) { if (ingredientLines.length && ++blank >= 2) break; continue; }
        if (isTagLine(raw)) break;
        if (f.length < 40 && STEP_HEAD.test(f)) break;
        if (STEP_NUM.test(f) && f.length > 45) break;
        if (b.length > 110) break;
        if (blank && ingredientLines.length && b.length > 70 && !matchIngredients(b).length) break;
        blank = 0;
        ingredientLines.push(b);
      }
      stepsFrom = i;
    } else {
      // 2) Sinon : lignes à puces ou commençant par une quantité, contenant un ingrédient.
      const cand = [];
      lines.forEach((raw, idx) => {
        const b = bare(raw);
        if (!b || b.length > 75) return;
        if ((isBulleted(raw) || QTY_START.test(fold(b))) && !STEP_NUM.test(fold(b)) && matchIngredients(b).length) {
          cand.push({ b, idx });
        }
      });
      if (cand.length >= 3) {
        source = 'lignes';
        ingredientLines = cand.map((c) => c.b);
        stepsFrom = cand[cand.length - 1].idx + 1;
      }
    }
    ingredientLines = ingredientLines.map((l) => l.trim()).filter(Boolean);

    let steps = '';
    if (stepsFrom >= 0) {
      const rest = lines.slice(stepsFrom);
      const first = rest.findIndex((l) => fold(l));
      if (first >= 0 && STEP_HEAD.test(fold(bare(rest[first]))) && fold(bare(rest[first])).length < 40) rest.splice(first, 1);
      steps = rest.join('\n').replace(/^\s+|\s+$/g, '');
    }

    let ingredients = matchIngredients(ingredientLines.join('\n'));
    if (!ingredients.length) {
      ingredients = matchIngredients(body);
      if (ingredients.length) source = source === 'aucune' ? 'texte' : source;
    }

    return {
      title,
      body,
      ingredientLines,
      steps,
      ingredients,
      source, // section | lignes | texte | aucune
      hasRecipe: ingredientLines.length >= 2 || body.length > 280,
    };
  }

  const api = { parse, fold, matchIngredients, catalog, categoryOf, categories: Object.keys(D.data) };
  if (typeof module !== 'undefined') module.exports = api;
  else root.RecipeParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
