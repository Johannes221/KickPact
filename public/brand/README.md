# KickPact Brand Assets

## Wichtig: Source of Truth

Das volle Logo („KICKPACT"-Schriftzug) existiert als **Pixel-Grafik** (`wordmark.png`, 2-farbig navy/grün). Die zugehörigen einfarbigen SVGs wurden via `potrace` aus dieser PNG **nachgezeichnet** — sie sind einfarbig und können leichte Abweichungen zur Original-Typo haben. Eine saubere, vektorisierte 2-Farben-Wortmarke existiert nicht (es gibt keine Font-/Designdatei dafür). Daher:

- **Brand 2-farbig** (navy „KICK" + grün „PACT") → nur als **PNG** verfügbar.
- **Einfarbig** (grün / navy / weiß) → als PNG **und** vektorisiertes SVG.

## Marke (K-Icon)

| Datei | Farbe |
|---|---|
| `mark.svg` | `currentColor` (für Component-Use) |
| `mark-green.svg/.png` | `#01C457` Primary Green |
| `mark-black.svg/.png` | `#1A1A2E` Night Navy |
| `mark-white.svg/.png` | `#FFFFFF` weiß |
| `mark-green-on-white.png` | grün auf **deckend weißem** Quadrat (Instagram-Profilbild) |

## Volles Logo (Marke + KICKPACT)

`logo-{farbe}-{layout}` — `layout` = `horizontal` (Marke links, Schrift rechts) oder `stacked` (Marke oben, Schrift drunter).

| Farbe | Dateien | Verwendung |
|---|---|---|
| **Standard (2-farbig)** | `logo-horizontal.png`, `logo-stacked.png` | ⭐ **PRIMÄRLOGO** — grüne Marke + KICK schwarz/navy + PACT grün. Default für alles auf hellen Hintergründen. (nur PNG) |
| `green` | `logo-green-{horizontal,stacked}.{png,svg}` | komplett grün |
| `navy` | `logo-navy-{horizontal,stacked}.{png,svg}` | komplett `#1A1A2E`, helle Hintergründe / Druck |
| `white` | `logo-white-{horizontal,stacked}.{png,svg}` | komplett weiß, dunkle Hintergründe / Fotos |

**Default-Regel:** Wenn nichts dagegen spricht, immer das Primärlogo (`logo-horizontal.png` / `logo-stacked.png`) verwenden. Die einfarbigen Varianten nur, wenn der Hintergrund oder das Medium (Druck, dunkle Fläche) es erfordert.

## Wortmarke allein

| Datei | Farbe |
|---|---|
| `wordmark.png` | **Brand 2-farbig** (navy/grün) |
| `wordmark-green.{png,svg}` | grün |
| `wordmark-navy.{png,svg}` | `#1A1A2E` |
| `wordmark-white.{png,svg}` | weiß |

## Verwendung

### In Code (React Component)

```tsx
import { Logo } from "@/components/shared/logo";

<Logo variant="full" />              // K + "KICKPACT" (Mark-SVG + wordmark.png)
<Logo variant="tagline" />           // Plus "Mehr als ein Spiel"
<Logo variant="mark" href={null} />  // Nur Icon, nicht klickbar
```

Die Component setzt das volle Logo aus `MarkSvg` + `wordmark.png` zusammen (siehe `components/shared/logo.tsx`).

### Direkt als Asset

```tsx
import Image from "next/image";

// Primärlogo, horizontal
<Image src="/brand/logo-horizontal.png" alt="KickPact" width={912} height={120} />
```

### Off-Plattform (Social Media, Print, Email)

- **Heller Hintergrund:** `logo-horizontal/stacked` (Primär, 2-farbig) oder `logo-navy-*`
- **Dunkler Hintergrund:** `logo-white-*`
- **Instagram-Profilbild:** `mark-green-on-white.png` (deckend weiß, sonst füllt IG die Transparenz schwarz)

Einfarbige SVGs sind verlustfrei skalierbar. Brand-2-farbig nur als PNG (hochauflösend, transparent).

## Farbpalette

```
Primary Green:   #01C457
Dark Green:      #00563A
Night Navy:      #1A1A2E
Alert Red:       #FF3127
Off-White:       #F5F8F5
Neutral Grey:    #CDD2D1
```

## Typografie

- **Display (Headlines):** Inter Black (weight 900), letter-spacing tight
- **Body:** Inter Regular/Medium/Semibold (weights 400/500/600)
- **Tagline / Caps:** Inter Semibold, uppercase, letter-spacing wide

Inter wird über `next/font/google` geladen und ist daher offline-fähig + selbst-gehostet auf dem Webserver.
