export const metadata = {
  title: "Datenschutz — KickPact",
  description: "Wie KickPact mit personenbezogenen Daten umgeht — DSGVO-konform."
};

export default function DatenschutzPage() {
  return (
    <article className="text-sm md:text-base leading-relaxed text-brand-night-navy/80">
      <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
        Datenschutzerklärung
      </h1>
      <p className="mt-2 text-xs md:text-sm text-brand-night-navy/60">
        Letzte Aktualisierung: 24. Mai 2026
      </p>

      <p className="mt-6">
        KickPact verarbeitet so wenig personenbezogene Daten wie möglich — hier in
        Klartext was wir tun, warum und mit welchen Drittanbietern wir arbeiten.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        1. Verantwortlicher
      </h2>
      <p className="mt-2">
        Verantwortlich im Sinne der DSGVO ist:
        <br />
        Johannes Schartl — KickPact
        <br />
        Kleegarten
        <br />
        69123 Heidelberg-Wieblingen
        <br />
        Deutschland
        <br />
        E-Mail:{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        2. Welche Daten wir verarbeiten
      </h2>
      <p className="mt-2">
        Wir verarbeiten ausschließlich Daten, die zum Betrieb der Plattform notwendig
        sind:
      </p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          <strong>Authentifizierung (Better Auth):</strong> deine E-Mail-Adresse für
          Magic-Link-Login sowie — falls genutzt — die mit deinem Google- oder
          Apple-Konto verbundenen Basisdaten (Name, E-Mail, Profilbild-URL).
        </li>
        <li>
          <strong>Profil- &amp; Vereinsdaten:</strong> Name, Rolle (Verein, Sponsor,
          Spieler-Bezug), Verein/Mannschaft, Pact-Konfigurationen.
        </li>
        <li>
          <strong>Rechnungsdaten:</strong> Daten, die für die Erstellung der
          monatlichen PDF-Rechnung notwendig sind (Rechnungsadresse, ggf. USt-ID).
        </li>
        <li>
          <strong>Öffentliche Spieldaten der DFB-Landesverbände:</strong>{" "}
          öffentliche Spielergebnisse, Spielereignisse (Tore, Karten,
          Auswechslungen) und Spielernamen deiner Mannschaft, die wir von den
          öffentlichen DFB-Verbandsseiten abrufen — Details und
          Widerspruchsrecht siehe Abschnitt 5.
        </li>
        <li>
          <strong>Technische Logs:</strong> IP-Adresse, User-Agent und Zeitstempel
          bei jedem Request, gespeichert maximal 30 Tage zur Missbrauchsabwehr.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        3. Zweck der Verarbeitung
      </h2>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          <strong>Authentifizierung &amp; Account-Verwaltung</strong> (Art. 6 Abs. 1
          lit. b DSGVO — Vertragserfüllung).
        </li>
        <li>
          <strong>Pact-Verwaltung &amp; Performance-Tracking</strong> — Berechnung
          der Beträge anhand der Sponsor-Pacts und der öffentlichen
          DFB-Spielergebnisse.
        </li>
        <li>
          <strong>Erstellung monatlicher PDF-Rechnungen</strong> und Versand per
          E-Mail.
        </li>
        <li>
          <strong>Abrechnung des KickPact-Abos</strong> (Stripe-Zahlungsabwicklung).
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        4. Auftragsverarbeiter
      </h2>
      <p className="mt-2">
        Für den Betrieb arbeiten wir mit folgenden Dienstleistern zusammen. Mit
        allen Auftragsverarbeitern bestehen Auftragsverarbeitungsverträge gemäß
        Art. 28 DSGVO. Für Drittlandtransfers außerhalb der EU/EWR werden
        Standardvertragsklauseln (SCC) gemäß Durchführungsbeschluss (EU) 2021/914
        und ergänzende Schutzmaßnahmen eingesetzt.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead className="bg-brand-off-white text-brand-night-navy">
            <tr>
              <th className="text-left p-2 border border-brand-neutral/40">Anbieter</th>
              <th className="text-left p-2 border border-brand-neutral/40">Sitz / Rechenzentrum</th>
              <th className="text-left p-2 border border-brand-neutral/40">Zweck</th>
              <th className="text-left p-2 border border-brand-neutral/40">Rechtsgrundlage Drittland</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Hetzner Online GmbH</td>
              <td className="p-2 border border-brand-neutral/40">Deutschland (Nürnberg / Falkenstein)</td>
              <td className="p-2 border border-brand-neutral/40">Server-Hosting der Anwendung (Coolify-Plattform)</td>
              <td className="p-2 border border-brand-neutral/40">EU-Hosting, kein Drittlandtransfer</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Neon Inc.</td>
              <td className="p-2 border border-brand-neutral/40">Hosting EU-Region (Frankfurt)</td>
              <td className="p-2 border border-brand-neutral/40">Postgres-Datenbank (alle Anwendungsdaten)</td>
              <td className="p-2 border border-brand-neutral/40">EU-Hosting, kein Drittlandtransfer</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Resend (Drop, Inc.)</td>
              <td className="p-2 border border-brand-neutral/40">USA</td>
              <td className="p-2 border border-brand-neutral/40">Transaktions-E-Mail-Versand (Magic-Link, Rechnungen, Benachrichtigungen)</td>
              <td className="p-2 border border-brand-neutral/40">SCC + Data Privacy Framework (DPF)</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Stripe Payments Europe Ltd.</td>
              <td className="p-2 border border-brand-neutral/40">Irland (Konzern-Mutter USA)</td>
              <td className="p-2 border border-brand-neutral/40">Zahlungsabwicklung Plattform-Abo</td>
              <td className="p-2 border border-brand-neutral/40">EU-Vertragspartner; konzernintern SCC + DPF</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Inngest, Inc.</td>
              <td className="p-2 border border-brand-neutral/40">USA</td>
              <td className="p-2 border border-brand-neutral/40">Asynchrone Job-Orchestrierung (Crawler-Runs, Rechnungserstellung)</td>
              <td className="p-2 border border-brand-neutral/40">SCC + DPF</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Cloudflare, Inc.</td>
              <td className="p-2 border border-brand-neutral/40">USA (Edge weltweit)</td>
              <td className="p-2 border border-brand-neutral/40">CDN für statische Assets, R2-Object-Storage für PDF-Rechnungen</td>
              <td className="p-2 border border-brand-neutral/40">SCC + DPF</td>
            </tr>
            <tr>
              <td className="p-2 border border-brand-neutral/40">Plausible Insights OÜ</td>
              <td className="p-2 border border-brand-neutral/40">Estland (Hosting Deutschland, Hetzner Falkenstein)</td>
              <td className="p-2 border border-brand-neutral/40">Cookiefreie Webanalyse (siehe Abschnitt 7)</td>
              <td className="p-2 border border-brand-neutral/40">EU-Hosting, kein Drittlandtransfer</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-night-navy/60">
        Eine aktuelle Liste der Auftragsverarbeiter und Subprocessoren stellen wir
        auf Anfrage per E-Mail an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>{" "}
        bereit.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        5. Verarbeitung öffentlicher DFB-Spielerdaten
      </h2>
      <p className="mt-2">
        Damit Sponsor-Wetten („Pact pro Tor", „Pact pro Hattrick" etc.)
        korrekt ausgewertet werden können, ruft KickPact öffentlich zugängliche
        Spielergebnisse, Spielereignisse (Tore, Karten, Auswechslungen) und
        Spielernamen von{" "}
        <a className="text-accent hover:underline" href="https://www.fussball.de" target="_blank" rel="noreferrer">
          den öffentlichen DFB-Verbandsseiten
        </a>{" "}
        ab und speichert sie verknüpft mit der jeweiligen Mannschaft.
      </p>
      <p className="mt-3">
        <strong>Rechtsgrundlage</strong> ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse). Unser berechtigtes Interesse besteht in der
        Bereitstellung des Kernzwecks von KickPact — Pact-Auswertung anhand
        überprüfbarer, öffentlich publizierter Spielresultate. Ohne diese
        Verarbeitung wäre die Dienstleistung nicht erbringbar. Wir verarbeiten
        ausschließlich Daten, die der DFB-Landesverband auf den öffentlichen
        DFB-Verbandsseiten bereits öffentlich publiziert hat, und keine über
        die Spielberichte hinausgehenden
        personenbezogenen Daten (insbesondere keine Adressen, Geburtsdaten oder
        Kontaktdaten der Spieler).
      </p>
      <p className="mt-3">
        <strong>Interessenabwägung:</strong> Die Spielernamen sind bereits
        öffentlich auf den öffentlichen DFB-Verbandsseiten einsehbar; KickPact
        reichert sie nicht mit
        zusätzlichen Daten an und gibt sie ausschließlich an die mit der
        Mannschaft verknüpften Sponsoren weiter (geschlossener Empfängerkreis,
        eingeloggt + Pact an die Mannschaft aktiv). Eine darüber hinausgehende
        öffentliche Veröffentlichung findet nicht statt. Bei Jugendmannschaften
        (Spieler unter 18 Jahren) erfolgt die Verarbeitung nur, solange der
        zuständige Landesverband die Daten auch auf den öffentlichen
        DFB-Verbandsseiten öffentlich zeigt.
      </p>
      <p className="mt-3">
        <strong>Widerspruchsrecht (Opt-out):</strong> Spieler oder
        Erziehungsberechtigte können der Verarbeitung jederzeit formlos
        widersprechen. Bitte schreibe eine E-Mail mit dem vollständigen Namen
        und der betroffenen Mannschaft an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        . Wir anonymisieren den Spielernamen in unserem System innerhalb von
        14 Tagen nach Eingang und schließen ihn von zukünftigen Crawler-Updates
        aus.
      </p>
      <p className="mt-3">
        <strong>Speicherdauer:</strong> Spielereignisse und damit verbundene
        Spielernamen werden gelöscht, sobald die zugehörige Mannschaft auf
        KickPact deaktiviert wird, spätestens jedoch nach Ablauf der gesetzlichen
        Aufbewahrungspflichten für die zugehörigen Rechnungsdaten (§ 147 AO,
        10 Jahre).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        6. Cookies
      </h2>
      <p className="mt-2">
        KickPact setzt ausschließlich ein technisch notwendiges Cookie für die
        Authentifizierung: das Better-Auth-Session-Cookie. Es ist{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">HttpOnly</code>,{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">SameSite=Lax</code>{" "}
        und in Production zusätzlich{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">Secure</code>.
        Es enthält keine Werbe- oder Tracking-Funktion. Tracking- oder
        Marketing-Cookies setzen wir nicht.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        7. Webanalyse (Plausible Analytics)
      </h2>
      <p className="mt-2">
        Wir nutzen{" "}
        <a
          className="text-accent hover:underline"
          href="https://plausible.io/privacy-focused-web-analytics"
          target="_blank"
          rel="noreferrer"
        >
          Plausible Analytics
        </a>
        , eine cookiefreie und DSGVO-konforme Webanalyse-Lösung. Es werden{" "}
        <strong>keine personenbezogenen Daten</strong> gespeichert; nur
        aggregierte Zugriffszahlen (Seitenaufrufe, Quellen, Geräte-Typen,
        anonyme Conversion-Events wie „Signup begonnen" oder „Pact angelegt").
        Plausible setzt keine Cookies, erzeugt kein Geräte-Fingerprinting und
        verfolgt Nutzer nicht über Websites hinweg. Server-Standort: Deutschland
        (Hetzner Online GmbH, Falkenstein).
      </p>
      <p className="mt-3">
        <strong>Rechtsgrundlage</strong> ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse an der Verbesserung der eigenen Website ohne
        invasive Tracking-Maßnahmen). Da keine personenbezogenen Daten
        verarbeitet werden, ist keine Einwilligung erforderlich. Mehr Details:{" "}
        <a
          className="text-accent hover:underline"
          href="https://plausible.io/data-policy"
          target="_blank"
          rel="noreferrer"
        >
          plausible.io/data-policy
        </a>
        .
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        8. Deine Rechte
      </h2>
      <p className="mt-2">
        Nach DSGVO stehen dir folgende Rechte zu:
      </p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO).</li>
        <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO).</li>
        <li>
          Löschung deiner Daten („Recht auf Vergessenwerden") sofern keine
          gesetzlichen Aufbewahrungspflichten entgegenstehen (Art. 17 DSGVO).
        </li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO).</li>
        <li>
          Datenübertragbarkeit — Export deiner Daten in maschinenlesbarem Format
          (Art. 20 DSGVO).
        </li>
        <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO).</li>
        <li>
          Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO). Zuständig ist
          die Datenschutzbehörde des Bundeslandes deines Wohnsitzes.
        </li>
      </ul>
      <p className="mt-3">
        Für DSGVO-Anfragen schreib uns formlos an{" "}
        <a className="text-accent hover:underline" href="mailto:hello@kickpact.com">
          hello@kickpact.com
        </a>
        . Wir antworten innerhalb von 30 Tagen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        9. Speicherdauer
      </h2>
      <p className="mt-2">
        Account-Daten werden gespeichert, solange dein KickPact-Account aktiv ist.
        Nach Account-Löschung werden personenbezogene Daten innerhalb von 30 Tagen
        gelöscht — Ausnahme: rechnungsrelevante Daten unterliegen der gesetzlichen
        Aufbewahrungspflicht von 10 Jahren (§ 147 AO).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        10. Änderungen dieser Erklärung
      </h2>
      <p className="mt-2">
        Wir aktualisieren diese Datenschutzerklärung gelegentlich, um Änderungen
        an unseren Diensten oder rechtlichen Vorgaben abzubilden. Das Datum der
        letzten Aktualisierung steht oben auf dieser Seite.
      </p>
    </article>
  );
}
