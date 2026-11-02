-- Mise à jour n°4 : rangement, cartes gradées, détails de cartes (filtres), produits scellés,
-- journal d'ouverture de boosters, classeurs virtuels.
-- À coller dans Supabase > SQL Editor > Run. Peut être relancé sans risque.
-- Prérequis : schema.sql, schema-v2.sql et schema-v3.sql déjà lancés.

-- ---------- Collection : nouveaux champs ----------
alter table collection
  add column if not exists emplacement text,              -- ex. « Classeur rouge, page 12 »
  add column if not exists grade_societe text,            -- PSA, CGC, BGS… (cartes gradées)
  add column if not exists grade_note numeric(3,1),       -- note de gradation
  add column if not exists types text[] not null default '{}',
  add column if not exists illustrateur text,
  add column if not exists pv int,
  add column if not exists stade text,
  add column if not exists complet boolean not null default false; -- vrai quand tous les détails sont renseignés

-- Une même carte peut maintenant exister en plusieurs lignes : état, gradation ou emplacement différents
alter table collection drop constraint if exists collection_user_id_carte_id_variante_etat_key;

create unique index if not exists collection_ligne_unique on collection (
  user_id, carte_id, variante, etat,
  coalesce(grade_societe, ''), coalesce(grade_note, -1), coalesce(emplacement, '')
);

-- ---------- Produits scellés ----------
create table if not exists produits (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null,
  type text not null default 'Booster',      -- Booster, Display, Coffret, ETB, Deck, Autre
  set_id text,
  quantite int not null default 1 check (quantite >= 0),
  prix_achat numeric(10,2),                  -- par unité
  valeur numeric(10,2),                      -- valeur actuelle par unité (saisie à la main)
  date_achat date,
  emplacement text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Journal d'ouverture de boosters ----------
create table if not exists ouvertures (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  set_id text not null,
  date date not null default current_date,
  nb_boosters int not null default 1 check (nb_boosters >= 1),
  cout numeric(10,2),                        -- coût total des boosters ouverts
  cartes jsonb not null default '[]',        -- [{ id, nom, rarete, valeur, qte }]
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Classeurs virtuels ----------
create table if not exists classeurs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null,
  lignes int not null default 3 check (lignes between 1 and 6),
  colonnes int not null default 3 check (colonnes between 1 and 6),
  pages int not null default 10 check (pages >= 1),
  created_at timestamptz not null default now()
);

create table if not exists classeur_cases (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  classeur_id bigint not null references classeurs(id) on delete cascade,
  page int not null,
  position int not null,
  carte_id text,
  set_id text,
  nom text,
  local_id text,
  image text,
  rarete text,
  valeur numeric(10,2),
  unique (classeur_id, page, position)
);

-- ---------- Droits : ces quatre tables sont privées (chacun ne voit que les siennes) ----------
do $$
declare t text;
begin
  foreach t in array array['produits', 'ouvertures', 'classeurs', 'classeur_cases'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "proprietaire" on %I', t);
    execute format(
      'create policy "proprietaire" on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
