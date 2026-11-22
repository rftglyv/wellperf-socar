"use client";

/**
 * Hyper-realistic cutaway digital twin of the field: an offshore jacket platform on a reflective sea,
 * a geological block with a cut-away notch exposing the reservoir dome, and ten deviated wells with
 * oil flowing up to the deck. Everything is procedural (no external assets): PBR materials, sky-based
 * image lighting, soft shadows, bloom for the flare and lamps.
 */

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cn } from "@/lib/utils";

export interface TwinWell {
  name: string;
  oil?: number | null;
  skin?: number | null;
  quality?: string | null;
}

interface Props {
  wells: TwinWell[];
  background: string;
  autoRotate: boolean;
  showGeology: boolean;
  resetKey: number;
  zoomKey?: { n: number; f: number };
  selected?: string | null;
  onSelect?: (well: string) => void;
  /** wheel zooms without a modifier (fullscreen); otherwise Ctrl/⌘ + wheel zooms and plain wheel scrolls the page */
  wheelZoom?: boolean;
  labels: { oil: string; skin: string; none: string };
}

const WELLS = ["GL-01", "GL-02", "GL-03", "GL-04", "GL-05", "GL-06", "GL-07", "GL-08", "GL-09", "GL-10"];

// ------------------------------------------------------------------------------------------
// Scene dimensions (diorama units ≈ metres, vertically exaggerated)
// ------------------------------------------------------------------------------------------
const BX = 150; // half-width x
const BZ = 100; // half-depth z
const SEABED = -50;
const SLAB = 6;
const BOTTOM = -320;
const PLATFORM = new THREE.Vector3(-45, 0, -35);
const DOME = { x: 75, z: 50, top: -196, amp: 26, sx: 48, sz: 36 };
const domeTop = (x: number, z: number) =>
  DOME.top - DOME.amp + DOME.amp * 2 * Math.exp(-(((x - DOME.x) ** 2) / (2 * DOME.sx ** 2) + ((z - DOME.z) ** 2) / (2 * DOME.sz ** 2)));

// ------------------------------------------------------------------------------------------
// Procedural textures
// ------------------------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function waterNormals() {
  const N = 256;
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  const r = rng(7);
  const waves = Array.from({ length: 22 }, () => ({
    fx: Math.round((r() - 0.5) * 18),
    fy: Math.round((r() - 0.5) * 18),
    a: 0.4 + r(),
    p: r() * Math.PI * 2,
  })).filter((w) => w.fx || w.fy);
  const h = (x: number, y: number) =>
    waves.reduce((s, w) => s + (w.a / Math.hypot(w.fx, w.fy)) * Math.sin((2 * Math.PI * (w.fx * x + w.fy * y)) / N + w.p), 0);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 9, -dy * 9, 1).normalize();
      const i = (y * N + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const STRATA: [number, string][] = [
  // [thickness in diorama units from the seabed down, colour] — survey-section palette, not photo-real sand
  [18, "#2a3442"],
  [34, "#323e4f"],
  [30, "#3b4a5d"],
  [42, "#29323f"],
  [8, "#1f2631"],
  [24, "#7a4b16"], // reservoir: oil-saturated sand
  [18, "#344152"],
  [46, "#262e3a"],
  [44, "#1d242e"],
];

function strataTexture() {
  const W = 1024;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const total = STRATA.reduce((s, [t]) => s + t, 0);
  const r = rng(3);
  let y = 0;
  STRATA.forEach(([t, col], li) => {
    const hh = (t / total) * H;
    g.fillStyle = col;
    g.fillRect(0, y, W, hh + 1);
    // fine bedding hairlines
    for (let k = 0; k < hh / 7; k++) {
      const yy = y + r() * hh;
      g.strokeStyle = `rgba(160,190,220,${0.03 + r() * 0.05})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(0, yy);
      for (let x = 0; x <= W; x += 64) g.lineTo(x, yy + Math.sin(x * 0.008 + li) * 3);
      g.stroke();
    }
    if (li === 5) {
      // reservoir: hatch pattern like a log track
      g.strokeStyle = "rgba(255,190,90,0.22)";
      g.lineWidth = 1;
      for (let x = -hh; x < W; x += 14) {
        g.beginPath();
        g.moveTo(x, y + hh);
        g.lineTo(x + hh, y);
        g.stroke();
      }
    }
    // formation top: bright survey line
    g.fillStyle = li === 5 ? "rgba(255,196,110,0.9)" : "rgba(120,200,230,0.45)";
    g.fillRect(0, y, W, li === 5 ? 2.5 : 1.2);
    y += hh;
  });
  // measurement grid + depth ticks (TVDSS)
  g.strokeStyle = "rgba(140,200,230,0.10)";
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  g.font = "600 18px ui-monospace, Menlo, monospace";
  g.textBaseline = "middle";
  for (let d = 1000; d <= 3000; d += 250) {
    const yy = ((d - 600) / (3200 - 600)) * H;
    const major = d % 500 === 0;
    g.fillStyle = `rgba(170,215,235,${major ? 0.7 : 0.35})`;
    g.fillRect(0, yy, major ? 28 : 14, 1.5);
    g.fillRect(W - (major ? 28 : 14), yy, major ? 28 : 14, 1.5);
    if (major) g.fillText(`${d} m`, 36, yy);
  }
  return tex(c);
}

function noiseTexture(base: string, spread: number, repeat: [number, number], seed = 1) {
  const N = 512;
  const [c, g] = canvas(N, N);
  g.fillStyle = base;
  g.fillRect(0, 0, N, N);
  const r = rng(seed);
  for (let k = 0; k < N * N * 0.25; k++) {
    const v = (r() - 0.5) * spread;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, true, repeat);
}

function gratingTexture() {
  const N = 256;
  const [c, g] = canvas(N, N);
  g.fillStyle = "#4b4f52";
  g.fillRect(0, 0, N, N);
  g.strokeStyle = "#2a2d2f";
  g.lineWidth = 3;
  for (let i = 0; i <= N; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, N);
    g.stroke();
  }
  g.lineWidth = 1.5;
  for (let i = 0; i <= N; i += 6) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(N, i);
    g.stroke();
  }
  return tex(c, true, [10, 8]);
}

function corrugatedTexture() {
  const [c, g] = canvas(256, 16);
  for (let x = 0; x < 256; x++) {
    const v = 128 + 110 * Math.sin((x / 256) * Math.PI * 2 * 24);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 16);
  }
  return tex(c, false, [3, 3]);
}

function windowsTexture(lit: boolean) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = lit ? "#000" : "#e9e7e1";
  g.fillRect(0, 0, 512, 512);
  const r = rng(11);
  for (let fy = 0; fy < 4; fy++)
    for (let wx = 0; wx < 10; wx++) {
      const on = r() > 0.35;
      g.fillStyle = lit ? (on ? `rgba(255,${200 + r() * 40},${140 + r() * 40},1)` : "#000") : "#2d3a44";
      g.fillRect(16 + wx * 50, 40 + fy * 124, 30, 46);
    }
  return tex(c);
}

function helipadTexture() {
  const N = 512;
  const [c, g] = canvas(N, N);
  g.fillStyle = "#3a4a40";
  g.fillRect(0, 0, N, N);
  g.strokeStyle = "#f2c230";
  g.lineWidth = 18;
  g.beginPath();
  g.arc(N / 2, N / 2, N * 0.3, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(N / 2, N / 2, N * 0.47, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "bold 190px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("H", N / 2, N / 2 + 8);
  return tex(c);
}

function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,210,140,0.8)");
  grd.addColorStop(0.6, "rgba(255,120,40,0.25)");
  grd.addColorStop(1, "rgba(255,80,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

function shadowTexture() {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, "rgba(0,0,0,0.75)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return tex(c);
}

// ------------------------------------------------------------------------------------------
// Geometry batching: many struts → one mesh per material
// ------------------------------------------------------------------------------------------
class Batch {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
  }
  strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const geo = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(geo, mat, m);
  }
  box(size: [number, number, number], pos: [number, number, number], mat: THREE.Material) {
    this.add(new THREE.BoxGeometry(...size), mat, new THREE.Matrix4().makeTranslation(...pos));
  }
  build(group: THREE.Group, cast = true) {
    this.parts.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }
}

/** Lattice between 4 corner rails (towers, booms): chords + rings + X-bracing on every face. */
function lattice(b: Batch, base: THREE.Vector3[], top: THREE.Vector3[], panels: number, r: number, mat: THREE.Material) {
  const at = (i: number, t: number) => base[i].clone().lerp(top[i], t);
  for (let i = 0; i < base.length; i++) b.strut(base[i], top[i], r * 1.6, mat);
  for (let p = 0; p <= panels; p++) {
    const t = p / panels;
    for (let i = 0; i < base.length; i++) b.strut(at(i, t), at((i + 1) % base.length, t), r, mat, 6);
    if (p < panels) {
      const t2 = (p + 1) / panels;
      for (let i = 0; i < base.length; i++) {
        const j = (i + 1) % base.length;
        b.strut(at(i, t), at(j, t2), r * 0.8, mat, 5);
        b.strut(at(j, t), at(i, t2), r * 0.8, mat, 5);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------
export default function FieldTwin({ wells, background, autoRotate, showGeology, resetKey, zoomKey, selected = null, onSelect, wheelZoom = false, labels }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const api = useRef<{
    setBg: (c: string) => void;
    setRotate: (v: boolean) => void;
    setGeology: (v: boolean) => void;
    reset: () => void;
    zoom: (f: number) => void;
    setSelected: (w: string | null) => void;
    setWells: (w: TwinWell[]) => void;
  } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const wellsRef = useRef(wells);
  wellsRef.current = wells;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const wheelRef = useRef(wheelZoom);
  wheelRef.current = wheelZoom;
  const selectedInit = useRef(selected);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    const W = () => el.clientWidth || 800;
    const H = () => el.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    const camera = new THREE.PerspectiveCamera(34, W() / H(), 1, 4000);
    const HOME_POS = new THREE.Vector3(110, 240, 520);
    const HOME_TGT = new THREE.Vector3(30, -80, 25);
    camera.position.copy(HOME_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_TGT);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 70;
    controls.enableZoom = false; // page scroll must keep scrolling the page; zoom via buttons / Ctrl+wheel
    controls.maxDistance = 900;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.35;
    controls.enablePan = false;
    controls.update();

    // ---------- light: golden-hour sun + sky image-based lighting ----------
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 13), THREE.MathUtils.degToRad(220));
    const sky = new Sky();
    sky.scale.setScalar(50);
    const su = sky.material.uniforms;
    su.turbidity.value = 7;
    su.rayleigh.value = 1.8;
    su.mieCoefficient.value = 0.006;
    su.mieDirectionalG.value = 0.82;
    su.sunPosition.value.copy(sunDir);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky);
    const envRT = pmrem.fromScene(envScene as any);
    scene.environment = envRT.texture;
    (scene as any).environmentIntensity = 0.75;

    const sun = new THREE.DirectionalLight(0xffd2a1, 3.2);
    sun.position.copy(PLATFORM).addScaledVector(sunDir, 260);
    sun.target.position.copy(PLATFORM).setY(20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 600 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xbcd3e6, 0x3a2a1c, 0.55));
    const fill = new THREE.DirectionalLight(0x8fb6ff, 0.5);
    fill.position.set(300, 120, 400);
    scene.add(fill);

    // ---------- materials ----------
    const M = {
      yellow: new THREE.MeshStandardMaterial({ color: 0xe8b21a, metalness: 0.35, roughness: 0.5 }),
      marine: new THREE.MeshStandardMaterial({ color: 0x3d4b3c, metalness: 0.1, roughness: 0.95, map: noiseTexture("#55604a", 0.5, [2, 2], 5) }),
      steel: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.85, roughness: 0.38 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9e7e1, metalness: 0.4, roughness: 0.45 }),
      red: new THREE.MeshStandardMaterial({ color: 0xb8322a, metalness: 0.4, roughness: 0.45 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xff6a13, metalness: 0.15, roughness: 0.4 }),
      grating: new THREE.MeshStandardMaterial({ map: gratingTexture(), metalness: 0.7, roughness: 0.62 }),
      girder: new THREE.MeshStandardMaterial({ color: 0x5b6266, metalness: 0.7, roughness: 0.5 }),
      corrugGrey: new THREE.MeshStandardMaterial({ color: 0xd2d4d2, metalness: 0.45, roughness: 0.5, bumpMap: corrugatedTexture(), bumpScale: 0.9 }),
      corrugBlue: new THREE.MeshStandardMaterial({ color: 0x5d7c95, metalness: 0.45, roughness: 0.5, bumpMap: corrugatedTexture(), bumpScale: 0.9 }),
      vessel: new THREE.MeshStandardMaterial({ color: 0xdedbd2, metalness: 0.55, roughness: 0.32 }),
      pipe: new THREE.MeshStandardMaterial({ color: 0x8c6a3f, metalness: 0.6, roughness: 0.45 }),
      quarters: new THREE.MeshStandardMaterial({
        map: windowsTexture(false),
        emissiveMap: windowsTexture(true),
        emissive: new THREE.Color(1.8, 1.4, 1.0),
        metalness: 0.2,
        roughness: 0.55,
      }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8) }),
      aviation: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }),
      casing: new THREE.MeshStandardMaterial({ color: 0xb7bcc0, metalness: 0.95, roughness: 0.25 }),
    };

    // ---------- sea ----------
    const water = new Water(new THREE.PlaneGeometry(BX * 2, BZ * 2), {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: waterNormals(),
      sunDirection: sunDir.clone(),
      sunColor: 0xffe0b8,
      waterColor: 0x0a3442,
      distortionScale: 2.2,
      fog: false,
    });
    water.rotation.x = -Math.PI / 2;
    (water.material as THREE.ShaderMaterial).uniforms.size.value = 2.2;
    scene.add(water);

    // translucent water column (sides only, darker with depth)
    const colGeo = new THREE.BoxGeometry(BX * 2, -SEABED, BZ * 2, 1, 8, 1);
    const colors: number[] = [];
    const pos = colGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + -SEABED / 2) / -SEABED; // 0 bottom → 1 top
      const c = new THREE.Color(0x06222c).lerp(new THREE.Color(0x1a7f96), t);
      colors.push(c.r, c.g, c.b);
    }
    colGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const colMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const colMats = [colMat, colMat, new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ visible: false }), colMat, colMat];
    const column = new THREE.Mesh(colGeo, colMats);
    column.position.y = SEABED / 2;
    column.renderOrder = 2;
    scene.add(column);

    // ---------- earth block with a cut-away notch ----------
    const geology = new THREE.Group();
    scene.add(geology);
    const strataTex = strataTexture();
    const sideMat = new THREE.MeshStandardMaterial({ map: strataTex, roughness: 0.92, metalness: 0 });
    const hidden = new THREE.MeshStandardMaterial({ color: 0x2b241f, roughness: 1 });
    const earthTop = SEABED - SLAB;
    const earthH = earthTop - BOTTOM;
    const earthBox = (x0: number, x1: number, z0: number, z1: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, earthH, z1 - z0), [sideMat, sideMat, hidden, hidden, sideMat, sideMat]);
      m.position.set((x0 + x1) / 2, BOTTOM + earthH / 2, (z0 + z1) / 2);
      m.receiveShadow = true;
      geology.add(m);
    };
    earthBox(-BX, 0, -BZ, BZ);
    earthBox(0, BX, -BZ, 0);
    const sand = new THREE.MeshStandardMaterial({ map: noiseTexture("#3a4656", 0.3, [6, 4], 9), roughness: 1 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, SLAB, BZ * 2), [sand, sand, sand, hidden, sand, sand]);
    slab.position.y = SEABED - SLAB / 2;
    slab.receiveShadow = true;
    scene.add(slab);

    // reservoir dome + horizons inside the notch
    const surface = (offset: number, ampScale: number, mat: THREE.Material) => {
      const g = new THREE.PlaneGeometry(BX, BZ, 90, 60);
      g.rotateX(-Math.PI / 2);
      g.translate(BX / 2, 0, BZ / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const base = DOME.top - DOME.amp;
        p.setY(i, base + (domeTop(x, z) - base) * ampScale + offset);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      geology.add(m);
      return m;
    };
    const oilMat = new THREE.MeshStandardMaterial({
      color: 0x3c2613,
      emissive: 0x1d0c02,
      roughness: 0.75,
      metalness: 0.1,
      transparent: true,
      opacity: 0.93,
      side: THREE.DoubleSide,
      map: noiseTexture("#4a2f17", 0.45, [5, 3], 21),
    });
    const top = surface(0, 1, oilMat);
    surface(-24, 1, oilMat);
    {
      // structure map on the reservoir top: colour by height + contour bands
      const p = top.geometry.attributes.position;
      const cols: number[] = [];
      const lo = DOME.top - DOME.amp;
      const deep = new THREE.Color(0x0c3a4a);
      const mid = new THREE.Color(0x1f8a8a);
      const crest = new THREE.Color(0xffb347);
      for (let i = 0; i < p.count; i++) {
        const t = Math.min(1, Math.max(0, (p.getY(i) - lo) / (DOME.amp * 2)));
        const c = t < 0.5 ? deep.clone().lerp(mid, t * 2) : mid.clone().lerp(crest, (t - 0.5) * 2);
        const band = Math.abs(((t * 10) % 1) - 0.5) < 0.06 ? 1.35 : 1;
        cols.push(c.r * band, c.g * band, c.b * band);
      }
      top.geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      top.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, emissive: 0x0a0602, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    }
    const owc = new THREE.Mesh(new THREE.PlaneGeometry(BX, BZ), new THREE.MeshStandardMaterial({ color: 0x1e7891, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    owc.rotation.x = -Math.PI / 2;
    owc.position.set(BX / 2, DOME.top - DOME.amp - 6, BZ / 2);
    geology.add(owc);
    [
      [22, 0.85, 0x6f675a],
      [52, 0.6, 0x8a8170],
      [88, 0.35, 0xa49a85],
    ].forEach(([off, amp, col]) => {
      surface(off, amp, new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    });

    // contact shadow under the block
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(BX * 4.2, BZ * 4.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = BOTTOM - 12;
    scene.add(shadow);

    // ---------- platform ----------
    const plat = new THREE.Group();
    plat.position.copy(PLATFORM);
    scene.add(plat);
    const b = new Batch();
    const legBase = [new THREE.Vector3(-18, SEABED, -14), new THREE.Vector3(18, SEABED, -14), new THREE.Vector3(18, SEABED, 14), new THREE.Vector3(-18, SEABED, 14)];
    const legTop = [new THREE.Vector3(-11, 16, -8.5), new THREE.Vector3(11, 16, -8.5), new THREE.Vector3(11, 16, 8.5), new THREE.Vector3(-11, 16, 8.5)];
    const levels = [SEABED, -32, -15, 2, 16];
    const legAt = (i: number, y: number) => legBase[i].clone().lerp(legTop[i], (y - SEABED) / (16 - SEABED));
    const matFor = (a: THREE.Vector3, c: THREE.Vector3) => ((a.y + c.y) / 2 > -3 ? M.yellow : M.marine);
    for (let i = 0; i < 4; i++)
      for (let l = 0; l < levels.length - 1; l++) {
        const a = legAt(i, levels[l]);
        const c = legAt(i, levels[l + 1]);
        b.strut(a, c, 1.25, matFor(a, c), 14);
      }
    for (let l = 0; l < levels.length; l++)
      for (let i = 0; i < 4; i++) {
        const a = legAt(i, levels[l]);
        const c = legAt((i + 1) % 4, levels[l]);
        b.strut(a, c, 0.55, matFor(a, c), 8);
        if (l < levels.length - 1) {
          const a2 = legAt(i, levels[l + 1]);
          const c2 = legAt((i + 1) % 4, levels[l + 1]);
          b.strut(a, c2, 0.45, matFor(a, c2), 8);
          b.strut(c, a2, 0.45, matFor(c, a2), 8);
        }
      }
    // mudmats & piles
    legBase.forEach((p) => b.box([7, 1, 7], [p.x, SEABED + 0.5, p.z], M.marine));
    // deck legs + decks
    legTop.forEach((p) => b.strut(p, new THREE.Vector3(p.x, 25, p.z), 1.25, M.yellow, 14));
    b.box([26, 0.7, 20], [0, 17, 0], M.grating);
    b.box([31, 1, 25], [0, 25, 0], M.grating);
    for (let z = -11; z <= 11; z += 5.5) b.box([31, 1.6, 0.6], [0, 23.9, z], M.girder);
    for (let x = -14; x <= 14; x += 7) b.box([0.6, 1.6, 25], [x, 23.9, 0], M.girder);
    // railings
    const rail = (a: THREE.Vector3, c: THREE.Vector3) => {
      b.strut(a.clone().setY(26.6), c.clone().setY(26.6), 0.08, M.yellow, 5);
      const n = Math.ceil(a.distanceTo(c) / 2.5);
      for (let k = 0; k <= n; k++) {
        const p = a.clone().lerp(c, k / n);
        b.strut(p.clone().setY(25.5), p.clone().setY(26.6), 0.06, M.yellow, 4);
      }
    };
    const dc = [new THREE.Vector3(-15.5, 0, -12.5), new THREE.Vector3(15.5, 0, -12.5), new THREE.Vector3(15.5, 0, 12.5), new THREE.Vector3(-15.5, 0, 12.5)];
    dc.forEach((p, i) => rail(p, dc[(i + 1) % 4]));
    // modules
    b.box([8, 7, 14], [-11, 29, -2], M.corrugGrey);
    b.box([10, 6, 5], [1, 28.5, -9], M.corrugBlue);
    b.box([8, 4, 8], [0, 27.5, 1], M.girder);
    // separators
    const vessel = (x: number, z: number, len: number, r: number) => {
      const g = new THREE.CapsuleGeometry(r, len, 6, 20);
      g.rotateZ(Math.PI / 2);
      b.add(g, M.vessel, new THREE.Matrix4().makeTranslation(x, 25.6 + r + 0.6, z));
      [-len / 3, len / 3].forEach((dx) => b.box([0.8, r + 0.6, r * 1.6], [x + dx, 25.6 + (r + 0.6) / 2, z], M.girder));
    };
    vessel(-8.5, 8.2, 7.5, 1.5);
    vessel(-8.5, 11.2, 7.5, 1.2);
    // pipe racks
    for (let k = 0; k < 4; k++) b.strut(new THREE.Vector3(-14.5, 26.2 + k * 0.6, -11.5), new THREE.Vector3(5, 26.2 + k * 0.6, -11.5), 0.25, M.pipe, 8);
    for (let k = 0; k < 3; k++) b.strut(new THREE.Vector3(-4, 26.4 + k * 0.7, 6 + k * 0.7), new THREE.Vector3(-4, 26.4 + k * 0.7, -6), 0.28, M.pipe, 8);
    // risers down the jacket
    [
      [-10.5, -8],
      [10.5, 8],
    ].forEach(([x, z]) => b.strut(new THREE.Vector3(x, 25, z), new THREE.Vector3(x * 1.6, SEABED, z * 1.6), 0.5, M.pipe, 8));
    // living quarters + helideck
    const quarters = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 10), M.quarters);
    quarters.position.set(10.5, 31.5, 5.5);
    quarters.castShadow = quarters.receiveShadow = true;
    plat.add(quarters);
    const heliTop = new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.8, metalness: 0.2 });
    const heli = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.6, 8), [M.white, heliTop, M.girder]);
    heli.position.set(13, 38.2, 7.5);
    heli.rotation.y = Math.PI / 8;
    heli.castShadow = heli.receiveShadow = true;
    plat.add(heli);
    [
      [6.5, 0.5],
      [14.5, 0.5],
      [14.5, 10.5],
    ].forEach(([x, z]) => b.strut(new THREE.Vector3(x, 37.6, z + 1), new THREE.Vector3(Math.min(x, 14) - 1, 30, z + 2), 0.25, M.white, 6));
    // lifeboats
    [2, 7].forEach((z) => {
      const g = new THREE.CapsuleGeometry(1.1, 3.2, 6, 14);
      g.rotateX(Math.PI / 2);
      b.add(g, M.orange, new THREE.Matrix4().makeTranslation(15.6, 28.2, z));
    });
    // derrick
    const dB = [new THREE.Vector3(-4, 29.5, -4), new THREE.Vector3(4, 29.5, -4), new THREE.Vector3(4, 29.5, 4), new THREE.Vector3(-4, 29.5, 4)].map((v) => v.add(new THREE.Vector3(0, 0, 1)));
    const dT = dB.map((v) => new THREE.Vector3(v.x * 0.32, 63, (v.z - 1) * 0.32 + 1));
    lattice(b, dB, dT, 8, 0.18, M.white);
    b.box([3.2, 2.2, 3.2], [0, 64, 1], M.red);
    // crane
    b.strut(new THREE.Vector3(-13, 25, 10), new THREE.Vector3(-13, 33, 10), 1, M.yellow, 16);
    b.box([3.2, 2.6, 2.6], [-13, 34.4, 10], M.yellow);
    lattice(
      b,
      [new THREE.Vector3(-13.5, 34, 9.2), new THREE.Vector3(-12.5, 34, 10.8), new THREE.Vector3(-13, 35.4, 10)],
      [new THREE.Vector3(-31.5, 48, 23.6), new THREE.Vector3(-31, 48, 24.2), new THREE.Vector3(-31.2, 48.5, 23.9)],
      10,
      0.12,
      M.yellow
    );
    // flare boom
    const fb0 = [new THREE.Vector3(-15, 25, -11), new THREE.Vector3(-13, 25, -12.5), new THREE.Vector3(-14, 27.5, -11.8)];
    const fb1 = [new THREE.Vector3(-46, 50, -33), new THREE.Vector3(-45.4, 50, -33.6), new THREE.Vector3(-45.7, 50.8, -33.3)];
    lattice(b, fb0, fb1, 12, 0.16, M.steel);
    b.strut(new THREE.Vector3(-45.7, 50, -33.3), new THREE.Vector3(-45.7, 53, -33.3), 0.6, M.steel, 10);
    b.build(plat);

    // lamps + aviation lights
    const lampGeo = new THREE.SphereGeometry(0.35, 8, 8);
    dc.forEach((p) => {
      const lamp = new THREE.Mesh(lampGeo, M.lamp);
      lamp.position.set(p.x, 27.4, p.z);
      plat.add(lamp);
    });
    const aviation = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 10), M.aviation);
    aviation.position.set(0, 65.6, 1);
    plat.add(aviation);
    const deckLight = new THREE.PointLight(0xffc98a, 30, 60, 1);
    deckLight.position.set(0, 34, 0);
    plat.add(deckLight);

    // flare flame
    const glow = glowTexture();
    const flameTip = new THREE.Vector3(-45.7, 53.5, -33.3);
    const flames = Array.from({ length: 7 }, (_, i) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(4, 2 - i * 0.18, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      s.position.copy(flameTip).add(new THREE.Vector3(0, i * 1.1, 0));
      s.scale.setScalar(4 + i * 0.6);
      plat.add(s);
      return s;
    });
    const flareLight = new THREE.PointLight(0xff8a3a, 70, 140, 1);
    flareLight.position.copy(flameTip).add(new THREE.Vector3(0, 3, 0));
    plat.add(flareLight);

    // ---------- wells ----------
    const r = rng(42);
    const wellMeshes: THREE.Mesh[] = [];
    const curves: Record<string, THREE.CatmullRomCurve3> = {};
    const anchors: Record<string, THREE.Vector3> = {};
    const perfs: Record<string, THREE.Mesh> = {};
    const perfMat = (c: THREE.Color) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    WELLS.forEach((name, i) => {
      const slot = new THREE.Vector3(-2.4 + (i % 5) * 1.2, 25, -0.6 + Math.floor(i / 5) * 2.4 + 1);
      const head = PLATFORM.clone().add(slot);
      const ang = (i / WELLS.length) * Math.PI * 2 + (r() - 0.5) * 0.2;
      const rad = i % 2 ? 40 : 24;
      const tx = DOME.x + Math.cos(ang) * rad * 1.1;
      const tz = DOME.z + Math.sin(ang) * rad * 0.72;
      const ty = domeTop(tx, tz) - 10;
      const dir = new THREE.Vector3(tx - head.x, 0, tz - head.z).normalize();
      const pts = [
        head,
        new THREE.Vector3(head.x, SEABED + 2, head.z),
        new THREE.Vector3(head.x + dir.x * 4, -85, head.z + dir.z * 4),
        new THREE.Vector3(head.x + (tx - head.x) * 0.45, (-85 + ty) / 2 - 10, head.z + (tz - head.z) * 0.45),
        new THREE.Vector3(tx - dir.x * 14, ty + 2, tz - dir.z * 14),
        new THREE.Vector3(tx + dir.x * 16, ty, tz + dir.z * 16),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      curves[name] = curve;
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 220, 0.6, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x0b3b36, metalness: 0.2, roughness: 0.4 })
      );
      mesh.userData.well = name;
      mesh.castShadow = true;
      scene.add(mesh);
      wellMeshes.push(mesh);
      anchors[name] = new THREE.Vector3(tx - dir.x * 14, ty + 2, tz - dir.z * 14);
      // perforated interval glow
      const perfCurve = new THREE.CatmullRomCurve3([pts[4], pts[5]]);
      const perf = new THREE.Mesh(new THREE.TubeGeometry(perfCurve, 24, 2.1, 12, false), perfMat(new THREE.Color(2.4, 1.3, 0.3)));
      scene.add(perf);
      perfs[name] = perf;
    });

    // drainage rings: radius follows VFM oil rate, colour follows PTA skin
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 64);
    discGeo.rotateX(-Math.PI / 2);
    const rings: Record<string, { ring: THREE.Mesh; disc: THREE.Mesh; pulse: THREE.Mesh; base: number }> = {};
    WELLS.forEach((name) => {
      const a = anchors[name];
      const mk = (g: THREE.BufferGeometry, op: number) => {
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        m.position.set(a.x, a.y + 0.6, a.z);
        m.renderOrder = 3;
        scene.add(m);
        return m;
      };
      rings[name] = { ring: mk(ringGeo, 0.9), disc: mk(discGeo, 0.12), pulse: mk(ringGeo, 0.5), base: 8 };
    });
    const speed: Record<string, number> = {};

    // oil flowing up each well
    const PER = 14;
    const flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 2.1) }), WELLS.length * PER);
    flow.frustumCulled = false;
    scene.add(flow);
    const phase = Array.from({ length: WELLS.length * PER }, (_, k) => (k % PER) / PER + r() * 0.02);
    const dummy = new THREE.Object3D();

    // ---------- post-processing ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.55, 0.45, 1.05);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---------- data styling ----------
    const applyWells = (list: TwinWell[]) => {
      const byName = new Map(list.map((w) => [w.name, w]));
      WELLS.forEach((name) => {
        const w = byName.get(name);
        const skin = w?.skin;
        const c = skin == null ? new THREE.Color(2.4, 1.3, 0.3) : skin > 1 ? new THREE.Color(3, 0.7, 0.25) : skin < -1 ? new THREE.Color(0.4, 2.6, 1.2) : new THREE.Color(2.4, 1.9, 0.4);
        (perfs[name].material as THREE.MeshBasicMaterial).color.copy(c);
        const oils = list.map((x) => x.oil ?? 0).filter((v) => v > 0);
        const max = oils.length ? Math.max(...oils) : 1;
        const f = w?.oil && w.oil > 0 ? Math.sqrt(w.oil / max) : 0.25;
        const ringCol = skin == null ? new THREE.Color(0x2dd4bf) : skin > 1 ? new THREE.Color(0xff7a3d) : skin < -1 ? new THREE.Color(0x3ddc97) : new THREE.Color(0xf5c542);
        const R = rings[name];
        R.base = 5 + f * 17;
        [R.ring, R.disc, R.pulse].forEach((m) => {
          (m.material as THREE.MeshBasicMaterial).color.copy(ringCol);
          m.scale.setScalar(R.base);
        });
        speed[name] = 0.02 + f * 0.07;
        const tube = wellMeshes.find((m) => m.userData.well === name);
        if (tube) (tube.material as THREE.MeshStandardMaterial).color.copy(new THREE.Color(0x1e5f66).lerp(new THREE.Color(0x7ff5e3), f));
      });
    };
    applyWells(wellsRef.current);

    // ---------- interaction ----------
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovered: string | null = null;
    let selectedWell: string | null = selectedInit.current;
    const paintWells = () =>
      wellMeshes.forEach((m) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        const w = m.userData.well as string;
        mat.emissive.set(w === hovered ? 0x2f8f86 : w === selectedWell ? 0x45c4b8 : 0x0b3b36);
      });
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(wellMeshes, false)[0];
      const name = (hit?.object.userData.well as string) || null;
      if (name !== hovered) {
        hovered = name;
        setHover(name);
        paintWells();
        renderer.domElement.style.cursor = name ? "pointer" : "grab";
      }
    };
    let downAt: [number, number] | null = null;
    const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && hovered) onSelectRef.current?.(hovered);
      downAt = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!wheelRef.current && !e.ctrlKey && !e.metaKey) return; // let the page scroll
      e.preventDefault();
      api.current?.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 200) * 0.0012));
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.style.cursor = "grab";

    // ---------- loop ----------
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    const clock = new THREE.Clock();
    let raf = 0;
    const tmp = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) {
        clock.getDelta();
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      (water.material as THREE.ShaderMaterial).uniforms.time.value += dt * 0.55;
      flames.forEach((s, i) => {
        const f = 0.82 + 0.18 * Math.sin(t * (9 + i * 1.7) + i) + 0.08 * Math.sin(t * 23 + i * 3);
        s.scale.setScalar((4 + i * 0.6) * f);
        s.position.x = flameTip.x + Math.sin(t * 2 + i) * 0.25 * i - i * 0.35;
        s.position.y = flameTip.y + i * 1.1 * f;
      });
      flareLight.intensity = 60 + 18 * Math.sin(t * 13) + 9 * Math.sin(t * 29);
      (M.aviation.color as THREE.Color).setScalar(Math.sin(t * 3) > 0.2 ? 1 : 0.05).multiply(new THREE.Color(4, 0.3, 0.2));
      WELLS.forEach((name) => {
        const R = rings[name];
        const k = (t * 0.35 + WELLS.indexOf(name) * 0.13) % 1;
        R.pulse.scale.setScalar(R.base * (1 + k * 0.9));
        (R.pulse.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
        const on = name === hovered || name === selectedWell;
        (R.ring.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.75;
        (R.disc.material as THREE.MeshBasicMaterial).opacity = on ? 0.3 : 0.1;
      });
      WELLS.forEach((name, wi) => {
        const curve = curves[name];
        for (let k = 0; k < PER; k++) {
          const idx = wi * PER + k;
          phase[idx] = (phase[idx] + dt * (speed[name] ?? 0.045)) % 1;
          const u = 1 - phase[idx];
          curve.getPointAt(u, tmp);
          dummy.position.copy(tmp);
          dummy.scale.setScalar(name === hovered || name === selectedWell ? 1.5 : 1);
          dummy.updateMatrix();
          flow.setMatrixAt(idx, dummy.matrix);
        }
      });
      flow.instanceMatrix.needsUpdate = true;
      controls.update();
      composer.render();
      // labels
      const w = el.clientWidth;
      const h = el.clientHeight;
      WELLS.forEach((name) => {
        const node = labelRefs.current[name];
        if (!node) return;
        const p = anchors[name].clone().project(camera);
        const behind = p.z > 1;
        node.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
        node.style.opacity = behind || !geology.visible ? "0" : "1";
      });
    };
    tick();

    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      composer.setSize(W(), H());
      bloom.setSize(W(), H());
    });
    ro.observe(el);

    api.current = {
      setBg: (c) => ((scene.background as THREE.Color).set(c), (shadow.material as THREE.MeshBasicMaterial).opacity = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5 ? 0.55 : 0.85),
      setRotate: (v) => {
        controls.autoRotate = v;
      },
      setGeology: (v) => {
        geology.visible = v;
        wellMeshes.forEach((m) => (m.visible = v));
        Object.values(perfs).forEach((m) => (m.visible = v));
        flow.visible = v;
        Object.values(rings).forEach((R) => [R.ring, R.disc, R.pulse].forEach((m) => (m.visible = v)));
      },
      reset: () => {
        camera.position.copy(HOME_POS);
        controls.target.copy(HOME_TGT);
        controls.update();
      },
      setWells: applyWells,
      zoom: (f: number) => {
        const off = camera.position.clone().sub(controls.target);
        const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(off.setLength(d));
        controls.update();
      },
      setSelected: (w) => {
        selectedWell = w;
        paintWells();
      },
    };
    paintWells();
    api.current.setBg(background);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      composer.dispose();
      pmrem.dispose();
      envRT.dispose();
      scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m: any) => {
          Object.values(m).forEach((v: any) => v?.isTexture && v.dispose());
          m.dispose?.();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setBg(background);
  }, [background]);
  useEffect(() => {
    api.current?.setRotate(autoRotate);
  }, [autoRotate]);
  useEffect(() => {
    api.current?.setGeology(showGeology);
  }, [showGeology]);
  useEffect(() => {
    api.current?.reset();
  }, [resetKey]);
  useEffect(() => {
    api.current?.setWells(wells);
  }, [wells]);
  useEffect(() => {
    if (zoomKey?.n) api.current?.zoom(zoomKey.f);
  }, [zoomKey]);
  useEffect(() => {
    api.current?.setSelected(selected);
  }, [selected]);

  const info = hover ? wells.find((w) => w.name === hover) : null;

  if (failed)
    return (
      <div className="grid h-full place-items-center text-sm text-white/70">
        WebGL is not available in this browser.
      </div>
    );

  return (
    <div className="relative size-full">
      <div ref={mount} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {WELLS.map((name) => {
          const on = hover === name || selected === name;
          return (
            <div
              key={name}
              ref={(n) => {
                labelRefs.current[name] = n;
              }}
              className={cn(
                "absolute top-0 left-0 -mt-[11px] ml-2 inline-flex cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] whitespace-nowrap transition-[opacity,background-color] will-change-transform",
                on ? "border-primary bg-primary text-primary-foreground" : "border-white/15 bg-black/60 text-white/90"
              )}
            >
              <span className="size-[5px] rounded-full bg-[#ffb23e]" />
              {name}
            </div>
          );
        })}
      </div>
      {hover && (
        <div className="pointer-events-none absolute top-4 right-4 flex min-w-56 flex-col gap-2 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-md">
          <div className="font-mono text-sm font-medium">{hover}</div>
          <div className="flex flex-col gap-1 font-mono text-xs tabular-nums">
            <span>
              <span className="text-muted-foreground">{labels.oil}:</span> {info?.oil != null ? `${Math.round(info.oil).toLocaleString("en-US")} STB/d` : labels.none}
            </span>
            <span>
              <span className="text-muted-foreground">{labels.skin}:</span> {info?.skin != null ? info.skin.toFixed(2) : labels.none}
              {info?.quality ? ` · ${info.quality.replace(/_/g, " ")}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
