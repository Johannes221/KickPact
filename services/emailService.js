const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.resend.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function formatCent(cent) {
  return (cent / 100).toFixed(2).replace('.', ',') + '€';
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[EMAIL] An: ${to} | Betreff: ${subject}`);
    return;
  }
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@kickpact.de',
    to,
    subject,
    html,
    text,
  });
}

async function sendMatchSummaryEmail(sponsor, team, chargeEvents) {
  const lines = chargeEvents.map(
    (e) => `<li>${e.eventBeschreibung} → <strong>${formatCent(e.betragCent)}</strong></li>`
  ).join('');
  const total = chargeEvents.reduce((s, e) => s + e.betragCent, 0);

  await sendEmail({
    to: sponsor.email,
    subject: `🎉 Neues Spiel bei ${team.name} – KickPact`,
    html: `
      <h2>Neues Spiel bei ${team.name}!</h2>
      <p>Folgende Trigger wurden ausgelöst:</p>
      <ul>${lines}</ul>
      <p><strong>Gesamt diesen Monat wird erhöht um: ${formatCent(total)}</strong></p>
      <p>Abgerechnet wird am 1. des nächsten Monats.</p>
    `,
    text: `Neues Spiel bei ${team.name}. Trigger ausgelöst: ${chargeEvents.map((e) => e.eventBeschreibung).join(', ')}. Gesamt: ${formatCent(total)}`,
  });
}

async function sendMonthlyReceiptEmail(sponsor, charge, team) {
  const lines = charge.events.map(
    (e) => `<li>${e.eventBeschreibung} → ${formatCent(e.betragCent)}</li>`
  ).join('');

  await sendEmail({
    to: sponsor.email,
    subject: `KickPact Monatsabrechnung ${charge.monat} – ${team?.name || 'Deine Mannschaft'}`,
    html: `
      <h2>KickPact Monatsabrechnung ${charge.monat}</h2>
      <p>Mannschaft: <strong>${team?.name || 'Deine Mannschaft'}</strong></p>
      <ul>${lines}</ul>
      <p><strong>Gesamt: ${formatCent(charge.gesamtCent)}</strong></p>
      <p>Davon gehen ${formatCent(charge.nettoVereinCent)} direkt an den Verein. Vielen Dank!</p>
    `,
    text: `KickPact Monatsabrechnung ${charge.monat}. Gesamt: ${formatCent(charge.gesamtCent)}`,
  });
}

async function sendPaymentFailedEmail(sponsor, charge) {
  await sendEmail({
    to: sponsor.email,
    subject: `KickPact: Zahlung fehlgeschlagen – ${charge.monat}`,
    html: `
      <h2>Zahlung fehlgeschlagen</h2>
      <p>Leider konnte die Zahlung für ${charge.monat} nicht durchgeführt werden.</p>
      <p>Bitte aktualisiere deine Zahlungsinformationen in deinem KickPact-Profil.</p>
    `,
    text: `Zahlung für ${charge.monat} fehlgeschlagen. Bitte Zahlungsmethode aktualisieren.`,
  });
}

async function sendManualEventNotification(clubAdmin, event, team) {
  await sendEmail({
    to: clubAdmin.email,
    subject: `KickPact: Manuelles Event zur Freigabe – ${team.name}`,
    html: `
      <h2>Manuelles Event zur Freigabe</h2>
      <p>Ein neues manuelles Event wurde für <strong>${team.name}</strong> eingetragen:</p>
      <p><strong>${event.typ}</strong> – ${event.spielerName || 'Unbekannt'} (Minute ${event.minute || '?'})</p>
      <p><a href="${process.env.BASE_URL}/club/events/manuell">Jetzt freigeben oder ablehnen</a></p>
    `,
    text: `Neues manuelles Event: ${event.typ} von ${event.spielerName}. Bitte freigeben.`,
  });
}

async function sendSponsorEventConfirmationRequest(sponsor, event, team) {
  await sendEmail({
    to: sponsor.email,
    subject: `KickPact: Manuelles Event bestätigen – ${team.name}`,
    html: `
      <h2>Manuelles Event – deine Bestätigung benötigt</h2>
      <p>${team.name} hat ein manuelles Event gemeldet:</p>
      <p><strong>${event.typ}</strong> – ${event.spielerName || 'Unbekannt'} (Minute ${event.minute || '?'})</p>
      <p>Bitte bestätige, ob du dieses Event für deinen Pledge zählen möchtest (du hast 48 Stunden).</p>
      <p><a href="${process.env.BASE_URL}/sponsor/events/manuell">Jetzt antworten</a></p>
    `,
    text: `Manuelles Event bestätigen: ${event.typ} von ${event.spielerName}.`,
  });
}

module.exports = {
  sendEmail,
  sendMatchSummaryEmail,
  sendMonthlyReceiptEmail,
  sendPaymentFailedEmail,
  sendManualEventNotification,
  sendSponsorEventConfirmationRequest,
};
