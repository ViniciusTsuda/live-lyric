# 🎵 LiveLyric — Extensão para Microsoft Edge

Detecta automaticamente a música tocando no seu navegador e busca a letra via **Genius API**, exibindo tudo em uma interface elegante.

---

## ✨ Funcionalidades

- 🎵 **Detecção automática** de músicas via Media Session API
- 📜 **Busca de letras** automática via Genius API
- 🔄 **Botão de reload** para atualizar manualmente
- 🖼️ Exibe capa do álbum e informações da faixa
- 🔗 Link direto para a página no Genius
- 💾 Token salvo localmente (não sai do seu navegador)

---

## 🚀 Instalação no Microsoft Edge

1. Abra o Edge e acesse `edge://extensions/`
2. Ative o **"Modo do desenvolvedor"** (canto inferior esquerdo)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `lyrics-extension`
5. A extensão aparecerá na barra de ferramentas

---

## 🔑 Configuração do Token Genius

1. Acesse [genius.com/api-clients](https://genius.com/api-clients)
2. Faça login ou crie uma conta (gratuito)
3. Clique em **"New API Client"**
4. Preencha o nome do app (qualquer nome) e `http://localhost` como URL
5. Copie o **"Client Access Token"**
6. Na extensão, clique no ícone ⚙️ e cole o token

---

## 🎵 Como Usar

1. Toque uma música em qualquer aba (Spotify Web, YouTube, Deezer, etc.)
2. Clique no ícone da extensão na barra do Edge
3. A letra aparece automaticamente!
4. Use o botão 🔄 para recarregar manualmente

---

## 🛠️ Compatibilidade

Funciona com sites que usam a **Media Session API**:
- Spotify Web Player
- YouTube / YouTube Music
- Deezer
- Apple Music (web)
- SoundCloud
- E muitos outros!

---

## 📁 Estrutura

```
lyrics-extension/
├── manifest.json      # Configuração da extensão
├── background.js      # Service worker (busca de letras)
├── content.js         # Detecção de mídia nas abas
├── popup.html         # Interface do usuário
├── popup.js           # Lógica da interface
└── icons/             # Ícones da extensão
```
