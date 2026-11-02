-- Mise à jour n°5 : jeu « Fake Booster » (ouverture de boosters virtuels).
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema-v3.sql déjà lancé (table profils).

-- ---------- Inventaire du jeu : une seule copie de chaque carte ----------
create table if not exists jeu_cartes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  carte_id text not null,
  set_id text not null,
  nom text not null,
  local_id text,
  image text,
  rarete text,
  valeur numeric(10,2),
  created_at timestamptz not null default now(),
  unique (user_id, carte_id)
);

-- ---------- Compteurs du joueur (limite de 100 boosters par jour) ----------
create table if not exists jeu_joueurs (
  id bigint generated always as identity primary key,
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  jour date not null default current_date,
  paquets_jour int not null default 0,
  paquets_total int not null default 0,
  doublons int not null default 0
);

alter table jeu_cartes enable row level security;
alter table jeu_joueurs enable row level security;

drop policy if exists "voir les cartes du jeu" on jeu_cartes;
drop policy if exists "ajouter une carte du jeu" on jeu_cartes;
drop policy if exists "modifier une carte du jeu" on jeu_cartes;
drop policy if exists "supprimer une carte du jeu" on jeu_cartes;
drop policy if exists "gerer son compteur" on jeu_joueurs;
drop policy if exists "voir les compteurs" on jeu_joueurs;

-- Les comptes connectés peuvent voir l'inventaire de jeu des autres ; chacun n'écrit que le sien
create policy "voir les cartes du jeu" on jeu_cartes
  for select to authenticated using (true);
create policy "ajouter une carte du jeu" on jeu_cartes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "modifier une carte du jeu" on jeu_cartes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer une carte du jeu" on jeu_cartes
  for delete to authenticated using (auth.uid() = user_id);

create policy "voir les compteurs" on jeu_joueurs
  for select to authenticated using (true);
create policy "gerer son compteur" on jeu_joueurs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Classement entre les joueurs (par valeur de l'inventaire) ----------
create or replace function classement_jeu()
returns table (
  user_id uuid, nom text, nb_cartes bigint, valeur numeric,
  meilleure_nom text, meilleure_image text, meilleure_valeur numeric, paquets_total int
)
language sql
security definer
set search_path = public
as $$
  select p.user_id,
         p.nom,
         count(c.id),
         coalesce(sum(c.valeur), 0),
         (array_agg(c.nom order by c.valeur desc nulls last))[1],
         (array_agg(c.image order by c.valeur desc nulls last))[1],
         max(c.valeur),
         coalesce(max(j.paquets_total), 0)
  from profils p
  left join jeu_cartes c on c.user_id = p.user_id
  left join jeu_joueurs j on j.user_id = p.user_id
  group by p.user_id, p.nom
  order by coalesce(sum(c.valeur), 0) desc, count(c.id) desc;
$$;

revoke all on function classement_jeu() from public;
grant execute on function classement_jeu() to authenticated;

notify pgrst, 'reload schema';
