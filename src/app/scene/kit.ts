// Kit: materials, textures and models (from the Coffee Shop 3D kit). Plain three.js, no game state.
import * as THREE from 'three';

type Mat = THREE.Material;
const L = (c: number, o?: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
const B = (c: number, o?: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
export { L, B };

export function tex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export const mat: Record<string, Mat> = {
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
  slot: B(0x3a2c22), hit: B(0xffffff, { visible: false }),
  // milk and syrup stations, and the milk drinks' cups
  bottle: L(0xeaf4ff, { transparent: true, opacity: 0.28, depthWrite: false }), milkCap: L(0x3d7fc4), pump: L(0x1c1f24),
  foam: L(0xead7b8), cocoa: L(0x6b3f22), cream2: L(0xfbf7ee),
  // sacks of beans and bags of grounds
  sack: L(0xc9b48a), sackBand: L(0x7b4a2e), groundsBag: L(0x3a2a20)
};

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
// syrup colours, also the sleeves of the flavoured cups
export const SYRUP: Record<string, Mat> = { vanilla: L(0xe8cf86), caramel: L(0xc0702a), gingerbread: L(0x8c4424), mocha: L(0x4e2c1a) };
mat.brick = L(0xffffff, { map: texBrick });
mat.crate = L(0xffffff, { map: texCrate });
const floorMats: Record<string, Mat[]> = {};
([['wood', texWood, 0x6e3b20], ['pave', texPave, 0x7b7870]] as const).forEach(([k, t, sideC]) => {
  const s = L(sideC), top = L(0xffffff, { map: t }); floorMats[k] = [s, s, top, s, s, s];
});

export function add(p: THREE.Object3D, geo: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z);
  const clear = m.transparent || m.visible === false; o.castShadow = !clear; o.receiveShadow = !clear;
  p.add(o); return o;
}
export const blk = (p: THREE.Object3D, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number) =>
  add(p, new THREE.BoxGeometry(w, h, d), m, x + w / 2, y + h / 2, z + d / 2);
const cyl = (p: THREE.Object3D, m: Mat, x: number, y: number, z: number, rt: number, rb: number, h: number, seg?: number) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg || 14), m, x, y + h / 2, z);
export function tile(p: THREE.Object3D, type: string, x: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), floorMats[type]);
  o.position.set(x + 1, -0.05, z + 1); o.receiveShadow = true; p.add(o); return o;
}

export const TOP = 1.07;
function counter(len: number, dep: number, topM?: Mat) {
  const g = new THREE.Group();
  blk(g, mat.woodDark, 0.08, 0, 0.1, len - 0.16, 0.12, dep - 0.18);
  blk(g, mat.wood, 0.03, 0.12, 0.03, len - 0.06, 0.83, dep - 0.06);
  for (let k = 0; k < Math.round(len); k++) blk(g, mat.panel, k + 0.12, 0.26, dep - 0.045, 0.76, 0.56, 0.03);
  blk(g, topM || mat.top, 0, 0.95, 0, len, 0.12, dep);
  return g;
}
function onCounter(len: number, dep: number, topM: Mat, build: () => THREE.Object3D, faceBack?: boolean, offsetX?: number) {
  const g = counter(len, dep, topM);
  const m = build(); m.position.set(offsetX != null ? offsetX : len / 2, TOP, dep / 2);
  if (faceBack) m.rotation.y = Math.PI;
  g.add(m);
  return g;
}
interface EspressoSpec { W: number; D: number; H: number; body: Mat; trim: Mat; groups: number[]; gauges: number[]; wands: number[] }
function espresso(o: EspressoSpec) {
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
// a fridge under the counter, milk on top, steel jugs ready to steam
function milkStation() {
  const g = counter(1, 1, mat.top);
  blk(g, mat.steel, 0.1, 0.2, 0.955, 0.8, 0.68, 0.03);
  blk(g, mat.steelDeep, 0.78, 0.36, 0.985, 0.04, 0.36, 0.03);
  blk(g, mat.blackDeep, 0.1, 0.2, 0.95, 0.8, 0.03, 0.04);
  const top = new THREE.Group(); top.position.set(0.5, TOP, 0.5); g.add(top);
  [[-0.27, -0.2], [-0.1, -0.24]].forEach(([x, z]) => {
    blk(top, mat.white, x - 0.06, 0, z - 0.06, 0.12, 0.26, 0.12);
    blk(top, mat.milkCap, x - 0.03, 0.26, z - 0.03, 0.06, 0.04, 0.06);
    blk(top, mat.milkCap, x - 0.061, 0.08, z - 0.061, 0.122, 0.05, 0.122);
  });
  [[0.12, 0.1], [0.3, -0.12]].forEach(([x, z]) => {
    cyl(top, mat.steel, x, 0, z, 0.07, 0.06, 0.16);
    blk(top, mat.steel, x - 0.015, 0.12, z + 0.06, 0.03, 0.03, 0.05);
    blk(top, mat.steelDeep, x - 0.1, 0.06, z - 0.01, 0.04, 0.025, 0.02);
  });
  blk(top, mat.steelDeep, -0.36, 0, 0.12, 0.3, 0.02, 0.2);
  return g;
}
// pump bottles: clear glass, the syrup showing through, and a whipped cream canister
function syrupStation() {
  const g = new THREE.Group();
  blk(g, mat.steelDeep, -0.42, 0, -0.32, 0.84, 0.02, 0.3);
  ['vanilla', 'caramel', 'gingerbread', 'mocha'].forEach((k, i) => {
    const x = -0.31 + i * 0.205, z = -0.17;
    cyl(g, SYRUP[k], x, 0.025, z, 0.06, 0.06, 0.25, 10);
    cyl(g, mat.bottle, x, 0.02, z, 0.075, 0.075, 0.32, 10);
    cyl(g, mat.bottle, x, 0.34, z, 0.03, 0.045, 0.06, 8);
    cyl(g, mat.pump, x, 0.4, z, 0.032, 0.032, 0.05, 8);
    cyl(g, mat.pump, x, 0.45, z, 0.012, 0.012, 0.1, 6);
    blk(g, mat.pump, x - 0.02, 0.53, z - 0.02, 0.04, 0.035, 0.13);
  });
  cyl(g, mat.steel, 0.28, 0.02, 0.17, 0.065, 0.065, 0.3, 12);
  cyl(g, mat.pump, 0.28, 0.32, 0.17, 0.04, 0.06, 0.05, 10);
  blk(g, mat.pump, 0.265, 0.37, 0.17, 0.03, 0.03, 0.09);
  [[-0.26, 0.18], [-0.08, 0.2]].forEach(([x, z]) => cyl(g, mat.white, x, 0, z, 0.065, 0.052, 0.18, 10));
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
export const T = 0.15, H = 2.4;
export function wallSeg(p: THREE.Object3D, type: string, x0: number) {
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
export function lowBrick(p: THREE.Object3D, x: number, z: number, w: number, d: number) {
  blk(p, mat.brick, x, 0, z, w, 0.7, d);
  blk(p, mat.stone, x - 0.02, 0.7, z - 0.02, w + 0.04, 0.06, d + 0.04);
}

// the back door: a gap in the side wall at the back corner, the door swung open onto the alley, a wheelie bin beside it.
// Sacks are delivered on the paving outside and grounds go in the bin.
export function backDoor(p: THREE.Object3D) {
  const doorM = L(0x3f5e4a), binM = L(0x2f6b45), binLid = L(0x24533a);
  blk(p, mat.frame, 12, 0, -0.02, T, 2.05, 0.06);
  blk(p, mat.frame, 12, 0, 0.96, T, 2.05, 0.06);
  blk(p, mat.frame, 12, 2.0, -0.02, T, 0.08, 1.04);
  blk(p, doorM, 12.15, 0.02, 0.95, 0.88, 1.95, 0.05);
  blk(p, mat.brass, 12.9, 0.95, 0.9, 0.05, 0.05, 0.05);
  blk(p, mat.mat, 11.15, 0.005, 0.12, 0.75, 0.01, 0.76);
  blk(p, binM, 12.3, 0.08, 1.6, 0.62, 0.92, 0.62);
  blk(p, binLid, 12.27, 1.0, 1.57, 0.68, 0.07, 0.68);
  blk(p, binLid, 12.27, 0.97, 1.57, 0.06, 0.06, 0.68);
  [1.66, 2.1].forEach((z) => cyl(p, mat.blackDeep, 12.38, 0, z, 0.08, 0.08, 0.1));
}

// =====================================================================
// Characters: blocky jointed skeletons
// =====================================================================
const rigMats: Record<number, Mat> = {};
const rmat = (c: number) => rigMats[c] || (rigMats[c] = L(c));
function box(p: THREE.Object3D, c: number, w: number, h: number, d: number, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rmat(c)); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o;
}
const SHIRTS = [0x6f8fb3, 0x9a6fa8, 0x5f9e86, 0xc0785a, 0x8d8a5a, 0xb35a6f, 0x5a7aa0, 0x7d6a5a];
const SKINS = [0xe6c3a0, 0xc99a74, 0x9c6b4a, 0x6f4a33, 0xf0d2b4, 0xb07f5c];
interface RigSpec { shirt: number; legs: number; shoe: number; skin: number; joint: number; apron?: number; hat?: number; hair?: number }
export interface Rig {
  root: THREE.Group; body: THREE.Group; hips: THREE.Group;
  legs: { hip: THREE.Group; knee: THREE.Group }[]; arms: { sh: THREE.Group; el: THREE.Group }[];
  torso: THREE.Group; head: THREE.Group; carry: THREE.Group; hand: THREE.Group; cup: boolean; yaw: number; ph: number;
}
function makeRig(o: RigSpec): Rig {
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
  else box(head, o.hair!, 0.26, 0.06, 0.26, 0, 0.29, -0.01);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.21, 0.4, 0); torso.add(sh);
    box(sh, o.joint, 0.085, 0.085, 0.085, 0, 0, 0);
    box(sh, o.shirt, 0.09, 0.21, 0.09, 0, -0.13, 0);
    const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
    box(el, o.joint, 0.075, 0.06, 0.075, 0, 0, 0);
    box(el, o.skin, 0.08, 0.2, 0.08, 0, -0.12, 0);
    return { sh, el };
  });
  // sacks and grounds are hugged to the chest with both arms; a cup sits in the right hand, kept upright in pose()
  const carry = new THREE.Group(); carry.position.set(0, 0.12, 0.3); torso.add(carry);
  const hand = new THREE.Group(); hand.position.set(0, -0.23, 0.02); arms[0].el.add(hand);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.75), mat.hit); hit.position.y = 0.75; root.add(hit);
  return { root, body, hips, legs, arms, torso, head, carry, hand, cup: false, yaw: 0, ph: Math.random() * 6 };
}
const lerpR = (o: THREE.Object3D, v: number, k: number) => { o.rotation.x += (v - o.rotation.x) * k; };
export function pose(r: Rig, anim: string, k: number) {
  const ph = r.ph, s = Math.sin(ph), s2 = Math.sin(ph * 2);
  let lh = 0, rh = 0, lk = 0, rk = 0, ls = 0, rs = 0, le = 0, re = 0, bob = 0, lean = 0;
  const moving = anim === 'walk' || anim === 'carry';
  if (moving) { lh = -s * 0.6; rh = s * 0.6; lk = Math.max(0, s) * 0.9; rk = Math.max(0, -s) * 0.9; bob = Math.abs(s) * 0.035; ls = s * 0.55; rs = -s * 0.55; le = re = -0.25; }
  // a cup takes one hand: the right forearm held out level, the left arm free to swing
  if ((anim === 'carry' || anim === 'hold') && r.cup) { ls = -0.45; le = -1.1; if (!moving) rs = re = 0; }
  else if (anim === 'carry' || anim === 'hold') { ls = rs = -1.0; le = re = -0.65; }
  if (anim === 'work') { ls = -1.15 + s2 * 0.2; rs = -1.15 - s2 * 0.2; le = re = -0.55; lean = 0.08; }
  if (anim === 'build') { rs = -2.4 + Math.abs(Math.sin(ph * 1.4)) * 1.4; re = -0.3; ls = -0.9; le = -0.5; lh = -0.55; rh = 0.25; lk = 1.0; rk = 0.45; bob = -0.07; lean = 0.3; }
  if (anim === 'idle') { bob = Math.sin(ph * 0.35) * 0.008; }
  lerpR(r.legs[0].hip, lh, k); lerpR(r.legs[1].hip, rh, k); lerpR(r.legs[0].knee, lk, k); lerpR(r.legs[1].knee, rk, k);
  lerpR(r.arms[0].sh, ls, k); lerpR(r.arms[1].sh, rs, k); lerpR(r.arms[0].el, le, k); lerpR(r.arms[1].el, re, k);
  lerpR(r.torso, lean, k);
  r.body.position.y += (bob - r.body.position.y) * k;
  r.hand.rotation.x = -(r.torso.rotation.x + r.arms[0].sh.rotation.x + r.arms[0].el.rotation.x);
}
export function workerRig() {
  return makeRig({ shirt: 0x2c3e55, legs: 0x22303f, shoe: 0x15171b, skin: 0xe6c3a0, joint: 0xe9e4d8, apron: 0xe0a458, hat: 0xe0a458 });
}
export function custRig(c: { look: number; id: number }) {
  const shirt = SHIRTS[c.look % SHIRTS.length], skin = SKINS[(c.look * 5 + c.id) % SKINS.length];
  return makeRig({ shirt, legs: 0x3a3f4a, shoe: 0x2b2f36, skin, joint: 0x9aa4b1, hair: [0x2b2118, 0x5a3a22, 0x15171b, 0xb08a4a][c.id % 4] });
}

// mood faces
function faceTex(bg: string, kind: string) {
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
export const moodMats = [
  faceTex('#5fc58a', 'smile'), faceTex('#d9c45a', 'flat'), faceTex('#e08a48', 'frown'), faceTex('#d9534f', 'angry')
].map((t) => new THREE.SpriteMaterial({ map: t, depthTest: false }));

// cups
const cupGeo = {
  body: new THREE.CylinderGeometry(0.07, 0.055, 0.2, 10), sleeve: new THREE.CylinderGeometry(0.072, 0.066, 0.07, 10),
  lid: new THREE.CylinderGeometry(0.076, 0.076, 0.025, 10), band: new THREE.CylinderGeometry(0.074, 0.07, 0.03, 10),
  saucer: new THREE.CylinderGeometry(0.1, 0.09, 0.015, 12), small: new THREE.CylinderGeometry(0.055, 0.042, 0.08, 10),
  plate: new THREE.CylinderGeometry(0.12, 0.1, 0.015, 12), slab: new THREE.BoxGeometry(0.14, 0.08, 0.1),
  slot: new THREE.CylinderGeometry(0.085, 0.085, 0.004, 12),
  mug: new THREE.CylinderGeometry(0.075, 0.055, 0.1, 12), foam: new THREE.CylinderGeometry(0.068, 0.068, 0.006, 12),
  dust: new THREE.CylinderGeometry(0.03, 0.03, 0.004, 8), whip: new THREE.SphereGeometry(0.068, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
};
const mCup = (g: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
export function makeCup(prod: string) {
  const g = new THREE.Group(); let band: THREE.Mesh;
  if (prod === 'filter') {
    g.add(mCup(cupGeo.body, mat.white, 0, 0.1, 0), mCup(cupGeo.sleeve, mat.sleeve, 0, 0.09, 0), mCup(cupGeo.lid, mat.white, 0, 0.21, 0));
    band = mCup(cupGeo.band, mat.amberB, 0, 0.16, 0);
  } else if (prod === 'espresso') {
    g.add(mCup(cupGeo.saucer, mat.white, 0, 0.008, 0), mCup(cupGeo.small, mat.white, 0, 0.055, 0));
    band = mCup(cupGeo.band, mat.amberB, 0, 0.06, 0); band.scale.set(0.8, 1, 0.8);
  } else if (prod === 'latte' || prod === 'cappuccino') {
    // a wide cup on a saucer, foam on top: cappuccinos get a dusting of cocoa
    g.add(mCup(cupGeo.saucer, mat.white, 0, 0.008, 0), mCup(cupGeo.mug, mat.white, 0, 0.065, 0), mCup(cupGeo.foam, mat.foam, 0, 0.116, 0));
    if (prod === 'cappuccino') g.add(mCup(cupGeo.dust, mat.cocoa, 0, 0.12, 0));
    band = mCup(cupGeo.band, mat.amberB, 0, 0.06, 0); band.scale.set(0.95, 1, 0.95);
  } else if (SYRUP[prod]) {
    // takeaway cups in the syrup's colour; the mocha has whipped cream instead of a lid
    g.add(mCup(cupGeo.body, mat.white, 0, 0.1, 0), mCup(cupGeo.sleeve, SYRUP[prod], 0, 0.09, 0));
    if (prod === 'mocha') g.add(mCup(cupGeo.whip, mat.cream2, 0, 0.2, 0), mCup(cupGeo.dust, mat.cocoa, 0, 0.245, 0));
    else g.add(mCup(cupGeo.lid, mat.white, 0, 0.21, 0));
    band = mCup(cupGeo.band, mat.amberB, 0, 0.16, 0);
  } else {
    g.add(mCup(cupGeo.plate, mat.white, 0, 0.008, 0), mCup(cupGeo.slab, mat.pastry, 0, 0.055, 0));
    band = mCup(cupGeo.band, mat.amberB, 0, 0.11, 0); band.scale.set(0.5, 0.6, 0.5);
  }
  g.add(band); g.userData.band = band;
  return g;
}
export const slotGeo = cupGeo.slot;
// cup spots on a counter top: rows of four beside the till or the sign, one more row per four slots researched
const SLOT_X: Record<string, number> = { till: 0.15, pickup: 0.2 };
export function slotsOf(it: { type: string; cap: number }): [number, number][] | null {
  if (!(it.type in SLOT_X)) return null;
  const rows = Math.max(1, Math.ceil(it.cap / 4)), out: [number, number][] = [];
  for (let i = 0; i < it.cap; i++) out.push([SLOT_X[it.type] + (i % 4) * 0.22, rows === 1 ? 0.5 : 0.2 + Math.floor(i / 4) * 0.6 / (rows - 1)]);
  return out;
}

export function modelFor(type: string): THREE.Group {
  if (type === 'till') return onCounter(2, 1, mat.top, till, true, 1.25);
  if (type === 'pickup') return onCounter(2, 1, mat.top, pickupSign);
  if (type === 'brewer') return onCounter(1, 1, mat.top, batchBrewer);
  if (type === 'grinder') return onCounter(1, 1, mat.top, grinder);
  if (type === 'espresso') return onCounter(2, 1, mat.top, starterEspresso);
  if (type === 'store') return storeShelf();
  if (type === 'milk') return milkStation();
  if (type === 'syrup') return onCounter(1, 1, mat.top, syrupStation);
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
// stack n sacks on a shelf or pallet model
export function fillShelf(model: THREE.Object3D | undefined, n: number) {
  const holder: THREE.Group | undefined = model && model.userData.sacks; if (!holder || !model) return;
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
export function crateModel(w: number, d: number) {
  const g = new THREE.Group();
  blk(g, mat.crate, 0.12, 0, 0.12, w - 0.24, 0.72, d - 0.24);
  blk(g, mat.plank, 0.08, 0, 0.08, 0.08, 0.76, 0.08); blk(g, mat.plank, w - 0.16, 0, 0.08, 0.08, 0.76, 0.08);
  blk(g, mat.plank, 0.08, 0, d - 0.16, 0.08, 0.76, 0.08); blk(g, mat.plank, w - 0.16, 0, d - 0.16, 0.08, 0.76, 0.08);
  blk(g, mat.amber, w / 2 - 0.15, 0.3, d - 0.125, 0.3, 0.16, 0.01);
  return g;
}
export function sackMesh() {
  const g = new THREE.Group();
  blk(g, mat.sack, -0.17, 0, -0.11, 0.34, 0.24, 0.22);
  blk(g, mat.sackBand, -0.175, 0.09, -0.115, 0.35, 0.05, 0.23);
  blk(g, mat.sack, -0.08, 0.24, -0.06, 0.16, 0.05, 0.12);
  return g;
}
export function groundsMesh() {
  const g = new THREE.Group();
  blk(g, mat.groundsBag, -0.12, 0, -0.1, 0.24, 0.22, 0.2);
  blk(g, mat.groundsBag, -0.05, 0.22, -0.04, 0.1, 0.06, 0.08);
  return g;
}
export const isoDir = new THREE.Vector3(1, 0.8165, 1).normalize();
