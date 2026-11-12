import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { bakeFbmNoiseTexture, cssColorToRawSrgb, passthroughVertex } from '@/components/webgl-image';
import { prefersReducedMotion } from '@/hooks/use-smooth-scroll';

/* ------------------------------------------------------------------ */
/* Bord « encre » des patatoïdes — même famille que le reveal de       */
/* ink.niccolofanton.dev (d'après davidwhyte.com) : un front de        */
/* bruit aquarelle, cuit une fois dans une texture comme le reveal du  */
/* survol, seuillé raide contre le rayon du patatoïde. La forme        */
/* (patate + taches) est entièrement dessinée par le fragment shader : */
/* là où l'encre est passée, alpha = 1 (image) ; partout ailleurs 0.   */
/* Les photos restent pleines à l'intérieur ; un liseré d'encre naît   */
/* du désaccord entre deux fronts, comme le reveal.                    */
/* ------------------------------------------------------------------ */

export type InkEdgeSettings = {
  baseRadius: number; // rayon de base (unité = demi-hauteur du cadre)
  harm: number; // échelle des harmoniques angulaires (irrégularité de forme)
  power: number; // exposant du masque : plus bas = taches plus amples
  softness: number; // largeur de la transition du seuil
  spread: number; // inverse de la largeur du front : concentration des taches au bord
  soakDist: number; // profondeur à laquelle le bruit est tiré vers 1 (intérieur plein)
  rimLag: number; // décalage du second front : épaisseur du liseré
  edgeTint: number; // intensité du liseré d'encre
  pulse: number; // amplitude de la respiration du rayon
  pulseSpeed: number; // vitesse de la respiration
  drift: number; // dérive du bruit dans le temps
  driftSpeed: number; // vitesse de la dérive
  noiseScale: number; // échelle du grain aquarelle (recuit la texture)
  octaves: number; // octaves de bruit (recuit la texture)
  contrast: number; // contraste du bruit (recuit la texture)
  ink: string; // couleur du liseré
};

export const inkEdgeDefaults: InkEdgeSettings = {
  baseRadius: 0.34,
  harm: 1,
  power: 3,
  softness: 0.05,
  spread: 4,
  soakDist: 0.22,
  rimLag: 0.11,
  edgeTint: 0.55,
  pulse: 0.025,
  pulseSpeed: 0.5,
  drift: 0.015,
  driftSpeed: 0.2,
  noiseScale: 2.6,
  octaves: 6,
  contrast: 0.55,
  ink: '#3b4a63',
};

// Objet partagé mutable : le HUD (ink-debug-hud.tsx) l'écrit en direct,
// chaque instance InkBlobImage le relit à chaque frame.
export const inkEdgeSettings: InkEdgeSettings = { ...inkEdgeDefaults };

// Amplitudes des 4 harmoniques angulaires de la forme patate (multiplicateur commun : harm).
const HARMONICS = [0.11, 0.07, 0.05, 0.03] as const;

// Graines des harmoniques angulaires : chaque variante (blob-N) a son
// propre patatoïde, reproductible d'un rendu à l'autre.
function shapeSeed(variant: number) {
  const channel = (k: number) => {
    const x = Math.sin((variant + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * Math.PI * 2;
  };
  return new THREE.Vector4(channel(1), channel(2), channel(3), channel(4));
}

const blobFragment = `
  precision highp float;

  uniform sampler2D uMap;
  uniform sampler2D uNoise;

  uniform vec2 uCover;
  uniform float uAspect;
  uniform float uTime;
  uniform float uBaseRadius;
  uniform vec4 uHarm;
  uniform vec4 uShape;
  uniform vec3 uInk;
  uniform float uPower;
  uniform float uSharpMin;
  uniform float uSharpMax;
  uniform float uSpread;
  uniform float uSoakDist;
  uniform float uRimLag;
  uniform float uEdgeTint;
  uniform float uPulse;
  uniform float uPulseSpeed;
  uniform float uDrift;
  uniform float uDriftSpeed;

  varying vec2 vUv;

  // Même équation de masque que le reveal d'encre : intensity = pow(sdf, power) * bruit,
  // puis seuil. sdf = 1 au bord, croît vers l'intérieur.
  float maskOf(float noiseSample, float edge, float r) {
    float sdf = 1.0 + (edge - r) * uSpread;
    float intensity = pow(max(sdf, 0.0), uPower) * noiseSample;
    return smoothstep(uSharpMin, uSharpMax, intensity);
  }

  void main() {
    // Coordonnées centrées, unité = demi-hauteur.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float theta = atan(p.y, p.x);

    // Patatoïde : rayon de base modulé par quelques harmoniques angulaires,
    // plus une respiration lente — le bord ondule comme une tache d'encre vivante.
    float base = uBaseRadius * (1.0
      + uHarm.x * sin(3.0 * theta + uShape.x)
      + uHarm.y * sin(2.0 * theta - uShape.y)
      + uHarm.z * sin(5.0 * theta + uShape.z)
      + uHarm.w * sin(7.0 * theta - uShape.w));
    float pulse = 1.0 + uPulse * sin(uTime * uPulseSpeed + uShape.z);
    float edge = base * pulse;

    // Bruit aquarelle à trois canaux, prélevé avec une dérive lente.
    vec3 noise = texture2D(uNoise, vUv + uDrift * vec2(
      sin(uTime * uDriftSpeed + uShape.x),
      cos(uTime * uDriftSpeed * 0.83 + uShape.y)
    )).rgb;

    // L'encre a passé : à l'intérieur, le bruit est tiré vers 1, les taches
    // se bouchent — même « soak » que la progression du reveal.
    float soak = clamp((edge - r) / max(uSoakDist, 1e-3), 0.0, 1.0);

    // Deux fronts décalés : c'est leur désaccord qui dessine le liseré d'encre.
    float a = maskOf(mix(noise.x, 1.0, soak), edge, r);
    float b = maskOf(mix(noise.y, 1.0, soak), edge * (1.0 - uRimLag), r);
    float revealed = max(a, b);

    // Liseré d'encre, sur la partie image, juste derrière le bord.
    float rim = pow(clamp(abs(a - b), 0.0, 1.0), 1.75);

    // La photo, recadrée cover, puis teintée du liseré au bord du patatoïde.
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    vec3 photo = texture2D(uMap, uv).rgb;
    vec3 color = mix(photo, uInk, rim * uEdgeTint);

    gl_FragColor = vec4(color, revealed);
  }
`;

/**
 * Image en patatoïde au bord « encre » (ink.niccolofanton.dev). Remplace le
 * <img> des patatoïdes du rail ; si WebGL est indisponible, on retombe sur
 * l'image plate d'origine (mêmes classes, même habillage CSS).
 */
export function InkBlobImage({ src, alt, variant = 0 }: { src: string; alt: string; variant?: number }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (fallback) return;
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // La forme du patatoïde est dessinée par le shader : plus de clipping
    // border-radius lisse (la classe .ink-shaped le neutralise en CSS).
    host.closest('.project-blob')?.classList.add('ink-shaped');

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uMap: { value: null as THREE.Texture | null },
      uNoise: { value: null as THREE.Texture | null },
      uCover: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uBaseRadius: { value: inkEdgeSettings.baseRadius },
      uHarm: { value: new THREE.Vector4() },
      uShape: { value: shapeSeed(variant) },
      uInk: { value: cssColorToRawSrgb(inkEdgeSettings.ink) },
      uPower: { value: inkEdgeSettings.power },
      uSharpMin: { value: 1 - inkEdgeSettings.softness },
      uSharpMax: { value: 1 },
      uSpread: { value: inkEdgeSettings.spread },
      uSoakDist: { value: inkEdgeSettings.soakDist },
      uRimLag: { value: inkEdgeSettings.rimLag },
      uEdgeTint: { value: inkEdgeSettings.edgeTint },
      uPulse: { value: 0 },
      uPulseSpeed: { value: inkEdgeSettings.pulseSpeed },
      uDrift: { value: 0 },
      uDriftSpeed: { value: inkEdgeSettings.driftSpeed },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: passthroughVertex, fragmentShader: blobFragment, uniforms, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    // Bruit aquarelle cuit une seule fois, avec une graine propre au patatoïde.
    let imageAspect = 1.45;
    let baked = {
      octaves: inkEdgeSettings.octaves,
      noiseScale: inkEdgeSettings.noiseScale,
      contrast: inkEdgeSettings.contrast,
      ink: inkEdgeSettings.ink,
    };
    const noise = bakeFbmNoiseTexture(renderer, {
      size: 1024,
      planeRatio: 1,
      noiseScale: baked.noiseScale,
      contrast: baked.contrast,
      octaves: baked.octaves,
      seed: new THREE.Vector3(variant * 17 + 5, variant * 31 + 11, variant * 7 + 23),
    });
    uniforms.uNoise.value = noise.texture;

    let raf = 0;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const hostAspect = w / h;
      renderer.setSize(w, h, false);
      uniforms.uAspect.value = hostAspect;
      // Recadrage « cover » : l'image remplit le cadre sans déformation.
      if (imageAspect > hostAspect) uniforms.uCover.value.set(hostAspect / imageAspect, 1);
      else uniforms.uCover.value.set(1, imageAspect / hostAspect);
    };

    const texture = new THREE.TextureLoader().load(src, (loaded) => {
      const img = loaded.image as HTMLImageElement;
      imageAspect = img.width / img.height;
      uniforms.uMap.value = loaded;
      resize();
    });

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Sans animation (prefers-reduced-motion), respiration et dérive sont nulles.
    const still = prefersReducedMotion() ? 0 : 1;
    const start = performance.now();
    const frame = () => {
      // Réglages partagés (HUD) relus à chaque frame : tout est réglable en live.
      const s = inkEdgeSettings;
      if (s.octaves !== baked.octaves || s.noiseScale !== baked.noiseScale || s.contrast !== baked.contrast) {
        baked = {
          octaves: Math.round(s.octaves),
          noiseScale: s.noiseScale,
          contrast: s.contrast,
          ink: baked.ink,
        };
        noise.rebake(baked);
      }
      if (s.ink !== baked.ink) {
        baked = { ...baked, ink: s.ink };
        uniforms.uInk.value = cssColorToRawSrgb(s.ink);
      }
      uniforms.uBaseRadius.value = s.baseRadius;
      uniforms.uHarm.value.set(HARMONICS[0], HARMONICS[1], HARMONICS[2], HARMONICS[3]).multiplyScalar(s.harm);
      uniforms.uPower.value = s.power;
      uniforms.uSharpMin.value = 1 - s.softness;
      uniforms.uSpread.value = s.spread;
      uniforms.uSoakDist.value = s.soakDist;
      uniforms.uRimLag.value = s.rimLag;
      uniforms.uEdgeTint.value = s.edgeTint;
      uniforms.uPulse.value = s.pulse * still;
      uniforms.uPulseSpeed.value = s.pulseSpeed;
      uniforms.uDrift.value = s.drift * still;
      uniforms.uDriftSpeed.value = s.driftSpeed;

      uniforms.uTime.value = ((performance.now() - start) / 1000) * still * 1;
      // Pas de flash noir : le patatoïde n'apparaît qu'une fois la photo chargée.
      mesh.visible = uniforms.uMap.value !== null;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.closest('.project-blob')?.classList.remove('ink-shaped');
      texture.dispose();
      noise.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, variant, fallback]);

  if (fallback) return <img src={src} alt={alt} loading="lazy" width={1600} height={1000} />;

  return <span ref={hostRef} className="ink-blob" role="img" aria-label={alt} />;
}
