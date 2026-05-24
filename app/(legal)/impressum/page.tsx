export const metadata = {
  title: "Impressum — KickPact",
  description: "Anbieterkennzeichnung gemäß § 5 TMG."
};

export default function ImpressumPage() {
  return (
    <article className="text-sm md:text-base leading-relaxed text-brand-night-navy/80">
      <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
        Impressum
      </h1>
      <p className="mt-2 text-xs md:text-sm text-brand-night-navy/60">
        Angaben gemäß § 5 TMG.
      </p>

      <p className="mt-6">
        KickPact macht aus Amateurfußball-Sponsoring eine durchsichtige Sache —
        hier in Klartext, wer hinter der Plattform steht.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Anbieter
      </h2>
      <p className="mt-2">
        KickPact — Johannes Schartl
        <br />
        Schartlweg 1
        <br />
        80331 München
        <br />
        Deutschland
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Kontakt
      </h2>
      <p className="mt-2">
        Telefon: +49 (0)89 / 000 00 00
        <br />
        E-Mail:{" "}
        <a className="text-accent hover:underline" href="mailto:kontakt@kickpact.de">
          kontakt@kickpact.de
        </a>
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Umsatzsteuer
      </h2>
      <p className="mt-2">
        Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer
        ausgewiesen. Eine Umsatzsteuer-Identifikationsnummer wird daher nicht
        geführt.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Verantwortlich für den Inhalt
      </h2>
      <p className="mt-2">
        Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:
        <br />
        Johannes Schartl
        <br />
        Anschrift wie oben
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Haftung für Inhalte
      </h2>
      <p className="mt-2">
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf
        diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10
        TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte
        oder gespeicherte fremde Informationen zu überwachen oder nach Umständen
        zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
      </p>
      <p className="mt-3">
        Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen
        nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche
        Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten
        Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen
        werden wir diese Inhalte umgehend entfernen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Haftung für Links
      </h2>
      <p className="mt-2">
        Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren
        Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden
        Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten
        ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
        Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche
        Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der
        Verlinkung nicht erkennbar.
      </p>
      <p className="mt-3">
        Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne
        konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden
        von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        Urheberrecht
      </h2>
      <p className="mt-2">
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
        unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung,
        Verbreitung und jede Art der Verwertung außerhalb der Grenzen des
        Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors
        bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten,
        nicht kommerziellen Gebrauch gestattet.
      </p>

      <h2 className="mt-8 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
        EU-Streitschlichtung
      </h2>
      <p className="mt-2">
        Die Europäische Kommission stellt eine Plattform zur
        Online-Streitbeilegung (OS) bereit:{" "}
        <a
          className="text-accent hover:underline"
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noreferrer"
        >
          https://ec.europa.eu/consumers/odr/
        </a>
        .
      </p>
      <p className="mt-3">
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor
        einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </article>
  );
}
