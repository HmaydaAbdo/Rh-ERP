---
sidebar_position: 12
---

# Migration des imports fonction et équipe

`POST /functions/import` et `POST /equipes/import` (champ multipart `file`), avec leur modèle vierge
(`GET .../import/modele`), sont portés dans `api/src/staport/domains/{function,equipe}/import_fichier.py`.
Permissions inchangées : `FUNCTION_IMPORT` et `EQUIPE_IMPORT`. Angular n'a pas changé : mêmes URL, mêmes champs,
même lecture du rapport dans le corps d'une réponse 400.

L'import est atomique. Une ligne rejetée refuse tout le fichier : HTTP 400 avec le rapport
(`totalLignes`, `crees`, `ignores`, `lignesIgnorees`), rien n'est créé, l'entrée d'audit est un échec (0 élément,
motif « N ligne(s) rejetée(s) sur M »). Un fichier illisible ou un en-tête inattendu (équipes) donne un 400 d'erreur.
Le journal retient le nom, la taille et l'empreinte SHA-256 du fichier, jamais son contenu.

Écart assumé avec Spring : les numéros de ligne du rapport sont les numéros réels du classeur. Spring itérait les
lignes existantes de POI et décalait la numérotation après une ligne vide.

Preuves : `api/tests/test_import_referentiels.py` (11 tests sur PostgreSQL réel : création, rejet complet avec raisons
dans l'ordre de Spring, fichier illisible, en-têtes, modèles, permissions, audit) et les matrices `test_audit.py` et
`test_auth_acces.py`. Les 14 fichiers de tests Angular des écrans fonction et équipe passent.
