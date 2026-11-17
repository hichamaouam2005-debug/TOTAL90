# TOTAL90 — The world of sports

Étape 1 du projet : la base de la plateforme, avec le football en données réelles.

## Ce que contient l'étape 1

- **Identité TOTAL90** : logo (le « 90 » dans un chronomètre), versions sombre et claire, favicon, couleurs du cahier des charges.
- **Accueil** : matchs en direct, grands matchs du jour, résultats récents, favoris, compétitions populaires.
- **Live** : tous les matchs en cours, scores mis à jour toutes les 30 secondes sans recharger la page.
- **Football** : tous les matchs d'une date (hier, aujourd'hui, demain, ou n'importe quel jour), filtres En direct / Terminés / À venir / Favoris, filtre par pays, compétition ou équipe.
- **Fiche match** : équipes, compétition, date, stade, arbitre, score et minute en direct, buteurs, cartons et remplacements, statistiques (possession, tirs, tirs cadrés, corners…), compositions, face-à-face.
- **Fiche club ou sélection** : infos, forme des 5 derniers matchs, bilan des 10 derniers, prochains matchs, derniers résultats, classement, compétitions, effectif.
- **Compétitions** : les compétitions phares par région (Europe, Amériques, Afrique, Asie, Mondial, Féminin) et tous les championnats du monde classés par pays, avec classements et calendriers.
- **Recherche intelligente** : suggestions pendant la saisie (clubs, sélections, compétitions), et page de résultats complète avec joueurs et entraîneurs.
- **Favoris** : suivre des équipes et des compétitions, retrouvées en priorité partout sur le site.
- **Mobile** : barre de navigation en bas, recherche accessible, cartes compactes.
- **Backend sécurisé** : la clé API n'est jamais envoyée au navigateur, cache intégré pour économiser le quota, messages clairs quand une donnée manque.

Les rubriques Basketball, Tennis, Autres sports, Actualités et Analyses affichent pour l'instant ce qu'elles contiendront et à quelle étape. Aucune donnée n'est inventée nulle part.

## Mise en ligne (environ 20 minutes)

Le glisser-déposer de Netlify ne suffit pas ici, car le site a maintenant un backend. On passe par GitHub, c'est gratuit.

1. **Clé de données** : créez un compte sur dashboard.api-football.com et copiez votre clé API (rubrique Account / My Access).
2. **GitHub** : créez un compte sur github.com, puis un nouveau dépôt (bouton « New », nom `total90`). Sur la page du dépôt, cliquez sur « uploading an existing file » et glissez **le contenu** du dossier `total90` (les dossiers `public`, `netlify` et le fichier `netlify.toml`), puis validez avec « Commit changes ».
3. **Netlify** : sur app.netlify.com, choisissez « Add new project », puis « Import an existing project », puis GitHub, et sélectionnez le dépôt `total90`. Laissez les réglages proposés (ils sont lus dans `netlify.toml`).
4. **La clé** : dans le projet Netlify, ouvrez « Project configuration », puis « Environment variables », ajoutez une variable nommée `API_FOOTBALL_KEY` avec votre clé comme valeur.
5. **Déployez** : onglet « Deploys », puis « Trigger deploy ». Votre site est en ligne à l'adresse en `.netlify.app`.

Pour les mises à jour suivantes : remplacez les fichiers sur GitHub, Netlify redéploie tout seul.

## Bon à savoir sur les données

- L'offre gratuite d'API-Football est limitée (environ 100 requêtes par jour et un accès restreint à certaines saisons). Elle suffit pour tester. Pour un site public avec du direct, il faut une offre payante. Le site affiche un message clair si une donnée n'est pas incluse dans l'abonnement ou si le quota est atteint.
- Le cache de Netlify partage chaque réponse entre tous les visiteurs pendant quelques secondes à quelques heures selon le type de données : 1 000 visiteurs sur la page Live ne coûtent qu'une requête toutes les 15 secondes.
- Pour changer de fournisseur, on écrit un nouvel adaptateur dans `netlify/lib/` sur le modèle de `api-football.mjs`, sans toucher au reste du site.

## Feuille de route

- **Étape 1 (livrée)** : identité, accueil, live, matchs, fiches match, club et compétition, pays, recherche, favoris, mobile, backend.
- **Étape 2** : analyses des joueurs (matchs, buts, passes, minutes, tirs cadrés, passes réussies, dribbles, duels, cartons), note sur 10 calculée et documentée, comparaisons et graphiques ; statistiques avancées des équipes (possession, domicile/extérieur, efficacité, comparaisons).
- **Étape 3** : actualités automatiques depuis des médias reconnus (titre, image, résumé, date, source, lien), par catégorie, et fil personnalisé selon les favoris.
- **Étape 4** : Match Analysis, avec probabilités de victoire, nul, les deux équipes marquent, plus/moins de 2,5 buts, score le plus probable, calculées par un modèle statistique documenté, avec date de calcul, niveau de confiance et facteurs.
- **Étape 5** : basketball, tennis et autres sports avec leurs fournisseurs de données.
- **Étape 6** : référencement, performance, mentions légales, cookies (RGPD) et monétisation.

## Structure

```
public/            le site (HTML, CSS, JavaScript, logos)
netlify/functions/ le backend (/api/...)
netlify/lib/       l'adaptateur du fournisseur de données
netlify.toml       la configuration Netlify
```
