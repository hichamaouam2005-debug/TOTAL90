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

## Version 100 % gratuite (réglage par défaut)

Le site est réglé pour l'offre gratuite d'API-Football (environ 100 requêtes par jour) :

- Les scores du jour sont relevés au maximum une fois toutes les 30 minutes, et partagés entre tous les visiteurs grâce au cache. Le site l'indique clairement sous les scores.
- La page Live réutilise les mêmes données que les matchs du jour, sans requête en plus.
- Les fiches clubs, compétitions et les recherches sont gardées en cache une journée ou une demi-journée.
- L'offre gratuite limite aussi les saisons accessibles. Si la saison en cours n'est pas incluse, le site affiche « Données non incluses dans l'abonnement » au lieu d'inventer quoi que ce soit.

Concrètement : parfait pour tester et montrer le site à quelques personnes. Le jour où vous voulez du vrai direct pour un public, prenez une offre payante et ajoutez dans Netlify la variable `PLAN` avec la valeur `paid` : le site repasse automatiquement en actualisation rapide, sans autre modification.

## Bon à savoir sur les données

- Le cache de Netlify partage chaque réponse entre tous les visiteurs pendant quelques secondes à quelques heures selon le type de données : 1 000 visiteurs sur la page Live ne coûtent qu'une requête toutes les 15 secondes.
- Pour changer de fournisseur, on écrit un nouvel adaptateur dans `netlify/lib/` sur le modèle de `api-football.mjs`, sans toucher au reste du site.

## Feuille de route

- **Étape 1 (livrée)** : identité, accueil, live, matchs, fiches match, club et compétition, pays, recherche, favoris, mobile, backend.
- **Étape 2 (livrée)** : fiches joueurs (matchs, buts, passes décisives, minutes, tirs cadrés, passes réussies, passes clés, dribbles, duels, tacles et interceptions, cartons) sur les 3 dernières saisons, note TOTAL90 sur 10 calculée et documentée, graphiques d'évolution, comparaison de deux joueurs (tableau et radar), meilleures performances par championnat ; statistiques avancées des équipes (forme, domicile/extérieur, buts par période de jeu, matchs sans encaisser ou sans marquer, efficacité offensive et solidité défensive comparées au championnat). La possession moyenne sur une saison n'est pas fournie par le fournisseur : elle reste visible match par match.
- **Étape 3 (livrée)** : actualités automatiques depuis les flux RSS publics de médias reconnus (Maxifoot, L’Équipe, Franceinfo, Le Monde, BBC Sport), avec titre, image, résumé, date, source et lien vers l’article original ; catégories Football, Mercato, Basketball, Tennis, Formule 1, Athlétisme, Sports de combat, Autres ; fil « Pour vous » selon les favoris ; actualités à la une sur l’accueil et sur chaque fiche club. Gratuit, sans consommer le quota API-Football. Les sources se modifient dans `netlify/lib/news.mjs`.
- **Étape 4 (livrée)** : Match Analysis. Sur chaque match à venir, onglet « Probabilités » : victoire, nul, défaite, les deux équipes marquent, plus/moins de 2,5 buts, score le plus probable et scores probables, buts attendus, facteurs (forme, avantage du terrain, attaque, défense, confrontations directes), date de calcul et niveau de confiance. Modèle documenté sur le site : loi de Poisson avec correction de Dixon-Coles, forces d'attaque et de défense rapportées aux moyennes de la compétition, ajustement de forme limité à 10 %. Liste des grands matchs à venir dans la rubrique Analyses.
- **Étape 5 (livrée)** : Basketball (matchs NBA du jour avec score par quart-temps, meilleur marqueur, chaîne, classements des conférences), Tennis (ATP et WTA : tournois du jour, matchs set par set avec jeux décisifs, classements mondiaux), Autres sports (Formule 1 : Grand Prix en cours, résultats des séances et calendrier ; UFC : carte du gala, vainqueurs, méthode de victoire et prochains galas). Source : points d'accès JSON publics d'ESPN, gratuits et sans quota, mais non officiels : s'ils changent, la section concernée affiche « indisponible ». Code dans `netlify/lib/espn.mjs`. Rugby, cyclisme et athlétisme : pas encore de source de résultats gratuite et fiable, ils sont couverts par les Actualités.
- **Étape 6** : référencement, performance, mentions légales, cookies (RGPD) et monétisation.

## Structure

```
public/            le site (HTML, CSS, JavaScript, logos)
netlify/functions/ le backend (/api/...)
netlify/lib/       l'adaptateur du fournisseur de données
netlify.toml       la configuration Netlify
```
