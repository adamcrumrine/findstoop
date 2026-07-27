// The route is generated up front as a flat, z-sorted list of entities, then
// streamed in and out of pooled meshes as the player rides. Nothing is built
// or thrown away mid-run.

import * as THREE from 'three';
import * as MODELS from './models.js';
import { LAYOUT, HOUSE_SPEC } from './models.js';
import { mulberry32, range, pick, clamp, box } from './util.js';

// Past ~150 units the exponential fog has swallowed everything, so there is
// nothing to gain by streaming in geometry further out than that.
const AHEAD = 152;
const BEHIND = 30;

export const HOUSE_COUNT = 20;
// Close enough that the first porch is already in view when the round starts.
const FIRST_HOUSE_Z = -52;

class Pool {
  constructor(make, prewarm) {
    this.make = make;
    this.free = [];
    for (let i = 0; i < (prewarm || 0); i++) this.free.push(make(i));
  }
  get() {
    if (this.free.length === 0) return this.make(this.free.length);
    const i = Math.floor(Math.random() * this.free.length);
    const o = this.free[i];
    this.free[i] = this.free[this.free.length - 1];
    this.free.pop();
    return o;
  }
  put(o) { this.free.push(o); }
}

export class World {
  constructor(scene, M) {
    this.scene = scene;
    this.M = M;
    this.rng = mulberry32(1234);

    this.ground = MODELS.makeGround(M);
    scene.add(this.ground);

    this.skyRig = new THREE.Group();
    scene.add(this.skyRig);
    this.skyRig.add(MODELS.makeSky(M, mulberry32(5)));
    this.skyRig.add(MODELS.makeHills(M, mulberry32(9)));

    const r = this.rng;
    const housePool = (type, n) => new Pool(
      () => MODELS.makeHouse(M, mulberry32(200 + Math.floor(Math.random() * 99999)), type), n);
    this.pools = {
      house_single: housePool('single', 7),
      house_townhome: housePool('townhome', 10),
      house_apartment: housePool('apartment', 3),
      house_mansion: housePool('mansion', 3),
      tree: new Pool(() => ({ group: MODELS.makeTree(M, r) }), 14),
      bush: new Pool(() => ({ group: MODELS.makeBush(M, r) }), 8),
      hydrant: new Pool(() => ({ group: MODELS.makeHydrant(M) }), 5),
      bin: new Pool(() => ({ group: MODELS.makeBin(M) }), 6),
      lamp: new Pool(() => ({ group: MODELS.makeLamp(M) }), 5),
      gnome: new Pool(() => ({ group: MODELS.makeGnome(M, r) }), 4),
      // Wrapped in a Group on purpose: the streamer resets group.scale on
      // release, which would otherwise wipe out a bare mesh's dimensions.
      hedge: new Pool(() => {
        const g = new THREE.Group();
        g.add(MODELS.bx(M.hedge, 1.1, 0.9, 3.2, 0, 0.45, 0));
        return { group: g };
      }, 6),
      ramp: new Pool(() => ({ group: MODELS.makeRamp(M) }), 3),
      sprinkler: new Pool(() => MODELS.makeSprinkler(M), 3),
      bundle: new Pool(() => ({ group: MODELS.makeBundle(M) }), 4),
      car: new Pool(() => ({ group: MODELS.makeCar(M, r) }), 9),
      dog: new Pool(() => MODELS.makeDog(M, r), 4),
    };

    this.shadowPool = new Pool(() => MODELS.shadowPlane(M, 1), 14);

    this.entities = [];
    this.active = [];
    this.cursor = 0;
    this.finish = MODELS.makeFinishArch(M);
    this.finish.visible = false;
    scene.add(this.finish);
  }

  // ------------------------------------------------------------- generation

  build(day) {
    this.release();
    const rng = mulberry32(0x9e37 + day * 7919);
    this.rng = rng;
    const ents = [];
    const diff = Math.min(1, (day - 1) / 6);

    // Addresses, walking down the street. Each building type sets its own
    // spacing, so a row of townhomes arrives as a tight burst and a mansion
    // buys itself a wide frontage.
    let subs = 0;
    const houses = [];
    let side = rng() > 0.5 ? 1 : -1;
    let z = FIRST_HOUSE_Z;

    const addHouse = (type) => {
      const spec = HOUSE_SPEC[type];
      const subscriber = rng() < 0.62;
      if (subscriber) subs++;
      houses.push({
        kind: 'house', type, spec, z, side, subscriber,
        delivered: false, missed: false, obj: null, broken: [],
      });
      z -= spec.spacing;
    };

    while (houses.length < HOUSE_COUNT) {
      const roll = rng();
      const left = HOUSE_COUNT - houses.length;
      let type = 'single';
      // Weighted so a terrace, which eats two or three addresses at once, does
      // not crowd out the rarer buildings.
      if (roll > 0.82 && left >= 2) type = 'mansion';
      else if (roll > 0.64 && left >= 2) type = 'apartment';
      else if (roll > 0.46 && left >= 3) type = 'townhome';

      if (type === 'townhome') {
        // Row houses come in terraces sharing party walls, all on one side.
        const n = Math.min(left, 2 + Math.floor(rng() * 2));
        for (let i = 0; i < n; i++) addHouse('townhome');
        z -= 13;
      } else {
        addHouse(type);
      }
      side = rng() > 0.24 ? -side : side;
    }

    // Guarantee a route worth riding.
    while (subs < 11) {
      const h = houses[Math.floor(rng() * houses.length)];
      if (!h.subscriber) { h.subscriber = true; subs++; }
    }
    this.subscriberTotal = subs;
    ents.push(...houses);

    const routeEnd = houses[houses.length - 1].z;
    this.finishZ = routeEnd - 56;
    this.routeStart = FIRST_HOUSE_Z + 30;

    // Street furniture and hazards between the houses.
    for (let z = -22; z > this.finishZ + 12; z -= range(rng, 5, 11)) {
      const s = rng() > 0.5 ? 1 : -1;
      const roll = rng();
      if (roll < 0.15) ents.push({ kind: 'prop', type: 'hydrant', x: s * 5.2, z, r: 0.5, solid: true });
      else if (roll < 0.32) ents.push({ kind: 'prop', type: 'bin', x: s * range(rng, 5.4, 7.0), z, r: 0.55, solid: true });
      else if (roll < 0.42) ents.push({ kind: 'prop', type: 'gnome', x: s * range(rng, 8.2, 9.0), z, r: 0.4, solid: true });
      else if (roll < 0.54) ents.push({ kind: 'prop', type: 'bush', x: s * range(rng, 8.2, 9.1), z, r: 0.7, solid: true });
      else if (roll < 0.62) ents.push({ kind: 'prop', type: 'hedge', x: s * 8.8, z, r: 1.4, rz: 1.7, solid: true });
      else if (roll < 0.70) ents.push({ kind: 'prop', type: 'lamp', x: s * 4.86, z, r: 0.4, solid: true });
      else if (roll < 0.78) ents.push({ kind: 'prop', type: 'ramp', x: s * range(rng, 5.4, 6.6), z, r: 1.4, rz: 1.6, solid: false, ramp: true });
      else if (roll < 0.86) ents.push({ kind: 'prop', type: 'sprinkler', x: s * 8.4, z, r: 2.4, solid: false, spray: true });
      else if (roll < 0.94) ents.push({ kind: 'prop', type: 'bundle', x: s * range(rng, 5.2, 6.8), z, r: 1.0, solid: false, pickup: true });
      else ents.push({ kind: 'prop', type: 'tree', x: s * range(rng, 19, 21.5), z, r: 0, solid: false });
    }

    // Backdrop trees behind the houses -- never in the play area.
    for (let z = -8; z > this.finishZ - 40; z -= range(rng, 6, 14)) {
      const s = rng() > 0.5 ? 1 : -1;
      ents.push({ kind: 'prop', type: 'tree', x: s * range(rng, 19, 21.8), z, r: 0, solid: false });
    }

    // Traffic.
    const carGap = range(rng, 30, 42) - diff * 12;
    for (let z = -60; z > this.finishZ + 20; z -= Math.max(16, carGap + range(rng, -8, 10))) {
      const oncoming = rng() > 0.42;
      ents.push({
        kind: 'car', z,
        x: oncoming ? -2.25 : 2.25,
        vz: oncoming ? range(rng, 11, 16) + diff * 5 : -(range(rng, 6, 10) + diff * 3),
        r: 1.05, rz: 2.4, solid: true,
      });
    }
    // A couple of parked cars to tighten the lane.
    for (let z = -90; z > this.finishZ + 20; z -= range(rng, 70, 130)) {
      const s = rng() > 0.5 ? 1 : -1;
      ents.push({ kind: 'car', z, x: s * 3.5, vz: 0, r: 1.05, rz: 2.4, solid: true, parked: true });
    }

    // Dogs.
    const dogCount = 3 + Math.round(diff * 5);
    for (let i = 0; i < dogCount; i++) {
      const z = range(rng, -110, this.finishZ + 40);
      ents.push({ kind: 'dog', z, x: (rng() > 0.5 ? 1 : -1) * range(rng, 6, 8.6), r: 0.55, solid: true, homeZ: z, chasing: false });
    }

    ents.sort((a, b) => b.z - a.z);
    this.entities = ents;
    this.cursor = 0;
    this.active = [];
    this.finish.position.set(0, 0, this.finishZ);
    this.finish.visible = true;
    return { subscriberTotal: subs, finishZ: this.finishZ };
  }

  release() {
    for (const e of this.active) this.deactivate(e);
    this.active.length = 0;
    this.cursor = 0;
  }

  // -------------------------------------------------------------- streaming

  poolKey(e) {
    if (e.kind === 'house') return 'house_' + e.type;
    if (e.kind === 'car' || e.kind === 'dog') return e.kind;
    return e.type;
  }

  activate(e) {
    const p = this.pools[this.poolKey(e)];
    if (!p) return;
    const obj = p.get();
    e.obj = obj;
    const g = obj.group;

    if (e.kind === 'house') {
      g.position.set(e.side * e.spec.frontX, 0, e.z);
      g.rotation.y = e.side < 0 ? Math.PI : 0;
      this.dressHouse(e);
    } else if (e.kind === 'car') {
      g.position.set(e.x, 0, e.z);
      g.rotation.y = e.vz > 0 ? Math.PI : 0;
      if (e.parked) g.rotation.y = e.x > 0 ? Math.PI : 0;
      e.shadow = this.shadowPool.get();
      e.shadow.scale.set(4.2, 5.6, 1);
      this.scene.add(e.shadow);
    } else if (e.kind === 'dog') {
      g.position.set(e.x, 0, e.z);
      e.shadow = this.shadowPool.get();
      e.shadow.scale.set(1.7, 2.1, 1);
      this.scene.add(e.shadow);
    } else {
      g.position.set(e.x, 0, e.z);
      g.rotation.y = e.type === 'ramp' ? 0 : (e.x > 0 ? Math.PI : 0) + (e.type === 'tree' || e.type === 'bush' ? Math.random() * 3 : 0);
      if (e.type === 'lamp') g.rotation.y = e.x > 0 ? 0 : Math.PI;
      if (e.type === 'hedge' && e.rz) g.scale.set(1, 1, e.rz / 1.6);
    }
    g.visible = !e.consumed;
    this.scene.add(g);
    this.active.push(e);
  }

  deactivate(e) {
    if (!e.obj) return;
    const g = e.obj.group;
    this.scene.remove(g);
    g.scale.set(1, 1, 1);
    const key = this.poolKey(e);
    if (this.pools[key]) this.pools[key].put(e.obj);
    e.obj = null;
    if (e.shadow) {
      this.scene.remove(e.shadow);
      this.shadowPool.put(e.shadow);
      e.shadow = null;
    }
  }

  dressHouse(e) {
    const a = e.obj.anchors;
    const live = e.subscriber && !e.delivered && !e.missed;
    a.flag.rotation.z = e.subscriber ? 0 : 1.35;
    a.flag.visible = e.subscriber;
    a.boxMesh.material = e.subscriber ? this.M.mailboxLive : this.M.mailbox;
    a.bulb.material = live ? this.M.lightWhite : this.M.trim;
    a.halo.visible = live;
    a.chev.visible = live;
    for (const w of a.windows) {
      w.material = this.M.window;
      w.userData.broken = false;
    }
    if (e.broken) for (const i of e.broken) if (a.windows[i]) a.windows[i].material = this.M.windowBroken;

    // Cache world-space hit boxes for the paper physics.
    const spec = e.spec;
    e.obj.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    a.boxMesh.getWorldPosition(v);
    // The curbside box is the whole difficulty curve: an apartment's cluster
    // bank is a barn door, a mansion's stone slot is not.
    e.tMail = box(v.x, v.y, v.z, 1.05, 0.8, spec.mailW + 0.35);
    a.mat.getWorldPosition(v);
    const pb = spec.porchBox;
    e.tPorch = box(v.x, v.y + pb[1] * 0.28, v.z, pb[0], pb[1], pb[2]);
    e.tWindows = a.windows.map((w) => {
      w.getWorldPosition(v);
      return box(v.x, v.y, v.z, 0.55, 1.5, 1.95);
    });
    e.tBody = box(e.side * (spec.frontX + spec.depth / 2), spec.wall / 2, e.z,
      spec.depth, spec.wall, spec.width);
  }

  breakWindow(e, index) {
    if (!e.broken) e.broken = [];
    if (e.broken.indexOf(index) >= 0) return false;
    e.broken.push(index);
    if (e.obj) {
      const w = e.obj.anchors.windows[index];
      if (w) w.material = this.M.windowBroken;
    }
    return true;
  }

  markHouseDone(e) {
    if (e.obj) this.dressHouse(e);
  }

  // ----------------------------------------------------------------- update

  update(dt, player, time) {
    const pz = player.z;

    while (this.cursor < this.entities.length && this.entities[this.cursor].z >= pz - AHEAD) {
      this.activate(this.entities[this.cursor]);
      this.cursor++;
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.z > pz + BEHIND) {
        this.deactivate(e);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }

    const snap = MODELS.GROUND_SNAP;
    this.ground.position.z = Math.round(pz / snap) * snap;
    this.skyRig.position.set(0, 0, pz);

    for (const e of this.active) {
      if (e.kind === 'car') {
        if (e.vz !== 0) {
          e.z += e.vz * dt;
          e.obj.group.position.z = e.z;
        }
        if (e.shadow) e.shadow.position.set(e.x, 0.05, e.z);
      } else if (e.kind === 'dog') {
        this.updateDog(e, dt, player, time);
      } else if (e.type === 'sprinkler') {
        const d = e.obj.drops;
        for (let i = 0; i < d.length; i++) {
          const t = (time * 0.55 + i / d.length) % 1;
          const a = time * 2.4 + i * 0.45;
          const rad = t * 2.5;
          d[i].position.set(Math.cos(a) * rad, 0.35 + Math.sin(t * Math.PI) * 1.15, Math.sin(a) * rad);
          d[i].scale.setScalar(0.42 * (1 - t * 0.5));
        }
      } else if (e.kind === 'house' && e.obj) {
        const a = e.obj.anchors;
        if (a.chev.visible) {
          a.chev.position.y = 4.6 + Math.sin(time * 3.4 + e.z) * 0.28;
          a.chev.rotation.y = e.side < 0 ? Math.PI : 0;
        }
      }
    }
  }

  updateDog(e, dt, player, time) {
    const dz = e.z - player.z;
    const dx = e.x - player.x;
    const near = dz > -3 && dz < 17 && Math.abs(dx) < 12;
    if (near && !e.chasing) e.chasing = true;
    if (e.chasing) {
      const d = Math.hypot(dx, dz) || 1;
      const spd = 9.5;
      e.x -= (dx / d) * spd * dt;
      e.z -= (dz / d) * spd * dt * 1.15;
      e.obj.group.rotation.y = Math.atan2(-dx, -dz);
      e.x = clamp(e.x, -9.6, 9.6);
    }
    const g = e.obj.group;
    g.position.set(e.x, 0, e.z);
    const gait = e.chasing ? 16 : 5;
    for (let i = 0; i < e.obj.legs.length; i++) {
      e.obj.legs[i].rotation.x = Math.sin(time * gait + i * 1.9) * (e.chasing ? 0.9 : 0.25);
    }
    e.obj.tail.rotation.x = Math.sin(time * 9) * 0.4;
    e.obj.group.position.y = e.chasing ? Math.abs(Math.sin(time * 8)) * 0.09 : 0;
    if (e.shadow) e.shadow.position.set(e.x, 0.05, e.z);
  }

  // ------------------------------------------------------------- queries

  // Nearest solid thing the player is overlapping, or null.
  hitTest(px, pz, radius) {
    for (const e of this.active) {
      // Mailbox posts are obstacles too, which is what makes riding the lawn
      // instead of the sidewalk a real choice.
      if (e.kind === 'house') {
        const mx = e.side * LAYOUT.mailboxX;
        if (Math.abs(px - mx) < 0.42 + radius && Math.abs(pz - e.z) < 0.34 + radius) return e;
        continue;
      }
      if (!e.solid) continue;
      const rx = (e.r || 0.5) + radius;
      const rz = (e.rz || e.r || 0.5) + radius;
      if (Math.abs(px - e.x) < rx && Math.abs(pz - e.z) < rz) return e;
    }
    return null;
  }

  triggerTest(px, pz, radius, kind) {
    for (const e of this.active) {
      if (!e[kind]) continue;
      const rx = (e.r || 1) + radius;
      const rz = (e.rz || e.r || 1) + radius;
      if (Math.abs(px - e.x) < rx && Math.abs(pz - e.z) < rz) return e;
    }
    return null;
  }

  consume(e) {
    e.pickup = false;
    e.consumed = true;
    if (e.obj) e.obj.group.visible = false;
  }

  // Nearest pending subscriber house on a given side, ahead of the player.
  nextTarget(px, pz, side) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.active) {
      if (e.kind !== 'house' || !e.subscriber || e.delivered || e.missed) continue;
      if (e.side !== side) continue;
      const d = pz - e.z;
      if (d < 4 || d > 34) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  housesPassed(pz, cb) {
    for (const e of this.active) {
      if (e.kind !== 'house' || !e.subscriber || e.delivered || e.missed) continue;
      if (e.z > pz + 6) { e.missed = true; this.markHouseDone(e); cb(e); }
    }
  }
}
