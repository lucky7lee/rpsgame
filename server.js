// ==========================================
// 배틀 가위바위보 - 온라인 멀티플레이 & 웹 서버 (server.js)
// 별도 패키지 설치 없이 `node server.js`로 즉시 실행 가능
// ==========================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;

const CHOICE_META = {
  scissors: { name: '가위', beats: 'paper' },
  paper: { name: '보', beats: 'rock' },
  rock: { name: '바위', beats: 'scissors' }
};

const MAX_LIFE = 5;
const MAX_SPECIAL = 3;
const INITIAL_CARDS = 3;
const CHANT_TOTAL_MS = 1800;      // "가위(600) 바위(600) 보(600)" 1.8초
const NEXT_ROUND_DELAY_MS = 5000; // 다음 라운드까지 5초 텀

// 정적 파일 MIME 타입
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// HTTP 정적 파일 서버
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
    return;
  }
  if (reqPath === '/') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

// ==========================================
// 경량 RFC 6455 WebSocket 구현
// ==========================================
const clients = new Map(); // clientId -> clientObj
const rooms = new Map();   // roomId -> roomObj
let nextClientId = 1;
let nextRoomId = 1;

function encodeWsFrame(dataStr) {
  const payload = Buffer.from(dataStr, 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function sendJson(client, obj) {
  if (!client || !client.socket || client.socket.destroyed) return;
  try {
    const frame = encodeWsFrame(JSON.stringify(obj));
    client.socket.write(frame);
  } catch (e) {
    // ignore socket write error
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ];
  socket.write(headers.join('\r\n'));

  const clientId = String(nextClientId++);
  const client = {
    id: clientId,
    nickname: `플레이어${clientId}`,
    socket,
    roomId: null,
    buffer: Buffer.alloc(0)
  };
  clients.set(clientId, client);

  sendJson(client, { type: 'welcome', clientId, rooms: getPublicRoomList() });

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    processBuffer(client);
  });

  socket.on('close', () => handleDisconnect(client));
  socket.on('error', () => handleDisconnect(client));
});

function processBuffer(client) {
  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (client.buffer.length < 4) return;
      payloadLen = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (client.buffer.length < 10) return;
      payloadLen = Number(client.buffer.readBigUInt64BE(2));
      offset = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    const totalFrameLen = offset + maskLen + payloadLen;
    if (client.buffer.length < totalFrameLen) return;

    let payload = client.buffer.subarray(offset + maskLen, totalFrameLen);
    if (isMasked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      const unmasked = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    client.buffer = client.buffer.subarray(totalFrameLen);

    if (opcode === 0x8) {
      // Close frame
      client.socket.end();
      handleDisconnect(client);
      return;
    } else if (opcode === 0x9) {
      // Ping -> Pong
      const pong = Buffer.from([0x8a, 0x00]);
      client.socket.write(pong);
    } else if (opcode === 0x1) {
      // Text frame
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        handleClientMessage(client, msg);
      } catch (e) {
        console.warn('Invalid JSON from client:', e);
      }
    }
  }
}

// ==========================================
// 대기실(Lobby) 및 방(Room) 관리 로직
// ==========================================
function getPublicRoomList() {
  const list = [];
  for (const room of rooms.values()) {
    list.push({
      id: room.id,
      title: room.title,
      hostName: room.players[0] ? room.players[0].nickname : '-',
      playerCount: room.players.length,
      maxPlayers: 2,
      status: room.status // 'waiting' | 'ready' | 'playing'
    });
  }
  return list;
}

function broadcastRoomList() {
  const roomList = getPublicRoomList();
  for (const c of clients.values()) {
    if (!c.roomId) {
      sendJson(c, { type: 'room_list', rooms: roomList });
    }
  }
}

function createInitialPlayerState(client) {
  return {
    id: client.id,
    nickname: client.nickname,
    life: MAX_LIFE,
    special: 0,
    streak: 0,
    cards: { scissors: INITIAL_CARDS, paper: INITIAL_CARDS, rock: INITIAL_CARDS },
    selectedChoice: null
  };
}

function clearRoomTimers(room) {
  if (!room) return;
  if (room.chantTimer) {
    clearTimeout(room.chantTimer);
    room.chantTimer = null;
  }
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }
}

function resetRoomMatchState(room) {
  clearRoomTimers(room);
  room.round = 1;
  room.status = room.players.length === 2 ? 'ready' : 'waiting';
  room.canSelect = false;
  room.playerStates = {};
  for (const p of room.players) {
    room.playerStates[p.id] = createInitialPlayerState(p);
  }
}

function sendRoomStateToPlayers(room) {
  for (const p of room.players) {
    const opp = room.players.find((other) => other.id !== p.id) || null;
    const myState = room.playerStates[p.id];
    const oppState = opp ? room.playerStates[opp.id] : null;

    sendJson(p, {
      type: 'room_update',
      room: {
        id: room.id,
        title: room.title,
        status: room.status,
        round: room.round,
        hostId: room.players[0] ? room.players[0].id : null,
        me: myState
          ? {
              id: myState.id,
              nickname: myState.nickname,
              life: myState.life,
              special: myState.special,
              streak: myState.streak,
              cards: myState.cards
            }
          : null,
        opp: oppState
          ? {
              id: oppState.id,
              nickname: oppState.nickname,
              life: oppState.life,
              special: oppState.special,
              streak: oppState.streak,
              totalCards:
                oppState.cards.scissors + oppState.cards.paper + oppState.cards.rock
            }
          : null
      }
    });
  }
}

function handleClientMessage(client, msg) {
  switch (msg.type) {
    case 'set_nickname': {
      const clean = String(msg.nickname || '').trim().slice(0, 16);
      if (clean) client.nickname = clean;
      sendJson(client, { type: 'room_list', rooms: getPublicRoomList() });
      break;
    }

    case 'get_rooms': {
      sendJson(client, { type: 'room_list', rooms: getPublicRoomList() });
      break;
    }

    case 'create_room': {
      if (client.roomId) leaveCurrentRoom(client);
      if (msg.nickname) {
        const clean = String(msg.nickname).trim().slice(0, 16);
        if (clean) client.nickname = clean;
      }
      const roomTitle = String(msg.title || `${client.nickname}님의 대결방`).trim().slice(0, 28);
      const roomId = `room_${nextRoomId++}`;
      const room = {
        id: roomId,
        title: roomTitle,
        players: [client],
        status: 'waiting',
        round: 1,
        canSelect: false,
        playerStates: {},
        chantTimer: null,
        nextRoundTimer: null
      };
      client.roomId = roomId;
      rooms.set(roomId, room);
      resetRoomMatchState(room);

      sendRoomStateToPlayers(room);
      broadcastRoomList();
      break;
    }

    case 'join_room': {
      if (client.roomId) leaveCurrentRoom(client);
      if (msg.nickname) {
        const clean = String(msg.nickname).trim().slice(0, 16);
        if (clean) client.nickname = clean;
      }
      const room = rooms.get(msg.roomId);
      if (!room) {
        sendJson(client, { type: 'error', message: '존재하지 않는 방입니다.' });
        sendJson(client, { type: 'room_list', rooms: getPublicRoomList() });
        return;
      }
      if (room.players.length >= 2) {
        sendJson(client, { type: 'error', message: '이미 인원이 가득 찬 방입니다.' });
        sendJson(client, { type: 'room_list', rooms: getPublicRoomList() });
        return;
      }

      room.players.push(client);
      client.roomId = room.id;
      resetRoomMatchState(room);

      sendRoomStateToPlayers(room);
      broadcastRoomList();
      break;
    }

    case 'leave_room': {
      leaveCurrentRoom(client);
      sendJson(client, { type: 'left_room', rooms: getPublicRoomList() });
      break;
    }

    case 'start_match': {
      const room = rooms.get(client.roomId);
      if (!room || room.players.length < 2) return;
      if (room.status === 'playing') return;

      resetRoomMatchState(room);
      room.status = 'playing';
      broadcastRoomList();
      startMultiplayerRound(room);
      break;
    }

    case 'play_again': {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (room.status !== 'playing') {
        resetRoomMatchState(room);
        sendRoomStateToPlayers(room);
      }
      const opp = room.players.find((other) => other.id !== client.id);
      if (opp) {
        sendJson(opp, {
          type: 'rematch_requested',
          nickname: client.nickname
        });
      }
      break;
    }

    case 'select_card': {
      const room = rooms.get(client.roomId);
      if (!room || room.status !== 'playing' || !room.canSelect) return;

      const pState = room.playerStates[client.id];
      const choice = msg.choice;
      if (!pState || pState.selectedChoice) return;
      if (!CHOICE_META[choice] || pState.cards[choice] <= 0) return;

      pState.selectedChoice = choice;
      sendJson(client, { type: 'card_locked', choice });

      // 상대방에게 "상대방이 선택을 마쳤습니다" 알림(선택 종류는 비공개)
      const opp = room.players.find((other) => other.id !== client.id);
      if (opp) {
        sendJson(opp, { type: 'opp_locked' });
      }
      break;
    }
  }
}

// ==========================================
// 멀티플레이 라운드 진행 & 판정
// ==========================================
function startMultiplayerRound(room) {
  if (!rooms.has(room.id) || room.players.length < 2) return;
  clearRoomTimers(room);

  room.canSelect = true;
  for (const p of room.players) {
    if (room.playerStates[p.id]) {
      room.playerStates[p.id].selectedChoice = null;
    }
  }

  for (const p of room.players) {
    sendJson(p, {
      type: 'round_start',
      round: room.round,
      chantTotalMs: CHANT_TOTAL_MS
    });
  }

  room.chantTimer = setTimeout(() => {
    resolveMultiplayerRound(room);
  }, CHANT_TOTAL_MS);
}

function judgeChoices(c1, c2) {
  if (c1 === c2) return 'draw';
  if (CHOICE_META[c1].beats === c2) return 'win';
  return 'lose';
}

function resolveMultiplayerRound(room) {
  if (!rooms.has(room.id) || room.players.length < 2) return;
  room.canSelect = false;

  const [p1, p2] = room.players;
  const s1 = room.playerStates[p1.id];
  const s2 = room.playerStates[p2.id];
  const c1 = s1.selectedChoice;
  const c2 = s2.selectedChoice;

  let p1Outcome = 'draw';
  let p2Outcome = 'draw';
  let p1DamageTaken = 0;
  let p2DamageTaken = 0;
  let p1Reason = '';
  let p2Reason = '';
  let isTimeoutRound = false;

  // 경우 1: 둘 다 시간 내에 선택하지 못함 -> 각자 내 생명 게이지만 1칸씩 감소
  if (!c1 && !c2) {
    isTimeoutRound = true;
    s1.life = Math.max(0, s1.life - 1);
    s2.life = Math.max(0, s2.life - 1);
    s1.streak = 0;
    s2.streak = 0;
    p1Outcome = 'timeout_both';
    p2Outcome = 'timeout_both';
    p1DamageTaken = 1;
    p2DamageTaken = 1;
    p1Reason = '양쪽 모두 시간 초과! (각자 생명 -1)';
    p2Reason = '양쪽 모두 시간 초과! (각자 생명 -1)';
  }
  // 경우 2: p1만 시간 초과 -> p1의 생명 게이지만 1칸 감소
  else if (!c1 && c2) {
    isTimeoutRound = true;
    s1.life = Math.max(0, s1.life - 1);
    s1.streak = 0;
    p1Outcome = 'timeout_me';
    p2Outcome = 'timeout_opp';
    p1DamageTaken = 1;
    p1Reason = '시간 초과 (미선택)! 내 생명 -1';
    p2Reason = '상대방 시간 초과 (미선택)! 상대 생명 -1';
  }
  // 경우 3: p2만 시간 초과 -> p2의 생명 게이지만 1칸 감소
  else if (c1 && !c2) {
    isTimeoutRound = true;
    s2.life = Math.max(0, s2.life - 1);
    s2.streak = 0;
    p1Outcome = 'timeout_opp';
    p2Outcome = 'timeout_me';
    p2DamageTaken = 1;
    p1Reason = '상대방 시간 초과 (미선택)! 상대 생명 -1';
    p2Reason = '시간 초과 (미선택)! 내 생명 -1';
  }
  // 경우 4: 양쪽 모두 시간 내에 카드를 선택한 경우 -> 카드 1장씩 소모 및 정상 판정
  else {
    s1.cards[c1] -= 1;
    s2.cards[c2] -= 1;

    const res1 = judgeChoices(c1, c2);
    if (res1 === 'win') {
      p1Outcome = 'win';
      p2Outcome = 'lose';
      s1.streak += 1;
      s2.streak = 0;

      let dmg = 1;
      let reasonTag = '기본 승리';
      if (s1.special >= MAX_SPECIAL) {
        dmg = 3;
        reasonTag = '⚡ 필살기 발동!';
        s1.special = 0;
      } else if (s1.streak === 2) {
        dmg = 2;
        reasonTag = '🔥 2연승 보너스!';
      } else if (s1.streak >= 3) {
        dmg = 3;
        reasonTag = `🔥🔥 ${s1.streak}연승 보너스!`;
      }

      s2.life = Math.max(0, s2.life - dmg);
      s2.special = Math.min(MAX_SPECIAL, s2.special + 1);
      p2DamageTaken = dmg;
      p1Reason = reasonTag;
      p2Reason = `상대 ${reasonTag}`;
    } else if (res1 === 'lose') {
      p1Outcome = 'lose';
      p2Outcome = 'win';
      s2.streak += 1;
      s1.streak = 0;

      let dmg = 1;
      let reasonTag = '기본 승리';
      if (s2.special >= MAX_SPECIAL) {
        dmg = 3;
        reasonTag = '⚡ 필살기 발동!';
        s2.special = 0;
      } else if (s2.streak === 2) {
        dmg = 2;
        reasonTag = '🔥 2연승 보너스!';
      } else if (s2.streak >= 3) {
        dmg = 3;
        reasonTag = `🔥🔥 ${s2.streak}연승 보너스!`;
      }

      s1.life = Math.max(0, s1.life - dmg);
      s1.special = Math.min(MAX_SPECIAL, s1.special + 1);
      p1DamageTaken = dmg;
      p2Reason = reasonTag;
      p1Reason = `상대 ${reasonTag}`;
    } else {
      // 무승부(비김)
      p1Outcome = 'draw';
      p2Outcome = 'draw';
      s1.streak = 0;
      s2.streak = 0;
      s1.special = Math.min(MAX_SPECIAL, s1.special + 1);
      s2.special = Math.min(MAX_SPECIAL, s2.special + 1);
      p1Reason = '무승부 (필살기 +1)';
      p2Reason = '무승부 (필살기 +1)';
    }
  }

  const p1TotalCards = s1.cards.scissors + s1.cards.paper + s1.cards.rock;
  const p2TotalCards = s2.cards.scissors + s2.cards.paper + s2.cards.rock;

  // 각 플레이어에게 라운드 결과 전송
  const buildPayloadFor = (meState, oppState, myOutcome, myReason, myChoice, oppChoice) => ({
    type: 'round_result',
    round: room.round,
    isTimeoutRound,
    outcome: myOutcome,
    reason: myReason,
    myChoice: isTimeoutRound ? myChoice : myChoice,
    oppChoice: isTimeoutRound ? null : oppChoice,
    me: {
      life: meState.life,
      special: meState.special,
      streak: meState.streak,
      cards: meState.cards
    },
    opp: {
      life: oppState.life,
      special: oppState.special,
      streak: oppState.streak,
      totalCards: oppState.cards.scissors + oppState.cards.paper + oppState.cards.rock
    }
  });

  sendJson(p1, buildPayloadFor(s1, s2, p1Outcome, p1Reason, c1, c2));
  sendJson(p2, buildPayloadFor(s2, s1, p2Outcome, p2Reason, c2, c1));

  // 게임 종료 여부 확인
  const anyLifeZero = s1.life <= 0 || s2.life <= 0;
  const allCardsUsed = p1TotalCards === 0 && p2TotalCards === 0;

  if (anyLifeZero || allCardsUsed) {
    room.status = 'ready';
    broadcastRoomList();

    setTimeout(() => {
      if (!rooms.has(room.id) || room.players.length < 2) return;

      let p1Final = 'draw';
      let p2Final = 'draw';
      let p1EndMsg = '';
      let p2EndMsg = '';

      if (anyLifeZero) {
        if (s1.life > 0 && s2.life <= 0) {
          p1Final = 'win';
          p2Final = 'lose';
          p1EndMsg = `상대방(${s2.nickname})의 생명 게이지가 0이 되어 게임에서 승리했습니다!`;
          p2EndMsg = `나의 생명 게이지가 0이 되어 게임에서 패배했습니다.`;
        } else if (s2.life > 0 && s1.life <= 0) {
          p1Final = 'lose';
          p2Final = 'win';
          p1EndMsg = `나의 생명 게이지가 0이 되어 게임에서 패배했습니다.`;
          p2EndMsg = `상대방(${s1.nickname})의 생명 게이지가 0이 되어 게임에서 승리했습니다!`;
        } else {
          p1Final = 'draw';
          p2Final = 'draw';
          p1EndMsg = '양쪽 모두 동시에 생명 게이지가 0이 되어 무승부로 끝납니다!';
          p2EndMsg = '양쪽 모두 동시에 생명 게이지가 0이 되어 무승부로 끝납니다!';
        }
      } else {
        // 9장(가위 3, 바위 3, 보 3)을 모두 사용한 경우
        if (s1.life > s2.life) {
          p1Final = 'win';
          p2Final = 'lose';
          p1EndMsg = `양쪽 모두 9장의 카드를 모두 사용했습니다! 남은 생명 게이지가 더 많아(나: ${s1.life}칸 vs 상대: ${s2.life}칸) 승리했습니다!`;
          p2EndMsg = `양쪽 모두 9장의 카드를 모두 사용했습니다. 남은 생명 게이지가 더 적어(나: ${s2.life}칸 vs 상대: ${s1.life}칸) 패배했습니다.`;
        } else if (s2.life > s1.life) {
          p1Final = 'lose';
          p2Final = 'win';
          p1EndMsg = `양쪽 모두 9장의 카드를 모두 사용했습니다. 남은 생명 게이지가 더 적어(나: ${s1.life}칸 vs 상대: ${s2.life}칸) 패배했습니다.`;
          p2EndMsg = `양쪽 모두 9장의 카드를 모두 사용했습니다! 남은 생명 게이지가 더 많아(나: ${s2.life}칸 vs 상대: ${s1.life}칸) 승리했습니다!`;
        } else {
          p1Final = 'draw';
          p2Final = 'draw';
          p1EndMsg = `대결하는 2명 모두 가위(3장), 바위(3장), 보(3장)를 모두 사용했고, 남은 생명 게이지가 ${s1.life}칸으로 같아 이 게임은 무승부로 끝납니다!`;
          p2EndMsg = p1EndMsg;
        }
      }

      sendJson(p1, {
        type: 'match_over',
        finalResult: p1Final,
        reasonText: p1EndMsg,
        myLife: s1.life,
        oppLife: s2.life
      });
      sendJson(p2, {
        type: 'match_over',
        finalResult: p2Final,
        reasonText: p2EndMsg,
        myLife: s2.life,
        oppLife: s1.life
      });
    }, 900);
    return;
  }

  // 종료되지 않았으면 5초 뒤 다음 라운드 자동 시작
  room.round += 1;
  room.nextRoundTimer = setTimeout(() => {
    startMultiplayerRound(room);
  }, NEXT_ROUND_DELAY_MS);
}

function leaveCurrentRoom(client) {
  const roomId = client.roomId;
  if (!roomId) return;
  client.roomId = null;

  const room = rooms.get(roomId);
  if (!room) return;

  const wasPlaying = room.status === 'playing';
  clearRoomTimers(room);
  room.players = room.players.filter((p) => p.id !== client.id);

  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else {
    const remainingPlayer = room.players[0];
    resetRoomMatchState(room);
    sendRoomStateToPlayers(room);
    if (wasPlaying) {
      sendJson(remainingPlayer, {
        type: 'opponent_left_during_match',
        message: '상대방이 대결 도중 퇴장하여 대결이 중단되었습니다.'
      });
    }
  }
  broadcastRoomList();
}

function handleDisconnect(client) {
  if (!clients.has(client.id)) return;
  leaveCurrentRoom(client);
  clients.delete(client.id);
}

// 클라우드 프록시(Cloudflare/Render 등) 유휴 연결 종료 방지용 Heartbeat (25초마다)
setInterval(() => {
  for (const c of clients.values()) {
    sendJson(c, { type: 'ping' });
  }
}, 25000);

// LAN IP 주소 확인 도우미
function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

server.listen(PORT, () => {
  const ips = getLocalIpAddresses();
  console.log('====================================================');
  console.log(`🎮 배틀 가위바위보 서버가 시작되었습니다!`);
  console.log(`👉 내 컴퓨터 접속 주소: http://localhost:${PORT}`);
  ips.forEach((ip) => {
    console.log(`👉 같은 네트워크(다른 기기) 접속 주소: http://${ip}:${PORT}`);
  });
  console.log('====================================================');
});
