// The live shop: a three.js scene drawn into a canvas the page owns. It shows the game state; it never changes it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sim, type Agent, type GameState, type Item } from '../engine';
import { centreOf, holdsSacks } from '../derive';
import type { Target } from '../ui';
import {
  B, H, T, TOP, add, backDoor, blk, crateModel, custRig, fillShelf, groundsMesh, isoDir, lowBrick, makeCup, mat, modelFor,
  moodMats, pose, sackMesh, slotGeo, slotsOf, tile, wallSeg, workerRig, type Rig
} from './kit';

const V3 = THREE.Vector3;
interface ItemView { root: THREE.Group; inner: THREE.Group; ol: THREE.Group; olm: THREE.MeshBasicMaterial; built: boolean; cap: number; slots: [number, number][] | null; sackN?: number }
interface WorkerView { root: THREE.Group; rig: Rig; loadKind?: string | null; loadMesh?: THREE.Group | null }
interface CustView { root: THREE.Group; rig: Rig; sp: THREE.Sprite; held: THREE.Group | null }
interface CupView { root: THREE.Group }
export interface Placement { type: string; r: number }
export interface FrameState { sel: Target | null; hover: Target | null; buildMode: boolean; speed: number }

const BACK_WALL = ['plain', 'menu', 'menu', 'plain', 'window', 'plain'], SIDE_WALL = ['plain', 'plain', 'window', 'window', 'plain'];

function agentPos(a: Agent, frac: number) {
  let x = a.x + 0.5, z = a.z + 0.5;
  if (a.path.length) {
    const n = a.path[0];
    const cost = (n.x !== a.x && n.z !== a.z) ? Math.round(a.spd * 1.4) : a.spd;
    const t = Math.min(1, (a.prog + frac) / cost);
    x += (n.x - a.x) * t; z += (n.z - a.z) * t;
  }
  const j = ((a.id * 37) % 7 - 3) * 0.035, k = ((a.id * 53) % 7 - 3) * 0.035;
  return { x: x + j, z: z + k };
}
function turn(r: Rig, target: number, k: number) {
  let d = target - r.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  r.yaw += d * k; r.root.rotation.y = r.yaw;
}

export class ShopScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  private readonly controls: OrbitControls;
  private readonly VIEW = { target: new V3(6, 0.6, 6), halfW: 8.6, halfH: 6.4 };
  private readonly room = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly sun = new THREE.DirectionalLight(0xfff1dc, 0.78);
  private readonly itemViews = new Map<number, ItemView>();
  private readonly workerViews = new Map<number, WorkerView>();
  private readonly custViews = new Map<number, CustView>();
  private readonly cupViews = new Map<number, CupView>();
  private readonly pile = new THREE.Group();
  private pileN = -1;
  private readonly ring: THREE.Mesh;
  private readonly hring: THREE.Mesh;
  private readonly ghost = new THREE.Group();
  private readonly gFillM = B(0x5fc58a, { transparent: true, opacity: 0.35, depthWrite: false });
  private readonly gFill: THREE.Mesh;
  private readonly gBoxM = new THREE.LineBasicMaterial({ color: 0x5fc58a });
  private readonly gBox: THREE.LineSegments;
  private readonly gStaff: THREE.Mesh;
  private readonly gCust: THREE.Mesh;
  private readonly gridLines: THREE.LineSegments;
  private readonly access = new THREE.Group();
  private accessKey = '';
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new V3(0, 1, 0), 0);
  private readonly tmp = new V3();
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const { renderer, scene } = this;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x121a24);
    scene.add(this.room);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat.ground);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.11; ground.receiveShadow = true; scene.add(ground);
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a2c22, 0.66));
    const sun = this.sun;
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
    scene.add(sun); scene.add(sun.target);
    scene.add(this.world);
    scene.add(this.pile);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), B(0xe0a458, { side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; scene.add(this.ring);
    this.hring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 24), B(0xaab6c4, { side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    this.hring.rotation.x = -Math.PI / 2; scene.add(this.hring);

    // the placement ghost: footprint, outline, and where staff and customers will stand
    this.ghost.visible = false; scene.add(this.ghost);
    this.gFill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), this.gFillM); this.ghost.add(this.gFill);
    this.gBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), this.gBoxM); this.ghost.add(this.gBox);
    this.gStaff = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), B(0x7fb3e0, { transparent: true, opacity: 0.75, depthWrite: false })); this.ghost.add(this.gStaff);
    this.gCust = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), B(0xe0a458, { transparent: true, opacity: 0.75, depthWrite: false })); this.ghost.add(this.gCust);

    // grid overlay for build mode, over the room's floor
    this.gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0.55, depthWrite: false }));
    this.gridLines.visible = false; scene.add(this.gridLines);
    scene.add(this.access);

    this.controls = new OrbitControls(this.cam, canvas);
    const controls = this.controls;
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.maxPolarAngle = 1.3; controls.minZoom = 0.6; controls.maxZoom = 4;
    controls.screenSpacePanning = true;
  }

  dispose() {
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- the empty shop ----------
  // Built from the room rule: wooden floor inside, paving around it, full walls at the back and left, low brick at the
  // front (with the door gap at x 4..5) and right (with the back door in its back corner). Room edges are even, so
  // walls come in whole 2-square segments.
  buildRoom(S: GameState) {
    this.clearViews();
    const room = this.room;
    while (room.children.length) room.remove(room.children[0]);
    const { x0, x1, z0 } = S.R.room, x2 = x1 + 1;
    for (let x = 0; x < Sim.GW; x += 2) for (let z = 0; z < Sim.IN; z += 2) {
      if (x >= x0 && x < x2 && z >= z0) tile(room, 'wood', x, z);
      else if (!(x === x2 && z >= z0)) tile(room, 'pave', x, z);
    }
    for (let i = -1; i < 7; i++) tile(room, 'pave', 2 * i, 10.15);
    for (let z = z0; z < Sim.IN; z += 2) tile(room, 'pave', x2 + 0.15, z);
    const back = new THREE.Group(); back.position.set(x0, 0, z0); room.add(back);
    for (let i = 0; 2 * i < x2 - x0; i++) wallSeg(back, BACK_WALL[i % BACK_WALL.length], 2 * i);
    const left = new THREE.Group(); left.position.set(x0, 0, z0); left.rotation.y = Math.PI / 2; room.add(left);
    for (let j = 0; 2 * j < Sim.IN - z0; j++) wallSeg(left, SIDE_WALL[j % SIDE_WALL.length], -(2 * j + 2));
    blk(room, mat.plaster, x0 - T, 0, z0 - T, T, H, T);
    for (let x = x0; x < x2; x += 2) if (x !== 4) lowBrick(room, x, 10, 2, T);
    for (let z = z0 + 2; z < Sim.IN; z += 2) lowBrick(room, x2, z, T, 2);
    lowBrick(room, x2, z0 + 1, T, 1);
    const bd = new THREE.Group(); bd.position.set(x2 - 12, 0, z0); room.add(bd); backDoor(bd);
    lowBrick(room, x2, 10, T, T);
    blk(room, mat.mat, 4.3, 0, 8.9, 1.4, 0.02, 1);
    this.VIEW.target.set((x0 + x2) / 2, 0.6, (z0 + Sim.IN) / 2 + 0.5);
    const k = Math.max(0.6, (x2 - x0) / 12, (Sim.IN - z0) / 10);
    this.VIEW.halfW = 8.6 * k; this.VIEW.halfH = 6.4 * k;
    this.buildGrid(S);
    this.pileN = -1; this.accessKey = '';
  }

  private clearViews() {
    const drop = (m: Map<number, { root: THREE.Object3D }>) => { m.forEach((v) => { if (v.root.parent) v.root.parent.remove(v.root); }); m.clear(); };
    drop(this.itemViews); drop(this.workerViews); drop(this.custViews); drop(this.cupViews);
  }

  // ---------- camera ----------
  private fitFrustum() {
    const a = this.width / this.height, VIEW = this.VIEW;
    const hh = Math.max(VIEW.halfH, VIEW.halfW / a);
    const cam = this.cam;
    cam.left = -hh * a; cam.right = hh * a; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
  }
  resetView() {
    this.controls.target.copy(this.VIEW.target);
    this.cam.position.copy(this.VIEW.target).addScaledVector(isoDir, 60);
    this.cam.zoom = 1; this.fitFrustum(); this.controls.update();
  }
  resize(w: number, h: number, pixel: boolean) {
    this.width = w || 1; this.height = h || 1;
    this.renderer.setPixelRatio(pixel ? 0.5 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false); this.fitFrustum();
  }
  // slide the camera so this spot is in the middle
  focusOn(x: number, z: number) {
    const d = new V3(x - this.controls.target.x, 0, z - this.controls.target.z);
    this.controls.target.add(d); this.cam.position.add(d);
  }

  // ---------- picking ----------
  aim(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
  }
  pickObject(): Target | null {
    const tagOf = (o: THREE.Object3D | null): Target | null => { while (o && !o.userData.pick) o = o.parent; return o ? o.userData.pick : null; };
    const ws: THREE.Object3D[] = []; this.workerViews.forEach((v) => ws.push(v.root));
    let h = this.ray.intersectObjects(ws, true); if (h.length) return tagOf(h[0].object);
    const is: THREE.Object3D[] = []; this.itemViews.forEach((v) => is.push(v.root));
    h = this.ray.intersectObjects(is, true); for (const x of h) { const t = tagOf(x.object); if (t) return t; }
    return null;
  }
  pickCell() { const p = new V3(); if (!this.ray.ray.intersectPlane(this.floorPlane, p)) return null; return { x: Math.floor(p.x), z: Math.floor(p.z) }; }

  // where a point in the shop lands on the canvas, in CSS pixels
  project(x: number, y: number, z: number) {
    const p = this.tmp.set(x, y, z).project(this.cam);
    return { left: (p.x + 1) / 2 * this.width, top: (1 - p.y) / 2 * this.height };
  }
  workerAt(id: number) { const v = this.workerViews.get(id); return v ? v.root.position : null; }

  // ---------- sync sim → scene ----------
  private makeItemView(S: GameState, it: Item): ItemView {
    const c = S.R.CAT[it.type], [w, d] = Sim.dimsOf(it.type, it.r);
    const root = new THREE.Group();
    root.position.set(it.x + w / 2, 0, it.z + d / 2); root.rotation.y = it.r * Math.PI / 2;
    root.userData.pick = { kind: 'item', id: it.id };
    const inner = new THREE.Group(); inner.position.set(-c.w / 2, 0, -c.d / 2); root.add(inner);
    inner.add(it.built ? modelFor(it.type) : crateModel(c.w, c.d));
    const slots = it.built ? slotsOf(it) : null;
    if (slots) slots.forEach(([x, z]) => add(inner, slotGeo, mat.slot, x, TOP + 0.003, z));
    const olm = B(0xe0a458, { transparent: true, opacity: 0.9, depthWrite: false });
    const ol = new THREE.Group(); inner.add(ol);
    const th = 0.06;
    [[0, 0, c.w, th], [0, c.d - th, c.w, th], [0, 0, th, c.d], [c.w - th, 0, th, c.d]].forEach(([x, z, ww, dd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.02, dd), olm); m.position.set(x + ww / 2, 0.012, z + dd / 2); ol.add(m);
    });
    ol.visible = false;
    return { root, inner, ol, olm, built: it.built, cap: it.cap, slots };
  }

  private faceAgent(S: GameState, rig: Rig, a: Agent, p: { x: number; z: number }, k: number) {
    // face along the step, not at the next tile's centre: near the end of a step that vector shrinks to the crowd offset and spins
    if (a.path.length) { const n = a.path[0]; turn(rig, Math.atan2(n.x - a.x, n.z - a.z), k); return; }
    const it = a.face != null && S.imap[a.face];
    if (it) { const c = centreOf(it); turn(rig, Math.atan2(c.x - p.x, c.z - p.z), k); }
  }

  sync(S: GameState, f: FrameState, frac: number, dt: number) {
    const { sel, hover, speed } = f, world = this.world;
    const animRate = speed === 0 ? 0 : Math.min(speed, 3);
    const k = 1 - Math.pow(0.001, dt * 6);
    // items
    const seen = new Set<number>();
    for (const it of S.items) {
      seen.add(it.id);
      let v = this.itemViews.get(it.id);
      if (!v || v.built !== it.built || v.cap !== it.cap) { if (v) world.remove(v.root); v = this.makeItemView(S, it); this.itemViews.set(it.id, v); world.add(v.root); }
      if (it.built && holdsSacks(S, it) && v.sackN !== it.sacks) { v.sackN = it.sacks; fillShelf(v.inner.children[0], it.sacks); }
    }
    this.itemViews.forEach((v, id) => { if (!seen.has(id)) { world.remove(v.root); this.itemViews.delete(id); } });

    // workers
    const wseen = new Set<number>();
    for (const w of S.workers) {
      wseen.add(w.id);
      let v = this.workerViews.get(w.id);
      if (!v) { const rig = workerRig(); rig.root.userData.pick = { kind: 'worker', id: w.id }; v = { root: rig.root, rig }; this.workerViews.set(w.id, v); world.add(rig.root); const p0 = agentPos(w, 0); rig.root.position.set(p0.x, 0, p0.z); }
      const p = agentPos(w, frac); v.root.position.set(p.x, 0, p.z);
      this.faceAgent(S, v.rig, w, p, k);
      v.rig.ph += dt * (w.anim === 'walk' || w.anim === 'carry' ? 9 : 6) * animRate;
      v.rig.cup = !!w.carry && !w.load;
      pose(v.rig, w.anim, k);
      if (v.loadKind !== w.load) {
        if (v.loadMesh) { v.rig.carry.remove(v.loadMesh); v.loadMesh = null; }
        v.loadKind = w.load;
        if (w.load) v.loadMesh = w.load === 'sack' ? sackMesh() : groundsMesh();
        if (v.loadMesh) { v.loadMesh.position.set(0, -0.02, 0.02); v.rig.carry.add(v.loadMesh); }
      }
    }
    this.workerViews.forEach((v, id) => { if (!wseen.has(id)) { world.remove(v.root); this.workerViews.delete(id); } });

    // customers
    const cseen = new Set<number>();
    for (const c of S.customers) {
      cseen.add(c.id);
      let v = this.custViews.get(c.id);
      if (!v) {
        const rig = custRig(c); const sp = new THREE.Sprite(moodMats[0]); sp.scale.set(0.34, 0.34, 1); sp.position.y = 1.78; sp.renderOrder = 5; rig.root.add(sp);
        v = { root: rig.root, rig, sp, held: null }; this.custViews.set(c.id, v); world.add(rig.root);
      }
      const p = agentPos(c, frac); v.root.position.set(p.x, 0, p.z);
      this.faceAgent(S, v.rig, c, p, k);
      const carrying = c.carry && c.state === 'leave';
      if (carrying && !v.held) { v.held = makeCup(c.carry!); v.held.userData.band.visible = false; v.held.position.set(0, -0.11, 0); v.rig.hand.add(v.held); }
      v.rig.cup = !!v.held;
      const anim = carrying ? (c.anim === 'walk' ? 'carry' : 'hold') : c.anim;
      v.rig.ph += dt * (c.anim === 'walk' ? 8 : 5) * animRate;
      pose(v.rig, anim, k);
      let mood;
      if (c.state === 'leave') mood = c.outcome! < 0 ? 3 : c.outcome! >= 0.75 ? 0 : c.outcome! >= 0.5 ? 1 : 2;
      else { const r = (S.t - c.arrive) / c.pat; mood = r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3; }
      v.sp.material = moodMats[mood];
    }
    this.custViews.forEach((v, id) => { if (!cseen.has(id)) { world.remove(v.root); this.custViews.delete(id); } });

    // cups: physical WIP
    const useen = new Set<number>();
    for (const cup of S.cups) {
      useen.add(cup.id);
      let v = this.cupViews.get(cup.id);
      if (!v) { v = { root: makeCup(cup.prod) }; this.cupViews.set(cup.id, v); }
      let parent: THREE.Object3D | null = null;
      if (cup.state === 'carried') {
        const w = S.workers.find((o) => o.carry === cup.id); const wv = w && this.workerViews.get(w.id);
        if (wv) { parent = wv.rig.hand; v.root.position.set(0, -0.11, 0); }
      } else {
        const it = S.imap[cup.at], iv = it && this.itemViews.get(it.id), slots = iv && iv.slots;
        if (iv && slots) {
          const i = it.buf.indexOf(cup.id), s = slots[Math.min(i, slots.length - 1)];
          parent = iv.inner; v.root.position.set(s[0], TOP, s[1]);
        }
      }
      if (parent && v.root.parent !== parent) parent.add(v.root);
      if (!parent && v.root.parent) v.root.parent.remove(v.root);
      v.root.userData.band.visible = cup.state === 'queued' || cup.state === 'claimed';
    }
    this.cupViews.forEach((v, id) => { if (!useen.has(id)) { if (v.root.parent) v.root.parent.remove(v.root); this.cupViews.delete(id); } });

    // highlights
    const sw = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
    for (const it of S.items) {
      const v = this.itemViews.get(it.id)!;
      let col: number | null = null;
      if (sw && it.built && (sw.all || sw.patch.includes(it.id))) col = 0xe0a458;
      if (sw && !it.built && sw.builds.includes(it.id)) col = 0xe0a458;
      if (sel && sel.kind === 'item' && sel.id === it.id) col = 0xe0a458;
      if (hover && hover.kind === 'item' && hover.id === it.id) col = col ? 0xffffff : 0xaab6c4;
      v.ol.visible = col != null; if (col != null) v.olm.color.setHex(col);
    }
    this.ring.visible = !!sw;
    if (sw) { const v = this.workerViews.get(sw.id); if (v) this.ring.position.set(v.root.position.x, 0.02, v.root.position.z); }
    this.hring.visible = !!(hover && hover.kind === 'worker' && !(sw && sw.id === hover.id));
    if (this.hring.visible && hover) { const v = this.workerViews.get(hover.id); if (v) this.hring.position.set(v.root.position.x, 0.02, v.root.position.z); else this.hring.visible = false; }

    this.gridLines.visible = f.buildMode;
    this.updateAccess(S, f.buildMode);
    this.updatePile(S);
  }

  // sacks delivered to the back door, stacked on the paving outside
  private updatePile(S: GameState) {
    const n = S.supply.door;
    if (n === this.pileN) return; this.pileN = n;
    const pile = this.pile;
    while (pile.children.length) pile.remove(pile.children[0]);
    for (let k = 0; k < Math.min(n, 18); k++) {
      const m = sackMesh(), col = k % 3, row = Math.floor(k / 3) % 2, layer = Math.floor(k / 6);
      m.position.set(S.R.room.x1 + 1.4 + col * 0.38, layer * 0.25, S.R.room.z0 + 0.12 + row * 0.27); m.rotation.y = (k % 2) * 0.12;
      pile.add(m);
    }
  }

  private buildGrid(S: GameState) {
    const { x0, x1, z0 } = S.R.room, pts: number[] = [];
    for (let x = x0; x <= x1 + 1; x++) pts.push(x, 0.015, z0, x, 0.015, Sim.IN);
    for (let z = z0; z <= Sim.IN; z++) pts.push(x0, 0.015, z, x1 + 1, 0.015, z);
    this.gridLines.geometry.dispose();
    this.gridLines.geometry = new THREE.BufferGeometry(); this.gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  // staff and customer squares of everything already placed, shown in build mode
  private readonly accStaffM = B(0x7fb3e0, { transparent: true, opacity: 0.35, depthWrite: false });
  private readonly accCustM = B(0xe0a458, { transparent: true, opacity: 0.35, depthWrite: false });
  private readonly accGeo = new THREE.BoxGeometry(0.6, 0.02, 0.6);
  private updateAccess(S: GameState, buildMode: boolean) {
    this.access.visible = buildMode;
    if (!buildMode) return;
    const key = S.items.map((i) => i.id).join();
    if (key === this.accessKey) return; this.accessKey = key;
    const access = this.access;
    while (access.children.length) access.remove(access.children[0]);
    S.items.forEach((it) => ([[it.wc, this.accStaffM], [it.cc, this.accCustM]] as const).forEach(([c, m]) => {
      if (!c) return; const o = new THREE.Mesh(this.accGeo, m); o.position.set(c.x + 0.5, 0.02, c.z + 0.5); access.add(o);
    }));
  }

  // where an item being placed would go if dropped on this cell, and why it can't, if it can't
  placeAt(S: GameState, placing: Placement, cell: { x: number; z: number }) {
    const [w, d] = Sim.dimsOf(placing.type, placing.r);
    const x = cell.x - (w > 1 ? Math.floor((w - 1) / 2) : 0), z = cell.z - (d > 1 ? Math.floor((d - 1) / 2) : 0);
    const reason = S.cash < S.R.CAT[placing.type].cost ? 'Not enough cash' : Sim.canPlace(S, placing.type, x, z, placing.r);
    return { x, z, reason };
  }
  showGhost(S: GameState, placing: Placement | null, cell: { x: number; z: number } | null) {
    if (!placing || !cell) { this.ghost.visible = false; return; }
    const [w, d] = Sim.dimsOf(placing.type, placing.r);
    const { x, z, reason } = this.placeAt(S, placing, cell);
    const col = reason ? 0xe06a55 : 0x5fc58a;
    this.gFillM.color.setHex(col); this.gBoxM.color.setHex(col);
    this.gFill.scale.set(w, 1, d); this.gFill.position.set(x + w / 2, 0.02, z + d / 2);
    this.gBox.scale.set(w, 1.07, d); this.gBox.position.set(x + w / 2, 0.535, z + d / 2);
    const it = { type: placing.type, x, z, r: placing.r };
    const wc = Sim.wcell(it, (S as unknown as { grid: unknown }).grid), cc = Sim.ccell(it);
    this.gStaff.position.set(wc.x + 0.5, 0.02, wc.z + 0.5);
    this.gCust.visible = !!cc; if (cc) this.gCust.position.set(cc.x + 0.5, 0.02, cc.z + 0.5);
    this.ghost.visible = true;
  }

  render() {
    this.controls.update();
    this.sun.position.copy(this.controls.target).add(new V3(3, 12, 8)); this.sun.target.position.copy(this.controls.target);
    this.renderer.render(this.scene, this.cam);
  }
}
