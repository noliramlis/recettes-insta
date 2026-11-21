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

  async function api(path) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch('/api/v1/' + path, {
        credentials: 'include',
        headers: {
          'X-IG-App-ID': APP_ID,
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': cookie('csrftoken'),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        const s = 30 * attempt;
        B.progress(`Instagram demande de ralentir… pause de ${s} s`);
        await sleep(s * 1000);
        continue;
      }
      if (res.status === 401 || res.status === 403 || /\/accounts\/login/.test(res.url)) throw new LoginError('login');
      if (!res.ok) throw new Error(`Réponse inattendue d'Instagram (HTTP ${res.status}).`);
      let data;
      try { data = await res.json(); } catch { throw new LoginError('login'); }
      if (data.message === 'login_required' || data.require_login) throw new LoginError('login');
      return data;
    }
    throw new Error('Instagram limite les requêtes : réessaie dans une heure.');
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
    // Liste des collections d'enregistrements.
    // Plusieurs formes de l'appel sont essayées ; si aucune ne marche, l'appli renvoie « null »
    // et fait choisir la collection dans Instagram même.
    collections: () => guard(async () => {
      const types = encodeURIComponent('["ALL_MEDIA_AUTO_COLLECTION","MEDIA","AUDIO_AUTO_COLLECTION"]');
      const tries = [
        `collections/list/?collection_types=${types}&include_public_only=0&get_cover_media_lists=true&max_id=`,
        'collections/list/',
        `collections/list/?collection_types=${encodeURIComponent('["MEDIA"]')}`,
      ];
      for (const path of tries) {
        try {
          const data = await api(path);
          const cols = (data.items || [])
            .filter((c) => c.collection_type !== 'ALL_MEDIA_AUTO_COLLECTION' && c.collection_type !== 'AUDIO_AUTO_COLLECTION')
            .map((c) => ({
              id: String(c.collection_id), name: c.collection_name || 'Sans nom', n: c.collection_media_count ?? null,
            }));
          B.collections(JSON.stringify(cols));
          return;
        } catch (e) {
          if (e instanceof LoginError) throw e;
        }
      }
      B.collections('null');
    }),

    // Nom du compte connecté (pour ouvrir directement …/nom/saved/) ; '' si introuvable.
    me: () => guard(async () => {
      let user = '';
      for (const path of ['accounts/current_user/?edit=true', `users/${cookie('ds_user_id')}/info/`]) {
        try {
          const d = await api(path);
          user = (d.user && d.user.username) || '';
          if (user) break;
        } catch (e) {
          if (e instanceof LoginError) throw e;
        }
      }
      B.me(user);
    }),

    // Un seul post (partagé depuis Instagram).
    post: (code) => guard(async () => {
      const data = await api(`media/${mediaId(code)}/info/`);
      const m = data.items && data.items[0];
      if (!m) throw new Error('Post introuvable (supprimé ou privé ?).');
      const [p] = await withThumbs([pick(m, 0)]);
      B.post(JSON.stringify(p));
    }),

    // Les posts d'une collection absents de l'appli (known = codes déjà importés).
    // La collection est lue des plus récents aux plus anciens : dès qu'une page ne contient
    // plus rien de nouveau, le reste est déjà connu.
    collection: (id, name, known) => guard(async () => {
      const knownSet = new Set(known || []);
      const base = /^\d+$/.test(id) ? `feed/collection/${id}/posts/` : 'feed/saved/posts/'; // 'ALL' : tous les enregistrements
      const now = Date.now();
      const fresh = [];
      const seen = new Set();
      let maxId = '';
      let read = 0;
      do {
        const data = await api(base + (maxId ? '?max_id=' + encodeURIComponent(maxId) : ''));
        let newOnPage = 0;
        for (const it of data.items || []) {
          const m = it.media || it;
          if (!m || !m.code || seen.has(m.code)) continue;
          seen.add(m.code);
          read++;
          if (!knownSet.has(m.code)) { fresh.push(pick(m, read - 1)); newOnPage++; }
        }
        B.progress(`« ${name} » : ${read} posts lus, ${fresh.length} nouveaux…`);
        maxId = data.more_available ? data.next_max_id : '';
        if (knownSet.size && !newOnPage) break;
        if (maxId) await wait(2000, 4500);
      } while (maxId);

      // Miniatures puis import, par lots de 25 (l'appli enregistre au fur et à mesure).
      for (let i = 0; i < fresh.length; i += 25) {
        B.progress(`Import : ${i} / ${fresh.length}…`);
        const batch = await withThumbs(fresh.slice(i, i + 25));
        B.batch(JSON.stringify({ posts: batch, collection: { id, name }, now }));
      }
      B.done(fresh.length);
    }),
  };
})();
