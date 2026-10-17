import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
{ // sky gradient background
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fb0d8'); gr.addColorStop(0.55, '#f2c99a'); gr.addColorStop(1, '#f6a96b');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
scene.fog = new THREE.Fog(0xf0c69c, 35, 95);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

// lights: warm low afternoon sun from the west/south-west
const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x9a7454, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
sun.position.set(-9, 13, 7); sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);

// ---------- layout ----------
const GARDEN = { minX: -6.6, maxX: 6.6, minZ: -5.6, maxZ: 6.4 };
const SEA_EDGE_Z = -6.2;
const ENTRANCE = new THREE.Vector3(7.6, 0, 5.4);
const SAMOVAR_POS = new THREE.Vector3(-5.6, 0, 1.6);   // counter centre
const SAMOVAR_SERVE = new THREE.Vector3(-4.55, 0, 1.6); // where waiter stands
const TABLE_POS = [[-2.6, -3.7], [0.9, -4.0], [4.3, -3.5], [-1.6, -0.3], [2.4, 0.1], [0.4, 3.4]];

// ---------- procedural textures ----------
function cobbleTexture() {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.fillStyle = '#6f6458'; g.fillRect(0, 0, s, s);
  const rnd = mulberry(7); const rows = 10, cell = s / rows;
  for (let r = 0; r < rows; r++) for (let k = -1; k < rows + 1; k++) {
    const x = (k + (r % 2) * 0.5) * cell + (rnd() - .5) * 6, y = r * cell + cell / 2 + (rnd() - .5) * 6;
    const l = 48 + rnd() * 22, h = 22 + rnd() * 16;
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      g.fillStyle = `hsl(${h},${12 + rnd() * 10}%,${l}%)`;
      g.beginPath(); g.ellipse(x + dx, y + dy, cell * .44, cell * .4, rnd() * .4, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,240,220,.12)'; g.beginPath(); g.ellipse(x + dx - 4, y + dy - 4, cell * .3, cell * .22, 0, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function checkerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4efe6' : '#b51f1a'; g.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- static scene ----------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
// ground slab (quay)
{
  const tex = cobbleTexture(); tex.repeat.set(9, 8);
  const W = 16, D = 13.6;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0xffffff, { map: tex }));
  top.rotation.x = -Math.PI / 2; top.position.set(0, 0, SEA_EDGE_Z + D / 2); top.receiveShadow = true; scene.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, 0.5), std(0xa89a86));
  edge.position.set(0, -0.6, SEA_EDGE_Z + 0.2); scene.add(edge);
  // surrounding pavement beyond garden so camera never sees void
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), std(0x9b8a74));
  outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, SEA_EDGE_Z + 15); outer.receiveShadow = true; scene.add(outer);
  // low hedge walls at sides and back
  const hedgeMat = std(0x3f6b2f, { roughness: 1, flatShading: true });
  for (const [x, z, w, d] of [[-7.8, 0.6, 0.6, 13.2], [7.8, -0.9, 0.6, 10.2], [0, 7.3, 16.2, 0.6]]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), hedgeMat); h.position.set(x, 0.4, z); h.castShadow = h.receiveShadow = true; h.userData.camBlock = true; scene.add(h);
  }
}
// railing (green painted iron) along sea edge
{
  const mat = std(0x1f4a35, { roughness: 0.5, metalness: 0.4 });
  const n = 33, post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation(-8 + i * 0.5, 0.5, SEA_EDGE_Z + 0.25); post.setMatrixAt(i, m); }
  post.castShadow = true; scene.add(post);
  for (const y of [1.0, 0.55, 0.12]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(16, y === 1.0 ? 0.07 : 0.04, y === 1.0 ? 0.09 : 0.04), mat);
    r.position.set(0, y, SEA_EDGE_Z + 0.25); r.castShadow = true; scene.add(r);
  }
}
// sea (animated shader)
const seaUniforms = { uTime: { value: 0 }, uFog: { value: new THREE.Color(0xf0c69c) } };
{
  const geo = new THREE.PlaneGeometry(200, 90, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFog; varying vec3 vW;
      float n(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec2 p = vW.xz;
        float w = n(p*vec2(0.9,1.7)+vec2(uTime*0.6,uTime*0.35))*0.5 + n(p*vec2(2.3,3.1)-vec2(uTime*0.9,-uTime*0.5))*0.3 + n(p*vec2(5.1,4.3)+uTime*1.3)*0.2;
        float d = clamp((-vW.z-6.)/60.,0.,1.);
        vec3 deep = vec3(0.07,0.27,0.40), near = vec3(0.13,0.42,0.50);
        vec3 col = mix(near, deep, d) + w*0.04;
        float glint = smoothstep(0.55,0.95,w) * (0.35 + 0.65*smoothstep(0.,1.,d)) ;
        col += vec3(1.0,0.82,0.55)*glint*0.45;
        float sunPath = exp(-pow((vW.x+18.)/10.,2.)) * d; col += vec3(1.,.75,.45)*sunPath*(0.25+0.25*w);
        float f = smoothstep(30.,90.,length(vW.xz-cameraPosition.xz));
        gl_FragColor = vec4(mix(col,uFog,f*0.85),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sea = new THREE.Mesh(geo, mat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.55, SEA_EDGE_Z - 45); scene.add(sea);
}
// far shore (Asian side silhouette): hills, houses, mosque + minarets
{
  const rnd = mulberry(42);
  const hillMat = std(0x6f7f5e, { flatShading: true, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
    h.scale.set(10 + rnd() * 8, 3 + rnd() * 4, 6); h.position.set(-60 + i * 15, -0.5, -72 - rnd() * 6); scene.add(h);
  }
  const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff), 70);
  const m = new THREE.Matrix4(), col = new THREE.Color(); const pal = [0xe8d6b5, 0xd99a77, 0xf1e6d2, 0xc97f5d, 0xe2c08d, 0xbfb6a8];
  for (let i = 0; i < 70; i++) {
    const w = 1.2 + rnd() * 1.6, hh = 1 + rnd() * 2.6;
    m.compose(new THREE.Vector3(-55 + rnd() * 110, hh / 2 - 0.4 + rnd() * 1.5, -64 - rnd() * 6), new THREE.Quaternion(), new THREE.Vector3(w, hh, 1.2));
    houses.setMatrixAt(i, m); houses.setColorAt(i, col.setHex(pal[i % pal.length]));
  }
  scene.add(houses);
  const stone = std(0xd9d2c4);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone); dome.position.set(14, 2.4, -63); scene.add(dome);
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4), stone); base.position.set(14, 1.1, -63); scene.add(base);
  for (const x of [10.5, 17.5]) {
    const mi = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 9, 8), stone); mi.position.set(x, 4.3, -63); scene.add(mi);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 8), std(0x7a8a99)); cone.position.set(x, 9.5, -63); scene.add(cone);
  }
}
// ferry (vapur)
const ferry = new THREE.Group();
{
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 1.8), std(0xf3f0ea)); hull.position.y = 0.2; ferry.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.02, 0.18, 1.82), std(0x2a2a2a)); stripe.position.y = -0.2; ferry.add(stripe);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.8, 1.5), std(0xffffff)); cabin.position.y = 1.0; ferry.add(cabin);
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), std(0xd6a548)); chim.position.y = 1.8; ferry.add(chim);
  ferry.position.set(-40, -0.4, -26); scene.add(ferry);
}
// trees (çınar-like)
function makeTree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 2.6 * s, 7), std(0x7a6a55));
  trunk.position.y = 1.3 * s; trunk.castShadow = true; trunk.userData.camBlock = true; g.add(trunk);
  const leaf = std(0x5d8a3a, { flatShading: true, roughness: 0.9 });
  const rnd = mulberry(Math.floor(x * 100 + z * 7));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.0 + rnd() * 0.5) * s, 0), leaf);
    b.position.set((rnd() - .5) * 1.6 * s, (2.9 + rnd() * 0.9) * s, (rnd() - .5) * 1.6 * s); b.castShadow = true; b.userData.camBlock = true; g.add(b);
  }
  g.position.set(x, 0, z); scene.add(g); return g;
}
makeTree(-6.6, -4.8, 1.15); makeTree(6.7, -4.6, 1.1); makeTree(7.6, 2.8, 0.85);
// pots with geraniums near railing
{
  const pot = std(0xb5643a), fl = std(0xd8263a, { flatShading: true });
  for (const x of [-4.4, -0.9, 2.7, 5.4]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 8), pot); p.position.set(x, 0.22, SEA_EDGE_Z + 0.75); p.castShadow = true; scene.add(p);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), fl); f.position.set(x, 0.6, SEA_EDGE_Z + 0.75); scene.add(f);
  }
}
// samovar counter (wood) + awning
const counter = new THREE.Group();
{
  const wood = std(0x7b4a2a, { roughness: 0.7 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 2.2), wood); box.position.y = 0.475; box.castShadow = box.receiveShadow = true; box.userData.camBlock = true; counter.add(box);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 2.3), std(0x5a2f18, { roughness: 0.5 })); top.position.y = 0.98; top.receiveShadow = true; counter.add(top);
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), std(0xffffff, { map: checkerTexture() }));
  tile.position.set(0.505, 0.55, 0); tile.rotation.y = Math.PI / 2; counter.add(tile);
  counter.position.copy(SAMOVAR_POS); scene.add(counter);
  // awning
  // back wall with sign instead of an awning (awning hid the owner from the high camera)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 2.6), std(0xe8d9bf)); wall.position.set(SAMOVAR_POS.x - 1.55, 1.1, SAMOVAR_POS.z); wall.castShadow = wall.receiveShadow = true; wall.userData.camBlock = true; scene.add(wall);
  const sc2 = document.createElement('canvas'); sc2.width = 256; sc2.height = 64; const g2 = sc2.getContext('2d'); g2.fillStyle = '#b3261e'; g2.fillRect(0, 0, 256, 64); g2.fillStyle = '#fff3e0'; g2.font = 'bold 40px Georgia'; g2.textAlign = 'center'; g2.fillText('ÇAY OCAĞI', 128, 47);
  const st = new THREE.CanvasTexture(sc2); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: st })); sign.position.set(SAMOVAR_POS.x - 1.47, 1.95, SAMOVAR_POS.z); sign.rotation.y = Math.PI / 2; scene.add(sign);
}

// ---------- loading ----------
const loadingEl = document.getElementById('loadPct');
const manager = new THREE.LoadingManager();
manager.onProgress = (u, l, t) => { loadingEl.textContent = Math.round(l / t * 100) + '%'; };
const draco = new DRACOLoader(manager); draco.setDecoderPath('./vendor/draco/');
const loader = new GLTFLoader(manager); loader.setDRACOLoader(draco);
const loadG = (n) => new Promise((res) => loader.load('./assets/' + n + '.glb', g => res(g), undefined, (e) => { console.warn('load fail', n, e); res(null); }));
const load = (n) => loadG(n).then(g => g && g.scene);

function prep(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

const [waiterG, ownerG, tableSrc, samovarSrc, traySrc, teapotSrc, easelSrc, chairSrc] = await Promise.all([
  loadG('waiter_anim').then(g => g || loadG('waiter')), loadG('owner_anim').then(g => g || loadG('owner')),
  ...['table', 'samovar', 'tray', 'teapot', 'easel', 'chair'].map(load)]);
const waiterSrc = waiterG && waiterG.scene, ownerSrc = ownerG && ownerG.scene;

// ---------- props ----------
const checker = checkerTexture();
const tables = [];
TABLE_POS.forEach(([x, z], i) => {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  if (tableSrc) {
    const t = prep(tableSrc.clone()); g.add(t);
  } else {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), std(0xffffff, { map: checker })); top.position.y = 0.74; top.castShadow = true; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), std(0x333333)); leg.position.y = 0.36; g.add(leg);
  }
  // tea glass on table when served (hidden by default)
  const glass = new THREE.Group();
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x9a2b12, roughness: 0.15, transparent: true, opacity: 0.85 }));
  gl.position.y = 0.05; glass.add(gl);
  const sauc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 12), std(0xffffff, { roughness: 0.3 })); glass.add(sauc);
  glass.position.set(0.15, 0.76, 0.1); glass.visible = false; g.add(glass);
  // placeholder chairs: two simple wooden chairs (left/right of table)
  const seats = [];
  for (const side of [-1, 1]) {
    const chair = makeChair(); chair.position.set(side * 0.85, 0, 0); chair.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(chair);
    seats.push({ pos: new THREE.Vector3(x + side * 0.85, 0, z), faceY: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  // hit area (bigger than table for fat fingers)
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.4, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.7; hit.userData.table = i; g.add(hit);
  scene.add(g);
  tables.push({ i, group: g, pos: new THREE.Vector3(x, 0, z), seats, customer: null, glass, hit });
});
function makeChair() {
  if (chairSrc) return prep(chairSrc.clone());
  const g = new THREE.Group(); const wood = std(0x8a5a32, { roughness: 0.75 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood); seat.position.y = 0.45; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), wood); back.position.set(0, 0.68, -0.2); g.add(back);
  const legG = new THREE.BoxGeometry(0.04, 0.45, 0.04);
  for (const [lx, lz] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) { const l = new THREE.Mesh(legG, wood); l.position.set(lx, 0.225, lz); g.add(l); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}
// samovar on counter
const samovarGroup = new THREE.Group(); samovarGroup.position.set(SAMOVAR_POS.x, 1.01, SAMOVAR_POS.z - 0.4);
if (samovarSrc) { const s = prep(samovarSrc.clone()); s.rotation.y = Math.PI / 2; samovarGroup.add(s); }
else {
  const brass = std(0xc8932e, { metalness: 0.9, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.4, 16), brass); body.position.y = 0.25; samovarGroup.add(body);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), brass); pot.position.y = 0.55; samovarGroup.add(pot);
}
scene.add(samovarGroup);
if (teapotSrc) { const t = prep(teapotSrc.clone()); t.position.set(SAMOVAR_POS.x + 0.1, 1.01, SAMOVAR_POS.z + 0.45); t.rotation.y = Math.PI / 2; scene.add(t); }
let trayModel;
if (traySrc) { trayModel = prep(traySrc.clone()); }
else { trayModel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), std(0xc8932e, { metalness: 0.9, roughness: 0.3 })); }
// spare tray displayed on counter
{ const t = trayModel.clone(); t.position.set(SAMOVAR_POS.x + 0.15, 1.01, SAMOVAR_POS.z + 0.95); scene.add(t); }
if (easelSrc) { const e = prep(easelSrc.clone()); e.position.set(6.3, 0, 4.4); e.rotation.y = -Math.PI / 2.8 + Math.PI; scene.add(e); }
// samovar hit area (counter + samovar + owner)
const samovarHit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.8), new THREE.MeshBasicMaterial({ visible: false }));
samovarHit.position.set(SAMOVAR_POS.x - 0.3, 1.1, SAMOVAR_POS.z); samovarHit.userData.samovar = true; scene.add(samovarHit);

// ---------- characters ----------
function wrapModel(src, fallbackColor) {
  const outer = new THREE.Group(); const inner = new THREE.Group(); outer.add(inner);
  if (src) { prep(src); src.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; }); inner.add(src); }
  else { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.2, 4, 8), std(fallbackColor)); c.position.y = 0.85; c.castShadow = true; inner.add(c); }
  scene.add(outer); return { outer, inner };
}
// ---------- animation: weight-blended locomotion + one-shot clips with crossfades ----------
class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root); this.a = {}; this.w = {}; this.tw = {};
    for (const c of clips || []) { const act = this.mixer.clipAction(c); act.play(); act.setEffectiveWeight(0); this.a[c.name] = act; this.w[c.name] = 0; this.tw[c.name] = 0; }
    this.ok = !!this.a.idle; this.phase = 0; this.once = null; this.loopOverride = null; this.fade = 0.22;
  }
  has(n) { return !!this.a[n]; }
  playOnce(n, speed = 1) {
    if (!this.a[n]) return 0; const act = this.a[n]; act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.timeScale = speed; act.play();
    this.once = { n, end: act.getClip().duration / speed }; this.onceT = 0; return this.once.end;
  }
  setOverride(n) { this.loopOverride = n && this.a[n] ? n : null; }
  update(dt, speed, carry) {
    if (!this.ok) return;
    for (const k in this.tw) this.tw[k] = 0;
    if (this.once) { this.onceT += dt; this.tw[this.once.n] = 1; if (this.onceT >= this.once.end - this.fade * 0.5) this.once = null; }
    else if (this.loopOverride) this.tw[this.loopOverride] = 1;
    else {
      // locomotion blend: idle -> walk (1.6 m/s) -> run (3.6 m/s); feet stay in phase across walk/run
      const sfx = carry && this.a.walk_carry ? '_carry' : '';
      const walkW = THREE.MathUtils.clamp(speed / 1.6, 0, 1), runW = THREE.MathUtils.clamp((speed - 1.6) / 1.8, 0, 1);
      this.tw['idle' + sfx] = 1 - walkW; this.tw['walk' + sfx] = walkW * (1 - runW); this.tw['run' + sfx] = walkW * runW;
      const cycleLen = THREE.MathUtils.lerp(1.6, 2.6, runW); // metres per gait cycle
      if (speed > 0.05) this.phase = (this.phase + dt * speed / cycleLen) % 1;
      for (const n of ['walk', 'run', 'walk_carry', 'run_carry']) if (this.a[n]) { this.a[n].time = this.phase * this.a[n].getClip().duration; this.a[n].timeScale = 0; }
    }
    const k = Math.min(1, dt / this.fade);
    let tot = 0;
    for (const n in this.a) { this.w[n] += ((this.tw[n] || 0) - this.w[n]) * k; tot += this.w[n]; }
    for (const n in this.a) this.a[n].setEffectiveWeight(tot > 0 ? this.w[n] / Math.max(1, tot) : 0);
    this.mixer.update(dt);
  }
}
// waiter (player)
const waiter = wrapModel(waiterSrc, 0x222222);
waiter.outer.position.set(-3.5, 0, 2.5);
const waiterAnim = new Animator(waiterSrc || waiter.inner, waiterG && waiterG.animations);
const handBone = waiterSrc && (waiterSrc.getObjectByName('handR') || waiterSrc.getObjectByName('hand.R'));
const handTray = trayModel.clone(); handTray.visible = false; scene.add(handTray);
const _hp = new THREE.Vector3(), _hq = new THREE.Vector3();
function placeHandTray() {
  if (handBone && waiterAnim.ok) {
    handBone.getWorldPosition(_hp);
    // palm is ~8cm along the hand bone; tray stays level and turns with the waiter
    const tip = handBone.children[0]; if (tip) { tip.getWorldPosition(_hq); _hp.lerp(_hq, 0.5); }
    handTray.position.set(_hp.x, _hp.y - 0.02, _hp.z);
  } else {
    const o = waiter.outer; _hp.set(0.12, 1.08 + waiter.inner.position.y, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y).add(o.position); handTray.position.copy(_hp);
  }
  handTray.rotation.y = waiter.outer.rotation.y;
}
function waiterModelVisible(v) { waiter.inner.children.forEach(ch => { if (ch !== handTray) ch.visible = v; }); }
const W = { pos: waiter.outer.position, target: null, action: null, speed: 2.0, yaw: 0, walkT: 0, moving: false, tray: 0, busy: 0, lock: 0, curSpeed: 0, pending: null };
// owner NPC behind counter
const owner = wrapModel(ownerSrc, 0x555555);
const ownerAnim = new Animator(ownerSrc || owner.inner, ownerG && ownerG.animations);
owner.outer.position.set(SAMOVAR_POS.x - 0.95, 0, SAMOVAR_POS.z + 0.15); owner.outer.rotation.y = Math.PI / 2;

// ---------- customers (low-poly placeholder people) ----------
const SKIN = [0xe6b996, 0xd9a47c, 0xc68a62, 0xf0c8a8];
const SHIRT = [0x2f5d8a, 0x8a2f2f, 0x4f6b3a, 0xc9a64a, 0x6b4f8a, 0x8a6a4f, 0x3a7a7a, 0xd8d0c0];
const PANTS = [0x2a2a33, 0x4a3a2a, 0x3a4a5a, 0x555555];
const sharedGeo = {
  torso: new THREE.CapsuleGeometry(0.19, 0.4, 3, 8), head: new THREE.SphereGeometry(0.13, 12, 10),
  thigh: new THREE.BoxGeometry(0.13, 0.42, 0.14), shin: new THREE.BoxGeometry(0.12, 0.44, 0.13),
  arm: new THREE.CapsuleGeometry(0.055, 0.42, 2, 6), hair: new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  fez: new THREE.CylinderGeometry(0.08, 0.1, 0.14, 10), scarf: new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
};
function makePerson(rnd) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const skin = std(pick(SKIN)), shirt = std(pick(SHIRT)), pants = std(pick(PANTS));
  const torso = new THREE.Mesh(sharedGeo.torso, shirt); torso.position.y = 1.13; body.add(torso);
  const head = new THREE.Mesh(sharedGeo.head, skin); head.position.y = 1.57; body.add(head);
  const style = rnd();
  if (style < 0.35) { const s = new THREE.Mesh(sharedGeo.scarf, std(pick([0x9b2d4a, 0x2d5a9b, 0xd9b44a, 0x6a8a3a]))); s.position.y = 1.555; s.rotation.x = -0.35; body.add(s); }
  else if (style < 0.5) { const f = new THREE.Mesh(sharedGeo.fez, std(0xa3191a)); f.position.y = 1.72; body.add(f); }
  else { const h = new THREE.Mesh(sharedGeo.hair, std(pick([0x1e1510, 0x3a2a1a, 0x777777, 0xbbbbbb]))); h.position.y = 1.585; h.rotation.x = -0.25; body.add(h); }
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.09, 0.88, 0); body.add(hip);
    const th = new THREE.Mesh(sharedGeo.thigh, pants); th.position.y = -0.21; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const sh = new THREE.Mesh(sharedGeo.shin, pants); sh.position.y = -0.22; knee.add(sh);
    legs.push({ hip, knee });
    const sho = new THREE.Group(); sho.position.set(s * 0.26, 1.38, 0); body.add(sho);
    const a = new THREE.Mesh(sharedGeo.arm, shirt); a.position.y = -0.24; sho.add(a); arms.push(sho);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const sc = 0.92 + rnd() * 0.12; g.scale.setScalar(sc);
  scene.add(g); return { group: g, body, legs, arms };
}

const customers = [];
let rng = mulberry(Date.now() & 0xffff);
function spawnCustomer() {
  const free = tables.filter(t => !t.customer);
  if (!free.length) return;
  const t = free[Math.floor(rng() * free.length)];
  const seat = t.seats[Math.floor(rng() * 2)];
  const p = makePerson(rng);
  p.group.position.copy(ENTRANCE);
  const c = { ...p, table: t, seat, state: 'walkIn', patience: 0, maxPatience: Math.max(14, 26 - stats.served * 0.4), walkT: 0, path: [new THREE.Vector3(5.6, 0, 5.4), seat.pos.clone().add(new THREE.Vector3(Math.sign(seat.pos.x - t.pos.x) * 0.45, 0, 0))], bubble: null, drinkT: 0 };
  t.customer = c; customers.push(c);
}
function makeBubble(c) {
  const el = document.createElement('div'); el.className = 'bubble'; el.innerHTML = '🍵<div class="bar"><i></i></div>';
  document.getElementById('bubbles').appendChild(el); c.bubble = el; c.bar = el.querySelector('i');
}
function removeBubble(c) { if (c.bubble) { c.bubble.remove(); c.bubble = null; } }

// ---------- UI ----------
const stats = { money: 0, served: 0, angry: 0 };
const $ = id => document.getElementById(id);
function updateHud() {
  $('moneyVal').textContent = stats.money; $('happyVal').textContent = stats.served; $('angryVal').textContent = stats.angry;
  $('trayVal').textContent = W.tray; $('trayHud').classList.toggle('hidden', W.tray <= 0);
}
let toastTimer;
function toast(msg, color = 'rgba(160,40,20,.92)') {
  const t = $('toast'); t.textContent = msg; t.style.background = color; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}
function floatText(worldPos, text) {
  const v = worldPos.clone().project(camera); if (v.z > 1) return;
  const el = document.createElement('div'); el.className = 'float'; el.textContent = text;
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  $('bubbles').appendChild(el); setTimeout(() => el.remove(), 1300);
}

// tap marker
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.position.y = 0.02; scene.add(marker);

// ---------- input ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// camera modes: 'top' (overview, tap-to-walk), 'third' (follow), 'first' (eyes)
const CAM_MODES = ['third', 'first', 'top'];
const CAM_LABEL = { top: '🎥 Üstten', third: '🎥 3. Şahıs', first: '🎥 1. Şahıs' };
let camMode = 'third', viewYaw = Math.PI, viewPitch = -0.18;
const PITCH_MIN = -0.75, PITCH_MAX = 0.5;
const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
const joyBase = document.getElementById('joyBase'), joyKnob = document.getElementById('joyKnob');
const JOY_R = 55;
const pointers = new Map();
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture?.(e.pointerId);
  const role = camMode === 'top' ? 'tap' : (e.clientX < innerWidth * 0.45 ? 'joy' : 'look');
  pointers.set(e.pointerId, { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), role, moved: 0 });
  if (role === 'joy' && joy.id === null) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px'; joyBase.classList.add('active');
    joyKnob.style.transform = 'translate(-50%,-50%)';
  }
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.lx, dy = e.clientY - p.ly; p.lx = e.clientX; p.ly = e.clientY;
  p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.sx, e.clientY - p.sy));
  if (p.role === 'joy' && joy.id === e.pointerId) {
    let jx = e.clientX - joy.ox, jy = e.clientY - joy.oy; const l = Math.hypot(jx, jy);
    if (l > JOY_R) { jx *= JOY_R / l; jy *= JOY_R / l; }
    joy.x = jx / JOY_R; joy.y = jy / JOY_R;
    joyKnob.style.transform = `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px))`;
  } else if (p.role === 'look') {
    // sensitivity relative to screen size: a full-width swipe turns ~200°
    viewYaw -= dx / innerWidth * 3.5; viewPitch = THREE.MathUtils.clamp(viewPitch - dy / innerHeight * 1.8, PITCH_MIN, PITCH_MAX);
  }
});
function endPointer(e, cancelled) {
  const p = pointers.get(e.pointerId); if (!p) return; pointers.delete(e.pointerId);
  if (joy.id === e.pointerId) { joy.id = null; joy.x = joy.y = 0; joyBase.classList.remove('active'); }
  if (!cancelled && started && !gameOver && p.moved < 18 && performance.now() - p.t0 < 450) handleTap(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', e => endPointer(e, false));
canvas.addEventListener('pointercancel', e => endPointer(e, true));
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'c') cycleCam(); });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function cycleCam() { camMode = CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % 3]; applyCamMode(); }
function applyCamMode() {
  document.getElementById('camBtn').textContent = CAM_LABEL[camMode];
  document.getElementById('joyHint').classList.toggle('hidden', camMode === 'top');
  document.getElementById('hint').textContent = camMode === 'top'
    ? 'Yere dokun: yürü · Semavere dokun: çay al · Masaya dokun: servis et'
    : 'Sol: joystick ile yürü · Sağ: sürükle, etrafa bak · Yaklaşınca otomatik çay al / servis et';
  if (camMode !== 'top') { viewPitch = camMode === 'first' ? -0.15 : -0.18; }
  document.getElementById('lookHint').classList.toggle('hidden', camMode === 'top');
  camera.fov = camMode === 'top' ? 38 : camMode === 'third' ? 60 : 70; camera.near = camMode === 'top' ? 0.5 : 0.08; camera.updateProjectionMatrix();
  if (camMode === 'top') resize();
  waiterModelVisible(camMode !== 'first');
  updateCamera(0, true);
}
document.getElementById('camBtn').addEventListener('click', e => { e.stopPropagation(); cycleCam(); });
const hitTargets = [samovarHit, ...tables.map(t => t.hit)];
function handleTap(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(hitTargets, false);
  if (hits.length) {
    const o = hits[0].object;
    if (o.userData.samovar) { goTo(SAMOVAR_SERVE.clone(), { type: 'samovar' }); flashMarker(SAMOVAR_SERVE); return; }
    if (o.userData.table !== undefined) {
      const t = tables[o.userData.table];
      // approach point: in front of table (camera side) or nearest free side
      const dir = W.pos.clone().sub(t.pos); dir.y = 0;
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize(); if (Math.abs(dir.x) > 0.7) dir.set(0, 0, Math.sign(dir.z || 1)).normalize();
      const p = t.pos.clone().addScaledVector(dir, 0.95);
      goTo(p, { type: 'table', table: t }); flashMarker(p); return;
    }
  }
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(groundPlane, p)) { clampGarden(p); goTo(p, null); flashMarker(p); }
}
function clampGarden(p) { p.x = THREE.MathUtils.clamp(p.x, GARDEN.minX, GARDEN.maxX); p.z = THREE.MathUtils.clamp(p.z, GARDEN.minZ, GARDEN.maxZ); return p; }
function goTo(p, action) { if (W.busy > 0 || W.lock > 0) return; W.target = p; W.action = action; }
function flashMarker(p) { marker.position.x = p.x; marker.position.z = p.z; marker.material.opacity = 1; marker.scale.setScalar(1); }

// ---------- obstacles ----------
function pushOut(p, radius, ignoreTable) {
  for (const t of tables) {
    if (t === ignoreTable) continue;
    const dx = p.x - t.pos.x, dz = p.z - t.pos.z, d = Math.hypot(dx, dz), r = 0.75 + radius;
    if (d < r && d > 1e-4) { p.x = t.pos.x + dx / d * r; p.z = t.pos.z + dz / d * r; }
  }
  // counter box
  const cx0 = SAMOVAR_POS.x - 0.55 - radius, cx1 = SAMOVAR_POS.x + 0.55 + radius, cz0 = SAMOVAR_POS.z - 1.15 - radius, cz1 = SAMOVAR_POS.z + 1.15 + radius;
  if (p.x > cx0 && p.x < cx1 && p.z > cz0 && p.z < cz1) {
    const opts = [[p.x - cx0, 'x', cx0], [cx1 - p.x, 'x', cx1], [p.z - cz0, 'z', cz0], [cz1 - p.z, 'z', cz1]].sort((a, b) => a[0] - b[0]);
    p[opts[0][1]] = opts[0][2];
  }
}

// ---------- game logic ----------
let started = false, gameOver = false, spawnTimer = 2, elapsed = 0;
function arrive() {
  const a = W.action; W.action = null; if (!a) return;
  if (a.type === 'samovar') {
    if (camMode !== 'first') W.yaw = -Math.PI / 2;
    startBrew(false);
  } else if (a.type === 'table') {
    const t = a.table;
    if (camMode !== 'first') W.yaw = Math.atan2(t.pos.x - W.pos.x, t.pos.z - W.pos.z);
    serveTable(t, false);
  }
}
function startBrew(auto) {
  if (W.busy > 0) return;
  if (W.tray >= 3) { if (!auto) toast('Tepsi zaten dolu!'); return; }
  W.target = null; W.action = null; W.yaw = Math.atan2(SAMOVAR_POS.x - W.pos.x, SAMOVAR_POS.z - W.pos.z);
  W.busy = 2.6; W.brewT = 0; W.picked = false; ownerAnim.setOverride('pour'); toast('Çay dolduruluyor…', 'rgba(120,70,20,.92)');
}
function serveTable(t, auto) {
  const c = t.customer;
  {
    if (!c || c.state !== 'waiting') { if (!auto && c && c.state === 'drinking') toast('Afiyet olsun!', 'rgba(40,110,50,.92)'); return; }
    if (W.tray <= 0) { if (!auto) toast('Önce semaverden çay al!'); else if (!t.warned) { t.warned = true; toast('Önce semaverden çay al!'); } return; }
    W.tray--; c.state = 'drinking'; c.drinkT = 7 + rng() * 3; removeBubble(c);
    W.target = null; W.action = null; W.yaw = Math.atan2(t.pos.x - W.pos.x, t.pos.z - W.pos.z);
    const dur = waiterAnim.playOnce('serve', 1.15); W.lock = dur ? dur * 0.85 : 0;
    setTimeout(() => { if (c.state === 'drinking') t.glass.visible = true; }, dur ? dur * 500 : 0);
    const left = 1 - c.patience / c.maxPatience; const tip = Math.round(left * 5);
    const earned = 5 + tip; stats.money += earned; stats.served++;
    floatText(t.pos.clone().setY(1.6), `+${earned} ₺`);
    toast(tip >= 3 ? 'Eline sağlık! 😊' : 'Teşekkürler!', 'rgba(40,110,50,.92)');
    updateHud();
  }
}
function finishBrew() { if (W.tray < 3) { W.tray = 3; updateHud(); } toast('Çay hazır! 🍵', 'rgba(40,110,50,.92)'); }

function updateWaiter(dt) {
  if (W.busy > 0) {
    W.busy -= dt; W.brewT += dt;
    if (W.brewT > 1.4 && !W.picked) { W.picked = true; ownerAnim.setOverride(null); W.pickDur = waiterAnim.playOnce('pickup', 1.0); }
    if (W.picked && W.tray < 3 && W.brewT > 1.4 + (W.pickDur || 0) * 0.45) { W.tray = 3; updateHud(); }
    if (W.busy <= 0) finishBrew();
  }
  if (W.lock > 0) W.lock -= dt;
  const blocked = W.busy > 0 || W.lock > 0;
  W.moving = false; const prevPos = W.pos.clone();
  if (W.target && !blocked) {
    const d = W.target.clone().sub(W.pos); d.y = 0; const dist = d.length();
    if (dist < 0.08) { W.target = null; arrive(); }
    else {
      const step = Math.min(dist, W.speed * dt); d.normalize();
      W.pos.addScaledVector(d, step); pushOut(W.pos, 0.25, null);
      W.yaw = Math.atan2(d.x, d.z); W.moving = true;
      // stuck guard: if pushed back and not progressing, give up once close enough
      if (dist < 0.5 && W.pos.distanceTo(W.target) > dist - step * 0.2) { W.target = null; arrive(); }
    }
  }
  // joystick / keyboard movement (3rd & 1st person)
  if (camMode !== 'top' && !blocked) {
    let mx = joy.x, my = joy.y;
    if (keys['w'] || keys['arrowup']) my = -1; if (keys['s'] || keys['arrowdown']) my = 1;
    if (keys['a'] || keys['arrowleft']) mx = -1; if (keys['d'] || keys['arrowright']) mx = 1;
    if (keys['shift']) { const l = Math.hypot(mx, my) || 1; mx /= l; my /= l; } else if (Object.keys(keys).some(k => keys[k] && 'wasd'.includes(k))) { mx *= 0.45; my *= 0.45; }
    const raw = Math.min(1, Math.hypot(mx, my));
    // dead zone + response curve: small push = walk, full push = run
    const m = raw < 0.15 ? 0 : (raw - 0.15) / 0.85;
    const wantSpeed = m < 0.6 ? THREE.MathUtils.lerp(0.4, 1.6, m / 0.6) : THREE.MathUtils.lerp(1.6, 3.6, (m - 0.6) / 0.4);
    if (m > 0) {
      W.target = null; W.action = null;
      const f = new THREE.Vector3(Math.sin(viewYaw), 0, Math.cos(viewYaw)), r = new THREE.Vector3(-Math.cos(viewYaw), 0, Math.sin(viewYaw));
      const d = f.multiplyScalar(-my).addScaledVector(r, mx); d.normalize();
      W.stickSpeed = THREE.MathUtils.lerp(W.stickSpeed || 0, wantSpeed, Math.min(1, dt * 6));
      W.pos.addScaledVector(d, W.stickSpeed * dt); pushOut(W.pos, 0.25, null); clampGarden(W.pos);
      if (camMode === 'third') W.yaw = Math.atan2(d.x, d.z);
      W.moving = true;
    } else W.stickSpeed = 0;
  }
  if (camMode === 'first') W.yaw = viewYaw;
  // auto pick-up / serve when close (follow cameras)
  if (camMode !== 'top' && !blocked) {
    if (W.pos.distanceTo(SAMOVAR_SERVE) < 1.0 && W.tray < 3) startBrew(true);
    for (const t of tables) {
      const d = Math.hypot(W.pos.x - t.pos.x, W.pos.z - t.pos.z);
      if (d < 1.45) serveTable(t, true); else t.warned = false;
    }
  }
  handTray.visible = W.tray > 0;
  const o = waiter.outer, i = waiter.inner;
  // smooth turn toward movement direction (critically damped feel)
  o.rotation.y = lerpAngle(o.rotation.y, W.yaw, 1 - Math.exp(-dt * (camMode === 'first' ? 30 : 10)));
  const actual = W.pos.distanceTo(prevPos) / Math.max(dt, 1e-4);
  W.curSpeed = THREE.MathUtils.lerp(W.curSpeed, W.moving ? actual : 0, 1 - Math.exp(-dt * 10));
  if (waiterAnim.ok) { waiterAnim.update(dt, W.curSpeed, W.tray > 0); placeHandTray(); return; }
  placeHandTray();
  // fallback fake walk: bob + sway + lean
  if (W.moving) W.walkT += dt * 9; else W.walkT = 0;
  const amt = W.moving ? 1 : 0;
  i.position.y = Math.abs(Math.sin(W.walkT)) * 0.045 * amt;
  i.rotation.z = Math.sin(W.walkT) * 0.045 * amt;
  i.rotation.x = THREE.MathUtils.lerp(i.rotation.x, 0.07 * amt, dt * 8);
  if (!W.moving) i.scale.y = 1 + Math.sin(elapsed * 2) * 0.004;
}
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

function poseStand(c, t) {
  const s = Math.sin(t);
  c.legs[0].hip.rotation.x = s * 0.5; c.legs[1].hip.rotation.x = -s * 0.5;
  c.legs[0].knee.rotation.x = Math.max(0, -s) * 0.6; c.legs[1].knee.rotation.x = Math.max(0, s) * 0.6;
  c.arms[0].rotation.x = -s * 0.4; c.arms[1].rotation.x = s * 0.4; c.body.position.y = Math.abs(Math.cos(t)) * 0.03;
}
function poseSit(c) {
  for (const l of c.legs) { l.hip.rotation.x = -Math.PI / 2; l.knee.rotation.x = Math.PI / 2; }
  c.arms[0].rotation.x = -0.5; c.arms[1].rotation.x = -0.5; c.body.position.y = -0.4;
}
function updateCustomers(dt) {
  for (let k = customers.length - 1; k >= 0; k--) {
    const c = customers[k], g = c.group;
    if (c.state === 'walkIn' || c.state === 'leaving') {
      const tgt = c.path[0];
      const d = tgt.clone().sub(g.position); d.y = 0; const dist = d.length();
      if (dist < 0.06) {
        c.path.shift();
        if (!c.path.length) {
          if (c.state === 'walkIn') { c.state = 'waiting'; g.position.copy(c.seat.pos); g.rotation.y = c.seat.faceY; poseSit(c); makeBubble(c); }
          else { scene.remove(g); customers.splice(k, 1); continue; }
        }
      } else {
        d.normalize(); g.position.addScaledVector(d, Math.min(dist, 1.5 * dt));
        if (c.path.length > 1 || c.state === 'leaving') pushOut(g.position, 0.2, c.state === 'leaving' ? c.table : null);
        g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(d.x, d.z), Math.min(1, dt * 10));
        c.walkT += dt * 8; poseStand(c, c.walkT);
      }
    } else if (c.state === 'waiting') {
      c.patience += dt; const f = 1 - c.patience / c.maxPatience;
      c.bar.style.width = (f * 100) + '%'; c.bar.style.background = f > 0.5 ? '#3cb043' : f > 0.25 ? '#e0a020' : '#d0302a';
      c.bubble.firstChild.textContent = f > 0.25 ? '🍵' : '😤';
      if (f <= 0) { leave(c, true); }
    } else if (c.state === 'drinking') {
      c.drinkT -= dt; c.arms[1].rotation.x = -0.9 + Math.sin(elapsed * 1.5) * 0.25;
      if (c.drinkT <= 0) leave(c, false);
    }
    if (c.bubble) {
      const v = g.position.clone().setY(camMode === 'top' ? 2.0 : 1.75).project(camera);
      c.bubble.style.display = v.z > 1 ? 'none' : '';
      c.bubble.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; c.bubble.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
    }
  }
}
function leave(c, angry) {
  removeBubble(c); c.state = 'leaving'; c.table.glass.visible = false;
  const t = c.table; t.customer = null;
  g_standUp(c);
  c.path = [c.seat.pos.clone().add(new THREE.Vector3(Math.sign(c.seat.pos.x - t.pos.x) * 0.5, 0, 0.5)), new THREE.Vector3(5.6, 0, 5.4), ENTRANCE.clone().add(new THREE.Vector3(1.5, 0, 0))];
  if (angry) {
    stats.angry++; floatText(c.group.position.clone().setY(2), '😠'); toast('Müşteri kızıp gitti!'); updateHud();
    if (stats.angry >= 5) endGame();
  }
}
function g_standUp(c) { c.body.position.y = 0; for (const l of c.legs) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; } }
function endGame() {
  gameOver = true;
  const ov = $('overlay'); ov.classList.remove('hidden'); ov.style.display = 'flex';
  ov.querySelector('.card').innerHTML = `<h1>Gün Bitti</h1><p class="sub">Çok müşteri kaçırdın!</p>
    <p style="font-size:20px">🪙 Kazanılan Para: <b>${stats.money} ₺</b><br>😊 Memnun müşteri: <b>${stats.served}</b></p>
    <button id="againBtn" style="font-size:22px;padding:12px 36px;border:0;border-radius:999px;background:#b3261e;color:#fff;font-weight:700">Tekrar Oyna</button>`;
  $('againBtn').onclick = () => location.reload();
}

// ---------- camera fit ----------
const camDir = new THREE.Vector3();
function setElev(d) { const r = THREE.MathUtils.degToRad(d); camDir.set(0, Math.sin(r), Math.cos(r)); }
let viewW = 14, camTarget = new THREE.Vector3(0, 0, -0.2), camDist = 20;
const FIT_PTS = [[-7.9, 0, -6.4], [7.9, 0, -6.4], [-7.9, 0, 7.5], [7.9, 0, 7.5], [-7.2, 2.3, 0.3], [-7.2, 2.3, 2.9], [-7.9, 0.8, 7.5], [7.9, 0.8, 7.5]].map(p => new THREE.Vector3(...p));
let fitTz = -0.2;
function fitOverview() { // landscape: smallest distance that frames the whole garden incl. samovar counter, leaving room for the HUD
  const c = camera.clone(); c.fov = 38; c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
  const t = new THREE.Vector3(), v = new THREE.Vector3(); let best = null;
  for (let tz = -1.5; tz <= 2.0; tz += 0.1) {
    let lo = 8, hi = 70;
    for (let it = 0; it < 22; it++) {
      const d = (lo + hi) / 2; t.set(0, 0, tz); c.position.copy(t).addScaledVector(camDir, d); c.lookAt(t); c.updateMatrixWorld();
      let ok = true; for (const p of FIT_PTS) { v.copy(p).project(c); if (Math.abs(v.x) > 0.97 || v.y < -0.93 || v.y > 0.80) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    if (!best || hi < best[0]) best = [hi, tz];
  }
  camDist = best[0]; fitTz = best[1];
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); setElev(w < h ? 58 : 42);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  document.getElementById('rotate').classList.toggle('show', isMobile && h > w);
  const vf = THREE.MathUtils.degToRad(camera.fov / 2); const hf = Math.atan(Math.tan(vf) * camera.aspect);
  viewW = camera.aspect < 1 ? 12.0 : 15.5; // portrait: follow cam with narrower view
  const dW = (viewW / 2) / Math.tan(hf), dH = 7.8 / Math.tan(vf);
  camDist = camera.aspect < 1 ? dW : Math.max(dW, dH * 0.8);
  camDist = Math.max(camDist, 13);
  if (camera.aspect >= 1) { const f0 = camera.fov; fitOverview(); }
}
addEventListener('resize', resize); resize();
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(), _pivotWant = new THREE.Vector3();
const camPivot = new THREE.Vector3(), camRay = new THREE.Raycaster(); const OTS_DIST = 2.6; let camCurDist = OTS_DIST;
const camColliders = []; scene.traverse(o => { if (o.isMesh && o.userData.camBlock) camColliders.push(o); });
function updateCamera(dt, snap) {
  if (camMode !== 'top') {
    const f = _v.set(Math.sin(viewYaw) * Math.cos(viewPitch), Math.sin(viewPitch), Math.cos(viewYaw) * Math.cos(viewPitch));
    if (camMode === 'third') {
      // over-the-shoulder: damped pivot, right-shoulder offset, collision pull-in, look along aim direction
      const right = _r.set(-Math.cos(viewYaw), 0, Math.sin(viewYaw));
      _pivotWant.set(W.pos.x, 1.55, W.pos.z);
      if (snap) camPivot.copy(_pivotWant); else camPivot.lerp(_pivotWant, 1 - Math.exp(-dt * 14));
      const shoulder = _s.copy(camPivot).addScaledVector(right, 0.42);
      const want = _w.copy(shoulder).addScaledVector(f, -OTS_DIST).add(_up.set(0, 0.12, 0));
      const dir = _d.copy(want).sub(shoulder); const len = dir.length(); dir.normalize();
      camRay.set(shoulder, dir); camRay.far = len + 0.25;
      const hit = camRay.intersectObjects(camColliders, false)[0];
      let dist = len; if (hit) dist = Math.max(0.35, hit.distance - 0.25);
      // pull in instantly on collision, ease back out
      camCurDist = snap ? dist : (dist < camCurDist ? dist : THREE.MathUtils.lerp(camCurDist, dist, 1 - Math.exp(-dt * 4)));
      const target = _w.copy(shoulder).addScaledVector(dir, camCurDist); target.y = Math.max(target.y, 0.35);
      if (snap) camera.position.copy(target); else camera.position.lerp(target, 1 - Math.exp(-dt * 20));
      camera.lookAt(camera.position.x + f.x, camera.position.y + f.y, camera.position.z + f.z);
      // fade the waiter out when the camera gets very close (no clipping through the body)
      waiterModelVisible(camCurDist > 0.8);
    } else {
      const eye = W.pos.clone().add(new THREE.Vector3(0, 1.66 + waiter.inner.position.y, 0)).addScaledVector(new THREE.Vector3(f.x, 0, f.z).normalize(), 0.12);
      camera.position.copy(eye); camera.lookAt(eye.x + f.x, eye.y + f.y, eye.z + f.z);
    }
    camTarget.set(W.pos.x, 0, W.pos.z);
    sun.target.position.copy(camTarget); sun.position.copy(camTarget).add(new THREE.Vector3(-7, 16, 6));
    return;
  }
  const portrait = camera.aspect < 1;
  const tx = portrait ? THREE.MathUtils.clamp(W.pos.x * 0.6, -2.4, 2.4) : 0;
  const tz = portrait ? THREE.MathUtils.clamp(W.pos.z * 0.2 - 0.6, -1.2, 0.3) : fitTz;
  const k = snap ? 1 : Math.min(1, dt * 2.5);
  camTarget.x += (tx - camTarget.x) * k; camTarget.z += (tz - camTarget.z) * k;
  camera.position.copy(camTarget).addScaledVector(camDir, camDist); camera.lookAt(camTarget);
  sun.target.position.copy(camTarget); sun.position.copy(camTarget).add(new THREE.Vector3(-7, 16, 6));
}
updateCamera(0, true);

// ---------- start ----------
$('loading').classList.add('hidden'); $('startBtn').classList.remove('hidden');
$('startBtn').onclick = () => {
  started = true; $('overlay').style.display = 'none'; spawnTimer = 1.5; updateHud();
  if (isMobile) {
    const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
    try { const p = rq && rq.call(el, { navigationUI: 'hide' }); Promise.resolve(p).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch (e) {}
  }
  setTimeout(() => $('hint').classList.add('fade'), 9000);
};
applyCamMode();
if (new URLSearchParams(location.search).has('autostart')) $('startBtn').onclick();
window.__game = { W, customers, tables, stats, spawnCustomer, handTray, seatAll: () => customers.forEach(c => { if (c.state === 'walkIn') { c.path = [c.path[c.path.length - 1]]; c.group.position.copy(c.path[0]); } }), tap: handleTap, cycleCam, joy, waiterAnim, ownerAnim, setView: (y, p) => { viewYaw = y; viewPitch = p; }, startBrew, serveTable, get camMode() { return camMode; }, tapWorld: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); handleTap((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight); } };

// ---------- loop ----------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsT0 = performance.now();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!window.__paused) tick(dt);
  renderer.render(scene, camera);
  fpsN++; const nowT = performance.now(); if (nowT - fpsT0 > 1000) { window.__fps = Math.round(fpsN * 1000 / (nowT - fpsT0)); fpsT0 = nowT; fpsN = 0; }
  requestAnimationFrame(loop);
}
window.__advance = (sec) => { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); renderer.render(scene, camera); };
function tick(dt) {
  elapsed += dt;
  seaUniforms.uTime.value = elapsed;
  ferry.position.x += dt * 1.2; if (ferry.position.x > 45) ferry.position.x = -45;
  ferry.position.y = -0.4 + Math.sin(elapsed * 1.3) * 0.04;
  if (started && !gameOver) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnCustomer(); spawnTimer = Math.max(3.5, 9 - stats.served * 0.25) + rng() * 3; }
    updateWaiter(dt); updateCustomers(dt);
  }
  // owner idle: breathe + look at waiter
  if (ownerAnim.ok) ownerAnim.update(dt, 0, false); else owner.inner.scale.y = 1 + Math.sin(elapsed * 1.6) * 0.005;
  const look = Math.atan2(W.pos.x - owner.outer.position.x, W.pos.z - owner.outer.position.z);
  owner.outer.rotation.y = lerpAngle(owner.outer.rotation.y, W.busy > 0 ? Math.PI / 2 : THREE.MathUtils.clamp(look, 0.6, 2.5), dt * 3);
  if (W.busy > 0 && !ownerAnim.ok) owner.inner.rotation.x = Math.sin(elapsed * 6) * 0.03;
  if (marker.material.opacity > 0) { marker.material.opacity -= dt * 1.5; marker.scale.multiplyScalar(1 + dt * 0.8); }
  updateCamera(dt, false);
}
loop();
