// ==========================================
// 배틀 가위바위보 - 싱글플레이 & 온라인 멀티플레이 (game.js)
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

// 전체 상태
const state = {
  screen: 'menu',         // 'menu' | 'lobby' | 'game'
  mode: 'single',         // 'single' | 'multi'
  nickname: '플레이어',
  oppNickname: '컴퓨터(AI)',

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

  // 싱글플레이와 멀티플레이 전적 분리 관리
  stats: {
    single: { wins: 0, losses: 0, draws: 0 },
    multi: { wins: 0, losses: 0, draws: 0 }
  },

  // 멀티플레이 방 정보
  room: null
};

// 타이머 관리
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
// 오디오 & 음성 합성
// ==========================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, durationMs, type = 'sine', volume = 0.16) {
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
      playTone(440, 150, 'triangle', 0.2);
      break;
    case 'chant2':
      playTone(554.37, 150, 'triangle', 0.22);
      break;
    case 'chant3':
      playTone(659.25, 230, 'triangle', 0.26);
      break;
    case 'select':
      playTone(740, 90, 'sine', 0.18);
      break;
    case 'win':
      playTone(523.25, 120, 'sine', 0.2);
      setTimeout(() => playTone(659.25, 120, 'sine', 0.2), 100);
      setTimeout(() => playTone(783.99, 260, 'sine', 0.24), 200);
      break;
    case 'special-hit':
      playTone(220, 150, 'sawtooth', 0.25);
      setTimeout(() => playTone(880, 350, 'sawtooth', 0.28), 120);
      break;
    case 'lose':
    case 'timeout':
      playTone(349.23, 160, 'sawtooth', 0.2);
      setTimeout(() => playTone(233.08, 300, 'sawtooth', 0.22), 150);
      break;
    case 'draw':
      playTone(440, 120, 'sine', 0.15);
      setTimeout(() => playTone(440, 160, 'sine', 0.15), 140);
      break;
    case 'special-full':
      playTone(587.33, 100, 'square', 0.15);
      setTimeout(() => playTone(880, 240, 'square', 0.18), 100);
      break;
  }
}

function speakKorean(text, rate = 1.15, pitch = 1.05) {
  if (!state.soundEnabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = 0.95;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // ignore
  }
}

// ==========================================
// 싱글플레이 / 멀티플레이 전적 분리 저장 및 렌더링
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
    } else {
      // 이전 단일 버전 전적이 있으면 싱글 전적으로 마이그레이션
      const legacy = localStorage.getItem('rps_battle_stats_v1');
      if (legacy) {
        const p = JSON.parse(legacy);
        state.stats.single = {
          wins: Number(p.wins) || 0,
          losses: Number(p.losses) || 0,
          draws: Number(p.draws) || 0
        };
      }
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
  } catch (e) {
    console.warn('전적 불러오기 오류:', e);
  }
  renderAllStatsUI();
}

function saveStats(modeKey) {
  try {
    if (modeKey === 'single') {
      localStorage.setItem('rps_stats_single_v2', JSON.stringify(state.stats.single));
    } else {
      localStorage.setItem('rps_stats_multi_v2', JSON.stringify(state.stats.multi));
    }
  } catch (e) {
    console.warn('전적 저장 오류:', e);
  }
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

  // 1) 메인 시작 화면 요약
  document.getElementById('menu-single-record').textContent =
    `싱글 전적 : ${s.wins}승 ${s.losses}패 ${s.draws}무 (승률 ${sRate}%)`;
  document.getElementById('menu-multi-record').textContent =
    `멀티 전적 : ${m.wins}승 ${m.losses}패 ${m.draws}무 (승률 ${mRate}%)`;

  // 2) 멀티플레이 대기실 상단 바
  document.getElementById('lobby-wins').textContent = m.wins;
  document.getElementById('lobby-losses').textContent = m.losses;
  document.getElementById('lobby-draws').textContent = m.draws;
  document.getElementById('lobby-winrate').textContent = mRate;

  // 3) 게임 화면 상단 바 (현재 선택된 모드의 전적 표시)
  const activeRecord = state.mode === 'multi' ? m : s;
  const activeRate = state.mode === 'multi' ? mRate : sRate;
  document.getElementById('stat-wins').textContent = activeRecord.wins;
  document.getElementById('stat-losses').textContent = activeRecord.losses;
  document.getElementById('stat-draws').textContent = activeRecord.draws;
  document.getElementById('stat-winrate').textContent = activeRate;
}

// ==========================================
// 화면 전환 ('menu' | 'lobby' | 'game')
// ==========================================
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
  const val = (input ? input.value : '').trim() || '플레이어';
  state.nickname = val.slice(0, 16);
  try {
    localStorage.setItem('rps_player_nickname', state.nickname);
  } catch (e) {}
}

// ==========================================
// WebSocket 클라이언트 (멀티플레이 대기실 & 방 통신)
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

  updateWsBadge('connecting', '서버 연결 중...');
  const wsUrl =
    window.location.protocol === 'file:'
      ? 'ws://localhost:3000'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    updateWsBadge('disconnected', '서버 연결 실패 (node server.js 실행 필요)');
    return;
  }

  ws.onopen = () => {
    updateWsBadge('connected', '🟢 온라인 연결됨');
    wsSend({ type: 'set_nickname', nickname: state.nickname });
    wsSend({ type: 'get_rooms' });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.warn('서버 메시지 파싱 오류:', e);
    }
  };

  ws.onclose = () => {
    updateWsBadge('disconnected', '🔴 서버 연결 끊김 (node server.js 확인)');
  };

  ws.onerror = () => {
    updateWsBadge('disconnected', '🔴 서버 연결 실패 (node server.js 실행 필요)');
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
      alert(msg.message || '오류가 발생했습니다.');
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
      const oppDesc = document.getElementById('opp-screen-desc');
      if (oppDesc) {
        oppDesc.textContent = '⚡ 상대방이 카드를 선택했습니다! "가위 바위 보" 종료 시 공개됩니다.';
      }
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
        subtextEl.textContent = `🔄 상대방(${msg.nickname})이 [다시 한번 더]를 눌렀습니다! [시작]을 누르면 재대결이 시작됩니다!`;
      }
      break;
    }

    case 'opponent_left_during_match':
      clearAllTimers();
      alert(msg.message || '상대방이 퇴장했습니다.');
      break;
  }
}

function renderLobbyRoomList(rooms) {
  const container = document.getElementById('room-list-container');
  const countText = document.getElementById('room-count-text');
  countText.textContent = `총 ${rooms.length}개 방`;

  if (rooms.length === 0) {
    container.innerHTML =
      '<div class="empty-room-msg">현재 생성된 방이 없습니다. 상단에서 [➕ 방 만들기]를 눌러 새 방을 만들어 보세요!</div>';
    return;
  }

  container.innerHTML = '';
  rooms.forEach((r) => {
    const isFull = r.playerCount >= r.maxPlayers || r.status === 'playing';
    const item = document.createElement('div');
    item.className = 'room-item';

    const statusLabel =
      r.status === 'playing'
        ? `대결 중 (${r.playerCount}/${r.maxPlayers})`
        : isFull
        ? `입장 완료 (${r.playerCount}/${r.maxPlayers})`
        : `대기 중 (${r.playerCount}/${r.maxPlayers})`;

    item.innerHTML = `
      <div class="room-info">
        <div class="room-title">${escapeHtml(r.title)}</div>
        <div class="room-meta">방장 : <strong>${escapeHtml(r.hostName)}</strong></div>
      </div>
      <div class="room-actions">
        <span class="room-status-pill ${isFull ? 'full' : 'open'}">${statusLabel}</span>
        <button class="btn-join-room" type="button" ${isFull ? 'disabled' : ''}>
          ${isFull ? '입장 불가' : '입장하기 ▶'}
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
// 멀티플레이 방 입장 및 대결 동기화
// ==========================================
function handleMultiplayerRoomUpdate(room) {
  state.mode = 'multi';
  state.room = room;
  if (state.screen !== 'game') {
    showScreen('game');
    initMiniDecks();
  }

  const modeBadge = document.getElementById('game-mode-badge');
  modeBadge.textContent = `🌐 멀티플레이 (${room.title})`;
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
    // 상대방 대기 중 (1/2)
    state.oppNickname = '대기 중...';
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

    document.getElementById('opp-name-label').textContent = `👤 상대방 대기 중 :`;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 상대방 입장 대기 중 (1/2)';
    chantEl.innerHTML = '상대방이 대기실에서 이 방에 입장하면 <strong>[시작]</strong> 버튼이 활성화됩니다.';
    subtextEl.textContent = '다른 브라우저 탭이나 다른 기기에서 대기실의 이 방을 선택해 입장해 보세요!';
  } else {
    // 2명 입장 완료!
    state.oppNickname = room.opp.nickname;
    state.opp.life = room.opp.life;
    state.opp.special = room.opp.special;
    state.opp.streak = room.opp.streak;
    state.opp.totalCards = room.opp.totalCards;

    document.getElementById('opp-name-label').textContent = `👤 ${state.oppNickname} 생명 :`;

    if (room.status === 'ready') {
      state.isRunning = false;
      state.canSelect = false;
      state.isGameOver = false;
      initMiniDecks();
      startBtn.disabled = false;
      startBtn.textContent = '▶ 시작 (대결 스타트!)';
      chantEl.innerHTML = `상대방(<strong>${escapeHtml(state.oppNickname)}</strong>) 입장 완료! <strong>[시작]</strong> 버튼을 누르면 대결이 시작됩니다!`;
      subtextEl.textContent = '시작을 누르면 양쪽 화면에 동시에 "가위 바위 보"가 진행됩니다!';
      document.getElementById('opp-hand-Visual').innerHTML = '<span class="question-mark">❓</span>';
      document.getElementById('opp-hand-name').textContent = `${state.oppNickname} 준비 완료`;
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
  startBtn.textContent = '⚡ 실시간 대결 진행 중...';

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

  document.getElementById('status-subtext').textContent =
    `✅ [${CHOICE_META[choice].name}] 카드 선택 완료! "가위 바위 보" 종료 시 결과가 공개됩니다...`;
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
  state.opp.totalCards = msg.opp.totalCards;

  document.getElementById('timer-bar-wrap').classList.add('hidden');
  const oppScreen = document.getElementById('opponent-screen');
  const oppVisual = document.getElementById('opp-hand-Visual');
  const oppName = document.getElementById('opp-hand-name');
  const oppDesc = document.getElementById('opp-screen-desc');
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
      oppName.textContent = '나의 시간 초과! (미선택)';
      oppDesc.textContent = '"가위 바위 보"가 끝나기 전에 선택하지 못해 내 생명 게이지만 1칸 감소합니다.';
      resultOverlay.classList.add('lose');
      resultTitle.textContent = '시간 초과 (1패)';
      resultDetail.textContent = '내 생명 게이지 -1칸 감소';
      chantEl.innerHTML = '<strong>시간 초과!</strong> 제때 선택하지 못해 내 생명 게이지가 1칸 줄어듭니다.';
    } else if (msg.outcome === 'timeout_opp') {
      oppName.textContent = `${state.oppNickname} 시간 초과!`;
      oppDesc.textContent = '상대방이 시간 내에 카드를 선택하지 못해 상대 생명 게이지가 1칸 감소합니다.';
      resultOverlay.classList.add('win');
      resultTitle.textContent = '상대 시간 초과!';
      resultDetail.textContent = '상대 생명 게이지 -1칸 감소';
      chantEl.innerHTML = `<strong>상대 시간 초과!</strong> 상대방(${escapeHtml(state.oppNickname)})의 생명 게이지가 1칸 줄어듭니다.`;
    } else {
      oppName.textContent = '양쪽 모두 시간 초과!';
      oppDesc.textContent = '양쪽 모두 시간 내에 선택하지 못해 각자 생명 게이지가 1칸씩 감소합니다.';
      resultOverlay.classList.add('lose');
      resultTitle.textContent = '동시 시간 초과';
      resultDetail.textContent = '양쪽 생명 게이지 -1칸씩 감소';
      chantEl.innerHTML = '<strong>동시 시간 초과!</strong> 양쪽 모두 생명 게이지가 1칸씩 줄어듭니다.';
    }
  } else {
    const myChoice = msg.myChoice;
    const oppChoice = msg.oppChoice;
    oppVisual.innerHTML = HAND_SVGS[oppChoice];
    oppName.textContent = `${state.oppNickname} 선택 : ${CHOICE_META[oppChoice].name}!`;
    oppDesc.textContent = `나의 선택 [${CHOICE_META[myChoice].name}] vs ${state.oppNickname} 선택 [${CHOICE_META[oppChoice].name}]`;

    if (msg.outcome === 'win') {
      const dmg = prevOppLife - state.opp.life;
      playSoundEffect(dmg >= 3 && prevPlayerSpecial >= MAX_SPECIAL ? 'special-hit' : 'win');
      resultOverlay.classList.add('win');
      resultTitle.textContent = `라운드 승리! (${msg.reason})`;
      resultDetail.textContent = `상대 생명 게이지 -${dmg}칸 감소!`;
      chantEl.innerHTML = `<strong>승리!</strong> [${CHOICE_META[myChoice].name}]로 [${CHOICE_META[oppChoice].name}]를 이겼습니다! (${msg.reason})`;
    } else if (msg.outcome === 'lose') {
      const dmg = prevPlayerLife - state.player.life;
      playSoundEffect(dmg >= 3 && prevOppSpecial >= MAX_SPECIAL ? 'special-hit' : 'lose');
      resultOverlay.classList.add('lose');
      resultTitle.textContent = `라운드 패배 (${msg.reason})`;
      resultDetail.textContent = `내 생명 게이지 -${dmg}칸 감소 / 내 필살기 +1`;
      chantEl.innerHTML = `<strong>패배...</strong> 상대의 [${CHOICE_META[oppChoice].name}]에게 졌습니다. (내 생명 -${dmg}, 필살기 +1)`;
    } else {
      playSoundEffect('draw');
      resultOverlay.classList.add('draw');
      resultTitle.textContent = '비겼습니다!';
      resultDetail.textContent = '양쪽 필살기 게이지 +1칸 상승';
      chantEl.innerHTML = `<strong>무승부!</strong> 같은 [${CHOICE_META[myChoice].name}]를 내서 양쪽 필살기 게이지가 1칸씩 올라갑니다.`;
    }
  }

  if (
    (prevPlayerSpecial < MAX_SPECIAL && state.player.special === MAX_SPECIAL) ||
    (prevOppSpecial < MAX_SPECIAL && state.opp.special === MAX_SPECIAL)
  ) {
    setTimeout(() => playSoundEffect('special-full'), 260);
  }

  updateAllUI(prevPlayerLife, prevOppLife);

  // 아직 게임이 끝나지 않았다면 5초 카운트다운 표시
  const playerRemaining =
    state.player.cards.scissors + state.player.cards.paper + state.player.cards.rock;
  if (state.player.life > 0 && state.opp.life > 0 && !(playerRemaining === 0 && state.opp.totalCards === 0)) {
    startCountdownTextOnly();
  }
}

function startCountdownTextOnly() {
  const subtextEl = document.getElementById('status-subtext');
  const totalSec = Math.floor(NEXT_ROUND_DELAY_MS / 1000);
  subtextEl.textContent = `⏳ ${totalSec}초 후 다음 "가위 바위 보" 라운드가 자동으로 시작됩니다... (${totalSec}초)`;

  for (let sec = 1; sec < totalSec; sec++) {
    const remainingSec = totalSec - sec;
    registerTimeout(() => {
      if (!state.isGameOver && state.isRunning) {
        subtextEl.textContent = `⏳ 잠시 후 다음 "가위 바위 보" 라운드가 시작됩니다... (${remainingSec}초)`;
      }
    }, sec * 1000);
  }
}

// ==========================================
// 공용 UI 렌더링 및 "가위 바위 보" 연출
// ==========================================
function initHandIllustrations() {
  document.getElementById('svg-scissors').innerHTML = HAND_SVGS.scissors;
  document.getElementById('svg-paper').innerHTML = HAND_SVGS.paper;
  document.getElementById('svg-rock').innerHTML = HAND_SVGS.rock;
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
      mini.title = `${CHOICE_META[choice].name} 카드 #${i + 1}`;
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
    const bonusDmg = streakCount >= 3 ? 3 : 2;
    badge.textContent = `🔥 ${streakCount}연승 중! (승리 시 -${bonusDmg})`;
    badge.classList.remove('hidden');
  } else if (streakCount === 1) {
    badge.textContent = `1승 중 (연승 시 -2)`;
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
  });

  const oppTotal =
    state.mode === 'multi'
      ? state.opp.totalCards
      : state.opp.cards.scissors + state.opp.cards.paper + state.opp.cards.rock;

  document.getElementById('player-total-cards').textContent = playerTotal;
  document.getElementById('opp-total-cards').textContent = oppTotal;
  document.getElementById('round-indicator').textContent = `ROUND ${state.round}`;
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

// "가위, 바위, 보!" 화면/음성/상대 화면 순환 공용 연출
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
  const oppDesc = document.getElementById('opp-screen-desc');

  subtextEl.textContent = '🚨 지금 "가위, 바위, 보"가 끝나기 전에 아래 카드를 클릭하세요!';

  timerWrap.classList.remove('hidden');
  timerFill.style.transition = 'none';
  timerFill.style.transform = 'scaleX(1)';
  void timerFill.offsetWidth;
  timerFill.style.transition = `transform ${totalMs}ms linear`;
  timerFill.style.transform = 'scaleX(0)';

  oppScreen.classList.add('cycling');
  oppDesc.textContent = '가위, 바위, 보가 끝나기 전에 카드를 선택하세요!';

  let cycleIdx = 0;
  cycleIntervalId = setInterval(() => {
    const current = ALL_CHOICES[cycleIdx % 3];
    oppVisual.innerHTML = HAND_SVGS[current];
    oppName.textContent = `${CHOICE_META[current].name} ...`;
    cycleIdx++;
  }, 85);

  const setChantStep = (word, soundKey) => {
    chantEl.classList.remove('shouting');
    void chantEl.offsetWidth;
    chantEl.classList.add('shouting');
    chantEl.textContent = word;
    playSoundEffect(soundKey);
  };

  const stepMs = Math.floor(totalMs / 3);
  speakKorean('가위, 바위, 보');
  setChantStep('가위!', 'chant1');

  registerTimeout(() => {
    setChantStep('바위!', 'chant2');
  }, stepMs);

  registerTimeout(() => {
    setChantStep('보!', 'chant3');
  }, stepMs * 2);
}

// ==========================================
// 싱글플레이 전용 로직 (컴퓨터 AI 대전)
// ==========================================
function enterSinglePlayMode() {
  syncNicknameFromInput();
  state.mode = 'single';
  state.oppNickname = '컴퓨터(AI)';

  const modeBadge = document.getElementById('game-mode-badge');
  modeBadge.textContent = '🤖 싱글플레이';
  modeBadge.className = 'mode-tag';

  document.getElementById('my-name-display').textContent = state.nickname;
  document.getElementById('opp-name-label').textContent = '🤖 상대(AI) 생명 :';

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
  startBtn.textContent = '▶ 시작 (대결 스타트!)';

  document.getElementById('status-subtext').textContent =
    '시작을 누르면 "가위 바위 보"가 끝날 때까지 카드를 선택해야 합니다! (미선택 시 내 생명 -1)';

  document.getElementById('opp-hand-Visual').innerHTML = '<span class="question-mark">❓</span>';
  document.getElementById('opp-hand-name').textContent = '상대편 대기 중';
  document.getElementById('opp-screen-desc').textContent =
    '가위, 바위, 보가 계속 빠르게 바뀌다가 상대편 선택이 최종적으로 보입니다.';

  const chantEl = document.getElementById('chant-text');
  chantEl.classList.remove('shouting');
  chantEl.innerHTML = '<strong>[시작]</strong> 버튼을 누르면 "가위, 바위, 보!"가 시작됩니다!';

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
  const oppDesc = document.getElementById('opp-screen-desc');
  const chantEl = document.getElementById('chant-text');
  const resultOverlay = document.getElementById('round-result-overlay');
  const resultTitle = document.getElementById('round-result-title');
  const resultDetail = document.getElementById('round-result-detail');

  oppScreen.classList.remove('cycling');
  chantEl.classList.remove('shouting');

  // 미선택 시간 초과 -> 내 생명 게이지만 1칸 감소
  if (!state.selectedChoice) {
    const prevPlayerLife = state.player.life;
    state.player.life = Math.max(0, state.player.life - 1);
    state.player.streak = 0;

    playSoundEffect('timeout');

    oppVisual.innerHTML = '<span class="question-mark">⏰</span>';
    oppName.textContent = '시간 초과! (미선택)';
    oppDesc.textContent = '"가위 바위 보"가 끝나기 전에 선택하지 못해 내 생명 게이지가 1칸 감소합니다.';

    resultOverlay.className = 'round-result-overlay lose';
    resultTitle.textContent = '시간 초과 (1패)';
    resultDetail.textContent = '내 생명 게이지 -1칸 감소';
    chantEl.innerHTML = '<strong>시간 초과!</strong> 제때 선택하지 못해 내 생명 게이지가 1칸 줄어듭니다.';

    updateAllUI(prevPlayerLife, state.opp.life);
    checkSinglePlayEndOrScheduleNext();
    return;
  }

  const playerChoice = state.selectedChoice;
  const oppChoice = pickOpponentCardSingle();

  state.player.cards[playerChoice] -= 1;
  state.opp.cards[oppChoice] -= 1;

  oppVisual.innerHTML = HAND_SVGS[oppChoice];
  oppName.textContent = `상대편 선택 : ${CHOICE_META[oppChoice].name}!`;
  oppDesc.textContent = `나의 선택 [${CHOICE_META[playerChoice].name}] vs 상대편 선택 [${CHOICE_META[oppChoice].name}]`;

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
    let damageReason = '기본 승리';
    if (state.player.special >= MAX_SPECIAL) {
      damage = 3;
      damageReason = '⚡ 필살기 발동!';
      state.player.special = 0;
      playSoundEffect('special-hit');
    } else {
      if (state.player.streak === 2) {
        damage = 2;
        damageReason = '🔥 2연승 보너스!';
      } else if (state.player.streak >= 3) {
        damage = 3;
        damageReason = `🔥🔥 ${state.player.streak}연승 보너스!`;
      }
      playSoundEffect('win');
    }

    state.opp.life = Math.max(0, state.opp.life - damage);
    state.opp.special = Math.min(MAX_SPECIAL, state.opp.special + 1);

    resultOverlay.classList.add('win');
    resultTitle.textContent = `라운드 승리! (${damageReason})`;
    resultDetail.textContent = `상대 생명 게이지 -${damage}칸 감소!`;
    chantEl.innerHTML = `<strong>승리!</strong> [${CHOICE_META[playerChoice].name}]로 [${CHOICE_META[oppChoice].name}]를 이겼습니다! (${damageReason} ➔ 상대 생명 -${damage})`;
  } else if (outcome === 'lose') {
    state.opp.streak += 1;
    state.player.streak = 0;

    let damage = 1;
    let damageReason = '라운드 패배';
    if (state.opp.special >= MAX_SPECIAL) {
      damage = 3;
      damageReason = '⚠️ 상대 필살기 발동!';
      state.opp.special = 0;
      playSoundEffect('special-hit');
    } else {
      if (state.opp.streak === 2) {
        damage = 2;
        damageReason = '상대 2연승!';
      } else if (state.opp.streak >= 3) {
        damage = 3;
        damageReason = `상대 ${state.opp.streak}연승!`;
      }
      playSoundEffect('lose');
    }

    state.player.life = Math.max(0, state.player.life - damage);
    state.player.special = Math.min(MAX_SPECIAL, state.player.special + 1);

    resultOverlay.classList.add('lose');
    resultTitle.textContent = `라운드 패배 (${damageReason})`;
    resultDetail.textContent = `내 생명 게이지 -${damage}칸 감소 / 내 필살기 +1`;
    chantEl.innerHTML = `<strong>패배...</strong> 상대의 [${CHOICE_META[oppChoice].name}]에게 졌습니다. (내 생명 -${damage}, 필살기 게이지 +1)`;
  } else {
    state.player.streak = 0;
    state.opp.streak = 0;
    state.player.special = Math.min(MAX_SPECIAL, state.player.special + 1);
    state.opp.special = Math.min(MAX_SPECIAL, state.opp.special + 1);
    playSoundEffect('draw');

    resultOverlay.classList.add('draw');
    resultTitle.textContent = '비겼습니다!';
    resultDetail.textContent = '양쪽 필살기 게이지 +1칸 상승';
    chantEl.innerHTML = `<strong>무승부!</strong> 같은 [${CHOICE_META[playerChoice].name}]를 내서 양쪽 필살기 게이지가 1칸씩 올라갑니다.`;
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
        finishGame('win', '상대편의 생명 게이지가 0이 되어 게임에서 승리했습니다!');
      } else {
        finishGame('lose', '나의 생명 게이지가 0이 되어 게임에서 패배했습니다.');
      }
    }, 900);
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
          `양쪽 모두 9장의 카드를 모두 사용했습니다! 남은 생명 게이지가 더 많아(나: ${state.player.life}칸 vs 상대: ${state.opp.life}칸) 승리했습니다!`
        );
      } else if (state.player.life < state.opp.life) {
        finishGame(
          'lose',
          `양쪽 모두 9장의 카드를 모두 사용했습니다. 남은 생명 게이지가 더 적어(나: ${state.player.life}칸 vs 상대: ${state.opp.life}칸) 패배했습니다.`
        );
      } else {
        finishGame(
          'draw',
          `대결하는 2명 모두 가위(3장), 바위(3장), 보(3장)를 모두 사용했고, 남은 생명 게이지가 ${state.player.life}칸으로 같아 이 게임은 무승부로 끝납니다!`
        );
      }
    }, 950);
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
// 공용 버튼 핸들러 (시작 / 카드 선택 / 종료 모달)
// ==========================================
function handleStartButtonClick() {
  getAudioContext();
  if (state.mode === 'single') {
    if (state.isRunning || state.isGameOver) return;
    state.isRunning = true;
    const startBtn = document.getElementById('btn-start-game');
    startBtn.disabled = true;
    startBtn.textContent = '⚡ 대결 진행 중...';
    beginSinglePlayRound();
  } else {
    // 멀티플레이
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
    document.getElementById('status-subtext').textContent =
      `✅ [${CHOICE_META[choice].name}] 카드 선택 완료! 결과를 확인합니다...`;
  } else {
    // 멀티플레이 서버로 전송
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
    title.textContent = '🎉 게임 승리!';
  } else if (finalResult === 'lose') {
    badge.textContent = 'DEFEAT';
    title.textContent = '😢 게임 패배';
  } else {
    badge.textContent = 'DRAW GAME';
    title.textContent = '🤝 무승부!';
  }

  reason.textContent = reasonText;

  document.getElementById('modal-my-name').textContent = `나 (${state.nickname})`;
  document.getElementById('modal-opp-name').textContent = state.oppNickname;

  const formatStars = (life) => '★'.repeat(life) + '☆'.repeat(MAX_LIFE - life);
  document.getElementById('modal-player-stars').textContent = formatStars(state.player.life);
  document.getElementById('modal-player-life-text').textContent = `남은 생명 게이지: ${state.player.life}칸`;
  document.getElementById('modal-opp-stars').textContent = formatStars(state.opp.life);
  document.getElementById('modal-opp-life-text').textContent = `남은 생명 게이지: ${state.opp.life}칸`;

  const winrate = calcWinRate(targetStats);
  document.getElementById('modal-mode-label').textContent =
    modeKey === 'multi' ? '멀티플레이' : '싱글플레이';
  document.getElementById('modal-record-text').textContent =
    `${targetStats.wins}승 ${targetStats.losses}패 ${targetStats.draws}무 (승률 ${winrate}%)`;

  const playAgainBtn = document.getElementById('btn-play-again');
  const leaveModalBtn = document.getElementById('btn-modal-leave');
  playAgainBtn.textContent = '🔄 다시 한번 더';
  leaveModalBtn.textContent = modeKey === 'multi' ? '🚪 대기실로' : '🏠 메인 화면으로';

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

// ==========================================
// 초기 이벤트 바인딩
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initHandIllustrations();
  loadAllStats();
  showScreen('menu');

  // 메인 화면 -> 싱글플레이 선택
  document.getElementById('btn-mode-single').addEventListener('click', () => {
    enterSinglePlayMode();
  });

  // 메인 화면 -> 멀티플레이 대기실 선택
  document.getElementById('btn-mode-multi').addEventListener('click', () => {
    syncNicknameFromInput();
    state.mode = 'multi';
    showScreen('lobby');
    ensureWebSocketConnected();
  });

  // 대기실 -> 메인 화면으로 돌아가기
  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    showScreen('menu');
  });

  // 대기실 -> 방 만들기
  document.getElementById('btn-create-room').addEventListener('click', () => {
    syncNicknameFromInput();
    ensureWebSocketConnected();
    const titleInput = document.getElementById('input-room-title');
    const title = titleInput.value.trim() || `${state.nickname}님의 대결방`;
    wsSend({ type: 'create_room', title, nickname: state.nickname });
    titleInput.value = '';
  });

  // 대기실 -> 방 목록 새로고침
  document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
    ensureWebSocketConnected();
    wsSend({ type: 'get_rooms' });
  });

  // 경기장 -> 나가기
  document.getElementById('btn-leave-game').addEventListener('click', () => {
    handleLeaveArena();
  });

  // 경기장 -> 시작 버튼
  document.getElementById('btn-start-game').addEventListener('click', () => {
    handleStartButtonClick();
  });

  // 경기장 -> 가위/보/바위 카드 선택
  ALL_CHOICES.forEach((choice) => {
    document.getElementById(`btn-${choice}`).addEventListener('click', () => {
      handleCardSelect(choice);
    });
  });

  // 모달 -> 다시 한번 더
  document.getElementById('btn-play-again').addEventListener('click', () => {
    if (state.mode === 'single') {
      resetSinglePlayToReady();
    } else {
      document.getElementById('gameover-modal').classList.add('hidden');
      wsSend({ type: 'play_again' });
      if (state.room) {
        const startBtn = document.getElementById('btn-start-game');
        startBtn.disabled = !state.room.opp;
        startBtn.textContent = state.room.opp ? '▶ 시작 (재대결 스타트!)' : '⏳ 상대방 입장 대기 중 (1/2)';
      }
    }
  });

  // 모달 -> 나가기
  document.getElementById('btn-modal-leave').addEventListener('click', () => {
    handleLeaveArena();
  });

  // 현재 모드 전적 초기화
  document.getElementById('btn-reset-stats').addEventListener('click', () => {
    const modeKey = state.mode === 'multi' ? 'multi' : 'single';
    state.stats[modeKey] = { wins: 0, losses: 0, draws: 0 };
    saveStats(modeKey);
  });

  // 소리 켜기/끄기
  const soundBtn = document.getElementById('btn-sound-toggle');
  soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      soundBtn.textContent = '🔊 소리 켜짐';
      soundBtn.classList.add('sound-on');
    } else {
      soundBtn.textContent = '🔇 소리 꺼짐';
      soundBtn.classList.remove('sound-on');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  });
});
