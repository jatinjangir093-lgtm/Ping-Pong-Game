/* ============================================
   PING PONG — Game Engine
   Modular, optimized, fully commented
   ============================================ */

;(function () {
  'use strict';

  // ─────────────────────────── DOM References ───────────────────────────
  const $startScreen   = document.getElementById('start-screen');
  const $gameContainer = document.getElementById('game-container');
  const $winScreen     = document.getElementById('win-screen');
  const $canvas        = document.getElementById('game-canvas');
  const ctx            = $canvas.getContext('2d');

  const $scoreP1    = document.getElementById('score-p1');
  const $scoreP2    = document.getElementById('score-p2');
  const $modeLabel  = document.getElementById('mode-label');
  const $pauseOvl   = document.getElementById('pause-overlay');
  const $winText    = document.getElementById('win-text');
  const $winScore   = document.getElementById('win-score');
  const $btnSound   = document.getElementById('btn-sound');
  const $btnPause   = document.getElementById('btn-pause');
  const $btnRestart = document.getElementById('btn-restart');
  const $restartBtn = document.getElementById('restart-btn');
  const $startBtn   = document.getElementById('start-btn');
  const $diffSection = document.getElementById('difficulty-section');

  // ─────────────────────────── Audio Engine (Web Audio API) ─────────────
  let audioCtx = null;
  let soundEnabled = true;

  /** Initialize AudioContext on first user interaction */
  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  /**
   * Play a synthesized sound effect
   * @param {'hit'|'wall'|'score'|'win'} type
   */
  function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    switch (type) {
      case 'hit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'wall':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
        break;
      case 'score':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      case 'win':
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(550, now + 0.15);
        osc.frequency.setValueAtTime(660, now + 0.3);
        osc.frequency.setValueAtTime(880, now + 0.45);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
        break;
    }
  }

  // ─────────────────────────── Game Config ──────────────────────────────
  const CONFIG = {
    WIN_SCORE: 7,
    PADDLE_WIDTH: 14,
    PADDLE_HEIGHT: 100,
    PADDLE_RADIUS: 7,
    PADDLE_SPEED: 7,
    BALL_RADIUS: 8,
    BALL_INITIAL_SPEED: 5,
    BALL_SPEED_INCREMENT: 0.15,     // speed gained each rally hit
    BALL_MAX_SPEED: 14,
    DASH_GAP: 18,
    TRAIL_LENGTH: 12,
    PARTICLE_COUNT: 8,
    AI_DIFFICULTY: {
      easy:   { speed: 3.2, reaction: 0.35, errorMargin: 50 },
      medium: { speed: 5.0, reaction: 0.65, errorMargin: 20 },
      hard:   { speed: 7.5, reaction: 0.92, errorMargin: 5 },
    }
  };

  // ─────────────────────────── Game State ───────────────────────────────
  let gameMode    = 'pvp';   // 'pvp' | 'ai'
  let difficulty  = 'medium';
  let paused      = false;
  let running     = false;
  let animFrameId = null;
  let canvasW, canvasH;
  let lastTime = 0;

  // Scores
  let scoreP1 = 0;
  let scoreP2 = 0;

  // Paddles
  const paddleL = { x: 0, y: 0, w: 0, h: 0, dy: 0 };
  const paddleR = { x: 0, y: 0, w: 0, h: 0, dy: 0 };

  // Ball
  const ball = { x: 0, y: 0, r: 0, dx: 0, dy: 0, speed: 0 };

  // Trail & particles
  let trail = [];
  let particles = [];

  // Input
  const keys = {};

  // Touch state
  const touchState = { p1Up: false, p1Down: false, p2Up: false, p2Down: false };

  // AI tracking
  let aiTargetY = 0;
  let aiUpdateTimer = 0;

  // Dash animation offset
  let dashOffset = 0;

  // ─────────────────────────── Canvas Sizing ────────────────────────────
  function resizeCanvas() {
    const maxW = Math.min(window.innerWidth - 32, 900);
    const maxH = Math.min(window.innerHeight - 200, 560);
    const aspect = 900 / 560;

    if (maxW / maxH > aspect) {
      canvasH = maxH;
      canvasW = Math.round(maxH * aspect);
    } else {
      canvasW = maxW;
      canvasH = Math.round(maxW / aspect);
    }

    $canvas.width  = canvasW;
    $canvas.height = canvasH;
    $canvas.style.width  = canvasW + 'px';
    $canvas.style.height = canvasH + 'px';

    // Re-position paddles
    const pw = CONFIG.PADDLE_WIDTH * (canvasW / 900);
    const ph = CONFIG.PADDLE_HEIGHT * (canvasH / 560);

    paddleL.w = pw;
    paddleL.h = ph;
    paddleL.x = 20 * (canvasW / 900);
    if (paddleL.y < 0 || paddleL.y + ph > canvasH) paddleL.y = (canvasH - ph) / 2;

    paddleR.w = pw;
    paddleR.h = ph;
    paddleR.x = canvasW - 20 * (canvasW / 900) - pw;
    if (paddleR.y < 0 || paddleR.y + ph > canvasH) paddleR.y = (canvasH - ph) / 2;
  }

  // ─────────────────────────── Init / Reset ─────────────────────────────
  function initGame() {
    scoreP1 = 0;
    scoreP2 = 0;
    updateScoreboard();
    trail = [];
    particles = [];

    resizeCanvas();

    const ph = CONFIG.PADDLE_HEIGHT * (canvasH / 560);
    paddleL.y = (canvasH - ph) / 2;
    paddleR.y = (canvasH - ph) / 2;

    resetBall(1);
    paused = false;
    $pauseOvl.classList.remove('visible');
    $btnPause.textContent = '⏸ PAUSE';
  }

  function resetBall(dir) {
    ball.r = CONFIG.BALL_RADIUS * (canvasW / 900);
    ball.x = canvasW / 2;
    ball.y = canvasH / 2;
    ball.speed = CONFIG.BALL_INITIAL_SPEED * (canvasW / 900);

    // Random angle between -30 and 30 degrees
    const angle = (Math.random() * 60 - 30) * (Math.PI / 180);
    ball.dx = Math.cos(angle) * ball.speed * dir;
    ball.dy = Math.sin(angle) * ball.speed;

    trail = [];
  }

  // ─────────────────────────── Scoreboard ───────────────────────────────
  function updateScoreboard() {
    $scoreP1.textContent = scoreP1;
    $scoreP2.textContent = scoreP2;
  }

  // ─────────────────────────── Particles ────────────────────────────────
  function spawnParticles(x, y, color) {
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        radius: 2 + Math.random() * 3,
        color
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.dx;
      p.y += p.dy;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('1)', p.life * 0.6 + ')');
      ctx.fill();
    }
  }

  // ─────────────────────────── Trail ────────────────────────────────────
  function updateTrail() {
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > CONFIG.TRAIL_LENGTH) trail.shift();
  }

  function drawTrail() {
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const alpha = (i / trail.length) * 0.35;
      const radius = ball.r * (i / trail.length) * 0.8;
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(176, 38, 255, ${alpha})`;
      ctx.fill();
    }
  }

  // ─────────────────────────── Drawing ──────────────────────────────────
  function drawBackground() {
    // Dark gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, '#0d0d24');
    grad.addColorStop(1, '#070714');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  function drawCenterLine() {
    dashOffset = (dashOffset + 0.3) % (CONFIG.DASH_GAP * 2);
    ctx.save();
    ctx.setLineDash([CONFIG.DASH_GAP, CONFIG.DASH_GAP]);
    ctx.lineDashOffset = -dashOffset;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvasW / 2, 0);
    ctx.lineTo(canvasW / 2, canvasH);
    ctx.stroke();
    ctx.restore();
  }

  function drawPaddle(paddle, color, shadowColor) {
    const r = CONFIG.PADDLE_RADIUS * (canvasW / 900);
    ctx.save();
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 18;

    // Rounded rect
    ctx.beginPath();
    ctx.moveTo(paddle.x + r, paddle.y);
    ctx.lineTo(paddle.x + paddle.w - r, paddle.y);
    ctx.quadraticCurveTo(paddle.x + paddle.w, paddle.y, paddle.x + paddle.w, paddle.y + r);
    ctx.lineTo(paddle.x + paddle.w, paddle.y + paddle.h - r);
    ctx.quadraticCurveTo(paddle.x + paddle.w, paddle.y + paddle.h, paddle.x + paddle.w - r, paddle.y + paddle.h);
    ctx.lineTo(paddle.x + r, paddle.y + paddle.h);
    ctx.quadraticCurveTo(paddle.x, paddle.y + paddle.h, paddle.x, paddle.y + paddle.h - r);
    ctx.lineTo(paddle.x, paddle.y + r);
    ctx.quadraticCurveTo(paddle.x, paddle.y, paddle.x + r, paddle.y);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    // Outer glow
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Inner neon ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176, 38, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawScoreFlash() {
    // Subtle vignette corners
    const grad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasW * 0.3, canvasW / 2, canvasH / 2, canvasW * 0.7);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // ─────────────────────────── Collision Detection ──────────────────────
  function checkPaddleCollision() {
    const scale = canvasW / 900;

    // Left paddle
    if (
      ball.dx < 0 &&
      ball.x - ball.r <= paddleL.x + paddleL.w &&
      ball.x - ball.r >= paddleL.x - 4 * scale &&
      ball.y >= paddleL.y &&
      ball.y <= paddleL.y + paddleL.h
    ) {
      handlePaddleHit(paddleL, 1);
    }

    // Right paddle
    if (
      ball.dx > 0 &&
      ball.x + ball.r >= paddleR.x &&
      ball.x + ball.r <= paddleR.x + paddleR.w + 4 * scale &&
      ball.y >= paddleR.y &&
      ball.y <= paddleR.y + paddleR.h
    ) {
      handlePaddleHit(paddleR, -1);
    }
  }

  function handlePaddleHit(paddle, dirX) {
    // Calculate hit position (-1 to 1)
    const hitPos = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
    const maxAngle = 65 * (Math.PI / 180);
    const angle = hitPos * maxAngle;

    // Increase speed
    ball.speed = Math.min(ball.speed + CONFIG.BALL_SPEED_INCREMENT * (canvasW / 900), CONFIG.BALL_MAX_SPEED * (canvasW / 900));
    ball.dx = Math.cos(angle) * ball.speed * dirX;
    ball.dy = Math.sin(angle) * ball.speed;

    // Position correction
    if (dirX === 1) {
      ball.x = paddleL.x + paddleL.w + ball.r;
    } else {
      ball.x = paddleR.x - ball.r;
    }

    playSound('hit');
    spawnParticles(ball.x, ball.y, 'rgba(0, 240, 255, 1)');
  }

  function checkWallCollision() {
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.dy = Math.abs(ball.dy);
      playSound('wall');
      spawnParticles(ball.x, ball.y, 'rgba(255, 255, 255, 1)');
    }
    if (ball.y + ball.r >= canvasH) {
      ball.y = canvasH - ball.r;
      ball.dy = -Math.abs(ball.dy);
      playSound('wall');
      spawnParticles(ball.x, ball.y, 'rgba(255, 255, 255, 1)');
    }
  }

  function checkScore() {
    // Ball passed left edge
    if (ball.x + ball.r < 0) {
      scoreP2++;
      updateScoreboard();
      playSound('score');
      if (scoreP2 >= CONFIG.WIN_SCORE) {
        showWinScreen(2);
      } else {
        resetBall(1);
      }
    }
    // Ball passed right edge
    if (ball.x - ball.r > canvasW) {
      scoreP1++;
      updateScoreboard();
      playSound('score');
      if (scoreP1 >= CONFIG.WIN_SCORE) {
        showWinScreen(1);
      } else {
        resetBall(-1);
      }
    }
  }

  // ─────────────────────────── AI Logic ─────────────────────────────────
  function updateAI(dt) {
    const diff = CONFIG.AI_DIFFICULTY[difficulty];
    aiUpdateTimer += dt;

    // Update target at intervals based on reaction
    if (aiUpdateTimer > (1 - diff.reaction) * 0.25) {
      aiUpdateTimer = 0;
      // Predict where ball will be
      if (ball.dx > 0) {
        // Ball coming towards AI paddle
        const timeToReach = (paddleR.x - ball.x) / ball.dx;
        aiTargetY = ball.y + ball.dy * timeToReach;
        // Add error
        aiTargetY += (Math.random() - 0.5) * diff.errorMargin * 2 * (canvasH / 560);
      } else {
        // Ball going away, return to center
        aiTargetY = canvasH / 2;
      }
    }

    // Move paddle towards target
    const paddleCenter = paddleR.y + paddleR.h / 2;
    const diff_y = aiTargetY - paddleCenter;
    const moveSpeed = diff.speed * (canvasH / 560);

    if (Math.abs(diff_y) > 4) {
      if (diff_y > 0) {
        paddleR.y = Math.min(paddleR.y + moveSpeed, canvasH - paddleR.h);
      } else {
        paddleR.y = Math.max(paddleR.y - moveSpeed, 0);
      }
    }
  }

  // ─────────────────────────── Input ────────────────────────────────────
  function handleInput() {
    const speed = CONFIG.PADDLE_SPEED * (canvasH / 560);

    // Left paddle (Player 1) — W / S
    if (keys['w'] || keys['W'] || touchState.p1Up) {
      paddleL.y = Math.max(paddleL.y - speed, 0);
    }
    if (keys['s'] || keys['S'] || touchState.p1Down) {
      paddleL.y = Math.min(paddleL.y + speed, canvasH - paddleL.h);
    }

    // Right paddle (Player 2 / manual) — Arrow Up / Down
    if (gameMode === 'pvp') {
      if (keys['ArrowUp'] || touchState.p2Up) {
        paddleR.y = Math.max(paddleR.y - speed, 0);
      }
      if (keys['ArrowDown'] || touchState.p2Down) {
        paddleR.y = Math.min(paddleR.y + speed, canvasH - paddleR.h);
      }
    }
  }

  // ─────────────────────────── Game Loop ────────────────────────────────
  function gameLoop(timestamp) {
    if (!running) return;
    animFrameId = requestAnimationFrame(gameLoop);

    // Delta time (cap at 33ms to avoid tunneling on tab switch)
    const dt = Math.min((timestamp - lastTime) / 16.67, 2);
    lastTime = timestamp;

    if (paused) return;

    // --- Update ---
    handleInput();

    if (gameMode === 'ai') {
      updateAI(dt * 0.0167); // pass seconds
    }

    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    checkWallCollision();
    checkPaddleCollision();
    checkScore();

    updateTrail();
    updateParticles();

    // --- Draw ---
    drawBackground();
    drawCenterLine();
    drawScoreFlash();
    drawTrail();
    drawParticles();
    drawPaddle(paddleL, '#00f0ff', 'rgba(0, 240, 255, 0.6)');
    drawPaddle(paddleR, '#ff2d95', 'rgba(255, 45, 149, 0.6)');
    drawBall();
  }

  // ─────────────────────────── Screen Management ────────────────────────
  function showStartScreen() {
    $startScreen.classList.remove('hidden');
    $gameContainer.style.display = 'none';
    $winScreen.classList.remove('visible');
    running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }

  function startGame() {
    ensureAudioCtx();
    $startScreen.classList.add('hidden');
    $gameContainer.style.display = 'flex';
    $winScreen.classList.remove('visible');

    $modeLabel.textContent = gameMode === 'ai' ? `vs AI (${difficulty})` : '2 Players';

    initGame();
    running = true;
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function showWinScreen(player) {
    running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    playSound('win');

    const isP1 = player === 1;
    $winText.textContent = isP1 ? 'PLAYER 1 WINS!' : (gameMode === 'ai' ? 'AI WINS!' : 'PLAYER 2 WINS!');
    $winText.style.color = isP1 ? '#00f0ff' : '#ff2d95';
    $winText.style.textShadow = isP1
      ? '0 0 10px #00f0ff, 0 0 30px #00f0ff'
      : '0 0 10px #ff2d95, 0 0 30px #ff2d95';
    $winScore.textContent = `${scoreP1} — ${scoreP2}`;

    $winScreen.classList.add('visible');
  }

  function restartGame() {
    $winScreen.classList.remove('visible');
    initGame();
    running = true;
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  // ─────────────────────────── Event Listeners ──────────────────────────

  // Keyboard
  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    // Prevent arrow key scrolling
    if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }

    // Spacebar — pause toggle
    if (e.key === ' ' && running) {
      togglePause();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  // Touch controls
  document.querySelectorAll('.touch-btn').forEach(btn => {
    const action = btn.dataset.action;

    function setTouch(val) {
      switch (action) {
        case 'p1-up':   touchState.p1Up   = val; break;
        case 'p1-down': touchState.p1Down = val; break;
        case 'p2-up':   touchState.p2Up   = val; break;
        case 'p2-down': touchState.p2Down = val; break;
      }
    }

    btn.addEventListener('touchstart', (e) => { e.preventDefault(); setTouch(true); });
    btn.addEventListener('touchend',   (e) => { e.preventDefault(); setTouch(false); });
    btn.addEventListener('mousedown',  () => setTouch(true));
    btn.addEventListener('mouseup',    () => setTouch(false));
    btn.addEventListener('mouseleave', () => setTouch(false));
  });

  // Pause / Resume
  function togglePause() {
    paused = !paused;
    $pauseOvl.classList.toggle('visible', paused);
    $btnPause.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
  }

  $btnPause.addEventListener('click', () => {
    if (running) togglePause();
  });

  // Sound toggle
  $btnSound.addEventListener('click', () => {
    ensureAudioCtx();
    soundEnabled = !soundEnabled;
    $btnSound.textContent = soundEnabled ? '🔊 SOUND' : '🔇 MUTED';
    $btnSound.classList.toggle('active', !soundEnabled);
  });

  // Restart
  $btnRestart.addEventListener('click', () => {
    if (running || paused) {
      running = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      $winScreen.classList.remove('visible');
      initGame();
      running = true;
      lastTime = performance.now();
      animFrameId = requestAnimationFrame(gameLoop);
    }
  });

  // Start button
  $startBtn.addEventListener('click', startGame);

  // Restart from win screen
  $restartBtn.addEventListener('click', restartGame);

  // Mode selector
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      gameMode = btn.dataset.mode;

      if (gameMode === 'ai') {
        $diffSection.style.opacity = '1';
        $diffSection.style.pointerEvents = 'auto';
      } else {
        $diffSection.style.opacity = '0.3';
        $diffSection.style.pointerEvents = 'none';
      }
    });
  });

  // Difficulty selector
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      difficulty = btn.dataset.diff;
    });
  });

  // Responsive resize
  window.addEventListener('resize', () => {
    if (running) resizeCanvas();
  });

  // ─────────────────────────── Boot ─────────────────────────────────────
  showStartScreen();

})();
