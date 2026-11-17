import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  bakeFbmNoiseTexture,
  cssColorToRawSrgb,
  passthroughVertex,
} from "@/components/webgl-image";
import {
  FIELD_RES,
  FIELD_SPAN,
  INK_BAKE_BASE,
  harmonicMask,
  harmonicMaskScreen,
  loadSvgElement,
  maskToFieldTexture,
  rasterizeSvgScreen,
  rebakeFieldTexture,
  screenFieldHeight,
  screenFieldWidth,
  shapeSeed,
} from "@/components/ink-shape-field";
import { INK_SHAPE_URLS } from "@/components/ink-shapes";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

/* ------------------------------------------------------------------ */
/* Bord « encre » des patatoïdes — même famille que le reveal de       */
/* ink.niccolofanton.dev (d'après davidwhyte.com) : un front de        */
/* bruit aquarelle, cuit une fois dans une texture comme le reveal du  */
/* survol, seuillé raide contre le champ du patatoïde. La forme est    */
/* un champ de distance signé recuit en texture (ink-shape-field.ts) : */
/* deux SDF — forme de début / forme de fin — mixées par uMorph, le    */
/* tout piloté par les mêmes réglages live (HUD). Là où l'encre est    */
/* passée, alpha = 1 (image) ; partout ailleurs 0.                     */
/* ------------------------------------------------------------------ */

export type InkEdgeSettings = {
  baseRadius: number; // rayon de base (unité = demi-hauteur du cadre)
  harm: number; // échelle des harmoniques angulaires (irrégularité de forme)
  morph: number; // morphing forme de début → forme de fin (0 = début, 1 = fin)
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
  baseRadius: 0.49, // 1 = demi-hauteur du cadre (SVG plein écran : sans effet dessus)
  harm: 0.3, // échelle des harmoniques angulaires (irrégularité de forme)
  morph: 0,
  power: 8,
  softness: 0.3,
  spread: 12,
  soakDist: 0.05,
  rimLag: 0,
  edgeTint: 0,
  pulse: 0, // respiration coupée par défaut : gros gain GPU (rendu à la demande)
  pulseSpeed: 0,
  drift: 0, // dérive du bruit coupée par défaut (même raison)
  driftSpeed: 0,
  noiseScale: 1,
  octaves: 1,
  contrast: 1,
  ink: "#3b4a63",
};

// Objet partagé mutable : le HUD (ink-debug-hud.tsx) l'écrit en direct,
// chaque instance InkBlobImage le relit à chaque frame.
export const inkEdgeSettings: InkEdgeSettings = { ...inkEdgeDefaults };

const blobFragment = `
  precision highp float;

  uniform sampler2D uMap;
  uniform sampler2D uNoise;
  uniform sampler2D uFieldA; // SDF de la forme de début
  uniform sampler2D uFieldB; // SDF de la forme de fin

  uniform vec2 uCover;
  uniform float uAspect;
  uniform float uTime;
  uniform vec4 uShape;       // déphasages propres au patatoïde (liseré, pulse, dérive)
  uniform float uShapeScale; // échelle live du patatoïde (baseRadius / base de recuit)
  uniform float uMorph;      // 0 = forme de début, 1 = forme de fin
  uniform float uFieldSpan;
  uniform float uScreenMap;  // 1 = champs recuits en espace écran plein cadre
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
  // puis seuil. field ≈ 0 au bord, croît vers l'intérieur (unités monde).
  float maskOf(float noiseSample, float field) {
    float sdf = 1.0 + field * uSpread;
    float intensity = pow(max(sdf, 0.0), uPower) * noiseSample;
    return smoothstep(uSharpMin, uSharpMax, intensity);
  }

  // UV d'échantillonnage d'un front reculé d'un facteur s le long des
  // axes (s = pulse·échelle, ou rimLag inclus pour le front B) :
  // pos/(domaine·s) recentre et applique le recul, v retourné (canvas).
  vec2 frontUv(vec2 p, vec2 domain, float s) {
    return vec2(p.x, -p.y) / (domain * s) + 0.5;
  }

  void main() {
    // Coordonnées centrées, unité = demi-hauteur.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    // Respiration : échantillonner le champ au point p / pulse puis le
    // re-multiplier revient exactement à agrandir la silhouette.
    float pulse = 1.0 + uPulse * sin(uTime * uPulseSpeed + uShape.z);
    float g = pulse * uShapeScale;

    // Domaine TEXTE de recuit des champs : carré [-SPAN, SPAN] (legacy) ou
    // rectangle plein écran (largeur = aspect, hauteur = 1) en mode écran.
    vec2 fieldDomain =
      uScreenMap > 0.5 ? vec2(uAspect, 1.0) : vec2(2.0 * uFieldSpan);

    // Field = champ signé du patatoïde (unités monde) : mélange des deux
    // SDF recuites (début / fin) pondéré par uMorph.
    vec2 fu = frontUv(p, fieldDomain, g);
    float field = mix(texture2D(uFieldA, fu).r, texture2D(uFieldB, fu).r, uMorph) * g;

    // Bruit aquarelle à trois canaux, prélevé avec une dérive lente.
    vec3 noise = texture2D(uNoise, vUv + uDrift * vec2(
      sin(uTime * uDriftSpeed + uShape.x),
      cos(uTime * uDriftSpeed * 0.83 + uShape.y)
    )).rgb;

    // L'encre a passé : à l'intérieur, le bruit est tiré vers 1, les taches
    // se bouchent — même « soak » que la progression du reveal.
    float soak = clamp(field / max(uSoakDist, 1e-3), 0.0, 1.0);

    // Deux fronts décalés : c'est leur désaccord qui dessine le liseré d'encre.
    // Le front B recule d'une fraction rimLag le long du rayon — l'identité
    // d'origine edge*(1-lag) - r s'écrit (1-lag) * field(p / ((1-lag) * g)) * g.
    vec2 fuB = frontUv(p, fieldDomain, (1.0 - uRimLag) * g);
    float fieldB = mix(texture2D(uFieldA, fuB).r, texture2D(uFieldB, fuB).r, uMorph)
      * (1.0 - uRimLag) * g;
    float a = maskOf(mix(noise.x, 1.0, soak), field);
    float b = maskOf(mix(noise.y, 1.0, soak), fieldB);
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

const morphEase = (t: number) => t * t * (3 - 2 * t);

// L'espace visible d'un cadre 4/3 atteint ~0.83 en x (demi-hauteur = 1) :
// la zone de champ utile reste dans le domaine du recuit.
const EMPTY_MASK = (n: number) => new Uint8Array(n);

// Variante de fin par défaut : une autre graine d'harmoniques, de façon que
// le curseur de morphing montre une vraie métamorphose avant tout réglage.
const END_VARIANT_OFFSET = 7;

type FieldSlot = {
  texture: THREE.DataTexture;
  // Variante harmonique recuite dans ce champ (null après un recuit SVG).
  harmonicVariant: number | null;
  bakedHarm: number;
  // Source SVG éventuelle (image chargée, re-rastérisable au resize).
  svg: { url: string; img: HTMLImageElement } | null;
};

/**
 * Image en patatoïde au bord « encre » (ink.niccolofanton.dev). Remplace le
 * <img> des patatoïdes du rail ; si WebGL est indisponible, on retombe sur
 * l'image plate d'origine (mêmes classes, même habillage CSS).
 */
export function InkBlobImage({
  src,
  alt,
  variant = 0,
}: {
  src: string;
  alt: string;
  variant?: number;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (fallback) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // La forme du patatoïde est dessinée par le shader : plus de clipping
    // border-radius lisse (la classe .ink-shaped le neutralise en CSS).
    host.closest(".project-blob")?.classList.add("ink-shaped");
    // Mode écran : le patatoïde couvre tout le cadre de la scène — la slide
    // passe plein écran (voir .project-slide.ink-screen dans styles.css).
    const inkSlide = host.closest<HTMLElement>(".project-slide");

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ——— Champs de forme (SDF) : départ / fin.
    // Legacy (aucun SVG sculpté pour la variante) : les deux champs sont
    // recuits depuis le patatoïde harmonique (domaine carré [-SPAN, SPAN],
    // taille réglée en live par uShapeScale = baseRadius / INK_BAKE_BASE).
    // Écran (au moins un SVG sculpté) : les deux champs sont recuits en
    // espace plein cadre — le domaine SVG [0..1000]² tombe sur l'écran
    // entier — et recalés à chaque changement d'aspect.
    const overrides = INK_SHAPE_URLS[variant] ?? {};
    const screenMode = !!(overrides.start || overrides.end);

    // Aspect initial du cadre (rectifié par resize() au fil des frames).
    const hostAspect0 =
      host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 1;
    let hostAspect = hostAspect0;
    if (screenMode && inkSlide) inkSlide.classList.add("ink-screen");
    // Grille écran calée sur les pixels du cadre : un texel ≈ 1 px CSS
    // (sinon les marches du recuit se voient — bords granuleux).
    const fieldH = () =>
      screenMode ? screenFieldHeight(hostAspect, host.clientHeight || undefined) : FIELD_RES;
    const fieldW = () => (screenMode ? screenFieldWidth(fieldH(), hostAspect) : FIELD_RES);
    // Texels par unité monde : écran = hauteur de grille (1 unité = hauteur
    // du cadre) ; legacy = FIELD_RES / (2·SPAN).
    const texelsPerUnit = () => (screenMode ? fieldH() : FIELD_RES / (2 * FIELD_SPAN));

    const slots: [FieldSlot, FieldSlot] = [
      {
        texture: maskToFieldTexture(
          harmonicMask(variant, inkEdgeSettings.harm) ?? EMPTY_MASK(FIELD_RES * FIELD_RES),
          FIELD_RES,
          FIELD_RES,
          texelsPerUnit(),
        ),
        harmonicVariant: variant,
        bakedHarm: inkEdgeSettings.harm,
        svg: null,
      },
      {
        texture: maskToFieldTexture(
          harmonicMask(variant + END_VARIANT_OFFSET, inkEdgeSettings.harm) ??
            EMPTY_MASK(FIELD_RES * FIELD_RES),
          FIELD_RES,
          FIELD_RES,
          texelsPerUnit(),
        ),
        harmonicVariant: variant + END_VARIANT_OFFSET,
        bakedHarm: inkEdgeSettings.harm,
        svg: null,
      },
    ];
    const ownedTextures = [...slots.map((s) => s.texture)];

    // État rendu à la dernière frame (rendu à la demande) : chaîne vide =
    // « rendu périmé, à refaire » (positionné aussi par resize et bakeSlot).
    let lastSnapshot = "";

    // Recuit d'un champ dans ses dimensions courantes (masque à faculté
    // harmonique patate ou SVG sculpté) — remplace aussi la texture si la
    // hauteur de grille a changé (aspect différent).
    const bakeSlot = (slotIndex: 0 | 1) => {
      const slot = slots[slotIndex]!;
      const w = fieldW();
      const h = fieldH();
      const tpu = texelsPerUnit();
      const mask = slot.svg
        ? rasterizeSvgScreen(slot.svg.img, w, h)?.mask
        : screenMode
          ? harmonicMaskScreen(
              slot.harmonicVariant ?? variant,
              inkEdgeSettings.harm,
              inkEdgeSettings.baseRadius,
              w,
              h,
            )
          : harmonicMask(slot.harmonicVariant ?? variant, inkEdgeSettings.harm);
      if (!mask) return;
      if (slot.texture.image.width === w && slot.texture.image.height === h) {
        rebakeFieldTexture(slot.texture, mask, tpu);
        slot.bakedHarm = inkEdgeSettings.harm;
      } else {
        const next = maskToFieldTexture(mask, w, h, tpu);
        ownedTextures.push(next);
        const old = slot.texture;
        slots[slotIndex] = { ...slot, texture: next };
        uniforms[slotIndex === 0 ? "uFieldA" : "uFieldB"].value = next;
        old.dispose();
        const ownedIndex = ownedTextures.indexOf(old);
        if (ownedIndex >= 0) ownedTextures.splice(ownedIndex, 1);
      }
      lastSnapshot = ""; // recuit = nouveau contenu : forcer un rendu
    };

    const uniforms = {
      uMap: { value: null as THREE.Texture | null },
      uNoise: { value: null as THREE.Texture | null },
      uFieldA: { value: null as THREE.DataTexture | null },
      uFieldB: { value: null as THREE.DataTexture | null },
      uCover: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uShape: { value: shapeSeed(variant) },
      uShapeScale: { value: 1 },
      uMorph: { value: 0 },
      uFieldSpan: { value: FIELD_SPAN },
      uScreenMap: { value: screenMode ? 1 : 0 },
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
    uniforms.uFieldA.value = slots[0].texture;
    uniforms.uFieldB.value = slots[1].texture;
    const material = new THREE.ShaderMaterial({
      vertexShader: passthroughVertex,
      fragmentShader: blobFragment,
      uniforms,
      transparent: true,
    });
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

    // ——— Réglages SVG sculptés : chaque champ est remplacé dès que l'image
    // est prête (échec silencieux → recuit harmonique conservé). L'image
    // chargée reste accrochée au slot pour re-rastériser au resize.
    const loadSvgInto = async (slotIndex: 0 | 1, url: string | undefined) => {
      if (!url) return;
      const img = await loadSvgElement(url);
      if (disposed) return; // démontage (StrictMode double-passe) : silencieux
      if (!img) {
        console.warn(
          `Patatoïde ${variant} : forme SVG « ${slotIndex === 0 ? "début" : "fin"} » ignorée (${url ?? "aucune URL"})`,
        );
        return;
      }
      const slot = slots[slotIndex]!;
      slots[slotIndex] = { ...slot, svg: { url, img }, harmonicVariant: null, bakedHarm: 0 };
      bakeSlot(slotIndex);
      // Mode écran + forme de fin chargée : le SVG d'arrivée sert aussi de
      // masque CSS (var --ink-mask-url, appliquée à .project-details dans
      // styles.css, étirée 100%×100% comme le mapping du shader) — les
      // contenus DOM du panneau restent à l'intérieur de la forme.
      if (screenMode && slotIndex === 1 && inkSlide) {
        inkSlide.style.setProperty("--ink-mask-url", `url('${url}')`);
      }
    };
    void loadSvgInto(0, overrides.start);
    void loadSvgInto(1, overrides.end);

    let raf = 0;

    let lastBakedAspect = hostAspect0;
    let rebakeTimer = 0;
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      hostAspect = w / h;
      renderer.setSize(w, h, false);
      uniforms.uAspect.value = hostAspect;
      lastSnapshot = ""; // le resize vide le canvas : forcer un rendu frais
      // Recadrage « cover » : l'image remplit le cadre sans déformation.
      if (imageAspect > hostAspect) uniforms.uCover.value.set(hostAspect / imageAspect, 1);
      else uniforms.uCover.value.set(1, imageAspect / hostAspect);
      // Mode écran : la grille des champs est calée sur le cadre — au
      // changement d'aspect OU de dimensions (rotation, fenêtre, premier
      // passage clientHeight connu), re-recuit débounce des 2 champs.
      if (
        screenMode &&
        (Math.abs(hostAspect - lastBakedAspect) > 0.004 ||
          slots.some(
            (s) => s.texture.image.width !== fieldW() || s.texture.image.height !== fieldH(),
          ))
      ) {
        window.clearTimeout(rebakeTimer);
        rebakeTimer = window.setTimeout(() => {
          if (disposed) return;
          lastBakedAspect = hostAspect;
          bakeSlot(0);
          bakeSlot(1);
        }, 250);
      }
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
    let shapeHarmBaked = inkEdgeSettings.harm;
    let shapeBaseBaked = inkEdgeSettings.baseRadius;
    let lastHarmRebake = 0;
    const REBAKE_MIN_GAP = 300; // ms entre deux recuits harmoniques (curseur harm en drag)
    // Le morphing peut être piloté au scroll : l'attribut data-ink-morph
    // (écrit par la chorégraphie GSAP sur .project-slide) prend le pas sur
    // le HUD. On cherche l'attribut sur l'ancêtre qui le porte — PAS
    // .project-blob, qui est un descendant de la slide et ne le reçoit pas.
    const scrollMorphSource = host.closest<HTMLElement>("[data-ink-morph]");
    const frame = (now: number) => {
      // Réglages partagés (HUD) relus à chaque frame : tout est réglable en live.
      const s = inkEdgeSettings;
      if (
        s.octaves !== baked.octaves ||
        s.noiseScale !== baked.noiseScale ||
        s.contrast !== baked.contrast
      ) {
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
      // Recuit des champs quand la géométrie harmonique a changé (curseurs
      // harm / baseRadius en drag) : morcelé dans le temps (un recuit EDT
      // coûte quelques dizaines de ms). Mode écran : la taille est portée
      // par le recuit lui-même (uShapeScale reste 1) ; legacy : uShapeScale.
      const shapeDirty =
        s.harm !== shapeHarmBaked || (screenMode && s.baseRadius !== shapeBaseBaked);
      if (shapeDirty && now - lastHarmRebake > REBAKE_MIN_GAP) {
        let dirty = false;
        for (const slotIndex of [0, 1] as const) {
          const slot = slots[slotIndex]!;
          if (slot.harmonicVariant !== null) {
            bakeSlot(slotIndex);
            slot.bakedHarm = s.harm;
            dirty = true;
          }
        }
        if (dirty) {
          lastHarmRebake = now;
          shapeHarmBaked = s.harm;
          shapeBaseBaked = s.baseRadius;
        }
      }
      uniforms.uShapeScale.value = screenMode ? 1 : s.baseRadius / INK_BAKE_BASE;
      const attrMorph = scrollMorphSource?.dataset["inkMorph"];
      const morph =
        attrMorph !== undefined && attrMorph !== "" ? Number.parseFloat(attrMorph) : s.morph;
      uniforms.uMorph.value = morphEase(morph) * still;
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

      uniforms.uTime.value = ((now - start) / 1000) * still * 1;
      // Pas de flash noir : le patatoïde n'apparaît qu'une fois la photo chargée.
      mesh.visible = uniforms.uMap.value !== null;

      // Rendu à la demande : la seule chose dépendante du temps est la
      // respiration et la dérive du bruit (les deux par uTime). Les deux
      // nulles → image statique : on ne redessine que si un réglage, le
      // morphing au scroll ou la visibilité de la slide a changé — et pas
      // du tout pour une slide cachée (les 6 canvases ne rendent jamais
      // ensemble, GPU au repos sinon).
      const slideHidden =
        inkSlide?.style.visibility === "hidden" || inkSlide?.style.opacity === "0";
      const animating = still > 0 && (uniforms.uPulse.value !== 0 || uniforms.uDrift.value !== 0);
      const snapshot = slideHidden
        ? "hidden"
        : [
            morph,
            s.harm,
            s.baseRadius,
            s.power,
            s.softness,
            s.spread,
            s.soakDist,
            s.rimLag,
            s.edgeTint,
            s.ink,
            s.pulse,
            s.pulseSpeed,
            s.drift,
            s.driftSpeed,
            s.octaves,
            s.noiseScale,
            s.contrast,
            mesh.visible ? 1 : 0,
          ].join("|");
      if (slideHidden) {
        // Mémorisé même caché : au retour de visibilité le snapshot diffère
        // (il repasse de « hidden » à l'état long) et déclenche un rendu frais.
        lastSnapshot = snapshot;
      } else if (animating || snapshot !== lastSnapshot) {
        renderer.render(scene, camera);
        lastSnapshot = snapshot;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.closest(".project-blob")?.classList.remove("ink-shaped");
      inkSlide?.classList.remove("ink-screen");
      inkSlide?.style.removeProperty("--ink-mask-url");
      texture.dispose();
      noise.dispose();
      for (const t of ownedTextures) t.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, variant, fallback]);

  if (fallback) return <img src={src} alt={alt} loading="lazy" width={1600} height={1000} />;

  return <span ref={hostRef} className="ink-blob" role="img" aria-label={alt} />;
}
