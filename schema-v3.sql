-- Mise à jour n°3 : application multi-utilisateurs (collection complète, wishlist par carte, profils).
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema.sql et schema-v2.sql déjà lancés.

-- ---------- Profils ----------
create table if not exists profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  classeur_actif boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profils enable row level security;

drop policy if exists "voir les profils" on profils;
drop policy if exists "modifier son profil" on profils;

create policy "voir les profils" on profils
  for select to authenticated using (true);
create policy "modifier son profil" on profils
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chacun peut changer son nom ; seul le propriétaire de la base active le classeur (via SQL)
revoke update on profils from authenticated;
grant update (nom) on profils to authenticated;

-- Profil créé automatiquement pour chaque nouveau compte
create or replace function nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profils (user_id, nom)
  values (new.id, initcap(split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sur_nouvel_utilisateur on auth.users;
create trigger sur_nouvel_utilisateur after insert on auth.users
  for each row execute function nouveau_profil();

-- Comptes déjà existants : le plus ancien (le vôtre) reçoit le classeur
insert into profils (user_id, nom, classeur_actif)
select u.id, initcap(split_part(u.email, '@', 1)),
       u.id = (select id from auth.users order by created_at limit 1)
from auth.users u
on conflict (user_id) do nothing;

-- ---------- Collection : une ligne par carte, état et variante ----------
create table if not exists collection (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  carte_id text not null,            -- identifiant TCGdex, ex. sv04.5-018
  set_id text not null,              -- ex. sv04.5
  nom text not null,
  local_id text not null,            -- numéro imprimé, ex. 018
  categorie text,                    -- Pokémon / Dresseur / Énergie
  rarete text,
  image text,                        -- adresse de base de l'image TCGdex (sans /low.webp)
  dex_ids int[] not null default '{}',
  valeur numeric(10,2),              -- prix moyen Cardmarket (30 jours) à la dernière actualisation
  quantite int not null default 1 check (quantite >= 1),
  etat text not null default 'Neuf',
  variante text not null default 'Normale',
  prix_achat numeric(10,2),
  created_at timestamptz not null default now(),
  unique (user_id, carte_id, variante, etat)
);

create index if not exists collection_user_set_idx on collection (user_id, set_id);

alter table collection enable row level security;

drop policy if exists "voir les collections" on collection;
drop policy if exists "ajouter a sa collection" on collection;
drop policy if exists "modifier sa collection" on collection;
drop policy if exists "supprimer de sa collection" on collection;

-- Lecture ouverte aux comptes connectés (consulter la collection de l'autre) ; écriture : la sienne seulement
create policy "voir les collections" on collection
  for select to authenticated using (true);
create policy "ajouter a sa collection" on collection
  for insert to authenticated with check (auth.uid() = user_id);
create policy "modifier sa collection" on collection
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer de sa collection" on collection
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- Wishlist : une ligne par carte recherchée ----------
create table if not exists souhaits (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  carte_id text not null,
  set_id text not null,
  nom text not null,
  local_id text not null,
  categorie text,
  rarete text,
  image text,
  valeur numeric(10,2),
  created_at timestamptz not null default now(),
  unique (user_id, carte_id)
);

alter table souhaits enable row level security;

drop policy if exists "voir les souhaits" on souhaits;
drop policy if exists "ajouter un souhait" on souhaits;
drop policy if exists "modifier ses souhaits" on souhaits;
drop policy if exists "supprimer un souhait" on souhaits;

create policy "voir les souhaits" on souhaits
  for select to authenticated using (true);
create policy "ajouter un souhait" on souhaits
  for insert to authenticated with check (auth.uid() = user_id);
create policy "modifier ses souhaits" on souhaits
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer un souhait" on souhaits
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- Reprise de vos cartes déjà choisies dans le classeur ----------
-- (les détails manquants — nom exact, type, rareté — sont complétés par l'appli au premier chargement)
insert into collection (user_id, carte_id, set_id, nom, local_id, rarete, image, dex_ids, valeur)
select p.user_id,
       p.carte_id,
       regexp_replace(p.carte_id, '-[^-]*$', ''),
       p.nom,
       substring(p.carte_id from '[^-]*$'),
       p.rarete,
       regexp_replace(p.image_url, '/low\.webp$', ''),
       case when p.numero is null then '{}'::int[] else array[p.numero] end,
       nullif(p.valeur, 0)
from pokemon p
where p.possede and p.carte_id is not null
on conflict do nothing;

-- ---------- Partage public (lien) : désormais la collection complète ----------
drop function if exists collection_partagee(uuid);

create or replace function cartes_partagees(p_token uuid)
returns table (
  id bigint, carte_id text, set_id text, nom text, local_id text, categorie text, rarete text,
  image text, dex_ids int[], valeur numeric, quantite int, etat text, variante text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.carte_id, c.set_id, c.nom, c.local_id, c.categorie, c.rarete,
         c.image, c.dex_ids, c.valeur, c.quantite, c.etat, c.variante
  from collection c
  join partages s on s.user_id = c.user_id
  where s.token = p_token
  order by c.set_id, c.local_id, c.id;
$$;

revoke all on function cartes_partagees(uuid) from public;
grant execute on function cartes_partagees(uuid) to anon, authenticated;
