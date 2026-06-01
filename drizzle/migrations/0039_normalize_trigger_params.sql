-- Trigger-Param-Normalisierung (E2E-Finding Staging 2026-06-01) — Daten-Migration.
-- Migration 0039 · 2026-06-01
--
-- Der Pact-Wizard schrieb Parameter in snake_case in
-- `pledge_rules.trigger_params_json`, die Scoring-Engine liest aber camelCase.
-- Folge: goals_scored_min / goal_diff_min feuerten bei JEDEM Spiel (Threshold
-- las als 0), goal_by_player nie (playerName war undefined), und
-- season_table_position verglich gegen fehlende min/maxPosition.
--
-- Ab sofort normalisiert `normalizeTriggerParams` (lib/validations/pledge.ts)
-- beim Speichern. Dieses Backfill zieht die Bestands-Rows auf camelCase nach.
--
-- Jede Umbenennung ist idempotent (WHERE ... ? '<snake_key>') — re-run ist
-- ein No-op, sobald der Key bereits camelCase ist. Reines Daten-Update, kein
-- Schema-Change → kein Snapshot.
UPDATE "pledge_rules"
SET "trigger_params_json" =
  ("trigger_params_json" - 'min_goals')
  || jsonb_build_object('minGoals', "trigger_params_json" -> 'min_goals')
WHERE "trigger_params_json" ? 'min_goals';

UPDATE "pledge_rules"
SET "trigger_params_json" =
  ("trigger_params_json" - 'min_diff')
  || jsonb_build_object('minDiff', "trigger_params_json" -> 'min_diff')
WHERE "trigger_params_json" ? 'min_diff';

UPDATE "pledge_rules"
SET "trigger_params_json" =
  ("trigger_params_json" - 'player_name')
  || jsonb_build_object('playerName', "trigger_params_json" -> 'player_name')
WHERE "trigger_params_json" ? 'player_name';

UPDATE "pledge_rules"
SET "trigger_params_json" =
  ("trigger_params_json" - 'min_pos')
  || jsonb_build_object('minPosition', "trigger_params_json" -> 'min_pos')
WHERE "trigger_params_json" ? 'min_pos';

UPDATE "pledge_rules"
SET "trigger_params_json" =
  ("trigger_params_json" - 'max_pos')
  || jsonb_build_object('maxPosition', "trigger_params_json" -> 'max_pos')
WHERE "trigger_params_json" ? 'max_pos';
