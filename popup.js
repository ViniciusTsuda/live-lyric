// popup.js

// DOM refs
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnReload = document.getElementById('btn-reload');
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('save-token-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const toast = document.getElementById('toast');

// States
const stateNoToken = document.getElementById('state-no-token');
const stateNoMusic = document.getElementById('state-no-music');
const stateLoading = document.getElementById('state-loading');
const stateError = document.getElementById('state-error');
const stateLyrics = document.getElementById('state-lyrics');

// Song info
const songArt = document.getElementById('song-art');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const lyricsText = document.getElementById('lyrics-text');
const geniusLink = document.getElementById('genius-link');
const loadingDesc = document.getElementById('loading-desc');
const errorTitle = document.getElementById('error-title');
const errorDesc = document.getElementById('error-desc');

let currentSong = null;
let hasToken = false;
let isLoading = false;

function showState(name) {
  stateNoToken.style.display = 'none';
  stateNoMusic.style.display = 'none';
  stateLoading.style.display = 'none';
  stateError.style.display = 'none';
  stateLyrics.style.display = 'none';

  if (name === 'no-token') {
    stateNoToken.style.display = 'flex';
    setStatus('idle', 'Token não configurado');
  } else if (name === 'no-music') {
    stateNoMusic.style.display = 'flex';
    setStatus('idle', 'Aguardando música...');
  } else if (name === 'loading') {
    stateLoading.style.display = 'flex';
    setStatus('loading', 'Buscando letra...');
  } else if (name === 'error') {
    stateError.style.display = 'flex';
    setStatus('error', 'Letra não encontrada');
  } else if (name === 'lyrics') {
    stateLyrics.style.display = 'flex';
    setStatus('active', 'Letra encontrada');
  }
}

function setStatus(type, text) {
  statusDot.className = 'status-dot';
  if (type === 'active') statusDot.classList.add('active');
  else if (type === 'loading') statusDot.classList.add('loading');
  else if (type === 'error') statusDot.classList.add('error');
  statusText.textContent = text;
}

function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

function formatLyrics(raw) {
  if (!raw) return 'Letra não disponível.';
  // Destaca os headers de seção (ex: [Chorus], [Verse 1], etc) com uma classe específica para estilização
  return raw.replace(/\[([^\]]+)\]/g, '<span class="section-tag">[$1]</span>');
}

async function fetchAndDisplayLyrics(artist, title) {
  if (isLoading) return;
  isLoading = true;

  loadingDesc.textContent = `${artist} — ${title}`;
  showState('loading');
  btnReload.querySelector('svg').parentElement.classList.add('spin');

  chrome.runtime.sendMessage(
    { type: 'SEARCH_LYRICS', artist, title },
    (response) => {
      isLoading = false;
      btnReload.querySelector('svg').parentElement.classList.remove('spin');

      if (!response) {
        showState('error');
        errorTitle.textContent = 'Erro de comunicação';
        errorDesc.textContent = 'Não foi possível conectar ao serviço. Tente recarregar a extensão.';
        return;
      }

      if (response.error === 'NO_TOKEN') {
        hasToken = false;
        showState('no-token');
        return;
      }

      if (response.error === 'NOT_FOUND') {
        showState('error');
        errorTitle.textContent = 'Letra não encontrada';
        errorDesc.textContent = `Não encontramos a letra de "${title}" por ${artist} no Genius. Tente recarregar ou verifique o nome da música.`;
        return;
      }

      if (response.error) {
        showState('error');
        errorTitle.textContent = 'Erro na busca';
        errorDesc.textContent = response.error;
        return;
      }

      if (response.success && response.song) {
        const s = response.song;

        // Update agora tocando a musica
        songTitle.textContent = s.title || title;
        songArtist.textContent = s.artist || artist;

        if (s.thumbnail) {
          songArt.innerHTML = `<img src="${s.thumbnail}" alt="cover" />`;
        } else {
          songArt.innerHTML = '🎵';
        }

        geniusLink.href = s.url || '#';

        if (s.lyrics) {
          lyricsText.innerHTML = formatLyrics(s.lyrics);
        } else {
          lyricsText.innerHTML = `<span style="color:var(--text3)">A letra não pôde ser extraída automaticamente.<br><br>
          <a href="${s.url}" target="_blank" style="color:var(--accent); text-decoration:none;">Ver no Genius →</a></span>`;
        }

        showState('lyrics');
        // Scroll to top
        document.querySelector('.lyrics-body').scrollTop = 0;
      }
    }
  );
}

async function detectSongFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_SONG_DETECT' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response?.song || null);
        }
      });
    });
  } catch {
    return null;
  }
}

async function init() {
  // Carregar token
  chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (res) => {
    hasToken = !!(res?.token);
    if (res?.token) tokenInput.value = '•'.repeat(20);
  });

  // Checar música atual armazenada
  chrome.runtime.sendMessage({ type: 'GET_CURRENT_SONG' }, async (res) => {
    const storedSong = res?.song;

    // Também tenta detectar a música pela aba ativa, caso não haja música armazenada ou a aba ativa mudou desde a última detecção
    const tabSong = await detectSongFromActiveTab();
    const song = tabSong || storedSong;

    if (!hasToken) {
      // Recheck token sincronamente
      chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (tokenRes) => {
        hasToken = !!(tokenRes?.token);
        if (!hasToken) {
          showState('no-token');
          return;
        }
        if (song) {
          currentSong = song;
          fetchAndDisplayLyrics(song.artist, song.title);
        } else {
          showState('no-music');
        }
      });
      return;
    }

    if (song) {
      currentSong = song;
      fetchAndDisplayLyrics(song.artist, song.title);
    } else {
      showState('no-music');
    }
  });
}

// Reload do botão
btnReload.addEventListener('click', () => {
  if (isLoading) return;
  if (!hasToken) {
    settingsPanel.classList.toggle('open');
    return;
  }
  if (currentSong) {
    fetchAndDisplayLyrics(currentSong.artist, currentSong.title);
  } else {
    // Tenta detectar de novo
    detectSongFromActiveTab().then((song) => {
      if (song) {
        currentSong = song;
        fetchAndDisplayLyrics(song.artist, song.title);
      } else {
        showToast('Nenhuma música detectada', 'error');
      }
    });
  }
});

// Mudar configuração
btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

openSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('open');
});

// Salvar token
saveTokenBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (!token || token.startsWith('•')) {
    showToast('Digite um token válido', 'error');
    return;
  }

  chrome.runtime.sendMessage({ type: 'SAVE_TOKEN', token }, (res) => {
    if (res?.success) {
      hasToken = true;
      tokenInput.value = '•'.repeat(20);
      showToast('Token salvo com sucesso!', 'success');
      settingsPanel.classList.remove('open');

      if (currentSong) {
        fetchAndDisplayLyrics(currentSong.artist, currentSong.title);
      } else {
        showState('no-music');
      }
    }
  });
});

// Procura por mudanças na música detectada enquanto a popup estiver aberto
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SONG_CHANGED' && message.data) {
    const song = message.data;
    const newKey = `${song.artist}||${song.title}`;
    const curKey = currentSong ? `${currentSong.artist}||${currentSong.title}` : '';

    if (newKey !== curKey) {
      currentSong = song;
      if (hasToken) {
        fetchAndDisplayLyrics(song.artist, song.title);
      }
    }
  }
});

// Mostrar token real ao focar no input, e esconder ao desfocar (se vazio ou apenas bullets)
tokenInput.addEventListener('focus', () => {
  if (tokenInput.value.startsWith('•')) {
    tokenInput.value = '';
    tokenInput.type = 'text';
  }
});

tokenInput.addEventListener('blur', () => {
  if (!tokenInput.value) {
    tokenInput.type = 'password';
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (res) => {
      if (res?.token) tokenInput.value = '•'.repeat(20);
    });
  }
});

// Init
init();
