import * as THREE from 'three';
import * as MODELS from './models.js';
import { LAYOUT } from './models.js';
import { makeTextures } from './textures.js';
import { N64Pass } from './post.js';
import { World, HOUSE_COUNT } from './world.js';
import { HOUSE_SPEC } from './models.js';
import { Audio } from './audio.js';
import { clamp, lerp, damp, mulberry32, range } from './util.js';

const GRAV = 26;
const THROW_SPEED = 27;
const LATERAL = 9.2;
const PLAYER_R = 0.55;
const MAX_PAPERS = 34;

// Difficulty is not a single number. Slowing the traffic and the dogs is what
// actually makes the street readable, so that is what the easy setting does;
// the harder settings speed the same things up and hand you fewer papers and
// fewer bikes to spend. Score is scaled to keep the leaderboards honest.
export const DIFFICULTY = {
  easy: {
    id: 'easy',
    name: 'Sunday Round',
    blurb: 'Traffic crawls, the dogs are half-hearted and you ride with five bikes and a full satchel.',
    detail: ['Cars 40% slower', 'Dogs 35% slower', 'Five bikes, 22 papers', 'Score ×0.8'],
    carSpeed: 0.6, dogSpeed: 0.65, hazard: 0.72, traffic: 0.75,
    bikeSpeed: 13.5, lives: 5, papers: 22, scoreMul: 0.8,
  },
  normal: {
    id: 'normal',
    name: 'Weekday Route',
    blurb: 'The route as it is meant to be ridden. Real traffic, real dogs, three bikes.',
    detail: ['Standard traffic', 'Standard dogs', 'Three bikes, 16 papers', 'Score ×1.0'],
    carSpeed: 1, dogSpeed: 1, hazard: 1, traffic: 1,
    bikeSpeed: 16, lives: 3, papers: 16, scoreMul: 1,
  },
  hard: {
    id: 'hard',
    name: 'Rush Hour',
    blurb: 'Everyone is late for work. The street is faster, busier and far less forgiving.',
    detail: ['Cars 45% faster', 'Dogs 30% faster', 'Two bikes, 13 papers', 'Score ×1.5'],
    carSpeed: 1.45, dogSpeed: 1.3, hazard: 1.3, traffic: 1.35,
    bikeSpeed: 19, lives: 2, papers: 13, scoreMul: 1.5,
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = new Audio();
    this.state = 'title';
    this.time = 0;
    this.day = 1;
    this.quality = 270;
    this.difficulty = 'normal';
    this.diff = DIFFICULTY.normal;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(0xc9bfb4, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    // Warm haze rather than blue distance -- it is a quarter past sunrise.
    this.scene.fog = new THREE.FogExp2(0xc9bfb4, 0.0125);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.4, 320);

    // Cartridge-era lighting: one key, one sky/ground bounce, no shadow maps.
    const hemi = new THREE.HemisphereLight(0xc6d8ee, 0x6a7355, 1.35);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd39a, 2.0);
    sun.position.set(-0.62, 0.5, -0.6).multiplyScalar(60);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x5d6478, 0.5));

    this.T = makeTextures();
    this.M = MODELS.makeMaterials(this.T);
    this.world = new World(this.scene, this.M);

    this.rider = MODELS.makeRider(this.M);
    this.scene.add(this.rider.root);
    this.riderShadow = MODELS.shadowPlane(this.M, 2.4);
    this.scene.add(this.riderShadow);

    this.reticles = [MODELS.makeReticle(this.M), MODELS.makeReticle(this.M)];
    for (const r of this.reticles) {
      r.material = this.M.reticle.clone();
      r.visible = false;
      this.scene.add(r);
    }

    // Paper pool.
    this.papers = [];
    for (let i = 0; i < 26; i++) {
      const m = MODELS.makePaperMesh(this.M);
      m.visible = false;
      this.scene.add(m);
      this.papers.push({ mesh: m, alive: false });
    }

    this.post = new N64Pass(this.renderer);

    this.input = {
      steer: 0, throttle: 0,
      left: false, right: false, up: false, down: false,
      throwL: false, throwR: false, throwAuto: false,
    };
    this.throwCooldown = 0;

    this.p = {
      x: 0, y: 0, z: 0, speed: 16, vy: 0, air: false,
      lean: 0, leanV: 0, yaw: 0, crankAngle: 0, airTime: 0,
    };
    this.reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.shake = 0;
    // Delivery cam: while a paper is in the air the look target leans toward
    // it, then holds on the impact just long enough to see what happened.
    this.cameraDynamic = true;
    this.focus = { point: new THREE.Vector3(), paper: null, timer: 0, w: 0 };
    this.camPos = new THREE.Vector3(0, 4, 9);
    this.camLook = new THREE.Vector3(0, 1.4, -8);

    this.resize();
  }

  // --------------------------------------------------------------- lifecycle

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.quality);
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
  }

  setDifficulty(id) {
    if (!DIFFICULTY[id]) return;
    this.difficulty = id;
    this.diff = DIFFICULTY[id];
  }

  // Best score per difficulty, kept in localStorage where it is available.
  // Sandboxed frames can refuse it, and a missing high score is not worth
  // taking the page down for.
  loadBests() {
    try {
      const raw = window.localStorage.getItem('paperboy64.best');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  recordBest(score) {
    const bests = this.loadBests();
    const prev = bests[this.difficulty] || 0;
    if (score <= prev) return false;
    bests[this.difficulty] = score;
    try {
      window.localStorage.setItem('paperboy64.best', JSON.stringify(bests));
    } catch (err) { /* not fatal */ }
    return true;
  }

  startTitle() {
    this.state = 'title';
    this.day = 1;
    this.resetRun(true);
    this.p.z = -62;      // start the flythrough among the houses, not before them
    this.p.speed = 7;
    this.ui.setState('title');
  }

  resetRun(silent) {
    const info = this.world.build(this.day, this.diff);
    this.subscriberTotal = info.subscriberTotal;
    this.finishZ = info.finishZ;
    Object.assign(this.p, {
      // Start on the right-hand sidewalk rather than straddling the centre
      // line -- it is where you want to be riding, and it puts the kerb-hugging
      // bullseye lane under the player from the first house.
      x: 5.4, y: 0, z: 0, speed: this.diff.bikeSpeed, vy: 0, air: false,
      lean: 0, leanV: 0, crankAngle: 0, airTime: 0,
    });
    this.papersLeft = this.diff.papers;
    this.combo = 0;
    this.bestCombo = 0;
    this.invuln = 0;
    this.crashTimer = 0;
    this.stats = {
      delivered: 0, bullseyes: 0, smashed: 0, missed: 0,
      thrown: 0, crashes: 0, cancelled: 0, pickups: 0, airTime: 0,
      bestThrow: 0, bestThrowLabel: '', mansionBoxes: 0,
    };
    if (!silent) {
      this.score = this.score || 0;
      this.lives = this.lives == null ? this.diff.lives : this.lives;
    }
    for (const p of this.papers) { p.alive = false; p.targetHouse = null; p.mesh.visible = false; }
    this.pushHud();
  }

  startRun(day) {
    this.day = day;
    if (day === 1) { this.score = 0; this.lives = this.diff.lives; }
    this.resetRun(false);
    // A beat on the start line before the clock starts: the day, the street,
    // how many subscribers are waiting and which shift you picked.
    this.state = 'daycard';
    this.cardTimer = 2.1;
    // Day one teaches the two verbs; after that the player knows them.
    this.hints = day === 1 ? [
      { z: -30, text: 'SPACE THROWS AT THE LIT PORCH', kind: 'good' },
      { z: -118, text: 'HUG THE CURB FOR MAILBOX SHOTS', kind: 'gold' },
    ] : [];
    this.ui.showDayCard({
      day,
      street: 'West Elm Street',
      subscribers: this.subscriberTotal,
      difficulty: this.diff.name,
      papers: this.papersLeft,
      lives: this.lives,
    });
    this.ui.setState('daycard');
    this.ui.setDay(day);
    this.pushHud();
  }

  pushHud() {
    const done = this.world.entities
      ? this.world.entities.filter((e) => e.kind === 'house' && e.subscriber && e.delivered).length
      : 0;
    this.ui.setScore(this.score || 0);
    this.ui.setPapers(this.papersLeft || 0);
    this.ui.setLives(this.lives == null ? this.diff.lives : this.lives, this.diff.lives);
    this.ui.setSubs(done, this.subscriberTotal || 0);
    this.ui.setCombo(this.combo || 0);
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    if (this.state === 'title' || this.state === 'difficulty' || this.state === 'howto') this.updateTitle(dt);
    else if (this.state === 'daycard') this.updateDayCard(dt);
    else if (this.state === 'play' || this.state === 'crashed') this.updatePlay(dt);
    else if (this.state === 'results' || this.state === 'gameover') this.updateCoast(dt);
    this.updatePapers(dt);
    this.updateFocus(dt);
    this.updateRider(dt);
    this.updateCamera(dt);
    this.post.material.uniforms.uFlash.value = Math.max(0, this.post.material.uniforms.uFlash.value - dt * 3.5);
  }

  // The street keeps running behind the front page and the game-over card.
  updateCoast(dt) {
    const p = this.p;
    p.speed = damp(p.speed, this.state === 'gameover' ? 0 : 3.5, 1.4, dt);
    p.z -= p.speed * dt;
    p.lean = damp(p.lean, 0, 4, dt);
    this.world.update(dt, p, this.time);
    this.updateReticles(false);
  }

  // Held on the start line with the camera easing in, then away we go.
  updateDayCard(dt) {
    this.cardTimer -= dt;
    this.p.speed = damp(this.p.speed, 0.8, 3, dt);
    this.p.z -= this.p.speed * dt;
    this.world.update(dt, this.p, this.time);
    this.updateReticles(false);
    if (this.cardTimer <= 0) {
      this.state = 'play';
      this.p.speed = this.diff.bikeSpeed * 0.75;
      this.invuln = 1.2;   // a beat of grace before the street can hurt you
      this.ui.setState('play');
      this.audio.start();
      this.audio.setTempoScale(1 + (this.day - 1) * 0.03);
      this.audio.startMusic();
    }
  }

  updateTitle(dt) {
    this.p.z -= this.p.speed * dt;
    this.p.x = Math.sin(this.time * 0.32) * 4.2;
    this.p.lean = damp(this.p.lean, Math.cos(this.time * 0.32) * 0.18, 6, dt);
    if (this.p.z < this.finishZ + 40) this.p.z = -62;
    this.world.update(dt, this.p, this.time);
    this.updateReticles(false);
  }

  updatePlay(dt) {
    const p = this.p;
    const crashed = this.state === 'crashed';

    if (crashed) {
      this.crashTimer -= dt;
      p.speed = damp(p.speed, 0, 4, dt);
      p.z -= p.speed * dt;
      if (this.crashTimer <= 0) this.recover();
    } else {
      const base = this.diff.bikeSpeed;
      const targetSpeed = base + this.input.throttle * (this.input.throttle > 0 ? base * 0.56 : base * 0.44)
        + (this.day - 1) * 0.7;
      p.speed = damp(p.speed, targetSpeed, 2.6, dt);
      p.z -= p.speed * dt;

      const steer = this.input.steer;
      p.x += steer * LATERAL * dt * (p.air ? 0.55 : 1);
      p.x = clamp(p.x, LAYOUT.playMinX, LAYOUT.playMaxX);
      p.lean = damp(p.lean, -steer * 0.42, 9, dt);
      p.yaw = damp(p.yaw, -steer * 0.16, 9, dt);

      this.throwCooldown -= dt;
      if (this.throwCooldown <= 0) {
        if (this.input.throwL) this.doThrow(-1);
        else if (this.input.throwR) this.doThrow(1);
        else if (this.input.throwAuto) this.doThrow(0);
      }
      this.input.throwL = this.input.throwR = this.input.throwAuto = false;

      if (this.invuln > 0) this.invuln -= dt;

      if (this.hints && this.hints.length && p.z < this.hints[0].z) {
        const h = this.hints.shift();
        this.ui.toast(h.text, h.kind);
      }

      // Ramps and pickups.
      if (!p.air) {
        const ramp = this.world.triggerTest(p.x, p.z, PLAYER_R, 'ramp');
        if (ramp) {
          p.air = true;
          p.vy = 9.2 + p.speed * 0.16;
          p.airTime = 0;
          this.audio.jump();
        }
      }
      const bundle = this.world.triggerTest(p.x, p.z, PLAYER_R, 'pickup');
      if (bundle) {
        this.world.consume(bundle);
        this.papersLeft = Math.min(MAX_PAPERS, this.papersLeft + 6);
        this.stats.pickups++;
        this.addScore(50);
        this.audio.pickup();
        this.ui.toast('PAPERS +6', 'good');
        this.pushHud();
      }
      const spray = this.world.triggerTest(p.x, p.z, PLAYER_R, 'spray');
      if (spray && !p.air && this.soakCooldown !== spray) {
        this.soakCooldown = spray;
        p.speed *= 0.55;
        this.combo = 0;
        this.audio.soak();
        this.ui.toast('SOAKED!', 'bad');
        this.pushHud();
      }

      // Collisions.
      if (this.invuln <= 0 && !p.air) {
        const hit = this.world.hitTest(p.x, p.z, PLAYER_R);
        if (hit) this.crash(hit);
      }
    }

    // Airborne integration runs in both states so a crash mid-jump lands.
    if (p.air) {
      p.vy -= GRAV * dt;
      p.y += p.vy * dt;
      p.airTime += dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0; p.air = false;
        if (!crashed && p.airTime > 0.3) {
          const bonus = Math.round(p.airTime * 260);
          this.addScore(bonus);
          this.stats.airTime += p.airTime;
          this.ui.toast(`AIR +${bonus}`, 'good');
        }
        this.audio.land();
      }
    }

    this.world.update(dt, p, this.time);
    if (!crashed) {
      this.world.housesPassed(p.z, (h) => this.onMissed(h));
      this.updateReticles(true);
    } else {
      this.updateReticles(false);
    }

    const total = Math.abs(this.finishZ);
    this.ui.setProgress(clamp(Math.abs(p.z) / total, 0, 1));

    if (p.z <= this.finishZ && this.state === 'play') this.finishRoute();
  }

  // ------------------------------------------------------------------ throws

  // A side of 0 means "pick whichever side has the better target".
  doThrow(side) {
    if (this.papersLeft <= 0) {
      this.audio.empty();
      this.ui.toast('OUT OF PAPERS', 'bad');
      return;
    }
    let chosen = side;
    if (side === 0) {
      const l = this.pickTarget(-1);
      const r = this.pickTarget(1);
      // Auto-throw never fires blind -- spending a paper on empty air is the
      // player's call to make with Q or E, not something the assist does.
      if (!l && !r) { this.audio.empty(); return; }
      if (!l) chosen = 1;
      else if (!r) chosen = -1;
      else chosen = l.dist < r.dist ? -1 : 1;
    }
    const target = this.pickTarget(chosen);

    const from = new THREE.Vector3(this.p.x + chosen * 0.45, this.p.y + 1.42, this.p.z + 0.2);
    let vel;
    if (target) {
      vel = this.solveArc(from, target.point);
    } else {
      vel = new THREE.Vector3(chosen * 13.5, 6.4, -14 - this.p.speed * 0.25);
    }

    const slot = this.papers.find((q) => !q.alive);
    if (!slot) return;
    slot.alive = true;
    slot.pos = from.clone();
    slot.vel = vel;
    slot.spin = new THREE.Vector3(range(Math.random, 6, 12), range(Math.random, 4, 9), range(Math.random, -6, 6));
    slot.life = 3.2;
    slot.landed = 0;
    // Claim the target so a second throw retargets the next house instead of
    // piling papers onto one porch.
    slot.targetHouse = target ? target.house : null;
    if (slot.targetHouse) slot.targetHouse.incoming = (slot.targetHouse.incoming || 0) + 1;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from);
    slot.mesh.rotation.set(0, 0, 0);

    this.focus.paper = slot;
    this.focus.timer = 2.0;
    this.focus.point.copy(from);

    this.papersLeft--;
    this.stats.thrown++;
    this.throwCooldown = 0.2;
    this.audio.throwPaper();
    this.rider.arms[chosen > 0 ? 1 : 0].rotation.x = -1.6;
    this.pushHud();
  }

  solveArc(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const horiz = Math.hypot(dx, dz);
    const t = clamp(horiz / THROW_SPEED, 0.26, 1.4);
    return new THREE.Vector3(dx / t, dy / t + 0.5 * GRAV * t, dz / t);
  }

  // Best thing to aim at on one side: a pending subscriber's mailbox (if you
  // are hugging that curb) or doormat, otherwise a non-subscriber's window.
  pickTarget(side) {
    const p = this.p;
    let bestHouse = null;
    let bestD = Infinity;
    let bestKind = null;
    for (const e of this.world.active) {
      if (e.kind !== 'house' || e.side !== side) continue;
      if (e.incoming > 0) continue;
      const d = p.z - e.z;
      if (d < 3 || d > 32) continue;
      const pending = e.subscriber && !e.delivered && !e.missed;
      let kind = null;
      if (pending) kind = p.x * side > 5.2 ? 'mail' : 'porch';
      else if (!e.subscriber && e.tWindows) {
        const idx = e.tWindows.findIndex((_, i) => !(e.broken || []).includes(i));
        if (idx >= 0) kind = 'window:' + idx;
      }
      if (!kind) continue;
      const score = pending ? d : d + 8; // subscribers always win a tie
      if (score < bestD) { bestD = score; bestHouse = e; bestKind = kind; }
    }
    if (!bestHouse) return null;
    let bx;
    if (bestKind === 'mail') bx = bestHouse.tMail;
    else if (bestKind === 'porch') bx = bestHouse.tPorch;
    else bx = bestHouse.tWindows[parseInt(bestKind.split(':')[1], 10)];
    return {
      house: bestHouse, kind: bestKind, dist: p.z - bestHouse.z,
      point: new THREE.Vector3((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2, (bx.z0 + bx.z1) / 2),
    };
  }

  updateReticles(show) {
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const t = show ? this.pickTarget(side) : null;
      const r = this.reticles[i];
      if (!t) { r.visible = false; continue; }
      r.visible = true;
      r.position.copy(t.point);
      r.lookAt(this.camera.position);
      const pulse = 1 + Math.sin(this.time * 8) * 0.06;
      r.scale.setScalar((t.kind === 'mail' ? 0.7 : t.kind === 'porch' ? 1.15 : 0.9) * pulse);
      const c = t.kind === 'mail' ? 0xffd15c : t.kind === 'porch' ? 0xe8e4d8 : 0xc8352b;
      r.material.color.setHex(c);
      r.material.opacity = t.kind === 'mail' ? 1 : 0.78;
    }
  }

  updatePapers(dt) {
    for (const q of this.papers) {
      if (!q.alive) continue;
      q.life -= dt;
      if (q.landed > 0) {
        q.landed -= dt;
        if (q.landed <= 0) { q.alive = false; q.mesh.visible = false; }
        continue;
      }
      const steps = 3;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        q.vel.y -= GRAV * h;
        q.pos.x += q.vel.x * h;
        q.pos.y += q.vel.y * h;
        q.pos.z += q.vel.z * h;
        if (this.resolvePaper(q)) break;
      }
      q.mesh.position.copy(q.pos);
      q.mesh.rotation.x += q.spin.x * dt;
      q.mesh.rotation.y += q.spin.y * dt;
      q.mesh.rotation.z += q.spin.z * dt;
      if (q.life <= 0) { this.releaseTarget(q); q.alive = false; q.mesh.visible = false; }
    }
  }

  // Track the paper in flight, then freeze on wherever it ended up.
  updateFocus(dt) {
    const f = this.focus;
    if (f.timer > 0) f.timer -= dt;
    if (f.paper && (!f.paper.alive || f.paper.landed > 0)) f.paper = null;
    if (f.paper) f.point.copy(f.paper.pos);
    const live = this.cameraDynamic && f.timer > 0 && this.state === 'play';
    f.w = damp(f.w, live ? 1 : 0, live ? 9 : 5.5, dt);
  }

  // Called the moment a paper stops moving, so the hold lands on the impact
  // rather than trailing the arc.
  focusOnImpact(q) {
    if (this.focus.paper !== q) return;
    this.focus.point.copy(q.pos);
    this.focus.paper = null;
    this.focus.timer = Math.min(this.focus.timer, 0.62);
  }

  releaseTarget(q) {
    if (q.targetHouse) {
      q.targetHouse.incoming = Math.max(0, (q.targetHouse.incoming || 1) - 1);
      q.targetHouse = null;
    }
  }

  resolvePaper(q) {
    const { x, y, z } = q.pos;
    for (const e of this.world.active) {
      if (e.kind !== 'house') continue;
      if (Math.abs(e.z - z) > 12) continue;
      if (e.tMail && hit(x, y, z, e.tMail)) return this.onPaperHit(q, e, 'mail');
      if (e.tPorch && hit(x, y, z, e.tPorch)) return this.onPaperHit(q, e, 'porch');
      if (e.tWindows) {
        for (let i = 0; i < e.tWindows.length; i++) {
          if ((e.broken || []).includes(i)) continue;
          if (hit(x, y, z, e.tWindows[i])) return this.onPaperHit(q, e, 'window', i);
        }
      }
      if (e.tBody && hit(x, y, z, e.tBody)) return this.onPaperHit(q, e, 'wall');
    }
    if (y <= 0.09) {
      q.pos.y = 0.09;
      q.landed = 1.6;
      q.vel.set(0, 0, 0);
      q.spin.set(0, 0, 0);
      q.mesh.position.copy(q.pos);
      q.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 3);
      this.focusOnImpact(q);
      this.releaseTarget(q);
      this.breakCombo();
      return true;
    }
    return false;
  }

  onPaperHit(q, house, kind, index) {
    this.focusOnImpact(q);
    this.releaseTarget(q);
    q.landed = kind === 'mail' ? 0.05 : 1.4;
    q.vel.set(0, 0, 0);
    q.spin.set(0, 0, 0);
    if (kind === 'mail') q.mesh.visible = false;

    if (kind === 'mail' || kind === 'porch') {
      if (!house.subscriber || house.delivered || house.missed) {
        this.breakCombo();
        return true;
      }
      house.delivered = true;
      this.world.markHouseDone(house);
      this.combo = Math.min(9, this.combo + 1);
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const spec = house.spec || HOUSE_SPEC.single;
      const gain = (kind === 'mail' ? spec.mail : spec.porch) * this.comboMult();
      this.addScore(gain);
      this.noteThrow(gain, `${spec.label.toLowerCase()} ${kind === 'mail' ? 'box' : 'porch'}`);
      if (kind === 'mail' && house.type === 'mansion') this.stats.mansionBoxes++;
      if (kind === 'mail') {
        this.stats.bullseyes++;
        this.audio.bullseye();
        this.ui.toast(`BULLSEYE \u00b7 ${spec.label}  +${gain}`, 'gold');
        this.flash(0xffd15c, 0.28);
      } else {
        this.stats.delivered++;
        this.audio.deliver();
        this.ui.toast(`DELIVERED \u00b7 ${spec.label}  +${gain}`, 'good');
      }
      if (this.combo > 1) this.audio.combo(this.combo);
      this.pushHud();
      return true;
    }

    if (kind === 'window') {
      const broke = this.world.breakWindow(house, index);
      if (!broke) return true;
      this.audio.smash();
      if (house.subscriber && !house.delivered && !house.missed) {
        house.missed = true;
        this.world.markHouseDone(house);
        this.stats.cancelled++;
        this.breakCombo();
        this.ui.toast('SUBSCRIPTION CANCELLED', 'bad');
        this.flash(0xc8352b, 0.35);
      } else {
        this.stats.smashed++;
        const spec = house.spec || HOUSE_SPEC.single;
        const gain = spec.window * this.comboMult();
        this.addScore(gain);
        this.noteThrow(gain, `${spec.label.toLowerCase()} window`);
        this.ui.toast(`SMASH \u00b7 ${spec.label}  +${gain}`, 'good');
      }
      this.pushHud();
      return true;
    }

    // Hit the siding -- nothing gained, and the streak is gone.
    this.audio.thud();
    this.breakCombo();
    return true;
  }

  // Keeps the single most valuable throw of the round for the front page.
  noteThrow(gain, label) {
    if (gain <= this.stats.bestThrow) return;
    this.stats.bestThrow = gain;
    this.stats.bestThrowLabel = label;
  }

  comboMult() { return 1 + Math.floor(this.combo / 2); }

  breakCombo() {
    if (this.combo > 0) {
      this.combo = 0;
      this.ui.setCombo(0);
    }
  }

  addScore(n) {
    this.score = (this.score || 0) + Math.round(n * this.diff.scoreMul);
    this.ui.setScore(this.score);
  }

  onMissed(house) {
    this.stats.missed++;
    this.breakCombo();
    this.audio.miss();
    this.ui.toast('MISSED A HOUSE', 'bad');
    this.pushHud();
  }

  // ----------------------------------------------------------------- crashes

  crash(what) {
    this.state = 'crashed';
    this.crashTimer = 1.35;
    this.stats.crashes++;
    this.lives--;
    this.combo = 0;
    this.shake = this.reduceMotion ? 0 : 1;
    this.audio.crash();
    this.flash(0xffffff, 0.5);
    this.ui.toast(crashLabel(what), 'bad');
    this.ui.setState('crashed');
    this.pushHud();
  }

  recover() {
    if (this.lives <= 0) { this.gameOver(); return; }
    this.state = 'play';
    this.ui.setState('play');
    this.p.speed = this.diff.bikeSpeed * 0.7;
    this.p.x = clamp(this.p.x, -6.5, 6.5);
    this.invuln = 2.0;
  }

  flash(color, amount) {
    if (this.reduceMotion) return;
    this.post.material.uniforms.uFlashColor.value.setHex(color);
    this.post.material.uniforms.uFlash.value = amount;
  }

  // ----------------------------------------------------------------- results

  finishRoute() {
    this.state = 'results';
    const remaining = this.world.entities.filter(
      (e) => e.kind === 'house' && e.subscriber && !e.delivered && !e.missed
    );
    for (const h of remaining) { h.missed = true; this.stats.missed++; }

    const perfect = this.stats.missed === 0 && this.stats.cancelled === 0;
    let bonus = 0;
    bonus += this.papersLeft * 25;
    bonus += this.lives * 500;
    if (perfect) bonus += 3000;
    this.addScore(bonus);
    this.audio.fanfare();
    this.audio.stopMusic();
    const report = this.buildReport(bonus, perfect);
    report.newBest = this.recordBest(this.score);
    report.best = this.loadBests()[this.difficulty] || this.score;
    this.ui.showResults(report);
    this.ui.setState('results');
  }

  gameOver() {
    this.state = 'gameover';
    this.audio.gameOver();
    this.audio.stopMusic();
    const report = this.buildReport(0, false, true);
    report.newBest = this.recordBest(this.score);
    report.best = this.loadBests()[this.difficulty] || this.score;
    this.ui.showResults(report);
    this.ui.setState('gameover');
  }

  buildReport(bonus, perfect, fired) {
    const s = this.stats;
    const kept = this.subscriberTotal - s.missed - s.cancelled;
    return {
      day: this.day,
      score: this.score,
      difficulty: this.diff.name,
      bonus,
      perfect,
      fired,
      delivered: s.delivered + s.bullseyes,
      bullseyes: s.bullseyes,
      smashed: s.smashed,
      missed: s.missed,
      cancelled: s.cancelled,
      crashes: s.crashes,
      thrown: s.thrown,
      papersLeft: this.papersLeft,
      lives: Math.max(0, this.lives),
      bestCombo: this.bestCombo,
      bestThrow: s.bestThrow,
      bestThrowLabel: s.bestThrowLabel,
      subscribersKept: Math.max(0, kept),
      subscriberTotal: this.subscriberTotal,
      headline: headline({ ...s, perfect, fired, kept, total: this.subscriberTotal, day: this.day }),
    };
  }

  // ------------------------------------------------------------------ visuals

  updateRider(dt) {
    const p = this.p;
    const r = this.rider;
    r.root.position.set(p.x, p.y, p.z);
    r.root.rotation.y = p.yaw;

    if (this.state === 'crashed') {
      r.root.rotation.z += dt * 9;
      r.root.rotation.x += dt * 5;
      r.lean.rotation.z = 0;
    } else {
      r.root.rotation.z = 0;
      r.root.rotation.x = p.air ? clamp(-p.vy * 0.03, -0.35, 0.3) : 0;
      r.lean.rotation.z = p.lean;
    }

    const rot = (p.speed * dt) / 0.36;
    for (const w of r.wheels) { w.tyre.rotation.x -= rot; w.spokes.rotation.x -= rot; }
    r.fork.rotation.y = -this.input.steer * 0.42;

    // Pedals drive the legs through a two-bone solve.
    p.crankAngle += p.speed * dt * 1.5;
    r.crank.rotation.x = p.crankAngle;
    for (const c of r.crank.children) c.rotation.x = -p.crankAngle;
    for (let i = 0; i < r.legs.length; i++) {
      const leg = r.legs[i];
      const a = p.crankAngle + (i === 0 ? 0 : Math.PI);
      const py = 0.42 + Math.cos(a) * 0.16;
      const pz = 0.16 + Math.sin(a) * 0.16;
      solveLeg(leg, py - 0.92, pz - 0.16, 0.34, 0.36);
    }

    for (const arm of r.arms) arm.rotation.x = damp(arm.rotation.x, 0, 12, dt);
    r.torso.rotation.x = -0.42 + Math.sin(p.crankAngle * 2) * 0.03 + (p.speed - this.diff.bikeSpeed) * -0.012;

    const blink = this.invuln > 0 && Math.floor(this.time * 14) % 2 === 0;
    r.root.visible = !blink;
    this.riderShadow.position.set(p.x, 0.05, p.z);
    const shrink = clamp(1 - p.y * 0.12, 0.45, 1);
    this.riderShadow.scale.set(2.2 * shrink, 3.0 * shrink, 1);
    this.riderShadow.material.opacity = 0.4 * shrink;
  }

  updateCamera(dt) {
    const p = this.p;
    const back = 8.2 + (p.speed - this.diff.bikeSpeed) * 0.13;
    const height = 3.5 + p.y * 0.55;
    const targetPos = new THREE.Vector3(p.x * 0.72, height + p.y * 0.5, p.z + back);
    const targetLook = new THREE.Vector3(p.x * 0.85, 1.5 + p.y * 0.8, p.z - 13);

    // Swing toward the paper. The vertical component is deliberately weaker
    // than the horizontal one -- panning across the street reads well, but
    // following the arc up into the sky would hide the road you are riding on.
    const fw = this.focus.w;
    if (fw > 0.002) {
      const fp = this.focus.point;
      targetLook.x = lerp(targetLook.x, fp.x, fw * 0.62);
      targetLook.y = lerp(targetLook.y, fp.y, fw * 0.3);
      targetLook.z = lerp(targetLook.z, fp.z, fw * 0.62);
      // Drift away from the target side so the building opens up in frame.
      const dir = fp.x > p.x ? 1 : -1;
      targetPos.x -= dir * 1.8 * fw;
      targetPos.y += 0.9 * fw;
      targetPos.z += 1.6 * fw;
    }

    const l = this.state === 'crashed' ? 3.2 : 7.5 + fw * 4;
    this.camPos.x = damp(this.camPos.x, targetPos.x, l, dt);
    this.camPos.y = damp(this.camPos.y, targetPos.y, l, dt);
    this.camPos.z = damp(this.camPos.z, targetPos.z, l * 1.7, dt);
    this.camLook.x = damp(this.camLook.x, targetLook.x, l, dt);
    this.camLook.y = damp(this.camLook.y, targetLook.y, l, dt);
    this.camLook.z = damp(this.camLook.z, targetLook.z, l * 1.7, dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 0.85;
      this.camPos.x += (Math.random() - 0.5) * s;
      this.camPos.y += (Math.random() - 0.5) * s;
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.rotation.z += p.lean * 0.16;
    const fov = 62 + clamp((p.speed - this.diff.bikeSpeed) * 0.75, -4, 9) - fw * 5;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, fov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
    this.post.material.uniforms.uDesat.value = damp(
      this.post.material.uniforms.uDesat.value,
      this.state === 'gameover' ? 0.85 : 0, 3, dt
    );
  }

  render() {
    this.post.render(this.scene, this.camera);
  }
}

function hit(x, y, z, b) {
  return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1;
}

function crashLabel(e) {
  if (!e) return 'WIPEOUT';
  if (e.kind === 'dog') return 'THE DOG GOT YOU';
  if (e.kind === 'car') return e.parked ? 'PARKED CAR' : 'TRAFFIC!';
  if (e.kind === 'house') return 'CLIPPED THE MAILBOX';
  const named = { hydrant: 'HYDRANT', bin: 'TRASH DAY', lamp: 'LAMP POST', hedge: 'INTO THE HEDGE', bush: 'INTO THE BUSHES', gnome: 'SORRY, GNOME' };
  return named[e.type] || 'WIPEOUT';
}

function solveLeg(leg, dy, dz, l1, l2) {
  const d = clamp(Math.hypot(dy, dz), Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.005);
  const base = Math.atan2(-dz, -dy);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const phi1 = base + a;
  const kneeY = -Math.cos(phi1) * l1;
  const kneeZ = -Math.sin(phi1) * l1;
  const phi2 = Math.atan2(-(dz - kneeZ), -(dy - kneeY));
  leg.thigh.rotation.x = phi1;
  leg.knee.rotation.x = phi2 - phi1;
}

// The front page writes itself from how the round actually went.
function headline(s) {
  if (s.fired) {
    if (s.cancelled > 2) return 'PAPERBOY FIRED AFTER SUBSCRIBER REVOLT';
    return 'ROUTE ENDS IN THE HEDGE; PAPERBOY OUT OF LIVES';
  }
  if (s.mansionBoxes >= 2) return 'PAPERBOY THREADS THE BIG HOUSE ON THE HILL, TWICE';
  if (s.perfect && s.bullseyes >= 8) return 'FLAWLESS ROUTE: EVERY BOX HIT DEAD CENTER';
  if (s.perfect) return 'PERFECT MORNING ON THE PAPER ROUTE';
  if (s.cancelled >= 3) return `${s.cancelled} SUBSCRIBERS CANCEL AFTER WINDOW SPREE`;
  if (s.smashed >= 6) return `${s.smashed} WINDOWS SHATTERED; NEIGHBORS DEMAND ANSWERS`;
  if (s.crashes >= 3) return 'PAPERBOY AND BICYCLE PART WAYS REPEATEDLY';
  if (s.bullseyes >= 6) return 'LOCAL TEEN HAS UNCANNY AIM, SAY MAIL CARRIERS';
  if (s.missed >= 5) return `${s.missed} PORCHES LEFT EMPTY IN MORNING DELIVERY`;
  if (s.missed === 0) return 'EVERY SUBSCRIBER SERVED BEFORE SUNRISE';
  return 'PAPERS LAND, MOSTLY WHERE INTENDED';
}

export { HOUSE_COUNT };
