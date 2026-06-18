import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Poet, Poem } from "../data/poems";

type PoetryCloudProps = {
  poets: Poet[];
  poems: Poem[];
  selectedPoetId: string;
  selectedPoemId: string;
  visualKey?: string;
  onSelectPoet: (poetId: string) => void;
  onSelectPoem: (poetId: string) => void;
};

type ClickGlow = {
  anchor: THREE.Group;
  coreMaterial: THREE.SpriteMaterial;
  haloMaterial: THREE.SpriteMaterial;
  bornAt: number;
  duration: number;
  baseScale: number;
};

type OrbitalSystem = {
  object: THREE.Object3D;
  speed: number;
  wobble: number;
};

const colorByDynasty: Record<string, string> = {
  唐: "#f0c36a",
  宋: "#86d7c6",
  元: "#d57973",
  明: "#85a9ff",
  清: "#c3df65",
};

const famousPoetStarScale: Record<string, number> = {
  "li-bai": 1.48,
  "du-fu": 1.48,
  "su-shi": 1.44,
  "bai-juyi": 1.36,
  "wang-wei": 1.32,
  "li-qingzhao": 1.3,
  "xin-qiji": 1.3,
  李白: 1.48,
  杜甫: 1.48,
  苏轼: 1.44,
  白居易: 1.36,
  王维: 1.32,
  李清照: 1.3,
  辛弃疾: 1.3,
  陶渊明: 1.34,
  李商隐: 1.32,
  杜牧: 1.3,
  王昌龄: 1.26,
  孟浩然: 1.26,
  刘禹锡: 1.24,
  柳宗元: 1.22,
  韩愈: 1.22,
  元稹: 1.2,
  李贺: 1.2,
  岑参: 1.2,
  高适: 1.18,
  韦应物: 1.18,
  王安石: 1.24,
  欧阳修: 1.24,
  陆游: 1.34,
  杨万里: 1.2,
  范成大: 1.18,
  黄庭坚: 1.18,
  纳兰性德: 1.2,
  龚自珍: 1.18,
};

function getPoetFameScale(poet: Poet, density: number) {
  const curatedScale = famousPoetStarScale[poet.id] ?? famousPoetStarScale[poet.name] ?? 1;
  const prolificScale = Math.min(0.16, Math.max(0, Math.log10(Math.max(density, 1)) - 2.1) * 0.08);
  return Math.min(1.58, curatedScale + prolificScale);
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 250, 226, 1)");
  gradient.addColorStop(0.16, "rgba(246, 221, 156, 0.48)");
  gradient.addColorStop(0.42, "rgba(142, 188, 214, 0.1)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function createNebulaTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const ny = (y / (size - 1) - 0.5) * 2;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const angle = Math.atan2(ny, nx);
      const edge = Math.max(0, 1 - radius);
      const curl =
        0.58 +
        Math.sin(angle * 3.4 + radius * 9.6) * 0.15 +
        Math.sin(angle * 6.1 - radius * 14.2) * 0.1;
      const grain = hashUnit(`${x}:${y}`, 2701) * 0.04 + hashUnit(`${y}:${x}`, 2707) * 0.025;
      const alpha = Math.pow(Math.max(0, edge * curl + grain * edge - radius * 0.08), 1.72);
      const index = (y * size + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(Math.min(1, alpha) * 230);
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function mixColor(target: Float32Array, index: number, color: THREE.Color, intensity = 1) {
  target[index * 3] = color.r * intensity;
  target[index * 3 + 1] = color.g * intensity;
  target[index * 3 + 2] = color.b * intensity;
}

function hashUnit(input: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function createStellarMaterial(opacity: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uPointScale: { value: 6.95 },
    },
    vertexShader: `
      uniform float uPixelRatio;
      uniform float uPointScale;
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPhase;

      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vPhase = aPhase;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = max(uPixelRatio * 0.95, aSize * uPixelRatio * (uPointScale / max(0.16, -mvPosition.z)));
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPhase;

      void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        float core = smoothstep(0.22, 0.035, dist);
        float rim = smoothstep(0.42, 0.2, dist) * 0.052;
        float edge = smoothstep(0.5, 0.43, dist);
        float alpha = (core + rim) * edge * vAlpha * uOpacity;
        gl_FragColor = vec4(vColor * (0.74 + core * 2.45 + rim * 0.45), alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return material;
}

export function PoetryCloud({
  poets,
  poems,
  selectedPoetId,
  selectedPoemId,
  visualKey,
  onSelectPoet,
  onSelectPoem,
}: PoetryCloudProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const poetRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const selectedPoetRef = useRef(selectedPoetId);
  const selectedPoemRef = useRef(selectedPoemId);
  const onSelectPoetRef = useRef(onSelectPoet);
  const onSelectPoemRef = useRef(onSelectPoem);

  const poemDensity = useMemo(() => {
    const counts = new Map<string, number>();
    poems.forEach((poem) => counts.set(poem.poetId, (counts.get(poem.poetId) ?? 0) + 1));
    return counts;
  }, [poems]);

  useEffect(() => {
    selectedPoetRef.current = selectedPoetId;
    selectedPoemRef.current = selectedPoemId;
    onSelectPoetRef.current = onSelectPoet;
    onSelectPoemRef.current = onSelectPoem;
  }, [selectedPoetId, selectedPoemId, onSelectPoet, onSelectPoem]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const activePoets = poets.slice(0, 420);
    const selectedPoet = poets.find((poet) => poet.id === selectedPoetRef.current);
    if (selectedPoet && !activePoets.some((poet) => poet.id === selectedPoet.id)) {
      activePoets.unshift(selectedPoet);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020205");
    scene.fog = null;

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.02, 180);
    camera.position.set(0.04, 0, 3.95);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "诗人星云可视化区域");
    mount.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.setSize(mount.clientWidth, mount.clientHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(mount.clientWidth, mount.clientHeight), 0.2, 0.38, 0.56);
    composer.addPass(bloom);

    scene.add(new THREE.AmbientLight("#fff0dc", 0.92));

    const keyLight = new THREE.PointLight("#fff1d2", 5.4, 30);
    keyLight.position.set(0.35, 0.4, 4.2);
    scene.add(keyLight);

    const cyanLight = new THREE.PointLight("#96ffd6", 2.8, 22);
    cyanLight.position.set(3.8, -1.2, 2.4);
    scene.add(cyanLight);

    const interactiveSpace = new THREE.Group();
    scene.add(interactiveSpace);

    const group = new THREE.Group();
    group.position.set(-0.6, 0.02, 0);
    group.scale.set(1.58, 1.44, 1);
    interactiveSpace.add(group);

    const glowTexture = createGlowTexture();
    const nebulaTexture = createNebulaTexture();
    const selectedPoems = poems.filter((poem) => poem.poetId === selectedPoetRef.current);
    const seedKey = visualKey || selectedPoemRef.current || selectedPoetRef.current;
    const stellarMaterials: THREE.ShaderMaterial[] = [];
    const orbitStarfieldMode = false;
    const crispParticleGalaxy = true;
    const activePoetCount = Math.max(activePoets.length, 1);
    const bellHash = (salt: number) =>
      (hashUnit(seedKey, salt) + hashUnit(seedKey, salt + 97) + hashUnit(seedKey, salt + 193)) / 3 - 0.5;
    const spiralKnotAngle = (progress: number, salt: number, armCount = 4) => {
      const randomTurn = hashUnit(seedKey, salt) * Math.PI * 2;
      const softTwist = progress * (1.45 + armCount * 0.14);
      return (
        randomTurn +
        softTwist +
        Math.sin(progress * 6.2 + hashUnit(seedKey, salt + 7) * Math.PI * 2) * 0.52 +
        (hashUnit(seedKey, salt + 11) - 0.5) * 0.58
      );
    };

    const starGeometry = new THREE.BufferGeometry();
    const starCount = 88000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starAlphas = new Float32Array(starCount);
    const starPhases = new Float32Array(starCount);
    const starPoetIndices = new Uint16Array(starCount);
    const colorA = new THREE.Color("#f4efe7");
    const colorB = new THREE.Color("#ff8bbf");
    const colorC = new THREE.Color("#62ffd1");
    const colorD = new THREE.Color("#ff9f5a");
    for (let i = 0; i < starCount; i += 1) {
      const radius = Math.pow(hashUnit(seedKey, i + 1011), 0.78) * 13.2;
      const outerDust = Math.max(0, radius - 8.2) / 5.6;
      const theta =
        hashUnit(seedKey, i + 1021) * Math.PI * 2 +
        Math.sin(radius * 0.46 + hashUnit(seedKey, i + 1031) * Math.PI * 2) * 0.38 +
        bellHash(i + 1041) * (0.72 + outerDust * 0.32);
      const drift = bellHash(i + 1051) * (0.42 + radius * 0.035);
      positions[i * 3] = Math.cos(theta) * radius * (1.02 + outerDust * 0.1) + Math.cos(theta + Math.PI * 0.5) * drift;
      positions[i * 3 + 1] =
        Math.sin(theta) * radius * 0.78 + Math.sin(theta + Math.PI * 0.5) * drift * 0.58 + bellHash(i + 1061) * (0.22 + radius * 0.02);
      positions[i * 3 + 2] = -1.2 + bellHash(i + 1071) * (0.8 + radius * 0.055);
      const colorNoise = hashUnit(seedKey, i + 1101);
      const mixed =
        radius < 4.8
          ? colorA
          : radius < 8.4
            ? colorNoise < 0.7 ? colorC : colorD
            : colorNoise < 0.56
              ? colorD
              : colorNoise < 0.9
                ? colorB
                : colorA;
      mixColor(colors, i, mixed, radius < 4.8 ? 1.18 : 1.04 + hashUnit(seedKey, i + 1111) * 0.34);
      const centerBias = radius < 4.6 ? 0.78 : 0;
      starSizes[i] = 0.045 + Math.random() * 0.22 + centerBias * 0.16 + (i % 251 === 0 ? 0.2 : 0);
      starAlphas[i] = 0.16 + Math.random() * 0.28 + centerBias * 0.22;
      starPhases[i] = Math.random() * Math.PI * 2;
      starPoetIndices[i] = Math.floor(hashUnit(seedKey, i + 24101) * activePoetCount);
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
    starGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(starAlphas, 1));
    starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(starPhases, 1));
    const starMaterial = createStellarMaterial(0.22);
    stellarMaterials.push(starMaterial);
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.userData.poetIndices = starPoetIndices;
    stars.userData.clickPriority = 15;
    interactiveSpace.add(stars);

    const chromaticMistGeometry = new THREE.BufferGeometry();
    const chromaticMistCount = 112000;
    const chromaticMistPositions = new Float32Array(chromaticMistCount * 3);
    const chromaticMistColors = new Float32Array(chromaticMistCount * 3);
    const chromaticMistSizes = new Float32Array(chromaticMistCount);
    const chromaticMistAlphas = new Float32Array(chromaticMistCount);
    const chromaticMistPhases = new Float32Array(chromaticMistCount);
    const chromaticMistPoetIndices = new Uint16Array(chromaticMistCount);
    const mistWhite = new THREE.Color("#f4f2ea");
    const mistPink = new THREE.Color("#ff77b5");
    const mistMint = new THREE.Color("#48f0b4");
    const mistAmber = new THREE.Color("#ff9550");
    const mistViolet = new THREE.Color("#c47bff");
    const mistKnotCount = 58;
    for (let i = 0; i < chromaticMistCount; i += 1) {
      const knotIndex = Math.floor(hashUnit(seedKey, i + 8101) * mistKnotCount);
      const knotSalt = 8160 + knotIndex * 53;
      const knotProgress = hashUnit(seedKey, knotSalt + 1);
      const scattered = hashUnit(seedKey, i + 8141) < 0.34;
      const layer = THREE.MathUtils.clamp(
        scattered ? hashUnit(seedKey, i + 8151) : knotProgress + bellHash(i + 8161) * (0.18 + knotProgress * 0.18),
        0.02,
        0.98,
      );
      const radius =
        1.45 +
        Math.pow(layer, 0.58) * 11.2 +
        bellHash(i + 8171) * (scattered ? 0.72 + layer * 0.82 : 0.5 + layer * 1.02);
      const angle = scattered
        ? hashUnit(seedKey, i + 8181) * Math.PI * 2 + Math.sin(radius * 0.44) * 0.36
        : spiralKnotAngle(knotProgress, knotSalt + 2) + bellHash(i + 8191) * (0.92 + layer * 1.24);
      const ribbon = hashUnit(seedKey, knotSalt + 3);
      const feather = bellHash(i + 8301) * (0.42 + radius * 0.12);
      const depth = -1.4 + bellHash(i + 8401) * (0.82 + radius * 0.06);
      chromaticMistPositions[i * 3] = Math.cos(angle) * (radius + feather) * 1.03;
      chromaticMistPositions[i * 3 + 1] = Math.sin(angle) * (radius + feather) * 0.78 + (hashUnit(seedKey, i + 8451) - 0.5) * 0.24;
      chromaticMistPositions[i * 3 + 2] = depth;
      const colorNoise = hashUnit(seedKey, i + 8461);
      const color =
        i % 83 === 0
          ? mistWhite
          : radius < 4.1
            ? colorNoise < 0.78 ? mistWhite : mistAmber
            : radius < 8.2
              ? colorNoise < 0.78 ? mistMint : colorNoise < 0.9 ? mistWhite : mistAmber
              : colorNoise < 0.62
                ? mistAmber
                : colorNoise < 0.9
                  ? mistPink
                  : ribbon > 0.48 ? mistViolet : mistMint;
      const centerLift = radius < 4.4 ? 0.32 : 0;
      mixColor(chromaticMistColors, i, color, 0.9 + hashUnit(seedKey, i + 8501) * 0.52);
      chromaticMistSizes[i] = 0.055 + hashUnit(seedKey, i + 8601) * 0.34 + centerLift * 0.2 + (i % 991 === 0 ? 0.24 : 0);
      chromaticMistAlphas[i] = 0.38 + hashUnit(seedKey, i + 8701) * 0.36 + centerLift * 0.18;
      chromaticMistPhases[i] = hashUnit(seedKey, i + 8801) * Math.PI * 2;
      chromaticMistPoetIndices[i] = Math.floor(hashUnit(seedKey, i + 24201) * activePoetCount);
    }
    chromaticMistGeometry.setAttribute("position", new THREE.BufferAttribute(chromaticMistPositions, 3));
    chromaticMistGeometry.setAttribute("color", new THREE.BufferAttribute(chromaticMistColors, 3));
    chromaticMistGeometry.setAttribute("aSize", new THREE.BufferAttribute(chromaticMistSizes, 1));
    chromaticMistGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(chromaticMistAlphas, 1));
    chromaticMistGeometry.setAttribute("aPhase", new THREE.BufferAttribute(chromaticMistPhases, 1));
    const chromaticMistMaterial = createStellarMaterial(0.28);
    stellarMaterials.push(chromaticMistMaterial);
    const chromaticMist = new THREE.Points(chromaticMistGeometry, chromaticMistMaterial);
    chromaticMist.userData.poetIndices = chromaticMistPoetIndices;
    chromaticMist.userData.clickPriority = 12;
    chromaticMist.rotation.set(0.02, -0.06, -0.1);
    interactiveSpace.add(chromaticMist);

    const clickablePointClouds: THREE.Points[] = [chromaticMist, stars];

    const milkyWayGeometry = new THREE.BufferGeometry();
    const milkyWayCount = 56000;
    const milkyWayPositions = new Float32Array(milkyWayCount * 3);
    const milkyWayColors = new Float32Array(milkyWayCount * 3);
    const milkyWaySizes = new Float32Array(milkyWayCount);
    const milkyWayAlphas = new Float32Array(milkyWayCount);
    const milkyWayPhases = new Float32Array(milkyWayCount);
    const bandWhite = new THREE.Color("#f4f0e7");
    const bandPink = new THREE.Color("#ff75b7");
    const bandMint = new THREE.Color("#49f0b4");
    const bandAmber = new THREE.Color("#ff9b52");
    const bandKnotCount = 44;
    for (let i = 0; i < milkyWayCount; i += 1) {
      const knotIndex = Math.floor(hashUnit(seedKey, i + 4201) * bandKnotCount);
      const knotSalt = 12040 + knotIndex * 61;
      const lane = 0.48 + hashUnit(seedKey, knotSalt + 1) * 0.5;
      const scattered = hashUnit(seedKey, i + 4211) < 0.32;
      const progress = THREE.MathUtils.clamp(scattered ? 0.46 + hashUnit(seedKey, i + 4221) * 0.52 : lane + bellHash(i + 4231) * 0.16, 0.42, 0.98);
      const radius = 4.0 + Math.pow(progress, 0.76) * 9.4;
      const angle = scattered
        ? hashUnit(seedKey, i + 4241) * Math.PI * 2 + Math.sin(radius * 0.38) * 0.28
        : spiralKnotAngle(progress, knotSalt + 2) + bellHash(i + 4101) * (0.86 + progress * 1.1);
      const width = bellHash(i + 4301) * (0.46 + radius * 0.1);
      const dustGap = 0.45 + hashUnit(seedKey, knotSalt + 3) * 0.55;
      milkyWayPositions[i * 3] = Math.cos(angle) * (radius + width) * 1.04;
      milkyWayPositions[i * 3 + 1] = Math.sin(angle) * (radius + width) * 0.78;
      milkyWayPositions[i * 3 + 2] = -1.95 + bellHash(i + 4601) * (0.74 + radius * 0.045);
      const color =
        i % 59 === 0
          ? bandWhite
          : radius < 6.2
            ? bandWhite
            : radius < 9.6
              ? i % 4 === 0 ? bandAmber : bandMint
              : i % 3 === 0 ? bandPink : bandAmber;
      mixColor(milkyWayColors, i, color, 0.74 + hashUnit(seedKey, i + 4701) * 0.38);
      milkyWaySizes[i] = 0.05 + hashUnit(seedKey, i + 4801) * 0.28 + (i % 379 === 0 ? 0.22 : 0);
      milkyWayAlphas[i] = (0.22 + Math.pow(1 - lane, 1.1) * 0.2 + hashUnit(seedKey, i + 4901) * 0.12) * (0.6 + dustGap * 0.42);
      milkyWayPhases[i] = hashUnit(seedKey, i + 5001) * Math.PI * 2;
    }
    milkyWayGeometry.setAttribute("position", new THREE.BufferAttribute(milkyWayPositions, 3));
    milkyWayGeometry.setAttribute("color", new THREE.BufferAttribute(milkyWayColors, 3));
    milkyWayGeometry.setAttribute("aSize", new THREE.BufferAttribute(milkyWaySizes, 1));
    milkyWayGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(milkyWayAlphas, 1));
    milkyWayGeometry.setAttribute("aPhase", new THREE.BufferAttribute(milkyWayPhases, 1));
    const milkyWayMaterial = createStellarMaterial(0.08);
    stellarMaterials.push(milkyWayMaterial);
    const milkyWayBand = new THREE.Points(milkyWayGeometry, milkyWayMaterial);
    milkyWayBand.userData.clickPriority = 6;
    milkyWayBand.rotation.set(0.02, -0.05, -0.11);
    if (!orbitStarfieldMode) {
      interactiveSpace.add(milkyWayBand);
      clickablePointClouds.push(milkyWayBand);
    }

    const nebulaGeometry = new THREE.BufferGeometry();
    const nebulaCount = 38000;
    const nebulaPositions = new Float32Array(nebulaCount * 3);
    const nebulaColors = new Float32Array(nebulaCount * 3);
    const nebulaSizes = new Float32Array(nebulaCount);
    const nebulaAlphas = new Float32Array(nebulaCount);
    const nebulaPhases = new Float32Array(nebulaCount);
    const nebulaGold = new THREE.Color("#ff9950");
    const nebulaMint = new THREE.Color("#48f0b4");
    const nebulaRose = new THREE.Color("#ff75b7");
    const nebulaViolet = new THREE.Color("#c47bff");
    const nebulaKnotCount = 42;
    for (let i = 0; i < nebulaCount; i += 1) {
      const knotIndex = Math.floor(hashUnit(seedKey, i + 4511) * nebulaKnotCount);
      const knotSalt = 16400 + knotIndex * 67;
      const knotProgress = hashUnit(seedKey, knotSalt + 1);
      const scattered = hashUnit(seedKey, i + 4521) < 0.3;
      const t = THREE.MathUtils.clamp(scattered ? hashUnit(seedKey, i + 4531) : knotProgress + bellHash(i + 4541) * (0.16 + knotProgress * 0.14), 0.02, 0.98);
      const radius = 0.8 + Math.pow(t, 0.58) * 11.3 + bellHash(i + 4551) * (0.42 + t * 0.9);
      const angle = scattered
        ? hashUnit(seedKey, i + 4561) * Math.PI * 2 + Math.sin(radius * 0.36) * 0.3
        : spiralKnotAngle(knotProgress, knotSalt + 2) + bellHash(i + 4571) * (0.9 + t * 1.18);
      const depth = -1.1 + bellHash(i + 4581) * (0.72 + radius * 0.052);
      nebulaPositions[i * 3] = Math.cos(angle) * radius * (1.02 + hashUnit(seedKey, i + 4587) * 0.08);
      nebulaPositions[i * 3 + 1] = Math.sin(angle) * radius * 0.78 + bellHash(i + 4591) * (0.22 + radius * 0.028);
      nebulaPositions[i * 3 + 2] = depth;
      const colorNoise = hashUnit(seedKey, i + 4551);
      const color =
        radius < 4.0
          ? new THREE.Color("#f4f0e7")
          : radius < 8.0
            ? colorNoise < 0.86 ? nebulaMint : nebulaGold
            : colorNoise < 0.62 ? nebulaGold : colorNoise < 0.9 ? nebulaRose : nebulaViolet;
      mixColor(nebulaColors, i, color, 0.72 + hashUnit(seedKey, i + 4601) * 0.46);
      nebulaSizes[i] = 0.06 + hashUnit(seedKey, i + 4611) * 0.38 + (radius < 4.2 ? 0.16 : 0);
      nebulaAlphas[i] = 0.34 + hashUnit(seedKey, i + 4621) * 0.36 + (radius < 4.2 ? 0.14 : 0);
      nebulaPhases[i] = hashUnit(seedKey, i + 4631) * Math.PI * 2;
    }
    nebulaGeometry.setAttribute("position", new THREE.BufferAttribute(nebulaPositions, 3));
    nebulaGeometry.setAttribute("color", new THREE.BufferAttribute(nebulaColors, 3));
    nebulaGeometry.setAttribute("aSize", new THREE.BufferAttribute(nebulaSizes, 1));
    nebulaGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(nebulaAlphas, 1));
    nebulaGeometry.setAttribute("aPhase", new THREE.BufferAttribute(nebulaPhases, 1));
    const nebulaMaterial = createStellarMaterial(0.24);
    stellarMaterials.push(nebulaMaterial);
    const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    nebula.userData.clickPriority = 6;
    nebula.rotation.set(0.02, -0.04, -0.12);
    if (!orbitStarfieldMode) {
      interactiveSpace.add(nebula);
      clickablePointClouds.push(nebula);
    }
    const parallaxLayers = orbitStarfieldMode ? [stars, chromaticMist] : [stars, chromaticMist, milkyWayBand, nebula];

    const galaxyGeometry = new THREE.BufferGeometry();
    const galaxyCount = 116000;
    const galaxyPositions = new Float32Array(galaxyCount * 3);
    const galaxyColors = new Float32Array(galaxyCount * 3);
    const galaxySizes = new Float32Array(galaxyCount);
    const galaxyAlphas = new Float32Array(galaxyCount);
    const galaxyPhases = new Float32Array(galaxyCount);
    const galaxyWarm = new THREE.Color("#ff9950");
    const galaxyHot = new THREE.Color("#fffaf0");
    const galaxyMint = new THREE.Color("#48f0b4");
    const galaxyRose = new THREE.Color("#ff75b7");
    const galaxyViolet = new THREE.Color("#c47bff");
    const galaxyKnotCount = 68;
    for (let i = 0; i < galaxyCount; i += 1) {
      const knotIndex = Math.floor(hashUnit(seedKey, i + 3051) * galaxyKnotCount);
      const knotSalt = 20400 + knotIndex * 71;
      const knotRoll = hashUnit(seedKey, knotSalt + 1);
      const knotProgress =
        knotRoll < 0.18 ? 0.04 + hashUnit(seedKey, knotSalt + 2) * 0.2 : knotRoll < 0.56 ? 0.26 + hashUnit(seedKey, knotSalt + 3) * 0.28 : 0.58 + hashUnit(seedKey, knotSalt + 4) * 0.38;
      const freeDust = hashUnit(seedKey, i + 3181) < 0.26;
      const t = THREE.MathUtils.clamp(freeDust ? Math.pow(hashUnit(seedKey, i + 3101), 0.64) : knotProgress + bellHash(i + 3201) * (0.14 + knotProgress * 0.16), 0.01, 0.98);
      const radius = 0.3 + t * 11.2 + bellHash(i + 3211) * (0.26 + t * 0.58);
      const angle = freeDust
        ? hashUnit(seedKey, i + 3191) * Math.PI * 2 + Math.sin(radius * 0.42) * 0.32
        : spiralKnotAngle(knotProgress, knotSalt + 5) + bellHash(i + 3221) * (0.82 + t * 1.18);
      const lane = bellHash(i + 3231) * (0.2 + radius * 0.06);
      const vertical = bellHash(i + 3301) * (0.26 + radius * 0.043);
      const depth = bellHash(i + 3401) * (0.34 + radius * 0.06);
      galaxyPositions[i * 3] = Math.cos(angle) * (radius + lane) * 1.04;
      galaxyPositions[i * 3 + 1] = Math.sin(angle) * (radius + lane) * 0.78 + vertical;
      galaxyPositions[i * 3 + 2] = -0.82 + depth;
      const tintNoise = hashUnit(seedKey, i + 3451);
      const color =
        i % 181 === 0
          ? galaxyHot
          : radius < 4.2
            ? galaxyHot
            : radius < 8.0
              ? tintNoise < 0.76 ? galaxyMint : galaxyWarm
              : radius > 9.0
                ? tintNoise < 0.64 ? galaxyWarm : tintNoise < 0.92 ? galaxyRose : galaxyViolet
                : tintNoise < 0.58
                  ? galaxyMint
                  : tintNoise < 0.84
                    ? galaxyWarm
                    : galaxyRose;
      const falloff = 1 - t * 0.16;
      mixColor(galaxyColors, i, color, 0.86 + falloff * 0.42);
      galaxySizes[i] = 0.055 + hashUnit(seedKey, i + 3501) * 0.34 + (t < 0.18 ? 0.18 : 0) + (i % 613 === 0 ? 0.22 : 0);
      galaxyAlphas[i] = 0.42 + Math.pow(1 - t, 1.1) * 0.44 + hashUnit(seedKey, i + 3601) * 0.2;
      galaxyPhases[i] = hashUnit(seedKey, i + 3701) * Math.PI * 2;
    }
    galaxyGeometry.setAttribute("position", new THREE.BufferAttribute(galaxyPositions, 3));
    galaxyGeometry.setAttribute("color", new THREE.BufferAttribute(galaxyColors, 3));
    galaxyGeometry.setAttribute("aSize", new THREE.BufferAttribute(galaxySizes, 1));
    galaxyGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(galaxyAlphas, 1));
    galaxyGeometry.setAttribute("aPhase", new THREE.BufferAttribute(galaxyPhases, 1));
    const galaxyMaterial = createStellarMaterial(0.24);
    stellarMaterials.push(galaxyMaterial);
    const galaxyDisk = new THREE.Points(galaxyGeometry, galaxyMaterial);
    galaxyDisk.userData.clickPriority = 8;
    galaxyDisk.rotation.set(0.02, -0.04, -0.08);
    if (!orbitStarfieldMode) {
      group.add(galaxyDisk);
      clickablePointClouds.push(galaxyDisk);
    }

    const coreGeometry = new THREE.BufferGeometry();
    const coreCount = 96000;
    const corePositions = new Float32Array(coreCount * 3);
    const coreColors = new Float32Array(coreCount * 3);
    const coreSizes = new Float32Array(coreCount);
    const coreAlphas = new Float32Array(coreCount);
    const corePhases = new Float32Array(coreCount);
    const coreGold = new THREE.Color("#fff2c6");
    const coreWhite = new THREE.Color("#fffdf4");
    const coreTeal = new THREE.Color("#a6ffe1");
    const coreRose = new THREE.Color("#ffd2e2");
    for (let i = 0; i < coreCount; i += 1) {
      const angle = Math.random() * Math.PI * 2 + hashUnit(seedKey, i % 19) * 0.24;
      const radius = Math.pow(Math.random(), 2.12) * 5.2;
      const zBand = (Math.random() - 0.5) * (0.5 + radius * 0.07);
      corePositions[i * 3] = Math.cos(angle) * radius * 1.05 + (Math.random() - 0.5) * 0.08;
      corePositions[i * 3 + 1] = Math.sin(angle) * radius * 0.82 + (Math.random() - 0.5) * 0.2;
      corePositions[i * 3 + 2] = -0.68 + zBand;
      const color =
        radius < 2.1
          ? coreWhite
          : radius < 3.8
            ? i % 5 === 0 ? coreWhite : coreGold
            : i % 31 === 0 ? coreTeal : i % 17 === 0 ? coreRose : coreGold;
      mixColor(coreColors, i, color, radius < 2.1 ? 1.36 + Math.random() * 0.5 : 0.76 + Math.random() * 0.38);
      coreSizes[i] = 0.06 + Math.random() * 0.3 + (radius < 1.7 ? 0.2 : 0) + (i % 277 === 0 ? 0.26 : 0);
      coreAlphas[i] = 0.44 + Math.pow(1 - radius / 5.2, 2.0) * 0.68 + Math.random() * 0.12;
      corePhases[i] = Math.random() * Math.PI * 2;
    }
    coreGeometry.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
    coreGeometry.setAttribute("color", new THREE.BufferAttribute(coreColors, 3));
    coreGeometry.setAttribute("aSize", new THREE.BufferAttribute(coreSizes, 1));
    coreGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(coreAlphas, 1));
    coreGeometry.setAttribute("aPhase", new THREE.BufferAttribute(corePhases, 1));
    const coreMaterial = createStellarMaterial(0.54);
    stellarMaterials.push(coreMaterial);
    const coreCloud = new THREE.Points(coreGeometry, coreMaterial);
    coreCloud.userData.clickPriority = 8;
    coreCloud.rotation.set(0.06, -0.18, 0.02);
    if (!orbitStarfieldMode) {
      group.add(coreCloud);
      clickablePointClouds.push(coreCloud);
    }

    const auroraRingGeometry = new THREE.BufferGeometry();
    const auroraRingCount = 168000;
    const auroraPositions = new Float32Array(auroraRingCount * 3);
    const auroraColors = new Float32Array(auroraRingCount * 3);
    const auroraSizes = new Float32Array(auroraRingCount);
    const auroraAlphas = new Float32Array(auroraRingCount);
    const auroraPhases = new Float32Array(auroraRingCount);
    const auroraPoetIndices = new Uint16Array(auroraRingCount);
    const outerRose = new THREE.Color("#ff8fb8");
    const outerPink = new THREE.Color("#ffc0d4");
    const outerViolet = new THREE.Color("#df9be8");
    const auroraMint = new THREE.Color("#8cffd5");
    const auroraAqua = new THREE.Color("#c8fff0");
    const auroraGold = new THREE.Color("#ffe59a");
    const auroraWhite = new THREE.Color("#fffdf4");
    const spiralArmCount = 4;
    const spiralClusterCount = 50;
    for (let i = 0; i < auroraRingCount; i += 1) {
      const clusterIndex = Math.floor(hashUnit(seedKey, i + 30001) * spiralClusterCount);
      const clusterSalt = 30300 + clusterIndex * 43;
      const layerRoll = hashUnit(seedKey, clusterSalt + 1);
      const clusterProgress =
        layerRoll < 0.16
          ? 0.08 + hashUnit(seedKey, clusterSalt + 2) * 0.18
          : layerRoll < 0.58
            ? 0.28 + hashUnit(seedKey, clusterSalt + 3) * 0.28
            : 0.58 + hashUnit(seedKey, clusterSalt + 4) * 0.38;
      const clusterAngle =
        hashUnit(seedKey, clusterSalt + 5) * Math.PI * 2 +
        clusterProgress * 1.55 +
        Math.sin(clusterProgress * 5.8 + hashUnit(seedKey, clusterSalt + 6) * Math.PI * 2) * 0.42 +
        (hashUnit(seedKey, clusterSalt + 7) - 0.5) * 0.36;
      const diffuse = hashUnit(seedKey, i + 30021) < 0.34;
      const radialScatter = bellHash(i + 30041);
      const angleScatter = bellHash(i + 30071);
      const clusterWidth = 0.22 + clusterProgress * 0.26;
      const progress = THREE.MathUtils.clamp(
        diffuse ? Math.pow(hashUnit(seedKey, i + 30101), 0.68) : clusterProgress + radialScatter * clusterWidth,
        0.04,
        0.98,
      );
      const radius = diffuse
        ? 0.22 + progress * 4.45 + bellHash(i + 30105) * (0.56 + progress * 1.02)
        : 0.22 + clusterProgress * 4.45 + radialScatter * (0.88 + clusterProgress * 1.34);
      const angle = diffuse
        ? hashUnit(seedKey, i + 30111) * Math.PI * 2 + Math.sin(radius * 0.5) * 0.34
        : clusterAngle + angleScatter * (1.65 + clusterProgress * 2.1);
      const lifted = bellHash(i + 30121) * (0.38 + progress * 0.78);
      auroraPositions[i * 3] = Math.cos(angle) * radius * 1.04 + bellHash(i + 30131) * (0.22 + progress * 0.26);
      auroraPositions[i * 3 + 1] = Math.sin(angle) * radius * 0.78 + lifted;
      auroraPositions[i * 3 + 2] = -1.16 + bellHash(i + 30141) * (0.52 + progress * 0.58);

      const colorNoise = hashUnit(seedKey, i + 30151);
      const color =
        progress < 0.22
          ? colorNoise < 0.58 ? auroraWhite : colorNoise < 0.86 ? auroraGold : auroraAqua
          : progress < 0.62
            ? colorNoise < 0.58 ? auroraMint : colorNoise < 0.78 ? auroraAqua : colorNoise < 0.92 ? auroraGold : outerPink
            : colorNoise < 0.64 ? outerRose : colorNoise < 0.82 ? outerPink : colorNoise < 0.94 ? outerViolet : auroraGold;
      const hot = !diffuse && hashUnit(seedKey, clusterSalt + 8) > 0.48 ? 1 : 0;
      const localDensity = diffuse ? 0.26 : 0.92 + hashUnit(seedKey, clusterSalt + 9) * 0.42;
      mixColor(auroraColors, i, color, localDensity + hashUnit(seedKey, i + 30161) * 0.48 + hot * 0.2);
      auroraSizes[i] = 0.055 + progress * 0.12 + hashUnit(seedKey, i + 30171) * (0.34 + progress * 0.22) + hot * 0.14;
      auroraAlphas[i] = 0.36 + progress * 0.34 + hashUnit(seedKey, i + 30181) * 0.38 + hot * 0.16;
      auroraPhases[i] = hashUnit(seedKey, i + 30191) * Math.PI * 2;
      auroraPoetIndices[i] = Math.floor(hashUnit(seedKey, i + 30201) * activePoetCount);
    }
    auroraRingGeometry.setAttribute("position", new THREE.BufferAttribute(auroraPositions, 3));
    auroraRingGeometry.setAttribute("color", new THREE.BufferAttribute(auroraColors, 3));
    auroraRingGeometry.setAttribute("aSize", new THREE.BufferAttribute(auroraSizes, 1));
    auroraRingGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(auroraAlphas, 1));
    auroraRingGeometry.setAttribute("aPhase", new THREE.BufferAttribute(auroraPhases, 1));
    const auroraRingMaterial = createStellarMaterial(0.58);
    auroraRingMaterial.uniforms.uPointScale.value = 6.35;
    stellarMaterials.push(auroraRingMaterial);
    const auroraRing = new THREE.Points(auroraRingGeometry, auroraRingMaterial);
    auroraRing.userData.poetIndices = auroraPoetIndices;
    auroraRing.userData.clickPriority = 10;
    auroraRing.rotation.set(0.02, -0.05, -0.1);
    if (!orbitStarfieldMode) {
      group.add(auroraRing);
      clickablePointClouds.push(auroraRing);
    }

    const referenceGalaxyGeometry = new THREE.BufferGeometry();
    const referenceGalaxyCount = 220000;
    const referenceGalaxyPositions = new Float32Array(referenceGalaxyCount * 3);
    const referenceGalaxyColors = new Float32Array(referenceGalaxyCount * 3);
    const referenceGalaxySizes = new Float32Array(referenceGalaxyCount);
    const referenceGalaxyAlphas = new Float32Array(referenceGalaxyCount);
    const referenceGalaxyPhases = new Float32Array(referenceGalaxyCount);
    const referenceGalaxyPoetIndices = new Uint16Array(referenceGalaxyCount);
    const referenceWhite = new THREE.Color("#fffdf4");
    const referencePearl = new THREE.Color("#dfe4da");
    const referenceMint = new THREE.Color("#55f0b2");
    const referenceAqua = new THREE.Color("#9dffe1");
    const referenceAmber = new THREE.Color("#ff9c55");
    const referenceRose = new THREE.Color("#ff6fa8");
    const referenceViolet = new THREE.Color("#d487ff");
    for (let i = 0; i < referenceGalaxyCount; i += 1) {
      const roll = hashUnit(seedKey, i + 52001);
      const noise = hashUnit(seedKey, i + 52011);
      const lobe = Math.floor(hashUnit(seedKey, i + 52021) * 9);
      let radius = 0;
      let angle = 0;
      let height = 0;
      let color = referencePearl;
      let colorStrength = 1;
      let pointSize = 0.08;
      let pointAlpha = 0.4;

      if (roll < 0.24) {
        radius = Math.pow(hashUnit(seedKey, i + 52031), 2.25) * 2.65;
        angle = hashUnit(seedKey, i + 52041) * Math.PI * 2;
        height = bellHash(i + 52051) * (0.28 + radius * 0.05);
        color = radius < 1.15 ? referenceWhite : noise < 0.82 ? referencePearl : referenceAmber;
        colorStrength = radius < 1.15 ? 1.85 : 1.18;
        pointSize = 0.09 + hashUnit(seedKey, i + 52061) * 0.38 + (radius < 0.95 ? 0.18 : 0);
        pointAlpha = 0.62 + Math.pow(1 - radius / 2.65, 1.5) * 0.58;
      } else if (roll < 0.52) {
        const t = Math.pow(hashUnit(seedKey, i + 52071), 0.78);
        radius = 2.0 + t * 4.35 + bellHash(i + 52081) * 0.34;
        angle = hashUnit(seedKey, i + 52091) * Math.PI * 2 + radius * 0.1 + bellHash(i + 52101) * 0.38;
        height = bellHash(i + 52111) * (0.42 + radius * 0.045);
        color = noise < 0.72 ? referencePearl : noise < 0.9 ? referenceMint : referenceAmber;
        colorStrength = 0.98 + hashUnit(seedKey, i + 52121) * 0.38;
        pointSize = 0.065 + hashUnit(seedKey, i + 52131) * 0.28;
        pointAlpha = 0.44 + hashUnit(seedKey, i + 52141) * 0.34;
      } else if (roll < 0.78) {
        const t = Math.pow(hashUnit(seedKey, i + 52151), 0.84);
        radius = 4.25 + t * 3.95 + bellHash(i + 52161) * 0.46;
        angle = lobe * ((Math.PI * 2) / 9) + radius * 0.18 + bellHash(i + 52171) * (0.54 + t * 0.28);
        height = bellHash(i + 52181) * (0.52 + radius * 0.035);
        color = noise < 0.84 ? referenceMint : noise < 0.95 ? referenceAqua : referenceAmber;
        colorStrength = 1.08 + hashUnit(seedKey, i + 52191) * 0.5;
        pointSize = 0.075 + hashUnit(seedKey, i + 52201) * 0.3 + (i % 997 === 0 ? 0.2 : 0);
        pointAlpha = 0.5 + hashUnit(seedKey, i + 52211) * 0.42;
      } else {
        const t = Math.pow(hashUnit(seedKey, i + 52221), 0.72);
        radius = 7.0 + t * 4.85 + bellHash(i + 52231) * 0.62;
        angle = lobe * ((Math.PI * 2) / 9) + radius * 0.12 + bellHash(i + 52241) * (0.7 + t * 0.36);
        height = bellHash(i + 52251) * (0.58 + radius * 0.035);
        color = noise < 0.58 ? referenceAmber : noise < 0.9 ? referenceRose : referenceViolet;
        colorStrength = 1.02 + hashUnit(seedKey, i + 52261) * 0.5;
        pointSize = 0.065 + hashUnit(seedKey, i + 52271) * 0.28 + (i % 1259 === 0 ? 0.22 : 0);
        pointAlpha = 0.42 + hashUnit(seedKey, i + 52281) * 0.4;
      }

      referenceGalaxyPositions[i * 3] = Math.cos(angle) * radius * 1.06 + bellHash(i + 52291) * 0.08;
      referenceGalaxyPositions[i * 3 + 1] = Math.sin(angle) * radius * 0.76 + height;
      referenceGalaxyPositions[i * 3 + 2] = -0.9 + bellHash(i + 52301) * (0.42 + radius * 0.04);
      mixColor(referenceGalaxyColors, i, color, colorStrength);
      referenceGalaxySizes[i] = pointSize;
      referenceGalaxyAlphas[i] = pointAlpha;
      referenceGalaxyPhases[i] = hashUnit(seedKey, i + 52311) * Math.PI * 2;
      referenceGalaxyPoetIndices[i] = Math.floor(hashUnit(seedKey, i + 52321) * activePoetCount);
    }
    referenceGalaxyGeometry.setAttribute("position", new THREE.BufferAttribute(referenceGalaxyPositions, 3));
    referenceGalaxyGeometry.setAttribute("color", new THREE.BufferAttribute(referenceGalaxyColors, 3));
    referenceGalaxyGeometry.setAttribute("aSize", new THREE.BufferAttribute(referenceGalaxySizes, 1));
    referenceGalaxyGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(referenceGalaxyAlphas, 1));
    referenceGalaxyGeometry.setAttribute("aPhase", new THREE.BufferAttribute(referenceGalaxyPhases, 1));
    const referenceGalaxyMaterial = createStellarMaterial(0.64);
    referenceGalaxyMaterial.uniforms.uPointScale.value = 6.0;
    stellarMaterials.push(referenceGalaxyMaterial);
    const referenceGalaxy = new THREE.Points(referenceGalaxyGeometry, referenceGalaxyMaterial);
    referenceGalaxy.userData.poetIndices = referenceGalaxyPoetIndices;
    referenceGalaxy.userData.clickPriority = 14;
    referenceGalaxy.rotation.set(0.02, -0.04, -0.04);
    if (!orbitStarfieldMode) {
      group.add(referenceGalaxy);
      clickablePointClouds.push(referenceGalaxy);
    }

    const softNebulaGroup = new THREE.Group();
    if (nebulaTexture) {
      const spriteKnotCount = 32;
      for (let i = 0; i < 128; i += 1) {
        const knotIndex = Math.floor(hashUnit(seedKey, i + 2811) * spriteKnotCount);
        const knotSalt = 34200 + knotIndex * 59;
        const knotRoll = hashUnit(seedKey, knotSalt + 1);
        const knotProgress =
          knotRoll < 0.18 ? 0.08 + hashUnit(seedKey, knotSalt + 2) * 0.2 : knotRoll < 0.58 ? 0.28 + hashUnit(seedKey, knotSalt + 3) * 0.3 : 0.58 + hashUnit(seedKey, knotSalt + 4) * 0.38;
        const loose = hashUnit(seedKey, i + 2841) < 0.22;
        const progress = THREE.MathUtils.clamp(loose ? Math.pow(hashUnit(seedKey, i + 2851), 0.72) : knotProgress + bellHash(i + 2861) * 0.18, 0.06, 0.98);
        const radius = 0.28 + progress * 3.9 + bellHash(i + 2821) * (0.48 + progress * 0.96);
        const angle = loose
          ? hashUnit(seedKey, i + 2871) * Math.PI * 2 + Math.sin(radius * 0.42) * 0.34
          : spiralKnotAngle(knotProgress, knotSalt + 5, spiralArmCount) + bellHash(i + 2881) * (0.72 + progress * 1.18);
        const colorNoise = hashUnit(seedKey, i + 2931);
        const cloudColor =
          progress < 0.22
            ? colorNoise < 0.56 ? "#8cffd5" : colorNoise < 0.76 ? "#fff0b8" : "#ff9fbe"
            : progress < 0.62
              ? colorNoise < 0.36 ? "#8cffd5" : colorNoise < 0.8 ? "#ff8fb8" : "#ffd58e"
              : colorNoise < 0.72 ? "#ff8fb8" : colorNoise < 0.9 ? "#df9be8" : "#ffd18a";
        const cloudOpacity = (0.045 + hashUnit(seedKey, i + 2871) * 0.085) * (loose ? 0.58 : 1) * (progress < 0.55 && cloudColor === "#8cffd5" ? 0.8 : 1.14);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: nebulaTexture,
            color: cloudColor,
            transparent: true,
            opacity: cloudOpacity,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(
          Math.cos(angle) * radius * 1.04 + bellHash(i + 2891) * 0.34,
          Math.sin(angle) * radius * 0.78 + bellHash(i + 2901) * (0.36 + progress * 0.34),
          -1.42 + bellHash(i + 2911) * (0.58 + progress * 0.42),
        );
        const scale = 1.2 + hashUnit(seedKey, i + 2921) * 2.95 + (progress < 0.22 ? 0.66 : 0);
        sprite.scale.set(scale * (1.02 + progress * 0.1), scale * (0.72 + hashUnit(seedKey, i + 2941) * 0.38), 1);
        sprite.rotation.z = angle + Math.PI * 0.5 + hashUnit(seedKey, i + 2951) * 0.72;
        sprite.renderOrder = -2;
        softNebulaGroup.add(sprite);
      }

      const coreVeil = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTexture,
          color: "#fff6dc",
          transparent: true,
          opacity: 0.052,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      coreVeil.position.set(0.16, -0.02, -1.08);
      coreVeil.scale.set(2.85, 1.88, 1);
      coreVeil.renderOrder = -1;
      softNebulaGroup.add(coreVeil);

      for (let i = 0; i < 8; i += 1) {
        const progress = 0.18 + hashUnit(seedKey, i + 2951) * 0.38;
        const angle = hashUnit(seedKey, i + 2941) * Math.PI * 2 + Math.sin(progress * 5.6 + i) * 0.3;
        const radius = 0.45 + progress * 2.2 + bellHash(i + 2947) * 0.38;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: nebulaTexture,
            color: i % 3 === 0 ? "#fff0b8" : "#8cffd5",
            transparent: true,
            opacity: 0.04 + hashUnit(seedKey, i + 2961) * 0.028,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(Math.cos(angle) * radius * 0.92, Math.sin(angle) * radius * 0.66, -1.16);
        sprite.scale.set(1.45 + hashUnit(seedKey, i + 2971) * 0.9, 0.88 + hashUnit(seedKey, i + 2981) * 0.5, 1);
        sprite.rotation.z = angle + Math.PI * 0.5 + hashUnit(seedKey, i + 2991) * 0.72;
        sprite.renderOrder = -1;
        softNebulaGroup.add(sprite);
      }

      for (let i = 0; i < 34; i += 1) {
        const progress = 0.58 + hashUnit(seedKey, i + 30201) * 0.38;
        const angle = spiralKnotAngle(progress, 36200 + i * 71, spiralArmCount) + bellHash(i + 30211) * (0.62 + progress * 0.72);
        const radius = 0.55 + progress * 3.75 + bellHash(i + 30221) * (0.5 + progress * 0.42);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: nebulaTexture,
            color: i % 5 === 0 ? "#ffd18a" : i % 7 === 0 ? "#df9be8" : "#ff8fb8",
            transparent: true,
            opacity: 0.062 + hashUnit(seedKey, i + 30231) * 0.062,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(Math.cos(angle) * radius * 1.02, Math.sin(angle) * radius * 0.78, -1.38);
        sprite.scale.set(1.55 + hashUnit(seedKey, i + 30241) * 1.6, 0.95 + hashUnit(seedKey, i + 30251) * 0.85, 1);
        sprite.rotation.z = angle + Math.PI * 0.5 + hashUnit(seedKey, i + 30261) * 0.72;
        sprite.renderOrder = -1;
        softNebulaGroup.add(sprite);
      }
    }
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(softNebulaGroup);

    const hazeGroup = new THREE.Group();
    if (glowTexture) {
      for (let i = 0; i < 320; i += 1) {
        const angle = hashUnit(seedKey, i + 1701) * Math.PI * 2;
        const radius = Math.pow(hashUnit(seedKey, i + 1801), 1.72) * 6.6;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: i % 17 === 0 ? "#b8e3d5" : "#d9b47f",
            transparent: true,
            opacity: 0.002 + hashUnit(seedKey, i + 1901) * 0.006,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(
          Math.cos(angle) * radius * 0.92,
          Math.sin(angle) * radius * 0.68 + (hashUnit(seedKey, i + 2001) - 0.5) * 0.5,
          -1.05 + (hashUnit(seedKey, i + 2051) - 0.5) * (0.52 + radius * 0.04),
        );
        sprite.scale.setScalar(0.18 + hashUnit(seedKey, i + 2101) * 0.56);
        hazeGroup.add(sprite);
      }
    }
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(hazeGroup);

    const veilGroup = new THREE.Group();
    if (glowTexture) {
      const veilColors = ["#db91a8", "#db91a8", "#d58da8", "#b3dfcf", "#d0ad7c", "#bba2c8"];
      for (let i = 0; i < 180; i += 1) {
        const progress = Math.pow(hashUnit(seedKey, i + 2211), 0.72);
        const radius = 2.8 + progress * 8.8 + bellHash(i + 2217) * (0.46 + progress * 0.84);
        const angle =
          spiralKnotAngle(progress, 39200 + i * 17, 4) * 0.72 +
          hashUnit(seedKey, i + 2201) * Math.PI * 0.56 +
          bellHash(i + 2221) * (0.96 + radius * 0.08);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: veilColors[i % veilColors.length],
            transparent: true,
            opacity: 0.003 + hashUnit(seedKey, i + 2231) * 0.008,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(
          Math.cos(angle) * radius * 1.02,
          Math.sin(angle) * radius * 0.78 + bellHash(i + 2241) * 0.32,
          -1.18 + bellHash(i + 2251) * 0.42,
        );
        sprite.scale.setScalar(0.75 + hashUnit(seedKey, i + 2261) * 1.9);
        veilGroup.add(sprite);
      }
    }
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(veilGroup);

    const poemHalo = new THREE.Group();
    if (glowTexture) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: "#ffffff",
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.position.set(0.1, -0.02, -0.78);
      halo.scale.setScalar(1.62);
      poemHalo.add(halo);
    }
    const haloRingMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe3a2",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.008, 8, 220), haloRingMaterial);
    haloRing.position.set(0, -0.04, -0.8);
    haloRing.rotation.set(1.25, 0.32, 0.18);
    poemHalo.add(haloRing);
    const haloRingB = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.005, 8, 260), haloRingMaterial.clone());
    haloRingB.position.set(0, -0.04, -0.8);
    haloRingB.rotation.set(1.08, -0.48, -0.18);
    poemHalo.add(haloRingB);
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(poemHalo);

    const strandPositions: number[] = [];
    const strandCount = 260;
    for (let i = 0; i < strandCount; i += 1) {
      const topBias = i % 4 !== 0;
      const startAngle = hashUnit(seedKey, i + 101) * Math.PI * 2;
      const startRadius = 4.4 + hashUnit(seedKey, i + 211) * 9.4;
      const endRadius = Math.pow(hashUnit(seedKey, i + 307), 1.8) * 3.15;
      const endAngle = startAngle + (hashUnit(seedKey, i + 401) - 0.5) * 1.8;
      const start = new THREE.Vector3(
        Math.cos(startAngle) * startRadius * 1.08,
        topBias ? 2.4 + hashUnit(seedKey, i + 503) * 2.4 : (hashUnit(seedKey, i + 509) - 0.5) * 4.4,
        -4.8 + Math.sin(startAngle) * startRadius * 0.56,
      );
      const end = new THREE.Vector3(
        Math.cos(endAngle) * endRadius,
        (hashUnit(seedKey, i + 607) - 0.5) * 1.3,
        -0.9 + Math.sin(endAngle) * endRadius * 0.46,
      );
      const control = new THREE.Vector3(
        (start.x + end.x) * 0.34 + (hashUnit(seedKey, i + 701) - 0.5) * 2.4,
        topBias ? 1.24 + hashUnit(seedKey, i + 809) * 1.34 : (start.y + end.y) * 0.42,
        (start.z + end.z) * 0.42 + (hashUnit(seedKey, i + 907) - 0.5) * 1.8,
      );
      let previous = start;
      const segments = 7;
      for (let step = 1; step <= segments; step += 1) {
        const t = step / segments;
        const a = start.clone().lerp(control, t);
        const b = control.clone().lerp(end, t);
        const point = a.lerp(b, t);
        strandPositions.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
        previous = point;
      }
    }
    const strandGeometry = new THREE.BufferGeometry();
    strandGeometry.setAttribute("position", new THREE.Float32BufferAttribute(strandPositions, 3));
    const strandMaterial = new THREE.LineBasicMaterial({
      color: "#d6b969",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const strands = new THREE.LineSegments(strandGeometry, strandMaterial);
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(strands);

    const bokehGroup = new THREE.Group();
    if (glowTexture) {
      for (let i = 0; i < 70; i += 1) {
        const angle = hashUnit(seedKey, i + 1201) * Math.PI * 2;
        const radius = Math.pow(hashUnit(seedKey, i + 1301), 1.55) * 8.6;
        const color = i % 13 === 0 ? "#abe4d1" : i % 7 === 0 ? "#df95ad" : "#efe1bf";
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            transparent: true,
            opacity: 0.003 + hashUnit(seedKey, i + 1401) * 0.012,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.position.set(
          Math.cos(angle) * radius * 1.15,
          (hashUnit(seedKey, i + 1501) - 0.5) * 5.2,
          -1.6 + Math.sin(angle) * radius * 0.55,
        );
        sprite.scale.setScalar(0.04 + hashUnit(seedKey, i + 1601) * 0.18);
        bokehGroup.add(sprite);
      }
    }
    if (!orbitStarfieldMode && !crispParticleGalaxy) group.add(bokehGroup);

    const zoomFadedSpriteMaterials: THREE.SpriteMaterial[] = [];
    [softNebulaGroup, hazeGroup, veilGroup, poemHalo, bokehGroup].forEach((layer) => {
      layer.traverse((object) => {
        const material = (object as THREE.Sprite).material;
        if (material instanceof THREE.SpriteMaterial) {
          material.userData.baseOpacity = material.opacity;
          zoomFadedSpriteMaterials.push(material);
        }
      });
    });

    const dustGeometry = new THREE.TorusGeometry(6.4, 0.0025, 8, 300);
    const dustMaterial = new THREE.MeshBasicMaterial({
      color: "#d8c98d",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ringA = new THREE.Mesh(dustGeometry, dustMaterial);
    ringA.rotation.set(1.25, 0.18, 0.4);
    group.add(ringA);
    const ringB = new THREE.Mesh(dustGeometry.clone(), dustMaterial.clone());
    ringB.rotation.set(1.06, 0.9, -0.3);
    ringB.scale.set(1.32, 0.72, 1);
    group.add(ringB);

    poetRefs.current.clear();
    const poetStarMeshes: THREE.Object3D[] = [];
    const poetCoreHitMeshes: THREE.Object3D[] = [];
    const orbitalSystems: OrbitalSystem[] = [];
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    activePoets.forEach((poet, poetIndex) => {
      const knownPoemCount = poet.poemCount ?? poemDensity.get(poet.id) ?? 0;
      const density = Math.max(knownPoemCount, 1);
      const isInitiallySelected = poet.id === selectedPoetId;
      const densityScale = Math.log2(density + 1);
      const fameScale = getPoetFameScale(poet, density);
      const orbitScale = 1 + (fameScale - 1) * 0.42;
      const displayX = orbitStarfieldMode && isInitiallySelected ? -0.65 : poet.x;
      const displayY = orbitStarfieldMode && isInitiallySelected ? -0.1 : poet.y;
      const displayZ = orbitStarfieldMode && isInitiallySelected ? -0.9 : poet.z;
      const cameraDistance = Math.hypot(displayX - camera.position.x, displayY - camera.position.y, displayZ - camera.position.z);
      const perspectiveScale = THREE.MathUtils.clamp(cameraDistance / 5.8, 0.16, 1);
      const baseRadius = isInitiallySelected ? 0.026 + Math.min(densityScale, 10) * 0.0021 : 0.011 + Math.min(densityScale, 8) * 0.0012;
      const radius = baseRadius * fameScale * perspectiveScale;
      const color = colorByDynasty[poet.dynasty] ?? "#f8fff3";
      const starCoreColor = orbitStarfieldMode && isInitiallySelected
        ? new THREE.Color("#78efff")
        : new THREE.Color(color).lerp(new THREE.Color("#fff7d6"), isInitiallySelected ? 0.56 : 0.34);
      const material = new THREE.MeshBasicMaterial({
        color: starCoreColor,
        transparent: true,
        opacity: orbitStarfieldMode && isInitiallySelected ? 0.82 : isInitiallySelected ? 0.035 : 0.025,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const visualRadius = orbitStarfieldMode && isInitiallySelected ? radius * 3.7 : radius * (isInitiallySelected ? 0.38 : 0.5);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(visualRadius, orbitStarfieldMode && isInitiallySelected ? 28 : 10, orbitStarfieldMode && isInitiallySelected ? 18 : 8), material);
      mesh.position.set(displayX, displayY, displayZ);
      mesh.userData.poetId = poet.id;
      mesh.userData.kind = "poet-star";
      group.add(mesh);
      poetStarMeshes.push(mesh);
      poetRefs.current.set(poet.id, mesh);

      const coreHitRadius = Math.max(
        radius * (isInitiallySelected ? 5.4 : 6.2),
        (isInitiallySelected ? 0.11 : 0.064) * THREE.MathUtils.clamp(perspectiveScale, 0.55, 1),
      );
      const coreHitMesh = new THREE.Mesh(new THREE.SphereGeometry(coreHitRadius, 12, 8), hitMaterial);
      coreHitMesh.position.copy(mesh.position);
      coreHitMesh.userData.poetId = poet.id;
      coreHitMesh.userData.kind = "poet-core-hit";
      group.add(coreHitMesh);
      poetCoreHitMeshes.push(coreHitMesh);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture ?? undefined,
          color: starCoreColor,
          transparent: true,
          opacity: orbitStarfieldMode && isInitiallySelected ? 0.72 : isInitiallySelected ? 0.22 : Math.min(0.14, 0.08 * fameScale),
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      sprite.position.copy(mesh.position);
      sprite.scale.setScalar(orbitStarfieldMode && isInitiallySelected ? radius * 10.5 : isInitiallySelected ? radius * 7.2 : radius * 4.7);
      group.add(sprite);

      const dustCount = isInitiallySelected ? 24 : 8 + Math.min(Math.floor(densityScale), 8) + Math.round((fameScale - 1) * 18);
      const dustGeometry = new THREE.BufferGeometry();
      const dustPositions = new Float32Array(dustCount * 3);
      const dustColors = new Float32Array(dustCount * 3);
      const dustSpread = radius * (isInitiallySelected ? 5.6 : 3.8);
      for (let i = 0; i < dustCount; i += 1) {
        const angle = hashUnit(poet.id, i + 701) * Math.PI * 2;
        const distance = Math.pow(hashUnit(poet.id, i + 711), 0.62) * dustSpread;
        const lift = (hashUnit(poet.id, i + 721) - 0.5) * dustSpread * 0.36;
        dustPositions[i * 3] = Math.cos(angle) * distance;
        dustPositions[i * 3 + 1] = lift;
        dustPositions[i * 3 + 2] = Math.sin(angle) * distance * 0.62;
        const dustLight = 0.72 + hashUnit(poet.id, i + 731) * 0.48;
        mixColor(dustColors, i, starCoreColor, dustLight);
      }
      dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
      dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
      const dustMaterial = new THREE.PointsMaterial({
        size: (isInitiallySelected ? 0.012 : 0.008) * THREE.MathUtils.clamp(perspectiveScale, 0.55, 1),
        map: glowTexture ?? undefined,
        vertexColors: true,
        transparent: true,
        opacity: orbitStarfieldMode && isInitiallySelected ? 0.78 : isInitiallySelected ? 0.5 : Math.min(0.42, 0.28 * fameScale),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const poetDust = new THREE.Points(dustGeometry, dustMaterial);
      poetDust.position.copy(mesh.position);
      group.add(poetDust);

      if (isInitiallySelected || densityScale > 5.6 || fameScale > 1.18) {
        const rayScale = radius * (isInitiallySelected ? 6.2 : 4.2 + (fameScale - 1) * 1.5);
        const rayGeometry = new THREE.BufferGeometry();
        rayGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              -rayScale, 0, 0, rayScale, 0, 0,
              0, -rayScale * 0.42, 0, 0, rayScale * 0.42, 0,
              -rayScale * 0.42, -rayScale * 0.18, 0, rayScale * 0.42, rayScale * 0.18, 0,
            ],
            3,
          ),
        );
        const rayMaterial = new THREE.LineBasicMaterial({
          color: starCoreColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const poetRays = new THREE.LineSegments(rayGeometry, rayMaterial);
        poetRays.position.copy(mesh.position);
        poetRays.rotation.z = hashUnit(poet.id, 741) * Math.PI;
        group.add(poetRays);
      }

      const localPoems = poems.filter((poem) => poem.poetId === poet.id);
      const visualPoemCount = Math.max(localPoems.length, knownPoemCount);
      const virtualCount = visualPoemCount > 0
        ? isInitiallySelected
          ? THREE.MathUtils.clamp(Math.round(Math.sqrt(visualPoemCount) * 2.7), 22, 180)
          : 0
        : isInitiallySelected ? 12 : 0;

      const orbitGroup = new THREE.Group();
      orbitGroup.position.set(displayX, displayY, displayZ);
      orbitGroup.rotation.set(
        (hashUnit(poet.id, 511) - 0.5) * 0.82,
        hashUnit(poet.id, 521) * Math.PI * 2,
        (hashUnit(poet.id, 531) - 0.5) * 0.72,
      );
      group.add(orbitGroup);
      orbitalSystems.push({
        object: orbitGroup,
        speed: (0.00014 + hashUnit(poet.id, 541) * 0.00028) * (poetIndex % 2 === 0 ? 1 : -1),
        wobble: hashUnit(poet.id, 551),
      });

      const poemPointGeometry = new THREE.BufferGeometry();
      const poemPositions = new Float32Array(virtualCount * 3);
      const poemColors = new Float32Array(virtualCount * 3);
      const pointColor = new THREE.Color(color);
      for (let i = 0; i < virtualCount; i += 1) {
        const orbitIndex = i % 4;
        const orbitProgress = i / Math.max(virtualCount - 1, 1);
        const angle = i * 2.39996 + poetIndex * 0.73 + hashUnit(poet.id, i + 1101) * 0.28;
        const band =
          (0.09 + orbitIndex * 0.052 + Math.pow(orbitProgress, 0.62) * (isInitiallySelected ? 0.28 : 0.18) + densityScale * 0.004) *
          orbitScale *
          perspectiveScale *
          (orbitStarfieldMode && isInitiallySelected ? 1.22 : 1);
        const ellipse = 0.58 + orbitIndex * 0.1;
        const lift = Math.sin(angle * 1.7 + orbitIndex) * 0.018 + (hashUnit(poet.id, i + 1111) - 0.5) * 0.025;
        poemPositions[i * 3] = Math.cos(angle) * band;
        poemPositions[i * 3 + 1] = lift;
        poemPositions[i * 3 + 2] = Math.sin(angle) * band * ellipse;
        const planetLight = 0.82 + hashUnit(poet.id, i + 1121) * 0.38;
        poemColors[i * 3] = Math.min(1, pointColor.r * planetLight + 0.1);
        poemColors[i * 3 + 1] = Math.min(1, pointColor.g * planetLight + 0.1);
        poemColors[i * 3 + 2] = Math.min(1, pointColor.b * planetLight + 0.1);
      }
      poemPointGeometry.setAttribute("position", new THREE.BufferAttribute(poemPositions, 3));
      poemPointGeometry.setAttribute("color", new THREE.BufferAttribute(poemColors, 3));
      const poemPointMaterial = new THREE.PointsMaterial({
        size: (isInitiallySelected ? (orbitStarfieldMode ? 0.01 : 0.007) : 0.0048) * THREE.MathUtils.clamp(perspectiveScale, 0.42, 1),
        map: glowTexture ?? undefined,
        vertexColors: true,
        transparent: true,
        opacity: orbitStarfieldMode && isInitiallySelected ? 0.72 : isInitiallySelected ? 0.48 : 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const poemPoints = new THREE.Points(poemPointGeometry, poemPointMaterial);
      poemPoints.userData.poetId = poet.id;
      poemPoints.userData.clickPriority = 100;
      orbitGroup.add(poemPoints);
      if (isInitiallySelected) clickablePointClouds.push(poemPoints);

      const orbitLinePositions: number[] = [];
      const ringCount = isInitiallySelected ? 3 : 1;
      for (let ring = 0; ring < ringCount; ring += 1) {
        const band =
          (0.11 + ring * 0.075 + Math.min(densityScale, 10) * 0.006) *
          orbitScale *
          perspectiveScale *
          (orbitStarfieldMode && isInitiallySelected ? 1.32 : 1);
        const ellipse = 0.56 + ring * 0.08;
        const segments = isInitiallySelected ? 96 : 64;
        for (let segment = 0; segment < segments; segment += 1) {
          const a = (segment / segments) * Math.PI * 2;
          const b = ((segment + 1) / segments) * Math.PI * 2;
          orbitLinePositions.push(
            Math.cos(a) * band,
            0,
            Math.sin(a) * band * ellipse,
            Math.cos(b) * band,
            0,
            Math.sin(b) * band * ellipse,
          );
        }
      }
      const orbitLineGeometry = new THREE.BufferGeometry();
      orbitLineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(orbitLinePositions, 3));
      const orbitLineMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: orbitStarfieldMode && isInitiallySelected ? 0.62 : 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      orbitGroup.add(new THREE.LineSegments(orbitLineGeometry, orbitLineMaterial));
    });

    if (selectedPoems.length > 0) {
      const focusGeometry = new THREE.BufferGeometry();
      const focusCount = Math.min(24000, Math.max(5200, selectedPoems.length * 12));
      const focusPositions = new Float32Array(focusCount * 3);
      const focusColors = new Float32Array(focusCount * 3);
      const focusSizes = new Float32Array(focusCount);
      const focusAlphas = new Float32Array(focusCount);
      const focusPhases = new Float32Array(focusCount);
      const selectedColor = new THREE.Color(colorByDynasty[selectedPoet?.dynasty ?? ""] ?? "#ffd47a");
      const whiteGold = new THREE.Color("#f4ead7");
      const coolAccent = new THREE.Color("#b8e8d4");
      const roseAccent = new THREE.Color("#e49aae");
      const focusKnotCount = 28;
      for (let i = 0; i < focusCount; i += 1) {
        const knotIndex = Math.floor(hashUnit(seedKey, i + 51001) * focusKnotCount);
        const knotSalt = 51200 + knotIndex * 73;
        const knotProgress = Math.pow(hashUnit(seedKey, knotSalt + 1), 0.86);
        const loose = hashUnit(seedKey, i + 51011) < 0.34;
        const layer = THREE.MathUtils.clamp(loose ? hashUnit(seedKey, i + 51021) : knotProgress + bellHash(i + 51031) * 0.22, 0.02, 0.98);
        const angle = loose
          ? hashUnit(seedKey, i + 51041) * Math.PI * 2
          : hashUnit(seedKey, knotSalt + 2) * Math.PI * 2 + layer * 1.35 + Math.sin(layer * 5.4 + hashUnit(seedKey, knotSalt + 3) * Math.PI * 2) * 0.38 + bellHash(i + 51051) * 1.12;
        const radius = 0.2 + Math.pow(layer, 0.82) * 6.2 + bellHash(i + 51061) * (0.3 + layer * 0.86);
        const verticalNoise = bellHash(i + 51071) * (0.2 + radius * 0.12);
        const depthNoise = bellHash(i + 51081) * (0.32 + radius * 0.16);
        const coreGlow = hashUnit(seedKey, i + 51091) < 0.1 ? hashUnit(seedKey, i + 51101) * 0.14 : 0;
        focusPositions[i * 3] = Math.cos(angle) * radius * 1.08 + Math.cos(angle * 2.1) * coreGlow;
        focusPositions[i * 3 + 1] = Math.sin(angle * 1.08) * radius * 0.24 + verticalNoise;
        focusPositions[i * 3 + 2] = -0.98 + Math.sin(angle) * (radius + depthNoise) * 0.66;
        const color = i % 53 === 0 ? roseAccent : i % 31 === 0 ? coolAccent : i % 4 === 0 ? whiteGold : selectedColor;
        mixColor(focusColors, i, color, 0.46 + hashUnit(seedKey, i + 51111) * 0.26);
        focusSizes[i] = 0.12 + hashUnit(seedKey, i + 51121) * 0.62 + (i % 181 === 0 ? 0.48 : 0);
        focusAlphas[i] = 0.05 + Math.pow(1 - layer, 1.7) * 0.16 + hashUnit(seedKey, i + 51131) * 0.06;
        focusPhases[i] = hashUnit(seedKey, i + 51141) * Math.PI * 2;
      }
      focusGeometry.setAttribute("position", new THREE.BufferAttribute(focusPositions, 3));
      focusGeometry.setAttribute("color", new THREE.BufferAttribute(focusColors, 3));
      focusGeometry.setAttribute("aSize", new THREE.BufferAttribute(focusSizes, 1));
      focusGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(focusAlphas, 1));
      focusGeometry.setAttribute("aPhase", new THREE.BufferAttribute(focusPhases, 1));
      const focusMaterial = createStellarMaterial(0.18);
      stellarMaterials.push(focusMaterial);
      const focusCloud = new THREE.Points(focusGeometry, focusMaterial);
      focusCloud.userData.clickPriority = 18;
      focusCloud.rotation.set(0.08, -0.2, 0.07);
      group.add(focusCloud);
      clickablePointClouds.push(focusCloud);

      const rayPositions: number[] = [];
      const rayCount = Math.min(520, Math.max(160, selectedPoems.length));
      for (let i = 0; i < rayCount; i += 1) {
        const angle = i * 2.399963;
        const outer = 4.2 + Math.random() * 4.4;
        const inner = 0.55 + Math.random() * 2.6;
        const yLift = 1.1 + Math.random() * 2.7;
        rayPositions.push(
          Math.cos(angle) * outer * 1.24,
          yLift + Math.sin(angle * 0.5) * 0.8,
          -1.8 + Math.sin(angle) * outer * 0.72,
          Math.cos(angle + 0.22) * inner,
          Math.sin(angle * 1.4) * 0.72,
          -0.42 + Math.sin(angle + 0.22) * inner * 0.64,
        );
      }
      const rayGeometry = new THREE.BufferGeometry();
      rayGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rayPositions, 3));
      const rayMaterial = new THREE.LineBasicMaterial({
        color: "#d7bd71",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.LineSegments(rayGeometry, rayMaterial));
    }

    const linePositions: number[] = [];
    const linePoets = activePoets.slice(0, 230);
    for (let i = 0; i < linePoets.length; i += 1) {
      const current = linePoets[i];
      for (let j = i + 1; j < Math.min(linePoets.length, i + 9); j += 1) {
        const next = linePoets[j];
        const sameDynasty = current.dynasty === next.dynasty;
        const touchesSelected = current.id === selectedPoetRef.current || next.id === selectedPoetRef.current;
        const dx = current.x - next.x;
        const dy = current.y - next.y;
        const dz = current.z - next.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > 6.4) continue;
        if (!touchesSelected && !sameDynasty && (i + j) % 7 !== 0) continue;
        if (!touchesSelected && sameDynasty && (i + j) % 3 === 0) continue;
        linePositions.push(current.x, current.y, current.z, next.x, next.y, next.z);
      }
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: "#d8bf73",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerScreen = new THREE.Vector2();
    const pointerDrift = new THREE.Vector2();
    const velocity = new THREE.Vector3();
    const pressed = new Set<string>();
    const minCameraZ = 0.06;
    const maxCameraZ = 15.5;
    const minCameraX = -3.2;
    const maxCameraX = 3.2;
    const minCameraY = -2.2;
    const maxCameraY = 2.2;
    let targetCameraZ = camera.position.z;
    let targetCameraX = camera.position.x;
    let targetCameraY = camera.position.y;
    let targetLookAtX = 0;
    let targetLookAtY = 0;
    let currentLookAtX = 0;
    let currentLookAtY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragging = false;
    const activeClickGlows: ClickGlow[] = [];
    const clickGlowLocalPosition = new THREE.Vector3();
    const candidateLocalPosition = new THREE.Vector3();
    const candidateWorldPosition = new THREE.Vector3();
    const candidateScreenPosition = new THREE.Vector3();
    const clickGlowColor = new THREE.Color();
    const clickGlowWhite = new THREE.Color("#fff7d6");

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerScreen.set(event.clientX - rect.left, event.clientY - rect.top);
    };

    const setPointerDrift = (event: PointerEvent | WheelEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerDrift.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerDrift.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const disposeClickGlow = (glow: ClickGlow) => {
      glow.anchor.parent?.remove(glow.anchor);
      glow.coreMaterial.dispose();
      glow.haloMaterial.dispose();
    };

    const createClickGlow = (parent: THREE.Object3D, localPosition: THREE.Vector3, color: THREE.ColorRepresentation, baseScale: number) => {
      if (!glowTexture) return;

      const anchor = new THREE.Group();
      anchor.position.copy(localPosition);
      anchor.renderOrder = 10;

      const haloMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const coreMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: "#fffdf1",
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

      const halo = new THREE.Sprite(haloMaterial);
      halo.scale.setScalar(baseScale * 1.7);
      const core = new THREE.Sprite(coreMaterial);
      core.scale.setScalar(baseScale * 0.78);
      anchor.add(halo, core);
      parent.add(anchor);

      activeClickGlows.push({
        anchor,
        coreMaterial,
        haloMaterial,
        bornAt: performance.now(),
        duration: 2400,
        baseScale,
      });

      while (activeClickGlows.length > 24) {
        const oldestGlow = activeClickGlows.shift();
        if (oldestGlow) disposeClickGlow(oldestGlow);
      }
    };

    const getPointLocalPosition = (match: THREE.Intersection<THREE.Object3D>, target: THREE.Vector3) => {
      if (!(match.object instanceof THREE.Points) || typeof match.index !== "number") return;
      const positionAttribute = match.object.geometry.getAttribute("position");
      if (!positionAttribute) return;

      target.set(
        positionAttribute.getX(match.index),
        positionAttribute.getY(match.index),
        positionAttribute.getZ(match.index),
      );
      return target;
    };

    const getPointScreenDistance = (match: THREE.Intersection<THREE.Object3D>) => {
      const localPosition = getPointLocalPosition(match, candidateLocalPosition);
      if (!localPosition) return Infinity;

      candidateWorldPosition.copy(localPosition);
      match.object.localToWorld(candidateWorldPosition);
      candidateScreenPosition.copy(candidateWorldPosition).project(camera);
      if (
        !Number.isFinite(candidateScreenPosition.x) ||
        !Number.isFinite(candidateScreenPosition.y) ||
        candidateScreenPosition.z < -1 ||
        candidateScreenPosition.z > 1
      ) {
        return Infinity;
      }

      const width = renderer.domElement.clientWidth || mount.clientWidth;
      const height = renderer.domElement.clientHeight || mount.clientHeight;
      const screenX = (candidateScreenPosition.x * 0.5 + 0.5) * width;
      const screenY = (-candidateScreenPosition.y * 0.5 + 0.5) * height;
      return Math.hypot(screenX - pointerScreen.x, screenY - pointerScreen.y);
    };

    const getPointClickPriority = (object: THREE.Object3D) => {
      const priority = object.userData.clickPriority;
      return typeof priority === "number" ? priority : 0;
    };

    const pickClosestPointMatch = (
      matches: THREE.Intersection<THREE.Object3D>[],
      pointerType: string,
    ): THREE.Intersection<THREE.Object3D> | null => {
      const maxScreenDistance = pointerType === "touch" ? 28 : 16;
      let bestMatch: THREE.Intersection<THREE.Object3D> | null = null;
      let bestScore = Infinity;

      for (const match of matches) {
        if (!(match.object instanceof THREE.Points) || typeof match.index !== "number") continue;
        const screenDistance = getPointScreenDistance(match);
        if (screenDistance > maxScreenDistance) continue;

        const priority = getPointClickPriority(match.object);
        const score = screenDistance - priority * 0.025 + match.distance * 0.001;
        if (score < bestScore) {
          bestMatch = match;
          bestScore = score;
        }
      }

      return bestMatch;
    };

    const flashPointCloudStar = (match: THREE.Intersection<THREE.Object3D>) => {
      const localPosition = getPointLocalPosition(match, clickGlowLocalPosition);
      if (!localPosition || !(match.object instanceof THREE.Points) || typeof match.index !== "number") return;

      clickGlowColor.copy(clickGlowWhite);

      const sizeAttribute = match.object.geometry.getAttribute("aSize");
      const pointSize = sizeAttribute ? sizeAttribute.getX(match.index) : 1;
      const baseScale = THREE.MathUtils.clamp(0.02 + pointSize * 0.006, 0.026, 0.055);
      createClickGlow(match.object, localPosition, clickGlowColor, baseScale);
    };

    const flashPoetStar = (poetId: string) => {
      const object = poetRefs.current.get(poetId);
      if (!object) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const baseColor = material instanceof THREE.MeshStandardMaterial ? material.emissive : material instanceof THREE.MeshBasicMaterial ? material.color : clickGlowWhite;
      const color = baseColor.clone().lerp(clickGlowWhite, 0.92);
      const parent = object.parent ?? scene;
      if (object.parent) {
        clickGlowLocalPosition.copy(object.position);
      } else {
        object.getWorldPosition(clickGlowLocalPosition);
      }
      createClickGlow(parent, clickGlowLocalPosition, color, 0.045);
    };

    const selectPointPoet = (pointerType: string) => {
      if (activePoets.length === 0) return false;
      const threshold = THREE.MathUtils.clamp(camera.position.z * 0.012 + 0.012, 0.014, 0.12);
      raycaster.params.Points.threshold = pointerType === "touch" ? threshold * 1.35 : threshold;
      const pointMatches = raycaster.intersectObjects(clickablePointClouds, false);
      const pointMatch = pickClosestPointMatch(pointMatches, pointerType);
      if (!pointMatch || typeof pointMatch.index !== "number") return false;

      const poetIds = pointMatch.object.userData.poetIds as string[] | undefined;
      const mappedPoetId = poetIds?.[pointMatch.index];
      if (mappedPoetId) {
        flashPointCloudStar(pointMatch);
        onSelectPoemRef.current(mappedPoetId);
        return true;
      }

      const directPoetId = pointMatch.object.userData.poetId as string | undefined;
      if (directPoetId) {
        flashPointCloudStar(pointMatch);
        onSelectPoemRef.current(directPoetId);
        return true;
      }

      const poetIndices = pointMatch.object.userData.poetIndices as Uint16Array | undefined;
      const poetIndex = poetIndices?.[pointMatch.index] ?? pointMatch.index;
      const poet = activePoets[poetIndex % activePoets.length];
      if (!poet) return false;
      flashPointCloudStar(pointMatch);
      onSelectPoemRef.current(poet.id);
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      dragging = true;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      setPointerDrift(event);
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      const yaw = dx * 0.0042;
      const pitch = dy * 0.0032;
      interactiveSpace.rotation.y += yaw;
      interactiveSpace.rotation.x = THREE.MathUtils.clamp(interactiveSpace.rotation.x + pitch * 0.72, -0.76, 0.76);
      group.rotation.y += yaw * 0.18;
      group.rotation.x += pitch * 0.12;
      parallaxLayers.forEach((layer, index) => {
        const depthResponse = 0.08 + index * 0.035;
        layer.rotation.y += yaw * depthResponse;
        layer.rotation.x += pitch * depthResponse * 0.45;
      });
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      const totalMove = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      if (totalMove < 5) {
        setPointer(event);
        scene.updateMatrixWorld(true);
        raycaster.setFromCamera(pointer, camera);

        const starIntersections = raycaster.intersectObjects(poetStarMeshes, false);
        const starMatch = starIntersections.find((item) => item.object.userData.poetId);
        if (starMatch) {
          const poetId = starMatch.object.userData.poetId as string;
          flashPoetStar(poetId);
          onSelectPoetRef.current(poetId);
        } else {
          const coreIntersections = raycaster.intersectObjects(poetCoreHitMeshes, false);
          const coreMatch = coreIntersections.find((item) => item.object.userData.poetId);
          if (coreMatch) {
            const poetId = coreMatch.object.userData.poetId as string;
            flashPoetStar(poetId);
            onSelectPoetRef.current(poetId);
          } else if (selectPointPoet(event.pointerType)) {
            // Point cloud stars carry poet indices, so visible stars can open poems directly.
          }
        }
      }
      dragging = false;
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      dragging = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setPointerDrift(event);
      const rect = renderer.domElement.getBoundingClientRect();
      const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const normalizedY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const previousTargetZ = targetCameraZ;
      const nextTargetZ = THREE.MathUtils.clamp(targetCameraZ + event.deltaY * 0.009, minCameraZ, maxCameraZ);
      const zoomDelta = previousTargetZ - nextTargetZ;
      const halfViewHeightPerZ = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const halfViewWidthPerZ = halfViewHeightPerZ * camera.aspect;
      const focusStrength = 0.92;
      const panX = normalizedX * zoomDelta * halfViewWidthPerZ * focusStrength;
      const panY = normalizedY * zoomDelta * halfViewHeightPerZ * focusStrength;

      targetCameraX = THREE.MathUtils.clamp(targetCameraX + panX, minCameraX, maxCameraX);
      targetCameraY = THREE.MathUtils.clamp(targetCameraY + panY, minCameraY, maxCameraY);
      targetLookAtX = THREE.MathUtils.clamp(targetLookAtX + panX, minCameraX, maxCameraX);
      targetLookAtY = THREE.MathUtils.clamp(targetLookAtY + panY, minCameraY, maxCameraY);
      targetCameraZ = nextTargetZ;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      pressed.add(event.key.toLowerCase());
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key.toLowerCase());
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      composer.setSize(mount.clientWidth, mount.clientHeight);
      bloom.setSize(mount.clientWidth, mount.clientHeight);
      stellarMaterials.forEach((material) => {
        material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
      });
    };
    window.addEventListener("resize", handleResize);

    let frame = 0;
    let animationId = 0;
    const animate = () => {
      frame += 0.002;
      const closeZoom = THREE.MathUtils.clamp((3.15 - camera.position.z) / 3.09, 0, 1);
      const closeStarReveal = Math.pow(THREE.MathUtils.clamp((3.85 - camera.position.z) / 1.45, 0, 1), 0.38);
      const cloudFade = Math.pow(1 - closeStarReveal, 1.8);
      stars.rotation.y += 0.000006;
      stars.rotation.z += 0.000002;
      chromaticMist.rotation.y += 0.000005;
      chromaticMist.rotation.z += 0.000003;
      if (!orbitStarfieldMode) {
        milkyWayBand.rotation.y += 0.000004;
        milkyWayBand.rotation.z += 0.000002;
        nebula.rotation.y += 0.000004;
        nebula.rotation.z += 0.000003;
        galaxyDisk.rotation.y += 0.000005;
        galaxyDisk.rotation.z += 0.000004;
        auroraRing.rotation.y += 0.000004;
        auroraRing.rotation.z += 0.000004;
        coreCloud.rotation.y += 0.000004;
        coreCloud.rotation.z += 0.000002;
        referenceGalaxy.rotation.y += 0.000004;
        referenceGalaxy.rotation.z += 0.000003;
        poemHalo.rotation.y += 0.000018;
        poemHalo.rotation.z += 0.000012;
        strands.rotation.y += 0.000014;
        bokehGroup.rotation.y += 0.00001;
        softNebulaGroup.rotation.y += 0.000004;
        softNebulaGroup.rotation.z += 0.000002;
        hazeGroup.rotation.y += 0.000004;
        hazeGroup.rotation.z += 0.000002;
      }
      stellarMaterials.forEach((material) => {
        material.uniforms.uTime.value = frame;
      });
      starMaterial.uniforms.uPointScale.value = 5.75 - closeZoom * 0.28;
      chromaticMistMaterial.uniforms.uPointScale.value = 5.15 - closeZoom * 0.32;
      starMaterial.uniforms.uOpacity.value = orbitStarfieldMode ? 0.3 : 0.42;
      chromaticMistMaterial.uniforms.uOpacity.value = (orbitStarfieldMode ? 0.18 : 0.44) * (1 - closeZoom * 0.08);
      if (!orbitStarfieldMode) {
        auroraRingMaterial.uniforms.uPointScale.value = 5.25 - closeZoom * 0.24;
        milkyWayMaterial.uniforms.uPointScale.value = 5.55 - closeZoom * 0.2;
        nebulaMaterial.uniforms.uPointScale.value = 5.4 - closeZoom * 0.18;
        galaxyMaterial.uniforms.uPointScale.value = 5.55 - closeZoom * 0.2;
        coreMaterial.uniforms.uPointScale.value = 5.3 - closeZoom * 0.16;
        referenceGalaxyMaterial.uniforms.uPointScale.value = 6.25 - closeZoom * 0.18;
        auroraRingMaterial.uniforms.uOpacity.value = 0.52 * (0.46 + cloudFade * 0.54);
        milkyWayMaterial.uniforms.uOpacity.value = 0.24 * (1 - closeZoom * 0.08);
        nebulaMaterial.uniforms.uOpacity.value = 0.42 * (1 - closeZoom * 0.08);
        galaxyMaterial.uniforms.uOpacity.value = 0.5 * (1 - closeZoom * 0.1);
        coreMaterial.uniforms.uOpacity.value = 0.86 * (1 - closeZoom * 0.08);
        referenceGalaxyMaterial.uniforms.uOpacity.value = 0.78 * (1 - closeZoom * 0.06);
        zoomFadedSpriteMaterials.forEach((material) => {
          material.opacity = (material.userData.baseOpacity as number) * cloudFade;
        });
      }
      group.rotation.y += 0.000006;
      ringA.rotation.z += 0.000024;
      ringB.rotation.z -= 0.000018;
      orbitalSystems.forEach((system, index) => {
        system.object.rotation.y += system.speed;
        system.object.rotation.x += Math.sin(frame * (0.7 + system.wobble) + index) * 0.00001;
      });
      const speed = pressed.has("shift") ? 0.08 : 0.035;
      velocity.set(0, 0, 0);
      if (pressed.has("w")) targetCameraZ = THREE.MathUtils.clamp(targetCameraZ - speed, minCameraZ, maxCameraZ);
      if (pressed.has("s")) targetCameraZ = THREE.MathUtils.clamp(targetCameraZ + speed, minCameraZ, maxCameraZ);
      if (pressed.has("a")) velocity.x -= speed;
      if (pressed.has("d")) velocity.x += speed;
      if (pressed.has("q")) velocity.y -= speed;
      if (pressed.has("e")) velocity.y += speed;
      targetCameraX = THREE.MathUtils.clamp(targetCameraX + velocity.x, minCameraX, maxCameraX);
      targetCameraY = THREE.MathUtils.clamp(targetCameraY + velocity.y, minCameraY, maxCameraY);
      targetLookAtX = THREE.MathUtils.clamp(targetLookAtX + velocity.x, minCameraX, maxCameraX);
      targetLookAtY = THREE.MathUtils.clamp(targetLookAtY + velocity.y, minCameraY, maxCameraY);
      camera.position.x += (targetCameraX - camera.position.x) * 0.18;
      camera.position.y += (targetCameraY - camera.position.y) * 0.18;
      camera.position.z += (targetCameraZ - camera.position.z) * 0.18;
      currentLookAtX += (targetLookAtX - currentLookAtX) * 0.18;
      currentLookAtY += (targetLookAtY - currentLookAtY) * 0.18;
      camera.lookAt(currentLookAtX + pointerDrift.x * 0.16, currentLookAtY - pointerDrift.y * 0.08, 0);
      poetRefs.current.forEach((object, poetId) => {
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        const isSelected = poetId === selectedPoetRef.current;
        object.scale.setScalar(isSelected ? 1.08 : 1);
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissiveIntensity = isSelected ? 1.08 : 0.42;
        } else if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = isSelected ? 0.035 : 0.025;
        }
      });

      const now = performance.now();
      for (let i = activeClickGlows.length - 1; i >= 0; i -= 1) {
        const glow = activeClickGlows[i];
        const life = (now - glow.bornAt) / glow.duration;
        if (life >= 1) {
          activeClickGlows.splice(i, 1);
          disposeClickGlow(glow);
          continue;
        }

        const flare = Math.sin(life * Math.PI);
        const spread = 1 + life * 0.55 + flare * 0.12;
        glow.anchor.scale.setScalar(spread);
        glow.coreMaterial.opacity = Math.max(0, (1 - life) * 0.96 + flare * 0.08);
        glow.haloMaterial.opacity = Math.max(0, (1 - life) * 0.14);
      }
      composer.render();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      activeClickGlows.splice(0).forEach(disposeClickGlow);
      mount.removeChild(renderer.domElement);
      if (glowTexture) glowTexture.dispose();
      if (nebulaTexture) nebulaTexture.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
        if (object instanceof THREE.Sprite) {
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      composer.dispose();
    };
  }, [poets, visualKey]);

  useEffect(() => {
    const object = poetRefs.current.get(selectedPoetId);
    if (!object) return;
    object.scale.setScalar(1.42);
  }, [selectedPoetId, selectedPoemId]);

  return <div ref={mountRef} className="cloud-stage" />;
}
