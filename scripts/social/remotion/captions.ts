/**
 * Instagram-Captions für die Remotion-Reels, die es NICHT in spots.ts gibt
 * (die Satori-Pipeline schreibt ihre Captions selbst; diese hier sind reine
 * Remotion-Reels). Wird von `npm run social:reel-captions` in
 * out/social/reels/<slug>.caption.txt geschrieben, damit die Postmappe sie
 * findet. Ton: de-webcopy — menschlich, keine Floskeln, keine Gedankenstrich-
 * Krücken. Grundprinzip grob nennen, Rest macht neugierig aufs Profil.
 */
export const REEL_CAPTIONS: Record<string, string> = {
  "07-leere-kasse":
    "Die Mannschaftskasse ist immer leer. Kennt jeder.\n\n" +
    "Das Problem ist nicht das Geld, sondern der Weg dahin. Bei KickPact " +
    "verspricht euch jemand kleine Beträge pro Tor, pro Sieg. Automatisch in die " +
    "Kasse, die ganze Saison.\n\n" +
    "Eine Saison später sieht die Kasse anders aus.\n\n" +
    "30 Tage kostenlos, ohne Kreditkarte. kickpact.com",

  "08-keiner-gibt-geld":
    "Frag deinen Onkel um 50 € für die Mannschaftskasse. Da kommt selten was " +
    "zurück.\n\n" +
    "Frag ihn: 5 € für jedes Tor, das wir schießen? Auf einmal ist er dabei.\n\n" +
    "Weil das kein Betteln ist, sondern Mitfiebern mit Einsatz. Genau dafür ist " +
    "KickPact da.\n\n" +
    "30 Tage kostenlos. kickpact.com",

  "09-familie-fiebert-mit":
    "Stell dir vor, deine Oma schreit bei jedem Tor lauter als du. Weil sie 5 € " +
    "pro Tor drauf hat.\n\n" +
    "Bei KickPact versprechen Freunde und Familie kleine Beträge pro Tor, pro " +
    "Sieg. Ihr spielt, sie fiebern mit, die Mannschaftskasse füllt sich.\n\n" +
    "Plötzlich spielt ihr für die halbe Verwandtschaft.\n\n" +
    "30 Tage kostenlos, ohne Kreditkarte. kickpact.com"
};
