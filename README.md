# Classeur Pokémon

Appli statique (HTML/CSS/JS) + Supabase. Hébergée sur GitHub Pages.

## Mise en route

1. **Supabase** : créer un projet, puis coller `schema.sql` dans SQL Editor > Run.
2. **Compte** : Authentication > Users > Add user (e-mail + mot de passe). Ensuite, désactiver les inscriptions publiques (Settings > Authentication > « Allow new users to sign up »).
3. **Config** : mettre l'URL et la clé `anon public` dans `config.js`.
4. **Import** : exporter la feuille Google Sheets en CSV avec les colonnes `numero,nom,possede,wishlist,valeur` (cases cochées = `true`/`false`), puis Table Editor > `pokemon` > Insert > Import CSV. Renseigner `user_id` (voir ci-dessous).
5. **GitHub** : pousser le dossier, puis Settings > Pages > branche `main`, dossier `/ (root)`.
6. **Supabase** : Authentication > URL Configuration > Site URL = l'adresse GitHub Pages.

## Renseigner user_id après import

```sql
update pokemon set user_id = 'VOTRE-UUID' where user_id is null;
```

L'UUID est visible dans Authentication > Users. Si l'import refuse `user_id` vide, retirer temporairement `not null` :

```sql
alter table pokemon alter column user_id drop not null;
-- import, update ci-dessus, puis :
alter table pokemon alter column user_id set not null;
```

## Test en local

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000
