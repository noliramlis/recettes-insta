// Recettes Insta (Android) — lecture d'Instagram dans une WebView cachée.
//
// Ce script est exécuté sur https://www.instagram.com/robots.txt : même origine que l'API web
// d'Instagram (les cookies de connexion de l'appli sont envoyés), sans aucun script d'Instagram.
// Il ne fait que lire (collections, posts) et renvoie le résultat à l'appli via IgBridge.
window.__RI = (() => {
  'use strict';
  const B = window.IgBridge;
  const APP_ID = '936619743392459'; // identifiant public du site web Instagram
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = (a, b) => sleep(a + Math.random() * (b - a));
  const cookie = (n) => decodeURIComponent((document.cookie.match('(?:^|; )' + n + '=([^;]*)') || [])[1] || '');

  class LoginError extends Error {}

  // Aucun nouvel essai automatique quand Instagram demande de ralentir : on s'arrête tout de suite.
  async function api(path) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch('/api/v1/' + path, {
        credentials: 'include',
        headers: {
          'X-IG-App-ID': APP_ID,
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': cookie('csrftoken'),
        },
      });
      if (res.status === 429) {
        throw new Error("Instagram demande de ralentir : synchro arrêtée. Ce qui a été lu est gardé ; " +
          'relance dans quelques heures, elle reprendra où elle en était.');
      }
      if (res.status >= 500 && attempt === 1) { await sleep(15000); continue; }
      if (res.status === 401 || res.status === 403 || /\/accounts\/login/.test(res.url)) throw new LoginError('login');
      if (!res.ok) throw new Error(`Réponse inattendue d'Instagram (HTTP ${res.status}).`);
      let data;
      try { data = await res.json(); } catch { throw new LoginError('login'); }
      if (data.message === 'login_required' || data.require_login) throw new LoginError('login');
      return data;
    }
    throw new Error('Instagram ne répond pas correctement : réessaie plus tard.');
  }

  function pick(m, i) {
    const reel = m.product_type === 'clips';
    const cands = (m.image_versions2 || (m.carousel_media && m.carousel_media[0] && m.carousel_media[0].image_versions2) || {}).candidates || [];
    const small = cands.slice().sort((a, b) => a.width - b.width);
    const thumbSrc = (small.find((c) => c.width >= 240) || small[small.length - 1] || {}).url || '';
    return {
      code: m.code,
      url: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${m.code}/`,
      author: (m.user && m.user.username) || '',
      authorName: (m.user && m.user.full_name) || '',
      caption: (m.caption && m.caption.text) || '',
      takenAt: m.taken_at ? m.taken_at * 1000 : null,
      mediaType: reel ? 'reel' : m.carousel_media ? 'carrousel' : m.media_type === 2 ? 'vidéo' : 'photo',
      savedIndex: i,
      thumbSrc,
    };
  }

  // Miniature réduite (≈ 10 Ko) en data: URL.
  function thumb(src) {
    return new Promise((resolve) => {
      if (!src) return resolve('');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(''), 15000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const size = 200;
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const s = Math.min(img.naturalWidth, img.naturalHeight);
          c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
          resolve(c.toDataURL('image/jpeg', 0.72));
        } catch (e) { resolve(''); }
      };
      img.onerror = () => { clearTimeout(t); resolve(''); };
      img.src = src;
    });
  }

  async function withThumbs(posts) {
    const queue = posts.slice();
    await Promise.all([1, 2, 3, 4].map(async () => {
      while (queue.length) {
        const p = queue.shift();
        p.thumb = await thumb(p.thumbSrc);
      }
    }));
    posts.forEach((p) => { delete p.thumbSrc; if (!p.thumb) delete p.thumb; });
    return posts;
  }

  // Code court d'un post (ex. « DfAfqWENNor ») → identifiant numérique du média.
  function mediaId(code) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = 0n;
    for (const c of code.slice(0, 11)) id = id * 64n + BigInt(A.indexOf(c));
    return id.toString();
  }

  async function guard(fn) {
    try { await fn(); } catch (e) {
      B.error(e instanceof LoginError ? 'login' : String((e && e.message) || e));
    }
  }

  return {
    // Un seul post (partagé depuis Instagram).
    post: (code) => guard(async () => {
      const data = await api(`media/${mediaId(code)}/info/`);
      const m = data.items && data.items[0];
      if (!m) throw new Error('Post introuvable (supprimé ou privé ?).');
      const [p] = await withThumbs([pick(m, 0)]);
      B.post(JSON.stringify(p));
    }),

    // Les posts d'une collection absents de l'appli (known = codes déjà importés).
    // Chaque page lue est importée aussitôt. Après chaque page, B.cursor() donne de quoi
    // reprendre si la lecture est interrompue ('' = rien à reprendre) ; l'appli le repasse
    // dans resume à la synchro suivante.
    collection: (id, name, known, resume) => guard(async () => {
      const knownSet = new Set(known || []);
      const full = !knownSet.size; // première synchro : lecture complète
      const base = /^\d+$/.test(id) ? `feed/collection/${id}/posts/` : 'feed/saved/posts/'; // 'ALL' : tous les enregistrements
      let read = 0;
      let total = 0;
      let added = 0;

      async function page(maxId, now) {
        const data = await api(base + (maxId ? '?max_id=' + encodeURIComponent(maxId) : ''));
        const fresh = [];
        for (const it of data.items || []) {
          const m = it.media || it;
          if (!m || !m.code) continue;
          read++;
          total++;
          if (!knownSet.has(m.code)) { knownSet.add(m.code); fresh.push(pick(m, read - 1)); }
        }
        if (fresh.length) {
          await withThumbs(fresh);
          B.batch(JSON.stringify({ posts: fresh, collection: { id, name }, now }));
          added += fresh.length;
        }
        B.progress(`« ${name} » : ${total} posts lus, ${added} ajoutés…`);
        return { next: data.more_available ? data.next_max_id : '', fresh: fresh.length };
      }

      // 1) Reprise d'une lecture interrompue.
      if (resume) {
        let st = resume;
        read = st.index;
        let cur = st.cur;
        while (cur) {
          await wait(3000, 6000);
          const r = await page(cur, st.now);
          cur = r.next && (st.full || r.fresh) ? r.next : '';
          st = { ...st, cur, index: read };
          B.cursor(cur ? JSON.stringify(st) : '');
        }
      }

      // 2) Nouveautés, en partant des plus récents : on s'arrête à la première page
      //    sans rien de nouveau (sauf première synchro, lue en entier).
      const now = Date.now();
      read = 0;
      let cur = '';
      do {
        if (cur) await wait(3000, 6000);
        const r = await page(cur, now);
        cur = r.next && (full || r.fresh) ? r.next : '';
        B.cursor(cur ? JSON.stringify({ cur, index: read, now, full }) : '');
      } while (cur);
      B.done(added);
    }),
  };
})();
