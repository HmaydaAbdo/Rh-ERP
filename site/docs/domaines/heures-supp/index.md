---
title: "Domaine Heures supplémentaires"
sidebar_position: 1
---

## Rôle

Le domaine importe et restitue, par mois et par chantier, les heures supplémentaires et les forfaits des employés.
Il s'appuie sur les domaines Employé, Paie et Chantier pour identifier les personnes, calculer leur taux et qualifier
les STC. Il ne modifie pas les données de Paie.

Les vues sont **Tabulaire**, **Cartes** et **Analytique**. Cartes et Analytique étendent le socle partagé du périmètre et leurs agrégats sont calculés côté Spring.
La vue Tabulaire filtre par période, chantier, équipe, fonction, CIN et nom/prénom. Elle affiche les champs conservés pour le calcul et le suivi métier, dont CIN, S/H, P/H, Montant, statut STC/sortie, STC, Forfait et Net à payer. Le total Net à payer porte sur tout le résultat filtré, indépendamment de la pagination ; le PDF exporte les mêmes lignes et ce total.
L'ajout et la modification utilisent des écrans dédiés, selon le parcours des domaines Paie et Équipe. L'import se fait par un assistant multistep, un chantier à la fois.
Le bouton fractionné « Importer un chantier » de la collection donne aussi accès au modèle Excel avant l'ouverture du wizard.

## Modèle et instantanés

La table `heures_supp` contient une ligne par employé, mois et chantier. La contrainte unique
`(employee_id, periode, chantier_id)` empêche les doublons ; `version` protège les modifications concurrentes.
Chaque ligne référence l'employé, le bulletin du mois, la fonction constatée et le chantier. Elle conserve le
salaire et le type de salaire utilisés, S/H, P/H, Montant, l'indicateur STC/sortie, STC (DH), Forfait et Net à payer.
Le statut paie (STC/sortie) et le type de salaire restent stockés pour le calcul mais ne sont affichés dans aucun écran du module (tableau, fiche d'une ligne) ; le chantier, son filtre et son choix à l'import restent affichés.
Pour un forfait seul, P/H, salaire de référence, type et S/H sont absents et Montant/STC valent zéro. Les lignes
sont auditées dans `heures_supp_aud`.

Les règles de stockage complémentaires (période, non-négativité, précision de P/H, cohérence du forfait avec STC,
relation entre Montant, STC et Net à payer) sont imposées par les contraintes de la migration
`V39__heures_supp_mensuelles.sql`. Les permissions `HEURES_SUP_READ` et `HEURES_SUP_IMPORT` sont ajoutées par V40.

## API et vues

| Route | Contrat |
|---|---|
| `POST /heures-supp/search` | Recherche paginée selon période, chantier, équipe, fonction, CIN et nom ; renvoie les lignes détaillées. |
| `GET /heures-supp/{id}` | Renvoie une ligne pour son écran de modification. |
| `POST /heures-supp/analytique` | Indicateurs et répartitions par chantier, fonction et équipe selon les critères. |
| `PUT /heures-supp/{id}` | Modifie les heures et/ou le forfait d'une ligne, avec contrôle de version et recalcul des montants. |
| `POST /heures-supp` | Ajoute une ligne manuellement à partir d'un employé, d'une paie mensuelle et d'un chantier. |
| `DELETE /heures-supp/{id}` | Supprime une ligne avec audit. |
| `POST /heures-supp/suppression-mois` | Supprime toutes les lignes d'un mois, tous chantiers confondus, si le nombre correspond à celui confirmé. |
| `GET /heures-supp/periodes` | Mois ayant au moins un import. |
| `POST /heures-supp/export/pdf` | Rapport PDF A4 paysage pour UN mois et UN chantier obligatoires (sinon refus) : le mois et le chantier figurent dans l'en-tête et non en colonnes ; classé par employé de A à Z sauf tri explicite ; champ `mode` : `signature` (colonne Émargement étroite, direction) ou `signature_empreinte` (colonne large avec zone d'empreinte) ; totaux de toutes les lignes du périmètre, 5 000 lignes au plus, action d'audit `HEURES_SUP_EXPORT_PDF` (catégorie `ACCES`). |
| `GET /heures-supp/import/prerequis?periode=aaaa-MM&chantierId=…` | Confirme que le mois de paie et le chantier permettent d'ouvrir l'étape du fichier. |
| `GET /heures-supp/import/forfaits-precedents?periode=aaaa-MM&chantierId=…` | Forfaits du dernier mois antérieur ayant des forfaits pour ce chantier, repris à l'étape Forfaits (modifiables, rapprochés par CIN). |
| `GET /heures-supp/import/modele` | Télécharge le modèle Excel `.xlsx`. |
| `POST /heures-supp/import/analyse` | Lit le fichier et les forfaits sans écrire ; retourne lignes, erreurs, calculs et indicateur `pret`. |
| `POST /heures-supp/import/corrections` | Crée les fiches manquantes demandées et renvoie l'analyse actualisée. |
| `POST /heures-supp/import` | Enregistre atomiquement un lot validé. |
| `POST /heures-supp/import/remplacement` | Remplace explicitement les lignes existantes du mois et du chantier ; opération auditée. |

Les routes de lecture exposent les réponses `HeureSuppResponseDto` (identité/CIN, fonction, chantier, période,
salaire de référence, type, S/H, P/H, Montant, marqueur STC/sortie, STC, Forfait, Net à payer) et
`HeuresSuppAnalytiqueDto` (effectif, lignes avec heures, heures, Montant, STC, Forfait et Net à payer, répartitions et définitions).
Les réponses monétaires sont en DH ; les périodes API sont `aaaa-MM`. L'analyse et le résultat final distinguent
les lignes importées, les zéros conservés, les forfaits seuls, remplacements, heures et totaux par grandeur. Les
permissions endpoint par endpoint sont décrites dans [RBAC](droits.md).

Les routes `/heures-supp`, `/heures-supp/cartes` et `/heures-supp/analytique` gardent les filtres dans l'URL.
Tabulaire est la vue détaillée, la vue par défaut, triable sur chaque colonne ; son bouton « Exporter » (présent dans les trois vues, posé à côté d'« Importer » dans l'en-tête) suit les filtres communs, la recherche et le dernier tri de la liste (mois décroissant par défaut). Les colonnes ne passent jamais à la ligne : chacune prend la largeur de son contenu. Les actions de ligne sont des icônes. Cartes et Analytique utilisent les composants partagés, avec le mois et le
périmètre sélectionnés transmis au service du domaine ; aucun jeu d'employés à zéro heure n'est injecté dans Cartes.

## Données d'entrée et provenance

| Donnée | Source et règle |
|---|---|
| Mois | Choisi dans l'assistant. Le mois doit déjà avoir une paie importée avant de commencer l'import des heures supplémentaires. |
| Chantier | Choisi dans l'assistant ; un seul chantier par import. Résolu par le domaine Chantier. |
| CIN | Clé de rapprochement avec l'employé. Un CIN inconnu doit être résolu en créant la fiche Employé selon le parcours de correction de la Paie. |
| Nom et prénom | Colonne obligatoire, utilisée pour contrôler le nom de la fiche trouvée par CIN et demander un alignement explicite en cas d'écart. |
| Fonction, salaire et type de salaire | Récupérés de la fiche Employé alignée sur son état récent de paie ; absents du fichier. Pour un CIN inconnu, le wizard demande les informations nécessaires à la création, dont la fonction. |
| P/H | Nombre d'heures supplémentaires fourni, en heures décimales, avec au plus une décimale ; les valeurs négatives sont refusées. |
| Ligne HS à zéro | Conservée comme ligne d'heures avec P/H = 0, S/H figé et Montant = 0. Son nombre apparaît dans le bilan. Une valeur HS vide reste une erreur, jamais un zéro implicite. |
| S/H | Calculé à chaque nouvel import depuis le salaire et le type de salaire courants de l'employé : salaire journalier ÷ 10 ; salaire mensuel ÷ 26 ÷ 10, **arrondi à l'entier** (pas de virgule : fraction > 0,5 on monte, < 0,5 on descend, exactement 0,5 on descend, soit `HALF_DOWN`). La valeur arrondie est celle qui est conservée avec l'import. |
| Marqueur STC/sortie | Observation du bulletin de Paie de l'employé pour le même mois. Le domaine réutilise la règle Paie `ObservationStc.estStcOuSortie`. |
| Employé STC/sorti | « STC » et « sortie » sont traités de la même façon (le premier a quitté le poste avec démission, le second sans démission). Leurs heures supplémentaires sont **acceptées** (import, ajout, modification) : le Montant passe intégralement en STC (DH) et le Net à payer des heures est nul. Le **forfait** reste interdit. Le bulletin du mois doit exister, sinon la ligne est refusée. |
| Forfait | Montant en DH saisi séparément des heures supplémentaires. Il peut concerner un employé absent du fichier d'heures, mais pas un employé marqué STC/sortie ce mois-là. |

## Grandeurs métier

Les montants sont produits par Spring ; l'assistant IA ne les recalcule pas.

| Grandeur | Définition |
|---|---|
| **S/H** | Salaire horaire issu du salaire et du type de salaire de la fiche Employé au moment de l'import, **entier de dirhams** (arrondi `HALF_DOWN` : 15,49 → 15 ; 15,50 → 15 ; 15,51 → 16). La valeur arrondie est stockée (colonne `s_h` `NUMERIC(10,0)`, migration V43) et le Montant, STC et Net à payer en découlent. |
| **P/H** | Heures supplémentaires du mois, fournies en heures décimales entre 0 inclus et une décimale au plus. |
| **Montant** | `S/H × P/H`, arrondi à l'**entier** de dirhams (`HALF_DOWN`, même règle que S/H). |
| **STC (DH)** | `Montant` (donc le Net à payer des heures est nul) si le bulletin du même mois est marqué exactement « STC » ou « sortie » (casse et espaces extérieurs ignorés) ; sinon `0 DH`. |
| **Forfait** | Montant **entier** en DH, indépendant du **Montant** des heures supplémentaires ; P/H et forfait peuvent coexister sur une même ligne (au moins l'un des deux est renseigné). Interdit si le bulletin de Paie du même mois est marqué STC/sortie. |
| **Net à payer** | `Montant − STC (DH) + Forfait`. |

Une modification ultérieure du salaire ne recalcule pas un import d'heures supplémentaires déjà enregistré. Le taux S/H
retenu est un instantané de la fiche Employé au moment de chaque nouvel import.

## Assistant d'import

Depuis l'écran dédié, les utilisateurs autorisés peuvent ajouter une ligne manuellement en sélectionnant un employé, un mois, un chantier et au moins une valeur (heures ou forfait). La modification a aussi son écran dédié ; elle affiche les informations historiques conservées et permet de modifier les heures et/ou le forfait. Le serveur exige le bulletin de paie de cet employé pour le mois, reprend la fonction et l'observation STC/sortie de ce bulletin et refuse tout doublon employé/mois/chantier.

1. **Mois et chantier** : si aucune paie n'existe pour le mois, bloquer dès cette étape et demander d'importer la paie.
2. **Pointage** : déposer le classeur `.xlsx` avec trois colonnes obligatoires (`Nom et prénom`, `CIN`, `HS`). Le modèle Excel se télécharge depuis le menu d'import de la collection, en dehors du wizard.
3. **Forfaits** : rechercher et choisir un employé, saisir son montant dans une fenêtre, puis vérifier la liste des forfaits. L'employé peut être absent du fichier de pointage.
4. **Contrôle et import** : analyser sans écrire, conserver les lignes HS à zéro, signaler une cellule HS vide et rapprocher les employés par CIN. Après les corrections demandées (alignement explicite ou création de fiche), présenter heures, Montant, STC, Forfaits et Net à payer avant de confirmer l'import atomique. Le forfait d'un employé marqué STC/sortie est refusé ; ses heures supplémentaires sont acceptées et passent en STC.

## Interface et composants partagés

Les trois vues utilisent `app-collection-shell` pour leur titre, leurs onglets, leurs actions et leurs filtres, et `app-collection-table` pour la liste. La barre de filtres reprend la classe partagée `app-toolbar` déjà employée par Paie et Employés; le nom et le CIN se synchronisent après une courte pause de saisie. Les vues Cartes et Analytique réutilisent les composants communs de `portail/perimetre/`; leur configuration de domaine transporte aussi les filtres CIN et nom vers la liste du cockpit de recherche. Les contrôles disponibles dans le catalogue Staport (sélecteurs, nombres, dates, mois, dialogues, boutons, tableau et export PDF) sont réutilisés; seul le récapitulatif statique de l'étape de contrôle utilise le style partagé prévu pour les petits tableaux non interactifs.

Un doublon pour le même employé, le même mois et le même chantier est refusé par défaut ; le remplacement possède une action et une trace d'audit distinctes. Une ligne peut être modifiée sous contrôle de version ou supprimée à l'unité. La purge d'un mois requiert la permission dédiée, la saisie du nombre de lignes à supprimer et une confirmation serveur du même compte ; elle couvre tous les chantiers du mois et conserve les instantanés Envers. Un employé marqué STC/sortie ne peut avoir de forfait pour ce mois, tous chantiers confondus.

### Classeur reçu

Le fichier `ETAT_pointage_heure_sup.xlsx` a une feuille avec les colonnes attendues. Il contient 864 lignes à zéro (conservées), 120 lignes positives et une ligne sans valeur HS à la ligne Excel 986. Cette ligne (« Visa comptable ») a été supprimée du classeur d'exemple (décision KAN-169) ; le lecteur ne convertit toujours pas une cellule vide en zéro.

## IA et MCP

L'assistant IA accède aux capacités publiées du domaine par MCP, derrière les façades métier Spring et les permissions
du domaine. Les outils décrivent chaque champ avec sa source, sa période, son unité et sa définition. Ils renvoient
les montants calculés par Spring ; aucun outil ne donne accès aux repositories ou à du SQL générique.

Outils publiés : `heures_supp_periodes` (mois importés), `heures_supp_import_prerequis` (contrôle sans écriture du mois et du chantier),
`heures_supp_indicateurs` (indicateurs et répartitions filtrables par chantier, équipe, fonction, CIN ou nom) et
`heures_supp_rechercher` (lignes détaillées, pages accessibles sans plafond). Les montants viennent de Spring ; les répartitions
ne sont pas tronquées. Les trois outils de consultation exigent `IA_UTILISER`, `HEURES_SUP_READ` et `PAIE_READ` ; le précontrôle
d'import exige `IA_UTILISER`, `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ`. Aucun outil MCP ne lit un classeur ni n'effectue
une écriture. Le détail des cas d'usage et de la gouvernance est dans [docs/ia.md](../../ia/vue-d-ensemble.md).

## Scénarios couverts par les tests

- `CalculHeuresSuppTest` : S/H journalier et mensuel arrondi à l'entier (frontières x,49 / x,50 / x,51, 0,5 exact vers le bas), Montant calculé sur le S/H arrondi et arrondi à l'entier (`HALF_DOWN`), STC et Net, tous entiers.
- `LecteurFichierHeuresSuppTest` : format du classeur, ligne zéro conservée, cellule HS vide, doublon CIN, valeurs négatives/précision et fichier invalide.
- `HeuresSuppImportServiceTest` : prérequis mois/chantier, analyse sans écriture, paie exigée par employé, snapshot, arrondi du S/H aux frontières, employé STC/sorti (heures acceptées, Montant en STC, Net à payer nul), forfait STC et doublon de forfait.
- `EcouteurPaieHeuresSuppTest` : recalcul STC/forfait/net à la modification d'une paie et refus de suppression d'un bulletin lié.
- `HeuresSuppServiceTest` : ajout et modification unitaires (bulletin absent, doublon, S/H arrondi, heures acceptées pour un bulletin STC/sorti, forfait STC refusé).
- `HeuresSuppAnalytiqueServiceTest` : agrégats, groupes et périodes.
- `EndpointSecurityTest`, `OpenApiContractTest` et `McpOutilsLectureIntegrationTest` : permissions, contrats HTTP/OpenAPI et outils MCP.
- Tests Angular du module, du service, du wizard, de la liste et de la coque des vues : filtres, erreurs, contrôles de l'assistant et paramètres URL.
- `frontend/e2e/full-stack.spec.ts` : création des données métier, prérequis, import Excel réel, recherche, agrégats et ouverture de la vue.

## Limites métier à arbitrer

Décisions du propriétaire (KAN-169) :

- **Bornes** : aucune borne métier sur les heures ni sur les forfaits (seules les limites techniques s'appliquent).
- **Employé STC/sorti** : ses heures sont acceptées (voir ci-dessus) ; aucun contrôle de rattachement de l'employé au chantier choisi.
- **Paie modifiée après l'import** : les lignes liées suivent le marqueur STC/sortie du bulletin
  (`EcouteurPaieHeuresSupp`, dans la transaction de la paie). Si la paie devient STC/sortie, le Montant passe en
  STC (DH), le **forfait est annulé** (interdit en STC) et le Net à payer est recalculé ; si elle ne l'est plus,
  STC retombe à 0 et le Net à payer reprend le Montant. Salaire, S/H, heures et fonction de la ligne restent figés.
- **Paie supprimée** (unitaire ou par groupe) : la suppression est **refusée** (409) tant qu'une ligne d'heures
  supplémentaires s'appuie sur le bulletin ; supprimez d'abord ces lignes.

## Guide agent

Lire les règles métier et le modèle de données dans [README.md](index.md), puis les permissions dans
[`docs/rbac/heures-supp.md`](droits.md). Lire aussi le README et le skill Paie pour son assistant
d'import, sa règle STC et ses contrats, ainsi que les conventions de base de données, audit, sécurité, frontend et MCP.

Consulter la tâche Jira KAN-169 avant de modifier une règle encore ouverte. Pour une modification du domaine, maintenir
les scénarios exécutables du README et les portes de couverture backend/frontend. Les règles IA, données autorisées et
outils MCP sont décrits dans [docs/ia.md](../../ia/vue-d-ensemble.md) ; ne pas ajouter de calcul IA ni d'accès direct aux repositories.

Le domaine identifie les employés par CIN, exige une paie du même mois, importe par chantier, conserve les taux calculés
à l'import, et distingue Montant, STC (DH), Forfait et Net à payer. S/H est un entier de dirhams (arrondi HALF_DOWN, valeur stockée). Un employé dont le bulletin du mois est STC/sortie (même traitement) garde ses heures, dont le Montant passe en STC (DH) ; son forfait est interdit : réutiliser `ObservationStc.estStcOuSortie`. Ses capacités IA passent par MCP, avec définitions
et unités explicites ; Spring reste la source de tous les calculs.

Une ligne par employé, mois et chantier : toute création ou import qui la dupliquerait est refusé avec le message « Une ligne existe déjà pour cet employé, ce mois et ce chantier ». La recherche employé (champ unique) cherche chaque mot dans le nom, le prénom et le CIN, dans n'importe quel ordre.
