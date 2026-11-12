import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const FOV = 30;
// Distance de la caméra pour que la hauteur du plan (1 unité) remplisse exactement le cadre
const DISTANCE = 0.5 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const SLIDE_DURATION = 900;

const vertexShader = `
  uniform float uOffset;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float n = uv.x * 2.0 - 1.0;
    // Courbure des bords pendant le défilement
    p.z -= abs(uOffset) * 0.35 * n * n;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uMap;
  uniform vec2 uCover;
  uniform float uOffset;
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    // Décalage horizontal (parallaxe) et séparation RGB pendant le défilement
    uv.x -= uOffset * 0.12;
    float s = abs(uOffset) * 0.015;
    float r = texture2D(uMap, uv + vec2(s, 0.0)).r;
    float g = texture2D(uMap, uv).g;
    float b = texture2D(uMap, uv - vec2(s, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* Effet « encre » d'après le reveal aquarelle de davidwhyte.com       */
/* (ink.niccolofanton.dev). Avant le premier survol, l'image est       */
/* totalement invisible (canvas transparent). Au survol, une feuille   */
/* de papier opaque apparaît puis des taches d'encre la dévoilent      */
/* depuis le curseur : là où l'encre est passée, le voile devient      */
/* transparent et c'est la vraie image rendue en dessous (avec sa      */
/* parallaxe) qui apparaît. Une fois entièrement révélée, l'image      */
/* reste visible en permanence ; si le curseur part avant la fin,      */
/* le voile se dissout et l'image redevient invisible.                 */
/*                                                                     */
/*   sdf       = 1 - |p - graine| + front                              */
/*   intensity = pow(sdf, power) * bruit                               */
/*   mask      = remap(intensity, sharpMin, sharpMax)                  */
/*   alpha voile = (1 - mask) * fondu global                           */
/* ------------------------------------------------------------------ */
const INK = {
  paper: 'oklch(97.5% .002 100)',
  ink: '#3b4a63',
  power: 6, // exposant : haut = une fine bande de taches semi-formées
  threshold: 1, // seuil du mask
  softness: 0.05, // largeur de la transition (uSharpMax - uSharpMin)
  ease: 0.35, // part d'easing quartic appliquée au front
  frontWidth: 1.8, // épaisseur de la zone de taches semi-formées
  edgeBoost: 2.2, // surcharge de pigment juste derrière le front
  soakDist: 0.3, // distance derrière le front sur laquelle le mask se referme
  fill: 0.03, // portion finale de progress qui bouche les coins
  edgeTint: 0.35, // teinte du liseré d'encre
  tintWidth: 0.45, // largeur du liseré
  tintSoftness: 0.6, // douceur du liseré
  noiseScale: 2.4, // échelle du bruit aquarelle
  octaves: 6, // octaves de bruit
  contrast: 0.55, // contraste vers pics et creux = taches plus massives
  speedIn: 0.9, // progress / seconde à l'apparition
  speedOut: 1.6, // progress / seconde à la rétraction
  fadeIn: 9, // vitesse du fondu d'apparition du papier (par seconde)
  fadeOut: 3.5, // vitesse de dissolution du papier au départ du curseur
  noiseSize: 1024, // taille de la texture de bruit cuite une seule fois
};

export const passthroughVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Cuisson du bruit simplex fbm (3 canaux) dans une texture. Le bruit est
// généré dans le même espace corrigé d'aspect que le reveal : au simple
// lookup vUv, un pixel de bruit tombe toujours au bon endroit de l'image.
export const noiseFragment = `
  precision highp float;

  uniform float uPlaneRatio;
  uniform float uNoiseScale;
  uniform float uContrast;
  uniform int uOctaves;
  uniform vec3 uNoiseSeed;

  varying vec2 vUv;

  // Simplex noise, Ashima / Ian McEwan, domaine public.
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.2113248654051871, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Octaves en uniform plutôt qu'en #define : pas de recompilation du shader.
  float fbm(vec2 p) {
    float amplitude = 0.5;
    float sum = 0.0;
    float norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uOctaves) break;
      sum += amplitude * snoise(p);
      norm += amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return sum / max(norm, 1e-4);
  }

  void main() {
    vec2 pos = vUv * vec2(uPlaneRatio, 1.0) * uNoiseScale;

    vec3 n = vec3(
      fbm(pos + uNoiseSeed.x),
      fbm(pos + uNoiseSeed.y + 31.4),
      fbm(pos + uNoiseSeed.z + 71.3)
    );
    n = clamp(n * 0.5 + 0.5, 0.0, 1.0);

    // Le contraste pousse le bruit vers ses pics et ses creux : taches plus massives.
    gl_FragColor = vec4(mix(n, smoothstep(vec3(0.25), vec3(0.75), n), uContrast), 1.0);
  }
`;

// Le voile papier : le mask d'encre définit où l'image du dessous apparaît
// (alpha = 0), et partout ailleurs on dessine le papier opaque, avec le
// liseré d'encre à la frontière des taches. L'image elle-même n'est jamais
// redessinée ici — c'est le vrai plan de dessous qui transparaît.
const inkFragment = `
  precision highp float;

  uniform sampler2D uNoise;

  uniform vec3 uPaper;
  uniform vec3 uInk;

  uniform float uProgress;
  uniform float uFade;
  uniform float uPlaneRatio;
  uniform float uPower;
  uniform float uSharpMin;
  uniform float uSharpMax;
  uniform float uReach;
  uniform float uSpread;
  uniform float uEase;
  uniform float uEdgeBoost;
  uniform float uFill;
  uniform float uSoakDist;
  uniform float uEdgeTint;
  uniform float uTintWidth;
  uniform float uTintSoftness;

  // seed : x = échelle d'extension, y = début, z = durée (parts de progress)
  uniform vec4 uSeed;
  uniform vec2 uSeedPos;

  varying vec2 vUv;

  float remap01(float v, float a, float b) {
    return clamp((v - a) / max(b - a, 1e-4), 0.0, 1.0);
  }

  float easeFront(float t) {
    float inv = 1.0 - t;
    return mix(t, 1.0 - inv * inv * inv * inv, uEase);
  }

  float inkMask(float noiseSample, float dist, float front) {
    float sdf = 1.0 + (front - dist) * uSpread;
    float intensity = pow(max(sdf, 0.0), uPower) * noiseSample;
    return remap01(intensity, uSharpMin, uSharpMax);
  }

  // Surcharge de pigment juste derrière le front, amortie quand la graine
  // se stabilise : encre humide qui s'accumule au bord.
  float inkEdge(float dist, float front, float done) {
    float behind = max(0.0, 1.0 - (front - dist) * uSpread);
    float t = remap01(behind, 0.6, 1.0) * (1.0 - done);
    return 1.0 + pow(t, 4.0) * uEdgeBoost;
  }

  void main() {
    // Espace image corrigé en aspect.
    vec2 pos = vUv * vec2(uPlaneRatio, 1.0);
    pos.x -= uPlaneRatio * 0.5 - 0.5;

    vec3 noise = texture2D(uNoise, vUv).rgb;

    vec2 centerPos = vec2(uSeedPos.x * uPlaneRatio - (uPlaneRatio * 0.5 - 0.5), uSeedPos.y);
    vec2 offset = pos - centerPos;
    float dist = length(offset);

    float start = uSeed.y;
    float end = start + uSeed.z;
    // Front de la graine, amorti puis mis à l'échelle ; il démarre juste
    // en dessous de zéro pour que progress = 0 soit totalement vide.
    float front = easeFront(remap01(uProgress, start, end)) * uReach * uSeed.x - 0.03;
    // 0 pendant la propagation, 1 une fois stabilisée : tue le boost de bord.
    float done = remap01(uProgress, start + uSeed.z * 0.5, end);

    // Deux masques décalés : le liseré d'encre naît de leur désaccord.
    float lag = mix(0.98, 0.80, uTintWidth);

    // Derrière le front l'encre continue de s'étaler : le bruit est tiré
    // vers 1 et les taches se bouchent d'elles-mêmes.
    float soak = clamp(max(0.0, front - dist) / max(uSoakDist, 1e-3), 0.0, 1.0);
    float noiseA = mix(noise.x, 1.0, soak);
    float noiseB = mix(noise.y, 1.0, soak);

    float boost = inkEdge(dist, front, done);
    float a = clamp(inkMask(noiseA, dist, front) * boost, 0.0, 1.0);
    float b = clamp(inkMask(noiseB, dist, front * lag) * boost, 0.0, 1.0);

    // Partage de l'encre passée : c'est elle qui rend le voile transparent.
    float revealed = max(a, b);

    // Les fronts ronds ne couvrent pas les coins du cadre : en toute fin de
    // progression, un masque final referme ce qu'aucun front n'a atteint.
    float closing = pow(remap01(uProgress, 1.0 - uFill, 1.0), 3.0);
    revealed = max(revealed, closing);

    // Liseré d'encre à la frontière des deux masques, sur la partie papier.
    float rim = pow(clamp(abs(a - b), 0.0, 1.0), mix(3.0, 0.5, uTintSoftness));
    vec3 color = mix(uPaper, uInk, rim * uEdgeTint * (1.0 - closing));

    // Là où l'encre est passée (revealed = 1), alpha tombe à zéro : la vraie
    // image du dessous apparaît. Ailleurs, voile de papier opaque, atténué
    // par le fondu global d'entrée/sortie du survol.
    float alpha = (1.0 - revealed) * uFade;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

type Anim = { from: number; start: number };

// Rayon de front nécessaire pour que le mask se referme partout :
// (1 + r / frontWidth)^puissance >= threshold × min(1, r / soakDist)
function neededFrontReach() {
  const n = 1 / Math.max(0.05, INK.frontWidth);
  const covers = (r: number) => Math.pow(1 + r * n, INK.power) * Math.min(1, r / INK.soakDist) >= INK.threshold;
  // Si rien ne couvre, on garde le front maximal : le closing prend le relais.
  if (!covers(4)) return 4;
  let lo = 0;
  let hi = 4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (covers(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Converts a CSS color (oklch, rgb, hex, etc.) into raw sRGB components, usable as-is in a
 * shader: a raw ShaderMaterial does not apply any output encoding, and THREE's parser
 * ignores recent syntaxes like oklch (falls back on white). The conversion is therefore
 * delegated to a 2D canvas, same as the browser composites the page: the pixel read is
 * the exact color displayed. Fallback to `fallback` if the syntax is not supported.
 */
export function cssColorToRawSrgb(css: string, fallback = 0xffffff): THREE.Color {
  const color = new THREE.Color().setHex(fallback, THREE.LinearSRGBColorSpace);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    // Sentinelle : si la syntaxe n'est pas supportée, fillStyle reste tel quel.
    ctx.fillStyle = '#010203';
    ctx.fillStyle = css;
    if (ctx.fillStyle !== '#010203') {
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const [r = 0, g = 0, b = 0, a = 0] = d;
      if (a > 0) {
        // LinearSRGBColorSpace = espace de travail interne de three : les
        // valeurs sont stockées telles quelles, sans conversion sRGB->linéaire.
        color.setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
      }
    }
  }
  return color;
}

/**
 * Cuite une fois pour toutes une texture de bruit simplex fbm à trois canaux,
 * partagée par l'effet encre du survol (WebGLImage) et le bord « encre » des
 * patatoïdes (InkBlobImage). Même espace corrigé d'aspect que les shaders qui
 * l'échantillonnent : au simple lookup vUv, un pixel de bruit tombe au bon endroit.
 */
export function bakeFbmNoiseTexture(
  renderer: THREE.WebGLRenderer,
  opts: { size: number; planeRatio: number; noiseScale: number; contrast: number; octaves: number; seed?: THREE.Vector3 },
): { texture: THREE.Texture; reseed: (seed: THREE.Vector3) => void; rebake: (patch: { noiseScale?: number; contrast?: number; octaves?: number; seed?: THREE.Vector3 }) => void; dispose: () => void } {
  const rt = new THREE.WebGLRenderTarget(opts.size, opts.size, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });
  const uniforms = {
    uPlaneRatio: { value: opts.planeRatio },
    uNoiseScale: { value: opts.noiseScale },
    uContrast: { value: opts.contrast },
    uOctaves: { value: opts.octaves },
    uNoiseSeed: { value: opts.seed ?? new THREE.Vector3() },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({ vertexShader: passthroughVertex, fragmentShader: noiseFragment, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  const render = () => {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  };
  render();

  return {
    texture: rt.texture,
    reseed: (seed: THREE.Vector3) => {
      uniforms.uNoiseSeed.value.copy(seed);
      render();
    },
    rebake: (patch) => {
      if (patch.noiseScale !== undefined) uniforms.uNoiseScale.value = patch.noiseScale;
      if (patch.contrast !== undefined) uniforms.uContrast.value = patch.contrast;
      if (patch.octaves !== undefined) uniforms.uOctaves.value = patch.octaves;
      if (patch.seed) uniforms.uNoiseSeed.value.copy(patch.seed);
      render();
    },
    dispose: () => {
      rt.dispose();
      material.dispose();
    },
  };
}

/**
 * Image rendue en WebGL (Three.js). `from` indique le côté d'où arrive la carte
 * (-1 gauche, 1 droite) ; chaque changement de `runKey` déclenche l'animation.
 */
export function WebGLImage({ src, alt, from = 0, runKey = 0 }: { src: string; alt: string; from?: number; runKey?: number }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Anim>({ from: 0, start: -1 });

  // Scène, texture et boucle de rendu
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 10);
    camera.position.z = DISTANCE;

    const uniforms = {
      uMap: { value: null as THREE.Texture | null },
      uCover: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    const geometry = new THREE.PlaneGeometry(1, 1, 40, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);

    // ----- Effet encre : texture de bruit cuite dans une cible de rendu -----
    const noiseRT = new THREE.WebGLRenderTarget(INK.noiseSize, INK.noiseSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });
    const noiseUniforms = {
      uPlaneRatio: { value: 1 },
      uNoiseScale: { value: INK.noiseScale },
      uContrast: { value: INK.contrast },
      uOctaves: { value: INK.octaves },
      uNoiseSeed: { value: new THREE.Vector3() },
    };
    const noiseScene = new THREE.Scene();
    const noiseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const noiseMaterial = new THREE.ShaderMaterial({ vertexShader: passthroughVertex, fragmentShader: noiseFragment, uniforms: noiseUniforms });
    noiseScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), noiseMaterial));

    const bakeNoise = () => {
      renderer.setRenderTarget(noiseRT);
      renderer.render(noiseScene, noiseCamera);
      renderer.setRenderTarget(null);
    };

    // ----- Effet encre : voile papier transparent au-dessus de l'image -----
    // Le papier reprend la couleur calculée du fond du body : le voile étant
    // opaque à 100 % là où l'encre n'est pas passée, il se confond alors
    // exactement avec le fond de la page pendant toute l'animation.
    const pageBackground = cssColorToRawSrgb(getComputedStyle(document.body).backgroundColor);
    const inkUniforms = {
      uNoise: { value: noiseRT.texture },
      uPaper: { value: pageBackground },
      uInk: { value: cssColorToRawSrgb(INK.ink) },
      uProgress: { value: 0 },
      uFade: { value: 0 },
      uPlaneRatio: { value: 1 },
      uPower: { value: INK.power },
      uSharpMin: { value: INK.threshold - INK.softness },
      uSharpMax: { value: INK.threshold },
      uReach: { value: 1.5 },
      uSpread: { value: 1 / Math.max(0.05, INK.frontWidth) },
      uEase: { value: INK.ease },
      uEdgeBoost: { value: INK.edgeBoost },
      uFill: { value: INK.fill },
      uSoakDist: { value: INK.soakDist },
      uEdgeTint: { value: INK.edgeTint },
      uTintWidth: { value: INK.tintWidth },
      uTintSoftness: { value: INK.tintSoftness },
      uSeed: { value: new THREE.Vector4(1, 0, 1, 0) },
      uSeedPos: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const inkMaterial = new THREE.ShaderMaterial({
      vertexShader: passthroughVertex,
      fragmentShader: inkFragment,
      uniforms: inkUniforms,
      transparent: true,
      depthWrite: false,
    });
    const inkGeometry = new THREE.PlaneGeometry(1, 1);
    const inkMesh = new THREE.Mesh(inkGeometry, inkMaterial);
    inkMesh.visible = false;
    inkMesh.position.z = 0.02;
    scene.add(inkMesh);

    let imageAspect = 1.45;
    let raf = 0;

    // Rayon de front suffisant pour que, depuis la graine courante, le reveal
    // finisse par couvrir tout le cadre visible.
    const updateReach = () => {
      const seed = inkUniforms.uSeedPos.value;
      const pr = inkUniforms.uPlaneRatio.value;
      const cx = seed.x * pr - (pr * 0.5 - 0.5);
      const cy = seed.y;
      const cover = uniforms.uCover.value;
      let maxDist = 0;
      for (const x of [0.5 - cover.x / 2, 0.5 + cover.x / 2]) {
        for (const y of [0.5 - cover.y / 2, 0.5 + cover.y / 2]) {
          const px = x * pr - (pr * 0.5 - 0.5);
          maxDist = Math.max(maxDist, Math.hypot(px - cx, y - cy));
        }
      }
      // Marge pour le -0.03 du front et l'easing.
      inkUniforms.uReach.value = Math.min(4, maxDist + neededFrontReach() + 0.05);
    };

    // ----- État de l'effet encre -----
    // idle    : rien de visible (image cachée, canvas transparent)
    // in      : survol — le papier apparaît, puis l'encre dévoile l'image
    // out     : le curseur est reparti avant la fin, le voile se dissout
    // revealed: révélation terminée, l'image reste visible en permanence
    let inkState: 'idle' | 'in' | 'out' | 'revealed' = 'idle';
    let inkProgress = 0;
    let inkFade = 0;
    let hasTexture = false;

    const onPointerEnter = (e: PointerEvent) => {
      if (reducedMotion.matches) {
        // Pas d'animation : l'image est révélée d'un coup, puis reste visible.
        inkState = 'revealed';
        inkProgress = 1;
        inkFade = 0;
        return;
      }
      // Révélation déjà terminée : l'image reste visible, rien à rejouer.
      if (inkProgress >= 1) {
        inkState = 'revealed';
        inkFade = 0;
        return;
      }
      inkState = 'in';
      if (inkProgress <= 0) {
        // Nouvelle graine sous le curseur + nouveau champ de bruit,
        // comme le « reshuffle » du site d'origine à chaque replay.
        const rect = host.getBoundingClientRect();
        inkUniforms.uSeedPos.value.set(
          Math.min(0.96, Math.max(0.04, (e.clientX - rect.left) / Math.max(1, rect.width))),
          Math.min(0.96, Math.max(0.04, 1 - (e.clientY - rect.top) / Math.max(1, rect.height))),
        );
        noiseUniforms.uNoiseSeed.value.set(-50 + Math.random() * 100, -50 + Math.random() * 100, -50 + Math.random() * 100);
        bakeNoise();
        updateReach();
      }
    };

        const onPointerLeave = () => {
      // Une fois révélée, l'image reste : quitter ne fait plus rien.
      if (reducedMotion.matches || inkProgress >= 1) return;
      inkState = 'out';
    };

    host.addEventListener('pointerenter', onPointerEnter);
    host.addEventListener('pointerleave', onPointerLeave);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const hostAspect = w / h;
      renderer.setSize(w, h, false);
      camera.aspect = hostAspect;
      camera.updateProjectionMatrix();
      mesh.scale.set(hostAspect, 1, 1);
      inkMesh.scale.set(hostAspect, 1, 1);
      // Recadrage "cover" : l'image remplit le cadre sans déformation.
      if (imageAspect > hostAspect) uniforms.uCover.value.set(hostAspect / imageAspect, 1);
      else uniforms.uCover.value.set(1, imageAspect / hostAspect);
      inkUniforms.uPlaneRatio.value = hostAspect;
      noiseUniforms.uPlaneRatio.value = hostAspect;
      updateReach();
    };

    const texture = new THREE.TextureLoader().load(src, (loaded) => {
      const img = loaded.image as HTMLImageElement;
      imageAspect = img.width / img.height;
      uniforms.uMap.value = loaded;
      hasTexture = true;
      resize();
    });

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let lastFrame = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const anim = animRef.current;
      if (anim.start >= 0) {
        const p = Math.min(1, (now - anim.start) / SLIDE_DURATION);
        const eased = 1 - Math.pow(1 - p, 3);
        uniforms.uOffset.value = anim.from * (1 - eased);
        if (p >= 1) {
          anim.start = -1;
          uniforms.uOffset.value = 0;
        }
      }

      // Progression de l'encre + fondu global du papier.
      // Le papier n'apparaît en fondu que pendant le survol, et l'encre ne
      // commence à dévoiler l'image que lorsque le papier est bien opaque.
      if (inkState === 'in') {
        inkFade = Math.min(1, inkFade + INK.fadeIn * dt);
        if (inkFade >= 1) {
          inkProgress = Math.min(1, inkProgress + INK.speedIn * dt);
        }
        if (inkProgress >= 1 && inkFade >= 1) {
          inkState = 'revealed';
          inkFade = 0; // le voile est devenu inutile : l'image reste à nue
        }
      } else if (inkState === 'out') {
        // Départ avant la fin : le voile se dissout et on repart de zéro.
        inkProgress = Math.max(0, inkProgress - INK.speedOut * dt);
        inkFade = Math.max(0, inkFade - INK.fadeOut * dt);
        if (inkProgress <= 0 && inkFade <= 0) {
          inkState = 'idle';
        }
      }
      inkUniforms.uProgress.value = inkProgress;
      inkUniforms.uFade.value = inkFade;
      inkMesh.visible = inkFade > 0.001;
      // L'image du dessous n'apparaît que recouverte par le papier opaque,
      // pendant l'animation, puis reste visible une fois révélée.
      mesh.visible = hasTexture && (inkProgress > 0 || inkFade >= 1);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener('pointerenter', onPointerEnter);
      host.removeEventListener('pointerleave', onPointerLeave);
      texture.dispose();
      geometry.dispose();
      material.dispose();
      inkGeometry.dispose();
      inkMaterial.dispose();
      noiseMaterial.dispose();
      noiseRT.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src]);

  // Déclenche le défilement animé à chaque changement de position
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animRef.current = { from, start: performance.now() };
  }, [runKey, from]);

  return <span ref={hostRef} role="img" aria-label={alt} className="project-image webgl-image" />;
}
