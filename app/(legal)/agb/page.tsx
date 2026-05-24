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
        Stand: 24. Mai 2026
      </p>

      <p className="mt-6">
        KickPact ist ein nüchternes Tool für Amateurfußball-Sponsoring — die
        Spielregeln zwischen dir und uns stehen hier in Klartext.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 1 Geltungsbereich
      </h2>
      <p className="mt-2">
        Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge
        zwischen Johannes Schartl — KickPact (im Folgenden „KickPact" oder
        „wir") und den Nutzern der Plattform{" "}
        <a className="text-accent hover:underline" href="https://kickpact.de">
          kickpact.de
        </a>{" "}
        (im Folgenden „Nutzer"). Abweichende oder ergänzende Bedingungen des
        Nutzers werden nur dann Vertragsbestandteil, wenn wir ihrer Geltung
        ausdrücklich zustimmen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 2 Vertragsgegenstand &amp; Leistungsbeschreibung
      </h2>
      <p className="mt-2">
        KickPact ist eine SaaS-Plattform für performance-basiertes
        Amateurfußball-Sponsoring. Sponsoren legen ihre Pledges (z.B. „5 € pro
        Tor") selbst fest, KickPact ermittelt Spielereignisse automatisiert
        anhand öffentlicher Spieldaten der DFB-Landesverbände sowie manueller
        Meldungen des Vereins und erstellt monatliche PDF-Rechnungen.
      </p>
      <p className="mt-3">
        KickPact ist <strong>kein Zahlungsdienstleister</strong>. Wir wickeln
        Zahlungen zwischen Sponsoren und Vereinen/Mannschaften nicht ab —
        Sponsoren überweisen direkt an den Verein. KickPact zwackt nichts vom
        Sponsoren-Geld ab; <strong>100 % der zugesagten Beträge gehen an die
        jeweilige Mannschaft</strong>. Unsere Einnahmen stammen ausschließlich
        aus den Abo-Gebühren der Vereine.
      </p>
      <p className="mt-3">
        Wir schulden keinen bestimmten Erfolg (insbesondere kein Mindestvolumen
        an Sponsoring-Einnahmen), sondern stellen die technische
        Tracking-Plattform bereit.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 3 Vertragsschluss
      </h2>
      <p className="mt-2">
        Der Vertrag kommt durch die Online-Anmeldung über die KickPact-Webseite
        zustande. Der Nutzer gibt mit Abschluss des Registrierungsformulars und
        Bestätigung dieser AGB ein verbindliches Angebot ab. Die Annahme
        erfolgt durch unsere Bestätigung per E-Mail.
      </p>
      <p className="mt-3">
        Der Nutzer sichert zu, vollendete 18 Jahre alt zu sein oder die
        Zustimmung eines Erziehungsberechtigten einzuholen. Bei
        Vereins-Accounts versichert die anlegende Person, vertretungsberechtigt
        zu sein.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 4 Preise &amp; Zahlungsbedingungen
      </h2>
      <p className="mt-2">
        Die jeweils aktuellen Tarife stehen unter{" "}
        <Link href="/preise" className="text-accent hover:underline">
          /preise
        </Link>
        . Maßgeblich sind die im Zeitpunkt der Buchung dort genannten Preise. Da
        KickPact aktuell als Kleinunternehmer gemäß § 19 UStG firmiert, weisen
        wir keine Umsatzsteuer aus.
      </p>
      <p className="mt-3">
        Vereins-Abos werden als <strong>Saison-Pass</strong> angeboten. Der
        Saison-Pass beginnt mit der Buchung und läuft bis zum Ende der jeweils
        aktuellen Fußball-Saison (30. Juni). Die Abrechnung erfolgt monatlich
        im Voraus per Stripe-Lastschrift oder Kreditkarte. Eine Probemonats-
        oder Testphase ist auf der Preise-Seite gesondert ausgewiesen.
      </p>
      <p className="mt-3">
        Bei Zahlungsverzug behalten wir uns das Recht vor, den Account nach
        zweimaliger Mahnung in Textform und Ablauf einer angemessenen
        Nachfrist zu sperren. Verzugszinsen fallen in gesetzlicher Höhe an.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 5 Widerrufsbelehrung für Verbraucher
      </h2>
      <p className="mt-2">
        Bist du Verbraucher im Sinne des § 13 BGB (d.h. du schließt den Vertrag
        zu einem Zweck ab, der überwiegend weder deiner gewerblichen noch
        deiner selbständigen beruflichen Tätigkeit zugerechnet werden kann),
        steht dir ein Widerrufsrecht zu.
      </p>
      <p className="mt-3">
        <strong>Widerrufsrecht:</strong> Du hast das Recht, binnen vierzehn
        Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die
        Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.
        Um dein Widerrufsrecht auszuüben, musst du uns (Johannes Schartl —
        KickPact, Kleegarten, 69123 Heidelberg-Wieblingen,{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        ) mittels einer eindeutigen Erklärung (z.B. ein mit der Post versandter
        Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu
        widerrufen, informieren. Zur Wahrung der Widerrufsfrist reicht es aus,
        dass du die Mitteilung vor Ablauf der Widerrufsfrist absendest.
      </p>
      <p className="mt-3">
        <strong>Folgen des Widerrufs:</strong> Wenn du diesen Vertrag widerrufst,
        haben wir dir alle Zahlungen, die wir von dir erhalten haben,
        unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag
        zurückzuzahlen, an dem die Mitteilung über deinen Widerruf bei uns
        eingegangen ist. Hast du verlangt, dass die Dienstleistung während der
        Widerrufsfrist beginnen soll, so hast du uns einen angemessenen Betrag
        zu zahlen, der dem Anteil der bis zum Widerruf bereits erbrachten
        Dienstleistungen entspricht.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 6 Vertragslaufzeit &amp; Kündigung
      </h2>
      <p className="mt-2">
        Monatlich abgerechnete Abos sind <strong>jederzeit zum Monatsende
        kündbar</strong>. Der Saison-Pass für Vereine läuft bis zum Saison-Ende
        (30. Juni) und verlängert sich nicht automatisch — eine Verlängerung
        erfolgt nur durch aktive Buchung der Folgesaison. Die Kündigung erfolgt
        formlos im Abo-Bereich des Accounts oder per E-Mail an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        . Bereits geleistete Zahlungen für den laufenden Monat werden nicht
        anteilig erstattet.
      </p>
      <p className="mt-3">
        Bestehende Sponsor-Pledges enden grundsätzlich zum Saison-Ende;
        Sponsoren können sie manuell für die folgende Saison erneuern. Das Recht
        zur außerordentlichen Kündigung aus wichtigem Grund bleibt für beide
        Parteien unberührt.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 7 Pflichten des Vereins / Nutzers
      </h2>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          Der Verein ist verantwortlich für die Richtigkeit der eingetragenen
          Mannschafts-, Sponsoren- und Bankdaten.
        </li>
        <li>
          Manuell gemeldete Spielereignisse (z.B. besondere Tore, Sondertrigger)
          sind nach bestem Wissen wahrheitsgemäß zu melden. Sponsoren können
          diese im Sponsor-Dashboard <strong>bestätigen oder bestreiten</strong>.
        </li>
        <li>
          Der Verein sichert zu, eingetragene Sponsoren über die Plattform und
          die anfallenden Charges in geeigneter Weise zu informieren.
        </li>
        <li>
          Login-Daten sind vertraulich zu behandeln und nicht an Dritte
          weiterzugeben. Der Account-Inhaber haftet für alle über seinen
          Account vorgenommenen Aktionen.
        </li>
        <li>
          Die Nutzung der Plattform für rechtswidrige Zwecke (Geldwäsche,
          Betrug, Verstöße gegen Verbandsregeln des DFB/Landesverbände) ist
          untersagt.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 8 Verfügbarkeit
      </h2>
      <p className="mt-2">
        KickPact bemüht sich um eine Verfügbarkeit von 99 % im Jahresmittel,
        gemessen außerhalb angekündigter Wartungsfenster. Wartungsfenster und
        unvorhergesehene Ausfälle sind hiervon ausgenommen. Ein Anspruch auf
        unterbrechungsfreien Betrieb besteht nicht. Bei längeren Ausfällen
        (&gt; 24 h zusammenhängend) wird die Monatsgebühr anteilig
        gutgeschrieben.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 9 Haftungsbeschränkung
      </h2>
      <p className="mt-2">
        KickPact haftet unbeschränkt für Schäden aus Vorsatz und grober
        Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit
        und im Rahmen einer übernommenen Garantie. Bei einfacher Fahrlässigkeit
        haften wir nur für die Verletzung wesentlicher Vertragspflichten
        (sog. Kardinalpflichten); die Haftung ist in diesem Fall auf den
        vertragstypischen, vorhersehbaren Schaden begrenzt. Eine darüber
        hinausgehende Haftung — insbesondere für entgangenen Gewinn, mittelbare
        Schäden oder Datenverluste — ist ausgeschlossen, soweit gesetzlich
        zulässig.
      </p>
      <p className="mt-3">
        Für die Richtigkeit der von den öffentlichen DFB-Verbandsseiten
        bezogenen Spieldaten übernehmen wir keine Gewähr — Korrekturen sind
        über den Bestätigen/Bestreiten-
        Workflow im Sponsor-Dashboard möglich. Die Haftung nach dem
        Produkthaftungsgesetz bleibt unberührt.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 10 Datenschutz
      </h2>
      <p className="mt-2">
        Wie wir mit personenbezogenen Daten umgehen, steht in unserer{" "}
        <Link href="/datenschutz" className="text-accent hover:underline">
          Datenschutzerklärung
        </Link>
        . Sie ist Bestandteil des Vertragsverhältnisses.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 11 Änderungen dieser AGB
      </h2>
      <p className="mt-2">
        Wir dürfen diese AGB mit Wirkung für die Zukunft anpassen, sofern
        die Anpassung erforderlich ist (z.B. wegen geänderter Rechtslage,
        Rechtsprechung, neuer Produkt-Features). Änderungen kündigen wir
        mindestens sechs Wochen vor Inkrafttreten per E-Mail an. Widerspricht
        der Nutzer der Änderung nicht innerhalb dieser Frist, gilt sie als
        akzeptiert. Im Fall des Widerspruchs kann jede Partei den Vertrag zum
        Wirksamkeitsdatum der Änderung außerordentlich kündigen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 12 Anwendbares Recht &amp; Gerichtsstand
      </h2>
      <p className="mt-2">
        Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des
        UN-Kaufrechts. Gegenüber Verbrauchern gilt diese Rechtswahl nur, soweit
        dadurch der durch zwingende Bestimmungen des Rechts des Staates des
        gewöhnlichen Aufenthalts des Verbrauchers gewährte Schutz nicht
        entzogen wird.
      </p>
      <p className="mt-3">
        Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im
        Zusammenhang mit diesem Vertrag ist — soweit der Nutzer Kaufmann,
        juristische Person des öffentlichen Rechts oder öffentlich-rechtliches
        Sondervermögen ist — Heidelberg. Für Verbraucher gelten die gesetzlichen
        Gerichtsstände.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        § 13 Schlussbestimmungen
      </h2>
      <p className="mt-2">
        Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die
        Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der
        unwirksamen Regelung tritt diejenige zulässige Regelung, die dem
        wirtschaftlichen Zweck am nächsten kommt. Mündliche Nebenabreden
        bestehen nicht; Änderungen oder Ergänzungen bedürfen der Textform.
      </p>
    </article>
  );
}
