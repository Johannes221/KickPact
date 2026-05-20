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
        Letzte Aktualisierung: 20. Mai 2026
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
        {/* TODO: vor Production ergänzen */}
        [Anschrift]
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
          Spieler-Bezug), Verein/Mannschaft, Pledge-Konfigurationen.
        </li>
        <li>
          <strong>Rechnungsdaten:</strong> Daten, die für die Erstellung der
          monatlichen PDF-Rechnung notwendig sind (Rechnungsadresse, ggf. USt-ID).
        </li>
        <li>
          <strong>Fußball.de-Crawler-Daten:</strong> öffentliche Spieldaten
          (Tore, Siege, Spielstände) deiner Mannschaft, die wir von fussball.de
          abrufen. Es handelt sich ausschließlich um Daten, die bereits öffentlich
          zugänglich sind.
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
          <strong>Pledge-Verwaltung &amp; Performance-Tracking</strong> — Berechnung
          der Beträge anhand der Sponsor-Pledges und der Fußball.de-Ergebnisse.
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
        4. Drittanbieter (Auftragsverarbeiter)
      </h2>
      <p className="mt-2">
        Für den Betrieb arbeiten wir mit folgenden Dienstleistern zusammen. Mit
        allen Anbietern bestehen Auftragsverarbeitungsverträge nach Art. 28 DSGVO.
      </p>
      <ul className="mt-3 space-y-3 list-disc pl-5">
        <li>
          <strong>Neon (Postgres-Datenbank, EU):</strong> hostet unsere Datenbank
          in einer EU-Region. Sämtliche Anwendungsdaten liegen hier.
        </li>
        <li>
          <strong>Resend (Transaktions-Mails, EU/US):</strong> versendet
          Magic-Link-Mails, Rechnungs-Versand und Benachrichtigungen. Standard
          Contractual Clauses für etwaige Drittlandtransfers.
        </li>
        <li>
          <strong>Stripe (Zahlungsdienstleister, US/IE):</strong> wickelt die
          Abo-Zahlungen für KickPact ab. Stripe ist Verantwortlicher gemäß
          eigener Datenschutzerklärung; wir übermitteln nur Rechnungs-Basisdaten.
        </li>
        <li>
          <strong>Inngest (Workflow-Engine, US):</strong> orchestriert
          asynchrone Jobs (Crawler-Runs, Rechnungserstellung). Verarbeitet
          ausschließlich Job-Metadaten, keine Inhalte über die Job-Payload hinaus.
        </li>
        <li>
          <strong>Cloudflare (CDN &amp; Object-Storage R2):</strong> liefert
          statische Assets aus und speichert PDF-Rechnungen verschlüsselt in R2.
        </li>
        <li>
          <strong>Hetzner (Hosting, Deutschland):</strong> die Anwendung läuft auf
          Hetzner-Servern in einem deutschen Rechenzentrum.
        </li>
      </ul>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        5. Cookies
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
        6. Deine Rechte
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
        7. Speicherdauer
      </h2>
      <p className="mt-2">
        Account-Daten werden gespeichert, solange dein KickPact-Account aktiv ist.
        Nach Account-Löschung werden personenbezogene Daten innerhalb von 30 Tagen
        gelöscht — Ausnahme: rechnungsrelevante Daten unterliegen der gesetzlichen
        Aufbewahrungspflicht von 10 Jahren (§ 147 AO).
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        8. Änderungen dieser Erklärung
      </h2>
      <p className="mt-2">
        Wir aktualisieren diese Datenschutzerklärung gelegentlich, um Änderungen
        an unseren Diensten oder rechtlichen Vorgaben abzubilden. Das Datum der
        letzten Aktualisierung steht oben auf dieser Seite.
      </p>
    </article>
  );
}
