import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// ---------- customer models (swap in Meshy rigged GLBs here; eyes = [x, y] of the eye centres in model space, metres) ----------
const CUSTOMER_MODELS = [
  { url: 'cust_young', label: 'genç', scale: [0.93, 1.03], eyes: [[-0.035, 1.764], [0.035, 1.764]], skin: 0xc28c72, clothBelowY: 1.6, fez: 0.3 },
  { url: 'cust_old', label: 'yaşlı', scale: [0.93, 1.0], eyes: [[-0.0425, 1.7675], [0.045, 1.7675]], skin: 0xb58068, clothBelowY: 1.6, fez: 0 },
  // Meshy customers from the 17 Oct transfer (own clothing -> no tint); weight = relative spawn frequency
  { url: 'cust_hijab', label: 'başörtülü kadın', scale: [0.88, 0.93], eyes: [[-0.03, 1.72], [0.035, 1.72]], skin: 0xe0b8a8, tint: false, fez: 0, weight: 1.5 },
  { url: 'cust_elder', label: 'gözlüklü amca', scale: [0.94, 0.98], eyes: [[-0.0375, 1.72], [0.04, 1.72]], skin: 0xd8b8a8, tint: false, fez: 0, weight: 1.5 },
  { url: 'cust_hoodie', label: 'kapüşonlu genç', scale: [0.96, 1.01], eyes: [[-0.035, 1.715], [0.0325, 1.715]], skin: 0xd0a088, tint: false, fez: 0, weight: 1.5 },
  { url: 'cust_tourist', label: 'turist', scale: [0.9, 0.95], eyes: [[-0.0425, 1.696], [0.04, 1.696]], skin: 0xe8c0a8, tint: false, fez: 0, weight: 1.5 },
];
const CLOTH_TINTS = [0x5b8fd9, 0xd9534f, 0x6fbf73, 0xe0b44a, 0x9b6fd1, 0x4fb8b0, 0xe58a4e, 0xcfcfcf, 0x8d6e63];

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
// ---------- persistent profile + settings (localStorage) ----------
const PROFILE = Object.assign({ money: 0, xp: 0, venue: 'bogaz' }, JSON.parse(localStorage.getItem('cay_profile') || '{}'));
const SETTINGS = Object.assign({ quality: isMobile ? 'orta' : 'yuksek', sens: 1.0 }, JSON.parse(localStorage.getItem('cay_settings') || '{}'));
const levelOf = (xp) => 1 + Math.floor(xp / 100);
const saveProfile = () => localStorage.setItem('cay_profile', JSON.stringify(PROFILE));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
const QUALITY = { dusuk: { pr: 1, shadow: 512 }, orta: { pr: 1.5, shadow: 1024 }, yuksek: { pr: 2, shadow: 2048 } };
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[SETTINGS.quality].pr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
{ // sky gradient background
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5f8fc4'); gr.addColorStop(0.35, '#9fb7cf'); gr.addColorStop(0.62, '#f3c48e'); gr.addColorStop(0.85, '#f39a5c'); gr.addColorStop(1, '#e9814a');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
scene.fog = new THREE.Fog(0xf0b88a, 40, 110);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

// lights: warm low afternoon sun from the west/south-west
const hemi = new THREE.HemisphereLight(0xb9d0ee, 0x8f6a48, 1.25); scene.add(hemi);
const SUN_DIR = new THREE.Vector3(-13, 8.5, -11).normalize(); // golden hour: low sun over the Bosphorus, shadows fall towards the garden
const sun = new THREE.DirectionalLight(0xffc28a, 3.1);
sun.position.copy(SUN_DIR).multiplyScalar(18); sun.castShadow = true;
sun.shadow.mapSize.setScalar(QUALITY[SETTINGS.quality].shadow);
const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 45;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);

// ---------- layout ----------
const GARDEN = { minX: -6.6, maxX: 6.6, minZ: -5.6, maxZ: 6.4 };
const SEA_EDGE_Z = -6.2;
const ENTRANCE = new THREE.Vector3(7.6, 0, 5.4);
const SAMOVAR_POS = new THREE.Vector3(-5.6, 0, 1.6);   // counter centre
const SAMOVAR_SERVE = new THREE.Vector3(-4.72, 0, 1.75); // waiter stands ~0.33 m from the counter edge, opposite the owner
// ---------- venues: each venue is a self-contained scene config (menu "MEKANLAR" lists them) ----------
const VENUES = [
  { id: 'bogaz', name: 'Boğaz Çay Bahçesi', desc: 'İstanbul, Boğaz kıyısı', level: 1,
    trees: [[-6.6, -4.8, 1.0], [6.7, -4.6, 0.95], [7.4, 2.8, 0.85]],           // çınar x, z, scale
    lamps: [[-7.15, -1.6], [7.15, -1.9], [-7.15, 4.9], [7.15, 3.6]],            // street lamps along the side paths
    benches: [[-4.6, 6.85, Math.PI], [1.0, 6.85, Math.PI]],                     // x, z, yaw
    pots: [-4.4, -0.9, 2.7, 5.4],                                                // geranium pots along the railing
    railing: { x0: -8.1, x1: 8.1, z: -5.95 }, awning: true, sea: true },
  { id: 'kapadokya', name: 'Kapadokya', desc: 'Peri bacaları, balonlar', level: 5, locked: true },
  { id: 'karadeniz', name: 'Karadeniz Yaylası', desc: 'Sisli yayla, çay tarlaları', level: 10, locked: true },
];
const VENUE = VENUES[0];
const PATIENCE_SCALE = 2.0; // customers wait ~2x longer than v4 (28–52 s before they get angry)
const placeholders = { trees: [], railing: [], counter: [], pots: [] };
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
  const groundMat = std(0xffffff, { map: tex });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), groundMat);
  { // 1 texture tile = 1.8 m of granite setts
    const tl = new THREE.TextureLoader(), rep = [W / 1.8, D / 1.8], an = renderer.capabilities.getMaxAnisotropy();
    const T = (f, srgb) => { const t = tl.load('./assets/tex/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = Math.min(8, an); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const col = T('paving_Color.jpg', true);
    col.onUpdate = () => { groundMat.map = col; groundMat.color.set(0xf2e6d6); groundMat.needsUpdate = true; col.onUpdate = null; };
    groundMat.map = col; groundMat.color.set(0xf2e6d6);
    groundMat.normalMap = T('paving_NormalGL.jpg'); groundMat.normalScale.set(1.1, 1.1);
    groundMat.roughnessMap = T('paving_Roughness.jpg'); groundMat.roughness = 1;
    groundMat.aoMap = T('paving_AmbientOcclusion.jpg'); groundMat.aoMapIntensity = 0.8;
  }
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
  post.castShadow = true; scene.add(post); placeholders.railing.push(post);
  for (const y of [1.0, 0.55, 0.12]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(16, y === 1.0 ? 0.07 : 0.04, y === 1.0 ? 0.09 : 0.04), mat);
    r.position.set(0, y, SEA_EDGE_Z + 0.25); r.castShadow = true; scene.add(r); placeholders.railing.push(r);
  }
}
// sea (animated shader)
const seaUniforms = { uTime: { value: 0 }, uFog: { value: new THREE.Color(0xf0b88a) }, uSun: { value: SUN_DIR.clone() },
  uNormal: { value: null }, uSkyTop: { value: new THREE.Color(0x4f7fb4) }, uSkyHor: { value: new THREE.Color(0x9db2c4) } };
{
  const wn = new THREE.TextureLoader().load('./assets/tex/waternormals.jpg'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping; seaUniforms.uNormal.value = wn;
  const geo = new THREE.PlaneGeometry(200, 90, 80, 36);
  const mat = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
      void main(){ vec4 w = modelMatrix*vec4(position,1.);
        float h = sin(w.x*0.35+uTime*0.9)*0.06 + sin(w.z*0.52-uTime*1.1+w.x*0.13)*0.05 + sin((w.x+w.z)*0.9+uTime*1.7)*0.02;
        w.y += h; vH = h; vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFog, uSun, uSkyTop, uSkyHor; uniform sampler2D uNormal; varying vec3 vW; varying float vH;
      vec3 nrm(vec2 uv){ return texture2D(uNormal, uv).xzy*2.-1.; }
      void main(){
        vec2 p = vW.xz;
        vec3 n = nrm(p*0.045+vec2(uTime*0.012,uTime*0.008)) + nrm(p*0.11-vec2(uTime*0.02,-uTime*0.013))*0.7 + nrm(p*0.31+vec2(-uTime*0.035,uTime*0.03))*0.35;
        n = normalize(vec3(n.x*0.55, 1., n.z*0.55));
        vec3 V = normalize(cameraPosition - vW); float dist = length(cameraPosition.xz - vW.xz);
        // distance flattens the normals (mip-like) so the horizon reads calm
        n = normalize(mix(n, vec3(0.,1.,0.), smoothstep(25.,90.,dist)*0.7));
        float fres = 0.02 + 0.98*pow(1.-max(dot(n,V),0.), 5.);
        vec3 Rf = reflect(-V, n);
        vec3 sky = mix(uSkyHor, uSkyTop, smoothstep(0.0, 0.45, Rf.y));
        float d = clamp((-vW.z-6.)/55.,0.,1.);
        vec3 deep = vec3(0.035,0.17,0.26), shallow = vec3(0.07,0.31,0.36);
        vec3 water = mix(shallow, deep, d) * (0.75 + 0.5*max(dot(n, uSun), 0.));
        water += vec3(0.05,0.12,0.1)*smoothstep(0.03,0.12,vH); // light through crests
        vec3 col = mix(water, sky, clamp(fres*0.85, 0., 0.62));
        col += vec3(0.25,0.12,0.03)*pow(max(dot(normalize(vec3(Rf.x,0.,Rf.z)), normalize(vec3(uSun.x,0.,uSun.z))),0.),6.)*fres; // warm sky glow toward the sun
        float spec = pow(max(dot(Rf, uSun), 0.), 380.)*7. + pow(max(dot(Rf, uSun), 0.), 40.)*0.25;
        col += vec3(1.,0.8,0.55)*spec;
        float f = smoothstep(35.,105.,dist);
        gl_FragColor = vec4(mix(col,uFog,f*0.8),1.);
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
// ferry (vapur): white two-deck Bosphorus ferry, black hull, yellow funnel with black top, windows, mast + flag, wake
const ferry = new THREE.Group();
{
  const winTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#23384a';
    for (let i = 0; i < 16; i++) g.fillRect(6 + i * 15.6, 8, 10, 14);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; })();
  const white = std(0xf4f1ea, { roughness: 0.5 }), black = std(0x1d1d1f, { roughness: 0.6 }), yellow = std(0xe0a526, { roughness: 0.45 });
  // hull: extruded side profile with raked bow and stern
  const hs = new THREE.Shape(); hs.moveTo(-9, -0.9); hs.lineTo(8.2, -0.9); hs.quadraticCurveTo(9.4, -0.3, 9.6, 0.9); hs.lineTo(-9.4, 0.9); hs.quadraticCurveTo(-9.6, -0.2, -9, -0.9);
  const hullG = new THREE.ExtrudeGeometry(hs, { depth: 3.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 8 }); hullG.translate(0, 0, -1.8);
  const hull = new THREE.Mesh(hullG, black); ferry.add(hull);
  const band = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.55, 4.25), white); band.position.y = 0.75; ferry.add(band);
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(14.5, 1.5, 3.7), [white, white, white, white, new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.5 })]);
  deck1.position.y = 1.75; ferry.add(deck1);
  const wt2 = winTex.clone(); wt2.repeat.set(0.8, 1); wt2.needsUpdate = true;
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.2, 3.3), [white, white, white, white, new THREE.MeshStandardMaterial({ map: wt2, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: wt2, roughness: 0.5 })]);
  deck2.position.set(-0.6, 3.1, 0); ferry.add(deck2);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.12, 3.9), white); roof.position.set(-0.6, 3.76, 0); ferry.add(roof);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.6), white); bridge.position.set(3.6, 4.25, 0); ferry.add(bridge);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.0, 14), yellow); funnel.position.set(-1.2, 4.75, 0); ferry.add(funnel);
  const ftop = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.45, 14), black); ftop.position.set(-1.2, 5.9, 0); ferry.add(ftop);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), white); mast.position.set(5.6, 5.0, 0); ferry.add(mast);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0xd3141c, side: THREE.DoubleSide })); flag.position.set(-8.9, 2.5, 0); ferry.add(flag); ferry.userData.flag = flag;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), white); pole.position.set(-9.3, 2.2, 0); ferry.add(pole);
  const rails = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 3.75), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); rails.position.y = 2.75; ferry.add(rails);
  // foam wake
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, fog: true }));
  wake.rotation.x = -Math.PI / 2; wake.position.set(-15, -0.17, 0); ferry.add(wake);
  ferry.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  ferry.position.set(-50, -0.4, -38); scene.add(ferry);
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
  g.position.set(x, 0, z); scene.add(g); placeholders.trees.push(g); return g;
}
for (const [x, z, sc] of VENUE.trees) makeTree(x, z, sc * 1.1);
// pots with geraniums near railing
{
  const potMat = std(0xb8613a, { roughness: 0.9 }), fl = std(0xd8183a, { roughness: 0.6 }), leafMat = std(0x3f6e2a, { roughness: 0.8 });
  const leafGeo = new THREE.IcosahedronGeometry(0.15, 1), flowerGeo = new THREE.IcosahedronGeometry(0.065, 1); let sharedPot = null;
  for (const x of VENUE.pots) {
    // no pot model in the transfer: terracotta lathe pot + leaf mound + geranium umbels (procedural)
    const z0 = SEA_EDGE_Z + 0.75, rnd = mulberry(Math.round(x * 31 + 5));
    const prof = [[0.0, 0], [0.17, 0], [0.2, 0.04], [0.25, 0.4], [0.28, 0.42], [0.28, 0.48], [0.24, 0.48], [0.22, 0.45], [0, 0.45]].map(([r, y]) => new THREE.Vector2(r, y));
    const p = new THREE.Mesh(sharedPot || (sharedPot = new THREE.LatheGeometry(prof, 14)), potMat); p.position.set(x, 0, z0); p.castShadow = true; p.receiveShadow = true; scene.add(p);
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(leafGeo, leafMat); const a = k / 5 * 6.28 + rnd(); l.position.set(x + Math.cos(a) * 0.13, 0.5 + rnd() * 0.06, z0 + Math.sin(a) * 0.13); l.scale.set(1, 0.55, 1); l.castShadow = true; scene.add(l); }
    for (let k = 0; k < 7; k++) { const a = rnd() * 6.28, r = rnd() * 0.2; const f = new THREE.Mesh(flowerGeo, fl); f.position.set(x + Math.cos(a) * r, 0.66 + rnd() * 0.14, z0 + Math.sin(a) * r); scene.add(f); }
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
  counter.position.copy(SAMOVAR_POS); scene.add(counter); placeholders.counter.push(box, top, tile);
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
const custBases = (await Promise.all(CUSTOMER_MODELS.map(m => loadG(m.url).then(g => g && { ...m, gltf: g })))).filter(Boolean);

// ---------- environment assets (Meshy, decimated): replace the primitive placeholders when they load ----------
const ENV = Object.fromEntries(await Promise.all(['env_tree', 'env_railing', 'env_lamp', 'env_awning', 'env_bench', 'env_bar'].map(n => load(n).then(g => [n, g]))));
const topFade = [], topHide = []; // materials made see-through in the overview camera so they don't hide the game
// one InstancedMesh per sub-mesh: N copies cost one draw call each
function instanceGLB(src, mats4, { shadow = true, block = false } = {}) {
  const out = []; src.updateMatrixWorld(true);
  src.traverse(o => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, mats4.length);
    mats4.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(o.matrixWorld)));
    im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); out.push(im);
    if (block) im.userData.camBlock = true;
  });
  return out;
}
const TRS = (x, y, z, yaw = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));
const envTris = {};
function countTris(o) { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; }
if (ENV.env_tree) { // çınar: 8 m, slight random yaw; trunk blocks the camera, canopy fades in overview
  placeholders.trees.forEach(t => t.visible = false);
  instanceGLB(ENV.env_tree, VENUE.trees.map(([x, z, s], i) => TRS(x, 0, z, i * 2.1, s)), { block: true }).forEach(im => { im.material.transparent = true; topFade.push(im.material); });
  // leaf cards: alpha-cutout plane-tree leaf clusters scattered over the canopy surface, facing outward (one InstancedMesh for all trees)
  const leafTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = mulberry(11);
    const leaf = (x, y, s, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.fillStyle = col; g.beginPath();
      for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI * 2, lobe = 0.62 + 0.38 * Math.abs(Math.cos(t * 2.5)); g.lineTo(Math.sin(t) * 20 * lobe, -Math.cos(t) * 20 * lobe); }
      g.closePath(); g.fill(); g.strokeStyle = 'rgba(20,40,10,.45)'; g.lineWidth = 1.2; g.beginPath(); for (const t of [-1.2, 0, 1.2]) { g.moveTo(0, 6); g.lineTo(Math.sin(t) * 16, -Math.cos(t) * 16); } g.stroke(); g.restore(); };
    for (let i = 0; i < 70; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 100; const L = 30 + r() * 26;
      leaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0.7 + r() * 0.6, r() * 6.28, `hsl(${88 + r() * 22},${38 + r() * 20}%,${L}%)`); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, transparent: false });
  const smp = new MeshSurfaceSampler(ENV.env_tree.getObjectByProperty('isMesh', true)).build();
  const P_ = new THREE.Vector3(), N_ = new THREE.Vector3(), pts = [];
  const tm = ENV.env_tree.getObjectByProperty('isMesh', true); ENV.env_tree.updateMatrixWorld(true);
  for (let k = 0; pts.length < 950 && k < 20000; k++) { smp.sample(P_, N_); P_.applyMatrix4(tm.matrixWorld); N_.transformDirection(tm.matrixWorld); if (P_.y > 3.1 && N_.y > -0.6) pts.push([P_.clone(), N_.clone()]); }
  const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMat, pts.length * VENUE.trees.length);
  const rr = mulberry(5), q = new THREE.Quaternion(), qr = new THREE.Quaternion(), m4 = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1); let ci = 0;
  VENUE.trees.forEach(([x, z, s], i) => { const Mt = TRS(x, 0, z, i * 2.1, s);
    for (const [p, n] of pts) { q.setFromUnitVectors(Z, n); qr.setFromAxisAngle(Z, rr() * 6.28); q.multiply(qr);
      const sz = 1.0 + rr() * 0.7; m4.compose(p.clone().addScaledVector(n, 0.12 + rr() * 0.18), q, new THREE.Vector3(sz, sz, sz)); cards.setMatrixAt(ci++, Mt.clone().multiply(m4)); } });
  cards.castShadow = true; cards.receiveShadow = true; cards.computeBoundingSphere(); scene.add(cards); topHide.push(cards);
  envTris.tree = countTris(ENV.env_tree) + pts.length * 2;
}
if (ENV.env_railing) { // 3.24 m x 1 m section, tiled along the waterfront
  placeholders.railing.forEach(r => r.visible = false);
  const box = new THREE.Box3().setFromObject(ENV.env_railing), L = box.max.x - box.min.x, R0 = VENUE.railing;
  const n = Math.ceil((R0.x1 - R0.x0) / L), ms = [];
  for (let i = 0; i < n; i++) ms.push(TRS(R0.x0 + L * (i + 0.5), 0, R0.z));
  instanceGLB(ENV.env_railing, ms, { shadow: false }); /* thin ironwork: shadow pass not worth 25k tris */ envTris.railing = countTris(ENV.env_railing) + ' ×' + n;
}
if (ENV.env_lamp) { instanceGLB(ENV.env_lamp, VENUE.lamps.map(([x, z], i) => TRS(x, 0, z, i, 0.85)), { shadow: false }); envTris.lamp = countTris(ENV.env_lamp) + ' ×' + VENUE.lamps.length; }
if (ENV.env_bench) { instanceGLB(ENV.env_bench, VENUE.benches.map(([x, z, y]) => TRS(x, 0, z, y))); envTris.bench = countTris(ENV.env_bench) + ' ×' + VENUE.benches.length; }
let counterTopY = 1.01, awningBox = null, awningMats = [];
if (ENV.env_bar) { // carved counter, long side along z, front to the garden (+x); 1 m tall
  placeholders.counter.forEach(m => m.visible = false);
  const bar = prep(ENV.env_bar); const bb = new THREE.Box3().setFromObject(bar);
  const k = 1.0 / (bb.max.y - bb.min.y); bar.scale.setScalar(k * 1.1); bar.rotation.y = Math.PI / 2;
  bar.position.set(SAMOVAR_POS.x - 0.05, 0, SAMOVAR_POS.z); scene.add(bar); bar.updateMatrixWorld(true);
  bar.traverse(o => { if (o.isMesh) o.userData.camBlock = true; });
  // find the working surface height under the samovar spot
  const rc = new THREE.Raycaster(new THREE.Vector3(SAMOVAR_POS.x, 3, SAMOVAR_POS.z - 0.4), new THREE.Vector3(0, -1, 0));
  const hit = rc.intersectObject(bar, true)[0]; if (hit && hit.point.y > 0.7 && hit.point.y < 1.3) counterTopY = hit.point.y + 0.005;
  envTris.counter = countTris(bar); window.__bar = bar;
}
if (ENV.env_awning && VENUE.awning) { // striped awning on posts, standing over the counter area
  const aw = prep(ENV.env_awning); aw.scale.set(1.2, 1.45, 1.2); aw.rotation.y = Math.PI / 2; aw.position.set(SAMOVAR_POS.x - 0.6, 0, SAMOVAR_POS.z); scene.add(aw);
  aw.updateMatrixWorld(true); awningBox = new THREE.Box3().setFromObject(aw).expandByScalar(0.35); awningMats = [];
  aw.traverse(o => { if (o.isMesh) { o.material.transparent = true; topFade.push(o.material); awningMats.push(o.material); } });
  envTris.awning = countTris(aw);
}
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
  glass.position.set(-0.28, 0.76, 0.08); glass.visible = false; g.add(glass);
  const glass2 = glass.clone(); glass2.position.set(0.28, 0.76, -0.08); g.add(glass2);
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
  tables.push({ i, group: g, pos: new THREE.Vector3(x, 0, z), seats, customer: null, party: null, glasses: [glass, glass2], hit });
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
const samovarGroup = new THREE.Group(); samovarGroup.position.set(SAMOVAR_POS.x, counterTopY, SAMOVAR_POS.z - 0.4);
if (samovarSrc) { const s = prep(samovarSrc.clone()); s.rotation.y = Math.PI / 2; samovarGroup.add(s); }
else {
  const brass = std(0xc8932e, { metalness: 0.9, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.4, 16), brass); body.position.y = 0.25; samovarGroup.add(body);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), brass); pot.position.y = 0.55; samovarGroup.add(pot);
}
scene.add(samovarGroup);
if (teapotSrc) { const t = prep(teapotSrc.clone()); t.position.set(SAMOVAR_POS.x + 0.1, counterTopY, SAMOVAR_POS.z + 0.45); t.rotation.y = Math.PI / 2; scene.add(t); }
let trayModel;
if (traySrc) { trayModel = prep(traySrc.clone()); }
else { trayModel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), std(0xc8932e, { metalness: 0.9, roughness: 0.3 })); }
// spare tray displayed on counter
{ const t = trayModel.clone(); t.position.set(SAMOVAR_POS.x + 0.15, counterTopY, SAMOVAR_POS.z + 0.95); scene.add(t); }
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
function palm(bone, out) { bone.getWorldPosition(out); const tip = bone.children[0]; if (tip) { tip.getWorldPosition(_hq); out.lerp(_hq, 0.5); } return out; }
const _ho = new THREE.Vector3();
const TRAY_LIFT = 0.035;
function placeHandTray() {
  if (handBone && waiterAnim.ok) {
    // palm is ~8cm along the hand bone; tray stays level and turns with the waiter
    palm(handBone, _hp);
    if (W.trayHolder === 'owner' && ownerHand) { palm(ownerHand, _hp); }
    else if (W.trayHolder === 'transfer' && ownerHand) { palm(ownerHand, _ho); _hp.lerpVectors(_ho, palm(handBone, _hp).clone(), W.transferK || 0); }
    handTray.position.set(_hp.x, _hp.y + TRAY_LIFT, _hp.z); // tray rests on top of the palm/fingers instead of cutting through them
  } else {
    const o = waiter.outer; _hp.set(0.12, 1.08 + waiter.inner.position.y, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y).add(o.position); handTray.position.copy(_hp);
  }
  handTray.rotation.y = W.trayHolder === 'owner' ? owner.outer.rotation.y : waiter.outer.rotation.y;
}
function waiterModelVisible(v) { waiter.inner.children.forEach(ch => { if (ch !== handTray) ch.visible = v; }); }
const W = { pos: waiter.outer.position, target: null, action: null, speed: 2.0, yaw: 0, walkT: 0, moving: false, tray: 0, busy: 0, lock: 0, curSpeed: 0, pending: null };
// owner NPC behind counter
const owner = wrapModel(ownerSrc, 0x555555);
const ownerAnim = new Animator(ownerSrc || owner.inner, ownerG && ownerG.animations);
owner.outer.position.set(SAMOVAR_POS.x - 0.68, 0, SAMOVAR_POS.z + 0.15); owner.outer.rotation.y = Math.PI / 2;
const ownerHand = ownerSrc && ownerSrc.getObjectByName('handR');
const handBoneL = waiterSrc && waiterSrc.getObjectByName('handL');

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
  const headG = new THREE.Group(); headG.position.y = 1.45; body.add(headG);
  for (const m of [...body.children]) if (m.isMesh && m.position.y > 1.5) { body.remove(m); m.position.y -= 1.45; headG.add(m); }
  scene.add(g); return { group: g, body, legs, arms, headG };
}

const customers = [];
let rng = mulberry(Date.now() & 0xffff);
// precompute eyelid anchor points (relative to the head bone) for each customer model, by raycasting the face in bind pose
const _ray2 = new THREE.Raycaster();
for (const b of custBases) {
  const root = b.gltf.scene; root.updateMatrixWorld(true);
  const head = root.getObjectByName('head'); b.lids = [];
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  if (!head) continue;
  const hq = head.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const [ex, ey] of b.eyes) {
    _ray2.set(new THREE.Vector3(ex, ey, 0.6), new THREE.Vector3(0, 0, -1));
    const hit = _ray2.intersectObjects(meshes, false)[0];
    const p = hit ? hit.point.clone() : new THREE.Vector3(ex, ey, 0.1); p.z += 0.003;
    b.lids.push({ local: head.worldToLocal(p), quat: hq.clone() });
  }
  b.fezAt = head.worldToLocal(new THREE.Vector3(0, 1.86, -0.005)); b.fezQuat = hq.clone();
}
const lidGeo = new THREE.SphereGeometry(0.0165, 12, 8); lidGeo.scale(1.35, 0.85, 0.5);
function tintCloth(mat, tint, belowY) {
  // tint only desaturated clothing pixels below the neck (keeps skin, face, eyes and hair natural)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = { value: new THREE.Color(tint) }; sh.uniforms.uBelow = { value: belowY };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vMY;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvMY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uBelow; varying float vMY;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
          float sat = (mx - mn) / (mx + 1e-3); float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float m = (1.0 - smoothstep(0.16, 0.32, sat)) * (1.0 - smoothstep(uBelow - 0.04, uBelow, vMY));
          vec3 t = c * uTint * 1.25 + uTint * 0.06 * (1.0 - lum);
          diffuseColor.rgb = mix(c, t, m); }`);
  };
  mat.customProgramCacheKey = () => 'tint' + tint + '_' + belowY;
}
function makeRiggedCustomer(rnd) {
  let r = rnd() * custBases.reduce((a, c) => a + (c.weight || 1), 0), b = custBases[0];
  for (const c of custBases) { r -= c.weight || 1; if (r <= 0) { b = c; break; } }
  const model = SkeletonUtils.clone(b.gltf.scene);
  const tint = CLOTH_TINTS[Math.floor(rnd() * CLOTH_TINTS.length)];
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); if (b.tint !== false) tintCloth(o.material, tint, b.clothBelowY); }
  });
  const g = new THREE.Group(); g.add(model);
  g.scale.setScalar(THREE.MathUtils.lerp(b.scale[0], b.scale[1], rnd()));
  const head = model.getObjectByName('head');
  const lidMat = new THREE.MeshStandardMaterial({ color: b.skin, roughness: 0.75 });
  const lids = (b.lids || []).map(l => { const m = new THREE.Mesh(lidGeo, lidMat); m.position.copy(l.local); m.quaternion.copy(l.quat); m.visible = false; head && head.add(m); return m; });
  if (head && rnd() < b.fez) { const f = new THREE.Mesh(sharedGeo.fez, std(0xa3191a)); f.position.copy(b.fezAt); f.quaternion.copy(b.fezQuat); f.castShadow = true; head.add(f); }
  // cheap camera blocker so the follow camera never passes through people
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshBasicMaterial({ visible: false })); col.position.y = 0.7; col.userData.camBlock = true; g.add(col);
  scene.add(g);
  return { group: g, rig: true, anim: new Animator(model, b.gltf.animations), headBone: head, lids, blinkT: 1 + rnd() * 4, collider: col, headYaw: 0, headPitch: 0, model: b.label };
}
function makeCustomerBody(rnd) { return custBases.length ? makeRiggedCustomer(rnd) : { ...makePerson(rnd), rig: false }; }
const CHAT_LINES = [
  'Hava ne güzel bugün', 'Maçı izledin mi?', 'Bu çayın tadı harika', 'Torunum üniversiteyi kazandı!', 'Şu vapura bak',
  'Boğaz bugün çok sakin', 'Akşama balık mı yesek?', 'Martılar yine coştu', 'Emekli maaşı yatmış mı?', 'Kadıköy\'e geçecek misin?',
  'Simit de alalım mı?', 'Dün yağmur çok yağdı', 'Bizim kedi yine kayboldu', 'Fenerbahçe bu sene alır', 'Yok canım, Galatasaray alır',
  'Çocuklar hafta sonu geliyor', 'Şu köprünün ışıkları ne güzel', 'Eskiden çay bir liraydı', 'Bir tavla atalım mı?', 'Haberleri duydun mu?',
  'Bu bahçe hep böyleydi', 'Rüzgâr serinletti', 'Kızım nişanlanıyor', 'Doktor tuzu yasakladı', 'Vallahi haklısın',
  'Hadi canım, öyle mi?', 'Ben de onu diyorum', 'Aynen öyle', 'Bak sen şu işe', 'Hiç sorma, yoruldum'];
const REPLIES = ['Vallahi haklısın', 'Hadi canım, öyle mi?', 'Ben de onu diyorum', 'Aynen öyle', 'Bak sen şu işe', 'Maşallah!', 'Hayırlı olsun!', 'Doğru söylüyorsun', 'Yok artık!', 'He ya, aynen'];
const parties = [];
function spawnCustomer(forcePair) {
  const free = tables.filter(t => !t.party);
  if (!free.length) return;
  const t = free[Math.floor(rng() * free.length)];
  const pair = forcePair !== undefined ? forcePair : rng() < 0.45;
  const seatIdx = pair ? [0, 1] : [Math.floor(rng() * 2)];
  const party = { table: t, members: [], need: seatIdx.length, served: 0, state: 'arriving', patience: 0,
    maxPatience: PATIENCE_SCALE * Math.max(14, 26 - stats.served * 0.4) * (pair ? 1.3 : 1), drinkT: 0, bubble: null, chatT: 1.5 + rng() * 2, speaker: 0, said: new Set() };
  seatIdx.forEach((si, n) => {
    const seat = t.seats[si]; const p = makeCustomerBody(rng); if (p.collider) camColliders.push(p.collider);
    p.group.position.copy(ENTRANCE).add(new THREE.Vector3(n * 0.7, 0, n * 0.35));
    const c = { ...p, party, table: t, seat, seatIdx: si, state: 'walkIn', walkT: 0, lookT: rng() * 5, lookYaw: 0, talk: 0,
      path: [new THREE.Vector3(5.6 - n * 0.4, 0, 5.4 + n * 0.3), seat.pos.clone().add(new THREE.Vector3(Math.sign(seat.pos.x - t.pos.x) * 0.45, 0, 0))] };
    party.members.push(c); customers.push(c);
  });
  t.party = party; t.customer = party.members[0]; parties.push(party);
}
function makeBubble(party) {
  const el = document.createElement('div'); el.className = 'bubble'; el.innerHTML = '<span class="ord"></span><div class="bar"><i></i></div>';
  document.getElementById('bubbles').appendChild(el); party.bubble = el; party.bar = el.querySelector('i'); party.ord = el.querySelector('.ord');
}
function say(c, text, dur = 2.6) {
  if (c.chat) c.chat.remove();
  const el = document.createElement('div'); el.className = 'chat'; el.textContent = text;
  document.getElementById('bubbles').appendChild(el); c.chat = el; c.chatLeft = dur; c.talk = dur;
}
function removeBubble(c) { if (c.bubble) { c.bubble.remove(); c.bubble = null; } }
function removeChat(c) { if (c.chat) { c.chat.remove(); c.chat = null; } c.talk = 0; }

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
    viewYaw -= dx / innerWidth * 3.5 * SETTINGS.sens; viewPitch = THREE.MathUtils.clamp(viewPitch - dy / innerHeight * 1.8 * SETTINGS.sens, PITCH_MIN, PITCH_MAX);
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
  for (const m of topFade) { m.opacity = camMode === 'top' ? 0.28 : 1; m.depthWrite = camMode !== 'top'; }
  for (const o of topHide) o.visible = camMode !== 'top';
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
      const p = serveSpot(t).spot; // right beside the customer, at the table edge
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
let started = false, gameOver = false, spawnTimer = 2, elapsed = 0, inMenu = false;
function arrive() {
  const a = W.action; W.action = null; if (!a) return;
  if (a.type === 'samovar') {
    if (W.pos.distanceTo(SAMOVAR_SERVE) <= 0.3) W.pos.copy(SAMOVAR_SERVE);
    startBrew(false);
  } else if (a.type === 'table') {
    const t = a.table; const S = serveSpot(t); if (W.pos.distanceTo(S.spot) <= 0.3) W.pos.copy(S.spot);
    if (camMode !== 'first') W.yaw = Math.atan2(S.place.x - W.pos.x, S.place.z - W.pos.z);
    serveTable(t, false);
  }
}
// ---- close serving: stand beside the customer at the table edge, reach, hand carries the glass to the contact point
function nextServeMember(P) { const t = P.table; return P.members.find(m => !t.glasses[m.seatIdx].visible && !t.glasses[m.seatIdx].pending); }
function serveSpot(t) {
  const P = t.party, m = P && nextServeMember(P);
  const side = m ? Math.sign(m.seat.pos.x - t.pos.x) : (W.pos.x >= t.pos.x ? 1 : -1);
  const zs = W.pos.z >= t.pos.z ? 1 : -1;
  return { m, side, zs, spot: new THREE.Vector3(t.pos.x + side * 0.84, 0, t.pos.z + zs * 0.64),
    place: new THREE.Vector3(t.pos.x + side * 0.38, 0.765, t.pos.z + zs * 0.28) };
}
function startBrew(auto) {
  if (W.busy > 0 || W.lock > 0) return;
  if (W.tray >= 3) { if (!auto) toast('Tepsi zaten dolu!'); return; }
  if (W.pos.distanceTo(SAMOVAR_SERVE) > 0.25) { goTo(SAMOVAR_SERVE.clone(), { type: 'samovar' }); return; }
  W.target = null; W.action = null; W.yaw = -Math.PI / 2; // face the counter / owner
  W.busy = 3.0; W.brewT = 0; W.picked = false; W.trayHolder = null; ownerAnim.setOverride('pour'); toast('Çay dolduruluyor…', 'rgba(120,70,20,.92)');
}
function serveTable(t, auto) {
  const P = t.party;
  if (!P || P.state !== 'waiting') { if (!auto && P && P.state === 'drinking') toast('Afiyet olsun!', 'rgba(40,110,50,.92)'); return; }
  if (W.tray <= 0) { if (!auto) toast('Önce semaverden çay al!'); else if (!t.warned) { t.warned = true; toast('Önce semaverden çay al!'); } return; }
  if (W.fly || W.busy > 0 || W.lock > 0) return;
  const S = serveSpot(t); if (!S.m) return;
  if (W.pos.distanceTo(S.spot) > 0.3) { goTo(S.spot, { type: 'table', table: t }); return; }
  W.target = null; W.action = null;
  // turn a little to the right so the LEFT (serving) hand, not the chest, lines up with the place point
  { const dx = S.place.x - W.pos.x, dz = S.place.z - W.pos.z; W.yaw = Math.atan2(dx, dz) - 0.55; } // serve clip's left hand lands ~31° left of facing, ~0.57 m out
  W.tray--; P.need--; S.m.table.glasses[S.m.seatIdx].pending = true;
  const dur = waiterAnim.playOnce('serve', 1.0) || 1.0; W.lock = dur;
  W.fly = { t, P, m: S.m, glass: t.glasses[S.m.seatIdx], place: S.place, time: 0, dur, placed: false };
  flyGlass.visible = true; updateHud();
}
// the glass that travels tray -> left hand -> table
const flyGlass = tables[0].glasses[0].clone(); flyGlass.visible = false; scene.add(flyGlass);
const _fg = new THREE.Vector3(), _fc = new THREE.Vector3();
function updateFlyGlass(dt) {
  const F = W.fly; if (!F) return; F.time += dt; const u = F.time / F.dur;
  const handPt = handBoneL && waiterAnim.ok ? palm(handBoneL, _fg) : _fg.copy(handTray.position).add(new THREE.Vector3(0, 0.1, 0)).lerp(F.place, Math.min(1, Math.max(0, (u - 0.2) / 0.4)));
  if (u < 0.2) flyGlass.position.copy(handTray.position).add(_fc.set(0, 0.05, 0));                 // still on the tray
  else if (u < 0.24) flyGlass.position.lerpVectors(_fc.copy(handTray.position).setY(handTray.position.y + 0.05), handPt, (u - 0.2) / 0.04); // picked up
  else if (!F.placed) {
    flyGlass.position.copy(handPt).y -= 0.045;                                                     // in the hand
    if (u >= 0.56) { // contact: put it down exactly under the hand, clamped to the table top
      const loc = _fc.copy(handPt).sub(F.t.pos); loc.x = THREE.MathUtils.clamp(loc.x, -0.48, 0.48); loc.z = THREE.MathUtils.clamp(loc.z, -0.48, 0.48);
      F.glass.position.set(loc.x, 0.76, loc.z); F.glass.visible = F.t.party === F.P; F.glass.pending = false; flyGlass.visible = false; F.placed = true;
      onGlassPlaced(F);
    }
  }
  if (u >= 1) { W.fly = null; flyGlass.visible = false; if (!F.placed) { F.glass.visible = F.t.party === F.P; F.glass.pending = false; onGlassPlaced(F); }
    // pair: walk round to the other customer and serve the second glass
    if (F.P.state === 'waiting' && F.P.need > 0 && W.tray > 0 && F.t.party === F.P) setTimeout(() => serveTable(F.t, true), 50); }
}
function onGlassPlaced(F) {
  const P = F.P; if (F.t.party !== P) return;
  let earned = 5;
  if (P.need === 0) {
    const tip = Math.round((1 - P.patience / P.maxPatience) * 5); earned += tip;
    stats.served += P.members.length; P.state = 'drinking'; P.drinkT = 8 + rng() * 4; removeBubble(P);
    toast(tip >= 3 ? 'Eline sağlık! 😊' : 'Teşekkürler!', 'rgba(40,110,50,.92)');
  } else toast(`Bir çay daha lazım! (${P.need})`, 'rgba(120,70,20,.92)');
  stats.money += earned; floatText(F.t.pos.clone().setY(1.6), `+${earned} ₺`); updateHud();
}
function finishBrew() { if (W.tray < 3) { W.tray = 3; updateHud(); } toast('Çay hazır! 🍵', 'rgba(40,110,50,.92)'); }

function updateWaiter(dt) {
  if (W.busy > 0) {
    W.busy -= dt; W.brewT += dt;
    // 0-1.4 s owner pours; 1.4 owner lifts the tray and reaches over the counter; waiter reaches, takes it, lifts to carry
    if (W.brewT > 1.4 && !W.ownerGive) { W.ownerGive = true; ownerAnim.setOverride(null); ownerAnim.playOnce('pickup', 0.9); W.trayHolder = 'owner'; W.showTray = true; }
    if (W.brewT > 1.6 && !W.picked) { W.picked = true; W.pickDur = waiterAnim.playOnce('pickup', 0.9) || 1.2; }
    if (W.picked && W.trayHolder === 'owner' && W.brewT > 1.6 + W.pickDur * 0.36) { W.trayHolder = 'transfer'; W.transferK = 0; }
    if (W.trayHolder === 'transfer') { W.transferK = Math.min(1, W.transferK + dt / 0.3); if (W.transferK >= 1) { W.trayHolder = null; W.tray = 3; updateHud(); } }
    if (W.busy <= 0) { W.ownerGive = false; W.showTray = false; W.trayHolder = null; finishBrew(); }
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
      if (dist < 0.5 && W.pos.distanceTo(W.target) > dist - step * 0.2) { W.pos.lerp(W.target, 0.5); W.target = null; arrive(); }
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
    W.stickOn = m > 0;
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
  if (camMode !== 'top' && !blocked && !W.stickOn && !W.fly) {
    if (W.pos.distanceTo(SAMOVAR_SERVE) < 1.4 && W.tray < 3 && W.action?.type !== 'samovar') startBrew(true);
    let best = null, bd = 1.6;
    for (const t of tables) {
      const d = Math.hypot(W.pos.x - t.pos.x, W.pos.z - t.pos.z);
      if (d < bd && t.party && t.party.state === 'waiting') { best = t; bd = d; }
      if (d > 1.7) t.warned = false;
    }
    if (best && (!W.target || W.action?.table !== best)) serveTable(best, true);
  }
  handTray.visible = W.tray > 0 || !!W.showTray;
  const o = waiter.outer, i = waiter.inner;
  // smooth turn toward movement direction (critically damped feel)
  o.rotation.y = lerpAngle(o.rotation.y, W.yaw, 1 - Math.exp(-dt * (camMode === 'first' ? 30 : 10)));
  const actual = W.pos.distanceTo(prevPos) / Math.max(dt, 1e-4);
  W.curSpeed = THREE.MathUtils.lerp(W.curSpeed, W.moving ? actual : 0, 1 - Math.exp(-dt * 10));
  if (waiterAnim.ok) { waiterAnim.update(dt, W.curSpeed, W.tray > 0); placeHandTray(); updateFlyGlass(dt); return; }
  placeHandTray(); updateFlyGlass(dt);
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
const _cv = new THREE.Vector3();
function screenAt(el, pos) {
  const v = _cv.copy(pos).project(camera);
  el.style.display = v.z > 1 || Math.abs(v.x) > 1.2 ? 'none' : '';
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
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
          if (c.state === 'walkIn') { c.state = 'seated'; g.position.copy(c.seat.pos); g.rotation.y = c.seat.faceY; if (c.rig) c.anim.setOverride('sit'); else poseSit(c); }
          else { removeChat(c); scene.remove(g); customers.splice(k, 1); if (c.collider) camColliders.splice(camColliders.indexOf(c.collider), 1); continue; }
        }
      } else {
        d.normalize(); g.position.addScaledVector(d, Math.min(dist, 1.5 * dt));
        if (c.path.length > 1 || c.state === 'leaving') pushOut(g.position, 0.2, c.state === 'leaving' ? c.table : null);
        g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(d.x, d.z), Math.min(1, dt * 10));
        if (c.rig) c.anim.update(dt, 1.5, false); else { c.walkT += dt * 8; poseStand(c, c.walkT); }
      }
    } else if (c.state === 'seated') {
      const P = c.party, other = P.members.find(m => m !== c && m.state === 'seated');
      // head: look at partner while either talks, otherwise glance around (sea, ferry, waiter)
      c.lookT -= dt;
      if (c.lookT <= 0) { c.lookT = 2 + rng() * 3; c.lookYaw = (rng() - 0.5) * 1.4; }
      let wantYaw = c.lookYaw, wantPitch = 0;
      if (other && (c.talk > 0 || other.talk > 0)) { wantYaw = 0; wantPitch = c.talk > 0 ? Math.sin(elapsed * 7) * 0.06 : Math.max(0, Math.sin(elapsed * 2.5)) * 0.12; }
      const drinking = P.state === 'drinking' && c.table.glasses[c.seatIdx].visible;
      if (c.rig) {
        c.headYaw = lerpAngle(c.headYaw, wantYaw, 1 - Math.exp(-dt * 5)); c.headPitch += (wantPitch - c.headPitch) * Math.min(1, dt * 8);
        if (c.talk > 0) c.talk -= dt;
        const sip = drinking && ((elapsed * 0.33 + c.seatIdx * 0.5) % 1) < 0.35;
        c.anim.setOverride(c.talk > 0 ? 'sit_talk' : sip ? 'sit_drink' : 'sit');
        c.anim.update(dt, 0, false);
        turnHead(c);
      } else {
      c.headG.rotation.y = lerpAngle(c.headG.rotation.y, wantYaw, 1 - Math.exp(-dt * 5));
      c.headG.rotation.x += (wantPitch - c.headG.rotation.x) * Math.min(1, dt * 8);
      // talk gestures: forearm waves while speaking; drinking lifts the glass now and then
      if (c.talk > 0) { c.talk -= dt; c.arms[0].rotation.x = -0.9 + Math.sin(elapsed * 6) * 0.35; c.arms[0].rotation.z = 0.2 + Math.sin(elapsed * 4.3) * 0.15; }
      else { c.arms[0].rotation.x += (-0.5 - c.arms[0].rotation.x) * Math.min(1, dt * 4); c.arms[0].rotation.z *= 0.9; }
      c.arms[1].rotation.x = drinking && Math.sin(elapsed * 0.9 + c.seatIdx * 2) > 0.6 ? -1.4 : -0.5;
      c.body.rotation.x = c.talk > 0 ? -0.05 : 0;
      }
    }
    if (c.rig && c.lids.length) { // blink every 2.5–6 s
      c.blinkT -= dt;
      const closed = c.blinkT < 0 && c.blinkT > -0.13;
      for (const l of c.lids) { l.visible = closed; l.scale.y = closed ? Math.sin((-c.blinkT / 0.13) * Math.PI) * 0.6 + 0.5 : 1; }
      if (c.blinkT <= -0.13) c.blinkT = 2.5 + rng() * 3.5;
    }
    if (c.chat) {
      c.chatLeft -= dt; if (c.chatLeft <= 0) removeChat(c);
      else screenAt(c.chat, _cv.set(g.position.x, camMode === 'top' ? 1.8 : 1.5, g.position.z));
    }
  }
  for (let k = parties.length - 1; k >= 0; k--) {
    const P = parties[k];
    if (P.state === 'arriving' && P.members.every(m => m.state === 'seated')) { P.state = 'waiting'; makeBubble(P); }
    if (P.state === 'waiting') {
      P.patience += dt; const f = 1 - P.patience / P.maxPatience;
      P.bar.style.width = (f * 100) + '%'; P.bar.style.background = f > 0.5 ? '#3cb043' : f > 0.25 ? '#e0a020' : '#d0302a';
      P.ord.textContent = f > 0.25 ? '🍵'.repeat(P.need) + (P.need > 1 ? ' ×' + P.need : '') : '😤';
      if (f <= 0) { leaveParty(P, true); continue; }
    } else if (P.state === 'drinking') {
      P.drinkT -= dt; if (P.drinkT <= 0) { leaveParty(P, false); continue; }
    }
    // pairs chat while waiting and drinking, alternating speakers
    if (P.members.length > 1 && (P.state === 'waiting' || P.state === 'drinking')) {
      P.chatT -= dt;
      if (P.chatT <= 0) {
        const sp = P.members[P.speaker], prevLine = P.lastLine;
        let line;
        if (prevLine && !REPLIES.includes(prevLine) && rng() < 0.45) line = REPLIES[Math.floor(rng() * REPLIES.length)];
        else { let tries = 0; do { line = CHAT_LINES[Math.floor(rng() * CHAT_LINES.length)]; } while ((P.said.has(line) || REPLIES.includes(line)) && ++tries < 20); P.said.add(line); }
        if (P.state === 'waiting' && P.patience / P.maxPatience > 0.7 && rng() < 0.3) line = rng() < 0.5 ? 'Çaylar nerede kaldı?' : 'Garson bey, bakar mısın?';
        if (P.state === 'drinking' && rng() < 0.2) line = 'Bu çayın tadı harika';
        say(sp, line, 2.4 + line.length * 0.03); P.lastLine = line;
        P.speaker = 1 - P.speaker; P.chatT = 2.9 + line.length * 0.03 + rng() * 1.5;
      }
    }
    if (P.bubble) screenAt(P.bubble, _cv.set(P.table.pos.x, camMode === 'top' ? 2.4 : 2.2, P.table.pos.z));
  }
}
function leaveParty(P, angry) {
  removeBubble(P); P.state = 'left'; const t = P.table;
  t.glasses.forEach(g => { g.visible = false; g.pending = false; }); t.party = null; t.customer = null;
  parties.splice(parties.indexOf(P), 1);
  P.members.forEach((c, n) => {
    removeChat(c); c.state = 'leaving'; g_standUp(c); if (c.headG) c.headG.rotation.set(0, 0, 0);
    c.path = [c.seat.pos.clone().add(new THREE.Vector3(Math.sign(c.seat.pos.x - t.pos.x) * 0.5, 0, 0.5)), new THREE.Vector3(5.6, 0, 5.4 + n * 0.4), ENTRANCE.clone().add(new THREE.Vector3(1.5, 0, n * 0.4))];
  });
  if (angry) {
    stats.angry++; floatText(P.members[0].group.position.clone().setY(2), '😠'); toast(P.members.length > 1 ? 'Müşteriler kızıp gitti!' : 'Müşteri kızıp gitti!'); updateHud();
    if (stats.angry >= 5) endGame();
  }
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ax = new THREE.Vector3();
function turnHead(c) { // world-space yaw/nod applied on top of the animated head bone (axis-agnostic)
  const hb = c.headBone; if (!hb || !hb.parent) return;
  const th = c.group.rotation.y;
  _qa.setFromAxisAngle(_ax.set(0, 1, 0), c.headYaw); _qb.setFromAxisAngle(_ax.set(Math.cos(th), 0, -Math.sin(th)), c.headPitch); _qa.premultiply(_qb);
  hb.parent.getWorldQuaternion(_qp);
  const delta = _qp.clone().invert().multiply(_qa).multiply(_qp);
  hb.quaternion.premultiply(delta);
}
function g_standUp(c) { if (c.rig) { c.anim.setOverride(null); c.headYaw = c.headPitch = 0; c.lids.forEach(l => l.visible = false); return; } c.body.position.y = 0; c.body.rotation.x = 0; c.arms.forEach(a => { a.rotation.set(0, 0, 0); }); for (const l of c.legs) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; } }
function endGame() {
  gameOver = true; PROFILE.money += stats.money; PROFILE.xp += stats.served * 10; saveProfile();
  const ov = $('overlay'); ov.classList.remove('hidden'); ov.style.display = 'flex';
  ov.querySelector('.card').innerHTML = `<h1>Gün Bitti</h1><p class="sub">Çok müşteri kaçırdın!</p>
    <p style="font-size:20px">🪙 Kazanılan Para: <b>${stats.money} ₺</b><br>😊 Memnun müşteri: <b>${stats.served}</b></p>
    <button id="againBtn" style="font-size:22px;padding:12px 36px;border:0;border-radius:999px;background:#b3261e;color:#fff;font-weight:700">Ana Menü</button>`;
  $('againBtn').onclick = () => location.reload(); // reload lands in the lobby with the banked money/XP
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
const camColliders = []; scene.traverse(o => { if (!o.isMesh || !o.userData.camBlock) return; for (let p = o; p; p = p.parent) if (!p.visible) return; camColliders.push(o); });
const camDragging = () => [...pointers.values()].some(p => p.role === 'look');
function updateCamera(dt, snap) {
  if (inMenu) { // lobby: slow orbit around the idle waiter
    const a = 0.75 + Math.sin(elapsed * 0.07) * 0.85, r = 3.3; // slow back-and-forth arc in front of him (a full circle would clip the furniture)
    camera.position.set(W.pos.x + Math.sin(a) * r, 1.9 + Math.sin(elapsed * 0.23) * 0.12, W.pos.z + Math.cos(a) * r);
    camera.lookAt(W.pos.x - Math.cos(a) * 0.9, 1.15, W.pos.z + Math.sin(a) * 0.9); return;
  }
  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(...o.pos); camera.lookAt(...o.look); return; }
  if (camMode !== 'top' && W.busy > 0 && !camDragging()) { // tea hand-over: swing the view so waiter, counter and owner are all in frame
    const wantYaw = camMode === 'third' ? -Math.PI / 2 + 0.38 : -Math.PI / 2 + 0.05, wantPitch = camMode === 'third' ? -0.1 : -0.16;
    const k = 1 - Math.exp(-dt * 3); viewYaw = lerpAngle(viewYaw, wantYaw, k); viewPitch += (wantPitch - viewPitch) * k;
  }
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
    if (awningBox) { const inside = awningBox.containsPoint(camera.position); for (const m of awningMats) { m.opacity += ((inside ? 0.18 : 1) - m.opacity) * Math.min(1, dt * 8 + (snap ? 1 : 0)); m.depthWrite = m.opacity > 0.95; } }
    camTarget.set(W.pos.x, 0, W.pos.z);
    sun.target.position.copy(camTarget); sun.position.copy(camTarget).addScaledVector(SUN_DIR, 18);
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
// ---------- lobby / main menu ----------
function menuStats() {
  const lv = levelOf(PROFILE.xp);
  $('mLevel').textContent = lv; $('mXp').style.width = (PROFILE.xp % 100) + '%'; $('mXpTxt').textContent = (PROFILE.xp % 100) + ' / 100 XP';
  $('mMoney').textContent = PROFILE.money.toLocaleString('tr-TR');
  $('mVenue').textContent = (VENUES.find(v => v.id === PROFILE.venue) || VENUES[0]).name;
}
const SHOP = [
  { id: 'tepsi', name: 'Gümüş Tepsi', desc: 'Tepside 4 çay', price: 250, icon: '🍽️' },
  { id: 'bardak', name: 'İnce Belli Set', desc: '+%10 bahşiş', price: 400, icon: '🫖' },
  { id: 'ayakkabi', name: 'Rahat Ayakkabı', desc: '+%15 yürüme hızı', price: 600, icon: '👞' },
  { id: 'semaver', name: 'Bakır Semaver', desc: 'Demleme 2 kat hızlı', price: 900, icon: '⚱️' },
];
function showPanel(id) {
  document.querySelectorAll('#menu .mBtn').forEach(b => b.classList.toggle('on', b.dataset.p === id));
  const P = $('mPanel'); P.className = 'mPanel' + (id ? ' open' : ''); if (!id) { P.innerHTML = ''; return; }
  const lv = levelOf(PROFILE.xp);
  if (id === 'venues') P.innerHTML = '<h2>MEKANLAR</h2><div class="cards">' + VENUES.map(v => {
    const locked = v.locked || lv < v.level, sel = PROFILE.venue === v.id;
    return `<div class="vcard v-${v.id}${locked ? ' locked' : ''}${sel ? ' sel' : ''}" data-v="${v.id}"><div class="vart"></div>
      <div class="vinfo"><b>${v.name}</b><span>${v.desc}</span></div>
      <div class="vtag">${locked ? '🔒 Seviye ' + v.level : sel ? '✔ SEÇİLİ' : 'SEÇ'}</div></div>`; }).join('') + '</div>';
  if (id === 'shop') P.innerHTML = '<h2>MAĞAZA</h2><div class="shop">' + SHOP.map(it => `<div class="sitem"><div class="sic">${it.icon}</div><b>${it.name}</b><span>${it.desc}</span>
      <button class="sbuy" ${PROFILE.money < it.price ? 'disabled' : ''} data-i="${it.id}">🪙 ${it.price}</button></div>`).join('') + '</div><p class="soon">Satın alımlar yakında — şimdilik sadece vitrin.</p>';
  if (id === 'settings') {
    P.innerHTML = `<h2>AYARLAR</h2><div class="srow"><span>Grafik kalitesi</span><div class="seg">${['dusuk', 'orta', 'yuksek'].map(q => `<button data-q="${q}" class="${SETTINGS.quality === q ? 'on' : ''}">${{ dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' }[q]}</button>`).join('')}</div></div>
      <div class="srow"><span>Bakış hassasiyeti</span><input id="sSens" type="range" min="0.4" max="2" step="0.1" value="${SETTINGS.sens}"><b id="sSensV">${SETTINGS.sens.toFixed(1)}</b></div>
      <div class="srow"><span>İlerlemeyi sıfırla</span><button id="sReset" class="danger">Sıfırla</button></div>
      <p class="soon">Grafik değişikliği oyunu yeniden yükler.</p>`;
    P.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { SETTINGS.quality = b.dataset.q; localStorage.setItem('cay_settings', JSON.stringify(SETTINGS)); location.reload(); });
    $('sSens').oninput = (e) => { SETTINGS.sens = +e.target.value; $('sSensV').textContent = SETTINGS.sens.toFixed(1); localStorage.setItem('cay_settings', JSON.stringify(SETTINGS)); };
    $('sReset').onclick = () => { localStorage.removeItem('cay_profile'); location.reload(); };
  }
  P.querySelectorAll('.vcard').forEach(c => c.onclick = () => {
    const v = VENUES.find(x => x.id === c.dataset.v);
    if (v.locked || lv < v.level) { toast(`🔒 ${v.name} — Seviye ${v.level} gerekli`, 'rgba(60,60,70,.95)'); return; }
    PROFILE.venue = v.id; saveProfile(); menuStats(); showPanel('venues');
  });
}
document.querySelectorAll('#menu .mBtn').forEach(b => b.onclick = () => {
  if (b.dataset.p === 'play') { $('startBtn').onclick(); return; }
  showPanel($('mPanel').classList.contains('open') && b.classList.contains('on') ? null : b.dataset.p);
});
function openMenu() {
  inMenu = true; document.body.classList.add('inMenu'); $('overlay').style.display = 'none'; $('menu').classList.remove('hidden');
  W.pos.set(-0.9, 0, 1.6); W.yaw = 0.75; waiter.outer.rotation.y = 0.75; menuStats(); showPanel(null);
}
$('startBtn').onclick = () => {
  inMenu = false; document.body.classList.remove('inMenu'); $('menu').classList.add('hidden'); W.pos.set(-3.5, 0, 2.5); viewYaw = W.yaw = 0.5;
  started = true; $('overlay').style.display = 'none'; spawnTimer = 1.5; updateHud();
  if (isMobile) {
    const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
    try { const p = rq && rq.call(el, { navigationUI: 'hide' }); Promise.resolve(p).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch (e) {}
  }
  setTimeout(() => $('hint').classList.add('fade'), 9000);
};
applyCamMode();
if (new URLSearchParams(location.search).has('autostart')) $('startBtn').onclick(); else openMenu();
window.__scene = scene; window.__ferry = ferry;
window.__game = { renderer, envTris, custBases: () => custBases.map(b => b.url), W, customers, tables, stats, spawnCustomer, handTray, seatAll: () => customers.forEach(c => { if (c.state === 'walkIn') { c.path = [c.path[c.path.length - 1]]; c.group.position.copy(c.path[0]); } }), tap: handleTap, parties, serveSpot, flyGlass, camColliders: () => camColliders, clearParties: () => [...parties].forEach(P => leaveParty(P, false)), cycleCam, joy, waiterAnim, ownerAnim, setView: (y, p) => { viewYaw = y; viewPitch = p; }, startBrew, serveTable, get camMode() { return camMode; }, tapWorld: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); handleTap((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight); } };

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
  ferry.position.x += dt * 2.2; if (ferry.position.x > 70) ferry.position.x = -70;
  ferry.position.y = -0.35 + Math.sin(elapsed * 1.1) * 0.06; ferry.rotation.z = Math.sin(elapsed * 0.8) * 0.012;
  if (ferry.userData.flag) ferry.userData.flag.rotation.y = Math.sin(elapsed * 4) * 0.25;
  if (started && !gameOver) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnCustomer(); spawnTimer = Math.max(3.5, 9 - stats.served * 0.25) + rng() * 3; }
    updateWaiter(dt); updateCustomers(dt);
  } else if (inMenu) { waiter.outer.rotation.y = W.yaw; if (waiterAnim.ok) waiterAnim.update(dt, 0, false); handTray.visible = false; }
  // owner idle: breathe + look at waiter
  if (ownerAnim.ok) ownerAnim.update(dt, 0, false); else owner.inner.scale.y = 1 + Math.sin(elapsed * 1.6) * 0.005;
  const look = Math.atan2(W.pos.x - owner.outer.position.x, W.pos.z - owner.outer.position.z);
  owner.outer.rotation.y = lerpAngle(owner.outer.rotation.y, W.busy > 0 ? Math.PI / 2 : THREE.MathUtils.clamp(look, 0.6, 2.5), dt * 3);
  if (W.busy > 0 && !ownerAnim.ok) owner.inner.rotation.x = Math.sin(elapsed * 6) * 0.03;
  if (marker.material.opacity > 0) { marker.material.opacity -= dt * 1.5; marker.scale.multiplyScalar(1 + dt * 0.8); }
  updateCamera(dt, false);
}
loop();
