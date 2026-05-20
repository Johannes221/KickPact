import Link from "next/link";

export const metadata = {
  title: "AGB — KickPact",
  description: "Allgemeine Geschäftsbedingungen für die Nutzung von KickPact."
};

export default function AgbPage() {
  return (
    <article className="text-sm md:text-base leading-relaxed text-brand-night-navy/80">
      <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
        Allgemeine Geschäftsbedingungen
      </h1>
      <p className="mt-2 text-xs md:text-sm text-brand-night-navy/60">
        Stand: 20. Mai 2026
      </p>

      <p className="mt-6">
        KickPact ist ein nüchternes Tool für Amateurfußball-Sponsoring — die
        Spielregeln zwischen dir und uns stehen hier in Klartext.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 1 Leistungsbeschreibung
      </h2>
      <p className="mt-2">
        KickPact (im Folgenden „die Plattform") ist eine Performance-Sponsoring-
        Tracking-Plattform für den Amateurfußball. Sponsoren legen ihre Pledges
        (z.B. „5 € pro Tor") selbst fest, KickPact ermittelt Spielereignisse
        automatisiert anhand öffentlicher Daten von Fußball.de und erstellt
        monatliche PDF-Rechnungen.
      </p>
      <p className="mt-3">
        KickPact ist <strong>kein Zahlungsdienstleister</strong>. Wir wickeln
        Zahlungen zwischen Sponsoren und Mannschaften/Vereinen nicht ab —
        Sponsoren überweisen direkt an die Mannschaft/den Verein. KickPact zwackt
        nichts vom Sponsoren-Geld ab; <strong>100 % der zugesagten Beträge gehen
        an die jeweilige Mannschaft</strong>. Unsere Einnahmen stammen
        ausschließlich aus den Abo-Gebühren der Mannschaften/Vereine.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 2 Vertragsschluss
      </h2>
      <p className="mt-2">
        Der Vertrag kommt mit der Bestätigung der Registrierung per E-Mail
        zustande. Der Nutzer sichert zu, vollendete 18 Jahre alt zu sein oder die
        Zustimmung eines Erziehungsberechtigten einzuholen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 3 Preise &amp; Tarife
      </h2>
      <p className="mt-2">Es gelten folgende Tarife (alle Preise netto, zzgl. ggf. anfallender USt):</p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          <strong>Basic:</strong> 9 € pro Mannschaft pro Monat.
        </li>
        <li>
          <strong>Pro:</strong> 19 € pro Mannschaft pro Monat (inklusive
          Saison-Wetten, Custom-Trigger-Texte, Mannschafts-Logo auf Rechnungen).
        </li>
        <li>
          <strong>Vereinslizenz:</strong> 49 € pro Verein pro Monat — alle
          Mannschaften des Vereins inklusive, mit zentralem Master-Admin.
        </li>
      </ul>
      <p className="mt-3">
        Die Abrechnung erfolgt monatlich im Voraus per Stripe-Lastschrift oder
        Kreditkarte. Bei Zahlungsverzug behalten wir uns das Recht vor, den Zugang
        nach Mahnung zu sperren.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 4 Testphase
      </h2>
      <p className="mt-2">
        Neue Mannschaften und Vereine können KickPact <strong>30 Tage kostenfrei
        testen</strong>. In der Testphase stehen alle Funktionen des gewählten Tarifs
        zur Verfügung. Wird das Abo nicht innerhalb der 30 Tage gekündigt, wechselt
        es automatisch in das kostenpflichtige Abo zum gewählten Tarif.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 5 Vertragslaufzeit &amp; Kündigung
      </h2>
      <p className="mt-2">
        Das Abo läuft auf unbestimmte Zeit und ist <strong>jederzeit zum Monatsende
        kündbar</strong>. Die Kündigung erfolgt formlos im Abo-Bereich oder per
        E-Mail an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        . Bereits geleistete Zahlungen für den laufenden Monat werden nicht
        anteilig erstattet.
      </p>
      <p className="mt-3">
        Bestehende Sponsor-Pledges enden zum Saison-Ende; Sponsoren können sie
        manuell für die folgende Saison erneuern.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 6 Pflichten des Nutzers
      </h2>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          Der Nutzer ist verantwortlich für die Richtigkeit der eingetragenen
          Mannschafts- und Sponsoren-Daten.
        </li>
        <li>
          Manuell gemeldete Spielereignisse (z.B. Spezial-Tore) sind nach bestem
          Wissen wahrheitsgemäß zu melden. Sponsoren bestätigen oder bestreiten
          diese im Sponsor-Dashboard.
        </li>
        <li>
          Login-Daten sind vertraulich zu behandeln und nicht an Dritte
          weiterzugeben.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 7 Verfügbarkeit
      </h2>
      <p className="mt-2">
        KickPact bemüht sich um eine Verfügbarkeit von 99 % im Jahresmittel.
        Wartungsfenster und unvorhergesehene Ausfälle sind hiervon ausgenommen.
        Ein Anspruch auf unterbrechungsfreien Betrieb besteht nicht. Bei längeren
        Ausfällen (&gt; 24 h zusammenhängend) wird die Monatsgebühr anteilig
        gutgeschrieben.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 8 Haftung
      </h2>
      <p className="mt-2">
        KickPact haftet unbeschränkt für Schäden aus Vorsatz und grober
        Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im
        Übrigen ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden
        begrenzt. Für die Richtigkeit der von Fußball.de bezogenen Spieldaten
        übernehmen wir keine Gewähr — Korrekturen sind über das Sponsor-Dashboard
        (Bestätigen/Bestreiten) möglich.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 9 Datenschutz
      </h2>
      <p className="mt-2">
        Wie wir mit personenbezogenen Daten umgehen, steht in unserer{" "}
        <Link href="/datenschutz" className="text-accent hover:underline">
          Datenschutzerklärung
        </Link>
        .
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 10 Schlussbestimmungen
      </h2>
      <p className="mt-2">
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Erfüllungsort
        und ausschließlicher Gerichtsstand für alle Streitigkeiten ist —
        soweit gesetzlich zulässig —{" "}
        {/* TODO: vor Production ggf. anpassen */}
        München.
      </p>
      <p className="mt-3">
        Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die
        Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der
        unwirksamen Regelung tritt diejenige zulässige Regelung, die dem
        wirtschaftlichen Zweck am nächsten kommt.
      </p>
    </article>
  );
}
