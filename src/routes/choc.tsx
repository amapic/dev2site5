import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createFileRoute } from "@tanstack/react-router";
import { cssColorToRawSrgb, passthroughVertex } from "@/components/webgl-image";
import { meta } from "@/components/portfolio";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

export const Route = createFileRoute("/choc")({
  head: () =>
    meta(
      "Choc — Labo",
      "Démo : deux patatoïdes liquides qui se percutent et rebondissent — physique légère en JS, fusion métaball en shader.",
    ),
  component: BlobCollisionDemo,
});

/* ------------------------------------------------------------------ */
/* DEMO « CHOC » : deux patatoïdes liquides dans une boîte.            */
/* La physique tourne en JS (vitesse, rebonds murs, impulsion élastique*/
/* à la collision, écrasement « jelly » amorti à chaque impact) et les  */
/* formes sont dessinées dans un fragment shader : le même patatoïde à  */
/* harmoniques angulaires que le rail d'accueil, avec un lissage        */
/* smooth-min entre les deux champs — au contact, un pont de liquide    */
/* se forme un instant avant que l'impulsion ne les renvoie.            */
/* Départ aléatoire à chaque chargement : pas d'interaction, juste l'anim.*/
/* ------------------------------------------------------------------ */

const CHOC_SCENE = {
  radii: [0.4, 0.35], // rayons de base (unité = demi-hauteur de l'écran)
  colors: ["#2b4fe4", "#e8532b"], // encres des deux patatoïdes (fond clair : teintes pleines, saturées)
  restitution: 0.88, // part d'énergie gardée à chaque rebond
  drag: 0.05, // frottement exponentiel par seconde
  maxSpeed: 1.5,
  merge: 0.26, // largeur du pont liquide (smooth-min, unités monde)
  squashImpulse: 0.9, // montant d'écrasement par unité de vitesse d'impact
  wobbleFreq: 16, // oscillation gelée après l'impact
  wobbleDecay: 4.2,
};

// Amplitudes des 4 harmoniques angulaires — mêmes valeurs que le rail d'accueil.
const HARMONICS = [0.1, 0.07, 0.05, 0.03] as const;

// Phases harmoniques propres à chaque patatoïde (reproductibles d'un rendu à l'autre).
function harmonPhases(variant: number): [number, number, number, number] {
  const channel = (k: number) => {
    const x = Math.sin((variant + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * Math.PI * 2;
  };
  return [channel(1), channel(2), channel(3), channel(4)];
}

const chocFragment = `
  precision highp float;

  uniform vec2 uP1;
  uniform vec2 uP2;
  uniform float uR1;
  uniform float uR2;
  uniform vec4 uPh1;
  uniform vec4 uPh2;
  uniform vec2 uSq1; // montant d'écrasement, angle de l'impact
  uniform vec2 uSq2;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uTime;
  uniform float uAspect;
  uniform float uAA;     // largeur d'anti-aliaising (unités monde)
  uniform float uMerge;  // largeur du pont liquide

  varying vec2 vUv;

  const vec4 H = vec4(0.10, 0.07, 0.05, 0.03);

  // Rotation en repère d'impact : aplatissement le long de la normale de choc,
  // gonflement perpendiculaire (conservation approximative du volume).
  vec2 squashPoint(vec2 q, float amount, float angle) {
    if (amount <= 0.0015) return q;
    float c = cos(-angle); float s = sin(-angle);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    q.x *= 1.0 - amount;
    q.y *= 1.0 + 0.6 * amount;
    c = cos(angle); s = sin(angle);
    return vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  }

  float shapeRadius(float th, float base, vec4 ph) {
    return base * (1.0
      + H.x * sin(3.0 * th + ph.x)
      + H.y * sin(2.0 * th - ph.y)
      + H.z * sin(5.0 * th + ph.z)
      + H.w * sin(7.0 * th - ph.w));
  }

  // Champ scalaire du patatoïde : > 0 à l'intérieur, ~0 au bord.
  float field(vec2 p, vec2 c, float base, vec4 ph, vec2 sq) {
    vec2 q = squashPoint(p - c, sq.x, sq.y);
    float th = atan(q.y, q.x);
    float r = length(q);
    float breathe = 1.0 + 0.02 * sin(uTime * 0.6 + ph.z);
    return shapeRadius(th, base, ph) * breathe - r;
  }

  // Union douce des deux champs : le champ est POSITIF à l'intérieur, donc
  // l'union s'écrit comme un smooth-max (un smooth-min donnerait
  // l'intersection, et son creux -k/4 trouerait tout, rendant la page vide).
  // Quand les deux champs sont comparables, la bosse +k/4 fait sortir
  // l'union de zéro dans l'intervalle : c'est le pont de matière.
  float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }

  void main() {
    // Espace monde : y ∈ [-1, 1] (demi-hauteur = 1), x ∈ [-aspect, aspect].
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;

    float f1 = field(p, uP1, uR1, uPh1, uSq1);
    float f2 = field(p, uP2, uR2, uPh2, uSq2);
    float f = smax(f1, f2, uMerge);

    float alpha = smoothstep(-uAA, uAA, f);
    if (alpha <= 0.0) discard;

    // Couleur : mélange des deux encres pondéré par la force de leur champ,
    // donc les ponts liquides prennent naturellement une teinte intermédiaire.
    float w = clamp(f1 / (f1 + f2 + 1e-4), 0.0, 1.0);
    vec3 color = mix(uColB, uColA, w);

    // Liseré sombre au bord, comme une encre qui s'assèche.
    float edge = 1.0 - smoothstep(0.0, uAA * 3.0 + 0.02, f);
    color *= 1.0 - 0.5 * edge;

    // Reflet de bulle en haut à gauche de chaque patatoïde.
    float hl1 = (1.0 - smoothstep(0.0, 0.16, f1)) * smoothstep(0.15, 0.85, dot(normalize(p - uP1 + 1e-5), vec2(-0.42, 0.91)));
    float hl2 = (1.0 - smoothstep(0.0, 0.16, f2)) * smoothstep(0.15, 0.85, dot(normalize(p - uP2 + 1e-5), vec2(-0.42, 0.91)));
    float hl = mix(hl2, hl1, w);
    color = mix(color, mix(color, vec3(1.0), 0.6), hl * 0.35);

    gl_FragColor = vec4(color, alpha);
  }
`;

type Blob = {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  baseRadius: number;
  phases: [number, number, number, number];
  squash: number; // montant d'écrasement courant
  squashAngle: number;
  lastImpact: number; // horodatage du dernier choc (s)
};

function BlobCollisionDemo() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const still = prefersReducedMotion();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
    } catch {
      return; // sans WebGL, la page reste éditoriale, fond uni
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const colA = cssColorToRawSrgb(CHOC_SCENE.colors[0] ?? "#2b4fe4");
    const colB = cssColorToRawSrgb(CHOC_SCENE.colors[1] ?? "#e8532b");

    const phase0 = harmonPhases(0);
    const phase1 = harmonPhases(2);
    const uniforms = {
      uP1: { value: new THREE.Vector2() },
      uP2: { value: new THREE.Vector2() },
      uR1: { value: CHOC_SCENE.radii[0] },
      uR2: { value: CHOC_SCENE.radii[1] },
      uPh1: { value: new THREE.Vector4(...phase0) },
      uPh2: { value: new THREE.Vector4(...phase1) },
      uSq1: { value: new THREE.Vector2() },
      uSq2: { value: new THREE.Vector2() },
      uColA: { value: colA },
      uColB: { value: colB },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uAA: { value: 0.004 },
      uMerge: { value: CHOC_SCENE.merge },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: passthroughVertex,
      fragmentShader: chocFragment,
      uniforms,
      transparent: true,
    });
    // z = -0.5 : la caméra ortho couvre z_view ∈ [-near, -far] = [-1, 0] ;
    // le plan est posé au milieu du volume (z = 0 serait sur le near plane).
    const chocMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    chocMesh.position.z = -0.5;
    scene.add(chocMesh);

    // ————————————————————————————————— Physique : deux disques élastiques.
    // L'aire définit la masse : le gros patatoïde pousse littéralement le petit.
    let aspect = 1;
    const makeBlob = (variant: number, index: 0 | 1): Blob => {
      // Départ aléatoire chaque chargement : chacun de son côté du cadre,
      // vitesse pointant grossièrement vers l'autre — la première rencontre
      // arrive tout de suite, ce qui suit ne se rejoue jamais pareil.
      const side = index === 0 ? -1 : 1;
      const approach = (index === 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1;
      const speed = 0.45 + Math.random() * 0.3;
      return {
        pos: { x: side * (0.3 + Math.random() * 0.2), y: (Math.random() - 0.5) * 1.1 },
        vel: { x: Math.cos(approach) * speed, y: Math.sin(approach) * speed },
        baseRadius: CHOC_SCENE.radii[index] ?? 0.3,
        phases: harmonPhases(variant),
        squash: 0,
        squashAngle: 0,
        lastImpact: -10,
      };
    };
    const blobs: [Blob, Blob] = [makeBlob(0, 0), makeBlob(2, 1)];

    // Les harmoniques gonflent le rayon jusqu'à ~28 % : les murs tiennent compte du max.
    const wallRadius = (b: Blob) => b.baseRadius * (1 + 0.28);

    const step = (dt: number, time: number) => {
      for (const b of blobs) {
        // Dérive organique : une très lente force de balancement entretient le mouvement.
        b.vel.x += 0.045 * Math.sin(time * 0.4 + b.phases[0]) * dt;
        b.vel.y += 0.045 * Math.sin(time * 0.37 + b.phases[1]) * dt;
        const dragFactor = Math.exp(-CHOC_SCENE.drag * dt);
        b.vel.x *= dragFactor;
        b.vel.y *= dragFactor;
        // Sans ça, deux patatoïdes calmes finiraient par stagner au fond : on relance.
        const speed = Math.hypot(b.vel.x, b.vel.y);
        if (speed < 0.16) {
          const a = Math.sin(time * 3.7 + b.phases[2]) * Math.PI;
          b.vel.x += Math.cos(a) * 0.1 * dt;
          b.vel.y += Math.sin(a) * 0.1 * dt;
        }
        if (speed > CHOC_SCENE.maxSpeed) {
          b.vel.x *= CHOC_SCENE.maxSpeed / speed;
          b.vel.y *= CHOC_SCENE.maxSpeed / speed;
        }
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;

        // Murs : rebond sur l'aire visible, décalée du rayon maximal.
        const wr = wallRadius(b);
        const lx = aspect - wr;
        const ly = 1 - wr;
        if (b.pos.x < -lx && b.vel.x < 0) {
          b.pos.x = -lx;
          b.vel.x = Math.abs(b.vel.x) * CHOC_SCENE.restitution;
        }
        if (b.pos.x > lx && b.vel.x > 0) {
          b.pos.x = lx;
          b.vel.x = -Math.abs(b.vel.x) * CHOC_SCENE.restitution;
        }
        if (b.pos.y < -ly && b.vel.y < 0) {
          b.pos.y = -ly;
          b.vel.y = Math.abs(b.vel.y) * CHOC_SCENE.restitution;
        }
        if (b.pos.y > ly && b.vel.y > 0) {
          b.pos.y = ly;
          b.vel.y = -Math.abs(b.vel.y) * CHOC_SCENE.restitution;
        }
      }

      // Choc patatoïde contre patatoïde : impulsion élastique le long de la normale.
      const [a, b] = blobs;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const minDist = wallRadius(a) + wallRadius(b);
      if (d < minDist) {
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minDist - d;
        const ma = a.baseRadius * a.baseRadius;
        const mb = b.baseRadius * b.baseRadius;
        // Séparation proportionnelle aux masses inverses.
        a.pos.x -= nx * overlap * (mb / (ma + mb));
        a.pos.y -= ny * overlap * (mb / (ma + mb));
        b.pos.x += nx * overlap * (ma / (ma + mb));
        b.pos.y += ny * overlap * (ma / (ma + mb));
        const vn = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
        if (vn < 0) {
          const impactSpeed = -vn;
          const j = (-(1 + CHOC_SCENE.restitution) * vn) / (1 / ma + 1 / mb);
          a.vel.x += (j / ma) * nx;
          a.vel.y += (j / ma) * ny;
          b.vel.x -= (j / mb) * nx;
          b.vel.y -= (j / mb) * ny;
          // Écrasement « jelly » : montant cueilli sur la vitesse d'impact,
          // relaxé ensuite par une oscillation amortie dans la boucle de rendu.
          const squash = Math.min(0.42, impactSpeed * CHOC_SCENE.squashImpulse);
          if (squash > 0.03) {
            a.squash = squash;
            a.squashAngle = Math.atan2(ny, nx);
            a.lastImpact = time;
            b.squash = squash;
            b.squashAngle = a.squashAngle;
            b.lastImpact = time;
          }
        }
      }

      // Relaxation de l'écrasement : oscillation amortie type gelée.
      for (const bl of blobs) {
        const t = time - bl.lastImpact;
        if (t >= 0 && t < 3)
          bl.squash *=
            Math.exp(-CHOC_SCENE.wobbleDecay * dt) * Math.cos(CHOC_SCENE.wobbleFreq * dt);
        else if (bl.squash !== 0) bl.squash = 0;
      }
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      aspect = w / h;
      uniforms.uAspect.value = aspect;
      // Anti-aliaising : ~1,5 px convertis en unités monde (le canvas est en pixels physiques).
      uniforms.uAA.value = 1.5 / ((h * renderer.getPixelRatio()) / 2);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const renderFrame = (time: number) => {
      uniforms.uP1.value.set(blobs[0].pos.x, blobs[0].pos.y);
      uniforms.uP2.value.set(blobs[1].pos.x, blobs[1].pos.y);
      uniforms.uSq1.value.set(Math.max(0, blobs[0].squash), blobs[0].squashAngle);
      uniforms.uSq2.value.set(Math.max(0, blobs[1].squash), blobs[1].squashAngle);
      uniforms.uTime.value = time;
      renderer.render(scene, camera);
    };

    if (still) {
      // Sans animation : patatoïdes au repos, posés côte à côte, un seul rendu.
      blobs[0].pos = { x: -(aspect - wallRadius(blobs[0]) - 0.05), y: 0 };
      blobs[1].pos = { x: aspect - wallRadius(blobs[1]) - 0.05, y: 0 };
      blobs[0].vel = { x: 0, y: 0 };
      blobs[1].vel = { x: 0, y: 0 };
      renderFrame(0);
      return () => {
        observer.disconnect();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    let raf = 0;
    let last = performance.now();
    const start = last;
    const frame = (now: number) => {
      // Pas de physique figé à 100 ms : un onglet masqué ne rattrape pas d'un coup.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      step(dt, (now - start) / 1000);
      renderFrame((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="choc-stage" ref={hostRef}>
      <div className="choc-titling" aria-hidden="true">
        <p className="choc-eyebrow">Labo — démo n°2 / Physique liquide</p>
        <h1 className="choc-title">Choc</h1>
        <p className="choc-lede">
          Deux patatoïdes d'encre se cherchent, se touchent, se renvoient la balle.
        </p>
      </div>
    </div>
  );
}
