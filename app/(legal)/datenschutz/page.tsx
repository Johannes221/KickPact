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
        Stand: 24. Mai 2026
      </p>

      <p className="mt-6">
        KickPact verarbeitet so wenig personenbezogene Daten wie möglich — hier
        in Klartext was wir tun, warum und mit welchen Drittanbietern wir
        arbeiten. Diese Erklärung informiert dich über die Verarbeitung
        personenbezogener Daten gemäß Datenschutz-Grundverordnung (DSGVO) und
        Bundesdatenschutzgesetz (BDSG).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        1. Verantwortlicher
      </h2>
      <p className="mt-2">
        Verantwortlich im Sinne der DSGVO ist:
        <br />
        Johannes Schartl — KickPact
        <br />
        Schartlweg 1, 80331 München, Deutschland
        <br />
        E-Mail:{" "}
        <a className="text-accent hover:underline" href="mailto:datenschutz@kickpact.de">
          datenschutz@kickpact.de
        </a>
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        2. Allgemeine Informationen beim Aufruf der Webseite
      </h2>
      <p className="mt-2">
        Beim Aufruf unserer Webseite werden vom Browser automatisch technische
        Informationen an unseren Server übertragen (sog. Server-Log-Daten):
      </p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>IP-Adresse (gekürzt nach 7 Tagen)</li>
        <li>Datum und Uhrzeit des Zugriffs</li>
        <li>aufgerufene URL und HTTP-Statuscode</li>
        <li>übertragene Datenmenge</li>
        <li>Browser-Typ und Betriebssystem (User-Agent)</li>
        <li>Referrer-URL (falls vorhanden)</li>
      </ul>
      <p className="mt-3">
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an
        einem sicheren und stabilen Betrieb sowie Schutz vor Missbrauch.
        Server-Logs werden maximal 30 Tage gespeichert.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        3. Cookies
      </h2>
      <p className="mt-2">
        KickPact setzt ausschließlich ein technisch notwendiges Cookie für die
        Authentifizierung: das Better-Auth-Session-Cookie. Es ist{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">HttpOnly</code>,{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">SameSite=Lax</code>{" "}
        und in Production zusätzlich{" "}
        <code className="rounded bg-brand-neutral/30 px-1 py-0.5 text-xs">Secure</code>.
        Es enthält keine Werbe- oder Tracking-Funktion. Tracking- oder
        Marketing-Cookies setzen wir nicht. Eine Einwilligung nach § 25 TTDSG ist
        damit nicht erforderlich (technische Notwendigkeit).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        4. Erhebung personenbezogener Daten bei Registrierung
      </h2>
      <p className="mt-2">
        Wer einen KickPact-Account anlegt, gibt mindestens eine gültige
        E-Mail-Adresse und einen Anzeigenamen an. Bei Login per Google OAuth
        (optional) werden zusätzlich Name, E-Mail und Profilbild-URL aus dem
        Google-Konto bezogen. Diese Daten verarbeiten wir zur
        Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) — ohne Account-Daten
        können wir die Plattform-Leistung nicht erbringen.
      </p>
      <p className="mt-3">
        Zusätzlich gespeichert werden je nach Rolle:
      </p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>
          <strong>Sponsoren:</strong> Anzeigename, Sponsor-Typ (Familie /
          Business), bei Business-Sponsoren optional Firmenname, Rechnungsanschrift
          und Steuernummer.
        </li>
        <li>
          <strong>Vereine:</strong> Vereinsname, Mannschaftsname, Saison,
          Liga-Information (öffentlich, von fussball.de), Pledge-Konfigurationen.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        5. Magic-Link-Versand via Resend
      </h2>
      <p className="mt-2">
        Für den Login senden wir Magic-Links per E-Mail. Versanddienstleister ist{" "}
        <strong>Resend (Resend Inc., 2261 Market Street #4848, San Francisco,
        CA 94114, USA)</strong>. Mit Resend besteht ein Auftragsverarbeitungsvertrag
        (AVV) nach Art. 28 DSGVO sowie EU-Standardvertragsklauseln für den
        Drittlandtransfer. Resend verarbeitet ausschließlich E-Mail-Adresse,
        Betreff und Mail-Inhalt zum Zweck der Zustellung. Rechtsgrundlage:
        Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        6. Zahlungsabwicklung via Stripe
      </h2>
      <p className="mt-2">
        Abo-Zahlungen wickeln wir über{" "}
        <strong>Stripe Payments Europe Ltd. (Dublin, Irland)</strong> ab. Stripe
        ist hierbei eigenständig Verantwortlicher; wir übermitteln nur die zur
        Abrechnung nötigen Basisdaten (Name, E-Mail, Rechnungsanschrift,
        ausgewähltes Produkt). Zahlungsdaten (Kreditkarte, SEPA-Mandat) gibt der
        Nutzer direkt bei Stripe ein — wir sehen und speichern sie nie. Details:{" "}
        <a
          className="text-accent hover:underline"
          href="https://stripe.com/de/privacy"
          target="_blank"
          rel="noreferrer"
        >
          stripe.com/de/privacy
        </a>
        . Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        7. Google OAuth (optional)
      </h2>
      <p className="mt-2">
        Wer sich mit Google anmeldet, übermittelt seine Login-Daten direkt an{" "}
        <strong>Google Ireland Ltd. (Gordon House, Barrow Street, Dublin 4,
        Irland)</strong>. Google leitet anschließend Basis-Profil-Daten (Name,
        E-Mail, Profilbild-URL) an uns weiter. Hierbei findet ein
        Drittlandtransfer in die USA statt; dieser ist durch den{" "}
        <strong>EU-US Data Privacy Framework</strong> (Google LLC ist
        zertifiziert) abgesichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO
        (Einwilligung durch aktive Auswahl des Google-Logins, jederzeit
        widerruflich).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        8. Server-Hosting
      </h2>
      <ul className="mt-3 space-y-3 list-disc pl-5">
        <li>
          <strong>Vercel Inc. (USA):</strong> hostet die Next.js-Anwendung
          (Edge- und Serverless-Functions). Mit Vercel besteht ein AVV; der
          Anbieter ist nach dem EU-US Data Privacy Framework zertifiziert.
        </li>
        <li>
          <strong>Neon (EU-Frankfurt):</strong> Postgres-Datenbank-Hosting in
          einem deutschen Rechenzentrum. Sämtliche Anwendungsdaten (Accounts,
          Pledges, Charges, Rechnungen) liegen ausschließlich in der EU-Region.
          Mit Neon besteht ein AVV.
        </li>
        <li>
          <strong>Inngest (USA):</strong> orchestriert asynchrone Jobs (z.B.
          Fußball.de-Crawler-Runs, monatliche Rechnungserstellung). Verarbeitet
          ausschließlich Job-Metadaten (IDs, Statuscodes) — keine
          personenbezogenen Inhalte in der Job-Payload. AVV vorhanden,
          Standardvertragsklauseln für Drittlandtransfer.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        9. Fußball.de-Daten
      </h2>
      <p className="mt-2">
        Wir lesen öffentlich zugängliche Spieldaten (Mannschaftsname, Spielplan,
        Ergebnisse, Tor-Ereignisse mit Spielername sofern auf fussball.de
        veröffentlicht) automatisiert von{" "}
        <a
          className="text-accent hover:underline"
          href="https://www.fussball.de"
          target="_blank"
          rel="noreferrer"
        >
          fussball.de
        </a>
        . Es werden ausschließlich Daten verarbeitet, die der DFB bereits
        öffentlich publiziert. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO —
        berechtigtes Interesse an automatisierter Pledge-Auswertung.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        10. Deine Rechte
      </h2>
      <p className="mt-2">
        Nach DSGVO stehen dir folgende Rechte zu:
      </p>
      <ul className="mt-3 space-y-2 list-disc pl-5">
        <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO)</li>
        <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
        <li>
          Löschung deiner Daten („Recht auf Vergessenwerden") sofern keine
          gesetzlichen Aufbewahrungspflichten entgegenstehen (Art. 17 DSGVO)
        </li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>
          Datenübertragbarkeit — Export deiner Daten in maschinenlesbarem
          Format (Art. 20 DSGVO)
        </li>
        <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        <li>
          Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7
          Abs. 3 DSGVO)
        </li>
        <li>
          Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO). Für uns
          zuständig: Bayerisches Landesamt für Datenschutzaufsicht, Promenade
          27, 91522 Ansbach.
        </li>
      </ul>
      <p className="mt-3">
        Für DSGVO-Anfragen schreib uns formlos an{" "}
        <a className="text-accent hover:underline" href="mailto:datenschutz@kickpact.de">
          datenschutz@kickpact.de
        </a>
        . Wir antworten innerhalb von 30 Tagen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        11. Speicherdauer
      </h2>
      <p className="mt-2">
        Account-Daten werden gespeichert, solange dein KickPact-Account aktiv ist.
        Nach Account-Löschung werden personenbezogene Daten innerhalb von 30
        Tagen gelöscht — Ausnahme: rechnungsrelevante Daten unterliegen der
        gesetzlichen Aufbewahrungspflicht von 10 Jahren (§ 147 AO).
        Server-Logs werden nach 30 Tagen gelöscht.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        12. Änderungen dieser Erklärung
      </h2>
      <p className="mt-2">
        Wir aktualisieren diese Datenschutzerklärung gelegentlich, um Änderungen
        an unseren Diensten oder rechtlichen Vorgaben abzubilden. Das Datum der
        letzten Aktualisierung steht oben auf dieser Seite. Wesentliche
        Änderungen kommunizieren wir per E-Mail an alle aktiven Accounts.
      </p>
    </article>
  );
}
