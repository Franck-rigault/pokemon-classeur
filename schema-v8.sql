-- Mise à jour n°8 : favoris, notes, achats, préférences, journal, photos de ses cartes, duels du jeu.
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema-v3.sql à schema-v7.sql déjà lancés.

-- ---------- Collection : favori, note personnelle, fiche d'achat ----------
alter table collection add column if not exists favori boolean not null default false;
alter table collection add column if not exists note text;
alter table collection add column if not exists boutique text;
alter table collection add column if not exists date_achat date;
alter table collection add column if not exists facture text;      -- lien vers la facture ou la commande

alter table produits add column if not exists boutique text;
alter table produits add column if not exists facture text;

-- ---------- Préférences (objectifs, vues enregistrées…) : une ligne par compte ----------
create table if not exists preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  donnees jsonb not null default '{}'::jsonb,
  maj timestamptz not null default now()
);

-- ---------- Journal d'activité ----------
create table if not exists journal (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  action text not null,               -- ajout, retrait, quantite, wishlist, scelle…
  carte_id text,
  libelle text not null,
  quantite int
);
create index if not exists journal_user_date_idx on journal (user_id, created_at desc);

-- ---------- Photos de ses propres cartes (petites images JPEG, chargées à la demande) ----------
create table if not exists photos_cartes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id bigint not null references collection(id) on delete cascade,
  data text not null,
  created_at timestamptz not null default now()
);
create index if not exists photos_cartes_ligne_idx on photos_cartes (collection_id);

-- ---------- Duels de Fake Booster : chacun ouvre un booster, la meilleure carte gagne ----------
create table if not exists jeu_duels (
  id bigint generated always as identity primary key,
  createur uuid not null default auth.uid() references auth.users(id) on delete cascade,
  adversaire uuid not null references auth.users(id) on delete cascade,
  ext_id text not null,
  cartes_createur jsonb not null,
  score_createur numeric not null default 0,
  cartes_adversaire jsonb,
  score_adversaire numeric,
  statut text not null default 'attente',   -- attente | termine
  gagnant uuid,                             -- null = égalité
  recompense_createur boolean not null default false,
  recompense_adversaire boolean not null default false,
  created_at timestamptz not null default now(),
  termine_le timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['preferences', 'journal', 'photos_cartes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "proprietaire" on %I', t);
    execute format(
      'create policy "proprietaire" on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

alter table jeu_duels enable row level security;
drop policy if exists "voir ses duels" on jeu_duels;
drop policy if exists "lancer un duel" on jeu_duels;
drop policy if exists "jouer un duel" on jeu_duels;
drop policy if exists "supprimer son duel" on jeu_duels;
create policy "voir ses duels" on jeu_duels
  for select to authenticated using (auth.uid() = createur or auth.uid() = adversaire);
create policy "lancer un duel" on jeu_duels
  for insert to authenticated with check (auth.uid() = createur and createur <> adversaire);
create policy "jouer un duel" on jeu_duels
  for update to authenticated using (auth.uid() = createur or auth.uid() = adversaire)
  with check (auth.uid() = createur or auth.uid() = adversaire);
create policy "supprimer son duel" on jeu_duels
  for delete to authenticated using (auth.uid() = createur);

notify pgrst, 'reload schema';
