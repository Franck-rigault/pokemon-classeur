-- À coller dans Supabase > SQL Editor > Run

create table if not exists pokemon (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero int,
  nom text not null,
  extension text,
  numero_carte text,
  rarete text,
  possede boolean not null default false,
  wishlist boolean not null default false,
  valeur numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pokemon_user_numero_idx on pokemon (user_id, numero);

alter table pokemon enable row level security;

create policy "voir ses cartes" on pokemon
  for select using (auth.uid() = user_id);
create policy "ajouter ses cartes" on pokemon
  for insert with check (auth.uid() = user_id);
create policy "modifier ses cartes" on pokemon
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer ses cartes" on pokemon
  for delete using (auth.uid() = user_id);
