"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dezenter, SYNTHETISIERTER Ambient-Klangteppich fürs Saison-Wrapped.
 *
 * Bewusst KEINE Audiodatei: kein Lizenz-/Copyright-Risiko, kein Asset im Repo,
 * und die Klangqualität ist deterministisch aus Code (statt einer Datei, die
 * niemand gegengehört hat). Web Audio API: ein weicher Dur-Pad aus leicht
 * verstimmten Sinus-Oszillatoren, langsame Filter-Bewegung (LFO) → „schwebt".
 * Sehr leise (Master-Gain 0.05).
 *
 * Startet STUMM und wird NUR per Nutzergeste (Lautsprecher-Toggle) gestartet —
 * das respektiert die Autoplay-Policy der Browser (AudioContext darf erst nach
 * einer Geste klingen) und überrascht niemanden mit plötzlichem Ton.
 *
 * Echte „Naturmusik" später nachrüsten: buildPad() durch das Laden einer
 * lizenzfreien Loop (AudioBufferSourceNode/<audio>) ersetzen — die Toggle- und
 * Fade-Logik hier bleibt unverändert.
 */
type AmbientAudio = {
  /** Spielt der Pad gerade? (steuert das Icon) */
  on: boolean;
  /** An/Aus mit sanftem Fade — muss aus einem User-Event aufgerufen werden. */
  toggle: () => void;
  /** false → Browser ohne Web Audio: Toggle gar nicht anzeigen. */
  supported: boolean;
};

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
}

export function useAmbientAudio(): AmbientAudio {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const onRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    setSupported(Boolean(getAudioContextCtor()));
    return () => {
      // Sauberes Teardown beim Verlassen des Wrapped: Oszillatoren stoppen,
      // Context schließen (sonst läuft der Ton im Hintergrund weiter).
      padRef.current?.stop();
      masterRef.current?.disconnect();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      masterRef.current = null;
      padRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    const next = !onRef.current;
    onRef.current = next;

    // Context + Klanggraph lazy beim ersten Einschalten aufbauen — passiert im
    // Geste-Callback, daher von der Autoplay-Policy erlaubt.
    if (!ctxRef.current) {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      padRef.current = buildPad(ctx, master);
    }

    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      if (next) {
        void ctx.resume();
        master.gain.linearRampToValueAtTime(0.05, t + 1.2); // sanfter Fade-in
      } else {
        master.gain.linearRampToValueAtTime(0.0001, t + 0.6); // Fade-out
      }
    }
    setOn(next);
  }, []);

  return { on, toggle, supported };
}

/** Baut den weichen Dur-Pad (A-Dur) und hängt ihn an `master`. */
function buildPad(ctx: AudioContext, master: GainNode): { stop: () => void } {
  // A-Dur über zwei Oktaven: A2 – C#3 – E3 – A3, minimal verstimmt = Breite.
  const freqs = [110, 138.59, 164.81, 220];

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  filter.Q.value = 0.6;
  filter.connect(master);

  // LFO moduliert den Cutoff langsam (~16 s Periode) → lebendiges Schweben.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const oscs: OscillatorNode[] = [];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === freqs.length - 1 ? "triangle" : "sine";
    osc.frequency.value = f;
    osc.detune.value = (i - 1.5) * 4;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.3; // Grundton trägt, Obertöne dezent
    osc.connect(g);
    g.connect(filter);
    osc.start();
    oscs.push(osc);
  });

  return {
    stop: () => {
      try {
        lfo.stop();
        for (const o of oscs) o.stop();
      } catch {
        // bereits gestoppt / Context geschlossen — egal.
      }
    }
  };
}
