#!/usr/bin/env python3
"""
Baut die KickPact-Display-Schrift aus Orbitron Black.

WARUM ES DIESES SKRIPT GIBT
Orbitron zeichnet die Null durchgestrichen (Ø). Auf einem Spielbericht wird aus
„6:0" dann „6:Ø" und aus „200 € pro Aufstieg" ein „2ØØ €" — auf einer Story, die
ein Verein unter seinem Namen teilt, und auf der Preis-Headline der Landingpage.
Abschalten geht nicht: der Font hat kein `zero`-Feature (nur `kern` und `mark`),
die durchgestrichene Null ist die einzige Null.

Der Strich ist auch keine Kontur, die man löschen könnte — nachgemessen: die Null
hat zwei GLEICH GROSSE Punzen (je 319×268), diagonal gegeneinander versetzt, und
der „Strich" ist bloß der Spalt dazwischen. Eine davon zu entfernen ergäbe keine
Null, sondern Bruch.

Stattdessen bekommt die Null die Form von Orbitrons eigenem „O". Das passt fast
aufs Haar (O ist 720×720 bei Vorschub 828, die Null 707×720 bei 834) und stammt
vom selben Designer im selben Schnitt — es ist keine Fremdziffer, die sich neben
den anderen Ziffern beißt. Dass 0 und O danach gleich aussehen, ist bei
geometrischen Techno-Schriften der Normalfall; im Kontext („6:0", „200 €",
„01.08.") liest es niemand als Buchstabe.

Eine Datei, die überall funktioniert: Web, App und die Satori-Motive. Ein
CSS-`unicode-range`-Trick hätte nur den Browser bedient — Satori kennt das nicht,
und die Motive sind genau der Ort, an dem die Null am größten dasteht.

WARUM DER NEUE NAME PFLICHT IST
Orbitron steht unter der OFL 1.1 mit Reserved Font Name „Orbitron". Punkt 3 der
Lizenz verbietet, eine geänderte Fassung weiter so zu nennen. „KickPact Display"
ist deshalb kein Branding-Gag, sondern die Bedingung, unter der wir die Änderung
überhaupt ausliefern dürfen. Copyright und Lizenz von Orbitron bleiben erhalten.

    python3 scripts/build-display-font.py

Liest  public/fonts/orbitron/Orbitron-Black.ttf
Schreibt public/fonts/kickpact-display/KickPactDisplay-Black.ttf
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/fonts/orbitron/Orbitron-Black.ttf"
DST_DIR = ROOT / "public/fonts/kickpact-display"
DST = DST_DIR / "KickPactDisplay-Black.ttf"

FAMILY = "KickPact Display"
PS_NAME = "KickPactDisplay-Black"


def bbox(font, name):
    """Umriss-Kasten eines Glyphs, aus den aufgezeichneten Punkten."""
    pen = DecomposingRecordingPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    pts = [p for _, args in pen.value for p in args if isinstance(p, tuple)]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def unslash_zero(font):
    """Gibt der Null die Form von Orbitrons „O"."""
    glyf, glyph_set = font["glyf"], font.getGlyphSet()

    for needed in ("zero", "O"):
        if needed not in glyf:
            sys.exit(f"ABBRUCH: Glyph '{needed}' fehlt — Font ist nicht das erwartete Orbitron.")

    zx0, zy0, zx1, zy1 = bbox(font, "zero")
    ox0, oy0, ox1, oy1 = bbox(font, "O")

    # Der Austausch trägt nur, solange O und Null praktisch gleich groß sind.
    # Weichen sie ab, ist es nicht mehr dieses Orbitron und die Null würde
    # sichtbar aus der Reihe tanzen — dann lieber abbrechen als still liefern.
    zh, oh = zy1 - zy0, oy1 - oy0
    zw, ow = zx1 - zx0, ox1 - ox0
    if abs(zh - oh) > zh * 0.03 or abs(zw - ow) > zw * 0.05:
        sys.exit(
            f"ABBRUCH: 'O' ({ow}×{oh}) passt nicht zur Null ({zw}×{zh}). "
            "Orbitron hat sich geändert — erst nachsehen, nicht raten."
        )

    pen = DecomposingRecordingPen(glyph_set)
    glyph_set["O"].draw(pen)
    out = TTGlyphPen(glyph_set)
    for op, args in pen.value:
        getattr(out, op)(*args)
    new = out.glyph()
    new.recalcBounds(glyf)

    zero_width, _ = font["hmtx"]["zero"]
    o_width, o_lsb = font["hmtx"]["O"]
    glyf["zero"] = new
    # Vorschub der NULL behalten, Seitenversatz vom O: so bleibt der Abstand zu
    # den Nachbarziffern der, den Orbitron für Ziffern vorsieht.
    font["hmtx"]["zero"] = (zero_width, o_lsb)

    print(f"  Null ersetzt durch 'O'   ({ow}×{oh} statt {zw}×{zh})")
    print(f"  Vorschub {zero_width} behalten (O hätte {o_width}), lsb {o_lsb}")


def rename(font):
    """Umbenennen — OFL-Pflicht, s. Modulkommentar."""
    name = font["name"]
    for rec in name.names:
        # 1=Family, 3=UniqueID, 4=FullName, 6=PostScript, 16=TypoFamily
        if rec.nameID in (1, 16):
            rec.string = FAMILY
        elif rec.nameID == 4:
            rec.string = f"{FAMILY} Black"
        elif rec.nameID == 6:
            rec.string = PS_NAME
        elif rec.nameID == 3:
            rec.string = f"{PS_NAME};KickPact"
        elif rec.nameID == 5:
            rec.string = "Version 1.000; abgeleitet von Orbitron Black"


def main():
    if not SRC.exists():
        sys.exit(f"ABBRUCH: {SRC} fehlt.")
    font = TTFont(SRC)
    print(f"Quelle: {SRC.name}")
    unslash_zero(font)
    rename(font)
    DST_DIR.mkdir(parents=True, exist_ok=True)
    font.save(DST)
    print(f"Ziel:   {DST.relative_to(ROOT)}  ({DST.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
