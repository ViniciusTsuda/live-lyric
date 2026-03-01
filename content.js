// content.js - detecta a música atual tocando na aba e envia para o background

let lastSong = null;
let detectionInterval = null;

function getSongFromMediaSession() {
  if (!navigator.mediaSession || !navigator.mediaSession.metadata) return null;

  const meta = navigator.mediaSession.metadata;
  if (!meta.title) return null;

  return {
    title: meta.title || '',
    artist: meta.artist || '',
    album: meta.album || '',
    artwork: meta.artwork?.[0]?.src || ''
  };
}

function getSongFromAudioElements() {
  // Tenta detectar música a partir de elementos <audio> ou <video> tocando na página, e extrair título/artista de elementos próximos no DOM
  const mediaElements = document.querySelectorAll('audio, video');
  for (const el of mediaElements) {
    if (!el.paused && !el.ended && el.duration > 0) {
      // Tenta encontrar título/artista em elementos próximos no DOM (heurística simples)
      const titleEl = document.querySelector(
        '[class*="title"]:not([class*="nav"]):not([class*="header"]), ' +
        '[class*="song-name"], [class*="track-name"], ' +
        '[data-testid*="title"], [aria-label*="title"]'
      );
      const artistEl = document.querySelector(
        '[class*="artist"]:not([class*="nav"]), ' +
        '[class*="author"], [data-testid*="artist"]'
      );

      if (titleEl) {
        return {
          title: titleEl.textContent.trim(),
          artist: artistEl ? artistEl.textContent.trim() : '',
          album: '',
          artwork: ''
        };
      }
    }
  }
  return null;
}

function detectCurrentSong() {
  let song = getSongFromMediaSession();

  if (!song) {
    song = getSongFromAudioElements();
  }

  if (!song) return;

  const songKey = `${song.artist}||${song.title}`;
  if (lastSong === songKey) return;

  lastSong = songKey;

  chrome.runtime.sendMessage({
    type: 'SONG_DETECTED',
    data: song
  }, (response) => {
    // Ignora a resposta do background 
  });
}

// Começar a detectação
function startDetection() {
  detectCurrentSong();
  detectionInterval = setInterval(detectCurrentSong, 2000);
}

// Também escuta mudanças na Media Session para detecção mais imediata
if ('mediaSession' in navigator) {
  // Observe metadata changes
  const origDescriptor = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
  if (origDescriptor && origDescriptor.set) {
    const origSet = origDescriptor.set;
    Object.defineProperty(navigator.mediaSession, 'metadata', {
      set(val) {
        origSet.call(this, val);
        setTimeout(detectCurrentSong, 100);
      },
      get: origDescriptor.get,
      configurable: true
    });
  }
}

// Limpar intervalo quando a aba for fechada ou recarregada
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_SONG_DETECT') {
    const song = getSongFromMediaSession() || getSongFromAudioElements();
    sendResponse({ song });
    return true;
  }
});

startDetection();
