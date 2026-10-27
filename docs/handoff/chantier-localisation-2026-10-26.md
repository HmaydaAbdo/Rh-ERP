# Chantier — qualification et localisation

## Décisions métier confirmées

- Chaque création et modification manuelle exige une nature et une valeur explicite pour « Afficher sur la carte ».
- Natures : `AO`, `DEPOT`, `EMULSION`, `CONCASSAGE`, `POSTE_ENROBE`, `CENTRALE_A_BETON`.
- Les fiches issues de l’ERP peuvent rester sans nature et ne sont pas publiées sur la carte avant qualification manuelle. La synchronisation ERP conserve les champs locaux.
- La carte n’affiche que les fiches avec `afficherSurCarte=true`. Cette option exige nature, localisation, latitude et longitude ; elle est indépendante du statut actif.
- La localisation peut être saisie avec des coordonnées ou un lien Google Maps qui expose explicitement les coordonnées. L’application extrait les coordonnées sans géocodage réseau et produit un lien canonique. Les coordonnées peuvent également être fournies seules. Les liens courts ou adresses sans coordonnées explicites sont refusés. Une paire est validée dans les bornes géographiques et à huit décimales au plus.
- Les positions de même valeur sont réunies dans une fiche de marqueur listant chaque chantier.
- Présentation `/carte` (2026-10-27) : carte MapLibre intégrée, barre compacte bleu nuit en haut à gauche, filtre multi-sélection Nature et compteur court ; aucun panneau de liste ni lien sortant Google Maps. Le filtre n'affecte pas le fond (Plan par défaut, Satellite, Relief) ni ses contrôles.

## Reprise du classeur

Fichier fourni : `Chantiers_Maroc.xlsx`, SHA-256 `415cde6d0f9120ea648485fc7735d97c95d844241a27a03dfe832cdac69679ba`.

Le classeur contient 27 codes déjà présents dans le référentiel et 26 paires de coordonnées. La migration `V38__reprise_qualification_chantiers.sql` reprend les natures, noms et positions explicites ; elle ne crée aucune fiche, ne modifie aucun statut, préserve toute qualification déjà saisie et n’invente pas la localisation manquante de `C163`.

Le propriétaire a explicitement exclu de la carte les huit codes suivants, même lorsqu’une position existe : `C163`, `C085`, `C125`, `C167`, `C176B`, `C177`, `C184A`, `CONAKRY`. La reprise les qualifie mais laisse leur indicateur à `false`. Les 19 autres entrées sont marquées pour affichage. Les positions restent disponibles pour une activation ultérieure.

La migration `V37__chantier_nature_et_localisation.sql` ajoute les champs et contraintes SQL ; la révision Envers reçoit les colonnes sans réécriture des révisions historiques. V38 inscrit la reprise dans Envers et le journal d’audit. Elle n’est pas réexécutée dans une base appliquée ; son garde-fou préserve les fiches déjà qualifiées.

## Livraison et vérifications locales

- Branche isolée : `codex/chantier-localisation`.
- Le lot est local et non commité ; aucune CI, poussée, PR ou migration de production n’a été déclenchée.
- Thème global (2026-10-27) : surfaces sombres en bleu nuit/noir, actions bleues, focus cyan ; les statuts métier gardent leurs couleurs sémantiques et le thème clair reste séparé. La feuille de conventions et le README frontend sont synchronisés. La popover du filtre carte suit elle aussi le thème de la carte, sans modifier les autres sélecteurs.
- V37 et V38 ont été jouées sur une copie jetable de la base de développement. Comparaison des 212 codes : aucun statut modifié ; les versions augmentent uniquement pour les lignes reprises. Audit V38 à 27 éléments et rejeu sans doublon vérifiés.
- Aucun champ métier ni aucune donnée de localisation n’a été écrit dans la base source.
- Build Angular de production terminé avec succès, y compris après l’ajustement de la barre compacte (2026-10-27). Restent les avertissements CommonJS `semver` et `partial-json` de CopilotKit.
- Tests frontend : 89 tests unitaires antérieurs passent dans 11 fichiers ; 37 tests ciblés du style de carte et des marqueurs passent dans 2 fichiers. Le serveur Vitest journalise aussi une erreur de lecture de l'archive de carte de 3,7 Go (>2 Gio), mais la commande termine avec code 0 et les tests sont tous verts. Playwright carte Nature compacte passe sur desktop et mobile (2/2), avec capture relue en thème sombre global. Parcours Playwright antérieurs de création, carte, édition et retrait passaient également.
- Contrôles UI transverses : 18 E2E catalogue, authentification et responsive passent, incluant axe en thèmes clair/sombre, clavier, forced-colors et cibles tactiles. Build Angular de production réussi ; seuls les avertissements CommonJS CopilotKit `semver` et `partial-json` sont signalés.
- Tests backend ciblés : 102 tests passent au total, dont les six tests PostgreSQL de qualification, contraintes, audit et reprise, les 24 cas d’analyse de lien/coordonnées, les permissions, les conventions d’architecture et le contrat OpenAPI.
- Avertissements observés dans le serveur Angular de développement : l’inspecteur CopilotKit signale `COPILOT_KIT_CONFIG` absent. Il est préexistant et hors du domaine Chantier ; le parcours E2E passe malgré cet avertissement. Le build de production réussit.

## Suite

Revoir le diff, puis intégrer par la PR exigée vers `main`. Après revue et demande explicite, exécuter la CI. La migration de production nécessite la sauvegarde et la procédure de déploiement documentées ; aucune migration réelle n’a été appliquée.
