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

## Fonctionnalités

- **Scanner** : caméra (ou photo) → lecture du nom et du numéro de la carte (OCR Tesseract) → carte exacte TCGdex → ajoutée comme possédée avec son prix.
- **Choisir la carte** : liste de toutes les cartes d'un Pokémon, avec aperçu.
- **Prix** : prix moyen Cardmarket (30 jours) à la sélection, bouton « Actualiser les prix ».
- **Tableau de bord** : complétion, progression par génération, cartes les plus chères, courbe de valeur (un point par jour).
- **Tri et filtres** : génération, extension, rareté, possédés, wishlist.
- **Partage** : lien en lecture seule (désactivable).
- **Export CSV** et **impression de la wishlist**.
- **Application installable** sur téléphone (PWA).

## SQL à lancer dans Supabase

1. `schema.sql` (installation initiale)
2. `schema-v2.sql` (historique + partage) — peut être relancé sans risque.