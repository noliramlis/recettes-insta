// Recettes Insta — extraction d'une collection d'enregistrements Instagram.
//
// À coller dans la console du navigateur (F12 → Console) sur www.instagram.com,
// connecté à ton compte, de préférence depuis la page de ta collection
// (Profil → Enregistrements → ta collection). Le script lit, au rythme d'un
// humain pressé, les posts de la collection (lien, auteur, texte, miniature)
// et télécharge un fichier JSON à importer dans l'appli Recettes Insta.
// Il ne modifie rien sur ton compte et n'envoie rien ailleurs qu'à ton navigateur.
(async () => {
  'use strict';
  const APP_ID = '936619743392459'; // identifiant public du site web Instagram
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = (a, b) => sleep(a + Math.random() * (b - a));
  const cookie = (n) => decodeURIComponent((document.cookie.match('(?:^|; )' + n + '=([^;]*)') || [])[1] || '');

  if (!/(^|\.)instagram\.com$/.test(location.hostname)) {
    alert('Ouvre d\'abord www.instagram.com (connecté), puis recolle le script.');
    return;
  }

  /* ---------- Petit panneau de progression ---------- */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#1c1b19;color:#fff;' +
    'font:14px/1.4 system-ui,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
    'width:300px;';
  const msg = document.createElement('div');
  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Arrêter et télécharger';
  stopBtn.style.cssText = 'margin-top:10px;padding:6px 10px;border:0;border-radius:8px;cursor:pointer;';
  let stop = false;
  stopBtn.onclick = () => { stop = true; stopBtn.disabled = true; };
  box.append(msg, stopBtn);
  document.body.append(box);
  const say = (t) => { msg.textContent = t; console.log('[Recettes Insta] ' + t); };

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
        say(`Instagram demande de ralentir… pause de ${s} s (essai ${attempt}/4)`);
        await sleep(s * 1000);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error('Non connecté : connecte-toi à Instagram puis recommence.');
      if (!res.ok) throw new Error(`Réponse inattendue d'Instagram (HTTP ${res.status}).`);
      return res.json();
    }
    throw new Error('Instagram limite les requêtes : réessaie dans une heure (ce qui a été lu est conservé).');
  }

  /* ---------- Quelle collection ? ---------- */
  async function chooseCollection() {
    const m = location.pathname.match(/\/saved\/([^/]+)\/(\d+)/);
    if (m) return { id: m[2], name: decodeURIComponent(m[1]).replace(/-/g, ' ') };
    say('Recherche de tes collections…');
    const data = await api('collections/list/?collection_types=' +
      encodeURIComponent('["ALL_MEDIA_AUTO_COLLECTION","MEDIA"]'));
    const cols = (data.items || []).map((c) => ({
      id: String(c.collection_id), name: c.collection_name || 'Sans nom', n: c.collection_media_count,
    }));
    if (!cols.length) throw new Error('Aucune collection trouvée.');
    const answer = prompt('Quelle collection extraire ? Tape son numéro :\n\n' +
      cols.map((c, i) => `${i + 1}. ${c.name}${c.n != null ? ` (${c.n})` : ''}`).join('\n'), '1');
    const c = cols[Number(answer) - 1];
    if (!c) throw new Error('Extraction annulée.');
    return c;
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

  // Miniature réduite (≈ 10 Ko) en data: URL, pour l'afficher sans dépendre d'Instagram.
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

  function download(result) {
    const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `recettes-insta-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
  }

  const posts = [];
  let collection = null;
  try {
    collection = await chooseCollection();
    const base = /^\d+$/.test(collection.id) ? `feed/collection/${collection.id}/posts/` : 'feed/saved/posts/';
    let maxId = '';
    let page = 0;
    const seen = new Set();
    do {
      const data = await api(base + (maxId ? '?max_id=' + encodeURIComponent(maxId) : ''));
      for (const it of data.items || []) {
        const m = it.media || it;
        if (m && m.code && !seen.has(m.code)) { seen.add(m.code); posts.push(pick(m, posts.length)); }
      }
      page++;
      say(`« ${collection.name} » : ${posts.length} posts lus (page ${page})…`);
      maxId = data.more_available ? data.next_max_id : '';
      if (maxId) await wait(2000, 4500);
    } while (maxId && !stop);

    say(`Miniatures : 0 / ${posts.length}`);
    let done = 0;
    let fails = 0;
    const queue = posts.slice();
    await Promise.all([1, 2, 3, 4].map(async () => {
      while (queue.length && !stop) {
        const p = queue.shift();
        p.thumb = await thumb(p.thumbSrc);
        if (!p.thumb) fails++;
        done++;
        if (done % 10 === 0 || done === posts.length) say(`Miniatures : ${done} / ${posts.length}`);
        if (done >= 8 && fails === done) { queue.length = 0; } // le navigateur les bloque : on s'en passe
      }
    }));
    posts.forEach((p) => { delete p.thumbSrc; if (!p.thumb) delete p.thumb; });
  } catch (err) {
    say('⚠️ ' + err.message);
    console.error(err);
    if (!posts.length) { stopBtn.remove(); return; }
  }

  const result = {
    app: 'recettes-insta',
    kind: 'extraction',
    version: 1,
    extractedAt: new Date().toISOString(),
    collection,
    posts,
  };
  window.__recettesInsta = { result, download: () => download(result) };
  download(result);
  stopBtn.remove();
  say(`✅ ${posts.length} posts enregistrés dans le fichier téléchargé. ` +
    'Importe-le dans Recettes Insta (menu ⋮ → Importer l\'extraction). ' +
    'Pas de fichier ? Tape __recettesInsta.download() dans la console.');
  const close = document.createElement('button');
  close.textContent = 'Fermer';
  close.style.cssText = stopBtn.style.cssText;
  close.onclick = () => box.remove();
  box.append(close);
})();
