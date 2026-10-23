// ==========================================
// BATTLE RPS - Single & Online Multi (game.js)
// ==========================================

const HAND_SVGS = {
  scissors: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#3b2314" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M46 62 L34 18 C32 10, 46 8, 49 17 L58 56" fill="#f7c49c"/>
        <path d="M58 56 L68 16 C71 8, 85 11, 82 20 L69 62" fill="#f7c49c"/>
        <path d="M32 65 C28 85, 38 106, 60 106 C82 106, 90 88, 86 66 Z" fill="#f5b88c"/>
        <rect x="62" y="56" width="14" height="22" rx="7" transform="rotate(8 69 67)" fill="#eda879"/>
        <rect x="74" y="62" width="13" height="20" rx="6.5" transform="rotate(14 80 72)" fill="#e59a69"/>
        <path d="M31 68 C28 56, 44 52, 56 58 C65 62, 62 75, 50 74 C40 73, 33 74, 31 68 Z" fill="#f9cba6"/>
        <path d="M45 84 Q60 78 74 85" fill="none" stroke="#8c5332" stroke-width="2.2"/>
      </g>
    </svg>
  `,
  paper: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#3b2314" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="
          M34 74
          L22 54 C17 47, 26 40, 32 46 L42 60
          L41 25 C41 16, 52 16, 52 25 L53 54
          L56 18 C56 10, 67 10, 67 18 L66 54
          L70 23 C71 15, 81 17, 80 25 L77 57
          L83 34 C85 27, 94 30, 92 38 L85 72
          C88 92, 76 108, 57 108
          C40 108, 32 92, 34 74 Z" fill="#f5b88c"/>
        <path d="M45 72 Q60 66 76 74" fill="none" stroke="#8c5332" stroke-width="2.3"/>
        <path d="M48 84 Q62 76 72 88" fill="none" stroke="#8c5332" stroke-width="2.3"/>
        <path d="M42 64 Q52 78 48 94" fill="none" stroke="#8c5332" stroke-width="2.3"/>
      </g>
    </svg>
  `,
  rock: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#3b2314" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M26 62 C24 90, 38 106, 62 106 C86 106, 96 88, 94 60 Z" fill="#f2b082"/>
        <rect x="26" y="34" width="17" height="34" rx="8.5" fill="#f7c49c"/>
        <rect x="42" y="30" width="18" height="36" rx="9" fill="#f7c49c"/>
        <rect x="59" y="32" width="17" height="35" rx="8.5" fill="#f5b88c"/>
        <rect x="75" y="37" width="16" height="32" rx="8" fill="#eda879"/>
        <path d="M26 58 C26 48, 42 46, 60 52 C68 55, 67 68, 56 68 C42 68, 28 66, 26 58 Z" fill="#f9cba6"/>
        <path d="M46 78 Q64 72 80 80" fill="none" stroke="#8c5332" stroke-width="2.3"/>
      </g>
    </svg>
  `
};

const CHOICE_META = {
  scissors: { name: '가위', emoji: '✌️', beats: 'paper' },
  paper: { name: '보', emoji: '🖐️', beats: 'rock' },
  rock: { name: '바위', emoji: '✊', beats: 'scissors' }
};

const ALL_CHOICES = ['scissors', 'paper', 'rock'];
const MAX_LIFE = 5;
const MAX_SPECIAL = 3;
const INITIAL_CARD_COUNT = 3;

const CHANT_STEP_MS = 600;
const CHANT_TOTAL_MS = CHANT_STEP_MS * 3;
const NEXT_ROUND_DELAY_MS = 5000;

const state = {
  screen: 'menu',
  mode: 'single',
  nickname: 'PLAYER',
  oppNickname: 'AI',

  round: 1,
  isRunning: false,
  canSelect: false,
  selectedChoice: null,
  isGameOver: false,
  soundEnabled: true,

  player: {
    life: MAX_LIFE,
    special: 0,
    streak: 0,
    cards: { scissors: INITIAL_CARD_COUNT, paper: INITIAL_CARD_COUNT, rock: INITIAL_CARD_COUNT }
  },
  opp: {
    life: MAX_LIFE,
    special: 0,
    streak: 0,
    cards: { scissors: INITIAL_CARD_COUNT, paper: INITIAL_CARD_COUNT, rock: INITIAL_CARD_COUNT },
    totalCards: INITIAL_CARD_COUNT * 3
  },

  stats: {
    single: { wins: 0, losses: 0, draws: 0 },
    multi: { wins: 0, losses: 0, draws: 0 }
  },

  room: null
};

let activeTimers = [];
let cycleIntervalId = null;

function registerTimeout(fn, delay) {
  const id = setTimeout(fn, delay);
  activeTimers.push(id);
  return id;
}

function clearAllTimers() {
  activeTimers.forEach((id) => clearTimeout(id));
  activeTimers = [];
  if (cycleIntervalId) {
    clearInterval(cycleIntervalId);
    cycleIntervalId = null;
  }
}

// ==========================================
// 오디오 & 음성 합성 (모바일 완벽 호환 Web Audio API 음성 재생)
// ==========================================
let audioCtx = null;
const voiceBuffers = {};
let isDecodingVoices = false;
let currentVoiceSource = null;

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (audioCtx && !isDecodingVoices && window.VOICE_WAV_BASE64) {
    isDecodingVoices = true;
    const keys = Object.keys(window.VOICE_WAV_BASE64);
    keys.forEach((key) => {
      try {
        const ab = base64ToArrayBuffer(window.VOICE_WAV_BASE64[key]);
        audioCtx.decodeAudioData(
          ab,
          (decoded) => {
            voiceBuffers[key] = decoded;
          },
          () => {}
        );
      } catch (e) {}
    });
  }
  return audioCtx;
}

function playVoiceClip(clipKey) {
  if (!state.soundEnabled) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  const buffer = voiceBuffers[clipKey];
  if (buffer) {
    try {
      if (currentVoiceSource) {
        try {
          currentVoiceSource.stop();
        } catch (e) {}
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1.4, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      currentVoiceSource = source;
      return true;
    } catch (e) {}
  }

  // 아직 디코딩 전이라면 즉시 디코딩 후 재생
  if (window.VOICE_WAV_BASE64 && window.VOICE_WAV_BASE64[clipKey]) {
    try {
      const ab = base64ToArrayBuffer(window.VOICE_WAV_BASE64[clipKey]);
      ctx.decodeAudioData(
        ab,
        (decoded) => {
          voiceBuffers[clipKey] = decoded;
          if (!state.soundEnabled) return;
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(1.4, ctx.currentTime);
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(0);
          currentVoiceSource = source;
        },
        () => {}
      );
      return true;
    } catch (e) {}
  }
  return false;
}

function playTone(freq, durationMs, type = 'sine', volume = 0.14) {
  if (!state.soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

function playSoundEffect(effectType) {
  if (!state.soundEnabled) return;
  switch (effectType) {
    case 'chant1':
      playTone(440, 120, 'triangle', 0.12);
      break;
    case 'chant2':
      playTone(554.37, 120, 'triangle', 0.12);
      break;
    case 'chant3':
      playTone(659.25, 180, 'triangle', 0.14);
      break;
    case 'select':
      playTone(740, 90, 'sine', 0.16);
      break;
    case 'win':
      playTone(523.25, 110, 'sine', 0.14);
      setTimeout(() => playTone(659.25, 110, 'sine', 0.14), 90);
      setTimeout(() => playTone(783.99, 220, 'sine', 0.16), 180);
      break;
    case 'special-hit':
      playTone(220, 140, 'sawtooth', 0.18);
      setTimeout(() => playTone(880, 300, 'sawtooth', 0.2), 110);
      break;
    case 'lose':
    case 'timeout':
      playTone(349.23, 140, 'sawtooth', 0.14);
      setTimeout(() => playTone(233.08, 240, 'sawtooth', 0.16), 130);
      break;
    case 'draw':
      playTone(440, 120, 'sine', 0.14);
      setTimeout(() => playTone(440, 160, 'sine', 0.14), 140);
      break;
    case 'special-full':
      playTone(587.33, 100, 'square', 0.14);
      setTimeout(() => playTone(880, 220, 'square', 0.16), 100);
      break;
  }
}

function speakKorean(text, rate = 1.15, pitch = 1.05) {
  if (!state.soundEnabled) return;

  // 1순위: 스마트폰/PC 어디서든 100% 재생되는 내장 Web Audio 음성 버퍼 사용
  const clipMap = {
    '가위!': 'gawi',
    '바위!': 'bawi',
    '보!': 'bo',
    '가위, 바위, 보': 'chant',
    '이겼다!': 'win',
    '울지마!': 'lose',
    '아싸! 이겼다!': 'final_win',
    '분발해라!': 'final_lose'
  };
  const clipKey = clipMap[text];
  if (clipKey && playVoiceClip(clipKey)) {
    return;
  }

  // 2순위 폴백: 브라우저 speechSynthesis
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = rate;
      utter.pitch = pitch;
      utter.volume = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }
}

// ==========================================
// 전적 관리 (SINGLE / MULTI 분리)
// ==========================================
function loadAllStats() {
  try {
    const savedSingle = localStorage.getItem('rps_stats_single_v2');
    if (savedSingle) {
      const p = JSON.parse(savedSingle);
      state.stats.single = {
        wins: Number(p.wins) || 0,
        losses: Number(p.losses) || 0,
        draws: Number(p.draws) || 0
      };
    }

    const savedMulti = localStorage.getItem('rps_stats_multi_v2');
    if (savedMulti) {
      const p = JSON.parse(savedMulti);
      state.stats.multi = {
        wins: Number(p.wins) || 0,
        losses: Number(p.losses) || 0,
        draws: Number(p.draws) || 0
      };
    }

    const savedNick = localStorage.getItem('rps_player_nickname');
    if (savedNick) {
      state.nickname = savedNick;
      const input = document.getElementById('input-nickname');
      if (input) input.value = savedNick;
    }
  } catch (e) {}
  renderAllStatsUI();
}

function saveStats(modeKey) {
  try {
    if (modeKey === 'single') {
      localStorage.setItem('rps_stats_single_v2', JSON.stringify(state.stats.single));
    } else {
      localStorage.setItem('rps_stats_multi_v2', JSON.stringify(state.stats.multi));
    }
  } catch (e) {}
  renderAllStatsUI();
}

function calcWinRate(record) {
  const decided = record.wins + record.losses;
  return decided > 0 ? Math.round((record.wins / decided) * 100) : 0;
}

function renderAllStatsUI() {
  const s = state.stats.single;
  const sRate = calcWinRate(s);
  const m = state.stats.multi;
  const mRate = calcWinRate(m);

  document.getElementById('menu-single-record').textContent =
    `W:${s.wins} L:${s.losses} D:${s.draws} (${sRate}%)`;
  document.getElementById('menu-multi-record').textContent =
    `W:${m.wins} L:${m.losses} D:${m.draws} (${mRate}%)`;

  document.getElementById('lobby-wins').textContent = m.wins;
  document.getElementById('lobby-losses').textContent = m.losses;
  document.getElementById('lobby-draws').textContent = m.draws;
  document.getElementById('lobby-winrate').textContent = mRate;

  const activeRecord = state.mode === 'multi' ? m : s;
  const activeRate = state.mode === 'multi' ? mRate : sRate;
  document.getElementById('stat-wins').textContent = activeRecord.wins;
  document.getElementById('stat-losses').textContent = activeRecord.losses;
  document.getElementById('stat-draws').textContent = activeRecord.draws;
  document.getElementById('stat-winrate').textContent = activeRate;
}

function showScreen(screenName) {
  state.screen = screenName;
  document.getElementById('screen-menu').classList.toggle('hidden', screenName !== 'menu');
  document.getElementById('screen-lobby').classList.toggle('hidden', screenName !== 'lobby');
  document.getElementById('screen-game').classList.toggle('hidden', screenName !== 'game');
  document.getElementById('gameover-modal').classList.add('hidden');
  renderAllStatsUI();
}

function syncNicknameFromInput() {
  const input = document.getElementById('input-nickname');
  const val = (input ? input.value : '').trim() || 'PLAYER';
  state.nickname = val.slice(0, 12);
  try {
    localStorage.setItem('rps_player_nickname', state.nickname);
  } catch (e) {}
}

// ==========================================
// WebSocket (멀티플레이)
// ==========================================
let ws = null;

function ensureWebSocketConnected() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (ws.readyState === WebSocket.OPEN) {
      wsSend({ type: 'set_nickname', nickname: state.nickname });
      wsSend({ type: 'get_rooms' });
    }
    return;
  }

  updateWsBadge('connecting', 'CONNECTING...');
  const wsUrl =
    window.location.protocol === 'file:'
      ? 'ws://localhost:3000'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    updateWsBadge('disconnected', 'OFFLINE');
    return;
  }

  ws.onopen = () => {
    updateWsBadge('connected', '🟢 ONLINE');
    wsSend({ type: 'set_nickname', nickname: state.nickname });
    wsSend({ type: 'get_rooms' });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {}
  };

  ws.onclose = () => {
    updateWsBadge('disconnected', '🔴 OFFLINE');
  };

  ws.onerror = () => {
    updateWsBadge('disconnected', '🔴 ERROR');
  };
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function updateWsBadge(statusClass, text) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;
  badge.className = `ws-badge ${statusClass}`;
  badge.textContent = text;
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'welcome':
    case 'room_list':
      renderLobbyRoomList(msg.rooms || []);
      break;

    case 'error':
      alert(msg.message || 'Error');
      break;

    case 'left_room':
      state.room = null;
      renderLobbyRoomList(msg.rooms || []);
      showScreen('lobby');
      break;

    case 'room_update':
      handleMultiplayerRoomUpdate(msg.room);
      break;

    case 'round_start':
      handleMultiplayerRoundStart(msg.round, msg.chantTotalMs);
      break;

    case 'card_locked':
      handleMultiplayerCardLocked(msg.choice);
      break;

    case 'opp_locked': {
      document.getElementById('opp-hand-name').textContent = 'OPP READY!';
      break;
    }

    case 'round_result':
      handleMultiplayerRoundResult(msg);
      break;

    case 'match_over':
      finishGame(msg.finalResult, msg.reasonText);
      break;

    case 'rematch_requested': {
      const subtextEl = document.getElementById('status-subtext');
      if (subtextEl) {
        subtextEl.textContent = `🔄 ${msg.nickname} WANTS REMATCH! PRESS START!`;
      }
      break;
    }

    case 'opponent_left_during_match':
      clearAllTimers();
      alert('상대방이 퇴장했습니다.');
      break;
  }
}

function renderLobbyRoomList(rooms) {
  const container = document.getElementById('room-list-container');
  const countText = document.getElementById('room-count-text');
  countText.textContent = `${rooms.length} ROOMS`;

  if (rooms.length === 0) {
    container.innerHTML =
      '<div class="empty-room-msg">NO ROOMS. CLICK [➕ CREATE] TO MAKE A ROOM!</div>';
    return;
  }

  container.innerHTML = '';
  rooms.forEach((r) => {
    const isFull = r.playerCount >= r.maxPlayers || r.status === 'playing';
    const item = document.createElement('div');
    item.className = 'room-item';

    const statusLabel =
      r.status === 'playing'
        ? `PLAYING (${r.playerCount}/${r.maxPlayers})`
        : isFull
        ? `FULL (${r.playerCount}/${r.maxPlayers})`
        : `OPEN (${r.playerCount}/${r.maxPlayers})`;

    item.innerHTML = `
      <div class="room-info">
        <div class="room-title">${escapeHtml(r.title)}</div>
        <div class="room-meta">HOST : <strong>${escapeHtml(r.hostName)}</strong></div>
      </div>
      <div class="room-actions">
        <span class="room-status-pill ${isFull ? 'full' : 'open'}">${statusLabel}</span>
        <button class="btn-join-room" type="button" ${isFull ? 'disabled' : ''}>
          ${isFull ? 'FULL' : 'JOIN ▶'}
        </button>
      </div>
    `;

    const joinBtn = item.querySelector('.btn-join-room');
    if (!isFull) {
      joinBtn.addEventListener('click', () => {
        wsSend({ type: 'join_room', roomId: r.id, nickname: state.nickname });
      });
    }
    container.appendChild(item);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// 멀티플레이 동기화
// ==========================================
function handleMultiplayerRoomUpdate(room) {
  state.mode = 'multi';
  state.room = room;
  if (state.screen !== 'game') {
    showScreen('game');
    initMiniDecks();
  }

  const modeBadge = document.getElementById('game-mode-badge');
  modeBadge.textContent = 'MULTI';
  modeBadge.className = 'mode-tag multi-tag';

  document.getElementById('my-name-display').textContent = state.nickname;

  if (room.me) {
    state.player.life = room.me.life;
    state.player.special = room.me.special;
    state.player.streak = room.me.streak;
    state.player.cards = { ...room.me.cards };
  }

  const startBtn = document.getElementById('btn-start-game');
  const subtextEl = document.getElementById('status-subtext');
  const chantEl = document.getElementById('chant-text');

  if (!room.opp) {
    state.oppNickname = 'WAITING';
    state.opp = {
      life: MAX_LIFE,
      special: 0,
      streak: 0,
      cards: { scissors: INITIAL_CARD_COUNT, paper: INITIAL_CARD_COUNT, rock: INITIAL_CARD_COUNT },
      totalCards: INITIAL_CARD_COUNT * 3
    };
    state.isRunning = false;
    state.canSelect = false;
    state.isGameOver = false;

    document.getElementById('opp-name-label').textContent = 'OPP LIFE';
    startBtn.disabled = true;
    startBtn.textContent = '⏳ WAITING (1/2)';
    chantEl.innerHTML = 'WAITING FOR PLAYER...';
    subtextEl.textContent = 'WAIT FOR OPPONENT TO JOIN';
  } else {
    state.oppNickname = room.opp.nickname;
    state.opp.life = room.opp.life;
    state.opp.special = room.opp.special;
    state.opp.streak = room.opp.streak;
    if (room.opp.cards) {
      state.opp.cards = { ...room.opp.cards };
    }
    state.opp.totalCards = room.opp.totalCards;

    document.getElementById('opp-name-label').textContent = `${state.oppNickname}`;

    if (room.status === 'ready') {
      state.isRunning = false;
      state.canSelect = false;
      state.isGameOver = false;
      initMiniDecks();
      startBtn.disabled = false;
      startBtn.textContent = '▶ START';
      chantEl.innerHTML = `VS <strong>${escapeHtml(state.oppNickname)}</strong> — PRESS <strong>[START]</strong>!`;
      subtextEl.textContent = 'PRESS START BELOW';
      document.getElementById('opp-hand-Visual').innerHTML = '<span class="question-mark">❓</span>';
      document.getElementById('opp-hand-name').textContent = 'READY';
      document.getElementById('round-result-overlay').classList.add('hidden');
    }
  }

  state.round = room.round || 1;
  updateAllUI();
}

function handleMultiplayerRoundStart(roundNum, chantTotalMs) {
  clearAllTimers();
  document.getElementById('gameover-modal').classList.add('hidden');

  state.round = roundNum;
  state.isRunning = true;
  state.isGameOver = false;
  state.canSelect = true;
  state.selectedChoice = null;

  const startBtn = document.getElementById('btn-start-game');
  startBtn.disabled = true;
  startBtn.textContent = '⚡ PLAYING...';

  runChantVisualsAndAudio(chantTotalMs || CHANT_TOTAL_MS);
}

function handleMultiplayerCardLocked(choice) {
  state.selectedChoice = choice;
  state.canSelect = false;
  playSoundEffect('select');

  document.querySelectorAll('.main-hand-card').forEach((btn) => btn.classList.remove('selected-card'));
  const btn = document.getElementById(`btn-${choice}`);
  if (btn) btn.classList.add('selected-card');
  renderCardCounts();

  document.getElementById('status-subtext').textContent = `✅ SELECTED : ${CHOICE_META[choice].name}`;
}

function handleMultiplayerRoundResult(msg) {
  clearAllTimers();
  state.canSelect = false;

  const prevPlayerLife = state.player.life;
  const prevOppLife = state.opp.life;
  const prevPlayerSpecial = state.player.special;
  const prevOppSpecial = state.opp.special;

  state.player.life = msg.me.life;
  state.player.special = msg.me.special;
  state.player.streak = msg.me.streak;
  state.player.cards = { ...msg.me.cards };

  state.opp.life = msg.opp.life;
  state.opp.special = msg.opp.special;
  state.opp.streak = msg.opp.streak;
  if (msg.opp.cards) {
    state.opp.cards = { ...msg.opp.cards };
  }
  state.opp.totalCards = msg.opp.totalCards;

  document.getElementById('timer-bar-wrap').classList.add('hidden');
  const oppScreen = document.getElementById('opponent-screen');
  const oppVisual = document.getElementById('opp-hand-Visual');
  const oppName = document.getElementById('opp-hand-name');
  const chantEl = document.getElementById('chant-text');
  const resultOverlay = document.getElementById('round-result-overlay');
  const resultTitle = document.getElementById('round-result-title');
  const resultDetail = document.getElementById('round-result-detail');

  oppScreen.classList.remove('cycling');
  chantEl.classList.remove('shouting');
  resultOverlay.className = 'round-result-overlay';

  if (msg.isTimeoutRound) {
    playSoundEffect('timeout');
    oppVisual.innerHTML = '<span class="question-mark">⏰</span>';

    if (msg.outcome === 'timeout_me') {
      oppName.textContent = 'TIME OUT!';
      resultOverlay.classList.add('lose');
      resultTitle.textContent = '💧울지마!';
      resultDetail.textContent = 'MY -1 / SP+1';
      chantEl.innerHTML = '<strong>"울지마!"</strong> (TIME OUT: MY -1 &amp; SP +1)';
      speakKorean('울지마!');
    } else if (msg.outcome === 'timeout_opp') {
      oppName.textContent = 'OPP TIME OUT!';
      resultOverlay.classList.add('win');
      resultTitle.textContent = '🎉이겼다!';
      resultDetail.textContent = 'OPP -1';
      chantEl.innerHTML = '<strong>"이겼다!"</strong> (OPP TIME OUT: OPP -1)';
      speakKorean('이겼다!');
    } else {
      oppName.textContent = 'BOTH TIME OUT!';
      resultOverlay.classList.add('lose');
      resultTitle.textContent = '💧울지마!';
      resultDetail.textContent = 'BOTH -1';
      chantEl.innerHTML = '<strong>"울지마!"</strong> (BOTH LIFE -1 &amp; SP +1)';
      speakKorean('울지마!');
    }
  } else {
    const myChoice = msg.myChoice;
    const oppChoice = msg.oppChoice;
    oppVisual.innerHTML = HAND_SVGS[oppChoice];
    oppName.textContent = `${CHOICE_META[oppChoice].name}!`;

    if (msg.outcome === 'win') {
      const dmg = prevOppLife - state.opp.life;
      playSoundEffect(dmg >= 3 && prevPlayerSpecial >= MAX_SPECIAL ? 'special-hit' : 'win');
      speakKorean('이겼다!');
      resultOverlay.classList.add('win');
      resultTitle.textContent = '🎉이겼다!';
      resultDetail.textContent = `OPP -${dmg}`;
      chantEl.innerHTML = `<strong>"이겼다!"</strong> ${CHOICE_META[myChoice].name} vs ${CHOICE_META[oppChoice].name} (OPP -${dmg})`;
    } else if (msg.outcome === 'lose') {
      const dmg = prevPlayerLife - state.player.life;
      playSoundEffect(dmg >= 3 && prevOppSpecial >= MAX_SPECIAL ? 'special-hit' : 'lose');
      speakKorean('울지마!');
      resultOverlay.classList.add('lose');
      resultTitle.textContent = '💧울지마!';
      resultDetail.textContent = `MY -${dmg} / SP+1`;
      chantEl.innerHTML = `<strong>"울지마!"</strong> ${CHOICE_META[myChoice].name} vs ${CHOICE_META[oppChoice].name} (MY -${dmg})`;
    } else {
      playSoundEffect('draw');
      resultOverlay.classList.add('draw');
      resultTitle.textContent = '🤝비김';
      resultDetail.textContent = 'SP +1';
      chantEl.innerHTML = `<strong>DRAW!</strong> (${CHOICE_META[myChoice].name}) — SP +1`;
    }
  }

  if (
    (prevPlayerSpecial < MAX_SPECIAL && state.player.special === MAX_SPECIAL) ||
    (prevOppSpecial < MAX_SPECIAL && state.opp.special === MAX_SPECIAL)
  ) {
    setTimeout(() => playSoundEffect('special-full'), 260);
  }

  updateAllUI(prevPlayerLife, prevOppLife);

  const playerRemaining =
    state.player.cards.scissors + state.player.cards.paper + state.player.cards.rock;
  if (state.player.life > 0 && state.opp.life > 0 && !(playerRemaining === 0 && state.opp.totalCards === 0)) {
    startCountdownTextOnly();
  }
}

function startCountdownTextOnly() {
  const subtextEl = document.getElementById('status-subtext');
  const totalSec = Math.floor(NEXT_ROUND_DELAY_MS / 1000);
  subtextEl.textContent = `⏳ NEXT ROUND IN ${totalSec}s...`;

  for (let sec = 1; sec < totalSec; sec++) {
    const remainingSec = totalSec - sec;
    registerTimeout(() => {
      if (!state.isGameOver && state.isRunning) {
        subtextEl.textContent = `⏳ NEXT ROUND IN ${remainingSec}s...`;
      }
    }, sec * 1000);
  }
}

// ==========================================
// 공용 UI 렌더링
// ==========================================
function initHandIllustrations() {
  document.getElementById('svg-scissors').innerHTML = HAND_SVGS.scissors;
  document.getElementById('svg-paper').innerHTML = HAND_SVGS.paper;
  document.getElementById('svg-rock').innerHTML = HAND_SVGS.rock;

  // 상대편 생명 게이지 옆 작은 가위/보/바위 이미지 초기화
  const oppSc = document.getElementById('opp-svg-scissors');
  const oppPa = document.getElementById('opp-svg-paper');
  const oppRo = document.getElementById('opp-svg-rock');
  if (oppSc) oppSc.innerHTML = HAND_SVGS.scissors;
  if (oppPa) oppPa.innerHTML = HAND_SVGS.paper;
  if (oppRo) oppRo.innerHTML = HAND_SVGS.rock;
}

function initMiniDecks() {
  ALL_CHOICES.forEach((choice) => {
    const deckEl = document.getElementById(`deck-${choice}`);
    deckEl.innerHTML = '';
    for (let i = 0; i < INITIAL_CARD_COUNT; i++) {
      const mini = document.createElement('div');
      mini.className = 'mini-card';
      mini.id = `mini-${choice}-${i}`;
      mini.textContent = CHOICE_META[choice].emoji;
      deckEl.appendChild(mini);
    }
  });
}

function renderLifeStars(containerId, currentLife, previousLife = currentLife) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (let i = 1; i <= MAX_LIFE; i++) {
    const span = document.createElement('span');
    if (i <= currentLife) {
      span.className = 'star-unit active';
      span.textContent = '★';
    } else {
      const justLost = i > currentLife && i <= previousLife;
      span.className = `star-unit lost${justLost ? ' damage-hit' : ''}`;
      span.textContent = '★';
    }
    container.appendChild(span);
  }
}

function renderSpecialBar(barId, readyBadgeId, specialCount) {
  const bar = document.getElementById(barId);
  const slots = bar.querySelectorAll('.special-slot');
  slots.forEach((slot, idx) => {
    if (idx < specialCount) {
      slot.classList.add('filled');
    } else {
      slot.classList.remove('filled');
    }
  });

  const readyBadge = document.getElementById(readyBadgeId);
  if (specialCount >= MAX_SPECIAL) {
    bar.classList.add('max-charged');
    readyBadge.classList.remove('hidden');
  } else {
    bar.classList.remove('max-charged');
    readyBadge.classList.add('hidden');
  }
}

function renderStreakBadge(badgeId, streakCount) {
  const badge = document.getElementById(badgeId);
  if (streakCount >= 2) {
    badge.textContent = `🔥${streakCount}WIN`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderCardCounts() {
  let playerTotal = 0;

  ALL_CHOICES.forEach((choice) => {
    const remaining = state.player.cards[choice];
    playerTotal += remaining;

    document.getElementById(`count-${choice}`).textContent = remaining;
    const btn = document.getElementById(`btn-${choice}`);

    const isSelectable = state.canSelect && !state.isGameOver && remaining > 0;
    btn.disabled = !isSelectable;

    if (isSelectable) {
      btn.classList.add('selectable-now');
    } else {
      btn.classList.remove('selectable-now');
    }

    const usedCount = INITIAL_CARD_COUNT - remaining;
    for (let i = 0; i < INITIAL_CARD_COUNT; i++) {
      const mini = document.getElementById(`mini-${choice}-${i}`);
      if (mini) {
        if (i < usedCount) {
          mini.classList.add('used');
        } else {
          mini.classList.remove('used');
        }
      }
    }

    // 상대편 가위/보/바위 남은 숫자 업데이트
    const oppRem = state.opp.cards ? state.opp.cards[choice] : INITIAL_CARD_COUNT;
    const oppCountEl = document.getElementById(`opp-count-${choice}`);
    const oppChipEl = document.getElementById(`opp-chip-${choice}`);
    if (oppCountEl) oppCountEl.textContent = oppRem;
    if (oppChipEl) {
      oppChipEl.classList.toggle('empty-chip', oppRem <= 0);
    }
  });

  const oppTotal =
    state.mode === 'multi'
      ? state.opp.totalCards
      : state.opp.cards.scissors + state.opp.cards.paper + state.opp.cards.rock;

  document.getElementById('player-total-cards').textContent = playerTotal;
  document.getElementById('opp-total-cards').textContent = oppTotal;
  document.getElementById('round-indicator').textContent = `R${state.round}`;
}

function updateAllUI(prevPlayerLife = state.player.life, prevOppLife = state.opp.life) {
  renderLifeStars('player-life-stars', state.player.life, prevPlayerLife);
  renderLifeStars('opp-life-stars', state.opp.life, prevOppLife);

  renderSpecialBar('player-special-bar', 'player-special-ready', state.player.special);
  renderSpecialBar('opp-special-bar', 'opp-special-ready', state.opp.special);

  renderStreakBadge('player-streak-badge', state.player.streak);
  renderStreakBadge('opp-streak-badge', state.opp.streak);

  renderCardCounts();
  renderAllStatsUI();
}

// "가위, 바위, 보!" 연출
function runChantVisualsAndAudio(totalMs) {
  document.querySelectorAll('.main-hand-card').forEach((btn) => btn.classList.remove('selected-card'));
  document.getElementById('round-result-overlay').classList.add('hidden');
  renderCardCounts();

  const chantEl = document.getElementById('chant-text');
  const subtextEl = document.getElementById('status-subtext');
  const timerWrap = document.getElementById('timer-bar-wrap');
  const timerFill = document.getElementById('timer-bar-fill');
  const oppScreen = document.getElementById('opponent-screen');
  const oppVisual = document.getElementById('opp-hand-Visual');
  const oppName = document.getElementById('opp-hand-name');

  subtextEl.textContent = '🚨 SELECT A CARD NOW!';

  timerWrap.classList.remove('hidden');
  timerFill.style.transition = 'none';
  timerFill.style.transform = 'scaleX(1)';
  void timerFill.offsetWidth;
  timerFill.style.transition = `transform ${totalMs}ms linear`;
  timerFill.style.transform = 'scaleX(0)';

  oppScreen.classList.add('cycling');

  let cycleIdx = 0;
  cycleIntervalId = setInterval(() => {
    const current = ALL_CHOICES[cycleIdx % 3];
    oppVisual.innerHTML = HAND_SVGS[current];
    oppName.textContent = `${CHOICE_META[current].name}...`;
    cycleIdx++;
  }, 85);

  const setChantStep = (word, soundKey) => {
    chantEl.classList.remove('shouting');
    void chantEl.offsetWidth;
    chantEl.classList.add('shouting');
    chantEl.textContent = word;
    playSoundEffect(soundKey);
    speakKorean(word);
  };

  const stepMs = Math.floor(totalMs / 3);
  setChantStep('가위!', 'chant1');

  registerTimeout(() => {
    setChantStep('바위!', 'chant2');
  }, stepMs);

  registerTimeout(() => {
    setChantStep('보!', 'chant3');
  }, stepMs * 2);
}

// ==========================================
// 싱글플레이 로직
// ==========================================
function enterSinglePlayMode() {
  syncNicknameFromInput();
  state.mode = 'single';
  state.oppNickname = 'AI';

  const modeBadge = document.getElementById('game-mode-badge');
  modeBadge.textContent = 'SINGLE';
  modeBadge.className = 'mode-tag';

  document.getElementById('my-name-display').textContent = state.nickname;
  document.getElementById('opp-name-label').textContent = 'OPP LIFE';

  showScreen('game');
  resetSinglePlayToReady();
}

function resetSinglePlayToReady() {
  clearAllTimers();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  state.round = 1;
  state.isRunning = false;
  state.canSelect = false;
  state.selectedChoice = null;
  state.isGameOver = false;

  state.player = {
    life: MAX_LIFE,
    special: 0,
    streak: 0,
    cards: { scissors: INITIAL_CARD_COUNT, paper: INITIAL_CARD_COUNT, rock: INITIAL_CARD_COUNT }
  };

  state.opp = {
    life: MAX_LIFE,
    special: 0,
    streak: 0,
    cards: { scissors: INITIAL_CARD_COUNT, paper: INITIAL_CARD_COUNT, rock: INITIAL_CARD_COUNT },
    totalCards: INITIAL_CARD_COUNT * 3
  };

  document.getElementById('gameover-modal').classList.add('hidden');
  document.getElementById('round-result-overlay').classList.add('hidden');
  document.getElementById('timer-bar-wrap').classList.add('hidden');
  document.getElementById('opponent-screen').classList.remove('cycling');
  document.querySelectorAll('.main-hand-card').forEach((btn) => btn.classList.remove('selected-card'));

  const startBtn = document.getElementById('btn-start-game');
  startBtn.disabled = false;
  startBtn.textContent = '▶ START';

  document.getElementById('status-subtext').textContent = 'PRESS START TO PLAY';
  document.getElementById('opp-hand-Visual').innerHTML = '<span class="question-mark">❓</span>';
  document.getElementById('opp-hand-name').textContent = 'READY';

  const chantEl = document.getElementById('chant-text');
  chantEl.classList.remove('shouting');
  chantEl.innerHTML = 'PRESS <strong>[START]</strong> BELOW!';

  initMiniDecks();
  updateAllUI();
}

function pickOpponentCardSingle() {
  const pool = [];
  ALL_CHOICES.forEach((choice) => {
    const count = state.opp.cards[choice];
    for (let i = 0; i < count; i++) {
      pool.push(choice);
    }
  });
  if (pool.length === 0) return 'rock';
  return pool[Math.floor(Math.random() * pool.length)];
}

function judgeRound(playerChoice, oppChoice) {
  if (playerChoice === oppChoice) return 'draw';
  if (CHOICE_META[playerChoice].beats === oppChoice) return 'win';
  return 'lose';
}

function beginSinglePlayRound() {
  if (state.isGameOver) return;
  clearAllTimers();

  state.canSelect = true;
  state.selectedChoice = null;

  runChantVisualsAndAudio(CHANT_TOTAL_MS);

  registerTimeout(() => {
    finishSinglePlayChantAndResolve();
  }, CHANT_TOTAL_MS);
}

function finishSinglePlayChantAndResolve() {
  clearAllTimers();
  state.canSelect = false;
  renderCardCounts();

  document.getElementById('timer-bar-wrap').classList.add('hidden');
  const oppScreen = document.getElementById('opponent-screen');
  const oppVisual = document.getElementById('opp-hand-Visual');
  const oppName = document.getElementById('opp-hand-name');
  const chantEl = document.getElementById('chant-text');
  const resultOverlay = document.getElementById('round-result-overlay');
  const resultTitle = document.getElementById('round-result-title');
  const resultDetail = document.getElementById('round-result-detail');

  oppScreen.classList.remove('cycling');
  chantEl.classList.remove('shouting');

  // 미선택 시간 초과 -> 내 생명 게이지 1칸 감소 + 내 필살기 게이지 1칸 증가!
  if (!state.selectedChoice) {
    const prevPlayerLife = state.player.life;
    const prevPlayerSpecial = state.player.special;

    state.player.life = Math.max(0, state.player.life - 1);
    state.player.special = Math.min(MAX_SPECIAL, state.player.special + 1);
    state.player.streak = 0;

    playSoundEffect('timeout');
    if (prevPlayerSpecial < MAX_SPECIAL && state.player.special === MAX_SPECIAL) {
      setTimeout(() => playSoundEffect('special-full'), 260);
    }

    oppVisual.innerHTML = '<span class="question-mark">⏰</span>';
    oppName.textContent = 'TIME OUT!';

    resultOverlay.className = 'round-result-overlay lose';
    resultTitle.textContent = '💧울지마!';
    resultDetail.textContent = 'MY -1 / SP+1';
    chantEl.innerHTML = '<strong>"울지마!"</strong> (TIME OUT: MY -1 &amp; SP +1)';
    speakKorean('울지마!');

    updateAllUI(prevPlayerLife, state.opp.life);
    checkSinglePlayEndOrScheduleNext();
    return;
  }

  const playerChoice = state.selectedChoice;
  const oppChoice = pickOpponentCardSingle();

  state.player.cards[playerChoice] -= 1;
  state.opp.cards[oppChoice] -= 1;

  oppVisual.innerHTML = HAND_SVGS[oppChoice];
  oppName.textContent = `${CHOICE_META[oppChoice].name}!`;

  const outcome = judgeRound(playerChoice, oppChoice);
  const prevPlayerLife = state.player.life;
  const prevOppLife = state.opp.life;
  const prevPlayerSpecial = state.player.special;
  const prevOppSpecial = state.opp.special;

  resultOverlay.className = 'round-result-overlay';

  if (outcome === 'win') {
    state.player.streak += 1;
    state.opp.streak = 0;

    let damage = 1;
    let damageTag = 'WIN';
    if (state.player.special >= MAX_SPECIAL) {
      damage = 3;
      damageTag = '⚡SP!';
      state.player.special = 0;
      playSoundEffect('special-hit');
    } else {
      if (state.player.streak === 2) {
        damage = 2;
        damageTag = '🔥2WIN';
      } else if (state.player.streak >= 3) {
        damage = 3;
        damageTag = `🔥${state.player.streak}WIN`;
      }
      playSoundEffect('win');
    }

    state.opp.life = Math.max(0, state.opp.life - damage);
    state.opp.special = Math.min(MAX_SPECIAL, state.opp.special + 1);

    speakKorean('이겼다!');
    resultOverlay.classList.add('win');
    resultTitle.textContent = '🎉이겼다!';
    resultDetail.textContent = `OPP -${damage}`;
    chantEl.innerHTML = `<strong>"이겼다!"</strong> ${CHOICE_META[playerChoice].name} vs ${CHOICE_META[oppChoice].name} (OPP -${damage})`;
  } else if (outcome === 'lose') {
    state.opp.streak += 1;
    state.player.streak = 0;

    let damage = 1;
    let damageTag = 'LOSE';
    if (state.opp.special >= MAX_SPECIAL) {
      damage = 3;
      damageTag = '⚠️SP!';
      state.opp.special = 0;
      playSoundEffect('special-hit');
    } else {
      if (state.opp.streak === 2) {
        damage = 2;
        damageTag = '2WIN';
      } else if (state.opp.streak >= 3) {
        damage = 3;
        damageTag = `${state.opp.streak}WIN`;
      }
      playSoundEffect('lose');
    }

    state.player.life = Math.max(0, state.player.life - damage);
    state.player.special = Math.min(MAX_SPECIAL, state.player.special + 1);

    speakKorean('울지마!');
    resultOverlay.classList.add('lose');
    resultTitle.textContent = '💧울지마!';
    resultDetail.textContent = `MY -${damage} / SP+1`;
    chantEl.innerHTML = `<strong>"울지마!"</strong> ${CHOICE_META[playerChoice].name} vs ${CHOICE_META[oppChoice].name} (MY -${damage})`;
  } else {
    state.player.streak = 0;
    state.opp.streak = 0;
    state.player.special = Math.min(MAX_SPECIAL, state.player.special + 1);
    state.opp.special = Math.min(MAX_SPECIAL, state.opp.special + 1);
    playSoundEffect('draw');

    resultOverlay.classList.add('draw');
    resultTitle.textContent = '🤝비김';
    resultDetail.textContent = 'SP +1';
    chantEl.innerHTML = `<strong>DRAW!</strong> (${CHOICE_META[playerChoice].name}) — SP +1`;
  }

  if (
    (prevPlayerSpecial < MAX_SPECIAL && state.player.special === MAX_SPECIAL) ||
    (prevOppSpecial < MAX_SPECIAL && state.opp.special === MAX_SPECIAL)
  ) {
    setTimeout(() => playSoundEffect('special-full'), 260);
  }

  updateAllUI(prevPlayerLife, prevOppLife);
  checkSinglePlayEndOrScheduleNext();
}

function checkSinglePlayEndOrScheduleNext() {
  const totalPlayerRemaining =
    state.player.cards.scissors + state.player.cards.paper + state.player.cards.rock;
  const totalOppRemaining =
    state.opp.cards.scissors + state.opp.cards.paper + state.opp.cards.rock;

  if (state.opp.life <= 0 || state.player.life <= 0) {
    state.isGameOver = true;
    state.isRunning = false;
    renderCardCounts();
    registerTimeout(() => {
      if (state.opp.life <= 0) {
        finishGame('win', '상대편 생명 게이지가 0이 되어 승리했습니다!');
      } else {
        finishGame('lose', '나의 생명 게이지가 0이 되어 패배했습니다.');
      }
    }, 850);
    return;
  }

  if (totalPlayerRemaining === 0 && totalOppRemaining === 0) {
    state.isGameOver = true;
    state.isRunning = false;
    renderCardCounts();
    registerTimeout(() => {
      if (state.player.life > state.opp.life) {
        finishGame(
          'win',
          `9장 모두 소진! 남은 생명이 더 많아(${state.player.life} vs ${state.opp.life}) 승리!`
        );
      } else if (state.player.life < state.opp.life) {
        finishGame(
          'lose',
          `9장 모두 소진! 남은 생명이 더 적어(${state.player.life} vs ${state.opp.life}) 패배.`
        );
      } else {
        finishGame(
          'draw',
          `9장 모두 소진! 남은 생명이 ${state.player.life}칸으로 같아 무승부로 끝납니다!`
        );
      }
    }, 900);
    return;
  }

  state.round += 1;
  startCountdownTextOnly();

  registerTimeout(() => {
    if (!state.isGameOver && state.isRunning && state.mode === 'single') {
      beginSinglePlayRound();
    }
  }, NEXT_ROUND_DELAY_MS);
}

// ==========================================
// 공용 버튼 핸들러
// ==========================================
function handleStartButtonClick() {
  getAudioContext();
  if (state.mode === 'single') {
    if (state.isRunning || state.isGameOver) return;
    state.isRunning = true;
    const startBtn = document.getElementById('btn-start-game');
    startBtn.disabled = true;
    startBtn.textContent = '⚡ PLAYING...';
    beginSinglePlayRound();
  } else {
    wsSend({ type: 'start_match' });
  }
}

function handleCardSelect(choice) {
  if (!state.canSelect || state.isGameOver) return;
  if (state.player.cards[choice] <= 0) return;

  if (state.mode === 'single') {
    state.selectedChoice = choice;
    state.canSelect = false;
    playSoundEffect('select');
    document.querySelectorAll('.main-hand-card').forEach((btn) => btn.classList.remove('selected-card'));
    document.getElementById(`btn-${choice}`).classList.add('selected-card');
    renderCardCounts();
    document.getElementById('status-subtext').textContent = `✅ SELECTED : ${CHOICE_META[choice].name}`;
  } else {
    wsSend({ type: 'select_card', choice });
  }
}

function finishGame(finalResult, reasonText) {
  clearAllTimers();
  state.isGameOver = true;
  state.isRunning = false;
  state.canSelect = false;
  renderCardCounts();

  const modeKey = state.mode === 'multi' ? 'multi' : 'single';
  const targetStats = state.stats[modeKey];

  if (finalResult === 'win') {
    targetStats.wins += 1;
  } else if (finalResult === 'lose') {
    targetStats.losses += 1;
  } else {
    targetStats.draws += 1;
  }
  saveStats(modeKey);

  const modal = document.getElementById('gameover-modal');
  const badge = document.getElementById('modal-badge');
  const title = document.getElementById('modal-title');
  const reason = document.getElementById('modal-reason');

  badge.className = `modal-badge ${finalResult}`;
  if (finalResult === 'win') {
    badge.textContent = 'VICTORY';
    title.textContent = '🎉 아싸! 이겼다!';
    speakKorean('아싸! 이겼다!');
  } else if (finalResult === 'lose') {
    badge.textContent = 'DEFEAT';
    title.textContent = '😢 분발해라!!';
    speakKorean('분발해라!');
  } else {
    badge.textContent = 'DRAW';
    title.textContent = '🤝 DRAW!';
  }

  reason.textContent = reasonText;

  document.getElementById('modal-my-name').textContent = state.nickname;
  document.getElementById('modal-opp-name').textContent = state.oppNickname;

  const formatStars = (life) => '★'.repeat(life) + '☆'.repeat(MAX_LIFE - life);
  document.getElementById('modal-player-stars').textContent = formatStars(state.player.life);
  document.getElementById('modal-player-life-text').textContent = `LIFE: ${state.player.life}`;
  document.getElementById('modal-opp-stars').textContent = formatStars(state.opp.life);
  document.getElementById('modal-opp-life-text').textContent = `LIFE: ${state.opp.life}`;

  const winrate = calcWinRate(targetStats);
  document.getElementById('modal-mode-label').textContent =
    modeKey === 'multi' ? 'MULTI' : 'SINGLE';
  document.getElementById('modal-record-text').textContent =
    `W:${targetStats.wins} L:${targetStats.losses} D:${targetStats.draws} (${winrate}%)`;

  const playAgainBtn = document.getElementById('btn-play-again');
  const leaveModalBtn = document.getElementById('btn-modal-leave');
  playAgainBtn.textContent = '🔄 다시 한번 더';
  leaveModalBtn.textContent = modeKey === 'multi' ? '🚪 대기실로' : '🏠 MENU';

  modal.classList.remove('hidden');
}

function handleLeaveArena() {
  clearAllTimers();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (state.mode === 'multi') {
    wsSend({ type: 'leave_room' });
    showScreen('lobby');
  } else {
    showScreen('menu');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initHandIllustrations();
  loadAllStats();
  showScreen('menu');

  // 스마트폰 터치 시 오디오 컨텍스트 및 한국어 음성 버퍼 즉시 활성화
  const unlockAudio = () => {
    getAudioContext();
  };
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio, { passive: true });

  document.getElementById('btn-mode-single').addEventListener('click', () => {
    enterSinglePlayMode();
  });

  document.getElementById('btn-mode-multi').addEventListener('click', () => {
    syncNicknameFromInput();
    state.mode = 'multi';
    showScreen('lobby');
    ensureWebSocketConnected();
  });

  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    showScreen('menu');
  });

  document.getElementById('btn-create-room').addEventListener('click', () => {
    syncNicknameFromInput();
    ensureWebSocketConnected();
    const titleInput = document.getElementById('input-room-title');
    const title = titleInput.value.trim() || `${state.nickname}'s ROOM`;
    wsSend({ type: 'create_room', title, nickname: state.nickname });
    titleInput.value = '';
  });

  document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
    ensureWebSocketConnected();
    wsSend({ type: 'get_rooms' });
  });

  document.getElementById('btn-leave-game').addEventListener('click', () => {
    handleLeaveArena();
  });

  document.getElementById('btn-start-game').addEventListener('click', () => {
    handleStartButtonClick();
  });

  ALL_CHOICES.forEach((choice) => {
    document.getElementById(`btn-${choice}`).addEventListener('click', () => {
      handleCardSelect(choice);
    });
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    if (state.mode === 'single') {
      resetSinglePlayToReady();
    } else {
      document.getElementById('gameover-modal').classList.add('hidden');
      wsSend({ type: 'play_again' });
      if (state.room) {
        const startBtn = document.getElementById('btn-start-game');
        startBtn.disabled = !state.room.opp;
        startBtn.textContent = state.room.opp ? '▶ START' : '⏳ WAITING (1/2)';
      }
    }
  });

  document.getElementById('btn-modal-leave').addEventListener('click', () => {
    handleLeaveArena();
  });

  document.getElementById('btn-reset-stats').addEventListener('click', () => {
    const modeKey = state.mode === 'multi' ? 'multi' : 'single';
    state.stats[modeKey] = { wins: 0, losses: 0, draws: 0 };
    saveStats(modeKey);
  });

  const soundBtn = document.getElementById('btn-sound-toggle');
  soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      soundBtn.textContent = '🔊 ON';
      soundBtn.classList.add('sound-on');
    } else {
      soundBtn.textContent = '🔇 OFF';
      soundBtn.classList.remove('sound-on');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  });

  initPwaAndShortcutPrompt();
});

// ==========================================
// PWA 등록 및 바탕화면 바로가기 아이콘 설치 모달
// ==========================================
let deferredInstallPrompt = null;
let installGuideShown = false;

function isRunningStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

async function initPwaAndShortcutPrompt() {
  // 1) Service Worker 등록
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const installModal = document.getElementById('install-modal');
  const confirmBtn = document.getElementById('btn-install-confirm');
  const laterBtn = document.getElementById('btn-install-later');
  const openChipBtn = document.getElementById('btn-open-install');
  const guideBox = document.getElementById('install-guide-box');

  // 이미 설치된 앱 여부 확인 (Web API 지원 브라우저)
  let relatedInstalled = false;
  if ('getInstalledRelatedApps' in navigator) {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (apps && apps.length > 0) {
        relatedInstalled = true;
        localStorage.setItem('rps_shortcut_installed', '1');
      }
    } catch (e) {}
  }

  // 이미 바탕화면 바로가기(standalone)로 실행 중이거나 설치 완료된 경우 상단 설치 버튼 및 팝업 숨김
  if (isRunningStandalone() || relatedInstalled || localStorage.getItem('rps_shortcut_installed') === '1') {
    localStorage.setItem('rps_shortcut_installed', '1');
    localStorage.setItem('rps_visited_once_v1', '1');
    if (openChipBtn) openChipBtn.classList.add('hidden');
    if (installModal) installModal.classList.add('hidden');
    return;
  }

  // 2) 브라우저 기본 PWA 설치 이벤트 가로채기 (Windows Chrome/Edge, Android Chrome 등)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (openChipBtn && localStorage.getItem('rps_shortcut_installed') !== '1') {
      openChipBtn.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem('rps_shortcut_installed', '1');
    localStorage.setItem('rps_visited_once_v1', '1');
    installModal.classList.add('hidden');
    if (openChipBtn) openChipBtn.classList.add('hidden');
  });

  // 3) 최초 1회 접속 시에만 바로가기 설치 팝업창 표시 (2번째 접속부터는 절대 자동 표시 안 함)
  const hasVisitedBefore = localStorage.getItem('rps_visited_once_v1') === '1';
  const alreadyInstalled = localStorage.getItem('rps_shortcut_installed') === '1';

  if (!hasVisitedBefore && !alreadyInstalled) {
    // 첫 접속 기록을 영구 저장하여 2번째 접속부터는 팝업이 뜨지 않게 처리
    localStorage.setItem('rps_visited_once_v1', '1');
    setTimeout(() => {
      openInstallModal();
    }, 450);
  }

  if (openChipBtn) {
    openChipBtn.addEventListener('click', () => {
      openInstallModal();
    });
  }

  if (laterBtn) {
    laterBtn.addEventListener('click', () => {
      localStorage.setItem('rps_visited_once_v1', '1');
      installModal.classList.add('hidden');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (installGuideShown) {
        installModal.classList.add('hidden');
        return;
      }
      localStorage.setItem('rps_visited_once_v1', '1');

      // Case A: 크롬/엣지/안드로이드 네이티브 바탕화면 앱 설치가 준비된 경우 즉시 실행
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          localStorage.setItem('rps_shortcut_installed', '1');
          installModal.classList.add('hidden');
          if (openChipBtn) openChipBtn.classList.add('hidden');
        }
        deferredInstallPrompt = null;
        return;
      }

      // Case B: 브라우저가 자동 설치 팝업을 아직 띄우지 않은 환경
      const ua = navigator.userAgent || '';
      const isAndroid = /Android/i.test(ua);
      const isIOS = /iPhone|iPad|iPod/i.test(ua);

      guideBox.classList.remove('hidden');
      if (isAndroid) {
        guideBox.innerHTML =
          '📱 <strong>안드로이드 바탕화면 추가 방법</strong><br/>' +
          '브라우저 오른쪽 위 메뉴 <strong>[⋮]</strong> (또는 하단 <strong>[≡]</strong>) 버튼을 누른 뒤<br/>' +
          '👉 <strong>[홈 화면에 추가]</strong> 또는 <strong>[앱 설치]</strong>를 누르시면 바탕화면에 귀여운 아이콘이 바로 생성됩니다!';
      } else if (isIOS) {
        guideBox.innerHTML =
          '📱 <strong>아이폰 바탕화면 추가 방법</strong><br/>' +
          '하단 가운데 <strong>[공유(네모+화살표)]</strong> 버튼을 누른 뒤<br/>' +
          '👉 <strong>[홈 화면에 추가]</strong>를 누르시면 바탕화면에 귀여운 아이콘이 생성됩니다!';
      } else {
        // Windows PC 등 데스크톱 환경: 바탕화면용 인터넷 바로가기(.url) 파일 생성 + 주소창 앱 설치 안내
        downloadWindowsShortcutFile();
        localStorage.setItem('rps_shortcut_installed', '1');
        guideBox.innerHTML =
          '💻 <strong>윈도우 바탕화면 바로가기 생성 완료!</strong><br/>' +
          '1) 다운로드된 <strong>[배틀 가위바위보.url]</strong> 파일을 바탕화면으로 옮기시거나,<br/>' +
          '2) 주소창 오른쪽 끝의 <strong>[앱 설치(🖥️+)]</strong> 아이콘을 누르시면 바탕화면에 바로가기가 생성됩니다!';
      }
      installGuideShown = true;
      confirmBtn.textContent = '✅ 확인';
    });
  }
}

function openInstallModal() {
  const installModal = document.getElementById('install-modal');
  const guideBox = document.getElementById('install-guide-box');
  const confirmBtn = document.getElementById('btn-install-confirm');
  if (!installModal) return;

  installGuideShown = false;
  guideBox.classList.add('hidden');
  confirmBtn.textContent = '✨ 바로가기 만들기';
  installModal.classList.remove('hidden');
}

function downloadWindowsShortcutFile() {
  const targetUrl = window.location.origin || 'http://localhost:3000';
  const iconUrl = `${targetUrl}/favicon.ico`;
  const content = `[InternetShortcut]\r\nURL=${targetUrl}\r\nIconFile=${iconUrl}\r\nIconIndex=0\r\n`;
  const blob = new Blob([content], { type: 'application/internet-shortcut' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '배틀 가위바위보.url';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
