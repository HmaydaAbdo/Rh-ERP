# Contrats Paie

Les routes et règles d'utilisation sont dans [le README](README.md). Les contrats d'export PDF et
Excel sont dans [Rapport](../report/README.md). Les types ci-dessous décrivent les corps JSON : les
identifiants et versions sont des entiers sur 64 bits; les montants et quantités sont des nombres
décimaux; une période est une chaîne `aaaa-MM`.

## Saisie et réponse d’un bulletin

| Champ | Type JSON et contrainte | Description |
|---|---|---|
| `employeeId` | `integer(int64)`, obligatoire en création | Employé existant. Ce champ est absent de la modification. |
| `periode` | `string`, obligatoire en création, `aaaa-MM` | Mois du bulletin. Absent de la modification; unique avec l'employé. |
| `version` | `integer(int64)`, obligatoire en modification | Version reçue à la lecture. Une version périmée entraîne `409`. Absent de la création. |
| `fonctionId` | `integer(int64)`, obligatoire | Fonction existante du bulletin. |
| `chantierId` | `integer(int64)`, obligatoire | Chantier existant du bulletin. |
| `equipeId` | `integer(int64)|null` | Équipe existante; `null` signifie sans équipe. La valeur synthétique de filtre `0` n'est pas une référence. |
| `nombreJoursTravailles` | `number`, obligatoire, 0 à 999,99, deux décimales au plus | Quantité travaillée. |
| `joursRecuperationOuvrable` | `number|null`, 0 à 999,99, deux décimales au plus | Jours de récupération ouvrables. |
| `joursRecuperationDimanche` | `number|null`, 0 à 999,99, deux décimales au plus | Jours de récupération du dimanche. |
| `salaireMensuel` | `number`, obligatoire, 0 à 99 999 999,99, deux décimales au plus | Salaire de base ou tarif journalier selon la situation. L'import refuse zéro. |
| `primeRoulageOrdinaire` | `number|null`, mêmes bornes et précision que le salaire | Prime ordinaire. |
| `primeRoulageDimanche` | `number|null`, mêmes bornes et précision que le salaire | Prime dimanche. |
| `salaireTotal` | `number`, obligatoire, mêmes bornes et précision que le salaire | Total repris tel quel, jamais calculé par le backend. |
| `observation` | `string|null`, 255 caractères au plus | Note du bulletin; `STC` et `sortie` identifient les lignes correspondantes dans les indicateurs. |

Ces champs forment `PaieCreateRequestDto` et `PaieUpdateRequestDto`. Une validation invalide est
refusée en `400`; les références inconnues suivent le même refus. Un doublon employé/mois est
refusé en `409`.

`PaieResponseDto` restitue `id`, `version`, `periode` et les mêmes champs décimaux/observation.
Les références y sont développées :

| Champ de réponse | Structure | Description |
|---|---|---|
| `employee` | `{ id: integer, nomPrenom: string, cin: string }` | Identité de l'employé. |
| `fonction` | `{ id: integer, libelle: string }` | Fonction du bulletin. |
| `chantier` | `{ id: integer, code: string, designation: string|null }` | Chantier du bulletin. |
| `equipe` | `{ id: integer, code: string, libelle: string }|null` | Équipe du bulletin ou absence d'équipe. |

## Recherche, options et suppression

| Contrat | Champs, types et contraintes | Description |
|---|---|---|
| `PaieSearchCriteria` | `cin:string|null` ≤ 30; `nomPrenom:string|null` ≤ 150; `periode:string|null`; `fonctionIds`, `chantierIds`, `equipeIds:integer[]|null`, au plus 500 valeurs par liste | Critères combinés. Un filtre vide est ignoré; nom/CIN « contient » sans casse; `equipeIds` peut contenir `0` pour inclure les bulletins sans équipe. |
| Page de recherche | `content:PaieResponseDto[]`, `page:{size:number,number:number,totalElements:number,totalPages:number}` | Pagination et tri demandés dans l'URL de `/search`. Les numéros de page commencent à zéro. |
| `PaieOptionsChantierRequest` | `periode:string` obligatoire; `recherche:string|null` ≤ 100 | Recherche paginée des chantiers ayant des bulletins ce mois. |
| Option chantier | `id:integer`, `code:string`, `nom:string|null`, `designation:string|null`, `actif:boolean` | Référence du filtre; le statut n'enlève pas l'historique des bulletins. |
| `PaieOptionsEquipeRequest` | `periode:string` obligatoire; `chantierIds:integer[]` non vide, au plus 500 identifiants non nuls; `recherche:string|null` ≤ 100 | Recherche paginée des équipes des marchés et du mois choisis. |
| Option équipe | `id:integer`, `code:string`, `libelle:string` | Référence du filtre. |
| `PaieSuppressionGroupeRequestDto` | `criteres:PaieSearchCriteria` obligatoire avec période; `nombreAttendu:integer` obligatoire, positif ou nul | Supprime exactement le groupe confirmé, sinon `409` sans suppression. |
| `PaieSuppressionDto` | `supprimes:integer` | Nombre effectivement supprimé. |
| `PaieRestaurationDto` | `restaures:integer` | Nombre recréé depuis l'entrée d'audit; conflits : `409`, aucune écriture. |

## Analytique et effectifs

Les collections de mois et de marchés utilisent les résumés suivants :

| Type | Champs et types | Description |
|---|---|---|
| `PaiePeriodeResumeDto` | `periode:string`, `nombreBulletins:integer`, `nombreChantiers:integer`, `masse:number`, `stc:integer`, `stcMontant:number` | Résumé du mois pour les Cartes et l'assistant d'export. |
| `PaieChantierPeriodeDto` | `id:integer`, `code:string`, `libelle:string|null`, `effectif:integer`, `masse:number`, `stc:integer`, `stcMontant:number`, `moisPrecedent:Comparaison|null`, `sansEquipeMoisPrecedent:Comparaison|null`, `equipes:PaieEquipePeriodeDto[]` | Le total inclut les bulletins sans équipe, même s'ils n'ont pas d'entrée dans `equipes`. |
| `PaieEquipePeriodeDto` | `id:integer`, `code:string`, `libelle:string`, `effectif:integer`, `masse:number`, `stc:integer`, `stcMontant:number`, `moisPrecedent:Comparaison|null` | Équipe du chantier et du mois retenus. |
| `Comparaison` (`PaiePeriodeComparaisonDto`) | `periode:string`, `effectif:integer`, `masse:number`, `stc:integer`, `stcMontant:number` | Mois civil précédent sur le même périmètre. |
| `PaieMaterielTableauDto` | `chantierCode:string`, `equipeCode:string`, `titre:string`, `libelles:string[]` | Tableau du catalogue matériel; aucune quantité métier n'est préremplie. |

`PaieAnalytiqueDto` porte `periode:string`, `kpis:Kpi`, `moisPrecedent:Kpi|null`, `parChantier`,
`parEquipe`, `parFonction`, `tranches`, `evolution` et `qualite`.

| Type | Champs | Description |
|---|---|---|
| `Kpi` | `masse:number`, `effectif:integer`, `coutMoyen:number|null`, `nombreChantiers:integer`, `stc:integer`, `stcMontant:number` | Masse et STC en DH; effectifs en personnes; coût moyen absent sans bulletin. |
| Répartition chantier/équipe | `id:integer|null`, `code:string|null`, `libelle:string|null`, `masse:number`, `effectif:integer`, `stc:integer`, `stcMontant:number` | Tous les groupes du mois; l'équipe absente possède une référence nulle. |
| Répartition fonction | `id:integer`, `libelle:string`, `masse:number`, `effectif:integer`, `stc:integer`, `stcMontant:number` | Tous les groupes fonction du mois. |
| `Tranche` | `min:number`, `max:number|null`, `effectif:integer` | Minimum inclus, maximum exclu; dernière tranche ouverte. |
| `Evolution` | `periode:string`, `masse:number`, `effectif:integer`, `stc:integer`, `stcMontant:number` | Tous les mois disponibles du périmètre, du plus ancien au plus récent. |
| `Qualite` | `sansEquipe:integer`, `sansObservation:integer` | Bulletins du mois auxquels manque une information facultative. |
| `EffectifsCriteria` | `chantierIds`, `fonctionIds`, `equipeIds:integer[]|null` ≤ 500; `nomPrenom:string|null` ≤ 150; `cin:string|null` ≤ 30 | Même périmètre textuel et de rattachements que la recherche Paie. Aucun filtre de mois : tendance historique. |
| `EffectifMoisDto` | `periode:string`, `effectif:integer`, `effectifMoisPrecedent:integer|null`, `variation:integer|null`, `entrees:integer|null`, `plusPayes:integer|null`, `sorties:integer`, `mutations:integer|null` | Indicateurs mensuels en personnes. `effectifMoisPrecedent`, `variation` et `plusPayes` sont `null` lorsque le mois calendaire précédent est absent du périmètre. |
| `PaieRepartitionDto` | `periode:string`, `dimension:CHANTIER\|EQUIPE\|FONCTION`, `nombreGroupes:integer`, `groupes:Groupe[]` | Répartition triée par l'API publique selon masse (défaut, décroissant), effectif, STC, montant STC, libellé ou code ; l'adaptateur MCP applique la limite de transport. |

Sans bulletin sur le mois choisi : KPI à zéro, coût moyen absent et répartitions vides; l'historique
`evolution` du périmètre reste disponible. Le mois précédent est `null` s'il ne contient aucun
bulletin sur ce périmètre.

## Assistant d’import

Le fichier multipart `.xlsx` et la période accompagnent chaque étape; le serveur relit le fichier à
chaque appel. Les erreurs empêchent la création des bulletins. Une cellule numérique invalide est
refusée, même si sa colonne est facultative.

| Contrat | Champs et types | Description |
|---|---|---|
| `PaieImportAnalyseDto` | `periode:string`, `totalLignes:integer`, `erreurs:Erreur[]`, `chantiersClotures:ChantierCloture[]`, `cinInconnus:CinInconnu[]`, `ecarts:Ecart[]`, `departs:Depart[]`, `retours:Retour[]`, `pret:boolean` | Résultat sans écriture; `pret` exige l'absence d'erreur, chantier clôturé, CIN inconnu et écart. |
| `Erreur` | `numeroLigne:integer`, `cin:string|null`, `nomPrenom:string|null`, `raison:string` | Numéro réel Excel et correction attendue. |
| `ChantierCloture` | `chantierId:integer`, `code:string`, `designation:string|null`, `lignes:integer[]` | Marché cité à rouvrir ou à corriger dans le fichier. |
| `CinInconnu` | `numeroLigne:integer`, `cin:string`, `nomPrenom:string|null`, `fonction:string`, `chantier:string`, `equipe:string|null`, `salaire:number` | Données disponibles pour créer une fiche. |
| `Ecart` | `employeId:integer`, `numeroLigne:integer`, `cin:string`, `nomPrenom:string`, `champs:Champ[]`, `typeSalaire:MENSUEL|JOURNALIER|null` | Champs à aligner, avec type de salaire existant. |
| `Champ` | `champ:string`, `base:string|null`, `fichier:string|null` | Nom du champ, valeur en fiche et valeur du fichier. |
| `Depart` d'analyse | `employeId:integer`, `cin:string`, `nomPrenom:string`, `motif:string|null` | Départ proposé; motif à saisir s'il est absent. |
| `Retour` | `employeId:integer`, `cin:string`, `nomPrenom:string` | Employé sorti qui réapparaît dans le fichier. |
| `PaieImportCorrectionsDto` | `aligner:Alignement[]`, `creer:Creation[]`; absents : listes vides | Corrections explicitement sélectionnées. |
| `Alignement` | `employeId:integer` obligatoire; `typeSalaire:MENSUEL|JOURNALIER|null` | Fiche à aligner; type absent : conserver celui de la fiche s'il existe. |
| `Creation` | `numeroLigne:integer`, `dateNaissance:string`, `dateEmbauche:string`, `typeSalaire:MENSUEL|JOURNALIER` | Dates ISO et type obligatoires pour une nouvelle fiche. |
| `PaieImportDepartsDto` | `departs:{employeId:integer,motif:string}[]`; absente : liste vide | Motif obligatoire et non blanc, au plus 255 caractères. Seuls les départs proposés peuvent être confirmés. |
| `PaieImportResultDto` | `periode:string`, `crees:integer`, `departs:integer`, `retours:integer` | Bilan de la transaction d'import. |

## Parcours de l’employé

`ParcoursEmployeDto` porte `employeId:integer`, `indicateurs`, `mois` et `evenements`.

| Partie | Champs et types | Description |
|---|---|---|
| `indicateurs` | `moisPayes:integer`, `totalPercu:number`, `joursTravailles:number`, `premierMois:string|null`, `dernierMois:string|null` | Premier et dernier mois absents si aucun bulletin. |
| `mois[]` | `bulletinId:integer`, `periode:string`, `fonction:string`, `chantier:string`, `equipe:string|null`, `nombreJoursTravailles:number`, `salaireMensuel:number`, `salaireTotal:number`, `observation:string|null` | Valeurs historiques mensuelles, du plus récent au plus ancien. |
| `evenements[]` | `periode:string`, `type:string`, `avant:string|null`, `apres:string|null`, `motif:string|null` | Entrée, changements de chantier/fonction/équipe/salaire, départ et retour. |

Un employé inconnu entraîne `404`. Sans bulletin, les agrégats sont à zéro et les listes sont vides.
