# Domaine Employé

La fiche conserve l’identité et la situation courante de l’employé. Les bulletins Paie conservent les
situations de chaque mois; ils constituent l’historique, sans être confondus avec l’effectif courant.
Les fiches sont créées par saisie ou import Excel d’ajout. Toute modification d’une fiche existante
passe par l’application.

## Règles

- Le CIN est obligatoire, limité à 30 caractères et unique sans distinction de casse après retrait
  des espaces extérieurs. Le nom et prénom est obligatoire, limité à 150 caractères.
- Les deux dates et la fonction sont obligatoires. La naissance est strictement antérieure à
  aujourd’hui, dans l’API, le formulaire et l’import. La date d’embauche peut être future.
- Une fiche « En poste » (`ACTIF`) a un chantier et peut avoir une équipe. Une fiche « Sorti »
  (`INACTIF`) n’a ni chantier ni équipe courants. La fonction est conservée. Les bulletins gardent
  leurs affectations de période, même après une sortie ou une mutation.
- Fonction, chantier et équipe sont résolus par les façades des domaines propriétaires. Une
  référence inconnue est refusée. `equipeId: null` signifie sans équipe; le formulaire convertit le
  choix synthétique « Orphelins (sans équipe) » en `null`, jamais en identifiant `0`.
- Salaire et type de salaire se renseignent ensemble ou restent tous deux vides. Le salaire est
  positif ou nul, avec deux décimales au plus. La saisie et la lecture exigent `PAIE_READ` en plus du
  droit de l’opération Employé. Sans ce droit, les réponses masquent les deux champs, une écriture
  conserve le salaire existant et le tri sur ces champs est retiré.
  Cette règle appartient à `ProjectionPaieEmployee`, réutilisée par l’API REST et les outils MCP de
  l’assistant IA; les autres domaines lisent la fiche complète par `IEmployeeService`.
- Une modification exige la version lue. Une version périmée renvoie `409`, sans écraser la fiche.
- Un employé lié à un bulletin ou à un compte utilisateur ne peut pas être supprimé (`409`). Le
  passage à « Sorti » conserve son historique. Les écritures et leurs refus sont audités.
- L’import Paie aligne les fiches selon son assistant : un employé sorti présent dans le fichier
  redevient en poste; un départ confirmé est enregistré avec sa période et son motif. Un départ par
  employé et par mois au plus, motif obligatoire de 255 caractères au plus. Les règles de cet
  assistant appartiennent au [domaine Paie](../paie/README.md).

## Modèle de données

Table `employe`, entité `Employee`, auditée et modifiable avec verrou optimiste :

| Colonne | Type | Contraintes et description |
|---|---|---|
| `id` | `BIGINT` | Clé primaire générée |
| `version` | `BIGINT` | Obligatoire; version de modification concurrente |
| `nom_prenom` | `VARCHAR(150)` | Obligatoire; identité affichée |
| `cin` | `VARCHAR(30)` | Obligatoire; unique sur `UPPER(BTRIM(cin))`, sans espaces extérieurs |
| `date_naissance` | `DATE` | Obligatoire; naissance |
| `date_embauche` | `DATE` | Obligatoire; embauche |
| `fonction_id` | `BIGINT` | FK obligatoire vers `fonction` |
| `chantier_id` | `BIGINT` | FK vers `chantier`; obligatoire en poste, vide après sortie |
| `equipe_id` | `BIGINT` | FK vers `equipe`; facultative en poste, vide après sortie |
| `salaire` | `NUMERIC(10,2)` | Facultatif; montant mensuel ou tarif d’une journée |
| `type_salaire` | `VARCHAR(20)` | Facultatif; `MENSUEL` ou `JOURNALIER`, conjoint au salaire |
| `statut` | `VARCHAR(20)` | Obligatoire; `ACTIF` à la création, ou `INACTIF` |

Les relations, statut et date d’embauche sont indexés. Les contraintes de base protègent les
références, le CIN et l’absence d’affectation des fiches sorties. Le modèle transverse est dans
[le modèle de données](../data-model.md).

Table `employe_sortie`, entité `EmployeeSortie`, auditée :

| Colonne | Type | Contraintes et description |
|---|---|---|
| `id` | `BIGINT` | Clé primaire générée |
| `employee_id` | `BIGINT` | FK obligatoire vers l’employé |
| `periode` | `INT` | Mois `aaaaMM`, obligatoire |
| `motif` | `VARCHAR(255)` | Obligatoire; « STC » ou motif saisi |

L’unicité `(employee_id, periode)` permet plusieurs départs à des mois différents pour une personne
qui revient puis repart. Les bulletins et départs sont les sources du parcours historique.

## Contrats exposés

Les dates HTTP sont des chaînes ISO `aaaa-MM-jj`. Les identifiants et versions sont des entiers
Java `Long`, représentés comme nombres JSON. Les montants sont des `BigDecimal`, en nombres JSON.

### Création et modification

`EmployeeCreateRequestDto` et `EmployeeUpdateRequestDto` partagent les champs ci-dessous :

| Champ | Type Java / JSON | Contraintes et description |
|---|---|---|
| `nomPrenom` | `String` / chaîne | Obligatoire, non blanc, 150 caractères au plus |
| `cin` | `String` / chaîne | Obligatoire, non blanc, 30 caractères au plus; clé métier normalisée |
| `dateNaissance` | `LocalDate` / date ISO | Obligatoire, strictement passée |
| `dateEmbauche` | `LocalDate` / date ISO | Obligatoire |
| `fonctionId` | `Long` / entier | Obligatoire; référence existante |
| `chantierId` | `Long` / entier ou `null` | Obligatoire à la création et pour une fiche en poste; `null` si sorti |
| `equipeId` | `Long` / entier ou `null` | Facultatif; `null` si sorti |
| `salaire` | `BigDecimal` / nombre ou `null` | ≥ 0, huit chiffres entiers et deux décimales au plus; avec son type |
| `typeSalaire` | `TypeSalaire` / chaîne ou `null` | `MENSUEL` ou `JOURNALIER`; avec le salaire |

La modification ajoute `version` (`Long`, obligatoire) et `statut` (`EmployeeStatut`, obligatoire :
`ACTIF` ou `INACTIF`). La création n’accepte pas de statut : l’employé est en poste.

### Recherche

`EmployeeSearchCriteria` est partagé par la recherche, les regroupements et l’analytique :

| Champ | Type | Contraintes et description |
|---|---|---|
| `nomPrenom` | `String` ou `null` | 150 caractères au plus; contient, sans distinction de casse |
| `cin` | `String` ou `null` | 30 caractères au plus; contient, sans distinction de casse |
| `fonctionIds` | `List<Long>` ou `null` | 500 éléments au plus; identifiants strictement positifs, jamais `null` |
| `chantierIds` | `List<Long>` ou `null` | 500 éléments au plus; identifiants positifs, `0` = sans chantier, jamais `null` dans la liste |
| `equipeIds` | `List<Long>` ou `null` | 500 éléments au plus; identifiants positifs, `0` = sans équipe, jamais `null` dans la liste |
| `statut` | `EmployeeStatut` ou `null` | `ACTIF`, `INACTIF`; absent = tous |

Une liste absente ou vide ne filtre pas cette dimension. Les dimensions se combinent par « et »;
les valeurs d’une même dimension par « ou ». Les caractères `%` et `_` sont recherchés littéralement.
La recherche renvoie une page (`content`, `page.number`, `page.size`, `page.totalElements`,
`page.totalPages`) et accepte pagination et tri.

### Réponses et projections

| DTO | Champs, types et signification |
|---|---|
| `EmployeeResponseDto` | `id`, `version` (`Long`); `nomPrenom`, `cin` (`String`); `dateNaissance`, `dateEmbauche` (`LocalDate`); `fonction` (`FunctionSummaryDto`); `chantier` (`ChantierSummaryDto` ou `null`); `equipe` (`EquipeSummaryDto` ou `null`); `salaire` (`BigDecimal` ou `null`); `typeSalaire` (`TypeSalaire` ou `null`); `statut` (`EmployeeStatut`). Salaire et type sont `null` sans `PAIE_READ` ou s’ils ne sont pas renseignés. |
| `FunctionSummaryDto` | `id` (`Long`), `libelle` (`String`) de la fonction |
| `ChantierSummaryDto` | `id` (`Long`), `code` (`String`), `designation` (`String` ou `null`) du chantier |
| `EquipeSummaryDto` | `id` (`Long`), `code`, `libelle` (`String`) de l’équipe |
| `EmployeeRegroupementDto` | `id` (`long`, `0` sans chantier/équipe), `code` et `libelle` (`String`, code `null` pour le groupe sans rattachement), `effectif` et `actifs` (`long`). Groupes triés par effectif décroissant, puis code. Aucun salaire. |
| `EmployeeAnalytiqueDto` | `effectif`, `actifs`, `inactifs`, `embauchesDouzeMois` (`long`); `ageMoyen`, `ancienneteMoyenne` (`BigDecimal` ou `null` sans employé); `parAge`, `parAnciennete` (`List<TrancheDto>`). Aucun salaire. |
| `TrancheDto` | `min` (`int` inclus), `max` (`Integer` exclu, `null` pour « et plus »), `effectif` (`long`); bornes en années pleines |
| `EmployeeImportResultDto` | `totalLignes`, `crees`, `ignores` (`int`), `lignesIgnorees` (`List<LigneIgnoreeDto>`); en rejet atomique, `crees = 0` |
| `LigneIgnoreeDto` | `numeroLigne` (`int`, numéro réel Excel à partir de 1), `cin`, `nomPrenom` (`String` ou `null`), `raison` (`String`) |
| `EmployeeSortieDto` | Contrat de façade : `employeId` (`long`), `periode` (`YearMonth`, `aaaa-MM`), `motif` (`String`); consommé par le parcours Paie |

Âge et ancienneté moyens sont la moyenne des durées en jours divisée par 365,2425, arrondie à une
décimale. L’ancienneté ne devient jamais négative. Les embauches des douze derniers mois satisfont
`aujourd’hui - 1 an < dateEmbauche <= aujourd’hui`; les dates futures sont exclues.
Les tranches sont : âge `<25`, `25–34`, `35–44`, `45–54`, `55+`; ancienneté `<1`, `[1,3[`, `[3,5[`,
`[5,10[`, `10+` ans.

## API et permissions

| Méthode et route | Permission | Résultat et erreurs utiles |
|---|---|---|
| `POST /employees` | `EMPLOYEE_WRITE` | `201`; validation/référence `400`, CIN ou intégrité `409` |
| `PUT /employees/{id}` | `EMPLOYEE_WRITE` | `200`; validation `400`, absent `404`, CIN/version `409` |
| `GET /employees/{id}` | `EMPLOYEE_READ` | `200`; absent `404` |
| `POST /employees/search` | `EMPLOYEE_READ` | Page de fiches; critères invalides `400` |
| `POST /employees/regroupements?dimension=CHANTIER\|EQUIPE\|FONCTION` | `EMPLOYEE_READ` | Groupes du périmètre; critères/dimension invalides `400` |
| `POST /employees/analytique` | `EMPLOYEE_READ` | Chiffres et tranches du périmètre; critères invalides `400` |
| `DELETE /employees/{id}` | `EMPLOYEE_DELETE` | `204`; absent `404`, fiche utilisée `409` |
| `POST /employees/import` | `EMPLOYEE_IMPORT` | Multipart `file`; résultat `200`, fichier ou lignes invalides `400` |
| `GET /employees/import/modele` | `EMPLOYEE_IMPORT` | Modèle XLSX vierge |

Chaque route exige une authentification. Le [catalogue RBAC Employé](../rbac/employee.md) décrit
les guards et boutons. Le formulaire utilise les sélecteurs Fonction, Chantier et Équipe : il faut
les droits de lecture correspondants (`FUNCTION_READ`, `CHANTIER_READ`, `EQUIPE_READ`). Lire une
fiche à modifier nécessite aussi `EMPLOYEE_READ`. L’import résout ces références côté serveur et
ne demande que `EMPLOYEE_IMPORT`. L’historique exige `AUDIT_READ`; le salaire et le parcours exigent
`PAIE_READ`.

### Lecture par l’assistant IA

Les outils de recherche, fiche, comptage, regroupement et départs réutilisent les façades Employé
avec `EMPLOYEE_READ`, en plus de `IA_UTILISER` exigée par l’accès IA. Le parcours nécessite
`PAIE_READ`. La projection du salaire est commune : sans `PAIE_READ`, les réponses REST renvoient
les champs salariaux à `null` et les outils MCP les omettent. Le comptage et le regroupement
réutilisent les définitions du domaine, sans calcul parallèle. Les vues proposées ciblent les
routes Employé existantes avec leur périmètre. Le catalogue, ses limites et ses contrôles sont
décrits dans [le catalogue MCP](../ia.md#catalogue-mcp).

## Import Excel

Le modèle téléchargeable comporte six colonnes, dans cet ordre : date d’embauche, nom et prénom,
CIN, fonction (libellé existant), chantier (code existant et en cours), date de naissance. Les dates
sont des cellules de date Excel, pas du texte. La taille maximale du fichier est 20 Mo.

Une ligne d’en-tête est ignorée. Les lignes vides sont sautées; les numéros d’erreur restent ceux
d’Excel, même après une ligne absente. Le fichier ajoute exclusivement des CIN inédits : aucun
employé existant, fonction ou chantier n’est modifié ou créé implicitement. Les employés créés sont
en poste, sans équipe ni salaire.

Toutes les lignes sont contrôlées avant écriture. Une seule erreur rejette le fichier entier; le
corps de réponse reste `EmployeeImportResultDto`, avec chaque ligne invalide et une première raison
par ligne. Ordre : champs manquants/invalides, longueurs, naissance non passée, doublon du fichier,
CIN déjà présent, fonction inconnue, chantier inconnu ou clôturé. Corriger puis importer à nouveau
peut révéler un autre problème de la même ligne.

Les référentiels sont lus une fois par pages bornées, puis les références et CIN sont comparés en
mémoire. Les règles communes et l’atomicité sont précisées dans [Imports](../imports.md).

## Parcours frontend et exports

La coque commune porte les onglets, actions et filtres pour `/employees`, `/employees/cartes` et
`/employees/analytique`. Les filtres nom, CIN, fonctions, chantiers, équipes et statut vivent dans
l’URL et sont conservés entre vues et par le retour navigateur. Les sélecteurs de dimensions sont
partagés, multiples, avec recherche serveur, pagination au défilement et navigation clavier.

- **Tabulaire** : identité, fonction, chantier, équipe, date d’embauche, statut et salaire autorisé;
  colonnes configurables, tri, pagination et actions de consultation/modification/suppression.
  Les recherches précédentes sont annulées lors d’un changement de périmètre. Un échec affiche une
  erreur et un réessai, sans présenter les anciennes lignes comme résultat du filtre courant.
- **Cartes** : chantier → équipe → fonction → employés; chaque sélection ajoute une étape au fil.
  « Voir la liste » conserve le périmètre. Les effectifs et la part en poste viennent des fiches;
  les indicateurs Paie autorisés sont identifiés par leur période.
- **Analytique** : chiffres et tranches Employé en premier, puis données Paie autorisées. Les groupes
  des graphiques sont limités aux douze plus grands pour la lisibilité; leur tableau de données
  conserve tous les groupes. Chaque graphique possède son tableau et son export individuel.
  Les exports de périmètre utilisent les composants partagés et conservent leurs critères.
- **Fiche** `/employees/:id` : identité, situation, âge et ancienneté; salaire et parcours Paie
  réservés à `PAIE_READ`, historique réservé à `AUDIT_READ`.
- **Saisie** `/employees/new`, `/employees/:id/edit` : mêmes contraintes que l’API; salaire et type
  facultatifs mais conjoints. Une fiche sortie n’affiche pas chantier/équipe. La modification attend
  la lecture de la fiche avant d’ouvrir les champs. Fiche et modification annoncent chargement et
  erreur, avec retour liste et réessai. Quitter une saisie modifiée demande confirmation.
- **Import** : bouton et modèle dans l’en-tête, résumé et dialogue des erreurs par numéro Excel;
  un succès recharge la vue courante.

Nom, CIN et dimensions s’appliquent aux données Paie et aux mouvements. Le statut courant reste
propre aux fiches et ne filtre pas les mouvements historiques; un message le rappelle lorsqu’il
est sélectionné. Les sources mensuelles et l’effectif courant restent distincts. Les règles
partagées de présentation et d’export sont dans [Vues de périmètre](../frontend/vues-perimetre.md).

## Scénarios vérifiables

| Scénario | Tests |
|---|---|
| Création/modification, CIN normalisé, références, version | `EmployeeServiceTest`, `EmployeeControllerTest` |
| Salaire masqué, tri de paie retiré, salaire conservé sans droit | `EmployeeControllerTest`, specs formulaire/liste/détail |
| Critères invalides refusés; `0` conserve le sens sans chantier/équipe | `EmployeeControllerTest`, `EmployeeAnalytiqueServiceTest` |
| Suppression d’une fiche utilisée refusée | `EmployeeSuppressionTest` sur PostgreSQL |
| Import valide, doublon, atomicité, naissance passée, numéros réels | `EmployeeImportServiceTest`, specs actions |
| Effectifs, groupes sans rattachement, tranches et bornes douze mois | `EmployeeAnalytiqueServiceTest` sur PostgreSQL |
| Formulaire, fiche, chargement/erreur/réessai et permissions | Specs `employee-form`, `employee-detail`, `employee-list` |
| URL et recherches tardives, passage entre trois vues | Specs filtres/coque/liste/module et E2E Employé |

Les suites et commandes transverses sont décrites dans [Tests](../testing.md). Le Pointage et les
évolutions de qualité de données non arbitrées sont suivis dans le [TODO global](../../TODO.md).
