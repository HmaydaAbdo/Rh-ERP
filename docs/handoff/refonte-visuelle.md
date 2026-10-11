# Handoff — refonte visuelle ERP-RH

Dernière mise à jour : 2026-10-11.

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

## Avancement à la reprise

- Les changements de la passe en cours sont dans le working tree. Ils touchent la coque globale, l'authentification, les
  écrans de liste, les tableaux partagés, les états de Paramètres et leur documentation.
- Paie avait déjà reçu une première revue navigateur. La refonte reste ouverte tant que les autres domaines et les états
  restants n'ont pas été audités.
- Les tentatives de build Angular locales restent sans sortie pendant plus de 90 secondes et ont dû être interrompues.
  Le CLI répond à `ng version`; la CI GitHub devra fournir le verdict de compilation/tests après le push.
- La photo et le cadrage de l'authentification, la navigation, les vues métier, le responsive, le clavier et les deux thèmes
  doivent être vérifiés dans Chrome **à la fin**, après les corrections de code.

## Contrôle de clôture

1. Revoir listes, détails, formulaires et vues analytiques/carte de chaque domaine ; vérifier les états repos, chargement,
   vide, erreur et permission, ainsi que clavier, thèmes, `forced-colors`, mouvement réduit et largeur tactile.
2. Mettre à jour les conventions, README de domaine et TODO ; ne retirer « Refonte visuelle » du TODO qu'une fois ce contrôle
   achevé.
3. Compiler et exécuter les vérifications frontend, puis `git diff --check`.
4. Inspecter dans Chrome au port 4200 comme toute dernière revue ; corriger et répéter la revue finale si nécessaire.
5. Stage explicitement les fichiers destinés au commit, vérifier que `frontend/proxy.conf.js` est exclu, commit/push sur
   `main`, puis corriger toute défaillance CI jusqu'à ce que les contrôles soient verts.
