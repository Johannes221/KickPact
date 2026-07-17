"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Share2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { WrappedStats } from "@/lib/db/queries/wrapped";
import { eurWhole } from "@/lib/recap/recap-format";
import { useAmbientAudio } from "./use-ambient-audio";
import { shareImageFile } from "@/lib/platform/files";
import {
  canShareToInstagramStory,
  shareImageToInstagramStory
} from "@/lib/platform/instagram";

/**
 * Saison-Wrapped Story-Player (W4, Plan 2026-06-12).
 *
 * Vollbild-Story im Spotify-Wrapped-Stil: Progress-Bars oben (eine pro Slide,
 * Auto-Advance ~6s), Tap rechts/links = vor/zurück, Press&Hold = Pause,
 * Schließen-X → Dashboard. CSS-Keyframes + requestAnimationFrame-Count-Up —
 * bewusst KEINE neue Dependency. Mobile = echtes Vollbild, Desktop = zentrierter
 * 9:16-Phone-Rahmen.
 */

const SLIDE_MS = 6000;
const HOLD_MS = 200;

/**
 * Share-Fehler sichtbar machen (UI-Standard: kein stilles Scheitern) —
 * außer der Nutzer hat das Share-Sheet selbst zugemacht (Capacitor rejected
 * dann mit „Share canceled", das ist kein Fehler).
 */
function notifyShareError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/cancel/i.test(msg)) return;
  toast.error("Teilen hat nicht geklappt — bitte nochmal versuchen.");
}

/** Akzentfarben pro Slide — Brand-Energie: Orange / Rot / Lime im Wechsel. */
const ACCENTS = ["#FF6A30", "#FF3127", "#A3E635"] as const;

interface WrappedPlayerProps {
  stats: WrappedStats;
  /** Lesbares Saison-Label des Wrapped, z.B. "25/26". */
  saisonLabel: string;
  /** Label der NEUEN Saison für den Outro-CTA, z.B. "26/27". */
  nextSaisonLabel: string;
  dashboardHref: string;
  sponsorenHref: string;
  /** Basis-URL der Share-Bilder: /api/teams/<id>/wrapped-image */
  imageBase: string;
}

interface Slide {
  key: string;
  /** Slide-Key der og-Share-Route — undefined = kein Share-Button. */
  imageKey?: string;
}

function buildSlides(stats: WrappedStats): Slide[] {
  const slides: Slide[] = [
    { key: "intro", imageKey: "intro" },
    { key: "bilanz", imageKey: "bilanz" }
  ];
  if (stats.tabellenplatz !== null) slides.push({ key: "tabellenplatz", imageKey: "tabellenplatz" });
  slides.push({ key: "tore", imageKey: "tore" });
  if (stats.besterTorschuetze) slides.push({ key: "torschuetze", imageKey: "torschuetze" });
  if (stats.ligaTorschuetze) slides.push({ key: "ligatorschuetze", imageKey: "ligatorschuetze" });
  if (stats.zuNull > 0) slides.push({ key: "zunull", imageKey: "zunull" });
  if (stats.comebacks > 0) slides.push({ key: "comebacks", imageKey: "comebacks" });
  if (stats.heimsiege + stats.auswaertssiege > 0) {
    slides.push({ key: "heimauswaerts", imageKey: "heimauswaerts" });
  }
  if (stats.hoechsterSieg) slides.push({ key: "hoechstersieg", imageKey: "hoechstersieg" });
  if (stats.vsTop3 && stats.vsTop3.spiele > 0) slides.push({ key: "vstop3", imageKey: "vstop3" });
  if (stats.fairness) slides.push({ key: "fairness", imageKey: "fairness" });
  if (stats.beitraegeSummeCents > 0) {
    slides.push({ key: "beitraege", imageKey: "beitraege" });
  } else if (stats.pactsCount === 0 && (stats.simulationFallbackCents ?? 0) > 0) {
    slides.push({ key: "simulation", imageKey: "simulation" });
  }
  // Finale Zusammenfassung — die ganze Saison auf einem Screen (der „Screenshot-
  // &-teilen"-Moment). Immer da, direkt vor dem Outro.
  slides.push({ key: "zusammenfassung", imageKey: "zusammenfassung" });
  slides.push({ key: "outro" });
  return slides;
}

/** rAF-Count-Up mit Ease-Out — läuft nur solange `active`. */
function useCountUp(target: number, active: boolean, duration = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return value;
}

export function WrappedPlayer({
  stats,
  saisonLabel,
  nextSaisonLabel,
  dashboardHref,
  sponsorenHref,
  imageBase
}: WrappedPlayerProps) {
  const router = useRouter();
  const ambient = useAmbientAudio();
  const slides = useMemo(() => buildSlides(stats), [stats]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const elapsedRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHoldRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const isLast = index === slides.length - 1;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      elapsedRef.current = 0;
      setProgress(0);
      setIndex(clamped);
    },
    [slides.length]
  );

  // Auto-Advance: rAF-Loop füllt die Progress-Bar, am Ende eine weiter.
  useEffect(() => {
    if (paused || isLast) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      const p = Math.min(1, elapsedRef.current / SLIDE_MS);
      setProgress(p);
      if (p >= 1) {
        goTo(index + 1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, isLast, goTo]);

  // Outro: Bar voll, kein Auto-Advance mehr.
  useEffect(() => {
    if (isLast) setProgress(1);
  }, [isLast]);

  // Story-Mechanik: kurzer Tap = Navigation, Press&Hold = Pause.
  const onPointerDown = useCallback(() => {
    wasHoldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      wasHoldRef.current = true;
      setPaused(true);
    }, HOLD_MS);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (wasHoldRef.current) {
        wasHoldRef.current = false;
        setPaused(false);
        return;
      }
      const rect = frameRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : e.clientX;
      const width = rect?.width ?? window.innerWidth;
      if (x < width / 3) goTo(index - 1);
      else goTo(index + 1);
    },
    [goTo, index]
  );

  const onPointerCancel = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (wasHoldRef.current) {
      wasHoldRef.current = false;
      setPaused(false);
    }
  }, []);

  /**
   * DER Share-Weg des Wrapped — jeder Teilen-Button hier läuft hierüber.
   *
   * Wrapped-Motive werden praktisch nur auf Instagram geteilt, darum zuerst der
   * Direktweg in den Story-Editor (iOS-App + Instagram installiert + Meta-App-ID).
   * Instagrams eigene Share-Extension rendert das PNG aus dem generischen Sheet
   * kaputt (leere Fläche, überlappende Buttons) — die wollen wir nie sehen.
   * Verfügbarkeit erst beim Tap prüfen: immer frisch, kein State nötig.
   *
   * Fällt auf das generische Share-Sheet zurück (Web, kein Instagram, alte
   * App-Version ohne Plugin) — dort bleibt WhatsApp/Sichern erreichbar.
   */
  const share = useCallback(
    async (imageKey: string) => {
      const url = `${imageBase}/${imageKey}`;
      try {
        if (await canShareToInstagramStory()) {
          try {
            await shareImageToInstagramStory(url);
            return;
          } catch {
            // z.B. Instagram zwischenzeitlich deinstalliert → Fallback unten.
          }
        }
        await shareImageFile(url, `kickpact-wrapped-${imageKey}.png`);
      } catch (err) {
        notifyShareError(err);
      }
    },
    [imageBase]
  );

  const slide = slides[index];
  const accent = ACCENTS[index % ACCENTS.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F0F1E]">
      <style>{`
        @keyframes wrapped-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wrapped-pop { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes wrapped-float { 0%, 100% { transform: translateY(0) rotate(var(--wr, 0deg)); } 50% { transform: translateY(-14px) rotate(var(--wr, 0deg)); } }
        .wr-rise { animation: wrapped-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .wr-pop { animation: wrapped-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .wr-float { animation: wrapped-float 3.2s ease-in-out infinite; }
      `}</style>

      {/* 9:16-Inhalt: mobil Vollbild, Desktop Phone-Rahmen */}
      <div
        ref={frameRef}
        className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#16162B] via-[#0F0F1E] to-[#0F0F1E] sm:h-[min(92vh,860px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[430px] sm:rounded-[2rem] sm:border sm:border-white/10 sm:shadow-2xl"
      >
        {/* Akzent-Glow oben */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full opacity-25 blur-3xl transition-colors duration-700"
          style={{ background: accent }}
        />

        {/* Progress-Bars — pt inkl. Safe-Area: in der iOS-App (viewport-fit=cover)
            lagen die Balken sonst ÜBER der Statusleiste/Uhrzeit. Nur im mobilen
            Vollbild — ab sm: sitzt der Phone-Frame zentriert, dort gelten die
            Geräte-Insets nicht (z.B. iPad-App). */}
        <div className="relative z-20 flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-3">
          {slides.map((s, i) => (
            <div key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: `${i < index ? 100 : i === index ? progress * 100 : 0}%`
                }}
              />
            </div>
          ))}
        </div>

        {/* Kopfzeile: Saison-Badge + Schließen */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/80">
            Wrapped {saisonLabel}
          </span>
          <div className="flex items-center gap-2">
            {ambient.supported && (
              <button
                type="button"
                aria-label={ambient.on ? "Musik aus" : "Musik an"}
                aria-pressed={ambient.on}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={ambient.toggle}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20"
              >
                {ambient.on ? (
                  <Volume2 className="h-5 w-5" aria-hidden />
                ) : (
                  <VolumeX className="h-5 w-5" aria-hidden />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label="Schließen"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => router.push(dashboardHref)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Tap-/Hold-Fläche + Slide-Inhalt */}
        <div
          className="relative z-10 flex flex-1 select-none flex-col justify-center px-7 pb-16 touch-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <SlideContent
            key={slide.key}
            slideKey={slide.key}
            stats={stats}
            accent={accent}
            saisonLabel={saisonLabel}
            nextSaisonLabel={nextSaisonLabel}
            sponsorenHref={sponsorenHref}
            onShare={share}
          />
        </div>

        {/* Share-Button (pro Slide mit og-Bild) — bottom inkl. Safe-Area (Home-Indicator) */}
        {slide.imageKey && (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-20 sm:bottom-4">
            <button
              type="button"
              aria-label="Slide teilen"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => void share(slide.imageKey!)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20"
            >
              <Share2 className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        {/* Footer: grünes KickPact-Logo */}
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-0 right-0 z-10 flex justify-center opacity-70 sm:bottom-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-green-horizontal.png" alt="KickPact" className="h-4 w-auto" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function SlideContent({
  slideKey,
  stats,
  accent,
  saisonLabel,
  nextSaisonLabel,
  sponsorenHref,
  onShare
}: {
  slideKey: string;
  stats: WrappedStats;
  accent: string;
  saisonLabel: string;
  nextSaisonLabel: string;
  sponsorenHref: string;
  /** Teilt das Slide-Motiv — Instagram-Story direkt, sonst Share-Sheet. */
  onShare: (imageKey: string) => void;
}) {
  switch (slideKey) {
    case "intro":
      return <IntroSlide stats={stats} accent={accent} saisonLabel={saisonLabel} />;
    case "bilanz":
      return <BilanzSlide stats={stats} accent={accent} />;
    case "tabellenplatz":
      return <TabellenplatzSlide stats={stats} accent={accent} />;
    case "vstop3":
      return <VsTop3Slide stats={stats} accent={accent} />;
    case "tore":
      return <ToreSlide stats={stats} accent={accent} />;
    case "torschuetze":
      return <TorschuetzeSlide stats={stats} accent={accent} />;
    case "ligatorschuetze":
      return <LigaTorschuetzeSlide stats={stats} accent={accent} />;
    case "fairness":
      return <FairnessSlide stats={stats} accent={accent} />;
    case "zunull":
      return <ZuNullSlide stats={stats} accent={accent} />;
    case "comebacks":
      return <ComebacksSlide stats={stats} accent={accent} />;
    case "heimauswaerts":
      return <HeimAuswaertsSlide stats={stats} accent={accent} />;
    case "hoechstersieg":
      return <HoechsterSiegSlide stats={stats} accent={accent} />;
    case "beitraege":
      return <BeitraegeSlide stats={stats} accent={accent} />;
    case "simulation":
      return <SimulationSlide stats={stats} accent={accent} />;
    case "zusammenfassung":
      return <ZusammenfassungSlide stats={stats} accent={accent} onShare={onShare} />;
    case "outro":
      return (
        <OutroSlide
          accent={accent}
          nextSaisonLabel={nextSaisonLabel}
          sponsorenHref={sponsorenHref}
          onShare={onShare}
        />
      );
    default:
      return null;
  }
}

function Kicker({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div
      className="wr-rise mb-3 text-xs font-bold uppercase tracking-[0.22em]"
      style={{ color: accent }}
    >
      {children}
    </div>
  );
}

function BigNumber({
  value,
  accent,
  suffix
}: {
  value: number | string;
  accent: string;
  suffix?: string;
}) {
  return (
    <div
      className="wr-pop font-display text-[5.5rem] font-black leading-none tracking-tight sm:text-[6.5rem]"
      style={{ color: accent, animationDelay: "0.15s" }}
    >
      {value}
      {suffix && <span className="text-[0.4em] font-bold text-white/70"> {suffix}</span>}
    </div>
  );
}

function Body({ children, delay = 0.35 }: { children: React.ReactNode; delay?: number }) {
  return (
    <p
      className="wr-rise mt-4 max-w-[18rem] text-lg font-semibold leading-snug text-white/85"
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </p>
  );
}

function IntroSlide({
  stats,
  accent,
  saisonLabel
}: {
  stats: WrappedStats;
  accent: string;
  saisonLabel: string;
}) {
  // Confetti-artige Akzente — pure CSS, kein Canvas.
  const confetti: Array<{
    top: string;
    left?: string;
    right?: string;
    color: string;
    delay: string;
    rotate: string;
  }> = [
    { top: "12%", left: "12%", color: "#FF6A30", delay: "0s", rotate: "12deg" },
    { top: "20%", right: "16%", color: "#A3E635", delay: "0.4s", rotate: "-18deg" },
    { top: "62%", left: "8%", color: "#FF3127", delay: "0.8s", rotate: "24deg" },
    { top: "72%", right: "12%", color: "#FF6A30", delay: "1.2s", rotate: "-8deg" },
    { top: "40%", right: "6%", color: "#A3E635", delay: "1.6s", rotate: "30deg" }
  ];
  return (
    <div className="relative">
      {confetti.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className="wr-float absolute h-3 w-3 rounded-sm"
          style={
            {
              top: c.top,
              left: c.left,
              right: c.right,
              background: c.color,
              animationDelay: c.delay,
              "--wr": c.rotate
            } as React.CSSProperties
          }
        />
      ))}
      <Kicker accent={accent}>Euer Saison-Rückblick</Kicker>
      <h1 className="wr-pop font-display text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
        EURE
        <br />
        SAISON
        <br />
        <span style={{ color: accent }}>{saisonLabel}</span>
      </h1>
      <Body>
        {stats.teamName} — lehnt euch zurück, das hier ist eure Highlight-Rolle. 🎬
      </Body>
    </div>
  );
}

function BilanzSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const items = [
    { label: "Siege", value: stats.siege },
    { label: "Unentschieden", value: stats.unentschieden },
    { label: "Niederlagen", value: stats.niederlagen }
  ];
  return (
    <div>
      <Kicker accent={accent}>{stats.spiele} Spiele auf dem Platz</Kicker>
      <h2 className="wr-rise font-display text-4xl font-black tracking-tight text-white">
        Eure Bilanz
      </h2>
      <div className="mt-8 flex items-end gap-6">
        {items.map((it, i) => (
          <div key={it.label} className="wr-pop" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
            <div
              className="font-display text-6xl font-black leading-none tracking-tight"
              style={{ color: i === 0 ? accent : "#fff" }}
            >
              {it.value}
            </div>
            <div className="mt-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/60">
              {it.label}
            </div>
          </div>
        ))}
      </div>
      <Body delay={0.7}>
        {stats.siege > stats.niederlagen
          ? "Mehr gewonnen als verloren — so geht das. 💪"
          : "Nächste Saison schlägt das Pendel zurück. Versprochen."}
      </Body>
    </div>
  );
}

function ToreSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const value = useCountUp(stats.toreGeschossen, true);
  return (
    <div>
      <Kicker accent={accent}>Vorne hat&apos;s gescheppert</Kicker>
      <h2 className="wr-rise font-display text-3xl font-black tracking-tight text-white">
        Ihr habt
      </h2>
      <BigNumber value={value} accent={accent} />
      <h2
        className="wr-rise font-display text-3xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        Tore geballert ⚽
      </h2>
      <Body delay={0.6}>
        …und {stats.toreKassiert} kassiert. Drüber reden wir nicht weiter.
      </Body>
    </div>
  );
}

function TorschuetzeSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const ts = stats.besterTorschuetze!;
  const value = useCountUp(ts.tore, true, 1200);
  return (
    <div>
      <Kicker accent={accent}>Euer Knipser</Kicker>
      <h2 className="wr-pop font-display text-5xl font-black leading-tight tracking-tight text-white">
        {ts.name}
      </h2>
      <BigNumber value={value} accent={accent} suffix={ts.tore === 1 ? "Tor" : "Tore"} />
      <Body delay={0.5}>Vor dem Kasten eiskalt. Bitte nie den Verein wechseln. 🙏</Body>
    </div>
  );
}

function ZuNullSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  return (
    <div>
      <Kicker accent={accent}>Hinten dicht</Kicker>
      <BigNumber value={`${stats.zuNull}×`} accent={accent} />
      <h2
        className="wr-rise font-display text-3xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        zu Null gewonnen
      </h2>
      <Body delay={0.55}>Die Abwehr war eine Wand. 🧱 Keeper, das Bier geht auf euch.</Body>
    </div>
  );
}

function ComebacksSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  return (
    <div>
      <Kicker accent={accent}>Niemals aufgeben</Kicker>
      <BigNumber value={stats.comebacks} accent={accent} />
      <h2
        className="wr-rise font-display text-3xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        Comeback-Sieg{stats.comebacks === 1 ? "" : "e"}
      </h2>
      <Body delay={0.55}>
        Hinten gelegen, Spiel gedreht, gewonnen. Diese Mentalität kauft man nicht. 🔥
      </Body>
    </div>
  );
}

function HeimAuswaertsSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const auswaertsStark = stats.auswaertssiege >= stats.heimsiege;
  return (
    <div>
      <Kicker accent={accent}>Heim &amp; Auswärts</Kicker>
      <div className="mt-2 flex items-end gap-8">
        {[
          { label: "Heimsiege", value: stats.heimsiege, hot: !auswaertsStark },
          { label: "Auswärtssiege", value: stats.auswaertssiege, hot: auswaertsStark }
        ].map((it, i) => (
          <div key={it.label} className="wr-pop" style={{ animationDelay: `${0.15 + i * 0.2}s` }}>
            <div
              className="font-display text-7xl font-black leading-none tracking-tight"
              style={{ color: it.hot ? accent : "#fff" }}
            >
              {it.value}
            </div>
            <div className="mt-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/60">
              {it.label}
            </div>
          </div>
        ))}
      </div>
      <Body delay={0.6}>
        {auswaertsStark && stats.auswaertssiege > 0
          ? `Auswärts seid ihr eine Macht: ${stats.auswaertssiege} Auswärtssieg${stats.auswaertssiege === 1 ? "" : "e"}. 🚌💨`
          : `Zuhause ist eure Festung: ${stats.heimsiege} Heimsieg${stats.heimsiege === 1 ? "" : "e"}. 🏰`}
      </Body>
    </div>
  );
}

function TabellenplatzSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  return (
    <div>
      <Kicker accent={accent}>In der Tabelle</Kicker>
      <BigNumber value={`Platz ${stats.tabellenplatz}`} accent={accent} />
      <h2
        className="wr-rise font-display text-2xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        von {stats.teamsInLeague} Teams · {stats.punkte} Punkte
      </h2>
      <Body delay={0.55}>Volle Saison, schwarz auf weiß in der Liga-Tabelle. 📊</Body>
    </div>
  );
}
function LigaTorschuetzeSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const lt = stats.ligaTorschuetze!;
  const isNr1 = lt.ligaPlatz === 1;
  return (
    <div>
      <Kicker accent={accent}>In der ganzen Liga</Kicker>
      <h2 className="wr-pop font-display text-4xl font-black leading-tight tracking-tight text-white">
        {lt.name}
      </h2>
      <BigNumber value={`Nr. ${lt.ligaPlatz}`} accent={accent} />
      <h2
        className="wr-rise font-display text-2xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        der Liga-Torschützen · {lt.tore} Tore
      </h2>
      <Body delay={0.55}>
        {isNr1
          ? "Toptorschütze der ganzen Liga. Mehr geht nicht. 👑⚽"
          : "Vorne mit dabei in der ganzen Staffel. Respekt. 🎯"}
      </Body>
    </div>
  );
}

function FairnessSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const f = stats.fairness!;
  const sauber = f.platz <= Math.ceil(f.teamsInLeague / 3);
  return (
    <div>
      <Kicker accent={accent}>Fairnesstabelle</Kicker>
      <BigNumber value={`Platz ${f.platz}`} accent={accent} />
      <h2
        className="wr-rise font-display text-2xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        von {f.teamsInLeague} · {f.gelb} Gelbe{f.rot > 0 ? `, ${f.rot} Rote` : ""}
      </h2>
      <Body delay={0.55}>
        {sauber
          ? "Fair geblieben, die ganze Saison. Sauber gespielt. 🤝"
          : "Vollgas mit Herzblut. Der Schiri kennt euch. 😅"}{" "}
        <span className="text-white/55">({f.quote.toLocaleString("de-DE")} Karten/Spiel)</span>
      </Body>
    </div>
  );
}

function VsTop3Slide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const v = stats.vsTop3!;
  return (
    <div>
      <Kicker accent={accent}>Gegen die Top 3</Kicker>
      <BigNumber value={`${v.siege}/${v.unentschieden}/${v.niederlagen}`} accent={accent} />
      <h2
        className="wr-rise font-display text-2xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        S/U/N gegen die Spitze
      </h2>
      <Body delay={0.55}>
        {v.siege > v.niederlagen
          ? "Gegen die Großen geliefert. 🔥"
          : v.siege === 0 && v.niederlagen > 0
            ? "Gegen die Spitze noch ausbaufähig — nächste Saison. 😤"
            : "Auf Augenhöhe mit den Besten."}{" "}
        <span className="text-white/55">(aus {v.spiele} ausgewerteten Spielen)</span>
      </Body>
    </div>
  );
}
function HoechsterSiegSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const hs = stats.hoechsterSieg!;
  return (
    <div>
      <Kicker accent={accent}>Euer höchster Sieg</Kicker>
      <BigNumber value={hs.ergebnis} accent={accent} />
      <p
        className="wr-rise mt-5 text-lg font-bold leading-snug text-white"
        style={{ animationDelay: "0.35s" }}
      >
        {hs.heimName}
        <span className="px-2 text-white/40">vs</span>
        {hs.gastName}
      </p>
      <Body delay={0.6}>An diesem Tag hat einfach alles gepasst. 🎯</Body>
    </div>
  );
}

function BeitraegeSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const value = useCountUp(Math.round(stats.beitraegeSummeCents / 100), true, 1800);
  return (
    <div>
      <Kicker accent={accent}>Eure Sponsoren</Kicker>
      <h2 className="wr-rise font-display text-3xl font-black tracking-tight text-white">
        Eure Sponsoren haben
      </h2>
      <BigNumber value={`${value.toLocaleString("de-DE")} €`} accent={accent} />
      <h2
        className="wr-rise font-display text-3xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        beigesteuert 🧡
      </h2>
      <Body delay={0.6}>
        Über {stats.pactsCount} Pact{stats.pactsCount === 1 ? "" : "s"} — jedes Tor, jeder Sieg hat
        die Mannschaftskasse gefüllt.
      </Body>
    </div>
  );
}

function SimulationSlide({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const value = useCountUp(Math.round((stats.simulationFallbackCents ?? 0) / 100), true, 1800);
  return (
    <div>
      <Kicker accent={accent}>Mal kurz träumen</Kicker>
      <h2 className="wr-rise font-display text-3xl font-black tracking-tight text-white">
        Mit einem 1-€-pro-Tor-Pact wären das
      </h2>
      <BigNumber value={`${value.toLocaleString("de-DE")} €`} accent={accent} />
      <h2
        className="wr-rise font-display text-3xl font-black tracking-tight text-white"
        style={{ animationDelay: "0.25s" }}
      >
        gewesen 👀
      </h2>
      <Body delay={0.6}>Eure Tore können die Mannschaftskasse füllen. Nur so als Idee.</Body>
    </div>
  );
}

function ZusammenfassungSlide({
  stats,
  accent,
  onShare
}: {
  stats: WrappedStats;
  accent: string;
  onShare: (imageKey: string) => void;
}) {
  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Bilanz",
      value: `${stats.siege}·${stats.unentschieden}·${stats.niederlagen}`,
      sub: "S · U · N"
    },
    {
      label: "Tore",
      value: `${stats.toreGeschossen}:${stats.toreKassiert}`,
      sub: "geschossen : kassiert"
    }
  ];
  if (stats.tabellenplatz !== null) {
    tiles.push({
      label: "Tabelle",
      value: `Platz ${stats.tabellenplatz}`,
      sub: stats.teamsInLeague ? `von ${stats.teamsInLeague}` : undefined
    });
  }
  if (stats.besterTorschuetze) {
    const parts = stats.besterTorschuetze.name.trim().split(" ");
    tiles.push({
      label: "Knipser",
      value: parts[parts.length - 1] || stats.besterTorschuetze.name,
      sub: `${stats.besterTorschuetze.tore} Tore`
    });
  }
  const moneyCents =
    stats.beitraegeSummeCents > 0
      ? stats.beitraegeSummeCents
      : stats.simulationFallbackCents ?? 0;

  return (
    <div>
      <Kicker accent={accent}>Die ganze Saison</Kicker>
      <h2 className="wr-rise font-display text-4xl font-black leading-tight tracking-tight text-white">
        Auf einen Blick
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="wr-pop rounded-2xl border border-white/10 bg-white/5 p-4"
            style={{ animationDelay: `${0.15 + i * 0.1}s` }}
          >
            <div className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white/50">
              {t.label}
            </div>
            <div
              className="mt-1 font-display text-2xl font-black leading-tight tracking-tight"
              style={{ color: accent }}
            >
              {t.value}
            </div>
            {t.sub && <div className="mt-0.5 text-[0.7rem] text-white/45">{t.sub}</div>}
          </div>
        ))}
      </div>
      {moneyCents > 0 && (
        <div
          className="wr-rise mt-4 rounded-2xl bg-white/5 p-4 text-center"
          style={{ animationDelay: "0.5s" }}
        >
          <span className="font-display text-xl font-black text-white">
            {eurWhole(moneyCents)}
          </span>
          <span className="text-white/60">
            {stats.beitraegeSummeCents > 0
              ? " in die Mannschaftskasse 💰"
              : " wären drin gewesen 💰"}
          </span>
        </div>
      )}
      {/* Dezenter Insta-CTA — das Motiv teilt sich in einem Tap. */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => onShare("zusammenfassung")}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/15"
        >
          📲 Jetzt auf Insta teilen
        </button>
      </div>
    </div>
  );
}

function OutroSlide({
  accent,
  nextSaisonLabel,
  sponsorenHref,
  onShare
}: {
  accent: string;
  nextSaisonLabel: string;
  sponsorenHref: string;
  onShare: (imageKey: string) => void;
}) {
  return (
    <div>
      <Kicker accent={accent}>Das war&apos;s — fast</Kicker>
      <h2 className="wr-pop font-display text-4xl font-black leading-tight tracking-tight text-white">
        Auf geht&apos;s in die
        <br />
        Saison <span style={{ color: accent }}>{nextSaisonLabel}</span>
      </h2>
      <Body delay={0.4}>Neue Saison, neue Tore, volle Mannschaftskasse. Holt eure Fans an Bord.</Body>
      <div
        className="wr-rise mt-8 flex flex-col gap-3"
        style={{ animationDelay: "0.6s" }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <a
          href={sponsorenHref}
          className="rounded-full px-6 py-3.5 text-center text-sm font-bold text-[#0F0F1E] transition-opacity hover:opacity-90"
          style={{ background: accent }}
        >
          Sponsoren für {nextSaisonLabel} einladen
        </a>
        <button
          type="button"
          onClick={() => onShare("intro")}
          className="rounded-full border border-white/25 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/15"
        >
          Teilen
        </button>
      </div>
    </div>
  );
}
