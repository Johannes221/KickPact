-- Paket I / Sommerpause-Logik
-- Neues boolean-Flag auf pledges: sommerpause_paused.
-- Wird vom Sommerpause-Cron (1.6.) auf TRUE gesetzt wenn der Pledge aktiv war.
-- Der Resume-Cron (1.8.) setzt ihn zurück auf FALSE und reaktiviert den Pledge.
-- Sponsor-manuell-pausierte Pledges haben dieses Flag NICHT gesetzt und werden
-- vom Resume-Cron daher NICHT wieder aktiviert — keine ungewollten Reaktivierungen.
-->
ALTER TABLE "pledges" ADD COLUMN "sommerpause_paused" boolean DEFAULT false NOT NULL;
