(function () {
  'use strict';
  const Sim = window.CoffeeSim;
  const stage = document.getElementById('stage');
  const labelsEl = document.getElementById('labels');
  if (!window.THREE || !THREE.OrbitControls) {
    stage.insertAdjacentHTML('beforeend', '<div class="fail">The 3D library did not load. Reload the page to try again.</div>');
    return;
  }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false }); }
  catch (e) { stage.insertAdjacentHTML('beforeend', '<div class="fail">This browser could not start WebGL, so the shop cannot be shown.</div>'); return; }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x121a24);
  stage.insertBefore(renderer.domElement, labelsEl);

  const scene = new THREE.Scene();
  const V3 = THREE.Vector3;
  const SEED = 1;
  const TPS = 30;                     // ticks per real second at 1×
  // CAT and PROD follow the current game's rules (a replay code can carry different balance numbers).
  let CAT = Sim.CAT, PROD = Sim.PROD;
  const PKEYS = Sim.PKEYS;
  const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (p) => GBP.format(p / 100);
  const price = (c) => (c.cost ? money(c.cost) : 'Free');
  const holdsSacks = (it) => (S.R.items[it.type].sacks || 0) > 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // =====================================================================
  // Kit: materials, textures and models (from the Coffee Shop 3D kit)
  // =====================================================================
  const L = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const B = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  const mat = {
    wood: L(0x8d522f), woodDark: L(0x4a2a18), panel: L(0x9c5c35), plank: L(0x7c4326),
    top: L(0xddd3c2), steel: L(0xc3cad0), steelDark: L(0x6d757c), steelDeep: L(0x4f565c),
    red: L(0xb33a2e), cream: L(0xe6dccb), brass: L(0xc7a46a),
    black: L(0x2b2f36), blackDeep: L(0x15171b), white: L(0xf4efe6),
    coffee: L(0x4a2a18), sleeve: L(0xa86b3d), board: L(0xc99b62),
    plaster: L(0xe6dfd0), skirting: L(0x7b4a2e), frame: L(0x3b2a22), sill: L(0xf7f3ea),
    chalk: L(0x2c3530), menuFrame: L(0x6b4a2e), stone: L(0xcdbca3), outside: L(0x1d2630),
    pastry: L(0xc9893f), pastryDark: L(0xb4642e), amber: L(0xe0a458), mat: L(0x2e2a26),
    glass: L(0xa8d8ee, { transparent: true, opacity: 0.3, depthWrite: false }),
    led: B(0x5fc58a), chalkLine: B(0xe8e4d8), amberB: B(0xe0a458), ground: L(0x0e151e),
    slot: B(0x3a2c22), hit: B(0xffffff, { visible: false })
  };
  function tex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  const texWood = tex(16, 16, (x) => {
    x.fillStyle = '#9a5733'; x.fillRect(0, 0, 16, 16);
    for (let k = 0; k < 4; k++) {
      x.fillStyle = '#7c4326'; x.fillRect(k * 4, 0, 1, 16);
      x.fillStyle = '#ad6740'; x.fillRect(k * 4 + 2, 0, 1, 16);
      x.fillStyle = '#7c4326'; x.fillRect(k * 4, (k * 5 + 3) % 16, 4, 1);
    }
  });
  const texPave = tex(16, 16, (x) => {
    x.fillStyle = '#a19e95'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#85827a'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 8, 16, 1); x.fillRect(0, 0, 1, 16); x.fillRect(8, 0, 1, 16);
    x.fillStyle = '#b6b3aa'; x.fillRect(4, 3, 1, 1); x.fillRect(12, 11, 1, 1); x.fillStyle = '#7b7870'; x.fillRect(10, 4, 1, 1); x.fillRect(3, 13, 1, 1);
  });
  const texBrick = tex(32, 8, (x) => {
    x.fillStyle = '#6e3122'; x.fillRect(0, 0, 32, 8);
    const cols = ['#9a4a33', '#a5523a', '#8f432e'];
    for (let r = 0; r < 4; r++) for (let bx = (r % 2 ? -4 : 0); bx < 32; bx += 8) {
      x.fillStyle = cols[(r + bx / 8 + 3) % 3 | 0]; x.fillRect(bx, r * 2, 7, 1);
    }
  });
  const texCrate = tex(16, 16, (x) => {
    x.fillStyle = '#c99b62'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#a97a45'; for (let k = 0; k < 4; k++) x.fillRect(0, k * 4 + 3, 16, 1);
    x.fillStyle = '#7c5530'; x.fillRect(0, 0, 16, 2); x.fillRect(0, 14, 16, 2); x.fillRect(0, 0, 2, 16); x.fillRect(14, 0, 2, 16);
    for (let k = 0; k < 14; k++) x.fillRect(1 + k, 1 + k, 2, 1);
  });
  mat.brick = L(0xffffff, { map: texBrick });
  mat.crate = L(0xffffff, { map: texCrate });
  const floorMats = {};
  [['wood', texWood, 0x6e3b20], ['pave', texPave, 0x7b7870]].forEach(([k, t, sideC]) => {
    const s = L(sideC), top = L(0xffffff, { map: t }); floorMats[k] = [s, s, top, s, s, s];
  });

  function add(p, geo, m, x, y, z) {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z);
    const clear = m.transparent || m.visible === false; o.castShadow = !clear; o.receiveShadow = !clear;
    p.add(o); return o;
  }
  const blk = (p, m, x, y, z, w, h, d) => add(p, new THREE.BoxGeometry(w, h, d), m, x + w / 2, y + h / 2, z + d / 2);
  const cyl = (p, m, x, y, z, rt, rb, h, seg) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg || 14), m, x, y + h / 2, z);
  function tile(p, type, x, z) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), floorMats[type]);
    o.position.set(x + 1, -0.05, z + 1); o.receiveShadow = true; p.add(o); return o;
  }

  const TOP = 1.07;
  function counter(len, dep, topM) {
    const g = new THREE.Group();
    blk(g, mat.woodDark, 0.08, 0, 0.1, len - 0.16, 0.12, dep - 0.18);
    blk(g, mat.wood, 0.03, 0.12, 0.03, len - 0.06, 0.83, dep - 0.06);
    for (let k = 0; k < Math.round(len); k++) blk(g, mat.panel, k + 0.12, 0.26, dep - 0.045, 0.76, 0.56, 0.03);
    blk(g, topM || mat.top, 0, 0.95, 0, len, 0.12, dep);
    return g;
  }
  function onCounter(len, dep, topM, build, faceBack, offsetX) {
    const g = counter(len, dep, topM);
    if (build) {
      const m = build(); m.position.set(offsetX != null ? offsetX : len / 2, TOP, dep / 2);
      if (faceBack) m.rotation.y = Math.PI;
      g.add(m);
    }
    return g;
  }
  function espresso(o) {
    const g = new THREE.Group(), W = o.W, D = o.D, H = o.H, R = 0.08 + 0.33;
    blk(g, mat.steel, -W / 2, 0, -D / 2, W, 0.08, D);
    blk(g, mat.blackDeep, -W / 2, 0.08, -D / 2, W, 0.33, D * 0.45);
    blk(g, o.body, -W / 2, 0.08, -D / 2, 0.13, 0.33, D);
    blk(g, o.body, W / 2 - 0.13, 0.08, -D / 2, 0.13, 0.33, D);
    blk(g, o.trim, -W / 2, R, -D / 2, W, 0.05, D + 0.01);
    blk(g, o.body, -W / 2, R + 0.05, -D / 2, W, H - R - 0.1, D);
    blk(g, mat.steel, -W / 2, H - 0.05, -D / 2, W, 0.05, D);
    for (let k = 0; k < 3; k++) blk(g, mat.steelDark, -W / 2 + 0.08, H, -D / 2 + 0.12 + k * D * 0.28, W - 0.16, 0.012, 0.03);
    blk(g, mat.steelDark, -W / 2 + 0.16, 0.08, -0.02, W - 0.32, 0.04, D / 2 - 0.02);
    o.groups.forEach((x) => {
      cyl(g, mat.steel, x, R - 0.08, D * 0.2, 0.1, 0.1, 0.08);
      cyl(g, mat.black, x, R - 0.14, D * 0.2, 0.11, 0.09, 0.06);
      blk(g, mat.black, x - 0.03, R - 0.13, D * 0.2 + 0.06, 0.06, 0.05, 0.32);
    });
    o.gauges.forEach((x) => {
      const gm = add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), mat.white, x, H - 0.25, D / 2 + 0.012); gm.rotation.x = Math.PI / 2;
      blk(g, mat.black, x - 0.005, H - 0.26, D / 2 + 0.028, 0.01, 0.06, 0.005);
    });
    blk(g, mat.led, W / 2 - 0.24, R + 0.1, D / 2, 0.06, 0.04, 0.01);
    o.wands.forEach((s) => cyl(g, mat.steel, s * (W / 2 + 0.05), 0.22, D * 0.15, 0.018, 0.018, 0.4));
    cyl(g, mat.white, -W * 0.18, H, -0.05, 0.07, 0.06, 0.1); cyl(g, mat.white, W * 0.12, H, 0.05, 0.07, 0.06, 0.1);
    return g;
  }
  const starterEspresso = () => espresso({ W: 1.12, D: 0.75, H: 0.74, body: mat.cream, trim: mat.brass, groups: [0], gauges: [0], wands: [1] });
  function grinder() {
    const g = new THREE.Group();
    blk(g, mat.black, -0.25, 0, -0.25, 0.5, 0.62, 0.5);
    blk(g, mat.blackDeep, -0.07, 0.32, 0.25, 0.14, 0.12, 0.06);
    blk(g, mat.steel, -0.11, 0.2, 0.25, 0.22, 0.025, 0.14);
    blk(g, mat.led, -0.06, 0.5, 0.25, 0.12, 0.04, 0.01);
    cyl(g, mat.steel, 0, 0.62, 0, 0.13, 0.13, 0.08);
    cyl(g, mat.coffee, 0, 0.7, 0, 0.25, 0.15, 0.28);
    cyl(g, mat.glass, 0, 0.7, 0, 0.3, 0.16, 0.55);
    cyl(g, mat.black, 0, 1.25, 0, 0.31, 0.31, 0.05);
    return g;
  }
  function batchBrewer() {
    const g = new THREE.Group();
    blk(g, mat.black, -0.38, 0, -0.31, 0.76, 1.1, 0.3);
    blk(g, mat.black, -0.38, 0, -0.01, 0.08, 1.1, 0.32);
    blk(g, mat.black, 0.3, 0, -0.01, 0.08, 1.1, 0.32);
    blk(g, mat.black, -0.38, 0.62, -0.01, 0.76, 0.48, 0.32);
    blk(g, mat.steelDark, -0.3, 0, -0.01, 0.6, 0.04, 0.3);
    blk(g, mat.steelDeep, -0.2, 0.52, 0.0, 0.4, 0.1, 0.24);
    cyl(g, mat.coffee, 0, 0.04, 0.14, 0.13, 0.13, 0.2);
    cyl(g, mat.glass, 0, 0.04, 0.14, 0.15, 0.15, 0.36);
    cyl(g, mat.black, 0, 0.4, 0.14, 0.13, 0.15, 0.05);
    blk(g, mat.black, 0.15, 0.12, 0.11, 0.05, 0.22, 0.05);
    blk(g, mat.amberB, -0.12, 0.85, 0.31, 0.1, 0.05, 0.01);
    blk(g, mat.led, 0.06, 0.85, 0.31, 0.05, 0.05, 0.01);
    return g;
  }
  function pastryCase() {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) for (const z of [-0.12, 0.12]) {
      const p = add(g, new THREE.SphereGeometry(0.1, 10, 8), (k + (z > 0 ? 1 : 0)) % 3 ? mat.pastry : mat.pastryDark, -0.6 + k * 0.3, 0.06, z);
      p.scale.set(1.4, 0.55, 1);
    }
    const geo = new THREE.BoxGeometry(1.7, 0.62, 0.62);
    add(g, geo, mat.glass, 0, 0.31, 0);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xe6f4fa }));
    e.position.set(0, 0.31, 0); g.add(e);
    return g;
  }
  function till() {
    const g = new THREE.Group();
    blk(g, mat.black, -0.22, 0, -0.1, 0.44, 0.16, 0.34);
    for (let k = 0; k < 3; k++) blk(g, mat.steel, -0.14 + k * 0.1, 0.16, 0.08, 0.06, 0.012, 0.06);
    blk(g, mat.black, -0.03, 0.16, -0.12, 0.06, 0.16, 0.04);
    const s = new THREE.Group(); s.position.set(0, 0.32, -0.12); s.rotation.x = -0.3; g.add(s);
    blk(s, mat.black, -0.21, 0, -0.02, 0.42, 0.28, 0.03);
    blk(s, mat.led, -0.18, 0.03, 0.012, 0.36, 0.22, 0.005);
    blk(g, mat.black, 0.42, 0, 0.05, 0.12, 0.05, 0.2);
    return g;
  }
  function pickupSign() {
    const g = new THREE.Group();
    const sign = blk(g, mat.amber, 0.38, 0, -0.1, 0.42, 0.24, 0.04); sign.rotation.x = -0.15;
    blk(g, mat.frame, 0.45, 0.14, -0.06, 0.28, 0.025, 0.005);
    return g;
  }
  const T = 0.15, H = 2.4;
  function wallSeg(p, type, x0) {
    if (type === 'window') {
      blk(p, mat.plaster, x0, 0, -T, 2, 0.75, T);
      blk(p, mat.plaster, x0, 1.8, -T, 2, 0.6, T);
      blk(p, mat.plaster, x0, 0.75, -T, 0.35, 1.05, T);
      blk(p, mat.plaster, x0 + 1.65, 0.75, -T, 0.35, 1.05, T);
      blk(p, mat.frame, x0 + 0.33, 0.73, -T - 0.01, 1.34, 0.05, T + 0.02);
      blk(p, mat.frame, x0 + 0.33, 1.77, -T - 0.01, 1.34, 0.05, T + 0.02);
      blk(p, mat.frame, x0 + 0.33, 0.73, -T - 0.01, 0.05, 1.09, T + 0.02);
      blk(p, mat.frame, x0 + 1.62, 0.73, -T - 0.01, 0.05, 1.09, T + 0.02);
      blk(p, mat.frame, x0 + 0.98, 0.75, -T / 2 - 0.02, 0.04, 1.05, 0.04);
      blk(p, mat.frame, x0 + 0.35, 1.26, -T / 2 - 0.02, 1.3, 0.04, 0.04);
      blk(p, mat.glass, x0 + 0.35, 0.75, -T / 2 - 0.01, 1.3, 1.05, 0.02);
      blk(p, mat.sill, x0 + 0.28, 0.7, -0.02, 1.44, 0.05, 0.14);
    } else if (type === 'door') {
      blk(p, mat.plaster, x0, 0, -T, 0.5, H, T);
      blk(p, mat.plaster, x0 + 1.5, 0, -T, 0.5, H, T);
      blk(p, mat.plaster, x0 + 0.5, 1.85, -T, 1, 0.55, T);
      blk(p, mat.frame, x0 + 0.46, 0, -T - 0.01, 0.05, 1.9, T + 0.02);
      blk(p, mat.frame, x0 + 1.49, 0, -T - 0.01, 0.05, 1.9, T + 0.02);
      blk(p, mat.frame, x0 + 0.46, 1.85, -T - 0.01, 1.08, 0.05, T + 0.02);
      blk(p, mat.outside, x0 + 0.5, 0, -T - 0.3, 1, 1.85, 0.02);
    } else {
      blk(p, mat.plaster, x0, 0, -T, 2, H, T);
      if (type === 'menu') {
        blk(p, mat.menuFrame, x0 + 0.3, 1.05, 0, 1.4, 0.85, 0.04);
        blk(p, mat.chalk, x0 + 0.36, 1.11, 0.04, 1.28, 0.73, 0.005);
        [[1.66, 0.7], [1.48, 0.95], [1.31, 0.55], [1.17, 0.8]].forEach(([y, w]) => blk(p, mat.chalkLine, x0 + 0.45, y, 0.046, w, 0.035, 0.003));
        blk(p, mat.amberB, x0 + 1.48, 1.3, 0.046, 0.07, 0.07, 0.003);
      }
    }
    if (type === 'door') {
      blk(p, mat.skirting, x0, 0, 0, 0.46, 0.12, 0.03);
      blk(p, mat.skirting, x0 + 1.54, 0, 0, 0.46, 0.12, 0.03);
    } else blk(p, mat.skirting, x0, 0, 0, 2, 0.12, 0.03);
  }
  function lowBrick(p, x, z, w, d) {
    blk(p, mat.brick, x, 0, z, w, 0.7, d);
    blk(p, mat.stone, x - 0.02, 0.7, z - 0.02, w + 0.04, 0.06, d + 0.04);
  }

  // ---------- the empty shop ----------
  const room = new THREE.Group(); scene.add(room);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) tile(room, 'wood', 2 * i, 2 * j);
  for (let i = -1; i < 7; i++) tile(room, 'pave', 2 * i, 10.15);
  for (let j = 0; j < 5; j++) tile(room, 'pave', 12.15, 2 * j);
  ['plain', 'menu', 'menu', 'plain', 'window', 'door'].forEach((t, i) => wallSeg(room, t, 2 * i));
  const nw = new THREE.Group(); nw.rotation.y = Math.PI / 2; room.add(nw);
  ['plain', 'plain', 'window', 'window', 'plain'].forEach((t, j) => wallSeg(nw, t, -(2 * j + 2)));
  blk(room, mat.plaster, -T, 0, -T, T, H, T);
  for (let i = 0; i < 6; i++) if (i !== 2) lowBrick(room, 2 * i, 10, 2, T);
  for (let j = 0; j < 5; j++) lowBrick(room, 12, 2 * j, T, 2);
  lowBrick(room, 12, 10, T, T);
  blk(room, mat.mat, 4.3, 0, 8.9, 1.4, 0.02, 1);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.11; ground.receiveShadow = true; scene.add(ground);
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a2c22, 0.66));
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.78);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
  scene.add(sun); scene.add(sun.target);

  const world = new THREE.Group(); scene.add(world);

  // =====================================================================
  // Characters: blocky jointed skeletons
  // =====================================================================
  const rigMats = {};
  const rmat = (c) => rigMats[c] || (rigMats[c] = L(c));
  function box(p, c, w, h, d, x, y, z) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rmat(c)); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o;
  }
  const SHIRTS = [0x6f8fb3, 0x9a6fa8, 0x5f9e86, 0xc0785a, 0x8d8a5a, 0xb35a6f, 0x5a7aa0, 0x7d6a5a];
  const SKINS = [0xe6c3a0, 0xc99a74, 0x9c6b4a, 0x6f4a33, 0xf0d2b4, 0xb07f5c];
  function makeRig(o) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = 0.66; body.add(hips);
    box(hips, o.legs, 0.3, 0.1, 0.18, 0, 0, 0);
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.085, -0.03, 0); hips.add(hip);
      box(hip, o.legs, 0.11, 0.29, 0.12, 0, -0.15, 0);
      const knee = new THREE.Group(); knee.position.y = -0.31; hip.add(knee);
      box(knee, o.joint, 0.085, 0.06, 0.085, 0, 0, 0);
      box(knee, o.legs, 0.1, 0.26, 0.11, 0, -0.15, 0);
      box(knee, o.shoe, 0.11, 0.06, 0.18, 0, -0.29, 0.03);
      return { hip, knee };
    });
    const torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
    box(torso, o.shirt, 0.32, 0.42, 0.2, 0, 0.22, 0);
    if (o.apron) { box(torso, o.apron, 0.26, 0.4, 0.02, 0, 0.16, 0.105); box(torso, o.apron, 0.03, 0.02, 0.02, 0, 0.38, 0.11); }
    const head = new THREE.Group(); head.position.y = 0.45; torso.add(head);
    box(head, o.joint, 0.08, 0.05, 0.08, 0, 0.0, 0);
    box(head, o.skin, 0.24, 0.24, 0.24, 0, 0.15, 0);
    box(head, 0x15171b, 0.04, 0.045, 0.01, -0.055, 0.17, 0.122);
    box(head, 0x15171b, 0.04, 0.045, 0.01, 0.055, 0.17, 0.122);
    if (o.hat) { box(head, o.hat, 0.26, 0.07, 0.26, 0, 0.29, 0); box(head, o.hat, 0.22, 0.02, 0.1, 0, 0.27, 0.16); }
    else box(head, o.hair, 0.26, 0.06, 0.26, 0, 0.29, -0.01);
    const arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.21, 0.4, 0); torso.add(sh);
      box(sh, o.joint, 0.085, 0.085, 0.085, 0, 0, 0);
      box(sh, o.shirt, 0.09, 0.21, 0.09, 0, -0.13, 0);
      const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
      box(el, o.joint, 0.075, 0.06, 0.075, 0, 0, 0);
      box(el, o.skin, 0.08, 0.2, 0.08, 0, -0.12, 0);
      return { sh, el };
    });
    const carry = new THREE.Group(); carry.position.set(0, 0.12, 0.3); torso.add(carry);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.75), mat.hit); hit.position.y = 0.75; root.add(hit);
    return { root, body, hips, legs, arms, torso, head, carry, yaw: 0, ph: Math.random() * 6 };
  }
  const lerpR = (o, v, k) => { o.rotation.x += (v - o.rotation.x) * k; };
  function pose(r, anim, k) {
    const ph = r.ph, s = Math.sin(ph), s2 = Math.sin(ph * 2);
    let lh = 0, rh = 0, lk = 0, rk = 0, ls = 0, rs = 0, le = 0, re = 0, bob = 0, lean = 0;
    const moving = anim === 'walk' || anim === 'carry';
    if (moving) { lh = -s * 0.6; rh = s * 0.6; lk = Math.max(0, s) * 0.9; rk = Math.max(0, -s) * 0.9; bob = Math.abs(s) * 0.035; ls = s * 0.55; rs = -s * 0.55; le = re = -0.25; }
    if (anim === 'carry' || anim === 'hold') { ls = rs = -1.0; le = re = -0.65; }
    if (anim === 'work') { ls = -1.15 + s2 * 0.2; rs = -1.15 - s2 * 0.2; le = re = -0.55; lean = 0.08; }
    if (anim === 'build') { rs = -2.4 + Math.abs(Math.sin(ph * 1.4)) * 1.4; re = -0.3; ls = -0.9; le = -0.5; lh = -0.55; rh = 0.25; lk = 1.0; rk = 0.45; bob = -0.07; lean = 0.3; }
    if (anim === 'idle') { bob = Math.sin(ph * 0.35) * 0.008; }
    lerpR(r.legs[0].hip, lh, k); lerpR(r.legs[1].hip, rh, k); lerpR(r.legs[0].knee, lk, k); lerpR(r.legs[1].knee, rk, k);
    lerpR(r.arms[0].sh, ls, k); lerpR(r.arms[1].sh, rs, k); lerpR(r.arms[0].el, le, k); lerpR(r.arms[1].el, re, k);
    lerpR(r.torso, lean, k);
    r.body.position.y += (bob - r.body.position.y) * k;
  }

  // mood faces
  function faceTex(bg, kind) {
    return tex(16, 16, (x) => {
      x.fillStyle = '#15171b'; x.fillRect(3, 1, 10, 14); x.fillRect(1, 3, 14, 10); x.fillRect(2, 2, 12, 12);
      x.fillStyle = bg; x.fillRect(4, 2, 8, 12); x.fillRect(2, 4, 12, 8); x.fillRect(3, 3, 10, 10);
      x.fillStyle = '#15171b';
      x.fillRect(5, 6, 2, 2); x.fillRect(9, 6, 2, 2);
      if (kind === 'smile') { x.fillRect(5, 10, 1, 1); x.fillRect(10, 10, 1, 1); x.fillRect(6, 11, 4, 1); }
      if (kind === 'flat') x.fillRect(5, 11, 6, 1);
      if (kind === 'frown') { x.fillRect(6, 10, 4, 1); x.fillRect(5, 11, 1, 1); x.fillRect(10, 11, 1, 1); }
      if (kind === 'angry') { x.fillRect(4, 4, 2, 1); x.fillRect(6, 5, 1, 1); x.fillRect(10, 4, 2, 1); x.fillRect(9, 5, 1, 1); x.fillRect(6, 10, 4, 1); x.fillRect(5, 11, 1, 1); x.fillRect(10, 11, 1, 1); }
    });
  }
  const moodMats = [
    faceTex('#5fc58a', 'smile'), faceTex('#d9c45a', 'flat'), faceTex('#e08a48', 'frown'), faceTex('#d9534f', 'angry')
  ].map((t) => new THREE.SpriteMaterial({ map: t, depthTest: false }));

  // cups
  const cupGeo = {
    body: new THREE.CylinderGeometry(0.07, 0.055, 0.2, 10), sleeve: new THREE.CylinderGeometry(0.072, 0.066, 0.07, 10),
    lid: new THREE.CylinderGeometry(0.076, 0.076, 0.025, 10), band: new THREE.CylinderGeometry(0.074, 0.07, 0.03, 10),
    saucer: new THREE.CylinderGeometry(0.1, 0.09, 0.015, 12), small: new THREE.CylinderGeometry(0.055, 0.042, 0.08, 10),
    plate: new THREE.CylinderGeometry(0.12, 0.1, 0.015, 12), slab: new THREE.BoxGeometry(0.14, 0.08, 0.1),
    slot: new THREE.CylinderGeometry(0.085, 0.085, 0.004, 12)
  };
  const mCup = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
  function makeCup(prod) {
    const g = new THREE.Group(); let band;
    if (prod === 'filter') {
      g.add(mCup(cupGeo.body, mat.white, 0, 0.1, 0), mCup(cupGeo.sleeve, mat.sleeve, 0, 0.09, 0), mCup(cupGeo.lid, mat.white, 0, 0.21, 0));
      band = mCup(cupGeo.band, mat.amberB, 0, 0.16, 0);
    } else if (prod === 'espresso') {
      g.add(mCup(cupGeo.saucer, mat.white, 0, 0.008, 0), mCup(cupGeo.small, mat.white, 0, 0.055, 0));
      band = mCup(cupGeo.band, mat.amberB, 0, 0.06, 0); band.scale.set(0.8, 1, 0.8);
    } else {
      g.add(mCup(cupGeo.plate, mat.white, 0, 0.008, 0), mCup(cupGeo.slab, mat.pastry, 0, 0.055, 0));
      band = mCup(cupGeo.band, mat.amberB, 0, 0.11, 0); band.scale.set(0.5, 0.6, 0.5);
    }
    g.add(band); g.userData.band = band;
    return g;
  }
  // cup spots on a counter top: rows of four beside the till or the sign, one more row per four slots researched
  const SLOT_X = { till: 0.15, pickup: 0.2 };
  function slotsOf(it) {
    if (!(it.type in SLOT_X)) return null;
    const rows = Math.max(1, Math.ceil(it.cap / 4)), out = [];
    for (let i = 0; i < it.cap; i++) out.push([SLOT_X[it.type] + (i % 4) * 0.22, rows === 1 ? 0.5 : 0.2 + Math.floor(i / 4) * 0.6 / (rows - 1)]);
    return out;
  }

  // =====================================================================
  // Views
  // =====================================================================
  let S = null;
  const itemViews = new Map(), workerViews = new Map(), custViews = new Map(), cupViews = new Map();
  const tagFor = (cls) => { const d = document.createElement('div'); d.className = 'tag ' + cls; labelsEl.appendChild(d); return d; };

  function modelFor(type) {
    if (type === 'till') return onCounter(2, 1, mat.top, till, true, 1.25);
    if (type === 'pickup') return onCounter(2, 1, mat.top, pickupSign);
    if (type === 'brewer') return onCounter(1, 1, mat.top, batchBrewer);
    if (type === 'grinder') return onCounter(1, 1, mat.top, grinder);
    if (type === 'espresso') return onCounter(2, 1, mat.top, starterEspresso);
    if (type === 'store') return storeShelf();
    if (type === 'stock') return stockPallet();
    return onCounter(2, 1, mat.top, pastryCase);
  }
  function storeShelf() {
    const g = new THREE.Group();
    [[0.06, 0.08], [0.88, 0.08], [0.06, 0.86], [0.88, 0.86]].forEach(([x, z]) => blk(g, mat.woodDark, x, 0, z, 0.06, 1.7, 0.06));
    [0.06, 0.6, 1.14, 1.66].forEach((y) => blk(g, mat.wood, 0.04, y, 0.06, 0.92, 0.05, 0.88));
    const sacks = new THREE.Group(); g.add(sacks); g.userData.sacks = sacks;
    return g;
  }
  // a pallet on the floor with sacks stacked straight onto it
  function stockPallet() {
    const g = new THREE.Group();
    [0.1, 0.44, 0.78].forEach((x) => blk(g, mat.woodDark, x, 0, 0.1, 0.12, 0.06, 0.8));
    [0.1, 0.34, 0.58, 0.82].forEach((z) => blk(g, mat.plank, 0.08, 0.06, z, 0.84, 0.04, 0.1));
    const sacks = new THREE.Group(); g.add(sacks); g.userData.sacks = sacks; g.userData.layer = 0.24; g.userData.base = 0.1;
    return g;
  }
  function fillShelf(v, n) {
    const model = v.inner.children[0], holder = model && model.userData.sacks; if (!holder) return;
    const layer = model.userData.layer || 0.54, base = model.userData.base || 0.11;
    while (holder.children.length) holder.remove(holder.children[0]);
    for (let k = 0; k < n; k++) {
      const shelf = Math.floor(k / 4), slot = k % 4;
      if (shelf > 2) break;
      const m = sackMesh(); m.scale.set(0.95, 0.95, 0.95);
      m.position.set(0.28 + (slot % 2) * 0.42, base + shelf * layer, 0.3 + Math.floor(slot / 2) * 0.38); m.rotation.y = (k % 3) * 0.1;
      holder.add(m);
    }
  }
  function crateModel(w, d) {
    const g = new THREE.Group();
    blk(g, mat.crate, 0.12, 0, 0.12, w - 0.24, 0.72, d - 0.24);
    blk(g, mat.plank, 0.08, 0, 0.08, 0.08, 0.76, 0.08); blk(g, mat.plank, w - 0.16, 0, 0.08, 0.08, 0.76, 0.08);
    blk(g, mat.plank, 0.08, 0, d - 0.16, 0.08, 0.76, 0.08); blk(g, mat.plank, w - 0.16, 0, d - 0.16, 0.08, 0.76, 0.08);
    blk(g, mat.amber, w / 2 - 0.15, 0.3, d - 0.125, 0.3, 0.16, 0.01);
    return g;
  }
  function makeItemView(it) {
    const c = CAT[it.type], [w, d] = Sim.dimsOf(it.type, it.r);
    const root = new THREE.Group();
    root.position.set(it.x + w / 2, 0, it.z + d / 2); root.rotation.y = it.r * Math.PI / 2;
    root.userData.pick = { kind: 'item', id: it.id };
    const inner = new THREE.Group(); inner.position.set(-c.w / 2, 0, -c.d / 2); root.add(inner);
    inner.add(it.built ? modelFor(it.type) : crateModel(c.w, c.d));
    if (it.built && slotsOf(it)) slotsOf(it).forEach(([x, z]) => add(inner, cupGeo.slot, mat.slot, x, TOP + 0.003, z));
    const olm = B(0xe0a458, { transparent: true, opacity: 0.9, depthWrite: false });
    const ol = new THREE.Group(); inner.add(ol);
    const th = 0.06;
    [[0, 0, c.w, th], [0, c.d - th, c.w, th], [0, 0, th, c.d], [c.w - th, 0, th, c.d]].forEach(([x, z, ww, dd]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.02, dd), olm); m.position.set(x + ww / 2, 0.012, z + dd / 2); ol.add(m);
    });
    ol.visible = false;
    const v = { root, inner, ol, olm, built: it.built, cap: it.cap, slots: it.built && slotsOf(it), tag: null, tagKey: '' };
    if (!it.built) v.tag = tagFor('crate');
    // stock tiles are laid in groups and show their sacks on the pallet, so they go without a gauge
    else if (S.R.items[it.type].hopper || S.R.items[it.type].knock || (S.R.items[it.type].sacks && it.type !== 'stock')) v.gauge = tagFor('gauge');
    return v;
  }
  function workerRig() {
    return makeRig({ shirt: 0x2c3e55, legs: 0x22303f, shoe: 0x15171b, skin: 0xe6c3a0, joint: 0xe9e4d8, apron: 0xe0a458, hat: 0xe0a458 });
  }
  function custRig(c) {
    const shirt = SHIRTS[c.look % SHIRTS.length], skin = SKINS[(c.look * 5 + c.id) % SKINS.length];
    return makeRig({ shirt, legs: 0x3a3f4a, shoe: 0x2b2f36, skin, joint: 0x9aa4b1, hair: [0x2b2118, 0x5a3a22, 0x15171b, 0xb08a4a][c.id % 4] });
  }

  function clearViews() {
    [itemViews, workerViews, custViews, cupViews].forEach((m) => { m.forEach((v) => { if (v.root.parent) v.root.parent.remove(v.root); if (v.tag) v.tag.remove(); if (v.gauge) v.gauge.remove(); }); m.clear(); });
  }

  // =====================================================================
  // Camera and input
  // =====================================================================
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  const controls = new THREE.OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.maxPolarAngle = 1.3; controls.minZoom = 0.6; controls.maxZoom = 4;
  controls.screenSpacePanning = true;
  const VIEW = { target: new V3(6, 0.6, 6), halfW: 8.6, halfH: 6.4 };
  const isoDir = new V3(1, 0.8165, 1).normalize();
  function fitFrustum() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
    const hh = Math.max(VIEW.halfH, VIEW.halfW / a);
    cam.left = -hh * a; cam.right = hh * a; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
  }
  function resetView() {
    controls.target.copy(VIEW.target);
    cam.position.copy(VIEW.target).addScaledVector(isoDir, 60);
    cam.zoom = 1; fitFrustum(); controls.update();
  }
  let pixel = true;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setPixelRatio(pixel ? 0.5 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); fitFrustum();
  }
  new ResizeObserver(resize).observe(stage);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new V3(0, 1, 0), 0);
  function aim(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
  }
  function tagOf(o) { while (o && !o.userData.pick) o = o.parent; return o ? o.userData.pick : null; }
  function pickObject() {
    const ws = []; workerViews.forEach((v) => ws.push(v.root));
    let h = ray.intersectObjects(ws, true); if (h.length) return tagOf(h[0].object);
    const is = []; itemViews.forEach((v) => is.push(v.root));
    h = ray.intersectObjects(is, true); for (const x of h) { const t = tagOf(x.object); if (t) return t; }
    return null;
  }
  function pickCell() { const p = new V3(); if (!ray.ray.intersectPlane(floorPlane, p)) return null; return { x: Math.floor(p.x), z: Math.floor(p.z) }; }

  // ---------- icons: the real models, rendered once to small pixel images ----------
  const ICONS = {};
  function renderIcons() {
    let r;
    try { r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return; }
    const N = 40; r.setPixelRatio(1); r.setSize(N, N, false); r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a2c22, 0.95));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.65); sun.position.set(4, 9, 6); sc.add(sun);
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100), box = new THREE.Box3(), size = new V3(), mid = new V3();
    const shoot = (obj, k) => {
      obj.traverse((o) => { if (o.material === mat.hit) o.visible = false; });
      sc.add(obj); box.setFromObject(obj); box.getSize(size); box.getCenter(mid);
      const h = Math.max(size.x, size.y, size.z) * (k || 0.62);
      c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.updateProjectionMatrix();
      c.position.copy(mid).addScaledVector(isoDir, 30); c.lookAt(mid);
      r.render(sc, c); const url = r.domElement.toDataURL(); sc.remove(obj); return url;
    };
    const withSacks = (m, n) => { fillShelf({ inner: { children: [m] } }, n); return m; };
    ['till', 'pickup', 'brewer', 'grinder', 'espresso', 'pastry'].forEach((t) => { ICONS[t] = shoot(modelFor(t)); });
    ICONS.stock = shoot(withSacks(modelFor('stock'), 6));
    ICONS.store = shoot(withSacks(modelFor('store'), 7));
    ICONS.cup = shoot(makeCup('filter'));
    const sack = new THREE.Group(); sack.add(sackMesh()); const s2 = sackMesh(); s2.position.set(0.12, 0, 0.3); s2.rotation.y = 0.5; sack.add(s2); ICONS.sack = shoot(sack);
    ICONS.worker = shoot(workerRig().root, 0.46);
    const books = new THREE.Group();
    [[mat.red, 0, 0.7], [mat.sleeve, 0.14, 0.62], [mat.chalk, 0.28, 0.66]].forEach(([m, y, w], i) => { blk(books, m, -w / 2 + i * 0.03, y, -0.22, w, 0.13, 0.44); blk(books, mat.white, -w / 2 + i * 0.03 + 0.03, y + 0.02, 0.2, w - 0.06, 0.09, 0.03); });
    ICONS.research = shoot(books);
    r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
    document.querySelectorAll('img[data-ico]').forEach((img) => { if (ICONS[img.dataset.ico]) img.src = ICONS[img.dataset.ico]; });
  }

  // =====================================================================
  // Game state & UI state
  // =====================================================================
  let speed = 1, acc = 0;
  let sel = null, hover = null, placing = null, hoverCell = null, lastPointer = null;
  let watching = false, watchCode = '';
  let armed = null;  // { act, id, until }
  let seenEvent = 0;
  const ticker = [];

  function newGame(seed, log, rules) {
    clearViews();
    S = Sim.create(seed, log, rules); CAT = S.R.CAT; PROD = S.R.PROD;
    sel = null; hover = null; placing = null; armed = null; seenEvent = 0; ticker.length = 0; buildMode = false; tray = null; accessKey = ''; revealed.clear(); fresh.clear(); freshItems.clear(); seenDone.clear(); dismissed.clear(); goalsMet.clear(); ticketsEl.textContent = ''; dockKey = ''; suppliesKey = ''; pileN = -1; flowKey = ''; resKey = ''; if (typeof closeCtx === 'function') closeCtx();
    watching = !!(log && log.length); bot = null;
    document.getElementById('scenario').textContent = 'Scenario 1 · seed ' + seed + (Object.keys(S.over).length ? ' · custom rules' : '');
    document.getElementById('scenario').title = Object.entries(S.over).map(([k, v]) => k + ' = ' + v).join('\n');
    document.getElementById('splashFoot').textContent = document.getElementById('scenario').textContent; passHtml = '';
    renderTicker(); refreshDock(); refreshPanel(true);
  }

  function act(...args) {
    const wasWatching = watching && S.pending.length;
    if (bot) stopBot('You took over from the bot.');
    const err = Sim.act(S, ...args);
    if (wasWatching) { watching = false; note('You took over the replay.', 'warn'); }
    if (err) note(err, 'bad');
    refreshDock(); refreshPanel(true);
    return err;
  }
  function note(text, kind) {
    const last = ticker[ticker.length - 1], now = performance.now();
    if (last && last.text === text && now - last.at < 15000) { last.n = (last.n || 1) + 1; last.at = now; }
    else { ticker.push({ text, kind: kind || 'info', at: now }); while (ticker.length > 4) ticker.shift(); }
    renderTicker();
  }
  function renderTicker() {
    document.getElementById('ticker').innerHTML = ticker.map((t) => '<p class="' + t.kind + '">' + esc(t.text) + (t.n > 1 ? ' ×' + t.n : '') + '</p>').join('');
  }

  // =====================================================================
  // Sync sim → scene
  // =====================================================================
  const centreOf = (it) => { const [w, d] = Sim.dimsOf(it.type, it.r); return { x: it.x + w / 2, z: it.z + d / 2 }; };
  function agentPos(a, frac) {
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
  function turn(r, target, k) {
    let d = target - r.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    r.yaw += d * k; r.root.rotation.y = r.yaw;
  }
  function faceAgent(rig, a, p, faceId, k) {
    // face along the step, not at the next tile's centre: near the end of a step that vector shrinks to the crowd offset and spins
    if (a.path.length) { const n = a.path[0]; turn(rig, Math.atan2(n.x - a.x, n.z - a.z), k); return; }
    const it = faceId != null && S.imap[faceId];
    if (it) { const c = centreOf(it); turn(rig, Math.atan2(c.x - p.x, c.z - p.z), k); }
  }

  function sync(frac, dt) {
    const animRate = speed === 0 ? 0 : Math.min(speed, 3);
    const k = 1 - Math.pow(0.001, dt * 6);
    // items
    const seen = new Set();
    for (const it of S.items) {
      seen.add(it.id);
      let v = itemViews.get(it.id);
      if (!v || v.built !== it.built || v.cap !== it.cap) { if (v) { world.remove(v.root); if (v.tag) v.tag.remove(); if (v.gauge) v.gauge.remove(); } v = makeItemView(it); itemViews.set(it.id, v); world.add(v.root); }
      if (it.built && holdsSacks(it) && v.sackN !== it.sacks) { v.sackN = it.sacks; fillShelf(v, it.sacks); }
    }
    itemViews.forEach((v, id) => { if (!seen.has(id)) { world.remove(v.root); if (v.tag) v.tag.remove(); if (v.gauge) v.gauge.remove(); itemViews.delete(id); } });

    // workers
    const wseen = new Set();
    for (const w of S.workers) {
      wseen.add(w.id);
      let v = workerViews.get(w.id);
      if (!v) { const rig = workerRig(); rig.root.userData.pick = { kind: 'worker', id: w.id }; v = { root: rig.root, rig, tag: tagFor('who') }; v.tag.textContent = w.name; workerViews.set(w.id, v); world.add(rig.root); const p0 = agentPos(w, 0); rig.root.position.set(p0.x, 0, p0.z); }
      const p = agentPos(w, frac); v.root.position.set(p.x, 0, p.z);
      faceAgent(v.rig, w, p, w.face, k);
      v.rig.ph += dt * (w.anim === 'walk' || w.anim === 'carry' ? 9 : 6) * animRate;
      pose(v.rig, w.anim, k);
      if (v.loadKind !== w.load) {
        if (v.loadMesh) { v.rig.carry.remove(v.loadMesh); v.loadMesh = null; }
        v.loadKind = w.load;
        if (w.load) v.loadMesh = w.load === 'sack' ? sackMesh() : groundsMesh();
        if (v.loadMesh) { v.loadMesh.position.set(0, -0.02, 0.02); v.rig.carry.add(v.loadMesh); }
      }
      v.tag.classList.toggle('sel', !!(sel && sel.kind === 'worker' && sel.id === w.id));
    }
    workerViews.forEach((v, id) => { if (!wseen.has(id)) { world.remove(v.root); v.tag.remove(); workerViews.delete(id); } });

    // customers
    const cseen = new Set();
    for (const c of S.customers) {
      cseen.add(c.id);
      let v = custViews.get(c.id);
      if (!v) {
        const rig = custRig(c); const sp = new THREE.Sprite(moodMats[0]); sp.scale.set(0.34, 0.34, 1); sp.position.y = 1.78; sp.renderOrder = 5; rig.root.add(sp);
        v = { root: rig.root, rig, sp, held: null }; custViews.set(c.id, v); world.add(rig.root);
      }
      const p = agentPos(c, frac); v.root.position.set(p.x, 0, p.z);
      faceAgent(v.rig, c, p, c.face, k);
      const carrying = c.carry && c.state === 'leave';
      if (carrying && !v.held) { v.held = makeCup(c.carry); v.held.userData.band.visible = false; v.rig.carry.add(v.held); }
      const anim = carrying ? (c.anim === 'walk' ? 'carry' : 'hold') : c.anim;
      v.rig.ph += dt * (c.anim === 'walk' ? 8 : 5) * animRate;
      pose(v.rig, anim, k);
      let mood;
      if (c.state === 'leave') mood = c.outcome < 0 ? 3 : c.outcome >= 0.75 ? 0 : c.outcome >= 0.5 ? 1 : 2;
      else { const r = (S.t - c.arrive) / c.pat; mood = r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3; }
      v.sp.material = moodMats[mood];
    }
    custViews.forEach((v, id) => { if (!cseen.has(id)) { world.remove(v.root); custViews.delete(id); } });

    // cups: physical WIP
    const useen = new Set();
    for (const cup of S.cups) {
      useen.add(cup.id);
      let v = cupViews.get(cup.id);
      if (!v) { v = { root: makeCup(cup.prod) }; cupViews.set(cup.id, v); }
      let parent = null;
      if (cup.state === 'carried') {
        const w = S.workers.find((o) => o.carry === cup.id); const wv = w && workerViews.get(w.id);
        if (wv) { parent = wv.rig.carry; v.root.position.set(0, 0, 0); }
      } else {
        const it = S.imap[cup.at], iv = it && itemViews.get(it.id), slots = iv && iv.slots;
        if (iv && slots) {
          const i = it.buf.indexOf(cup.id), s = slots[Math.min(i, slots.length - 1)];
          parent = iv.inner; v.root.position.set(s[0], TOP, s[1]);
        }
      }
      if (parent && v.root.parent !== parent) parent.add(v.root);
      if (!parent && v.root.parent) v.root.parent.remove(v.root);
      v.root.userData.band.visible = cup.state === 'queued' || cup.state === 'claimed';
    }
    cupViews.forEach((v, id) => { if (!useen.has(id)) { if (v.root.parent) v.root.parent.remove(v.root); cupViews.delete(id); } });

    // highlights
    const sw = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
    for (const it of S.items) {
      const v = itemViews.get(it.id);
      let col = null;
      if (sw && it.built && (sw.all || sw.patch.includes(it.id))) col = 0xe0a458;
      if (sw && !it.built && sw.builds.includes(it.id)) col = 0xe0a458;
      if (sel && sel.kind === 'item' && sel.id === it.id) col = 0xe0a458;
      if (hover && hover.kind === 'item' && hover.id === it.id) col = col ? 0xffffff : 0xaab6c4;
      v.ol.visible = col != null; if (col != null) v.olm.color.setHex(col);
    }
    ring.visible = !!sw;
    if (sw) { const v = workerViews.get(sw.id); if (v) ring.position.set(v.root.position.x, 0.02, v.root.position.z); }
    hring.visible = !!(hover && hover.kind === 'worker' && !(sw && sw.id === hover.id));
    if (hring.visible) { const v = workerViews.get(hover.id); if (v) hring.position.set(v.root.position.x, 0.02, v.root.position.z); else hring.visible = false; }
  }
  // sacks of beans and bags of grounds
  mat.sack = L(0xc9b48a); mat.sackBand = L(0x7b4a2e); mat.groundsBag = L(0x3a2a20);
  function sackMesh() {
    const g = new THREE.Group();
    blk(g, mat.sack, -0.17, 0, -0.11, 0.34, 0.24, 0.22);
    blk(g, mat.sackBand, -0.175, 0.09, -0.115, 0.35, 0.05, 0.23);
    blk(g, mat.sack, -0.08, 0.24, -0.06, 0.16, 0.05, 0.12);
    return g;
  }
  function groundsMesh() {
    const g = new THREE.Group();
    blk(g, mat.groundsBag, -0.12, 0, -0.1, 0.24, 0.22, 0.2);
    blk(g, mat.groundsBag, -0.05, 0.22, -0.04, 0.1, 0.06, 0.08);
    return g;
  }
  const pile = new THREE.Group(); scene.add(pile);
  let pileN = -1;
  function updatePile() {
    const n = S.supply.door;
    if (n === pileN) return; pileN = n;
    while (pile.children.length) pile.remove(pile.children[0]);
    for (let k = 0; k < Math.min(n, 18); k++) {
      const m = sackMesh(), col = k % 3, row = Math.floor(k / 3) % 2, layer = Math.floor(k / 6);
      m.position.set(6.35 + col * 0.38, layer * 0.25, 10.45 + row * 0.27); m.rotation.y = (k % 2) * 0.12;
      pile.add(m);
    }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), B(0xe0a458, { side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const hring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 24), B(0xaab6c4, { side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  hring.rotation.x = -Math.PI / 2; scene.add(hring);

  // ---------- placement ghost ----------
  const ghost = new THREE.Group(); ghost.visible = false; scene.add(ghost);
  const gFillM = B(0x5fc58a, { transparent: true, opacity: 0.35, depthWrite: false });
  const gFill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), gFillM); ghost.add(gFill);
  const gBoxM = new THREE.LineBasicMaterial({ color: 0x5fc58a });
  const gBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), gBoxM); ghost.add(gBox);
  const gStaff = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), B(0x7fb3e0, { transparent: true, opacity: 0.75, depthWrite: false })); ghost.add(gStaff);
  const gCust = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), B(0xe0a458, { transparent: true, opacity: 0.75, depthWrite: false })); ghost.add(gCust);
  let ghostReason = null;
  function updateGhost() {
    if (!placing || !hoverCell) { ghost.visible = false; return; }
    const [w, d] = Sim.dimsOf(placing.type, placing.r);
    const o = { x: hoverCell.x - (w > 1 ? Math.floor((w - 1) / 2) : 0), z: hoverCell.z - (d > 1 ? Math.floor((d - 1) / 2) : 0) };
    placing.x = o.x; placing.z = o.z;
    const it = { type: placing.type, x: o.x, z: o.z, r: placing.r };
    ghostReason = S.cash < CAT[placing.type].cost ? 'Not enough cash' : Sim.canPlace(S, placing.type, o.x, o.z, placing.r);
    const col = ghostReason ? 0xe06a55 : 0x5fc58a;
    gFillM.color.setHex(col); gBoxM.color.setHex(col);
    gFill.scale.set(w, 1, d); gFill.position.set(o.x + w / 2, 0.02, o.z + d / 2);
    gBox.scale.set(w, 1.07, d); gBox.position.set(o.x + w / 2, 0.535, o.z + d / 2);
    const wc = Sim.wcell(it, S.grid), cc = Sim.ccell(it);
    gStaff.position.set(wc.x + 0.5, 0.02, wc.z + 0.5);
    gCust.visible = !!cc; if (cc) gCust.position.set(cc.x + 0.5, 0.02, cc.z + 0.5);
    ghost.visible = true;
  }

  // ---------- pointer ----------
  const tip = document.getElementById('tip');
  let down = null;
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || (down.b !== 0 && down.b !== 2)) { down = null; return; }
    const b = down.b, moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 6) return;
    aim(e);
    if (b === 2) contextClick(e); else click(e);
  });
  document.addEventListener('pointerdown', (e) => { if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeCtx(); }, true);
  renderer.domElement.addEventListener('pointermove', (e) => { lastPointer = { x: e.clientX, y: e.clientY, e }; });
  renderer.domElement.addEventListener('pointerleave', () => { lastPointer = null; hover = null; hoverCell = null; tip.hidden = true; });

  function click(e) {
    if (placing) {
      const c = pickCell(); if (!c) return;
      updateGhost();
      if (ghostReason) { note(ghostReason, 'bad'); return; }
      const err = act('place', placing.type, placing.x, placing.z, placing.r);
      if (!err) {
        if (!e.shiftKey) { placing = null; ghost.visible = false; }
      }
      refreshBuild(); return;
    }
    const p = pickObject();
    if (buildMode) {
      if (p && p.kind === 'item') { openItemCtx(p.id, e); return; }
      if (p && p.kind === 'worker') { setBuildMode(false); sel = p; refreshPanel(true); }
      return;
    }
    if (p && p.kind === 'worker') { sel = sel && sel.kind === 'worker' && sel.id === p.id ? null : p; armed = null; refreshPanel(true); return; }
    if (p && p.kind === 'item') {
      const it = S.imap[p.id]; if (!it) return;
      const w = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
      if (w) {
        if (!it.built) {
          const had = w.builds.includes(it.id);
          if (!act('build', w.id, it.id)) note(had ? w.name + ' won’t build ' + Sim.label(S, it) + ' after all' : w.name + ' will build ' + Sim.label(S, it) + (w.builds.length > 1 ? ' (#' + w.builds.length + ' in the list)' : ''), 'info');
        } else {
          if (!act('patch', w.id, it.id)) note(patchText(w), 'info');
        }
        return;
      }
      sel = p; armed = null; refreshPanel(true); return;
    }
    sel = null; armed = null; refreshPanel(true);
  }
  function patchText(w) {
    if (w.all) return w.name + ' covers every station';
    if (!w.patch.length) return w.name + ' has no stations and will stand idle';
    return w.name + ' now works at ' + w.patch.map((id) => Sim.label(S, S.imap[id])).join(', ');
  }
  function hoverTick() {
    if (!lastPointer || down || !ctxEl.hidden) { if (!lastPointer || !ctxEl.hidden) tip.hidden = true; return; }
    aim(lastPointer.e);
    hoverCell = pickCell();
    let text = null, bad = false;
    if (placing) {
      hover = null; updateGhost();
      const c = CAT[placing.type];
      text = ghostReason ? ghostReason : c.name + ' · ' + price(c) + ' · click to place · R rotates · Esc or right-click to choose again. Blue: staff stand here. Amber: customers.';
      bad = !!ghostReason;
    } else {
      ghost.visible = false;
      hover = pickObject();
      const w = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
      if (buildMode) {
        if (hover && hover.kind === 'item') { const it = S.imap[hover.id]; text = it ? Sim.label(S, it) + ' · click for builders, details or selling' : null; }
        else if (hover && hover.kind === 'worker') { const h = S.wmap[hover.id]; text = h ? 'Click to select ' + h.name + ' and leave build mode' : null; }
      } else if (hover && hover.kind === 'worker') { const h = S.wmap[hover.id]; text = h ? (w && w.id === h.id ? 'Click to deselect ' + h.name : 'Click to select ' + h.name) : null; }
      else if (hover && hover.kind === 'item') {
        const it = S.imap[hover.id];
        if (it && w) {
          const name = Sim.label(S, it);
          if (!it.built) text = w.builds.includes(it.id) ? 'Click to take ' + name + ' off ' + w.name + '’s build list' : 'Click to have ' + w.name + ' build ' + name;
          else if (w.all) text = 'Click to make ' + w.name + ' work only at ' + name;
          else text = w.patch.includes(it.id) ? 'Click to take ' + w.name + ' off ' + name : 'Click to add ' + name + ' to ' + w.name + '’s stations';
        } else if (it) text = Sim.label(S, it) + (it.built ? '' : ' (crate)') + ' · click for details';
      }
    }
    renderer.domElement.style.cursor = hover || placing ? 'pointer' : 'grab';
    if (!text) { tip.hidden = true; return; }
    const r = stage.getBoundingClientRect();
    tip.textContent = text; tip.classList.toggle('bad', bad); tip.hidden = false;
    const x = Math.min(lastPointer.x - r.left, r.width - 290), y = Math.min(lastPointer.y - r.top, r.height - 60);
    tip.style.left = Math.max(0, x) + 'px'; tip.style.top = Math.max(0, y) + 'px';
  }

  // ---------- keyboard ----------
  const SPEEDS = [0, 1, 2, 5, 20];
  let lastRunSpeed = 1;
  function setSpeed(s) {
    if (s > 0) lastRunSpeed = s;
    speed = s;
    document.querySelectorAll('#speed button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === s)));
  }
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('textarea, input')) return;
    if (!splash.hidden) { if (e.key === 'Escape' && started) hideSplash(splashSpeed); return; }
    if (e.key === 'Escape' && !moreMenu.hidden) { setMore(false); moreBtn.focus(); return; }
    if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : lastRunSpeed); }
    else if (/^Digit[1-5]$/.test(e.code)) setSpeed(SPEEDS[+e.code.slice(5) - 1]);
    else if (e.key === 'r' || e.key === 'R') { if (placing) { placing.r = (placing.r + 1) % 4; updateGhost(); refreshBuild(); } }
    else if ((e.key === 'b' || e.key === 'B') && document.getElementById('modal').hidden) { closeCtx(); setBuildMode(!buildMode); }
    else if ((e.key === 'f' || e.key === 'F') && document.getElementById('modal').hidden) setFlow(flowEl.hidden);
    else if ((e.key === 't' || e.key === 'T') && document.getElementById('modal').hidden) setResearch(resEl.hidden);
    else if (e.key === 'Escape') {
      if (!document.getElementById('modal').hidden) closeModal();
      else if (!playModal.hidden) { closePlay(); setSpeed(wasSpeed); }
      else if (!ctxEl.hidden) closeCtx();
      else if (placing) { placing = null; ghost.visible = false; refreshBuild(); }
      else if (tray) setTray(null);
      else if (!flowEl.hidden) setFlow(false);
      else if (!resEl.hidden) setResearch(false);
      else { sel = null; armed = null; refreshPanel(true); }
    }
  });

  // =====================================================================
  // HUD
  // =====================================================================
  const cashEl = document.getElementById('cash'), rateEl = document.getElementById('cashRate'), moodEl = document.getElementById('mood');
  const passEl = document.getElementById('pass'), clockEl = document.getElementById('clock'), openBtn = document.getElementById('openBtn');
  function fmtTime(t) { const m = Math.floor(t / 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
  // money per game hour, from the last hour of history (or what wages cost before there is any)
  function cashPerHour() {
    const H = S.hist.cash, n = H.length;
    if (n < 10) return -(S.workers.length * S.R.wagePerMin + S.R.rentPerMin) * 60;
    const k = Math.min(60, n - 1);
    return Math.round((H[n - 1] - H[n - 1 - k]) * 60 / k);
  }
  function passStages() {
    const c = { queue: 0, rail: 0, making: 0, ready: 0 };
    for (const it of S.items) if (it.type === 'till') c.queue += it.queue.length;
    for (const k of S.cups) { if (k.waste) continue; if (k.state === 'queued') c.rail++; else if (k.state === 'ready') c.ready++; else c.making++; }
    return c;
  }
  let passHtml = '';
  function refreshStats() {
    const st = S.st;
    cashEl.textContent = money(S.cash); cashEl.classList.toggle('neg', S.cash < 0);
    const ph = cashPerHour();
    rateEl.textContent = (ph >= 0 ? '+' : '−') + money(Math.abs(ph)) + ' an hour' + (!S.open && !st.arrived ? ' before you open' : '');
    rateEl.className = ph > 0 ? 'up' : ph < 0 && S.cash < -ph * 2 ? 'down' : '';
    clockEl.textContent = fmtTime(S.t);
    const trading = S.open || st.arrived > 0;
    moodEl.hidden = passEl.hidden = !trading;
    if (trading) {
      const sat = Math.round(st.sat * 100);
      moodEl.className = 'mood' + (st.sat < 0.45 ? ' bad' : st.sat < 0.65 ? ' meh' : '');
      moodEl.innerHTML = '<i></i>' + sat + '% happy' + (st.abandoned ? ' · ' + st.abandoned + ' walked out' : '');
      const c = passStages(), worst = Math.max(c.queue, c.rail, c.making, c.ready);
      const seg = (n, label, k) => '<li class="' + (n >= 6 ? 'jam' : n >= 3 && n === worst ? 'hot' : '') + '"><b>' + n + '</b><span>' + label + '</span></li>';
      const html = seg(c.queue, 'queuing') + '<li class="chev" aria-hidden="true">›</li>' + seg(c.rail, 'orders') + '<li class="chev" aria-hidden="true">›</li>' +
        seg(c.making, 'making') + '<li class="chev" aria-hidden="true">›</li>' + seg(c.ready, 'ready') +
        '<li class="lead"><b>' + (st.served ? (st.lead / 60).toFixed(1) + ' min' : '–') + '</b><span>door to cup</span></li>';
      if (html !== passHtml) { passHtml = html; passEl.innerHTML = html; }
    }
    const why = S.open ? null : Sim.whyNotOpen(S);
    openBtn.hidden = !!why && !trading;
    openBtn.textContent = S.open ? 'Open' : trading ? 'Closed' : 'Open shop';
    openBtn.classList.toggle('is-open', S.open);
    openBtn.classList.toggle('call', !S.open && !why && !trading);
    openBtn.disabled = !!why; openBtn.title = why || (S.open ? 'Click to close: no new customers will arrive' : 'Let customers in');
  }

  // ---------- the ticket rail: steps, problems, milestones and goals ----------
  // Every ticket is worked out from the game state, so it stays while the problem lasts and comes down when it is fixed.
  const railEl = document.getElementById('rail'), ticketsEl = document.getElementById('tickets');
  const dismissed = new Set(), goalsMet = new Set();
  const sumCups = () => beansInShop() + (S.supply.door + S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0)) * S.R.supply.sackDoses;
  const unassigned = () => S.items.filter((i) => !i.built && !S.workers.some((w) => !w.leaving && w.builds.includes(i.id)));
  function tutorialStep() {
    const has = (t, built) => S.items.some((i) => i.type === t && (!built || i.built));
    const sellable = (built) => PKEYS.some((p) => has(PROD[p].machine, built));
    const who = S.workers[0] ? S.workers[0].name : 'your worker';
    if (S.st.served > 0) return null;
    if (!(has('till') && has('pickup') && sellable(false))) {
      const next = !has('till') ? ['Place a till', 'Customers order and pay here. Pick Counters below, then Till.', 'counters']
        : !has('pickup') ? ['Place a pickup counter', 'Finished drinks wait here. It is in Counters too.', 'counters']
        : ['Add a batch brewer', 'Something to sell. Pick Machines, then Batch brewer.', 'machines'];
      return { sev: 'step', k: 'Step 1 of 4', title: next[0], body: next[1], btn: 'Open ' + next[2][0].toUpperCase() + next[2].slice(1), act: 'tray', arg: next[2] };
    }
    if (!(has('till', true) && has('pickup', true) && sellable(true))) {
      const n = unassigned().length;
      return { sev: 'step', k: 'Step 2 of 4', title: 'Build the crates', body: n ? 'Right-click a crate and pick ' + who + ', or hand them all over.' : who + ' is on it. Speed up time while you wait.', btn: n ? 'Give all to ' + who : '', act: 'assignAll' };
    }
    if (!S.open && !S.st.arrived) return { sev: 'step', k: 'Step 3 of 4', title: 'Open the shop', body: 'Customers start arriving once you open.', btn: 'Open shop', act: 'open' };
    return { sev: 'step', k: 'Step 4 of 4', title: 'Serve a customer', body: 'They order at the till, ' + who + ' brews, and they collect at pickup.' };
  }
  const GOALS = [
    ['serve50', 'Serve 50 customers', () => S.st.served, 50],
    ['cash1000', 'Have £1,000 in the bank', () => Math.floor(S.cash / 100), 1000],
    ['espresso', 'Put espresso on the menu', () => (Sim.offered(S).includes('espresso') ? 1 : 0), 1],
    ['serve200', 'Serve 200 customers', () => S.st.served, 200],
    ['cake', 'Put cake on the menu', () => (Sim.offered(S).includes('cake') ? 1 : 0), 1],
    ['cash2500', 'Have £2,500 in the bank', () => Math.floor(S.cash / 100), 2500]
  ];
  function goalTicket() {
    for (const [id, title, val, target] of GOALS) {
      if (goalsMet.has(id)) continue;
      const v = val();
      if (v >= target) { goalsMet.add(id); note('Goal met: ' + title.toLowerCase() + '.', 'good'); continue; }
      return { sev: 'goal', k: 'Goal', title, bar: target > 1 ? Math.max(0, v) / target : null, body: target > 1 ? Math.max(0, v).toLocaleString('en-GB') + ' of ' + target.toLocaleString('en-GB') : '' };
    }
    return null;
  }
  function problemTickets() {
    const out = [], name = (it) => esc(Sim.label(S, it));
    for (const it of S.items) {
      if (!it.built) continue;
      const hc = S.R.items[it.type].hopper || 0, kc = S.R.items[it.type].knock || 0;
      const prods = PKEYS.filter((p) => Sim.offered(S).includes(p) && (PROD[p].machine === it.type || (it.type === 'grinder' && PROD[p].grinds)));
      if (hc && it.beans <= 0 && prods.length) {
        const none = S.supply.door + S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0) <= 0;
        out.push(none ? { sev: 'crit', k: 'Now', title: 'Out of beans', body: 'No sacks left for ' + name(it) + '.' + (S.supply.onOrder ? ' More are on the way.' : ''), btn: S.supply.onOrder ? '' : 'Order 5 sacks', act: 'order', arg: 5 }
          : { sev: 'crit', k: 'Now', title: 'Hopper empty', body: name(it) + ' can’t make ' + PROD[prods[0]].name.toLowerCase() + ' until it’s refilled.', btn: 'Show me', act: 'show', arg: it.id });
      }
      if (kc && it.grounds >= kc) out.push({ sev: 'crit', k: 'Now', title: 'Bin full', body: name(it) + ' has stopped until someone empties it.', btn: 'Show me', act: 'show', arg: it.id });
    }
    const W = S.hist.walked, n = W.length, gone = n > 1 ? W[n - 1] - W[Math.max(0, n - 11)] : 0;
    if (gone > 0) { const till = S.items.find((i) => i.built && i.type === 'till'); out.push({ sev: 'crit', k: 'Last 10 min', title: 'Walking out', body: gone + ' customer' + (gone > 1 ? 's' : '') + ' gave up waiting.', btn: till ? 'Show me' : '', act: 'show', arg: till && till.id }); }
    if (S.st.served > 0 || S.t > 600) {
      const crates = unassigned();
      if (crates.length) out.push({ sev: 'warn', k: crates.length > 1 ? crates.length + ' crates' : 'Crate', title: 'Needs a builder', body: crates.map((c) => esc(Sim.label(S, c))).join(', ') + (crates.length > 1 ? ' are' : ' is') + ' waiting.', btn: 'Assign', act: 'assignAll' });
    }
    if (S.items.some((i) => i.built && S.R.items[i.type].hopper) && !S.supply.onOrder && sumCups() <= S.R.supply.sackDoses && sumCups() > 0)
      out.push({ sev: 'warn', k: 'Beans', title: 'Running low', body: 'About ' + sumCups() + ' cups left and nothing on order.', btn: S.cash >= S.R.supply.sackCost * 5 ? 'Order 5 sacks' : 'Order 1 sack', act: 'order', arg: S.cash >= S.R.supply.sackCost * 5 ? 5 : 1 });
    const burn = (S.workers.length * S.R.wagePerMin + S.R.rentPerMin) * 60;
    if (S.cash < 0) out.push({ sev: 'crit', k: 'Money', title: 'In the red', body: 'Wages keep going out. Sell something or cut staff.' });
    else if ((S.open || S.st.arrived) && S.cash < burn) out.push({ sev: 'warn', k: 'Money', title: 'Cash is low', body: 'Less than an hour of wages and rent left.' });
    return out;
  }
  function milestoneTickets() {
    const out = [];
    for (const k of Sim.TKEYS) {
      const r = S.research[k];
      if (!r.complete || r.finished <= 0 || S.t - r.finished > 3600 || dismissed.has('res:' + k)) continue;
      const items = Sim.TOPICS[k].unlocks.filter((t) => CAT[t]), up = Sim.TOPICS[k].raises;
      if (up) { out.push({ sev: 'good', k: 'Research done', title: Sim.TOPICS[k].name, body: HOLDER[up] + ' now holds ' + S.R.research.topics[k].slots + ' cups.', dismiss: 'res:' + k }); continue; }
      out.push(items.length
        ? { sev: 'good', k: 'Research done', title: Sim.TOPICS[k].name, body: 'You can build ' + items.map((t) => CAT[t].name.toLowerCase()).join(' and ') + ' now.', btn: 'Build it', act: 'tray', arg: trayOf(items[items.length - 1]), dismiss: 'res:' + k }
        : { sev: 'good', k: 'Research done', title: Sim.TOPICS[k].name, body: 'Set up a standing order in Beans.', btn: 'Open Beans', act: 'tray', arg: 'beans', dismiss: 'res:' + k });
    }
    return out;
  }
  function researchTicket() {
    if (!revealed.has('research')) return null;
    const open = Sim.TKEYS.filter((k) => !S.research[k].complete);
    if (!open.length || open.some((k) => S.research[k].weight > 0)) return null;
    return { sev: 'info', k: 'Research', title: 'Nothing queued', body: 'Pick a topic to work on. It runs in the background.', btn: 'Open research', act: 'research' };
  }
  function refreshTickets() {
    const step = tutorialStep();
    const list = [].concat(step ? [step] : [], problemTickets(), milestoneTickets(), researchTicket() || [], !step ? goalTicket() || [] : []);
    const order = { step: 0, crit: 1, warn: 2, good: 3, info: 4, goal: 5 };
    list.sort((a, b) => order[a.sev] - order[b.sev]);
    const shown = list.slice(0, 4), more = list.length - shown.length;
    // keyed: a ticket keeps its element while it stays up, so only new ones drop in and the rest don't replay that
    // (moving an element restarts its animation, so stale ones go first and survivors stay put)
    const want = shown.map((t) => [t.k + '|' + t.title, 'ticket ' + t.sev, ticketHtml(t)]);
    if (more > 0) want.push(['more', 'ticket more', '+' + more + ' more']);
    const keys = new Set(want.map((w) => w[0])), keep = new Map();
    for (const li of [...ticketsEl.children]) { if (keys.has(li.dataset.key)) keep.set(li.dataset.key, li); else li.remove(); }
    want.forEach(([key, cls, html], i) => {
      let li = keep.get(key);
      if (!li) { li = document.createElement('li'); li.dataset.key = key; li.style.setProperty('--tilt', TILTS[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % TILTS.length]); }
      if (li.className !== cls) li.className = cls;
      if (li.html !== html) { li.html = html; li.innerHTML = html; }
      if (ticketsEl.children[i] !== li) ticketsEl.insertBefore(li, ticketsEl.children[i] || null);
    });
    railEl.hidden = !shown.length;
  }
  const TILTS = ['-1deg', '0.7deg', '-0.3deg', '0.4deg', '-0.6deg'];
  function ticketHtml(t) {
    return '<span class="k">' + t.k + '</span><h3>' + t.title + '</h3>' +
      (t.bar != null ? '<div class="tbar"><s style="width:' + Math.round(100 * Math.min(1, t.bar)) + '%"></s></div>' : '') +
      (t.body ? '<p>' + t.body + '</p>' : '') +
      (t.btn ? '<button type="button" data-tk="' + t.act + '"' + (t.arg != null ? ' data-arg="' + t.arg + '"' : '') + (t.dismiss ? ' data-dismiss="' + t.dismiss + '"' : '') + '>' + t.btn + '</button>' : '');
  }
  function focusItem(id) {
    const it = S.imap[id]; if (!it) return;
    const c = centreOf(it), d = new V3(c.x - controls.target.x, 0, c.z - controls.target.z);
    controls.target.add(d); cam.position.add(d);
    closeOverlays(); sel = { kind: 'item', id }; armed = null; refreshPanel(true);
  }
  function assignAll() {
    const ws = S.workers.filter((w) => !w.leaving);
    for (const it of unassigned()) {
      const w = ws.slice().sort((a, b) => a.builds.length - b.builds.length)[0];
      if (w) act('build', w.id, it.id);
    }
  }
  railEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tk]'); if (!b) return;
    const a = b.dataset.tk, arg = b.dataset.arg;
    if (b.dataset.dismiss) dismissed.add(b.dataset.dismiss);
    if (a === 'show') focusItem(+arg);
    else if (a === 'tray') setTray(arg);
    else if (a === 'assignAll') assignAll();
    else if (a === 'open') act('open');
    else if (a === 'order') act('order', +arg);
    else if (a === 'research') setResearch(true);
    refreshTickets();
  });

  // ---------- progressive disclosure: tools appear once they are useful, and stay ----------
  const revealed = new Set(), fresh = new Set(), freshItems = new Set(), seenDone = new Set();
  const toolsEl = document.getElementById('tools');
  function refreshReveal() {
    const rs = S.research;
    const now = {
      menu: PKEYS.some((p) => Sim.unlocked(S, p)),
      beans: S.st.beansUsed > 0 || S.st.beansBought > 0,
      staff: S.st.served >= 3 || S.workers.length > 1 || passStages().queue >= 3,
      research: S.st.served > 0 || Sim.TKEYS.some((k) => rs[k].started >= 0)
    };
    for (const k in now) if (now[k] && !revealed.has(k)) { revealed.add(k); if (S.t > 0) fresh.add(k); }
    for (const k of Sim.TKEYS) if (rs[k].complete && rs[k].finished > 0 && !seenDone.has(k)) { seenDone.add(k); Sim.TOPICS[k].unlocks.forEach((t) => { if (CAT[t]) freshItems.add(t); }); }
    toolsEl.querySelectorAll('[data-tray]').forEach((b) => {
      const t = b.dataset.tray, build = BUILD_TRAYS[t];
      if (!build) b.hidden = !revealed.has(t);
      const isNew = build ? build[1].some((x) => freshItems.has(x)) : fresh.has(t);
      const badge = b.querySelector('.badge');
      if (isNew && !badge) b.insertAdjacentHTML('beforeend', '<em class="badge">new</em>'); else if (!isNew && badge) badge.remove();
      b.setAttribute('aria-expanded', String(tray === t));
      b.classList.toggle('call', !!(tutorialStep() && tutorialStep().act === 'tray' && tutorialStep().arg === t && tray !== t));
    });
    resTool.hidden = !revealed.has('research');
  }

  // ---------- trays: Menu, Beans and Staff ----------
  const menuEl = document.getElementById('menu'), staffEl = document.getElementById('staff'), suppliesEl = document.getElementById('supplies');
  let suppliesKey = '';
  function beansInShop() { return S.items.reduce((n, i) => n + (i.built ? i.beans : 0), 0); }
  function refreshSupplies() {
    const sp = S.supply, sack = S.R.supply.sackDoses, cost = S.R.supply.sackCost, shop = beansInShop();
    const next = sp.orders[0], due = next ? Math.max(0, Math.ceil((next.due - S.t) / 60)) : 0;
    const stored = S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0), hasStore = S.items.some((i) => i.built && holdsSacks(i));
    const key = [sp.door, stored, shop, sp.onOrder, due, sp.auto.point, sp.auto.qty, S.cash >= cost, S.cash >= cost * 5, S.research.standing.complete].join('|');
    if (key === suppliesKey) return; suppliesKey = key;
    const total = shop + (sp.door + stored) * sack, on = sp.auto.qty > 0;
    suppliesEl.innerHTML =
      '<p class="sup-line' + (total <= sack ? ' low' : '') + '"><b>' + total + '</b> cups of beans · ' + sp.door + ' sack' + (sp.door === 1 ? '' : 's') + ' at the door · ' + (hasStore ? stored + ' in stock · ' : '') + shop + ' in hoppers' +
        (sp.onOrder ? ' · <span class="due">' + sp.onOrder + ' due in ' + due + ' min</span>' : '') + '</p>' +
      '<div class="row">' +
        '<button type="button" data-order="1"' + (S.cash < cost ? ' disabled' : '') + '>Order 1 sack · ' + money(cost) + '</button>' +
        '<button type="button" data-order="5"' + (S.cash < cost * 5 ? ' disabled' : '') + '>Order 5 · ' + money(cost * 5) + '</button>' +
        (Sim.needsResearch(S, 'auto') ? '<button type="button" id="autoBtn" disabled title="Research Standing orders first">Standing order · needs research</button>' :
        '<button type="button" id="autoBtn" aria-pressed="' + on + '" title="Order automatically when beans in the shop, at the door and on order fall below a level">Standing order</button>') +
        (on ? '<span class="stepper" aria-label="Sacks per order"><button type="button" data-auto="qty" data-d="-1" aria-label="Fewer sacks">−</button><b>' + sp.auto.qty + '</b> sacks<button type="button" data-auto="qty" data-d="1" aria-label="More sacks">+</button></span>' +
          '<span class="stepper" aria-label="Reorder level">below<button type="button" data-auto="point" data-d="-10" aria-label="Lower level">−</button><b>' + sp.auto.point + '</b><button type="button" data-auto="point" data-d="10" aria-label="Higher level">+</button>cups</span>' : '') +
      '</div>';
  }
  suppliesEl.addEventListener('click', (e) => {
    const o = e.target.closest('[data-order]');
    if (o) { act('order', +o.dataset.order); suppliesKey = ''; return; }
    const sp = S.supply;
    if (e.target.closest('#autoBtn')) { act('auto', sp.auto.point || 40, sp.auto.qty ? 0 : 4); suppliesKey = ''; return; }
    const st = e.target.closest('[data-auto]');
    if (st) {
      const d = +st.dataset.d;
      if (st.dataset.auto === 'qty') act('auto', sp.auto.point, Math.max(1, Math.min(20, sp.auto.qty + d)));
      else act('auto', Math.max(0, Math.min(400, sp.auto.point + d)), sp.auto.qty);
      suppliesKey = '';
    }
  });
  let dockKey = '';
  function refreshDock() {
    const key = [S.workers.map((w) => w.id + w.name + w.leaving).join(), S.items.filter((i) => i.built).map((i) => i.type).join(), JSON.stringify(S.menuOff), S.cash >= S.R.hireCost].join('|');
    if (key !== dockKey) {
      dockKey = key;
      menuEl.innerHTML = PKEYS.filter((p) => Sim.unlocked(S, p)).map((p) => {
        const P = PROD[p], on = !S.menuOff[p];
        return '<button type="button" class="menu-chip" data-menu="' + p + '" aria-pressed="' + on + '" title="' + (on ? 'On the menu. Click to stop offering it.' : 'Off the menu. Click to offer it.') + '"><b>' + P.name + '</b><span>' + money(P.price) + (on ? ' · offered' : ' · off') + '</span></button>';
      }).join('');
      staffEl.innerHTML = '<ul>' + S.workers.map((w) => '<li><button type="button" data-worker="' + w.id + '"><b>' + esc(w.name) + '</b><span>' + (w.leaving ? 'leaving' : money(S.R.wagePerMin * 60) + ' an hour') + '</span></button></li>').join('') + '</ul>' +
        '<div class="row"><button type="button" class="card" id="hireBtn"' + (S.cash < S.R.hireCost || S.workers.length >= S.R.maxWorkers ? ' disabled' : '') + '><b>Hire a worker</b><span>' + money(S.R.hireCost) + ' to hire, then ' + money(S.R.wagePerMin * 60) + ' an hour · ' + S.workers.length + ' of ' + S.R.maxWorkers + '</span></button></div>';
    }
    const cups = sumCups();
    document.getElementById('beansLabel').textContent = cups + ' cups';
    document.getElementById('staffLabel').textContent = S.workers.filter((w) => !w.leaving).length + ' of ' + S.R.maxWorkers;
    refreshResTool();
    refreshReveal();
    refreshBuild();
    refreshSupplies();
  }

  // ---------- build mode and trays ----------
  // Picking a tool opens its tray above the icon row. A build tray shows what can be bought; picking an item turns the
  // cursor into a ghost; after placing, the tray comes back. Esc steps back one level. Right-click opens a menu for whatever is under the cursor.
  const trayEl = document.getElementById('tray'), trayBuild = document.getElementById('trayBuild');
  const buildStatus = document.getElementById('buildStatus'), ctxEl = document.getElementById('ctx');
  const BUILD_TRAYS = { counters: ['Counters', ['till', 'pickup']], machines: ['Machines', ['brewer', 'grinder', 'espresso', 'pastry']], storage: ['Storage', ['stock', 'store']] };
  const SHORT = { till: 'Till', pickup: 'Pickup', brewer: 'Brewer', grinder: 'Grinder', espresso: 'Espresso', pastry: 'Cake case', stock: 'Stock area', store: 'Cupboard' };
  const trayOf = (type) => Object.keys(BUILD_TRAYS).find((k) => BUILD_TRAYS[k][1].includes(type));
  let buildMode = false, buildKey = '', tray = null, lastBuildTray = 'counters', tileFocus = null;
  const makesText = (t) => {
    const ps = PKEYS.filter((p) => PROD[p].machine === t || (t === 'grinder' && PROD[p].grinds));
    if (t === 'till') return 'Where customers order and pay';
    if (t === 'pickup') return 'Where finished drinks wait';
    if (t === 'stock' || t === 'store') return 'Holds ' + S.R.items[t].sacks + ' sacks of beans close to the machines';
    return ps.length ? (t === 'grinder' ? 'Needed for ' : 'Unlocks ') + ps.map((p) => PROD[p].name.toLowerCase()).join(', ') : '';
  };
  function setTray(t) {
    if (t && t === tray && !placing) t = null;
    if (t) closeOverlays('tray');
    tray = t || null; placing = null; ghost.visible = false; tileFocus = null;
    buildMode = !!(tray && BUILD_TRAYS[tray]);
    if (buildMode) { lastBuildTray = tray; sel = null; armed = null; refreshPanel(true); BUILD_TRAYS[tray][1].forEach((x) => freshItems.delete(x)); }
    if (tray) fresh.delete(tray);
    buildKey = ''; refreshBuild(true); refreshReveal();
  }
  function setBuildMode(on) { setTray(on ? lastBuildTray : null); }
  function tileHtml(t) {
    const c = CAT[t], short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
    if (locked) {
      const r = S.research[locked], rr = researchRates(), eta = rr.per[locked] ? Math.ceil((S.R.research.topics[locked].work - r.done) / rr.per[locked]) : null;
      return '<button type="button" class="tile soon" data-tile="' + t + '" disabled aria-label="' + esc(c.name) + ', coming when ' + esc(Sim.TOPICS[locked].name) + ' is researched"><img alt="" src="' + (ICONS[t] || '') + '"><b>' + SHORT[t] + '</b><span class="price">' + (eta != null ? 'In ' + eta + ' min' : 'Paused') + '</span></button>';
    }
    return '<button type="button" class="tile' + (short > 0 ? ' short' : '') + '" data-place="' + t + '" data-tile="' + t + '"' + (short > 0 ? ' disabled' : '') + ' aria-label="' + esc(c.name + ', ' + price(c)) + '">' +
      (freshItems.has(t) ? '<em class="badge">new</em>' : '') + '<img alt="" src="' + (ICONS[t] || '') + '"><b>' + SHORT[t] + '</b><span class="price">' + price(c) + '</span></button>';
  }
  function detailHtml(t) {
    const c = CAT[t], have = S.items.filter((i) => i.type === t).length, short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
    return '<h3>' + esc(c.name) + '</h3><p>' + esc(makesText(t)) + '. ' + esc(c.blurb) + '</p><dl>' +
      '<dt>Price</dt><dd>' + price(c) + '</dd><dt>Build time</dt><dd>' + (c.mins ? c.mins + ' min' : 'ready at once') + '</dd><dt>Size</dt><dd>' + c.w + '×' + c.d + '</dd><dt>You have</dt><dd>' + have + '</dd></dl>' +
      (locked ? '<p class="why">Comes with ' + esc(Sim.TOPICS[locked].name) + ' research.</p>' : short > 0 ? '<p class="why">Need ' + money(short) + ' more.</p>' : '<p class="key">Click to place · R rotates · Shift-click for several</p>');
  }
  function refreshBuild(force) {
    buildMode = !!((tray && BUILD_TRAYS[tray]) || placing);
    stage.classList.toggle('building', buildMode);
    const showTray = !!tray && !placing;
    trayEl.hidden = !showTray; stage.classList.toggle('menu-open', showTray);
    gridLines.visible = buildMode;
    buildStatus.hidden = !placing;
    buildStatus.innerHTML = placing
      ? 'Placing <b>' + esc(CAT[placing.type].name) + '</b> · click the floor · R rotates · Shift-click to place several · Esc to choose again'
      : '';
    if (!showTray) { buildKey = ''; return; }
    const build = BUILD_TRAYS[tray];
    trayBuild.hidden = !build; menuEl.hidden = tray !== 'menu'; suppliesEl.hidden = tray !== 'beans'; staffEl.hidden = tray !== 'staff';
    document.getElementById('trayTitle').textContent = build ? build[0] : { menu: 'Menu', beans: 'Beans', staff: 'Staff' }[tray];
    document.getElementById('trayNote').textContent = build ? money(S.cash) + ' to spend · Esc to close' : tray === 'menu' ? 'Click a drink to take it off or put it back' : tray === 'staff' ? 'Pick someone to see what they do' : 'Workers carry sacks from the door to the hoppers';
    if (!build) return;
    const types = build[1].filter((t) => { const l = Sim.needsResearch(S, t); return !l || S.research[l].weight > 0 || S.research[l].done > 0; });
    const key = tray + '|' + types.map((t) => (S.cash >= CAT[t].cost ? 1 : 0) + (Sim.needsResearch(S, t) ? 'l' + Math.floor(S.research[Sim.needsResearch(S, t)].done / 10) : '') + (freshItems.has(t) ? 'n' : '')).join() + '|' + (tileFocus || '') + '|' + S.items.length;
    if (key === buildKey && !force) return; buildKey = key;
    const focus = tileFocus && types.includes(tileFocus) ? tileFocus : types[0];
    trayBuild.innerHTML = '<div class="tiles">' + types.map(tileHtml).join('') + '</div><div class="tile-detail" aria-live="polite">' + (focus ? detailHtml(focus) : '') + '</div>';
  }
  toolsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tray]'); if (!b) return;
    closeCtx(); setTray(b.dataset.tray);
  });
  trayBuild.addEventListener('click', (e) => {
    const b = e.target.closest('[data-place]'); if (!b || b.disabled) return;
    placing = { type: b.dataset.place, r: 0 }; refreshBuild();
  });
  const tileOver = (e) => { const b = e.target.closest('[data-tile]'); if (b && b.dataset.tile !== tileFocus) { tileFocus = b.dataset.tile; refreshBuild(); } };
  trayBuild.addEventListener('pointerover', tileOver);
  trayBuild.addEventListener('focusin', tileOver);
  staffEl.addEventListener('click', (e) => {
    const w = e.target.closest('[data-worker]'); if (w) { setTray(null); sel = { kind: 'worker', id: +w.dataset.worker }; refreshPanel(true); }
  });

  // grid overlay for build mode
  const gridLines = (() => {
    const pts = [];
    for (let x = 0; x <= Sim.GW; x++) pts.push(x, 0.015, 0, x, 0.015, Sim.IN);
    for (let z = 0; z <= Sim.IN; z++) pts.push(0, 0.015, z, Sim.GW, 0.015, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0.55, depthWrite: false }));
    l.visible = false; scene.add(l); return l;
  })();
  // staff and customer squares of everything already placed, shown in build mode
  const access = new THREE.Group(); scene.add(access);
  const accStaffM = B(0x7fb3e0, { transparent: true, opacity: 0.35, depthWrite: false }), accCustM = B(0xe0a458, { transparent: true, opacity: 0.35, depthWrite: false });
  const accGeo = new THREE.BoxGeometry(0.6, 0.02, 0.6);
  let accessKey = '';
  function updateAccess() {
    access.visible = buildMode;
    if (!buildMode) return;
    const key = S.items.map((i) => i.id).join();
    if (key === accessKey) return; accessKey = key;
    while (access.children.length) access.remove(access.children[0]);
    S.items.forEach((it) => [[it.wc, accStaffM], [it.cc, accCustM]].forEach(([c, m]) => {
      if (!c) return; const o = new THREE.Mesh(accGeo, m); o.position.set(c.x + 0.5, 0.02, c.z + 0.5); access.add(o);
    }));
  }

  // ---------- context menus ----------
  let ctxFor = null, ctxArmed = 0;
  function closeCtx() { ctxEl.hidden = true; ctxFor = null; ctxArmed = 0; }
  function showCtx(html, e) {
    ctxEl.innerHTML = html; ctxEl.hidden = false;
    const r = stage.getBoundingClientRect();
    const x = Math.min(e.clientX - r.left, r.width - ctxEl.offsetWidth - 8), y = Math.min(e.clientY - r.top, r.height - ctxEl.offsetHeight - 8);
    ctxEl.style.left = Math.max(8, x) + 'px'; ctxEl.style.top = Math.max(8, y) + 'px';
    const first = ctxEl.querySelector('button:not(:disabled)'); if (first) first.focus({ preventScroll: true });
    tip.hidden = true;
  }
  function itemCtxHtml(it) {
    const c = CAT[it.type], why = Sim.whyNotRemove(S, it), refund = it.built ? c.cost / 2 : c.cost;
    let h = '<h4>' + esc(Sim.label(S, it)) + (it.built ? '' : ' · crate ' + Math.floor(100 * it.work / it.total) + '%') + '</h4>';
    const ws = S.workers.filter((w) => !w.leaving);
    if (!it.built) {
      h += ws.map((w) => '<button type="button" role="menuitemcheckbox" data-c="build" data-w="' + w.id + '" aria-checked="' + w.builds.includes(it.id) + '">Build with ' + esc(w.name) + '<span>' + (w.builds.includes(it.id) ? 'assigned' : w.builds.length ? w.builds.length + ' queued' : 'free') + '</span></button>').join('');
    } else {
      h += ws.map((w) => { const on = w.all || w.patch.includes(it.id); return '<button type="button" role="menuitemcheckbox" data-c="patch" data-w="' + w.id + '" aria-checked="' + (!w.all && on) + '">' + (w.all ? 'Only ' : 'Staff with ') + esc(w.name) + '<span>' + (w.all ? 'covers all' : on ? 'works here' : '') + '</span></button>'; }).join('');
    }
    h += '<hr><button type="button" role="menuitem" data-c="details">Details<span></span></button>';
    h += '<button type="button" role="menuitem" class="danger" data-c="remove"' + (why ? ' disabled title="' + esc(why) + '"' : '') + (ctxArmed ? ' data-armed' : '') + '>' +
      (ctxArmed ? 'Click again to confirm' : !c.cost ? 'Clear' : it.built ? 'Sell' : 'Cancel order') + '<span>' + (why ? esc(why) : refund ? '+' + money(refund) : '') + '</span></button>';
    return h;
  }
  function openItemCtx(id, e) {
    const it = S.imap[id]; if (!it) return;
    ctxFor = { kind: 'item', id, e }; ctxArmed = 0; showCtx(itemCtxHtml(it), e);
  }
  // Fit an item so the clicked square is inside it, trying each rotation in turn.
  function fitAt(type, cell) {
    let reason = null;
    for (let r = 0; r < 4; r++) {
      const [w, d] = Sim.dimsOf(type, r);
      for (let oz = 0; oz < d; oz++) for (let ox = 0; ox < w; ox++) {
        const why = Sim.canPlace(S, type, cell.x - ox, cell.z - oz, r);
        if (!why) return { r };
        if (!reason) reason = why;
      }
    }
    return { reason };
  }
  function openFloorCtx(cell, e) {
    ctxFor = { kind: 'floor', cell, e };
    let h = '<h4>Build here</h4>';
    BUILD_GROUPS.forEach(([, ts]) => ts.forEach((t) => {
      const c = CAT[t], f = fitAt(t, cell), short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
      const why = locked ? 'needs research' : short > 0 ? 'need ' + money(short) : f.reason ? (f.reason === 'That space is taken' ? 'no room' : f.reason.toLowerCase()) : null;
      h += '<button type="button" role="menuitem" data-c="place" data-t="' + t + '" data-r="' + (f.r || 0) + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') + '>' + c.name + '<span>' + (why ? esc(why) : price(c)) + '</span></button>';
    }));
    h += '<hr><button type="button" role="menuitem" data-c="mode">' + (buildMode ? 'Leave build mode' : 'Open build menu') + '<span>B</span></button>';
    showCtx(h, e);
  }
  function contextClick(e) {
    closeCtx();
    if (placing) { placing = null; ghost.visible = false; refreshBuild(); return; }
    const p = pickObject();
    if (p && p.kind === 'item') { openItemCtx(p.id, e); return; }
    if (p && p.kind === 'worker') { if (buildMode) setBuildMode(false); sel = p; refreshPanel(true); return; }
    const c = pickCell();
    if (c && c.x >= 0 && c.x < Sim.GW && c.z >= 0 && c.z < Sim.IN) openFloorCtx(c, e);
  }
  ctxEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]'); if (!b || b.disabled || !ctxFor) return;
    const c = b.dataset.c;
    if (c === 'place') { closeCtx(); if (!buildMode) setTray(trayOf(b.dataset.t)); placing = { type: b.dataset.t, r: +b.dataset.r }; refreshBuild(); return; }
    if (c === 'mode') { closeCtx(); setBuildMode(!buildMode); return; }
    const it = S.imap[ctxFor.id]; if (!it) { closeCtx(); return; }
    if (c === 'details') { closeCtx(); if (buildMode) setBuildMode(false); sel = { kind: 'item', id: it.id }; refreshPanel(true); return; }
    if (c === 'remove') {
      if (!ctxArmed) { ctxArmed = 1; showCtx(itemCtxHtml(it), ctxFor.e); return; }
      closeCtx(); if (!act('remove', it.id) && sel && sel.id === it.id) sel = null; refreshPanel(true); return;
    }
    const w = S.wmap[+b.dataset.w]; if (!w) return;
    if (c === 'build') { if (!act('build', w.id, it.id)) note(w.builds.includes(it.id) ? w.name + ' will build ' + Sim.label(S, it) : w.name + ' won’t build ' + Sim.label(S, it) + ' after all', 'info'); }
    if (c === 'patch') { if (!act('patch', w.id, it.id)) note(patchText(w), 'info'); }
    ctxArmed = 0; showCtx(itemCtxHtml(it), ctxFor.e);
  });
  ctxEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...ctxEl.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement);
    const n = bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; if (n) n.focus();
  });
  menuEl.addEventListener('click', (e) => { const b = e.target.closest('[data-menu]'); if (b) act('menu', b.dataset.menu); });
  staffEl.addEventListener('click', (e) => { if (e.target.closest('#hireBtn')) { if (!act('hire')) { const w = S.workers[S.workers.length - 1]; sel = { kind: 'worker', id: w.id }; refreshPanel(true); } } });
  document.getElementById('openBtn').addEventListener('click', () => act('open'));
  document.getElementById('speed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
  document.getElementById('pixelBtn').addEventListener('click', (e) => {
    pixel = !pixel; e.currentTarget.setAttribute('aria-checked', String(pixel)); stage.classList.toggle('pixel', pixel); resize();
  });
  // ---------- the ⋯ menu: tools and settings most players rarely need ----------
  const moreBtn = document.getElementById('moreBtn'), moreMenu = document.getElementById('moreMenu');
  function setMore(on) {
    moreMenu.hidden = !on; moreBtn.setAttribute('aria-expanded', String(on));
    if (on) moreMenu.querySelector('button').focus({ preventScroll: true });
  }
  moreBtn.addEventListener('click', () => setMore(moreMenu.hidden));
  moreMenu.addEventListener('click', (e) => { if (e.target.closest('button')) setMore(false); });
  moreMenu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...moreMenu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
  });
  document.addEventListener('pointerdown', (e) => { if (!moreMenu.hidden && !e.target.closest('.more')) setMore(false); }, true);
  const hintEl = document.getElementById('hint'), hintBtn = document.getElementById('hintBtn');
  function setHint(on) { hintEl.hidden = !on; hintBtn.setAttribute('aria-checked', String(on)); }
  hintBtn.addEventListener('click', () => setHint(hintEl.hidden));

  // ---------- splash ----------
  const splash = document.getElementById('splash');
  let splashSpeed = 1, started = false;
  function showSplash() {
    splashSpeed = speed || lastRunSpeed; setSpeed(0); setMore(false);
    document.getElementById('splashResume').hidden = !started;
    splash.hidden = false; document.getElementById(started ? 'splashResume' : 'splashNew').focus({ preventScroll: true });
  }
  function hideSplash(run) { splash.hidden = true; started = true; setSpeed(run); }
  document.getElementById('splashNew').addEventListener('click', () => {
    if (started) { newGame(SEED); resetView(); }
    hideSplash(1); setHint(true); setTimeout(() => setHint(false), 20000);
  });
  document.getElementById('splashResume').addEventListener('click', () => hideSplash(splashSpeed));
  document.getElementById('splashReplay').addEventListener('click', () => { hideSplash(0); openModal(); document.getElementById('codeIn').focus(); });
  document.getElementById('titleBtn').addEventListener('click', showSplash);

  // ---------- selection panel ----------
  const panel = document.getElementById('panel');
  let panelHtml = '';
  const meterOf = (n, cap, hot) => '<span class="meter' + (hot ? ' hot' : '') + '"><s style="width:' + Math.round(100 * n / Math.max(1, cap)) + '%"></s></span>';
  const meter = (u) => '<span class="meter' + (u > 0.85 ? ' hot' : '') + '"><s style="width:' + Math.round(u * 100) + '%"></s></span>' + Math.round(u * 100) + '%';
  const slotsHtml = (n, cap) => '<span class="slots' + (n >= cap ? ' full' : '') + '">' + Array.from({ length: cap }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span> ' + n + '/' + cap;
  function isArmed(a, id) { return armed && armed.act === a && armed.id === id && performance.now() < armed.until; }
  function workerPanel(w) {
    const built = S.items.filter((i) => i.built);
    const chips = ['<button type="button" data-act="all" data-w="' + w.id + '" aria-pressed="' + w.all + '">All stations</button>']
      .concat(built.map((i) => '<button type="button" data-act="patch" data-w="' + w.id + '" data-i="' + i.id + '" aria-pressed="' + (!w.all && w.patch.includes(i.id)) + '">' + esc(Sim.label(S, i)) + '</button>'));
    const crates = S.items.filter((i) => !i.built);
    const builds = w.builds.map((id) => S.imap[id]).filter(Boolean);
    return '<h2>' + esc(w.name) + '<small>worker · ' + money(S.R.wagePerMin * 60) + '/h</small></h2>' +
      '<p class="status">' + esc(w.leaving ? 'Finishing up, then leaving' : w.status) + '</p>' +
      '<dl class="kv"><dt>Busy (last half hour)</dt><dd>' + meter(w.util) + '</dd></dl>' +
      '<div class="sec"><h3>Works at</h3>' + (built.length ? '<div class="chips">' + chips.join('') + '</div><p class="help">Or click stations in the shop. ' + esc(w.name) + ' finishes drinks before taking new orders.</p>' : '<p class="help">Nothing built yet.</p>') + '</div>' +
      '<div class="sec"><h3>Build list</h3>' + (builds.length
        ? '<ol class="builds">' + builds.map((i) => '<li>' + esc(Sim.label(S, i)) + ' · ' + Math.floor(100 * i.work / i.total) + '%<button type="button" data-act="build" data-w="' + w.id + '" data-i="' + i.id + '" aria-label="Remove from build list">×</button></li>').join('') + '</ol><p class="help">Building comes first. ' + esc(w.name) + ' goes back to their stations when the list is done.</p>'
        : (crates.length ? '<div class="chips">' + crates.map((i) => '<button type="button" data-act="build" data-w="' + w.id + '" data-i="' + i.id + '">Build ' + esc(Sim.label(S, i)) + '</button>').join('') + '</div>' : '<p class="help">No crates waiting.</p>')) + '</div>' +
      (S.workers.length > 1 && !w.leaving ? '<div class="row"><button type="button" class="danger" data-act="fire" data-w="' + w.id + '"' + (isArmed('fire', w.id) ? ' data-armed' : '') + '>' + (isArmed('fire', w.id) ? 'Click again to let ' + esc(w.name) + ' go' : 'Let ' + esc(w.name) + ' go') + '</button></div>' : '');
  }
  function itemPanel(it) {
    const c = CAT[it.type], name = Sim.label(S, it);
    const crew = S.workers.filter((w) => it.built ? (w.all || w.patch.includes(it.id)) : w.builds.includes(it.id));
    const why = Sim.whyNotRemove(S, it), refund = it.built ? c.cost / 2 : c.cost;
    const removeBtn = '<div class="row"><button type="button" class="danger" data-act="remove" data-i="' + it.id + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') + (isArmed('remove', it.id) ? ' data-armed' : '') + '>' +
      (isArmed('remove', it.id) ? 'Click again to confirm' : !c.cost ? 'Clear ' + name.toLowerCase() : (it.built ? 'Sell for ' : 'Cancel order, refund ') + money(refund)) + '</button>' + (why ? '<span class="help">' + esc(why) + '</span>' : '') + '</div>';
    if (!it.built) {
      const pct = Math.floor(100 * it.work / it.total), left = Math.ceil((it.total - it.work) / 60);
      return '<h2>' + esc(name) + '<small>crate</small></h2><p>' + esc(c.blurb) + '</p>' +
        '<div class="progress"><s style="width:' + pct + '%"></s></div>' +
        '<dl class="kv"><dt>Built</dt><dd>' + pct + '%</dd><dt>Work left</dt><dd>' + left + ' worker-min</dd><dt>Builders</dt><dd>' + (crew.length ? esc(crew.map((w) => w.name).join(', ')) : 'nobody yet') + '</dd></dl>' +
        '<div class="sec"><h3>Assign a builder</h3><div class="chips">' + S.workers.filter((w) => !w.leaving).map((w) => '<button type="button" data-act="build" data-w="' + w.id + '" data-i="' + it.id + '" aria-pressed="' + w.builds.includes(it.id) + '">' + esc(w.name) + '</button>').join('') + '</div><p class="help">Two builders halve the time, but they stop serving while they build.</p></div>' + removeBtn;
    }
    const rows = ['<dt>Busy (last half hour)</dt><dd>' + meter(it.util) + '</dd>'];
    if (it.type === 'till') rows.push('<dt>Queue</dt><dd>' + it.queue.length + ' waiting</dd>', '<dt>Order rail</dt><dd>' + slotsHtml(it.buf.length, it.cap) + '</dd>');
    if (it.type === 'pickup') rows.push('<dt>Ready drinks</dt><dd>' + slotsHtml(it.buf.length, it.cap) + '</dd>');
    const hc = S.R.items[it.type].hopper || 0, kc = S.R.items[it.type].knock || 0, sc = S.R.items[it.type].sacks || 0;
    if (sc) rows.push('<dt>Sacks on the shelves</dt><dd>' + meterOf(it.sacks, sc, false) + it.sacks + '/' + sc + '</dd>', '<dt>At the door</dt><dd>' + S.supply.door + ' sack' + (S.supply.door === 1 ? '' : 's') + '</dd>');
    if (hc) rows.push('<dt>Beans in hopper</dt><dd>' + meterOf(it.beans, hc, it.beans <= hc / 4) + it.beans + '/' + hc + ' cups</dd>');
    if (kc) rows.push('<dt>Grounds bin</dt><dd>' + meterOf(it.grounds, kc, it.grounds >= kc * 0.8) + it.grounds + '/' + kc + '</dd>');
    if (it.chore != null && S.wmap[it.chore]) rows.push('<dt>Chore</dt><dd>' + esc(S.wmap[it.chore].name) + ' is on it</dd>');
    const makes = PKEYS.filter((p) => PROD[p].machine === it.type);
    if (makes.length) rows.push('<dt>Makes</dt><dd>' + makes.map((p) => PROD[p].name).join(', ') + '</dd>');
    rows.push('<dt>Staffed by</dt><dd>' + (crew.length ? esc(crew.map((w) => w.name).join(', ')) : 'nobody') + '</dd>');
    return '<h2>' + esc(name) + '<small>' + c.w + '×' + c.d + '</small></h2><p>' + esc(c.blurb) + '</p><dl class="kv">' + rows.join('') + '</dl>' +
      (crew.length ? '' : '<p class="help">Select a worker, then click this station to staff it.</p>') + removeBtn;
  }
  function refreshPanel(force) {
    let html = '';
    if (sel && sel.kind === 'worker' && S.wmap[sel.id]) html = workerPanel(S.wmap[sel.id]);
    else if (sel && sel.kind === 'item' && S.imap[sel.id]) html = itemPanel(S.imap[sel.id]);
    else if (sel) sel = null;
    if (html === panelHtml && !force) return;
    if (html === panelHtml) return;
    panelHtml = html; panel.innerHTML = html; panel.hidden = !html;
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const a = b.dataset.act, w = +b.dataset.w, i = +b.dataset.i;
    if (a === 'all') { if (!act('all', w)) note(patchText(S.wmap[w]), 'info'); }
    else if (a === 'patch') { if (!act('patch', w, i)) note(patchText(S.wmap[w]), 'info'); }
    else if (a === 'build') act('build', w, i);
    else if (a === 'fire' || a === 'remove') {
      const id = a === 'fire' ? w : i;
      if (isArmed(a, id)) { armed = null; if (a === 'fire') act('fire', w); else { if (!act('remove', i)) sel = null; } }
      else armed = { act: a, id, until: performance.now() + 4000 };
    }
    refreshPanel(true);
  });

  // ---------- labels ----------
  const tmp = new V3();
  function project(el, x, y, z) {
    tmp.set(x, y, z).project(cam);
    el.style.left = ((tmp.x + 1) / 2 * stage.clientWidth).toFixed(1) + 'px';
    el.style.top = ((1 - tmp.y) / 2 * stage.clientHeight).toFixed(1) + 'px';
  }
  function updateLabels() {
    workerViews.forEach((v) => project(v.tag, v.root.position.x, 1.72, v.root.position.z));
    const sw = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
    itemViews.forEach((v, id) => {
      if (!v.tag) return;
      const it = S.imap[id]; if (!it) return;
      const pct = Math.floor(100 * it.work / it.total);
      const crew = S.workers.filter((w) => w.task && w.task.kind === 'build' && w.builds[0] === it.id && w.anim === 'build').length;
      const queued = S.workers.filter((w) => w.builds.includes(it.id)).length;
      const order = sw ? sw.builds.indexOf(it.id) : -1;
      const key = pct + '|' + crew + '|' + queued + '|' + order;
      if (key !== v.tagKey) {
        v.tagKey = key;
        v.tag.classList.toggle('mine', order >= 0);
        v.tag.innerHTML = '<b>' + (order >= 0 ? '#' + (order + 1) + ' ' : '') + esc(Sim.label(S, it)) + '</b><i><s style="width:' + pct + '%"></s></i><small>' +
          (crew ? crew + ' building' : queued ? 'builder on the way' : 'needs a builder') + '</small>';
      }
      const c = centreOf(it); project(v.tag, c.x, 1.25, c.z);
    });
    itemViews.forEach((v, id) => {
      if (!v.gauge) return;
      const it = S.imap[id]; if (!it) return;
      const hc = S.R.items[it.type].hopper || 0, kc = S.R.items[it.type].knock || 0, sc = S.R.items[it.type].sacks || 0;
      const urgent = (hc && it.beans <= 0) || (kc && it.grounds >= kc);
      const look = urgent || (hc && it.beans <= hc / 4) || (kc && it.grounds >= kc * 0.6) || buildMode ||
        (sel && sel.kind === 'item' && sel.id === id) || (hover && hover.kind === 'item' && hover.id === id);
      v.gauge.hidden = !look; v.gauge.classList.toggle('alert', !!urgent);
      if (!look) return;
      const key = it.beans + '|' + it.grounds + '|' + it.sacks + '|' + (it.chore != null);
      if (key !== v.gaugeKey) {
        v.gaugeKey = key;
        let h = '';
        if (sc) h += '<span class="g' + (it.sacks <= 0 ? ' low' : '') + '" title="Sacks on the shelves"><b>S</b><i><s style="width:' + Math.round(100 * it.sacks / sc) + '%"></s></i></span><em class="n">' + it.sacks + '/' + sc + ' sacks</em>';
        if (hc) h += '<span class="g' + (it.beans <= 0 ? ' warn' : it.beans <= hc / 4 ? ' low' : '') + '" title="Beans in the hopper"><b>B</b><i><s style="width:' + Math.round(100 * it.beans / hc) + '%"></s></i></span>';
        if (kc) h += '<span class="g grounds' + (it.grounds >= kc ? ' warn' : '') + '" title="Grounds in the knock box"><b>G</b><i><s style="width:' + Math.round(100 * it.grounds / kc) + '%"></s></i></span>';
        if (hc && it.beans <= 0) h += '<em>out of beans</em>'; else if (kc && it.grounds >= kc) h += '<em>bin full</em>';
        v.gauge.innerHTML = h;
      }
      const c = centreOf(it); project(v.gauge, c.x, 2.05, c.z);
    });
  }

  // ---------- replay modal ----------
  const modal = document.getElementById('modal');
  function openModal() {
    document.getElementById('codeOut').value = Sim.encode(S);
    document.getElementById('codeErr').textContent = ''; document.getElementById('copyMsg').textContent = '';
    modal.hidden = false; setSpeed(0); document.getElementById('copyCode').focus();
  }
  function closeModal() { modal.hidden = true; }
  document.getElementById('replayBtn').addEventListener('click', openModal);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('copyCode').addEventListener('click', () => {
    const ta = document.getElementById('codeOut'), msg = document.getElementById('copyMsg');
    const fallback = () => { ta.focus(); ta.select(); msg.textContent = 'Selected. Press Ctrl+C or Cmd+C to copy.'; };
    try { navigator.clipboard.writeText(ta.value).then(() => { msg.textContent = 'Copied.'; }, fallback); } catch (err) { fallback(); }
  });
  document.getElementById('watchBtn').addEventListener('click', () => {
    const raw = document.getElementById('codeIn').value || document.getElementById('codeOut').value;
    try {
      const d = Sim.decode(raw);
      watchCode = raw; newGame(d.seed, d.log, d.rules); closeModal(); resetView();
      if (!d.current) note('This code was made with an older version of the game, so it may play out differently.', 'bad');
      if (d.log.length) { setSpeed(5); note('Watching a replay. Act at any point to take over.', 'warn'); }
      else {
        setSpeed(1); sel = { kind: 'worker', id: S.workers[0].id }; refreshPanel(true);
        note(Object.keys(d.rules).length ? 'Scenario loaded with ' + Object.keys(d.rules).length + ' custom rules. Hover the subtitle to see them. Your move.' : 'New game on seed ' + d.seed + '. Your move.', 'warn');
      }
    } catch (err) { document.getElementById('codeErr').textContent = err.message; }
  });
  let restartArmed = 0;
  document.getElementById('restartBtn').addEventListener('click', (e) => {
    if (performance.now() < restartArmed) { restartArmed = 0; e.currentTarget.textContent = 'Start a new game'; newGame(SEED); closeModal(); setSpeed(1); resetView(); return; }
    restartArmed = performance.now() + 4000; e.currentTarget.textContent = 'Click again to restart';
    setTimeout(() => { if (restartArmed && performance.now() >= restartArmed) document.getElementById('restartBtn').textContent = 'Start a new game'; }, 4100);
  });
  const replaybar = document.getElementById('replaybar');
  function refreshReplayBar() {
    const on = watching && S.pending.length > 0;
    if (watching && !S.pending.length) { watching = false; note('The replay has caught up. You are in control now.', 'warn'); }
    replaybar.hidden = !on;
    if (on) {
      const html = '<span>Watching a replay · ' + S.pending.length + ' decision' + (S.pending.length === 1 ? '' : 's') + ' to come</span><button type="button" id="takeOver">Take over</button>';
      if (replaybar.innerHTML !== html) replaybar.innerHTML = html;
    }
  }
  replaybar.addEventListener('click', (e) => { if (e.target.closest('#takeOver')) { S.pending = []; watching = false; note('You took over the replay.', 'warn'); refreshReplayBar(); } });

  // =====================================================================
  // Flow: two charts. Who did what (an activity Gantt per worker), and the value chain (stock at every stage,
  // or the same thing as a cumulative flow diagram), with beans and research as extra lanes.
  // =====================================================================
  const flowEl = document.getElementById('flow'), flowBtn = document.getElementById('flowBtn');
  const ACT_COLS = { till: '#3987e5', make: '#d95926', build: '#199e70', chore: '#c98500' };
  const ACT_NAMES = { till: 'Till', make: 'Making', build: 'Building', chore: 'Chores' };
  const ORDER_STAGES = [['queue', 'Queuing to order', '#3987e5'], ['rail', 'On the rail', '#d95926'], ['making', 'Being made', '#199e70'], ['ready', 'Ready at pickup', '#c98500']];
  const CUM_CURVES = [['cArrived', 'Arrived'], ['cOrdered', 'Ordered'], ['cClaimed', 'Started'], ['cMade', 'Made'], ['cDone', 'Done']];
  const BEAN_STAGES = [['hoppers', 'In hoppers', '#199e70'], ['store', 'In stock', '#3987e5'], ['door', 'At the door', '#c98500']];
  const BEAN_LINES = [['onOrder', 'On order', '#d95926', true], ['grounds', 'Grounds in bins', '#d55181', false]];
  const RES_STAGES = [['rDone', 'Complete', '#199e70'], ['rActive', 'In progress', '#d95926'], ['rAvailable', 'Not started', '#3987e5']];
  let flowRange = 120, flowMode = 'stock', flowKey = '';
  function closeOverlays(except) {
    if (except !== 'flow' && !flowEl.hidden) setFlow(false);
    if (except !== 'research' && !resEl.hidden) setResearch(false);
    if (except !== 'tray' && (tray || placing)) setTray(null);
  }
  function setFlow(on) {
    if (on) closeOverlays('flow');
    flowEl.hidden = !on; flowBtn.setAttribute('aria-checked', String(on)); stage.classList.toggle('flow-open', on || !resEl.hidden);
    if (on) { flowKey = ''; refreshFlow(); }
  }
  flowBtn.addEventListener('click', () => setFlow(flowEl.hidden));
  flowEl.addEventListener('click', (e) => {
    if (e.target.closest('#flowClose')) { setFlow(false); return; }
    const r = e.target.closest('[data-range]'); if (r) { flowRange = +r.dataset.range; flowKey = ''; refreshFlow(); return; }
    const m = e.target.closest('[data-mode]'); if (m) { flowMode = m.dataset.mode; flowKey = ''; refreshFlow(); }
  });
  function fmtClock(t) { const m = Math.floor(t / 60); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }
  function niceMax(v) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function flowData() {
    const H = S.hist, n = H.t.length, from = flowRange ? Math.max(0, n - flowRange) : 0, pick = (k) => H[k].slice(from).map((v) => v || 0);
    const d = { t: H.t.slice(from) };
    ['queue', 'rail', 'making', 'ready', 'onOrder', 'grounds', 'served', 'used', 'door', 'store', 'cArrived', 'cOrdered', 'cClaimed', 'cMade', 'cDone', 'rAvailable', 'rActive', 'rDone'].forEach((k) => { d[k] = pick(k); });
    d.hoppers = pick('beans');
    d.onhand = d.hoppers.map((v, i) => v + d.door[i] + d.store[i]);
    return d;
  }
  // geometry shared by every lane so they line up under the Gantt
  const GW_ = 600, ML = 92, MR = 12;
  const xOf = (i, n) => ML + (GW_ - ML - MR) * i / Math.max(1, n - 1);

  // ---------- lane chart: stacked stock, a cumulative flow diagram, or lines ----------
  function lane(el, d, o) {
    const n = d.t.length, Hh = o.height || 120, top = 6, bot = o.axis ? 18 : 6;
    if (n < 2) { el.innerHTML = '<h3>' + o.title + '</h3><p class="flow-empty">Fills in as the shop trades, one point per game minute.</p>'; return; }
    const x = (i) => xOf(i, n);
    let sums, ymax, base0 = 0;
    if (o.cumulative) {
      base0 = d[o.curves[o.curves.length - 1][0]][0];
      ymax = niceMax(Math.max(1, d[o.curves[0][0]][n - 1] - base0));
    } else {
      sums = d.t.map((_, i) => o.stages.reduce((a, [k]) => a + d[k][i], 0));
      ymax = niceMax(Math.max(1, ...sums, ...(o.lines || []).flatMap(([k]) => d[k])));
    }
    const y = (v) => top + (Hh - top - bot) * (1 - v / ymax);
    let g = '';
    for (let k = 0; k <= 2; k++) { const v = ymax * k / 2; g += '<line x1="' + ML + '" x2="' + (GW_ - MR) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#2a3a4e"/><text x="' + (ML - 5) + '" y="' + (y(v) + 3.5) + '" text-anchor="end" fill="#aab6c4" font-size="10">' + Math.round(v) + '</text>'; }
    const poly = (upper, lower, col, op) => '<polygon points="' + upper.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).concat(lower.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).reverse()).join(' ') + '" fill="' + col + '" fill-opacity="' + (op || 0.8) + '" stroke="#121a24" stroke-width="0.6"/>';
    if (o.cumulative) {
      // bands between successive curves: the gap between two lines is the stock at that stage
      const cs = o.curves.map(([k]) => d[k].map((v) => v - base0));
      g += poly(cs[cs.length - 1], cs[cs.length - 1].map(() => 0), '#4a5a6e', 0.55);
      for (let j = cs.length - 2; j >= 0; j--) g += poly(cs[j], cs[j + 1], o.stages[j][2]);
      cs.forEach((c, j) => { if (j === 0 || j === cs.length - 1) g += '<polyline fill="none" stroke="' + (j ? '#e9e4d8' : '#aab6c4') + '" stroke-width="1.2" points="' + c.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>'; });
    } else {
      const base = new Array(n).fill(0);
      o.stages.slice().reverse().forEach(([k, , col]) => { const up = base.map((b, i) => b + d[k][i]); g += poly(up, base.slice(), col); for (let i = 0; i < n; i++) base[i] = up[i]; });
      (o.lines || []).forEach(([k, , col, dash]) => {
        const pts = d[k].map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
        g += '<polyline fill="none" stroke="#121a24" stroke-width="4" points="' + pts + '"/><polyline fill="none" stroke="' + col + '" stroke-width="2"' + (dash ? ' stroke-dasharray="5 3"' : '') + ' points="' + pts + '"/>';
      });
    }
    if (o.axis) { for (let k = 0; k <= 5; k++) { const i = Math.round((n - 1) * k / 5); g += '<text x="' + x(i) + '" y="' + (Hh - 4) + '" text-anchor="' + (k === 0 ? 'start' : k === 5 ? 'end' : 'middle') + '" fill="#aab6c4" font-size="10">' + fmtClock(d.t[i]) + '</text>'; } }
    g += '<text x="4" y="' + (top + 10) + '" fill="#e9e4d8" font-size="11" font-weight="600">' + o.label + '</text>';
    if (o.sub) g += '<text x="4" y="' + (top + 23) + '" fill="#aab6c4" font-size="10">' + o.sub + '</text>';
    g += '<line class="xh" y1="' + top + '" y2="' + (Hh - bot) + '" stroke="#aab6c4" visibility="hidden"/><rect class="hit" x="' + ML + '" y="' + top + '" width="' + (GW_ - ML - MR) + '" height="' + (Hh - top - bot) + '" fill="transparent"/>';
    const legend = o.stages.map(([, name, col]) => '<span><i style="background:' + col + '"></i>' + name + '</span>').join('') +
      (o.cumulative ? '<span><i style="background:#4a5a6e"></i>Done (served or lost)</span>' : '') +
      (o.lines || []).map(([, name, col, dash]) => '<span><i style="background:' + col + ';color:' + col + '"' + (dash ? ' class="dash"' : '') + '></i>' + name + '</span>').join('');
    el.innerHTML = (o.title ? '<h3>' + o.title + '</h3>' : '') + '<div class="legend">' + legend + '</div><svg viewBox="0 0 ' + GW_ + ' ' + Hh + '" role="img" aria-label="' + esc(o.label) + '">' + g + '</svg><div class="ctip" hidden></div>';
    chartHover(el, n, (i) => {
      const row = (name, col, v) => '<span><span><i style="background:' + col + '"></i>' + name + '</span>' + v + (o.unit ? ' ' + o.unit : '') + '</span>';
      if (o.cumulative) {
        const v = o.curves.map(([k]) => d[k][i]);
        return '<b>' + fmtClock(d.t[i]) + '</b>' + o.stages.map(([, name, col], j) => row(name, col, v[j] - v[j + 1])).join('') +
          '<span><span>Arrived so far</span>' + v[0] + '</span><span><span>Done so far</span>' + v[v.length - 1] + '</span>';
      }
      return '<b>' + fmtClock(d.t[i]) + '</b>' + o.stages.map(([k, name, col]) => row(name, col, d[k][i])).join('') +
        (o.stages.length > 1 ? '<span><span>Total</span>' + sums[i] + (o.unit ? ' ' + o.unit : '') + '</span>' : '') + (o.lines || []).map(([k, name, col]) => row(name, col, d[k][i])).join('');
    });
  }
  function chartHover(el, n, html) {
    const svg = el.querySelector('svg'), tipEl = el.querySelector('.ctip'), xh = svg.querySelector('.xh'), hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * GW_ / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - ML) / ((GW_ - ML - MR) / Math.max(1, n - 1)))));
      xh.setAttribute('x1', xOf(i, n)); xh.setAttribute('x2', xOf(i, n)); xh.setAttribute('visibility', 'visible');
      const h = html(i, e, px); if (!h) { tipEl.hidden = true; return; }
      tipEl.innerHTML = h; tipEl.hidden = false;
      const bx = el.getBoundingClientRect();
      tipEl.style.left = Math.max(0, Math.min(e.clientX - bx.left + 12, bx.width - tipEl.offsetWidth - 4)) + 'px';
      tipEl.style.top = Math.max(0, e.clientY - bx.top - tipEl.offsetHeight - 8) + 'px';
    });
    hit.addEventListener('pointerleave', () => { tipEl.hidden = true; xh.setAttribute('visibility', 'hidden'); });
  }

  // ---------- Gantt: what each worker spent their time on ----------
  const ACT_TEXT = (code) => {
    if (code === 'idle') return 'Idle';
    const cat = code.replace(/[~!]/, ''), name = ACT_NAMES[cat];
    return name + (code.endsWith('~') ? ', walking' : code.endsWith('!') ? ', held up' : '');
  };
  function gantt(el, d) {
    const n = d.t.length;
    if (n < 2) { el.innerHTML = '<h3>Who did what</h3><p class="flow-empty">Fills in as the shop trades.</p>'; return; }
    const t0 = d.t[0] - 60, t1 = d.t[n - 1], cols = GW_ - ML - MR, span = Math.max(1, t1 - t0);
    const rows = Object.entries(S.acts).filter(([, a]) => a.segs.length && a.segs[a.segs.length - 1][2] >= t0);
    const rowH = 16, gap = 5, top = 4, axis = 16, Hh = top + rows.length * (rowH + gap) + axis;
    let g = '<defs>' + Object.entries(ACT_COLS).map(([k, c]) => '<pattern id="hatch-' + k + '" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="' + c + '" fill-opacity="0.25"/><line x1="0" y1="0" x2="0" y2="4" stroke="' + c + '" stroke-width="2"/></pattern>').join('') + '</defs>';
    const colData = [];
    rows.forEach(([id, a], r) => {
      // bucket the activity log into one column per pixel; each column shows what took most of that slice
      const y0 = top + r * (rowH + gap), buckets = new Array(cols).fill(null).map(() => ({}));
      for (const [code, f, to] of a.segs) {
        if (to < t0) continue;
        const a0 = Math.max(f, t0), a1 = Math.min(to + 1, t1);
        for (let c = Math.floor((a0 - t0) / span * cols); c <= Math.min(cols - 1, Math.floor((a1 - t0) / span * cols)); c++) {
          const cs = t0 + span * c / cols, ce = t0 + span * (c + 1) / cols, ov = Math.min(ce, a1) - Math.max(cs, a0);
          if (ov > 0) buckets[c][code] = (buckets[c][code] || 0) + ov;
        }
      }
      const tot = {}; let busy = 0, all = 0;
      const codes = buckets.map((b) => { let best = null, bv = 0; for (const k in b) { tot[k] = (tot[k] || 0) + b[k]; all += b[k]; if (b[k] > bv) { bv = b[k]; best = k; } } return best; });
      for (const k in tot) if (k !== 'idle' && !k.endsWith('~') && !k.endsWith('!')) busy += tot[k];
      colData.push({ name: a.name, codes, y0 });
      g += '<rect x="' + ML + '" y="' + y0 + '" width="' + cols + '" height="' + rowH + '" fill="#18222e"/>';
      for (let c = 0; c < cols;) {
        const code = codes[c]; let e = c; while (e < cols && codes[e] === code) e++;
        if (code && code !== 'idle') {
          const cat = code.replace(/[~!]/, ''), col = ACT_COLS[cat];
          const fill = code.endsWith('!') ? 'url(#hatch-' + cat + ')' : col;
          g += '<rect x="' + (ML + c) + '" y="' + y0 + '" width="' + (e - c) + '" height="' + rowH + '" fill="' + fill + '"' + (code.endsWith('~') ? ' fill-opacity="0.45"' : '') + '/>';
        }
        c = e;
      }
      g += '<text x="4" y="' + (y0 + 12) + '" fill="#e9e4d8" font-size="11">' + esc(a.name) + (a.left ? ' (left)' : '') + '</text>' +
        '<text x="' + (ML - 6) + '" y="' + (y0 + 12) + '" text-anchor="end" fill="#aab6c4" font-size="10">' + Math.round(100 * busy / Math.max(1, all)) + '%</text>';
    });
    // marks: builds, deliveries, hires, research
    const MK = { built: '#199e70', research: '#e9e4d8', delivery: '#c98500', hire: '#3987e5' };
    S.marks.filter((m) => m.t >= t0 && m.t <= t1).forEach((m) => {
      const mx = ML + (m.t - t0) / span * cols;
      g += '<line x1="' + mx + '" x2="' + mx + '" y1="' + top + '" y2="' + (Hh - axis) + '" stroke="' + MK[m.kind] + '" stroke-opacity="0.7" stroke-dasharray="2 2"><title>' + esc(fmtClock(m.t) + ' ' + m.text) + '</title></line>' +
        '<path d="M' + (mx - 4) + ',' + (Hh - axis + 1) + ' L' + (mx + 4) + ',' + (Hh - axis + 1) + ' L' + mx + ',' + (Hh - axis - 5) + 'Z" fill="' + MK[m.kind] + '"><title>' + esc(fmtClock(m.t) + ' ' + m.text) + '</title></path>';
    });
    for (let k = 0; k <= 5; k++) { const t = t0 + span * k / 5; g += '<text x="' + (ML + cols * k / 5) + '" y="' + (Hh - 3) + '" text-anchor="' + (k === 0 ? 'start' : k === 5 ? 'end' : 'middle') + '" fill="#aab6c4" font-size="10">' + fmtClock(t) + '</text>'; }
    g += '<line class="xh" y1="' + top + '" y2="' + (Hh - axis) + '" stroke="#aab6c4" visibility="hidden"/><rect class="hit" x="' + ML + '" y="' + top + '" width="' + cols + '" height="' + (Hh - axis - top) + '" fill="transparent"/>';
    el.innerHTML = '<h3>Who did what</h3><div class="legend">' + Object.keys(ACT_COLS).map((k) => '<span><i style="background:' + ACT_COLS[k] + '"></i>' + ACT_NAMES[k] + '</span>').join('') +
      '<span class="key">solid = working · faint = walking · striped = held up · blank = idle · % = time working</span></div>' +
      '<svg viewBox="0 0 ' + GW_ + ' ' + Hh + '" role="img" aria-label="Activity of each worker over time">' + g + '</svg><div class="ctip" hidden></div>';
    chartHover(el, n, (i, e, px) => {
      const r = el.querySelector('svg').getBoundingClientRect(), py = (e.clientY - r.top) * Hh / r.height;
      const row = colData.find((c) => py >= c.y0 && py <= c.y0 + rowH); if (!row) return null;
      const c = Math.max(0, Math.min(cols - 1, Math.round(px - ML))), t = t0 + span * c / cols;
      const near = S.marks.filter((m) => Math.abs(m.t - t) < span / cols * 4).map((m) => '<span><span>' + esc(m.text) + '</span>' + fmtClock(m.t) + '</span>').join('');
      return '<b>' + esc(row.name) + ' · ' + fmtClock(t) + '</b><span><span>' + ACT_TEXT(row.codes[c] || 'idle') + '</span></span>' + near;
    });
  }

  function refreshFlow() {
    if (flowEl.hidden) return;
    const H = S.hist, key = H.t.length + '|' + (H.t[H.t.length - 1] || 0) + '|' + flowRange + '|' + flowMode;
    if (key === flowKey) return; flowKey = key;
    const d = flowData(), n = d.t.length, last = n - 1;
    const wip = n ? d.queue[last] + d.rail[last] + d.making[last] + d.ready[last] : 0;
    const hr = Math.min(60, last), thr = n > 1 ? (d.served[last] - d.served[last - hr]) * 60 / Math.max(1, hr) : 0;
    const use = n > 1 ? (d.used[last] - d.used[last - hr]) / Math.max(1, hr) : 0;
    const lasts = use > 0 ? Math.floor((n ? d.onhand[last] : 0) / use) : null;
    document.getElementById('flowStats').innerHTML = [
      ['In the system now', wip + ' customers'], ['Served, last hour', thr.toFixed(0) + '/h'],
      ['Lead time', S.st.served ? (S.st.lead / 60).toFixed(1) + ' min' : '–'],
      ['Little’s Law', thr > 0 ? wip + ' ÷ ' + thr.toFixed(0) + '/h ≈ ' + (wip / (thr / 60)).toFixed(1) + ' min' : '–'],
      ['Beans last', lasts == null ? '–' : lasts >= 600 ? '10h+' : Math.floor(lasts / 60) + 'h ' + String(lasts % 60).padStart(2, '0') + 'm']
    ].map(([k, v]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('');
    document.querySelectorAll('#flow [data-range]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.range === flowRange)));
    document.querySelectorAll('#flow [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === flowMode)));
    gantt(document.getElementById('flowGantt'), d);
    const cum = flowMode === 'cumulative';
    lane(document.getElementById('flowOrders'), d, { title: 'Value chain', label: 'Orders', sub: cum ? 'cumulative' : 'customers at each stage', stages: ORDER_STAGES, cumulative: cum, curves: CUM_CURVES, height: 130 });
    lane(document.getElementById('flowBeans'), d, { label: 'Beans', sub: 'cups at each stage', stages: BEAN_STAGES, lines: BEAN_LINES, unit: 'cups', height: 92 });
    lane(document.getElementById('flowResearch'), d, { label: 'Research', sub: 'topics', stages: RES_STAGES, height: 72, axis: true });
  }

  // =====================================================================
  // Research: one shared capacity, split across topics; every extra topic in progress costs capacity
  // =====================================================================
  const resEl = document.getElementById('research'), resTool = document.getElementById('resTool');
  let resKey = '';
  function setResearch(on) {
    if (on) closeOverlays('research');
    resEl.hidden = !on; resTool.setAttribute('aria-expanded', String(on)); stage.classList.toggle('flow-open', on || !flowEl.hidden);
    if (on) { resKey = ''; refreshResearch(); }
  }
  function researchRates() {
    const R = S.R.research, act = Sim.TKEYS.filter((k) => !S.research[k].complete && S.research[k].weight > 0);
    const total = act.length ? R.rate * 100 / (100 + R.switchPct * (act.length - 1)) : 0;
    const W = act.reduce((n, k) => n + S.research[k].weight, 0);
    const per = {}; act.forEach((k) => { per[k] = total * S.research[k].weight / W; });
    return { act, total, per };
  }
  // the dock chip: what is being researched and how long is left, or a nudge when nothing is
  function refreshResTool() {
    if (resTool.hidden) return;
    const rr = researchRates(), open = Sim.TKEYS.filter((k) => !S.research[k].complete);
    const label = document.getElementById('resLabel'), prog = document.getElementById('resProg');
    let text, cls = '', pct = 0;
    if (!open.length) { text = 'All researched'; cls = 'done'; }
    else if (rr.act.length) {
      const k = rr.act[0], r = S.research[k], work = S.R.research.topics[k].work;
      pct = Math.floor(100 * r.done / work);
      text = Sim.TOPICS[k].name + ' · ' + Math.ceil((work - r.done) / rr.per[k]) + ' min' + (rr.act.length > 1 ? ' +' + (rr.act.length - 1) : '');
    } else { text = 'Pick research'; cls = 'idle'; }
    if (label.textContent !== text) label.textContent = text;
    prog.style.width = pct + '%';
    resTool.classList.toggle('idle', cls === 'idle'); resTool.classList.toggle('done', cls === 'done');
  }
  resTool.addEventListener('click', () => { fresh.delete('research'); setResearch(resEl.hidden); });
  // what a topic is worth and what it costs, from the current rules
  // the drawer shows each capacity chain one tier at a time: later tiers wait for the one before, finished ones give way to the next
  const HOLDER = { till: 'Each till\'s order rail', pickup: 'Each pickup counter' };
  const shownTopic = (k) => { const T = Sim.TOPICS[k]; return (!T.needs || S.research[T.needs].complete) && !(S.research[k].complete && Sim.TKEYS.some((o) => Sim.TOPICS[o].needs === k)); };
  function topicEffects(k) {
    const T = Sim.TOPICS[k];
    if (T.raises) {
      const now = Sim.capOf(S, T.raises), to = S.R.research.topics[k].slots;
      return {
        unlocks: [HOLDER[T.raises] + ' holds ' + to + ' cups' + (S.research[k].complete ? '' : ', up from ' + now)],
        gains: [T.raises === 'till' ? 'The till keeps taking orders while a rush of drinks is made' : 'Staff put drinks down and move on while customers are slow to collect'],
        costs: ['Nothing to buy']
      };
    }
    const items = T.unlocks.filter((t) => CAT[t]);
    const prods = PKEYS.filter((p) => items.includes(PROD[p].machine));
    const unlocks = items.map((t) => CAT[t].name + ' ' + money(CAT[t].cost)).concat(prods.map((p) => PROD[p].name + ' on the menu ' + money(PROD[p].price)));
    if (T.unlocks.includes('auto')) unlocks.push('Automatic bean orders');
    const gains = [], costs = [];
    prods.forEach((p) => {
      gains.push(S.R.mix[p] + '% of customers want ' + PROD[p].name.toLowerCase() + ' first');
      costs.push(money(PROD[p].cost) + ' a ' + (p === 'cake' ? 'slice' : 'cup') + ' in ingredients');
    });
    if (prods.length) gains.push(Math.round(S.R.demand.menuBonus * 100) + '% more customers for each extra item on the menu');
    if (items.length) costs.push(money(items.reduce((n, t) => n + CAT[t].cost, 0)) + ' of equipment to buy');
    if (T.unlocks.includes('auto')) { gains.push('Beans reorder themselves before you run dry'); costs.push('Buys sacks even when cash is tight'); }
    return { unlocks, gains, costs };
  }
  function refreshResearch() {
    if (resEl.hidden) return;
    const rs = S.research, R = S.R.research, rr = researchRates();
    const key = Sim.TKEYS.map((k) => rs[k].done + ':' + rs[k].weight + ':' + rs[k].complete).join('|');
    if (key === resKey) return; resKey = key;
    const n = rr.act.length;
    const head = '<header><h2>Research</h2><p class="res-cap">' + R.rate + ' points a minute' + (n > 1 ? ', split ' + n + ' ways' : '') + '. One topic at a time finishes soonest, and nothing pays off until a topic is done.</p><button type="button" id="resClose" aria-label="Close research">Close</button></header>';
    const cards = Sim.TKEYS.filter(shownTopic).map((k) => {
      const T = Sim.TOPICS[k], r = rs[k], work = R.topics[k].work, pct = work ? Math.floor(100 * r.done / work) : 100, fx = topicEffects(k);
      const state = r.complete ? ['done', r.finished > 0 ? 'Done at ' + fmtClock(r.finished) : 'Known from the start'] : r.weight > 0 ? ['active', 'In progress'] : r.done > 0 ? ['paused', 'Paused'] : ['ready', 'Ready to start'];
      const eta = !r.complete && rr.per[k] ? Math.ceil((work - r.done) / rr.per[k]) : null;
      const full = Math.ceil((work - r.done) / R.rate);
      const ctl = r.complete ? '' : r.weight > 0
        ? '<button type="button" data-res="' + k + '" data-w="0">Pause</button>'
        : n ? '<button type="button" class="primary" data-focus="' + k + '">Do this next</button><button type="button" class="link" data-res="' + k + '" data-w="1">Run alongside</button>'
        : '<button type="button" class="primary" data-res="' + k + '" data-w="1">' + (r.done ? 'Resume' : 'Start') + '</button>';
      return '<article class="res-card ' + state[0] + '"><span class="state">' + state[1] + '</span><h3>' + T.name + '</h3>' +
        (r.complete ? '' : '<span class="eta">' + (eta != null ? pct + '% · ' + eta + ' min left' : (r.done ? pct + '% · ' : '') + full + ' min at full pace') + '</span><div class="progress"><s style="width:' + pct + '%"></s></div>') +
        '<ul class="unlocks" aria-label="Unlocks">' + fx.unlocks.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul>' +
        (r.complete ? '' : '<ul class="fx">' + fx.gains.map((g) => '<li>' + esc(g) + '</li>').join('') + fx.costs.map((c) => '<li class="cost">' + esc(c) + '</li>').join('') + '</ul>') +
        (ctl ? '<div class="res-ctl">' + ctl + '</div>' : '') + '</article>';
    }).join('');
    resEl.innerHTML = head + '<div class="res-cards">' + cards + '</div>';
  }
  resEl.addEventListener('click', (e) => {
    if (e.target.closest('#resClose')) { setResearch(false); return; }
    const b = e.target.closest('[data-res]');
    if (b) { act('research', b.dataset.res, +b.dataset.w); resKey = ''; refreshResearch(); return; }
    const f = e.target.closest('[data-focus]');
    if (f) { Sim.TKEYS.forEach((k) => { if (!S.research[k].complete) { const w = k === f.dataset.focus ? 1 : 0; if (S.research[k].weight !== w) act('research', k, w); } }); resKey = ''; refreshResearch(); }
  });

  // =====================================================================
  // Bots and playtests
  // =====================================================================
  const Bot = window.CoffeeBot;
  const SCOL = { solo: '#3987e5', steady: '#d95926', rush: '#199e70' };
  let bot = null;
  const botSay = (m) => note('Bot: ' + m, 'info');
  const botbar = document.getElementById('botbar');
  function startBot(key) {
    newGame(SEED);
    bot = Bot.create(key);
    closePlay(); setSpeed(5); resetView();
    note('The ' + Bot.STRATS[key].name + ' bot is playing. Act at any point to take over.', 'warn');
  }
  function stopBot(msg) { if (!bot) return; bot = null; if (msg) note(msg, 'warn'); refreshBotBar(); }
  function refreshBotBar() {
    botbar.hidden = !bot;
    if (!bot) return;
    const html = '<span>Bot playing · <b>' + esc(bot.name) + '</b></span><button type="button" id="botStop">Take over</button>';
    if (botbar.innerHTML !== html) botbar.innerHTML = html;
  }
  botbar.addEventListener('click', (e) => { if (e.target.closest('#botStop')) stopBot('You took over from the bot.'); });

  const playModal = document.getElementById('playModal');
  const ptRes = document.getElementById('ptResults'), ptProg = document.getElementById('ptProgress'), ptRunBtn = document.getElementById('ptRun');
  const chosen = new Set(Object.keys(Bot.STRATS));
  document.getElementById('strats').innerHTML = Object.entries(Bot.STRATS).map(([k, s]) =>
    '<div class="strat"><header><i class="sw" style="background:' + SCOL[k] + '"></i><b>' + esc(s.name) + '</b></header><p>' + esc(s.blurb) + '</p>' +
    '<div class="row"><label><input type="checkbox" id="pt-' + k + '" data-k="' + k + '" checked> Include</label><button type="button" data-watch="' + k + '">Watch it play</button></div></div>').join('');
  document.getElementById('strats').addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { if (e.target.checked) chosen.add(k); else chosen.delete(k); ptRunBtn.disabled = !chosen.size; } });
  playModal.addEventListener('click', (e) => { const w = e.target.closest('[data-watch]'); if (w) startBot(w.dataset.watch); });
  function segVal(id) { return +document.querySelector('#' + id + ' [aria-pressed="true"]').dataset.v; }
  ['ptSeeds', 'ptHours'].forEach((id) => document.getElementById(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    document.querySelectorAll('#' + id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  let wasSpeed = 1;
  function openPlay() { wasSpeed = speed; setSpeed(0); playModal.hidden = false; }
  function closePlay() { playModal.hidden = true; }
  document.getElementById('playtestBtn').addEventListener('click', openPlay);
  document.getElementById('closePlay').addEventListener('click', () => { closePlay(); setSpeed(wasSpeed); });

  let running = 0;
  ptRunBtn.addEventListener('click', () => {
    if (running) return;
    const keys = Object.keys(Bot.STRATS).filter((k) => chosen.has(k)), seeds = segVal('ptSeeds'), hours = segVal('ptHours');
    const jobs = []; keys.forEach((k) => { for (let s = 1; s <= seeds; s++) jobs.push([k, s]); });
    const out = {}; keys.forEach((k) => { out[k] = []; });
    const run = ++running; let i = 0;
    ptRunBtn.disabled = true; ptProg.hidden = false;
    const bar = ptProg.querySelector('s'), lab = ptProg.querySelector('span');
    (function next() {
      if (run !== running) return;
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 40) { const [k, s] = jobs[i++]; out[k].push(Bot.trial(k, s, hours)); }
      bar.style.width = (100 * i / jobs.length) + '%'; lab.textContent = i + ' of ' + jobs.length + ' games';
      if (i < jobs.length) { setTimeout(next, 0); return; }
      running = 0; ptRunBtn.disabled = false; ptProg.hidden = true;
      showResults(out, hours, seeds);
    })();
  });

  const med = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2; };
  const START = Sim.DEFAULT_RULES.startCash;
  function verdict(r) {
    if (r.lastHour > 0 && r.final >= START) return ['good', 'Growing'];
    if (r.lastHour > 0) return ['warn', 'Paying back'];
    return ['bad', 'Losing money'];
  }
  function showResults(out, hours, seeds) {
    const rows = Object.entries(out).map(([k, rs]) => ({
      k, s: Bot.STRATS[k], rs,
      final: med(rs.map((r) => r.finalCash)), lo: Math.min(...rs.map((r) => r.finalCash)), hi: Math.max(...rs.map((r) => r.finalCash)),
      min: med(rs.map((r) => r.minCash)), lastHour: med(rs.map((r) => r.lastHour)), served: med(rs.map((r) => r.served)),
      walked: med(rs.map((r) => r.abandoned / Math.max(1, r.arrived))), sat: med(rs.map((r) => r.sat)), staff: med(rs.map((r) => r.workers)),
      esp: rs.filter((r) => r.items.includes('espresso')).length, broke: rs.filter((r) => r.minCash < 0).length,
      series: rs[0].cash.map((_, j) => med(rs.map((r) => r.cash[j])))
    }));
    // plain-language findings
    const best = rows.slice().sort((a, b) => b.final - a.final)[0];
    const grow = rows.filter((r) => verdict(r)[1] === 'Growing');
    const noEsp = rows.filter((r) => !r.esp);
    const lines = [];
    lines.push(grow.length ? esc(grow.map((r) => r.s.name).join(' and ')) + ' ended above the £600 starting cash and was still earning.' :
      'No strategy got back above the £600 starting cash in ' + hours + ' game hours.');
    lines.push('Best: ' + esc(best.s.name) + ', ' + money(best.final) + ' typical final cash, earning ' + money(best.lastHour) + ' in the last hour.');
    if (noEsp.length === rows.length) lines.push('No bot could afford espresso in any game.');
    else if (noEsp.length) lines.push(esc(noEsp.map((r) => r.s.name).join(' and ')) + ' never afforded espresso.');
    const broke = rows.filter((r) => r.broke);
    if (broke.length) lines.push(broke.map((r) => esc(r.s.name) + ' went into debt in ' + r.broke + ' of ' + r.rs.length).join('; ') + ' games.');
    const tbl = '<div class="tablewrap"><table class="pt"><thead><tr><th>Strategy</th><th>Final cash</th><th>Lowest</th><th>Last hour</th><th>Served</th><th>Walked out</th><th>Satisfaction</th><th>Staff</th><th>Espresso</th><th>Verdict</th><th></th></tr></thead><tbody>' +
      rows.map((r) => {
        const [cls, txt] = verdict(r);
        return '<tr><td><i class="sw" style="display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:' + SCOL[r.k] + '"></i>' + esc(r.s.name) + '</td>' +
          '<td class="' + (r.final < 0 ? 'neg' : '') + '">' + money(r.final) + '<small>' + money(r.lo) + ' to ' + money(r.hi) + '</small></td>' +
          '<td class="' + (r.min < 0 ? 'neg' : '') + '">' + money(r.min) + '</td>' +
          '<td class="' + (r.lastHour < 0 ? 'neg' : '') + '">' + (r.lastHour >= 0 ? '+' : '') + money(r.lastHour) + '/h</td>' +
          '<td>' + Math.round(r.served) + '</td><td>' + Math.round(r.walked * 100) + '%</td><td>' + Math.round(r.sat * 100) + '%</td><td>' + r.staff + '</td>' +
          '<td>' + r.esp + ' of ' + r.rs.length + '</td><td><span class="pill ' + cls + '">' + txt + '</span></td>' +
          '<td><button type="button" data-watch="' + r.k + '">Watch</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    ptRes.innerHTML = '<p class="finding">' + lines.join(' ') + '</p>' +
      '<div class="chartbox" id="ptChart"><h3>Cash over ' + hours + ' game hours · typical of ' + seeds + ' games</h3><div class="legend">' +
      rows.map((r) => '<span><i style="background:' + SCOL[r.k] + '"></i>' + esc(r.s.name) + '</span>').join('') + '<span><i class="dash"></i>Starting cash</span></div></div>' + tbl;
    drawChart(document.getElementById('ptChart'), rows, hours);
  }

  function drawChart(box, rows, hours) {
    const W = 640, H = 240, m = { l: 52, r: 64, t: 10, b: 26 };
    const n = rows[0].series.length, xs = (j) => m.l + (W - m.l - m.r) * (j + 1) / n;
    let lo = Math.min(0, ...rows.flatMap((r) => r.series)), hi = Math.max(START, ...rows.flatMap((r) => r.series));
    const span = hi - lo, step = [5000, 10000, 20000, 25000, 50000, 100000].find((s) => span / s <= 6) || 200000;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const ys = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    let g = '';
    for (let v = lo; v <= hi + 1; v += step) g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="' + (v === 0 ? '#aab6c4' : '#2a3a4e') + '" stroke-width="1"/><text x="' + (m.l - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end" fill="#aab6c4" font-size="11">' + money(v) + '</text>';
    const hStep = hours <= 4 ? 1 : hours <= 8 ? 2 : 5;
    for (let h = 0; h <= hours; h += hStep) { const x = m.l + (W - m.l - m.r) * h / hours; g += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#aab6c4" font-size="11">' + h + 'h</text>'; }
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + ys(START) + '" y2="' + ys(START) + '" stroke="#aab6c4" stroke-width="1.5" stroke-dasharray="4 3"/>';
    const pts = (r) => [[m.l, ys(START)]].concat(r.series.map((v, j) => [xs(j), ys(v)]));
    rows.forEach((r) => { g += '<polyline fill="none" stroke="' + SCOL[r.k] + '" stroke-width="2" stroke-linejoin="round" points="' + pts(r).map((p) => p.map((q) => q.toFixed(1)).join(',')).join(' ') + '"/>'; });
    // direct labels at the line ends, nudged apart
    const ends = rows.map((r) => ({ r, y: ys(r.series[n - 1]) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    ends.forEach((e) => { g += '<circle cx="' + xs(n - 1) + '" cy="' + ys(e.r.series[n - 1]) + '" r="3.5" fill="' + SCOL[e.r.k] + '" stroke="#121a24" stroke-width="2"/><text x="' + (xs(n - 1) + 8) + '" y="' + (e.y + 4) + '" fill="#e9e4d8" font-size="11">' + esc(e.r.s.name) + '</text>'; });
    g += '<line id="ptCross" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="#aab6c4" stroke-width="1" visibility="hidden"/>';
    g += '<rect id="ptHit" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/>';
    box.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Typical cash over time for each strategy; the table below has the numbers">' + g + '</svg><div class="ctip" hidden></div>');
    const svg = box.querySelector('svg'), tipEl = box.querySelector('.ctip'), cross = svg.querySelector('#ptCross');
    svg.querySelector('#ptHit').addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width;
      const j = Math.max(0, Math.min(n - 1, Math.round((x - m.l) / ((W - m.l - m.r) / n)) - 1));
      cross.setAttribute('x1', xs(j)); cross.setAttribute('x2', xs(j)); cross.setAttribute('visibility', 'visible');
      const mins = (j + 1) * 10;
      tipEl.innerHTML = '<b>' + Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm</b>' + rows.slice().sort((a, b) => b.series[j] - a.series[j]).map((q) => '<span><span><i style="background:' + SCOL[q.k] + '"></i>' + esc(q.s.name) + '</span>' + money(q.series[j]) + '</span>').join('');
      tipEl.hidden = false;
      const bx = box.getBoundingClientRect(), px = e.clientX - bx.left;
      tipEl.style.left = Math.min(px + 12, bx.width - tipEl.offsetWidth - 6) + 'px'; tipEl.style.top = (e.clientY - bx.top + 12) + 'px';
    });
    svg.querySelector('#ptHit').addEventListener('pointerleave', () => { tipEl.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }

  // =====================================================================
  // Loop
  // =====================================================================
  let last = performance.now(), hudAt = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (speed > 0 && modal.hidden && playModal.hidden) {
      acc += dt * TPS * speed;
      let n = Math.floor(acc);
      if (n > 80) { n = 80; acc = n; }
      for (let i = 0; i < n; i++) { if (bot) Bot.tick(bot, S, botSay); Sim.step(S); }
      acc -= n;
    }
    const frac = speed > 0 ? acc : 0;
    // events from the sim
    for (const e of S.events) if (e.n > seenEvent) { seenEvent = e.n; note(e.text, e.kind); }
    const nowMs = performance.now();
    if (ticker.length && nowMs - ticker[0].at > 7000) { ticker.shift(); renderTicker(); }
    sync(frac, dt);
    updateAccess();
    updatePile();
    hoverTick();
    controls.update();
    sun.position.copy(controls.target).add(new V3(3, 12, 8)); sun.target.position.copy(controls.target);
    renderer.render(scene, cam);
    updateLabels();
    if (now - hudAt > 200) { hudAt = now; refreshStats(); refreshDock(); refreshTickets(); refreshPanel(); refreshReplayBar(); refreshBotBar(); refreshFlow(); refreshResearch(); }
    requestAnimationFrame(frame);
  }
  renderIcons();
  newGame(SEED);
  resize(); resetView();
  showSplash();
  requestAnimationFrame(frame);
})();
