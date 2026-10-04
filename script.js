'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ui = {
  score: document.getElementById('scoreDisplay'),
  high: document.getElementById('highScoreDisplay'),
  combo: document.getElementById('comboDisplay'),
  speed: document.getElementById('speedDisplay'),
  challengeText: document.getElementById('challengeText'),
  challengeProgress: document.getElementById('challengeProgress'),
  turboFill: document.getElementById('turboFill'),
  turboText: document.getElementById('turboText'),
  start: document.getElementById('startButton'),
  pause: document.getElementById('pauseButton'),
  sound: document.getElementById('soundButton'),
  left: document.getElementById('leftBtn'),
  right: document.getElementById('rightBtn'),
  boost: document.getElementById('boostBtn'),
  gameOver: document.getElementById('gameOver'),
  finalScore: document.getElementById('finalScore'),
  finalHigh: document.getElementById('finalHighScore'),
  finalCoins: document.getElementById('finalCoins'),
  finalNear: document.getElementById('finalNearMisses'),
  finalChallenge: document.getElementById('finalChallenge'),
  restart: document.getElementById('restartButton')
};

const W = canvas.width;
const H = canvas.height;
const ROAD_LEFT = 48;
const ROAD_RIGHT = W - 48;
const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
const LANES = 3;
const LANE_WIDTH = ROAD_WIDTH / LANES;
const CAR_W = 42;
const CAR_H = 72;

const keys = Object.create(null);
const touch = { left: false, right: false, boost: false };

let highScore = Number(localStorage.getItem('racefun2_neon_highscore') || 0);
let state = 'idle'; // idle | running | paused | over
let lastTime = 0;
let roadOffset = 0;
let spawnTimer = 0;
let pickupTimer = 0;
let elapsed = 0;
let score = 0;
let scoreFloat = 0;
let worldSpeed = 250;
let turbo = 0;
let shieldTime = 0;
let timeWarp = 0;
let combo = 0;
let comboTimer = 0;
let feverTime = 0;
let coins = 0;
let nearMisses = 0;
let shake = 0;
let challenge = null;
let audioEnabled = true;
let audioCtx = null;
let animationId = null;
let traffic = [];
let pickups = [];
let particles = [];
let popups = [];

const car = {
  x: W / 2 - CAR_W / 2,
  y: H - 132,
  width: CAR_W,
  height: CAR_H,
  vx: 0,
  tilt: 0
};

const TRAFFIC_COLORS = ['#ff5c76', '#49e8ff', '#ff8f4d', '#b778ff', '#6dff9d'];
const CHALLENGES = [
  { type: 'coins', target: 8, label: 'Collect 8 coins', bonus: 500 },
  { type: 'near', target: 7, label: 'Land 7 near misses', bonus: 600 },
  { type: 'score', target: 2200, label: 'Score 2,200 points', bonus: 700 },
  { type: 'survive', target: 45, label: 'Survive for 45 seconds', bonus: 650 }
];

ui.high.textContent = formatNumber(highScore);

function laneCenter(lane) {
  return ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function choice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatNumber(value) {
  return Math.floor(value).toLocaleString('en-US');
}

function rectsOverlap(a, b, pad = 0) {
  return (
    a.x + pad < b.x + b.width &&
    a.x + a.width - pad > b.x &&
    a.y + pad < b.y + b.height &&
    a.y + a.height - pad > b.y
  );
}

function ensureAudio() {
  if (!audioEnabled) return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(freq = 440, duration = 0.06, volume = 0.04, type = 'sine') {
  const ac = ensureAudio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function resetRun() {
  state = 'running';
  lastTime = performance.now();
  roadOffset = 0;
  spawnTimer = 0.45;
  pickupTimer = 1.8;
  elapsed = 0;
  score = 0;
  scoreFloat = 0;
  worldSpeed = 250;
  turbo = 22;
  shieldTime = 0;
  timeWarp = 0;
  combo = 0;
  comboTimer = 0;
  feverTime = 0;
  coins = 0;
  nearMisses = 0;
  shake = 0;
  traffic = [];
  pickups = [];
  particles = [];
  popups = [];
  car.x = W / 2 - CAR_W / 2;
  car.vx = 0;
  car.tilt = 0;
  challenge = { ...choice(CHALLENGES), completed: false };

  ui.gameOver.classList.remove('show');
  ui.start.textContent = 'Restart Run';
  ui.pause.disabled = false;
  ui.pause.textContent = 'Pause';
  updateUi();
  beep(560, 0.08, 0.035, 'square');
}

function startRun() {
  ensureAudio();
  if (animationId !== null) cancelAnimationFrame(animationId);
  resetRun();
  animationId = requestAnimationFrame(gameLoop);
}

function endRun() {
  if (state !== 'running') return;
  state = 'over';
  shake = 14;
  burst(car.x + car.width / 2, car.y + car.height / 2, '#ff5c76', 24, 170);
  beep(110, 0.28, 0.08, 'sawtooth');

  if (score > highScore) {
    highScore = Math.floor(score);
    localStorage.setItem('racefun2_neon_highscore', String(highScore));
  }

  ui.high.textContent = formatNumber(highScore);
  ui.finalScore.textContent = formatNumber(score);
  ui.finalHigh.textContent = formatNumber(highScore);
  ui.finalCoins.textContent = String(coins);
  ui.finalNear.textContent = String(nearMisses);
  ui.finalChallenge.textContent = challenge?.completed
    ? `🏆 Challenge cleared: ${challenge.label}`
    : `Challenge: ${challenge?.label || '—'} — try again!`;
  ui.gameOver.classList.add('show');
  ui.pause.disabled = true;
}

function togglePause() {
  if (state === 'running') {
    state = 'paused';
    ui.pause.textContent = 'Resume';
  } else if (state === 'paused') {
    state = 'running';
    lastTime = performance.now();
    ui.pause.textContent = 'Pause';
    animationId = requestAnimationFrame(gameLoop);
  }
}

function multiplier() {
  const comboMult = 1 + Math.min(4, Math.floor(combo / 3));
  return feverTime > 0 ? Math.min(6, comboMult + 1) : comboMult;
}

function createTraffic(lane, y = -110, forcedType = null) {
  const type = forcedType || (Math.random() < 0.17 ? 'truck' : 'car');
  const width = type === 'truck' ? 52 : 42;
  const height = type === 'truck' ? 92 : 72;
  const jitter = rand(-LANE_WIDTH * 0.09, LANE_WIDTH * 0.09);
  const x = clamp(laneCenter(lane) - width / 2 + jitter, ROAD_LEFT + 6, ROAD_RIGHT - width - 6);
  traffic.push({
    x,
    y,
    width,
    height,
    lane,
    type,
    color: choice(TRAFFIC_COLORS),
    speedFactor: type === 'truck' ? rand(0.74, 0.88) : rand(0.8, 1.05),
    nearChecked: false
  });
}

function spawnPattern() {
  const lanes = [0, 1, 2];
  const difficulty = clamp(elapsed / 70, 0, 1);
  const doubleChance = 0.3 + difficulty * 0.25;

  if (Math.random() < doubleChance) {
    const safeLane = Math.floor(Math.random() * LANES);
    lanes.filter(l => l !== safeLane).forEach(l => createTraffic(l));
    if (Math.random() < 0.55) {
      createPickup('coin', safeLane, -175);
    }
  } else {
    createTraffic(Math.floor(Math.random() * LANES));
  }
}

function createPickup(type, lane = Math.floor(Math.random() * LANES), y = -50) {
  const size = type === 'coin' ? 24 : 30;
  pickups.push({
    type,
    x: laneCenter(lane) - size / 2 + rand(-8, 8),
    y,
    width: size,
    height: size,
    phase: Math.random() * Math.PI * 2
  });
}

function spawnPickup() {
  const roll = Math.random();
  const type = roll < 0.65 ? 'coin' : roll < 0.79 ? 'shield' : roll < 0.9 ? 'nitro' : 'warp';
  createPickup(type);
}

function pickupColor(type) {
  if (type === 'coin') return '#ffd84d';
  if (type === 'shield') return '#49e8ff';
  if (type === 'nitro') return '#ff4fd8';
  return '#6dff9d';
}

function pickupSymbol(type) {
  if (type === 'coin') return '●';
  if (type === 'shield') return '◇';
  if (type === 'nitro') return '⚡';
  return '◌';
}

function applyPickup(type, p) {
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;

  if (type === 'coin') {
    coins += 1;
    addScore(45, 'COIN +45', '#ffd84d');
    turbo = clamp(turbo + 11, 0, 100);
    combo = Math.min(20, combo + 1);
    comboTimer = 2.5;
    beep(880, 0.055, 0.035, 'square');
  } else if (type === 'shield') {
    shieldTime = 6;
    popup('SHIELD!', cx, cy, '#49e8ff');
    beep(620, 0.1, 0.04, 'sine');
  } else if (type === 'nitro') {
    turbo = clamp(turbo + 42, 0, 100);
    popup('NITRO +42', cx, cy, '#ff4fd8');
    beep(760, 0.09, 0.04, 'square');
  } else if (type === 'warp') {
    timeWarp = 5;
    popup('TIME WARP', cx, cy, '#6dff9d');
    beep(420, 0.13, 0.035, 'sine');
  }

  burst(cx, cy, pickupColor(type), type === 'coin' ? 9 : 15, 105);
  updateChallenge();
}

function addScore(points, label = '', color = '#fff') {
  const awarded = Math.floor(points * multiplier());
  scoreFloat += awarded;
  score = Math.floor(scoreFloat);
  if (label) popup(`${label} ×${multiplier()}`, car.x + car.width / 2, car.y - 6, color);
}

function registerNearMiss(t) {
  t.nearChecked = true;
  nearMisses += 1;
  combo = Math.min(20, combo + 1);
  comboTimer = 2.75;
  turbo = clamp(turbo + 14, 0, 100);
  const points = 70 + combo * 4;
  addScore(points, `NEAR MISS +${points}`, '#49e8ff');
  shake = Math.max(shake, 2.5);
  beep(520 + combo * 24, 0.05, 0.025, 'triangle');

  if (combo >= 8 && feverTime <= 0) {
    feverTime = 6;
    popup('🔥 NEON FEVER!', W / 2, H * 0.42, '#ff4fd8', 1.05);
    beep(980, 0.14, 0.045, 'square');
  }
  updateChallenge();
}

function updateChallenge() {
  if (!challenge || challenge.completed) return;
  let current = 0;
  if (challenge.type === 'coins') current = coins;
  if (challenge.type === 'near') current = nearMisses;
  if (challenge.type === 'score') current = score;
  if (challenge.type === 'survive') current = elapsed;

  if (current >= challenge.target) {
    challenge.completed = true;
    scoreFloat += challenge.bonus;
    score = Math.floor(scoreFloat);
    popup(`🏆 CHALLENGE +${challenge.bonus}`, W / 2, H * 0.34, '#ffd84d', 1.15);
    burst(W / 2, H * 0.34, '#ffd84d', 28, 160);
    beep(1040, 0.18, 0.05, 'square');
  }
}

function challengeCurrent() {
  if (!challenge) return 0;
  if (challenge.type === 'coins') return coins;
  if (challenge.type === 'near') return nearMisses;
  if (challenge.type === 'score') return score;
  return elapsed;
}

function update(dt) {
  elapsed += dt;

  const left = keys.ArrowLeft || keys.a || keys.A || touch.left;
  const right = keys.ArrowRight || keys.d || keys.D || touch.right;
  const boosting = (keys[' '] || touch.boost) && turbo > 0;

  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const acceleration = 1600;
  const maxVx = boosting ? 390 : 330;
  car.vx += steer * acceleration * dt;
  if (steer === 0) car.vx *= Math.pow(0.0015, dt);
  car.vx = clamp(car.vx, -maxVx, maxVx);
  car.x += car.vx * dt;
  car.x = clamp(car.x, ROAD_LEFT + 7, ROAD_RIGHT - car.width - 7);
  car.tilt += ((car.vx / maxVx) * 0.13 - car.tilt) * Math.min(1, dt * 9);

  const difficultySpeed = 250 + Math.min(180, elapsed * 2.15);
  const boostFactor = boosting ? 1.36 : 1;
  const feverFactor = feverTime > 0 ? 1.08 : 1;
  const warpFactor = timeWarp > 0 ? 0.62 : 1;
  worldSpeed = difficultySpeed * boostFactor * feverFactor * warpFactor;

  if (boosting) {
    turbo = Math.max(0, turbo - 28 * dt);
    if (Math.random() < 0.7) trailParticle();
  } else {
    turbo = Math.min(100, turbo + 1.5 * dt);
  }

  roadOffset = (roadOffset + worldSpeed * dt) % 54;
  scoreFloat += dt * (worldSpeed / 8) * multiplier();
  score = Math.floor(scoreFloat);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnPattern();
    const base = 1.0 - Math.min(0.28, elapsed * 0.0035);
    spawnTimer = rand(base * 0.86, base * 1.22);
  }

  pickupTimer -= dt;
  if (pickupTimer <= 0) {
    spawnPickup();
    pickupTimer = rand(2.35, 3.75);
  }

  for (const t of traffic) {
    t.y += worldSpeed * t.speedFactor * dt;

    if (!t.nearChecked && t.y > car.y + car.height) {
      const horizontalGap = Math.max(
        car.x - (t.x + t.width),
        t.x - (car.x + car.width),
        0
      );
      if (horizontalGap > 0 && horizontalGap < 24) registerNearMiss(t);
      else t.nearChecked = true;
    }

    if (rectsOverlap(car, t, 5)) {
      if (shieldTime > 0) {
        shieldTime = 0;
        const hitX = t.x + t.width / 2;
        const hitY = t.y + t.height / 2;
        t.y = H + 150;
        shake = 10;
        burst(hitX, hitY, '#49e8ff', 22, 180);
        popup('SHIELD BREAK!', car.x + car.width / 2, car.y - 14, '#49e8ff');
        beep(180, 0.13, 0.06, 'sawtooth');
      } else {
        endRun();
        return;
      }
    }
  }
  traffic = traffic.filter(t => t.y < H + 130);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.y += worldSpeed * 0.9 * dt;
    p.phase += dt * 5;
    if (rectsOverlap(car, p, 2)) {
      applyPickup(p.type, p);
      pickups.splice(i, 1);
    } else if (p.y > H + 50) {
      pickups.splice(i, 1);
    }
  }

  if (shieldTime > 0) shieldTime = Math.max(0, shieldTime - dt);
  if (timeWarp > 0) timeWarp = Math.max(0, timeWarp - dt);
  if (feverTime > 0) feverTime = Math.max(0, feverTime - dt);

  if (comboTimer > 0) {
    comboTimer -= dt;
  } else if (combo > 0) {
    combo = 0;
  }

  updateParticles(dt);
  updateChallenge();
  updateUi();
}

function trailParticle() {
  particles.push({
    x: car.x + car.width / 2 + rand(-7, 7),
    y: car.y + car.height - 2,
    vx: rand(-18, 18),
    vy: rand(70, 135),
    life: rand(0.18, 0.38),
    maxLife: 0.38,
    size: rand(3, 7),
    color: Math.random() < 0.5 ? '#49e8ff' : '#ff4fd8'
  });
}

function burst(x, y, color, count = 12, speed = 120) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.35, speed);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.3, 0.7),
      maxLife: 0.7,
      size: rand(2, 6),
      color
    });
  }
}

function popup(text, x, y, color = '#fff', scale = 1) {
  popups.push({ text, x, y, color, life: 1.05, maxLife: 1.05, scale });
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 40 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);

  for (const p of popups) {
    p.y -= 34 * dt;
    p.life -= dt;
  }
  popups = popups.filter(p => p.life > 0);

  shake *= Math.pow(0.02, dt);
  if (shake < 0.05) shake = 0;
}

function updateUi() {
  ui.score.textContent = formatNumber(score);
  ui.high.textContent = formatNumber(highScore);
  ui.combo.textContent = `x${multiplier()}`;
  ui.combo.style.color = feverTime > 0 ? '#ff4fd8' : '#ffd84d';
  ui.speed.textContent = `${Math.round(worldSpeed * 0.62)} km/h`;
  ui.turboFill.style.width = `${turbo}%`;
  ui.turboText.textContent = `${Math.round(turbo)}%`;

  if (challenge) {
    ui.challengeText.textContent = challenge.completed ? `✅ ${challenge.label}` : challenge.label;
    const current = challengeCurrent();
    const shown = challenge.type === 'survive' ? Math.floor(current) : Math.floor(current);
    ui.challengeProgress.textContent = challenge.completed
      ? `+${challenge.bonus}`
      : `${Math.min(shown, challenge.target)}/${challenge.target}`;
  }
}

function drawRoundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

function drawRoad() {
  const fever = feverTime > 0;

  ctx.fillStyle = fever ? '#0f0b20' : '#080b16';
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createLinearGradient(0, 0, W, 0);
  glow.addColorStop(0, fever ? '#2a0e39' : '#111734');
  glow.addColorStop(0.18, '#22283c');
  glow.addColorStop(0.82, '#22283c');
  glow.addColorStop(1, fever ? '#2a0e39' : '#111734');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#242839';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, H);

  ctx.fillStyle = fever ? '#ff4fd8' : '#49e8ff';
  ctx.globalAlpha = 0.55;
  ctx.fillRect(ROAD_LEFT - 3, 0, 3, H);
  ctx.fillRect(ROAD_RIGHT, 0, 3, H);
  ctx.globalAlpha = 1;

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.setLineDash([28, 26]);
  ctx.lineDashOffset = roadOffset;
  for (let i = 1; i < LANES; i++) {
    const x = ROAD_LEFT + LANE_WIDTH * i;
    ctx.beginPath();
    ctx.moveTo(x, -60);
    ctx.lineTo(x, H + 60);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // animated side lights
  for (let y = -40 + roadOffset; y < H; y += 54) {
    ctx.fillStyle = fever ? '#ff4fd8' : '#49e8ff';
    ctx.fillRect(18, y, 12, 4);
    ctx.fillStyle = fever ? '#ffd84d' : '#ff4fd8';
    ctx.fillRect(W - 30, y + 20, 12, 4);
  }
}

function drawTrafficCar(t) {
  ctx.save();
  ctx.translate(t.x + t.width / 2, t.y + t.height / 2);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  drawRoundedRect(-t.width / 2 + 3, -t.height / 2 + 5, t.width, t.height, 10);
  ctx.fill();

  ctx.fillStyle = t.color;
  drawRoundedRect(-t.width / 2, -t.height / 2, t.width, t.height, t.type === 'truck' ? 7 : 11);
  ctx.fill();

  ctx.fillStyle = '#111729';
  const inset = t.type === 'truck' ? 7 : 6;
  drawRoundedRect(-t.width / 2 + inset, -t.height / 2 + 9, t.width - inset * 2, t.type === 'truck' ? 24 : 20, 5);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(-t.width / 2 + 5, -t.height / 2 + 5, 8, 4);
  ctx.fillRect(t.width / 2 - 13, -t.height / 2 + 5, 8, 4);
  ctx.fillStyle = '#ff334e';
  ctx.fillRect(-t.width / 2 + 6, t.height / 2 - 8, 7, 4);
  ctx.fillRect(t.width / 2 - 13, t.height / 2 - 8, 7, 4);

  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(car.x + car.width / 2, car.y + car.height / 2);
  ctx.rotate(car.tilt);

  if (shieldTime > 0) {
    const pulse = 1 + Math.sin(elapsed * 9) * 0.05;
    ctx.strokeStyle = 'rgba(73,232,255,0.9)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#49e8ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(0, 0, car.width * 0.72 * pulse, car.height * 0.66 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.shadowColor = feverTime > 0 ? '#ff4fd8' : '#ffd84d';
  ctx.shadowBlur = feverTime > 0 ? 19 : 10;
  ctx.fillStyle = feverTime > 0 ? '#ff4fd8' : '#ffd84d';
  drawRoundedRect(-car.width / 2, -car.height / 2, car.width, car.height, 12);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#101528';
  drawRoundedRect(-car.width / 2 + 7, -car.height / 2 + 10, car.width - 14, 20, 5);
  ctx.fill();
  drawRoundedRect(-car.width / 2 + 7, 9, car.width - 14, 19, 5);
  ctx.fill();

  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(-car.width / 2 + 6, -car.height / 2 + 4, 8, 4);
  ctx.fillRect(car.width / 2 - 14, -car.height / 2 + 4, 8, 4);
  ctx.fillStyle = '#ff3b58';
  ctx.fillRect(-car.width / 2 + 7, car.height / 2 - 8, 7, 4);
  ctx.fillRect(car.width / 2 - 14, car.height / 2 - 8, 7, 4);

  ctx.restore();
}

function drawPickups() {
  for (const p of pickups) {
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    const pulse = 1 + Math.sin(p.phase) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = pickupColor(p.type);
    ctx.shadowBlur = 14;
    ctx.fillStyle = pickupColor(p.type);
    ctx.beginPath();
    ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0d1b';
    ctx.font = p.type === 'nitro' ? 'bold 16px system-ui' : 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pickupSymbol(p.type), 0, 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const p of popups) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.font = `900 ${Math.round(15 * p.scale)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 5;
    ctx.fillText(p.text, p.x, p.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawEffects() {
  if (timeWarp > 0) {
    ctx.fillStyle = 'rgba(109,255,157,0.045)';
    ctx.fillRect(0, 0, W, H);
  }

  if (feverTime > 0) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(255,79,216,0.06)');
    grad.addColorStop(1, 'rgba(73,232,255,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'idle') {
    ctx.fillStyle = 'rgba(4,6,17,0.54)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 30px system-ui';
    ctx.fillText('NEON RUSH', W / 2, H * 0.39);
    ctx.fillStyle = '#ffd84d';
    ctx.font = '800 16px system-ui';
    ctx.fillText('Dodge • Graze • Boost', W / 2, H * 0.44);
  }

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(4,6,17,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 28px system-ui';
    ctx.fillText('⏸ PAUSED', W / 2, H * 0.46);
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawRoad();
  drawPickups();
  traffic.forEach(drawTrafficCar);
  drawPlayer();
  drawParticles();
  drawEffects();
  ctx.restore();
}

function gameLoop(timestamp) {
  if (state !== 'running') {
    draw();
    return;
  }

  const dt = clamp((timestamp - lastTime) / 1000, 0, 0.034);
  lastTime = timestamp;
  update(dt);
  draw();

  if (state === 'running') animationId = requestAnimationFrame(gameLoop);
  else animationId = null;
}

function bindHoldButton(element, key) {
  const on = (e) => {
    e.preventDefault();
    touch[key] = true;
    ensureAudio();
  };
  const off = (e) => {
    e.preventDefault();
    touch[key] = false;
  };
  element.addEventListener('pointerdown', on);
  element.addEventListener('pointerup', off);
  element.addEventListener('pointercancel', off);
  element.addEventListener('pointerleave', off);
}

document.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
  if (e.key === 'Escape' && (state === 'running' || state === 'paused')) togglePause();
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

window.addEventListener('blur', () => {
  if (state === 'running') togglePause();
});

ui.start.addEventListener('click', startRun);
ui.restart.addEventListener('click', startRun);
ui.pause.addEventListener('click', togglePause);
ui.sound.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  ui.sound.textContent = audioEnabled ? '🔊' : '🔇';
  if (audioEnabled) beep(620, 0.05, 0.03, 'sine');
});

bindHoldButton(ui.left, 'left');
bindHoldButton(ui.right, 'right');
bindHoldButton(ui.boost, 'boost');

updateUi();
draw();
