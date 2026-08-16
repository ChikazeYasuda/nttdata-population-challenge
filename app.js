import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  onValue,
  push,
  set,
  update,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { loadFirebaseConfig } from "./config-loader.js";
import {
  DEFAULT_DRAW_PROFILE,
  DRAW_PROFILES,
  MUNICIPALITIES
} from "./data/municipalities/municipalities.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const CPU_THINK_DELAY_MS = 1000;
const OVER_TARGET_DRAW_RATE = 0.01;
const GAME_START_INTRO_MS = 3500;
const PLAYER_COLOR_COUNT = 5;
const MAX_BATTLE_COMMENTS = 50;
const BAR_FILL_MS = 2000;
const CPU_ACCURACY_SETS = {
  1: [0.75],
  2: [0.65, 0.5],
  3: [0.65, 0.5, 0.45],
  4: [0.65, 0.5, 0.45, 0.45]
};
const CATEGORY_LABELS = {
  village_town: "0〜5万人",
  small_city: "5万〜10万人",
  mid_city: "10万〜30万人",
  large_city: "30万〜70万人",
  ordinance_city: "70万人以上"
};
const CATEGORY_SUITS = {
  village_town: "♣",
  small_city: "♦",
  mid_city: "♥",
  large_city: "♠",
  ordinance_city: "★"
};
const TIER_CLASSES = Object.keys(CATEGORY_LABELS).map((category) => `tier-${category}`);
const CONFETTI_COLORS = ["#d4af37", "#f5da7a", "#37d38f", "#fff6da"];
const SOUND_MUTED_KEY = "populationBlackjackSoundMuted";
const SFX_NOTES = {
  hit: [{ freq: 880, start: 0, duration: 0.12, type: "triangle" }],
  stand: [{ freq: 440, start: 0, duration: 0.18, type: "sine" }],
  bust: [
    { freq: 260, start: 0, duration: 0.2, type: "sawtooth" },
    { freq: 160, start: 0.12, duration: 0.28, type: "sawtooth" }
  ],
  just: [
    { freq: 660, start: 0, duration: 0.14, type: "triangle" },
    { freq: 880, start: 0.1, duration: 0.16, type: "triangle" },
    { freq: 1320, start: 0.2, duration: 0.24, type: "triangle" }
  ],
  win: [
    { freq: 523, start: 0, duration: 0.16, type: "triangle" },
    { freq: 659, start: 0.12, duration: 0.16, type: "triangle" },
    { freq: 784, start: 0.24, duration: 0.16, type: "triangle" },
    { freq: 1046, start: 0.36, duration: 0.3, type: "triangle" }
  ],
  lose: [
    { freq: 392, start: 0, duration: 0.2, type: "sine" },
    { freq: 311, start: 0.16, duration: 0.32, type: "sine" }
  ],
  draw: [
    { freq: 440, start: 0, duration: 0.16, type: "sine" },
    { freq: 440, start: 0.18, duration: 0.16, type: "sine" }
  ],
  tick: [{ freq: 700, start: 0, duration: 0.05, type: "square", volume: 0.08 }]
};
const TARGETS = [
  {
    id: "ntt-data-employees",
    label: "NTT DATAグループ社員数",
    value: 206900,
    dateLabel: "2026年6月30日時点",
    sourceLabel: "NTT 2026年度 第1四半期決算補足資料",
    difficulty: "標準",
    isDefault: true
  },
  {
    id: "toyosu-station-total",
    label: "豊洲駅 2社合算乗降客数",
    value: 235989,
    dateLabel: "2023年度",
    sourceLabel: "東京メトロ公式 + ゆりかもめ公式",
    difficulty: "標準"
  },
  {
    id: "ntt-group-employees",
    label: "NTTグループ全社員数",
    value: 344196,
    dateLabel: "2026年3月31日時点",
    sourceLabel: "NTT公式 会社概要",
    difficulty: "高め"
  },
  {
    id: "koto-city-population",
    label: "東京都江東区人口",
    value: 544929,
    dateLabel: "2026年8月1日時点",
    sourceLabel: "江東区公式 住民基本台帳人口",
    difficulty: "高め"
  },
  {
    id: "three-million-challenge",
    label: "全国市区町村 300万人チャレンジ",
    value: 3000000,
    dateLabel: "全国市区町村データ拡張後向け",
    sourceLabel: "e-Stat 住民基本台帳人口で調整予定",
    difficulty: "特別",
    isSpecial: true
  },
  {
    id: "ntt-shareholders",
    label: "NTT株式会社の株主数",
    value: 3386781,
    dateLabel: "2026年6月30日時点",
    sourceLabel: "NTT公式 株式の概要",
    difficulty: "特別",
    isSpecial: true
  }
];
const DEFAULT_TARGET = TARGETS.find((target) => target.isDefault) || TARGETS[0];
const statusLabels = {
  waiting: "待機中",
  active: "プレイ中",
  stand: "STAND",
  bust: "BUST",
  just: "JUST"
};

const els = {
  setupView: document.querySelector("#setupView"),
  setupModeView: document.querySelector("#setupModeView"),
  createRoomForm: document.querySelector("#createRoomForm"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  cpuRoomForm: document.querySelector("#cpuRoomForm"),
  selectCreateModeButton: document.querySelector("#selectCreateModeButton"),
  selectJoinModeButton: document.querySelector("#selectJoinModeButton"),
  selectCpuModeButton: document.querySelector("#selectCpuModeButton"),
  backFromCreateButton: document.querySelector("#backFromCreateButton"),
  backFromJoinButton: document.querySelector("#backFromJoinButton"),
  backFromCpuButton: document.querySelector("#backFromCpuButton"),
  gameView: document.querySelector("#gameView"),
  roomPanel: document.querySelector(".room-panel"),
  playerNameInput: document.querySelector("#playerNameInput"),
  joinPlayerNameInput: document.querySelector("#joinPlayerNameInput"),
  cpuPlayerNameInput: document.querySelector("#cpuPlayerNameInput"),
  roomIdInput: document.querySelector("#roomIdInput"),
  cpuCountSelect: document.querySelector("#cpuCountSelect"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  startCpuRoomButton: document.querySelector("#startCpuRoomButton"),
  setupMessage: document.querySelector("#setupMessage"),
  createTargetSelect: document.querySelector("#createTargetSelect"),
  cpuTargetSelect: document.querySelector("#cpuTargetSelect"),
  createHideTargetCheckbox: document.querySelector("#createHideTargetCheckbox"),
  cpuHideTargetCheckbox: document.querySelector("#cpuHideTargetCheckbox"),
  targetRoulette: document.querySelector("#targetRoulette"),
  rouletteWindow: document.querySelector("#rouletteWindow"),
  roomCodeLabel: document.querySelector("#roomCodeLabel"),
  roomCode: document.querySelector("#roomCode"),
  roomState: document.querySelector("#roomState"),
  turnLabel: document.querySelector("#turnLabel"),
  capacityLabel: document.querySelector("#capacityLabel"),
  turnBanner: document.querySelector("#turnBanner"),
  startGameButton: document.querySelector("#startGameButton"),
  totalLabel: document.querySelector("#totalLabel"),
  hitCountLabel: document.querySelector("#hitCountLabel"),
  myTotal: document.querySelector("#myTotal"),
  myHitCount: document.querySelector("#myHitCount"),
  targetProgress: document.querySelector("#targetProgress"),
  targetProgressFill: document.querySelector("#targetProgressFill"),
  targetProgressLabel: document.querySelector("#targetProgressLabel"),
  candidateBox: document.querySelector("#candidateBox"),
  confettiLayer: document.querySelector("#confettiLayer"),
  burstFlash: document.querySelector("#burstFlash"),
  candidateName: document.querySelector("#candidateName"),
  candidatePrefecture: document.querySelector("#candidatePrefecture"),
  candidatePopulation: document.querySelector("#candidatePopulation"),
  hitButton: document.querySelector("#hitButton"),
  standButton: document.querySelector("#standButton"),
  myStatus: document.querySelector("#myStatus"),
  myHistoryList: document.querySelector("#myHistoryList"),
  drawProfileText: document.querySelector("#drawProfileText"),
  gameStartIntro: document.querySelector("#gameStartIntro"),
  gameStartIntroRule: document.querySelector("#gameStartIntroRule"),
  gameStartIntroProfile: document.querySelector("#gameStartIntroProfile"),
  playersList: document.querySelector("#playersList"),
  battleCommentsList: document.querySelector("#battleCommentsList"),
  battleCommentInput: document.querySelector("#battleCommentInput"),
  battleCommentSendButton: document.querySelector("#battleCommentSendButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultTitle: document.querySelector("#resultTitle"),
  resultDetail: document.querySelector("#resultDetail"),
  resultRanking: document.querySelector("#resultRanking"),
  rematchButton: document.querySelector("#rematchButton"),
  rematchWaitingNote: document.querySelector("#rematchWaitingNote"),
  leaveRoomButton: document.querySelector("#leaveRoomButton"),
  soundToggleButton: document.querySelector("#soundToggleButton")
};

let db = null;
let appReady = false;
let currentRoomId = "";
let currentPlayerId = sessionStorage.getItem("populationBlackjackPlayerId") || crypto.randomUUID();
let unsubscribeRoom = null;
let cpuActionTimer = null;
let cpuActionKey = "";
let rouletteTimer = null;
let lastProfileRoomKey = "";
let lastResultKey = "";
let actionPending = false;
let gameStartIntroTimer = null;
let gameStartIntroVisible = false;
let lastProgressPlayerId = "";
let audioCtx = null;
let commentPending = false;
let soundMuted = localStorage.getItem(SOUND_MUTED_KEY) === "1";

sessionStorage.setItem("populationBlackjackPlayerId", currentPlayerId);
populateTargetSelects();
disableSetup(true);
updateSoundToggleButton();
initializeFirebase();

els.selectCreateModeButton.addEventListener("click", () => showSetupMode("create"));
els.selectJoinModeButton.addEventListener("click", () => showSetupMode("join"));
els.selectCpuModeButton.addEventListener("click", () => showSetupMode("cpu"));
els.backFromCreateButton.addEventListener("click", () => showSetupMode("choice"));
els.backFromJoinButton.addEventListener("click", () => showSetupMode("choice"));
els.backFromCpuButton.addEventListener("click", () => showSetupMode("choice"));
els.createRoomButton.addEventListener("click", createRoom);
els.joinRoomButton.addEventListener("click", joinRoom);
els.startCpuRoomButton.addEventListener("click", startCpuRoom);
els.startGameButton.addEventListener("click", startGame);
els.hitButton.addEventListener("click", hit);
els.standButton.addEventListener("click", stand);
els.rematchButton.addEventListener("click", rematchRoom);
els.leaveRoomButton.addEventListener("click", () => window.location.reload());
els.soundToggleButton.addEventListener("click", toggleSound);
els.battleCommentSendButton.addEventListener("click", sendBattleComment);
els.battleCommentInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  sendBattleComment();
});

async function sendBattleComment() {
  const text = els.battleCommentInput.value.trim();
  if (!text || !db || !currentRoomId || commentPending) return;

  commentPending = true;
  els.battleCommentSendButton.disabled = true;

  try {
    const room = await getCurrentRoom();
    const me = room?.players?.[currentPlayerId];
    if (!me) return;

    const commentRef = push(ref(db, `rooms/${currentRoomId}/comments`));
    await set(commentRef, {
      playerId: currentPlayerId,
      text: text.slice(0, 80),
      createdAt: serverTimestamp()
    });

    els.battleCommentInput.value = "";
    els.battleCommentInput.focus();
  } catch (error) {
    els.myStatus.textContent = `コメント送信に失敗しました: ${error.message}`;
  } finally {
    commentPending = false;
    els.battleCommentSendButton.disabled = false;
  }
}

function renderBattleComments(room) {
  els.battleCommentsList.replaceChildren();

  const comments = Object.entries(room.comments || {})
    .map(([id, comment]) => ({ id, ...comment }))
    .filter((comment) => typeof comment.text === "string" && comment.text.trim())
    .sort((a, b) => {
      const aTime = Number.isFinite(a.createdAt) ? a.createdAt : 0;
      const bTime = Number.isFinite(b.createdAt) ? b.createdAt : 0;
      return aTime === bTime ? a.id.localeCompare(b.id) : aTime - bTime;
    })
    .slice(-MAX_BATTLE_COMMENTS);

  if (comments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "battle-comments-empty";
    empty.textContent = "まだコメントはありません";
    els.battleCommentsList.append(empty);
    return;
  }

  for (const comment of comments) {
    const isMine = comment.playerId === currentPlayerId;
    const item = document.createElement("div");
    item.className = `battle-comment-item${isMine ? " mine" : ""}`;

    const meta = document.createElement("div");
    meta.className = "battle-comment-meta";

    const author = document.createElement("span");
    author.textContent = isMine
      ? "あなた"
      : room.players?.[comment.playerId]?.name || "参加者";

    const time = document.createElement("time");
    time.textContent = Number.isFinite(comment.createdAt)
      ? new Date(comment.createdAt).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "送信中";

    const body = document.createElement("p");
    body.textContent = comment.text;

    meta.append(author, time);
    item.append(meta, body);
    els.battleCommentsList.append(item);
  }

  els.battleCommentsList.scrollTop = els.battleCommentsList.scrollHeight;
}

async function initializeFirebase() {
  try {
    const firebaseConfig = await loadFirebaseConfig();
    assertFirebaseConfig(firebaseConfig);
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    appReady = true;
    setSetupMessage("");
    disableSetup(false);
  } catch (error) {
    setSetupMessage(error.message);
    disableSetup(true);
  }
}

async function createRoom() {
  if (!appReady) return;

  if (els.createTargetSelect.value === "random") {
    disableSetup(true);
    const target = await runTargetRoulette();
    disableSetup(false);
    await createRoomWithTarget(target);
    return;
  }

  await createRoomWithTarget(getSelectedTarget(els.createTargetSelect.value));
}

async function createRoomWithTarget(target) {
  await runSetupAction(async () => {
    const roomId = makeRoomId();
    const playerName = getPlayerName(els.playerNameInput, "Player 1");
    const player = makePlayer(playerName, "waiting", { type: "human" });

    await set(ref(db, `rooms/${roomId}`), {
      roomId,
      roomMode: "online",
      ...makeRoomTargetPayload(target),
      hideTarget: els.createHideTargetCheckbox.checked,
      status: "waiting",
      maxPlayers: MAX_PLAYERS,
      turnIndex: null,
      turnAdvancing: false,
      playerOrder: [],
      startedPlayerIds: [],
      hostPlayerId: currentPlayerId,
      createdAt: serverTimestamp(),
      players: {
        [currentPlayerId]: player
      }
    });

    enterRoom(roomId);
  });
}

async function startCpuRoom() {
  if (!appReady) return;

  if (els.cpuTargetSelect.value !== "random") {
    await createCpuRoom(getSelectedTarget(els.cpuTargetSelect.value));
    return;
  }

  disableSetup(true);
  const target = await runTargetRoulette();
  disableSetup(false);
  await createCpuRoom(target);
}

async function createCpuRoom(selectedTarget = null) {
  if (!appReady) return;

  await runSetupAction(async () => {
    const roomId = makeRoomId();
    const target = selectedTarget || getSelectedCpuTarget();
    const cpuCount = getCpuCount();
    const cpuProfiles = makeCpuProfiles(cpuCount);
    const cpuPlayerIds = cpuProfiles.map((_, index) => `cpu_${index + 1}`);
    const playerOrder = [currentPlayerId, ...cpuPlayerIds];
    const players = {
      [currentPlayerId]: makePlayer(getCpuPlayerName(), "active", { type: "human" })
    };

    for (const [index, cpuId] of cpuPlayerIds.entries()) {
      const profile = cpuProfiles[index];
      players[cpuId] = makePlayer(`CPU ${index + 1}`, "active", {
        type: "cpu",
        difficulty: profile.difficulty,
        accuracy: profile.accuracy
      });
    }

    players[playerOrder[0]].candidate = pickCandidate(players[playerOrder[0]].drawn || {}, target.id, target.value);

    await set(ref(db, `rooms/${roomId}`), {
      roomId,
      roomMode: "cpu",
      ...makeRoomTargetPayload(target),
      hideTarget: els.cpuHideTargetCheckbox.checked,
      status: "playing",
      maxPlayers: MAX_PLAYERS,
      turnIndex: 0,
      turnAdvancing: false,
      playerOrder,
      startedPlayerIds: playerOrder,
      hostPlayerId: currentPlayerId,
      createdAt: serverTimestamp(),
      startedAt: serverTimestamp(),
      players
    });

    enterRoom(roomId);
  });
}

async function joinRoom() {
  if (!appReady) return;

  await runSetupAction(async () => {
    const roomId = normalizeRoomId(els.roomIdInput.value);
    if (!roomId) {
      setSetupMessage("参加する部屋IDを入力してください。");
      return;
    }

    const roomSnapshot = await get(ref(db, `rooms/${roomId}`));
    if (!roomSnapshot.exists()) {
      setSetupMessage("部屋が見つかりません。部屋IDを確認してください。");
      return;
    }

    const room = roomSnapshot.val();
    const players = room.players || {};
    const playerIds = Object.keys(players);
    if (room.status !== "waiting" && !players[currentPlayerId]) {
      setSetupMessage("この部屋はすでにゲーム開始済みです。");
      return;
    }
    if (players[currentPlayerId] && room.status !== "waiting") {
      enterRoom(roomId);
      return;
    }
    if (!players[currentPlayerId] && playerIds.length >= MAX_PLAYERS) {
      setSetupMessage(`この部屋はすでに${MAX_PLAYERS}人そろっています。`);
      return;
    }

    const defaultName = `Player ${Math.min(playerIds.length + 1, MAX_PLAYERS)}`;
    await update(ref(db, `rooms/${roomId}/players/${currentPlayerId}`), makePlayer(getPlayerName(els.joinPlayerNameInput, defaultName), "waiting", { type: "human" }));
    enterRoom(roomId);
  });
}

function enterRoom(roomId) {
  currentRoomId = roomId;
  els.roomCode.textContent = roomId;
  els.roomIdInput.value = roomId;
  document.body.classList.add("in-room");
  els.setupView.classList.add("hidden");
  els.gameView.classList.remove("hidden");
  setSetupMessage("");

  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
    if (!snapshot.exists()) {
      window.location.reload();
      return;
    }
    renderRoom(snapshot.val());
  });
}

async function startGame() {
  await runGameAction(async () => {
    const room = await getCurrentRoom();
    if (!room || room.hostPlayerId !== currentPlayerId) return;

    const players = room.players || {};
    const playerOrder = getPlayerOrder({ ...room, players });
    if (playerOrder.length < MIN_PLAYERS) {
      els.myStatus.textContent = `${MIN_PLAYERS}人以上そろうと開始できます。`;
      return;
    }

    const updates = {
      status: "playing",
      startedAt: serverTimestamp(),
      turnIndex: 0,
      playerOrder,
      startedPlayerIds: playerOrder
    };
    for (const playerId of playerOrder) {
      updates[`players/${playerId}/status`] = "active";
    }
    updates[`players/${playerOrder[0]}/candidate`] = pickCandidate(players[playerOrder[0]].drawn || {}, room.targetId, getRoomTarget(room).value);

    await update(ref(db, `rooms/${currentRoomId}`), updates);
  });
}

async function hit() {
  if (actionPending) return;
  actionPending = true;
  try {
    await runGameAction(async () => {
      const room = await getCurrentRoom();
      if (!room || !canTakeTurn(room, currentPlayerId)) return;

      await applyPlayerAction(room, currentPlayerId, "hit");
    });
  } finally {
    actionPending = false;
  }
}

async function stand() {
  if (actionPending) return;
  actionPending = true;
  try {
    await runGameAction(async () => {
      const room = await getCurrentRoom();
      if (!room || !canTakeTurn(room, currentPlayerId)) return;

      await applyPlayerAction(room, currentPlayerId, "stand");
    });
  } finally {
    actionPending = false;
  }
}

async function rematchRoom() {
  await runGameAction(async () => {
    const room = await getCurrentRoom();
    if (!room || room.status !== "finished" || room.hostPlayerId !== currentPlayerId) return;

    const target = getRoomTarget(room);
    const playerOrder = getPlayerOrder(room);
    const updates = {
      status: "playing",
      result: null,
      turnIndex: 0,
      turnAdvancing: false,
      playerOrder,
      startedPlayerIds: playerOrder,
      startedAt: serverTimestamp(),
      finishedAt: null
    };

    playerOrder.forEach((playerId, index) => {
      Object.assign(updates, prefixPlayerUpdate(playerId, {
        total: 0,
        hitCount: 0,
        status: "active",
        drawn: {},
        history: [],
        lastRevealed: null,
        lastAction: null,
        candidate: index === 0 ? pickCandidate({}, target.id, target.value) : null
      }));
    });

    await update(ref(db, `rooms/${currentRoomId}`), updates);
  });
}

async function applyPlayerAction(room, playerId, action) {
  const player = room.players?.[playerId];
  if (!player || !canPlay(player) || getCurrentTurnPlayerId(room) !== playerId || room.turnAdvancing) return;

  const payload = action === "hit" ? buildHitPayload(room, player) : buildStandPayload();
  const nextPlayers = { ...(room.players || {}), [playerId]: { ...player, ...payload } };
  const revealUpdates = prefixPlayerUpdate(playerId, payload);
  revealUpdates.turnAdvancing = true;

  await update(ref(db, `rooms/${currentRoomId}`), revealUpdates);
  triggerImmediateEffect(action);

  // Let the population bar visibly crawl up to (or past) the target before
  // the bust/just effect fires, instead of flashing the result instantly.
  if (action === "hit") await wait(BAR_FILL_MS);
  triggerOutcomeEffect(payload.status);

  const progressUpdates = buildRoomProgressUpdates({ ...room, players: nextPlayers }, playerId);
  progressUpdates.turnAdvancing = false;

  await wait(getPostEffectDelay(action, payload.status));
  await update(ref(db, `rooms/${currentRoomId}`), progressUpdates);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getPostEffectDelay(action, status) {
  if (status === "bust") return 1300;
  if (status === "just") return 1400;
  return action === "hit" ? 600 : 900;
}

function buildHitPayload(room, player) {
  const roomTarget = getRoomTarget(room);
  const candidate = player.candidate || pickCandidate(player.drawn || {}, room.targetId, roomTarget.value);
  const nextTotal = (player.total || 0) + candidate.population;
  const drawn = { ...(player.drawn || {}), [candidate.id]: true };
  const target = roomTarget.value;
  const status = nextTotal > target ? "bust" : nextTotal === target ? "just" : "active";
  const historyItem = {
    id: candidate.id,
    name: candidate.name,
    prefecture: candidate.prefecture,
    population: candidate.population,
    totalAfter: nextTotal
  };
  const payload = {
    total: nextTotal,
    hitCount: (player.hitCount || 0) + 1,
    status,
    drawn,
    history: [...(player.history || []), historyItem],
    lastRevealed: candidate,
    lastAction: {
      type: "hit",
      municipality: candidate.name,
      prefecture: candidate.prefecture,
      population: candidate.population,
      totalAfter: nextTotal,
      status
    },
    updatedAt: serverTimestamp()
  };

  payload.candidate = null;
  if (status !== "active") {
    payload.finishedAt = serverTimestamp();
  }

  return payload;
}

function buildStandPayload() {
  return {
    status: "stand",
    candidate: null,
    lastAction: {
      type: "stand"
    },
    finishedAt: serverTimestamp()
  };
}

async function finishRoomIfNeeded() {
  const room = await getCurrentRoom();
  if (!room || room.status === "finished") return;

  const playerIds = getStartedPlayerIds(room);
  const players = playerIds.map((id) => [id, room.players?.[id]]).filter(([, player]) => player);
  if (players.length < MIN_PLAYERS || !players.every(([, player]) => isFinished(player.status))) return;

  await update(ref(db, `rooms/${currentRoomId}`), {
    status: "finished",
    result: judge(players, getRoomTarget(room).value),
    finishedAt: serverTimestamp()
  });
}

function renderRoom(room) {
  const players = room.players || {};
  const playerIds = getDisplayPlayerIds(room);
  const me = players[currentPlayerId];
  const isHost = room.hostPlayerId === currentPlayerId;
  const turnPlayerId = getCurrentTurnPlayerId(room);
  const turnPlayer = players[turnPlayerId];
  const target = getRoomTarget(room);
  const isMyTurn = canTakeTurn(room, currentPlayerId);
  const isPlaying = room.status === "playing";
  const focusPlayer = isPlaying && turnPlayer ? turnPlayer : me;
  const focusPlayerId = isPlaying && turnPlayer ? turnPlayerId : currentPlayerId;
  const focusLabel = focusPlayerId === currentPlayerId ? "あなた" : focusPlayer?.name || "参加者";

  const hideTarget = isTargetHidden(room);
  const targetDisplay = hideTarget ? "？？？？？？人" : `${formatNumber(target.value)}人`;

  els.roomState.textContent = room.status === "finished" ? "終了" : room.status === "playing" ? "ゲーム開始" : "待機中";
  els.capacityLabel.textContent = room.status === "waiting" ? `${playerIds.length}人参加中` : `${playerIds.length}人プレイ`;
  els.turnLabel.textContent = room.status === "playing" ? (room.turnAdvancing ? "結果確認中" : `${turnPlayer?.name || "不明"}さんの番`) : "開始前";
  els.turnBanner.textContent = room.status === "playing"
    ? room.turnAdvancing
      ? `${turnPlayer?.name || "不明"}さんの結果を確認中… / TARGET ${targetDisplay}`
      : `${turnPlayer?.name || "不明"}さんのターン / TARGET ${targetDisplay}`
    : `ゲーム開始前 / TARGET ${targetDisplay}`;
  els.roomCodeLabel.textContent = room.status === "waiting" ? "部屋ID" : "共有用 部屋ID";
  els.roomCode.classList.toggle("compact", room.status !== "waiting");
  els.roomPanel.classList.toggle("hidden", room.status !== "waiting");
  els.gameView.classList.toggle("my-turn", isMyTurn);
  els.gameView.classList.toggle("other-turn", isPlaying && !isMyTurn);
  renderDrawProfileNotice(room, target);
  els.startGameButton.classList.toggle("hidden", !(isHost && room.status === "waiting" && playerIds.length >= MIN_PLAYERS));

  if (room.status !== "finished" && !room.turnAdvancing && playerIds.length >= MIN_PLAYERS && playerIds.every((id) => isFinished(players[id].status))) {
    finishRoomIfNeeded();
  }

  if (!me) return;

  els.totalLabel.textContent = `${focusLabel}の現在人口`;
  els.hitCountLabel.textContent = `${focusLabel}のHIT回数`;
  els.myTotal.textContent = formatNumber(focusPlayer?.total || 0);
  els.myHitCount.textContent = formatNumber(focusPlayer?.hitCount || 0);
  els.myStatus.textContent = buildMyStatus(me, room);

  const candidate = focusPlayer?.candidate;
  const isCandidateMasked = Boolean(candidate && canPlay(focusPlayer) && room.status === "playing");
  if (isCandidateMasked) {
    els.candidateName.textContent = candidate.name;
    els.candidatePrefecture.textContent = `${focusLabel}の候補 / ${candidate.prefecture}`;
    els.candidatePopulation.textContent = focusPlayerId === currentPlayerId ? "人口：?????" : "選択待ち";
  } else if (focusPlayer?.lastRevealed) {
    els.candidateName.textContent = focusPlayer.lastRevealed.name;
    els.candidatePrefecture.textContent = `${focusPlayer.lastRevealed.prefecture} / ${formatNumber(focusPlayer.lastRevealed.population)}人`;
    els.candidatePopulation.textContent = canPlay(focusPlayer) ? "HIT！" : "終了";
  } else {
    els.candidateName.textContent = room.status === "waiting" ? "待機中" : "候補なし";
    els.candidatePrefecture.textContent = playerIds.length < MIN_PLAYERS ? "参加者を待っています" : "ホストがゲームを開始します";
    els.candidatePopulation.textContent = "人口：?????";
  }

  const revealCategory = isCandidateMasked
    ? candidate.category
    : focusPlayer?.lastRevealed
      ? focusPlayer.lastRevealed.category
      : null;
  updateCandidateCard(revealCategory, isCandidateMasked);
  updateTargetProgress(room, focusPlayer, target, focusPlayerId);

  els.hitButton.disabled = !canTakeTurn(room, currentPlayerId);
  els.standButton.disabled = !canTakeTurn(room, currentPlayerId);

  renderHistory(focusPlayer, focusLabel);
  renderPlayersList(room, players, playerIds);
  renderBattleComments(room);

  renderResult(room, players);
  document.body.classList.toggle("modal-open", (room.status === "finished" && Boolean(room.result)) || gameStartIntroVisible);
  scheduleCpuTurn(room);
}

function renderResult(room, players) {
  const shouldShow = room.status === "finished" && room.result;
  els.resultPanel.classList.toggle("hidden", !shouldShow);
  els.resultPanel.classList.remove("win", "lose");
  const isHost = room.hostPlayerId === currentPlayerId;
  els.rematchButton.classList.toggle("hidden", !(shouldShow && isHost));
  els.rematchWaitingNote.classList.toggle("hidden", !(shouldShow && !isHost));
  if (!shouldShow) {
    lastResultKey = "";
    return;
  }

  const result = room.result;
  const winnerIds = result.winnerPlayerIds || (result.winnerPlayerId && result.winnerPlayerId !== "draw" ? [result.winnerPlayerId] : []);
  let outcome = "draw";

  if (winnerIds.length === 0) {
    els.resultTitle.textContent = "DRAW";
  } else if (winnerIds.includes(currentPlayerId)) {
    els.resultTitle.textContent = "WIN";
    els.resultPanel.classList.add("win");
    outcome = "win";
  } else {
    els.resultTitle.textContent = "LOSE";
    els.resultPanel.classList.add("lose");
    outcome = "lose";
  }

  const reason = result.reason || "TARGETとの差で判定しました。";
  els.resultDetail.textContent = isTargetHidden(room)
    ? `${reason}（TARGETは${formatNumber(getRoomTarget(room).value)}人でした）`
    : reason;
  renderResultRanking(room, players, result, winnerIds);

  const resultKey = `${room.roomId}:${room.finishedAt || result.decidedAt || ""}`;
  if (resultKey !== lastResultKey) {
    lastResultKey = resultKey;
    playSfx(outcome);
    if (outcome === "win") spawnConfetti(els.resultPanel);
  }
}

function renderResultRanking(room, players, result, winnerIds) {
  if (!els.resultRanking) return;
  els.resultRanking.innerHTML = "";
  const target = getRoomTarget(room).value;
  const ids = result.playerIds || getDisplayPlayerIds(room);
  const rows = ids
    .map((id) => ({ id, player: players[id], diff: Math.abs(target - (players[id]?.total || 0)) }))
    .filter((row) => row.player);

  rows.sort((a, b) => {
    const aBust = a.player.status === "bust";
    const bBust = b.player.status === "bust";
    if (aBust !== bBust) return aBust ? 1 : -1;
    return a.diff - b.diff;
  });

  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "result-row";
    if (row.id === currentPlayerId) item.classList.add("me");
    if (winnerIds.includes(row.id)) item.classList.add("winner");

    const rank = document.createElement("span");
    rank.className = "result-rank";
    rank.textContent = winnerIds.includes(row.id) ? "🏆" : `${index + 1}位`;

    const name = document.createElement("strong");
    name.textContent = row.id === currentPlayerId ? "あなた" : row.player.name || "参加者";

    const detail = document.createElement("span");
    detail.textContent = `${formatNumber(row.player.total || 0)}人（${statusLabels[row.player.status] || "待機中"} / 差${formatNumber(row.diff)}人）`;

    item.append(rank, name, detail);
    els.resultRanking.append(item);
  });
}

function renderPlayersList(room, players, playerIds) {
  els.playersList.innerHTML = "";
  const turnPlayerId = getCurrentTurnPlayerId(room);

  for (const playerId of playerIds) {
    const player = players[playerId];
    if (!player) continue;

    const item = document.createElement("div");
    item.className = "player-row";
    if (playerId === currentPlayerId) item.classList.add("me");
    if (playerId === turnPlayerId && room.status === "playing") item.classList.add("current-turn");

    const title = document.createElement("strong");
    const playerBadges = [];
    if (playerId === currentPlayerId) playerBadges.push("あなた");
    if (player.type === "cpu") playerBadges.push("CPU");
    if (playerId === turnPlayerId && room.status === "playing") playerBadges.push("TURN");
    title.textContent = `${player.name || "参加者"}${playerBadges.length > 0 ? `（${playerBadges.join(" / ")}）` : ""}`;

    const meta = document.createElement("span");
    meta.textContent =
      `${formatNumber(player.total || 0)}人 / ` +
      `${statusLabels[player.status] || "待機中"} / ` +
      `HIT ${formatNumber(player.hitCount || 0)}回`;

    const action = document.createElement("span");
    action.className = "last-action";
    action.textContent = buildLastActionText(player);

    item.append(title, meta, action);
    els.playersList.append(item);
  }
}

function renderHistory(player, label) {
  els.myHistoryList.innerHTML = "";
  const history = player?.history || [];
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = `${label}はまだHITしていません。`;
    els.myHistoryList.append(empty);
    return;
  }

  for (const [index, item] of history.entries()) {
    const row = document.createElement("div");
    row.className = "history-row";

    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${item.prefecture} ${item.name}`;

    const detail = document.createElement("span");
    detail.textContent = `+${formatNumber(item.population)}人 → ${formatNumber(item.totalAfter)}人`;

    row.append(title, detail);
    els.myHistoryList.append(row);
  }
}

function flashEffectClass(effectClass) {
  els.gameView.classList.remove("action-hit", "action-stand", "action-bust", "action-just");
  void els.gameView.offsetWidth;
  els.gameView.classList.add(effectClass);
  window.setTimeout(() => {
    els.gameView.classList.remove(effectClass);
  }, 1200);
}

function triggerImmediateEffect(action) {
  flashEffectClass(action === "hit" ? "action-hit" : "action-stand");
  playSfx(action === "hit" ? "hit" : "stand");

  if (action === "hit" && els.candidatePopulation) {
    els.candidatePopulation.classList.remove("pop-flash");
    void els.candidatePopulation.offsetWidth;
    els.candidatePopulation.classList.add("pop-flash");
    window.setTimeout(() => {
      els.candidatePopulation.classList.remove("pop-flash");
    }, 500);
  }
}

function triggerOutcomeEffect(status) {
  if (status === "bust") {
    flashEffectClass("action-bust");
    playSfx("bust");
    triggerBustFlash();
  } else if (status === "just") {
    flashEffectClass("action-just");
    playSfx("just");
    spawnConfetti(els.candidateBox);
  }
}

function triggerBustFlash() {
  if (!els.burstFlash) return;
  document.body.classList.remove("bust-shake");
  els.burstFlash.classList.remove("show");
  void els.burstFlash.offsetWidth;
  document.body.classList.add("bust-shake");
  els.burstFlash.classList.add("show");
  window.setTimeout(() => {
    els.burstFlash.classList.remove("show");
    document.body.classList.remove("bust-shake");
  }, 800);
}

function updateCandidateCard(category, masked) {
  if (!els.candidateBox) return;
  els.candidateBox.classList.remove(...TIER_CLASSES);
  if (category && CATEGORY_LABELS[category]) {
    els.candidateBox.classList.add(`tier-${category}`);
    els.candidateBox.dataset.suit = CATEGORY_SUITS[category] || "";
  } else {
    els.candidateBox.dataset.suit = "";
  }
  els.candidateBox.classList.toggle("masked", masked);
}

function updateTargetProgress(room, player, target, playerId) {
  if (!els.targetProgress) return;
  const isPlaying = room.status === "playing";
  els.targetProgress.classList.toggle("hidden", !isPlaying);
  if (!isPlaying) {
    lastProgressPlayerId = "";
    return;
  }

  const targetValue = target?.value || 0;
  const total = player?.total || 0;
  const percent = targetValue > 0 ? Math.min(100, (total / targetValue) * 100) : 0;

  const playerChanged = playerId !== lastProgressPlayerId;
  lastProgressPlayerId = playerId;
  if (playerChanged) els.targetProgressFill.classList.add("no-transition");

  setPlayerColorClass(els.targetProgress, room, playerId);
  els.targetProgressFill.style.width = `${percent}%`;
  els.targetProgressLabel.textContent = isTargetHidden(room) ? "？" : `${Math.round(percent)}%`;
  els.targetProgress.classList.toggle("near", percent >= 85 && player?.status !== "bust");
  els.targetProgress.classList.toggle("over", player?.status === "bust");

  if (playerChanged) {
    void els.targetProgressFill.offsetWidth;
    els.targetProgressFill.classList.remove("no-transition");
  }
}

function setPlayerColorClass(el, room, playerId) {
  const order = getPlayerOrder(room);
  const index = Math.max(0, order.indexOf(playerId));
  for (let i = 0; i < PLAYER_COLOR_COUNT; i += 1) el.classList.remove(`player-${i}`);
  el.classList.add(`player-${index % PLAYER_COLOR_COUNT}`);
}

function isTargetHidden(room) {
  return Boolean(room.hideTarget);
}

function spawnConfetti(anchorEl) {
  if (!anchorEl || !els.confettiLayer) return;
  const rect = anchorEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const pieces = [];

  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 90;
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${centerX}px`;
    piece.style.top = `${centerY}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance - 30}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 360 - 180)}deg`);
    piece.style.setProperty("--delay", `${Math.round(Math.random() * 120)}ms`);
    els.confettiLayer.append(piece);
    pieces.push(piece);
  }

  window.setTimeout(() => {
    for (const piece of pieces) piece.remove();
  }, 1150);
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(ctx, { freq, start, duration, type = "sine", volume = 0.16 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

function playSfx(name) {
  if (soundMuted) return;
  const notes = SFX_NOTES[name];
  if (!notes) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const note of notes) playTone(ctx, note);
  } catch (error) {
    // Web Audioが使えない環境では無音でフォールバックする
  }
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem(SOUND_MUTED_KEY, soundMuted ? "1" : "0");
  updateSoundToggleButton();
}

function updateSoundToggleButton() {
  els.soundToggleButton.textContent = soundMuted ? "🔇" : "🔊";
  els.soundToggleButton.setAttribute("aria-pressed", String(!soundMuted));
}

function buildLastActionText(player) {
  const action = player.lastAction;
  if (!action) {
    return player.status === "active" ? "まだ選択していません。" : "開始前";
  }
  if (action.type === "stand") return "直前：STAND";
  if (action.type === "hit") {
    const resultLabel = action.status === "bust" ? "BUST" : action.status === "just" ? "JUST" : "HIT";
    return `直前：${resultLabel} ${action.prefecture} ${action.municipality} +${formatNumber(action.population)}人`;
  }
  return "";
}

function scheduleCpuTurn(room) {
  const turnPlayerId = getCurrentTurnPlayerId(room);
  const turnPlayer = room.players?.[turnPlayerId];
  if (room.status !== "playing" || room.turnAdvancing || room.hostPlayerId !== currentPlayerId || turnPlayer?.type !== "cpu") {
    clearCpuAction();
    return;
  }

  const actionKey = `${room.roomId}:${turnPlayerId}:${turnPlayer.hitCount || 0}:${turnPlayer.total || 0}:${turnPlayer.status}`;
  if (cpuActionKey === actionKey) return;

  clearCpuAction();
  cpuActionKey = actionKey;
  cpuActionTimer = window.setTimeout(() => actCpuTurn(turnPlayerId, actionKey), CPU_THINK_DELAY_MS);
}

function clearCpuAction() {
  if (cpuActionTimer) {
    window.clearTimeout(cpuActionTimer);
    cpuActionTimer = null;
  }
  cpuActionKey = "";
}

async function actCpuTurn(cpuPlayerId, actionKey) {
  try {
    const room = await getCurrentRoom();
    const cpuPlayer = room?.players?.[cpuPlayerId];
    if (!room || room.status !== "playing" || room.hostPlayerId !== currentPlayerId || cpuPlayer?.type !== "cpu") return;
    if (getCurrentTurnPlayerId(room) !== cpuPlayerId || !canPlay(cpuPlayer)) return;

    const action = decideCpuAction(room, cpuPlayer);
    await applyPlayerAction(room, cpuPlayerId, action);
  } catch (error) {
    els.myStatus.textContent = formatFirebaseError(error);
  } finally {
    if (cpuActionKey === actionKey) {
      cpuActionTimer = null;
      cpuActionKey = "";
    }
  }
}

function decideCpuAction(room, cpuPlayer) {
  const idealAction = getIdealCpuAction(room, cpuPlayer);
  const accuracy = Number(cpuPlayer.accuracy || 0.5);
  if (Math.random() < accuracy) return idealAction;
  return idealAction === "hit" ? "stand" : "hit";
}

function getIdealCpuAction(room, cpuPlayer) {
  const target = getRoomTarget(room).value;
  const currentTotal = cpuPlayer.total || 0;
  const candidate = cpuPlayer.candidate || pickCandidate(cpuPlayer.drawn || {}, room.targetId, target);
  const nextTotal = currentTotal + candidate.population;
  const currentDiff = Math.abs(target - currentTotal);
  const nextDiff = Math.abs(target - nextTotal);

  if (nextTotal > target) return "stand";
  if (target - currentTotal <= 10000) return "stand";
  if (nextDiff < currentDiff) return "hit";
  return "stand";
}

function judge(players, target) {
  const normalized = players.map(([id, player]) => ({
    id,
    total: player.total || 0,
    status: player.status,
    diff: Math.abs(target - (player.total || 0)),
    busted: player.status === "bust",
    just: player.status === "just"
  }));
  const justPlayers = normalized.filter((player) => player.just);
  const livePlayers = normalized.filter((player) => !player.busted);
  let winnerPlayerIds = [];
  let reason = "全員BUSTのため引き分けです。";

  if (justPlayers.length > 0) {
    winnerPlayerIds = justPlayers.map((player) => player.id);
    reason = justPlayers.length === 1 ? "JUSTしたプレイヤーの勝利です。" : "複数人がJUSTしたため引き分けです。";
  } else if (livePlayers.length > 0) {
    const bestDiff = Math.min(...livePlayers.map((player) => player.diff));
    winnerPlayerIds = livePlayers.filter((player) => player.diff === bestDiff).map((player) => player.id);
    reason = winnerPlayerIds.length === 1 ? "TARGETとの差が最も小さいプレイヤーの勝利です。" : "TARGETとの差が同じため引き分けです。";
  }

  const winnerPlayerId = winnerPlayerIds.length === 1 ? winnerPlayerIds[0] : "draw";

  return {
    winnerPlayerId,
    winnerPlayerIds: winnerPlayerId === "draw" ? [] : winnerPlayerIds,
    playerIds: normalized.map((player) => player.id),
    reason,
    decidedAt: Date.now()
  };
}

function buildRoomProgressUpdates(room, actedPlayerId) {
  const playerIds = getStartedPlayerIds(room);
  const players = playerIds.map((id) => [id, room.players?.[id]]).filter(([, player]) => player);

  if (players.length >= MIN_PLAYERS && players.every(([, player]) => isFinished(player.status))) {
    return {
      status: "finished",
      result: judge(players, getRoomTarget(room).value),
      finishedAt: serverTimestamp()
    };
  }

  const nextTurnIndex = getNextTurnIndex(room, actedPlayerId);
  const updates = { turnIndex: nextTurnIndex };

  const playerOrder = getPlayerOrder(room);
  const nextPlayerId = playerOrder[nextTurnIndex];
  const nextPlayer = room.players?.[nextPlayerId];
  if (nextPlayer && canPlay(nextPlayer) && !nextPlayer.candidate) {
    const target = getRoomTarget(room);
    updates[`players/${nextPlayerId}/candidate`] = pickCandidate(nextPlayer.drawn || {}, room.targetId, target.value);
  }

  return updates;
}

function prefixPlayerUpdate(playerId, payload) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [`players/${playerId}/${key}`, value]));
}

function getNextTurnIndex(room, actedPlayerId) {
  const playerOrder = getPlayerOrder(room);
  if (playerOrder.length === 0) return 0;

  const actedIndex = Math.max(0, playerOrder.indexOf(actedPlayerId));
  for (let offset = 1; offset <= playerOrder.length; offset += 1) {
    const nextIndex = (actedIndex + offset) % playerOrder.length;
    const nextPlayer = room.players?.[playerOrder[nextIndex]];
    if (canPlay(nextPlayer)) return nextIndex;
  }
  return actedIndex;
}

function canTakeTurn(room, playerId) {
  return room?.status === "playing" && !room.turnAdvancing && canPlay(room.players?.[playerId]) && getCurrentTurnPlayerId(room) === playerId;
}

function getCurrentTurnPlayerId(room) {
  const playerOrder = getPlayerOrder(room);
  if (playerOrder.length === 0 || !Number.isInteger(room.turnIndex)) return "";
  return playerOrder[room.turnIndex] || "";
}

function getStartedPlayerIds(room) {
  if (Array.isArray(room.startedPlayerIds) && room.startedPlayerIds.length > 0) return room.startedPlayerIds;
  if (Array.isArray(room.playerOrder) && room.playerOrder.length > 0) return room.playerOrder;
  return getPlayerOrder(room);
}

function getDisplayPlayerIds(room) {
  return room.status === "waiting" ? getPlayerOrder(room) : getStartedPlayerIds(room);
}

function getPlayerOrder(room) {
  const players = room.players || {};
  if (Array.isArray(room.playerOrder) && room.playerOrder.length > 0) {
    return room.playerOrder.filter((id) => players[id]);
  }

  return Object.entries(players)
    .sort(([, a], [, b]) => (a.joinedOrder || 0) - (b.joinedOrder || 0))
    .map(([id]) => id);
}

function makePlayer(name, status, options = {}) {
  return {
    name,
    type: options.type || "human",
    difficulty: options.difficulty || null,
    accuracy: options.accuracy || null,
    joinedOrder: Date.now(),
    total: 0,
    hitCount: 0,
    status,
    drawn: {},
    candidate: null,
    lastRevealed: null,
    joinedAt: serverTimestamp()
  };
}

function pickCandidate(drawn, targetId, targetValue) {
  const available = MUNICIPALITIES.filter((item) => !drawn[item.id]);
  const pool = available.length > 0 ? available : MUNICIPALITIES;
  return pickWeightedCandidate(pool, targetId, targetValue);
}

function pickWeightedCandidate(pool, targetId, targetValue) {
  const target = Number(targetValue || 0);
  const underTargetPool = target > 0 ? pool.filter((item) => item.population <= target) : pool;
  const overTargetPool = target > 0 ? pool.filter((item) => item.population > target) : [];

  if (underTargetPool.length > 0 && overTargetPool.length > 0) {
    return pickByCategoryWeight(Math.random() < OVER_TARGET_DRAW_RATE ? overTargetPool : underTargetPool, targetId);
  }

  return pickByCategoryWeight(underTargetPool.length > 0 ? underTargetPool : pool, targetId);
}

function pickByCategoryWeight(pool, targetId) {
  const profile = DRAW_PROFILES[targetId] || DEFAULT_DRAW_PROFILE;
  const categoryGroups = Object.keys(CATEGORY_LABELS)
    .map((category) => ({
      category,
      items: pool.filter((item) => item.category === category),
      weight: Number(profile[category] ?? DEFAULT_DRAW_PROFILE[category] ?? 0)
    }))
    .filter((entry) => entry.items.length > 0);
  const totalWeight = categoryGroups.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);

  if (totalWeight <= 0) return pool[Math.floor(Math.random() * pool.length)];

  let threshold = Math.random() * totalWeight;
  for (const entry of categoryGroups) {
    threshold -= Math.max(0, entry.weight);
    if (threshold <= 0) return entry.items[Math.floor(Math.random() * entry.items.length)];
  }

  const lastGroup = categoryGroups[categoryGroups.length - 1];
  return lastGroup.items[Math.floor(Math.random() * lastGroup.items.length)];
}

function getPlayerName(inputEl, defaultName) {
  return inputEl.value.trim() || defaultName;
}

function getCpuPlayerName() {
  return els.cpuPlayerNameInput.value.trim() || "Player";
}

function getCpuCount() {
  return Math.min(4, Math.max(1, Number(els.cpuCountSelect.value || 1)));
}

function populateTargetSelects() {
  els.createTargetSelect.innerHTML = [
    '<option value="random">ランダム（特別を除く）</option>',
    ...TARGETS.map((target) => makeTargetOption(target))
  ].join("");
  els.cpuTargetSelect.innerHTML = [
    '<option value="random">ランダム（特別を除く）</option>',
    ...TARGETS.map((target) => makeTargetOption(target))
  ].join("");
  els.createTargetSelect.value = DEFAULT_TARGET.id;
  els.cpuTargetSelect.value = "random";
}

function makeTargetOption(target) {
  return `<option value="${target.id}">${target.label}</option>`;
}

function getSelectedTarget(targetId) {
  return TARGETS.find((target) => target.id === targetId) || DEFAULT_TARGET;
}

function getSelectedCpuTarget() {
  if (els.cpuTargetSelect.value === "random") return pickRandomTarget();
  return getSelectedTarget(els.cpuTargetSelect.value);
}

function pickRandomTarget() {
  const targets = TARGETS.filter((target) => !target.isSpecial);
  return targets[Math.floor(Math.random() * targets.length)] || DEFAULT_TARGET;
}

function runTargetRoulette() {
  const targets = TARGETS.filter((target) => !target.isSpecial);
  const selected = targets[Math.floor(Math.random() * targets.length)] || DEFAULT_TARGET;
  let index = 0;

  clearRoulette();
  els.targetRoulette.classList.remove("hidden");
  els.rouletteWindow.classList.add("spinning");
  els.rouletteWindow.textContent = targets[0]?.label || DEFAULT_TARGET.label;

  return new Promise((resolve) => {
    rouletteTimer = window.setInterval(() => {
      const target = targets[index % targets.length] || DEFAULT_TARGET;
      els.rouletteWindow.textContent = `${target.label} ${formatNumber(target.value)}人`;
      playSfx("tick");
      index += 1;
    }, 90);

    window.setTimeout(() => {
      clearRoulette(false);
      els.rouletteWindow.classList.remove("spinning");
      els.rouletteWindow.textContent = `${selected.label} ${formatNumber(selected.value)}人`;
      setSetupMessage(`TARGETは「${selected.label}」に決まりました。`);
      window.setTimeout(() => resolve(selected), 500);
    }, 1500);
  });
}

function clearRoulette(hide = true) {
  if (rouletteTimer) {
    window.clearInterval(rouletteTimer);
    rouletteTimer = null;
  }
  if (hide) els.targetRoulette.classList.add("hidden");
}

function getRoomTarget(room) {
  return {
    id: room.targetId || DEFAULT_TARGET.id,
    label: room.targetLabel || getSelectedTarget(room.targetId).label,
    value: Number(room.target || DEFAULT_TARGET.value),
    dateLabel: room.targetDateLabel || getSelectedTarget(room.targetId).dateLabel,
    sourceLabel: room.targetSourceLabel || getSelectedTarget(room.targetId).sourceLabel,
    difficulty: room.targetDifficulty || getSelectedTarget(room.targetId).difficulty
  };
}

function makeRoomTargetPayload(target) {
  return {
    targetId: target.id,
    target: target.value,
    targetLabel: target.label,
    targetDateLabel: target.dateLabel,
    targetSourceLabel: target.sourceLabel,
    targetDifficulty: target.difficulty
  };
}

function renderDrawProfileNotice(room, target) {
  const profileKey = `${room.roomId}:${room.startedAt || ""}:${room.status}`;

  if (room.status === "playing") {
    els.drawProfileText.classList.remove("hidden");
    if (profileKey !== lastProfileRoomKey) {
      lastProfileRoomKey = profileKey;
      renderDrawProfile(els.drawProfileText, target);
      showGameStartIntro(room, target);
    }
    return;
  }

  lastProfileRoomKey = "";
  els.drawProfileText.classList.add("hidden");
  hideGameStartIntro(true);
}

function showGameStartIntro(room, target) {
  if (!els.gameStartIntro || !els.gameStartIntroProfile) return;
  renderDrawProfile(els.gameStartIntroProfile, target);
  renderGameStartIntroRule(room, target);
  window.clearTimeout(gameStartIntroTimer);
  els.gameStartIntro.classList.remove("hidden", "fade-out");
  gameStartIntroVisible = true;
  gameStartIntroTimer = window.setTimeout(() => hideGameStartIntro(false), GAME_START_INTRO_MS);
}

function renderGameStartIntroRule(room, target) {
  if (!els.gameStartIntroRule) return;
  els.gameStartIntroRule.innerHTML = "";

  const targetSpan = document.createElement("strong");
  targetSpan.textContent = isTargetHidden(room) ? "非公開（伏せモード）" : `${formatNumber(target.value)}人`;

  els.gameStartIntroRule.append("TARGETは", targetSpan, "。これを超えないように、HITかSTANDを選んでいきましょう。");
}

function hideGameStartIntro(immediate) {
  if (!els.gameStartIntro) return;
  window.clearTimeout(gameStartIntroTimer);
  gameStartIntroTimer = null;
  gameStartIntroVisible = false;
  if (els.gameStartIntro.classList.contains("hidden")) return;

  if (immediate) {
    els.gameStartIntro.classList.add("hidden");
    els.gameStartIntro.classList.remove("fade-out");
    return;
  }

  els.gameStartIntro.classList.add("fade-out");
  window.setTimeout(() => els.gameStartIntro.classList.add("hidden"), 450);
}

function renderDrawProfile(container, target, options = {}) {
  if (!container) return;

  const rows = getEffectiveDrawRows(target.id, target.value);
  container.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = options.title || "人口カード構成";

  const note = document.createElement("p");
  note.className = "draw-profile-note";
  note.textContent = `TARGET超過の市区町村は約${Math.round(OVER_TARGET_DRAW_RATE * 100)}%だけ出ます。`;

  const list = document.createElement("div");
  list.className = "draw-profile-bars";

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "draw-profile-row";

    const label = document.createElement("span");
    label.className = "draw-profile-label";
    label.textContent = row.label;

    const meter = document.createElement("span");
    meter.className = "draw-profile-meter";

    const fill = document.createElement("span");
    fill.className = "draw-profile-fill";
    fill.style.width = `${Math.max(0, Math.min(100, row.percent))}%`;
    meter.append(fill);

    const value = document.createElement("strong");
    value.textContent = `${Math.round(row.percent)}%`;

    item.append(label, meter, value);
    list.append(item);
  }

  container.append(title, note, list);
}

function getEffectiveDrawRows(targetId, targetValue) {
  const target = Number(targetValue || 0);
  const profile = DRAW_PROFILES[targetId] || DEFAULT_DRAW_PROFILE;
  const categories = Object.keys(CATEGORY_LABELS);
  const underWeights = Object.fromEntries(categories.map((category) => [category, 0]));
  const overWeights = Object.fromEntries(categories.map((category) => [category, 0]));

  for (const category of categories) {
    const categoryItems = MUNICIPALITIES.filter((item) => item.category === category);
    const underItems = categoryItems.filter((item) => target <= 0 || item.population <= target);
    const overItems = categoryItems.filter((item) => target > 0 && item.population > target);
    const weight = Number(profile[category] ?? DEFAULT_DRAW_PROFILE[category] ?? 0);
    if (underItems.length > 0) underWeights[category] = weight;
    if (overItems.length > 0) overWeights[category] = weight;
  }

  const underTotal = Object.values(underWeights).reduce((sum, value) => sum + value, 0);
  const overTotal = Object.values(overWeights).reduce((sum, value) => sum + value, 0);
  const hasUnderAndOver = underTotal > 0 && overTotal > 0;
  const underShare = hasUnderAndOver ? 100 - OVER_TARGET_DRAW_RATE * 100 : underTotal > 0 ? 100 : 0;
  const overShare = hasUnderAndOver ? OVER_TARGET_DRAW_RATE * 100 : underTotal > 0 ? 0 : 100;

  return categories.map((category) => {
    const underPercent = underTotal > 0 ? (underWeights[category] / underTotal) * underShare : 0;
    const overPercent = overTotal > 0 ? (overWeights[category] / overTotal) * overShare : 0;
    return {
      category,
      label: CATEGORY_LABELS[category],
      percent: underPercent + overPercent
    };
  });
}

function makeCpuProfiles(cpuCount) {
  const accuracies = CPU_ACCURACY_SETS[cpuCount] || CPU_ACCURACY_SETS[1];
  return accuracies.map((accuracy) => ({
    accuracy,
    difficulty: accuracy >= 0.7 ? "hard" : accuracy >= 0.6 ? "normal" : "easy"
  }));
}

function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function normalizeRoomId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function setSetupMessage(message) {
  els.setupMessage.textContent = message;
}

function disableSetup(disabled) {
  els.selectCreateModeButton.disabled = disabled;
  els.selectJoinModeButton.disabled = disabled;
  els.selectCpuModeButton.disabled = disabled;
  els.createRoomButton.disabled = disabled;
  els.joinRoomButton.disabled = disabled;
  els.startCpuRoomButton.disabled = disabled;
}

function showSetupMode(mode) {
  clearRoulette();
  els.setupModeView.classList.toggle("hidden", mode !== "choice");
  els.createRoomForm.classList.toggle("hidden", mode !== "create");
  els.joinRoomForm.classList.toggle("hidden", mode !== "join");
  els.cpuRoomForm.classList.toggle("hidden", mode !== "cpu");
  setSetupMessage("");

  if (mode === "create") els.playerNameInput.focus();
  if (mode === "join") els.joinPlayerNameInput.focus();
  if (mode === "cpu") els.cpuPlayerNameInput.focus();
}

function canPlay(player) {
  return player?.status === "active";
}

function isFinished(status) {
  return ["stand", "bust", "just"].includes(status);
}

function getMe(room) {
  return room?.players?.[currentPlayerId] || null;
}

async function getCurrentRoom() {
  if (!currentRoomId) return null;
  const snapshot = await get(ref(db, `rooms/${currentRoomId}`));
  return snapshot.val();
}

function buildMyStatus(player, room) {
  const target = getRoomTarget(room).value;
  const hideTarget = isTargetHidden(room);
  if (player.status === "bust") return hideTarget ? "BUST：TARGETをオーバーしました" : `BUST：${formatNumber(player.total - target)}人オーバー`;
  if (player.status === "just") return "JUST：TARGETと完全一致";
  if (player.status === "stand") return hideTarget ? "STAND：結果を待っています" : `STAND：TARGETまで${formatNumber(target - player.total)}人`;
  if (player.status === "active") {
    if (room.status === "playing" && getCurrentTurnPlayerId(room) !== currentPlayerId) {
      const turnPlayer = room.players?.[getCurrentTurnPlayerId(room)];
      return hideTarget
        ? `${turnPlayer?.name || "他の参加者"}さんの番です。`
        : `${turnPlayer?.name || "他の参加者"}さんの番です。TARGETまで${formatNumber(target - player.total)}人`;
    }
    return hideTarget ? "あなたの番です。" : `あなたの番です。TARGETまで${formatNumber(target - player.total)}人`;
  }
  return "待機中";
}

function assertFirebaseConfig(config) {
  const missing = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].filter((key) => {
    const value = config[key];
    return !value || String(value).startsWith("YOUR_");
  });

  if (missing.length > 0) {
    throw new Error("firebase-config.js にFirebase設定値を入れてください。");
  }
}

async function runSetupAction(action) {
  setSetupMessage("Firebaseに接続しています...");
  disableSetup(true);
  try {
    await action();
  } catch (error) {
    setSetupMessage(formatFirebaseError(error));
  } finally {
    if (!currentRoomId) disableSetup(false);
  }
}

async function runGameAction(action) {
  els.myStatus.textContent = "同期しています...";
  try {
    await action();
  } catch (error) {
    els.myStatus.textContent = formatFirebaseError(error);
  }
}

function formatFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) {
    return "Firebaseの書き込みが拒否されました。Realtime Database Rulesを検証用に読み書き許可へ変更してください。";
  }
  if (code.includes("database/invalid-url") || code.includes("app/no-options")) {
    return "Firebase設定値が正しくありません。firebase-config.js の databaseURL などを確認してください。";
  }
  if (String(error?.message || "").includes("Failed to fetch")) {
    return "Firebaseへ接続できません。ネットワーク接続とFirebase設定値を確認してください。";
  }
  return `処理に失敗しました：${error?.message || "原因不明のエラー"}`;
}
