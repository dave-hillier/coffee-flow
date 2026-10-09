// Icons: the real models, rendered once to small pixel images.
import * as THREE from 'three';
import { Sim } from '../engine';
import { blk, custRig, fillShelf, isoDir, makeCup, mat, modelFor, sackMesh, workerRig } from './kit';

export type Icons = Record<string, string>;

export function renderIcons(): Icons {
  const icons: Icons = {};
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return icons; }
  const N = 40; r.setPixelRatio(1); r.setSize(N, N, false); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a2c22, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.65); sun.position.set(4, 9, 6); sc.add(sun);
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100), box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
  const shoot = (obj: THREE.Object3D, k?: number) => {
    obj.traverse((o) => { if ((o as THREE.Mesh).material === mat.hit) o.visible = false; });
    sc.add(obj); box.setFromObject(obj); box.getSize(size); box.getCenter(mid);
    const h = Math.max(size.x, size.y, size.z) * (k || 0.62);
    c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.updateProjectionMatrix();
    c.position.copy(mid).addScaledVector(isoDir, 30); c.lookAt(mid);
    r.render(sc, c); const url = r.domElement.toDataURL(); sc.remove(obj); return url;
  };
  const withSacks = (m: THREE.Group, n: number) => { fillShelf(m, n); return m; };
  ['till', 'pickup', 'brewer', 'grinder', 'espresso', 'pastry', 'milk', 'syrup'].forEach((t) => { icons[t] = shoot(modelFor(t)); });
  Sim.PKEYS.forEach((p) => { icons['cup:' + p] = shoot(makeCup(p)); });
  icons.stock = shoot(withSacks(modelFor('stock'), 6));
  icons.store = shoot(withSacks(modelFor('store'), 7));
  icons.cup = shoot(makeCup('filter'));
  icons.espressoCup = shoot(makeCup('espresso'));
  icons.cake = shoot(makeCup('cake'));
  icons.customer = shoot(custRig({ look: 2, id: 1 }).root, 0.46);
  const sack = new THREE.Group(); sack.add(sackMesh()); const s2 = sackMesh(); s2.position.set(0.12, 0, 0.3); s2.rotation.y = 0.5; sack.add(s2); icons.sack = shoot(sack);
  icons.worker = shoot(workerRig().root, 0.46);
  const books = new THREE.Group();
  ([[mat.red, 0, 0.7], [mat.sleeve, 0.14, 0.62], [mat.chalk, 0.28, 0.66]] as const).forEach(([m, y, w], i) => { blk(books, m, -w / 2 + i * 0.03, y, -0.22, w, 0.13, 0.44); blk(books, mat.white, -w / 2 + i * 0.03 + 0.03, y + 0.02, 0.2, w - 0.06, 0.09, 0.03); });
  icons.research = shoot(books);
  r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
  return icons;
}
