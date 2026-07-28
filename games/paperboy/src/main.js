import { Game, DIFFICULTY, DIFFICULTY_ORDER, SCENES, SCENE_ORDER } from './game.js';

const $ = (id) => document.getElementById(id);

const screenEl = $('screen');
const canvas = $('view');

// ------------------------------------------------------------------ helpers

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty'];
const words = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad6 = (n) => Math.max(0, Math.round(n)).toString().padStart(6, '0');

const BIKE_SVG = `<svg viewBox="0 0 26 16" aria-hidden="true">
  <circle cx="5.5" cy="11" r="4" fill="none" stroke="#e8e4d8" stroke-width="1.6"/>
  <circle cx="20.5" cy="11" r="4" fill="none" stroke="#e8e4d8" stroke-width="1.6"/>
  <path d="M5.5 11 L11 4 L17 11 L11 11 Z M17 11 L20.5 11 M11 4 L15 4"
        fill="none" stroke="#c8352b" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;

// ---------------------------------------------------------------------- UI

const ui = {
  toastQueue: [],

  setScore(n) { $('score').textContent = pad6(n); },
  setPapers(n) { $('papers').textContent = n; },
  setDay(n) { $('day').textContent = n; },
  setSubs(done, total) { $('subs').textContent = `${done}/${total}`; },
  setProgress(t) { $('route').style.width = `${(t * 100).toFixed(1)}%`; },

  setLives(n, max) {
    const el = $('lives');
    const total = Math.min(6, Math.max(max || 3, n));
    let html = '';
    for (let i = 0; i < total; i++) {
      html += BIKE_SVG.replace('<svg ', `<svg class="${i < n ? '' : 'spent'}" `);
    }
    el.innerHTML = html;
  },

  setCombo(n) {
    const el = $('combo');
    const mult = 1 + Math.floor(n / 2);
    if (n >= 2) {
      el.textContent = `×${mult} STREAK`;
      el.classList.add('on');
    } else {
      el.classList.remove('on');
    }
  },

  toast(text, kind) {
    const box = $('toasts');
    // Holding the throw key with an empty satchel should say so once, not stack.
    const now = performance.now();
    if (text === this._lastToast && now - this._lastToastAt < 900) return;
    this._lastToast = text;
    this._lastToastAt = now;
    const el = document.createElement('div');
    el.className = `toast ${kind || ''}`;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, 900);
  },

  setState(state) {
    const menu = state === 'title' || state === 'difficulty' || state === 'howto';
    $('hud').classList.toggle('on', !menu && state !== 'daycard');
    $('ov-title').classList.toggle('on', state === 'title');
    $('ov-difficulty').classList.toggle('on', state === 'difficulty');
    $('ov-howto').classList.toggle('on', state === 'howto');
    $('ov-daycard').classList.toggle('on', state === 'daycard');
    $('ov-results').classList.toggle('on', state === 'results' || state === 'gameover');
    $('ov-pause').classList.toggle('on', state === 'paused');
  },

  // Three shift cards, each showing what it actually changes and your best
  // score on it.
  renderShifts(current, bests) {
    const tint = { easy: '#7fc98a', normal: '#f2a65a', hard: '#e0574a' };
    $('diff-cards').innerHTML = DIFFICULTY_ORDER.map((id, i) => {
      const d = DIFFICULTY[id];
      const best = bests[id];
      return `<button class="card" type="button" data-diff="${id}"
          style="--shift:${tint[id]}" aria-pressed="${id === current}">
        <span class="card-key">${i + 1}</span>
        <h3>${d.name}</h3>
        <p>${d.blurb}</p>
        <ul>${d.detail.map((t) => `<li>${t}</li>`).join('')}</ul>
        <span class="card-best">${best ? `Best ${pad6(best)}` : 'No round filed'}</span>
      </button>`;
    }).join('');
  },

  renderScenes(current) {
    $('scene-chips').innerHTML = SCENE_ORDER.map((id) =>
      `<button class="chip" type="button" data-scene="${id}" aria-pressed="${id === current}">${SCENES[id].short}</button>`
    ).join('');
    $('scene-blurb').textContent = SCENES[current].blurb;
  },

  showDayCard(d) {
    $('ov-daycard').innerHTML = `
      <div class="daycard">
        <div class="eyebrow">${d.difficulty}</div>
        <div class="big">Day ${d.day}</div>
        <div class="street">${d.street}</div>
        <div class="facts">
          <span><b>${d.subscribers}</b> subscribers</span>
          <span><b>${d.papers}</b> papers</span>
          <span><b>${d.lives}</b> bikes</span>
        </div>
      </div>`;
  },

  setBestLine(best) {
    $('best-line').innerHTML = best
      ? `Best on this shift <b>${pad6(best)}</b>`
      : '&nbsp;';
  },

  showResults(r) {
    const rows = [
      ['Papers thrown', r.thrown],
      ['Landed on the porch', r.delivered - r.bullseyes],
      ['Straight in the box', r.bullseyes],
      ['Windows broken', r.smashed],
      ['Longest streak', r.bestCombo],
    ];
    if (r.bestThrow) rows.push([`Best single throw (${r.bestThrowLabel})`, r.bestThrow]);
    const warnRows = [];
    if (r.missed) warnRows.push(['Porches left empty', r.missed]);
    if (r.cancelled) warnRows.push(['Subscriptions cancelled', r.cancelled]);
    if (r.crashes) warnRows.push(['Wipeouts', r.crashes]);

    const bonuses = [];
    if (!r.fired) {
      if (r.papersLeft) bonuses.push([`Papers left over (${r.papersLeft} &times; 25)`, r.papersLeft * 25]);
      if (r.lives) bonuses.push([`Bikes intact (${r.lives} &times; 500)`, r.lives * 500]);
      if (r.perfect) bonuses.push(['Perfect route', 3000]);
    }

    const sentences = [];
    sentences.push(
      `${cap(words(r.delivered))} of ${words(r.subscriberTotal)} subscribers found a paper waiting`
      + (r.bullseyes ? `, ${words(r.bullseyes)} of them folded neatly into the box` : '') + '.'
    );
    if (r.smashed) sentences.push(`${cap(words(r.smashed))} ${r.smashed === 1 ? 'window' : 'windows'} did not survive the morning.`);
    if (r.missed) sentences.push(`${cap(words(r.missed))} ${r.missed === 1 ? 'porch was' : 'porches were'} left empty.`);
    if (r.crashes) sentences.push(`${cap(words(r.crashes))} ${r.crashes === 1 ? 'wipeout' : 'wipeouts'} reported on the 400 block.`);
    if (!r.smashed && !r.missed && !r.crashes) sentences.push('Not a single complaint was phoned in to this desk.');

    const stamp = r.fired ? 'Route reassigned'
      : r.perfect ? 'Perfect route'
        : r.missed + r.cancelled === 0 ? 'Clean sheet' : `Day ${r.day} filed`;

    const next = r.fired
      ? 'Press <b>Space</b> to take the route back from the top'
      : `Press <b>Space</b> to ride Day ${r.day + 1}`;

    $('ov-results').innerHTML = `
      <div class="page" role="document">
        <div class="masthead">The West Elm Herald</div>
        <div class="dateline">
          <span>Day ${r.day} &middot; Late Edition</span>
          <span>${r.difficulty || 'Weekday Route'}</span>
          <span>Price 35&cent;</span>
        </div>
        <h2 class="headline">${r.headline}</h2>
        <p class="standfirst">${sentences.join(' ')}</p>
        <div class="cols">
          <div class="ledger">
            <h3>Route ledger</h3>
            <table>
              ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
              ${warnRows.map(([k, v]) => `<tr class="warn"><td>${k}</td><td>${v}</td></tr>`).join('')}
            </table>
          </div>
          <div>
            <div class="total">
              <div class="label">Total score</div>
              <div class="big">${pad6(r.score)}</div>
            </div>
            <div class="stamp">${r.newBest ? 'New record' : stamp}</div>
            ${r.best ? `<div class="ledger bonus"><h3>Best on ${r.difficulty || 'this shift'}</h3>
              <table><tr><td>${r.newBest ? 'Set this round' : 'Standing record'}</td>
              <td>${pad6(r.best)}</td></tr></table></div>` : ''}
            ${bonuses.length ? `<div class="ledger bonus"><h3>End-of-route bonus</h3><table>${bonuses
              .map(([k, v]) => `<tr><td>${k}</td><td>+${v}</td></tr>`).join('')}</table></div>` : ''}
          </div>
        </div>
        <div class="next">${next}</div>
      </div>`;
  },
};

// -------------------------------------------------------------------- boot

let game;
try {
  game = new Game(canvas, ui);
} catch (err) {
  document.querySelector('.cab').innerHTML =
    `<div class="err"><strong>This game needs WebGL.</strong><br>` +
    `Your browser reported: ${String(err && err.message ? err.message : err)}<br><br>` +
    `Try a different browser, or enable hardware acceleration and reload.</div>`;
  throw err;
}

window.__game = game;   // handy from the console, and how the test harness peeks in

ui.setLives(3);
ui.setCombo(0);
game.startTitle();
ui.setBestLine(game.loadBests()[game.difficulty]);
ui.setState('title');

// ------------------------------------------------------------------- input

const held = { left: false, right: false, up: false, down: false };
let paused = false;
let rawSteer = 0;
let touchSteer = 0;
let touchThrottle = 0;
let usingTouch = false;

function beginRun(day) {
  paused = false;
  game.audio.start();
  game.startRun(day);
}

function showShifts() {
  game.state = 'difficulty';
  ui.renderShifts(game.difficulty, game.loadBests());
  ui.renderScenes(game.sceneId);
  ui.setState('difficulty');
}

function cycleScene(dir) {
  const i = SCENE_ORDER.indexOf(game.sceneId);
  const next = SCENE_ORDER[(i + dir + SCENE_ORDER.length) % SCENE_ORDER.length];
  game.setScene(next);
  $('scene').value = next;
  ui.renderScenes(next);
}

function showTitle() {
  game.state = 'title';
  ui.setBestLine(game.loadBests()[game.difficulty]);
  ui.setState('title');
}

function chooseShift(id) {
  game.setDifficulty(id);
  $('difficulty').value = id;
  beginRun(1);
}

// Space is the one key that always moves you forward, whatever screen you are
// looking at.
function advance() {
  switch (game.state) {
    case 'title': showShifts(); break;
    case 'difficulty': chooseShift(game.difficulty); break;
    case 'howto': showTitle(); break;
    case 'results': beginRun(game.day + 1); break;
    case 'gameover': showShifts(); break;
    default: break;
  }
}

function back() {
  if (game.state === 'difficulty' || game.state === 'howto') { showTitle(); return true; }
  return false;
}

function togglePause() {
  if (game.state !== 'play' && game.state !== 'crashed' && !paused) return;
  paused = !paused;
  ui.setState(paused ? 'paused' : game.state);
  if (paused) game.audio.stopMusic();
  else game.audio.startMusic();
}

const CODES = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

window.addEventListener('keydown', (e) => {
  if (e.repeat && e.code !== 'Space') {
    if (CODES[e.code]) e.preventDefault();
    return;
  }
  const dir = CODES[e.code];
  if (dir) {
    if (game.state === 'difficulty' && (dir === 'left' || dir === 'right')) {
      cycleScene(dir === 'right' ? 1 : -1);
      e.preventDefault();
      return;
    }
    held[dir] = true;
    e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (e.repeat) return;
      if (game.state === 'play') game.input.throwAuto = true;
      else advance();
      break;
    case 'Enter':
      advance();
      break;
    case 'KeyQ':
      if (game.state === 'play') game.input.throwL = true;
      break;
    case 'KeyE':
      if (game.state === 'play') game.input.throwR = true;
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
      if (game.state === 'difficulty') chooseShift(DIFFICULTY_ORDER[+e.code.slice(-1) - 1]);
      break;
    case 'KeyH':
      if (game.state === 'title' || game.state === 'difficulty') {
        game.state = 'howto';
        ui.setState('howto');
      } else if (game.state === 'howto') showTitle();
      break;
    case 'KeyP':
      togglePause();
      break;
    case 'Escape':
      if (!back()) togglePause();
      break;
    case 'KeyM':
      toggleSound();
      break;
    case 'KeyR':
      if (game.state !== 'play' && game.state !== 'daycard') {
        game.lives = null;
        game.score = 0;
        showShifts();
      }
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (e) => {
  const dir = CODES[e.code];
  if (dir) held[dir] = false;
});

window.addEventListener('blur', () => {
  held.left = held.right = held.up = held.down = false;
  if (game.state === 'play' && !paused) togglePause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'play' && !paused) togglePause();
});

// Click the left or right half of the screen to throw that way.
screenEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.pad') || e.target.closest('.tbtn')) return;
  screenEl.focus({ preventScroll: true });
  // Cards and links on the menu screens handle their own clicks.
  if (e.target.closest('.card') || e.target.closest('.chip') || e.target.closest('.linkish')) return;
  if (game.state === 'daycard') return;
  if (game.state !== 'play') { advance(); return; }
  const r = screenEl.getBoundingClientRect();
  if (e.clientX - r.left < r.width / 2) game.input.throwL = true;
  else game.input.throwR = true;
});
screenEl.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ touch

if (window.matchMedia('(pointer: coarse)').matches) {
  usingTouch = true;
  $('touch').classList.add('on');
  document.querySelector('.cab').classList.add('has-touch');
  $('start-prompt').textContent = 'Tap to start';
}

const pad = $('pad');
let padId = null;
let padOrigin = { x: 0, y: 0 };

pad.addEventListener('pointerdown', (e) => {
  padId = e.pointerId;
  pad.setPointerCapture(e.pointerId);
  pad.classList.add('active');
  padOrigin = { x: e.clientX, y: e.clientY };
  if (game.state !== 'play' && game.state !== 'crashed') advance();
  e.preventDefault();
});
pad.addEventListener('pointermove', (e) => {
  if (e.pointerId !== padId) return;
  const r = pad.getBoundingClientRect();
  touchSteer = Math.max(-1, Math.min(1, (e.clientX - padOrigin.x) / (r.width * 0.32)));
  touchThrottle = Math.max(-1, Math.min(1, -(e.clientY - padOrigin.y) / (r.height * 0.4)));
});
const padEnd = (e) => {
  if (e.pointerId !== padId) return;
  padId = null;
  pad.classList.remove('active');
  touchSteer = 0;
  touchThrottle = 0;
};
pad.addEventListener('pointerup', padEnd);
pad.addEventListener('pointercancel', padEnd);

for (const [id, key] of [['tl-btn', 'throwL'], ['tr-btn', 'throwR']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (game.state === 'play') game.input[key] = true;
    else advance();
  });
}

// ------------------------------------------------------------------- deck

function toggleSound() {
  const b = $('sound');
  const on = b.getAttribute('aria-pressed') === 'true';
  const next = !on;
  b.setAttribute('aria-pressed', String(next));
  b.textContent = next ? 'Sound On' : 'Sound Off';
  game.audio.setMuted(!next);
}
$('sound').addEventListener('click', toggleSound);

$('diff-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) chooseShift(card.dataset.diff);
});

$('scene-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  game.setScene(chip.dataset.scene);
  $('scene').value = chip.dataset.scene;
  ui.renderScenes(game.sceneId);
});

$('scene').innerHTML = SCENE_ORDER
  .map((id) => `<option value="${id}">${SCENES[id].short}</option>`).join('');
$('scene').value = game.sceneId;
$('scene').addEventListener('change', (e) => {
  game.setScene(e.target.value);
  if (game.state === 'difficulty') ui.renderScenes(game.sceneId);
  screenEl.focus({ preventScroll: true });
});

$('howto-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  game.state = 'howto';
  ui.setState('howto');
});

$('difficulty').addEventListener('change', (e) => {
  game.setDifficulty(e.target.value);
  if (game.state === 'title') ui.setBestLine(game.loadBests()[game.difficulty]);
  if (game.state === 'difficulty') ui.renderShifts(game.difficulty, game.loadBests());
  screenEl.focus({ preventScroll: true });
});

$('camera').addEventListener('change', (e) => {
  game.cameraDynamic = e.target.value === 'dynamic';
  screenEl.focus({ preventScroll: true });
});

$('quality').addEventListener('change', (e) => {
  game.setQuality(parseInt(e.target.value, 10));
  screenEl.focus({ preventScroll: true });
});

$('restart').addEventListener('click', () => {
  game.lives = null;
  game.score = 0;
  showShifts();
  screenEl.focus({ preventScroll: true });
});

// ------------------------------------------------------------------ resize

const ro = new ResizeObserver(() => game.resize());
ro.observe(screenEl);
window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  paused = true;
  ui.setState('paused');
  $('ov-pause').innerHTML =
    '<h2 class="wordmark">Signal lost</h2><div class="start">Reload the page to keep riding</div>';
});

// -------------------------------------------------------------------- loop

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;

function tick(now) {
  requestAnimationFrame(tick);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;      // a long stall must not teleport the bike
  if (dt <= 0) return;

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    $('fps').textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  const target = usingTouch && padId !== null
    ? touchSteer
    : (held.right ? 1 : 0) - (held.left ? 1 : 0);
  rawSteer += (target - rawSteer) * (1 - Math.exp(-17 * dt));
  game.input.steer = Math.abs(rawSteer) < 0.004 ? 0 : rawSteer;
  game.input.throttle = usingTouch && padId !== null
    ? touchThrottle
    : (held.up ? 1 : 0) - (held.down ? 1 : 0);

  if (!paused) game.update(dt);
  game.render();
}

requestAnimationFrame(tick);
