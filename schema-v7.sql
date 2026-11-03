-- Mise à jour n°7 : succès (quêtes) du jeu « Fake Booster ».
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema-v5.sql et schema-v6.sql déjà lancés.

-- Succès déjà récupérés : { "boosters10": "2026-11-03T10:00:00Z", … }
alter table jeu_joueurs add column if not exists succes jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
