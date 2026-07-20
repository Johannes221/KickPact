import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { BODY, DISPLAY } from "./theme";

/**
 * Lädt die Marken-Schriften in den Render-Chrome. `loadFont` blockt den Render
 * automatisch, bis die Schrift da ist — kein manuelles delayRender nötig.
 *
 * Dieselben TTFs wie Satori (public/fonts/…): Display = KickPact Display
 * (Orbitron-Basis, weight 900), Body = Inter (400/700). EINE Schrift-Quelle für
 * App, Website und beide Social-Renderer.
 */
loadFont({
  family: DISPLAY,
  url: staticFile("fonts/kickpact-display/KickPactDisplay-Black.ttf"),
  weight: "900",
  format: "truetype"
});

loadFont({
  family: BODY,
  url: staticFile("fonts/inter/Inter-Regular.ttf"),
  weight: "400",
  format: "truetype"
});

loadFont({
  family: BODY,
  url: staticFile("fonts/inter/Inter-Bold.ttf"),
  weight: "700",
  format: "truetype"
});
