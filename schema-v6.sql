-- Mise à jour n°6 : pièces du jeu « Fake Booster » (1 pièce gagnée par carte en double, dépensées dans la boutique).
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema-v5.sql déjà lancé.

alter table jeu_joueurs add column if not exists pieces int not null default 0;

notify pgrst, 'reload schema';
