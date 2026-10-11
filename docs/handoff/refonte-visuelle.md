# Handoff — refonte visuelle ERP-RH

Dernière mise à jour : 2026-10-11.

## Statut

Clôturée le 2026-10-11 après revue Chrome sur `ng serve` (4200), vérification réseau de Paramètres
(`200 application/json`) et CI complète verte (42 E2E frontend, backend, PostgreSQL et backup).

## Objectif

Achever la refonte de l'application entière, dans son identité Staport, avec une interface immersive, premium et responsive.
La clarté de navigation de Codex sert de référence. Les règles métier ne changent pas pendant ce travail.

## Décisions et périmètre

- Parcours : authentification et navigation, Paie, Employés, Chantiers, Fonctions, Équipes, Administration (Utilisateurs,
  Rôles, Paramètres), puis Journal d'audit.
- Connexion, mot de passe oublié et réinitialisation : scène centrée, sans logo, liste de fonctions ni libellé « Espace privé ».
  La photo du chantier routier dans l'Atlas générée pour Staport RH est intégrée comme asset local dans
  `frontend/src/assets/auth/staport-login-atlas.png`.
- Menu latéral desktop iconique sans en-tête de marque ; infobulles et déploiement au survol/focus clavier. Le défilement
  reste possible sans barre visible. Sur écrans compacts, le menu est un tiroir accessible.
- Navigation Chrome sur le `ng serve` lancé par l'utilisateur au port **4200** ; ne pas démarrer Docker ni un autre serveur.
- Après validation complète : commit et push directs sur `main`, sans branche ni PR. Exclure
  `frontend/proxy.conf.js`, dont la cible locale `http://localhost:5001` ne doit pas être publiée.

## Résultat

- La coque Staport, l'authentification, la navigation, les listes, les formulaires, les vues Paie, les états d'erreur et
  les écrans d'administration ont été revus sur `ng serve` dans Chrome.
- La réponse Paramètres est corrigée dans les proxys de développement et de production ; après redémarrage de `ng serve`,
  `GET /parametres` renvoie `200 application/json` et les six réglages s'affichent.
- Les thèmes clair/sombre, le clavier, le responsive, le mouvement réduit et `forced-colors` sont couverts par les contrôles
  automatisés et la revue navigateur.
- Les corrections ont été poussées directement sur `main` ; la CI finale est verte pour les 42 E2E frontend, le backend,
  PostgreSQL et le job de sauvegarde.

## Contrôles réalisés

1. Pousser les correctifs E2E, attendre une CI totalement verte, puis utiliser Chrome pour la revue visuelle finale.
2. Revoir listes, détails, formulaires et vues analytiques/carte disponibles de chaque domaine ; vérifier les états repos, chargement,
   vide, erreur et permission, ainsi que clavier, thèmes, `forced-colors`, mouvement réduit et largeur tactile.
3. Mettre à jour les conventions, README de domaine et TODO après le contrôle achevé.
4. Compiler et exécuter les vérifications frontend, puis `git diff --check`.
5. Inspecter dans Chrome au port 4200 comme toute dernière revue ; corriger et répéter la revue finale si nécessaire.
6. Stage explicitement les fichiers destinés au commit, vérifier que `frontend/proxy.conf.js` est exclu, commit/push sur
   `main`, puis corriger toute défaillance CI jusqu'à ce que les contrôles soient verts.
