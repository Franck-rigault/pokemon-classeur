-- Mise à jour n°2 : historique de la valeur + partage en lecture seule.
-- À coller dans Supabase > SQL Editor > Run (peut être relancé sans risque).

-- Colonnes de la fonction « Choisir la carte » (déjà ajoutées si vous avez lancé le SQL précédent)
alter table pokemon add column if not exists carte_id text;
alter table pokemon add column if not exists image_url text;

-- ---------- Historique de la valeur (un point par jour) ----------
create table if not exists historique (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jour date not null default current_date,
  valeur_possedee numeric(12,2) not null default 0,
  valeur_wishlist numeric(12,2) not null default 0,
  nb_possedes int not null default 0,
  unique (user_id, jour)
);

alter table historique enable row level security;

drop policy if exists "voir son historique" on historique;
drop policy if exists "ajouter son historique" on historique;
drop policy if exists "modifier son historique" on historique;

create policy "voir son historique" on historique
  for select using (auth.uid() = user_id);
create policy "ajouter son historique" on historique
  for insert with check (auth.uid() = user_id);
create policy "modifier son historique" on historique
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Partage en lecture seule ----------
create table if not exists partages (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table partages enable row level security;

drop policy if exists "voir son partage" on partages;
drop policy if exists "creer son partage" on partages;
drop policy if exists "supprimer son partage" on partages;

create policy "voir son partage" on partages
  for select using (auth.uid() = user_id);
create policy "creer son partage" on partages
  for insert with check (auth.uid() = user_id);
create policy "supprimer son partage" on partages
  for delete using (auth.uid() = user_id);

-- Lecture publique, mais uniquement avec le bon jeton, et sans exposer user_id
create or replace function collection_partagee(p_token uuid)
returns table (
  id bigint, numero int, nom text, extension text, numero_carte text, rarete text,
  carte_id text, image_url text, possede boolean, wishlist boolean, valeur numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.numero, p.nom, p.extension, p.numero_carte, p.rarete,
         p.carte_id, p.image_url, p.possede, p.wishlist, p.valeur
  from pokemon p
  join partages s on s.user_id = p.user_id
  where s.token = p_token
  order by p.numero nulls last, p.id;
$$;

revoke all on function collection_partagee(uuid) from public;
grant execute on function collection_partagee(uuid) to anon, authenticated;
