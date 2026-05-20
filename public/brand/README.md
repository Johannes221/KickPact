# KickPact Brand Assets

## Logo-Varianten

| Datei | Beschreibung | Farbe |
|---|---|---|
| `mark.svg` | K-Mark allein, `currentColor` für Component-Use | dynamic |
| `mark-green.svg` | K-Mark allein | `#01C457` Primary Green |
| `mark-black.svg` | K-Mark allein | `#1A1A2E` Night Navy |
| `mark-white.svg` | K-Mark allein | `#FFFFFF` weiß |
| `wordmark.svg` | "KICKPACT" Schriftzug allein | `#000000` (anpassbar) |
| `logo-green.svg` | K-Mark + KICKPACT | Grün |
| `logo-black.svg` | K-Mark + KICKPACT | Navy/Schwarz |
| `logo-white.svg` | K-Mark + KICKPACT | Weiß (für dunkle Hintergründe) |

## Verwendung

### In Code (React Component)

```tsx
import { Logo } from "@/components/shared/logo";

<Logo variant="full" />              // K + "KICK PACT" Split-Color
<Logo variant="tagline" />           // Plus "Mehr als ein Spiel"
<Logo variant="mark" href={null} />  // Nur Icon, nicht klickbar
```

### Direkt als Asset

```tsx
import Image from "next/image";

<Image src="/brand/logo-green.svg" alt="KickPact" width={120} height={180} />
```

### Off-Plattform (Social Media, Print, Email-Signaturen)

Die SVGs sind verlustfrei skalierbar. Für Pixelgrafik exportieren:

```bash
# Mit ImageMagick
magick convert -background none -resize 1024x public/brand/logo-green.svg logo-green-1024.png

# Light/Dark Variante je nach Hintergrund verwenden
# - Heller Hintergrund: logo-green oder logo-black
# - Dunkler Hintergrund: logo-white oder logo-green
```

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
