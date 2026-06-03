"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * WaveDots — seidiges grünes Punkt-Wellenfeld (Three.js).
 *
 * Ein perspektivisches Gitter aus Punkten wogt über zwei gekreuzte Sinuswellen
 * (x- und y-Achse) → die Reihen laufen in der Perspektive zu fließenden, sich
 * kreuzenden Bändern zusammen. Wo Wellenkämme liegen, werden die Dots heller
 * & größer (per-Vertex-Farbe + sizeAttenuation); weißer Fog lässt das Feld in
 * die Ferne ausbleichen → „an manchen Orten dichter/heller". Oben weich
 * ausgeblendet (CSS-Mask), damit zentrierter Content lesbar bleibt.
 *
 * Technik aus 21st.dev „Dotted Surface" / three.js webgl_points_waves,
 * adaptiert: Brand-Grün, transparenter Hintergrund, an den Eltern-Container
 * gebunden (ResizeObserver), DPR-gecappt, `prefers-reduced-motion`-aware.
 */
export function WaveDots({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // ── Gitter-Parameter ──────────────────────────────────────────────────
    // Strähnen laufen entlang X (viele feine Dots), gestapelt entlang Z (eng).
    const SEP_X = 13; // Dot-Abstand entlang einer Strähne (fein)
    const SEP_Z = 30; // Abstand benachbarter Strähnen (eng gestapelt)
    const AMOUNTX = 170; // Dots pro Strähne
    const AMOUNTY = 150; // Anzahl Strähnen
    const COUNT_STEP = 0.009; // Animations-Geschwindigkeit (ruhig, nicht hektisch)

    // Brand-Grün #01C457 als Basis + helleres Mint für die Kämme.
    const baseCol = new THREE.Color(0x01c457);
    const crestCol = new THREE.Color(0x8df5bd);

    // Runde, weiche Dot-Textur (sonst rendert PointsMaterial harte Quadrate).
    const dotTexture = (() => {
      const s = 64;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.45, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      const tex = new THREE.CanvasTexture(c);
      return tex;
    })();

    // ── Szene / Kamera / Renderer ─────────────────────────────────────────
    const scene = new THREE.Scene();
    // Weißer Fog → ferne Dots bleichen sanft in die weiße Seite aus.
    scene.fog = new THREE.Fog(0xffffff, 900, 3200);

    let w = Math.max(1, container.clientWidth);
    let h = Math.max(1, container.clientHeight);

    // Orthografisch → kein Tiefen-Dichtegradient. Dichte/helle Bänder entstehen
    // dort, wo die wogende Fläche sich edge-on faltet (Dots projizieren eng).
    const FRUSTUM = 1150;
    const camera = new THREE.OrthographicCamera(
      (-FRUSTUM * (w / h)) / 2,
      (FRUSTUM * (w / h)) / 2,
      FRUSTUM / 2,
      -FRUSTUM / 2,
      -5000,
      10000
    );
    // Sehr flacher Blickwinkel → Strähnen werden zu glatten Sinus-Kurven, die
    // sich kreuzen und an den Falten zu hellen Bändern bündeln (Seiden-Look).
    camera.position.set(0, 250, 1150);
    camera.lookAt(0, 0, -350);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0xffffff, 0); // transparent
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    // ── Geometrie: Punkte-Gitter ──────────────────────────────────────────
    const count = AMOUNTX * AMOUNTY;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Basis-Positionen (Weltkoordinaten) vorab speichern; die Welle moduliert
    // pro Frame nur Y. Glattes Raster (kein Jitter) → klare Strähnen.
    const baseX = new Float32Array(count);
    const baseZ = new Float32Array(count);
    let i = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        // Brick-Offset pro Strähne + Mini-Jitter → bricht vertikales Moiré.
        const stagger = (iy % 2) * SEP_X * 0.5 + (Math.random() - 0.5) * SEP_X;
        const x = ix * SEP_X - (AMOUNTX * SEP_X) / 2 + stagger;
        const z = iy * SEP_Z - (AMOUNTY * SEP_Z) / 2;
        baseX[i] = x;
        baseZ[i] = z;
        positions[i * 3] = x;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = z;
        baseCol.toArray(colors, i * 3);
        i++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.8,
      map: dotTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: false, // alle Dots gleich fein → gleichmäßig dichtes Feld
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();

    let countAnim = 0;
    let raf = 0;

    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    const AMP_TOTAL = 340; // Summe der Amplituden (für Farb-Normalisierung)

    function frame() {
      const t = countAnim;
      for (let idx = 0; idx < count; idx++) {
        const x = baseX[idx];
        const z = baseZ[idx];
        // Niederfrequentes Phase-Warping (Sinus im Sinus, GROSSE Wellenlänge)
        // verbiegt die Haupt-Ribbons, sodass sie ungleichmäßig wandern,
        // anschwellen und chaotischer kreuzen — verspielt, aber weiterhin
        // glatte Strähnen (KEINE hohen Frequenzen → kein Korn/Rauschen).
        // Zeit-Faktoren = Tempo (bewusst unverändert).
        const warp = Math.sin(x * 0.0015 + z * 0.0009 + t * 0.2) * 1.8;
        const y =
          Math.sin(x * 0.0040 + z * 0.0012 + t + warp * 0.7) * 140 +
          Math.sin(z * 0.0050 - x * 0.0015 - t * 0.7 + warp * 0.5) * 105 +
          Math.sin((x + z) * 0.0021 + t * 0.45) * 60 +
          Math.sin(x * 0.0062 - z * 0.0036 + t * 0.85) * 35;
        pos[idx * 3 + 1] = y;

        // Kamm (y hoch) → heller/mintiger; Tal → Brand-Grün.
        const tcol = (y + AMP_TOTAL) / (2 * AMP_TOTAL); // ~0..1
        tmp.copy(baseCol).lerp(crestCol, tcol < 0 ? 0 : tcol > 1 ? 1 : tcol);
        col[idx * 3] = tmp.r;
        col[idx * 3 + 1] = tmp.g;
        col[idx * 3 + 2] = tmp.b;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      renderer.render(scene, camera);
      countAnim += COUNT_STEP;
    }

    function loop() {
      frame();
      raf = requestAnimationFrame(loop);
    }

    function resize() {
      const el = containerRef.current;
      if (!el) return;
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      camera.left = (-FRUSTUM * (w / h)) / 2;
      camera.right = (FRUSTUM * (w / h)) / 2;
      camera.top = FRUSTUM / 2;
      camera.bottom = -FRUSTUM / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (reduce) frame();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    if (reduce) frame();
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      dotTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`absolute inset-0 h-full w-full ${className}`}
      style={{
        // Oben weich ausblenden, damit Überschrift/Text lesbar bleiben.
        maskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, #000 42%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, #000 42%)"
      }}
    />
  );
}
