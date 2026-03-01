// background.js - Service Worker

const GENIUS_TOKEN_KEY = 'genius_token';
const CURRENT_SONG_KEY = 'current_song';

// ─── Rota de mensagem ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SONG_DETECTED') {
    handleSongDetected(message.data, sendResponse);
    return true;
  }
  if (message.type === 'SEARCH_LYRICS') {
    searchLyrics(message.artist, message.title, sendResponse);
    return true;
  }
  if (message.type === 'GET_TOKEN') {
    chrome.storage.local.get([GENIUS_TOKEN_KEY], (r) => {
      sendResponse({ token: r[GENIUS_TOKEN_KEY] || '' });
    });
    return true;
  }
  if (message.type === 'SAVE_TOKEN') {
    chrome.storage.local.set({ [GENIUS_TOKEN_KEY]: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'GET_CURRENT_SONG') {
    chrome.storage.local.get([CURRENT_SONG_KEY], (r) => {
      sendResponse({ song: r[CURRENT_SONG_KEY] || null });
    });
    return true;
  }
});

// ─── Detectação de mudança de Música ────────────────────────────────────────────────────
async function handleSongDetected(songData, sendResponse) {
  const stored = await storageGet(CURRENT_SONG_KEY);
  const songKey = `${songData.artist}||${songData.title}`;

  if (stored && stored.key === songKey) {
    sendResponse({ changed: false });
    return;
  }

  await storageSet(CURRENT_SONG_KEY, { ...songData, key: songKey });
  chrome.runtime.sendMessage({ type: 'SONG_CHANGED', data: songData }).catch(() => {});
  sendResponse({ changed: true });
}

// ─── Busca principal da Música ───────────────────────────────────────────────────────
async function searchLyrics(artist, title, sendResponse) {
  try {
    const token = await storageGet(GENIUS_TOKEN_KEY);
    if (!token) {
      sendResponse({ error: 'NO_TOKEN' });
      return;
    }

    // Passo 1: Busca no Genius API
    const query = optimizeQuery(artist, title);
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;

    const searchResp = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchResp.ok) {
      sendResponse({ error: `Genius API retornou ${searchResp.status}. Verifique seu token.` });
      return;
    }

    const searchData = await searchResp.json();
    const hits = searchData.response?.hits || [];

    if (hits.length === 0) {
      sendResponse({ error: 'NOT_FOUND' });
      return;
    }

    // Passo 2: Escolhe melhor busca
    const match = findBestMatch(hits, artist, title) || hits[0].result;
    const lyricsPageUrl = match.url;

    //Passo 3: Verifica se a URL é válida antes de tentar scrape
    if (!isLyricsUrl(lyricsPageUrl)) {
      sendResponse({ error: 'NOT_FOUND' });
      return;
    }

    // Passo 3: Scrape da página de letra (pois a API do Genius não retorna a letra completa)
    const lyrics = await scrapeWithTab(lyricsPageUrl);

    sendResponse({
      success: true,
      song: {
        title: match.title,
        artist: match.primary_artist.name,
        thumbnail: match.song_art_image_thumbnail_url,
        url: lyricsPageUrl,
        lyrics: lyrics
      }
    });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// ─── Query Optimizer ───────
function optimizeQuery(artist, title) {
  let q = `${artist} ${title}`;
  q = q.replace(/\(feat\..*?\)/gi, '');
  q = q.replace(/\(ft\..*?\)/gi, '');
  q = q.replace(/\(with .*?\)/gi, '');
  q = q.replace(/\(.*?(remaster|remix|live|version|edition).*?\)/gi, '');
  q = q.replace(/\s{2,}/g, ' ').trim();
  return q;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function isLyricsUrl(url) {
  return url && /genius\.com\/.+-lyrics$/i.test(url);
}


// ─── Busca melhor match ─────────────────
function findBestMatch(hits, artist, title) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nArtist = norm(artist);
  const nTitle  = norm(title);

  for (const hit of hits) {
    const r = hit.result;
    const rA = norm(r.primary_artist.name);
    const rT = norm(r.title);
    if ((rA.includes(nArtist) || nArtist.includes(rA)) &&
        (rT.includes(nTitle)  || nTitle.includes(rT))) {
      return r;
    }
  }
  for (const hit of hits) {
    const r = hit.result;
    const rA = norm(r.primary_artist.name);
    if (rA.includes(nArtist) || nArtist.includes(rA)) return r;
  }
  return null;
}

// ─── Scrape da página de letra usando uma aba oculta ───────────────────────────────
async function scrapeWithTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tabId).catch(() => {});
        resolve(result);
      }

      async function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: domScrapeLyrics   // função definida mais abaixo, que roda dentro da aba do Genius para extrair a letra do DOM
          });
          finish(results?.[0]?.result ?? null);
        } catch (e) {
          finish(null);
        }
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
      setTimeout(() => finish(null), 15000); // safety timeout
    });
  });
}

// ─── Função que roda dentro da aba do Genius para extrair a letra do DOM ───────────────────────────────
function domScrapeLyrics() {
  try {
    // Genius tem vários formatos de página, mas a letra geralmente está dentro de um container com data-lyrics-container="true"
    const containers = document.querySelectorAll('[data-lyrics-container="true"]');

    if (containers.length > 0) {
      const parts = [];

      containers.forEach((container) => {
        const clone = container.cloneNode(true);

        // Remove os data headers do elemento de letra, que não fazem parte da letra em si
        clone.querySelectorAll('[data-exclude-from-selection="true"]').forEach(el => el.remove());
        clone.querySelectorAll('[class*="LyricsHeader"]').forEach(el => el.remove());

        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

        clone.querySelectorAll('a').forEach((a) => a.replaceWith(a.textContent));

        clone.querySelectorAll('span, i, b, em, strong').forEach((el) => {
          el.replaceWith(el.textContent);
        });

        const text = (clone.innerText || clone.textContent || '').trim();
        if (text.length > 0) parts.push(text);
      });

      if (parts.length > 0) {
        return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      }
    }

    const legacy = document.querySelector('.lyrics');
    if (legacy) return legacy.innerText.trim();

    return null;
  } catch (e) {
    return null;
  }
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (r) => resolve(r[key] ?? null));
  });
}
function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}
