const PDFDocument = require('pdfkit');

function numberToWords(num) {
  const ones = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun',
    'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
  const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

  if (num === 0) return 'null';
  if (num < 20) return ones[num];
  if (num < 100) return ones[num % 10] ? ones[num % 10] + 'und' + tens[Math.floor(num / 10)] : tens[Math.floor(num / 10)];
  if (num < 1000) return ones[Math.floor(num / 100)] + 'hundert' + (num % 100 ? numberToWords(num % 100) : '');
  return num.toString();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatAmountInWords(cent) {
  const euros = Math.floor(cent / 100);
  const cents = cent % 100;
  let result = capitalize(numberToWords(euros)) + ' Euro';
  if (cents > 0) result += ` und ${cents} Cent`;
  return result;
}

function generateQuittung(res, { club, sponsor, charge, monat }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="quittung-${monat}-${sponsor.name.replace(/\s+/g, '-')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(10).font('Helvetica');

  doc.fontSize(16).font('Helvetica-Bold').text('ZUWENDUNGSBESTÄTIGUNG', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('über Geldzuwendungen im Sinne des § 10b EStG', { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(10).font('Helvetica-Bold').text('Aussteller (Zuwendungsempfänger):');
  doc.font('Helvetica').text(club.name);
  if (club.adresse) doc.text(club.adresse);
  if (club.steuernummer) doc.text(`Steuernummer: ${club.steuernummer}`);
  if (club.freistellungDatum) doc.text(`Freistellungsbescheid vom: ${club.freistellungDatum}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Bestätigung:');
  doc.font('Helvetica').text(
    `Wir bestätigen, dass die nachfolgende Zuwendung zur Förderung des Sports verwendet wird ` +
    `und der Verein nach dem letzten uns zugegangenen Steuerbescheid (bzw. Freistellungsbescheid) ` +
    `des Finanzamts als gemeinnützig anerkannt ist.`
  );
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Zuwendender:');
  doc.font('Helvetica').text(sponsor.name);
  if (sponsor.adresse) doc.text(sponsor.adresse);
  doc.moveDown();

  const betragEuro = (charge.gesamtCent / 100).toFixed(2);
  doc.font('Helvetica-Bold').text('Betrag der Zuwendung:');
  doc.font('Helvetica').text(`${betragEuro} EUR`);
  doc.text(`in Worten: ${formatAmountInWords(charge.gesamtCent)}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Art der Zuwendung:');
  doc.font('Helvetica').text('Geldspende (performance-gebunden)');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Datum der Zuwendung:');
  const date = new Date();
  doc.font('Helvetica').text(`${date.toLocaleDateString('de-DE')} (Sammelzeitraum ${monat})`);
  doc.moveDown(2);

  doc.font('Helvetica-Bold').text('Hinweis:');
  doc.font('Helvetica').fontSize(9).text(
    'Es handelt sich nicht um den Verzicht auf Erstattung von Aufwendungen. ' +
    'Es wird bestätigt, dass die Zuwendung nicht für Leistungen oder Lieferungen an den Zuwendenden erbracht wurde.'
  );
  doc.moveDown(2);

  doc.fontSize(10).font('Helvetica').text('_________________________________');
  doc.text(`${club.name}, ${new Date().toLocaleDateString('de-DE')}`);
  doc.text('(Unterschrift und Stempel)');

  doc.fontSize(8).font('Helvetica').text(
    '\nHinweis: Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung ausstellt oder wer veranlasst, ' +
    'dass Zuwendungen nicht zu den in der Bestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG).',
    { align: 'left' }
  );

  doc.end();
}

module.exports = { generateQuittung };
