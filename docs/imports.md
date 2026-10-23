# Imports Excel

> Quatre imports existent : **Équipes**, **Fonctions**, **Employés** et **Paie**. Ce document donne les règles qu'ils
> partagent ; le format exact des colonnes de chacun est dans le README de son domaine.

| Import | Endpoint | Permission | Format et détail |
|---|---|---|---|
| Équipes | `POST /equipes/import` | `EQUIPE_IMPORT` | [equipe/README.md](equipe/README.md) |
| Fonctions | `POST /functions/import` | `FUNCTION_IMPORT` | [function/README.md](function/README.md) |
| Employés | `POST /employees/import` | `EMPLOYEE_IMPORT` | [employee/README.md](employee/README.md) |
| Paie | assistant : `POST /paie/import/analyse`, `/paie/import/corrections`, `/paie/import` (`?periode=aaaa-MM`) | `PAIE_IMPORT` (+ `PAIE_READ` ; corrections : + `EMPLOYEE_WRITE`) | [paie/README.md](paie/README.md), « Import Excel (assistant) » |

Il n'existe pas d'import pour les chantiers (alimentés par la [synchronisation ERP](chantier/README.md)).

---

## Règles communes

### 1. Un import ajoute, il ne modifie jamais

**Décision du 2026-10-03** : les fichiers Excel servent uniquement à **apporter des données qui n'existent pas
encore**. Toute modification d'une donnée existante se fait depuis l'interface.

| Import | Clé d'identification | Si elle existe déjà |
|---|---|---|
| Équipes | Code et libellé | Ligne rejetée si le code ou le libellé existe (équipe modifiable depuis l'écran Équipes) |
| Fonctions | Libellé | Ligne rejetée (« Fonction déjà existante ») |
| Employés | CIN | Ligne rejetée (« Un employé existe déjà avec ce CIN (à modifier depuis l'écran Employés) ») |
| Paie | Employé (CIN) + période | Ligne rejetée (« Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie) ») |

Pour **ré-importer un mois de paie**, supprimer d'abord les bulletins concernés depuis l'écran Paie.

**Exception — la Paie et les fiches employés** (décision du 2026-10-18, ADR 0010) : l'import de la paie ne crée ni ne
modifie un bulletin existant, mais son assistant **met à jour les fiches employés** que l'utilisateur choisit d'aligner
sur le fichier (et crée les CIN inconnus). Ces écritures sont des choix explicites de l'utilisateur, faites avant l'import.

### 2. Tout ou rien (atomique)

Toutes les lignes sont **validées avant la moindre écriture**. Une seule ligne invalide rejette **tout** le
fichier : rien n'est créé, ni les lignes valides, ni les référentiels qui auraient dû l'être. Il suffit alors de
corriger le fichier et de le réimporter.

Cette règle impose une discipline de code : pendant la validation, on ne garde que des valeurs brutes (aucune
entité JPA gérée). Charger ou modifier une entité plus tôt l'exposerait au « dirty checking » d'Hibernate, qui
persisterait le changement même si l'import est finalement rejeté.

### 3. Une seule raison par ligne

Si une ligne cumule plusieurs problèmes, **seul le premier détecté** est rapporté, dans un ordre fixe
(champ manquant, valeur trop longue, doublon dans le fichier, référence introuvable…). Corriger une ligne et
réimporter peut donc révéler une seconde erreur qui n'était pas visible au premier rejet.

### 4. Même forme de réponse en succès et en rejet

Succès (`200`) comme rejet (`400`), le corps est un objet de résultat : `totalLignes`, `crees`, `ignores`,
`lignesIgnorees[]` (numéro de ligne, identifiant(s) de la ligne — code, CIN ou libellé —, raison). Seul le code HTTP change ;
l'interface affiche le même détail dans les deux cas. Un fichier **illisible ou au mauvais format** est un rejet global
(`400`, message explicite). **La Paie fait autrement** : son assistant rend d'abord une **analyse** (erreurs, CIN inconnus,
écarts avec les fiches), et l'import n'accepte qu'un fichier sans problème (sinon `400`, rien n'est enregistré).

### 5. Modèle téléchargeable

Chaque import fournit un modèle `.xlsx` vierge (`GET …/import/modele`, entrée « Télécharger le modèle Excel » du bouton fractionné « Importer »), qui ne contient
**que les en-têtes**, jamais de ligne d'exemple : une valeur d'exemple pourrait être importée par erreur.
Partir du modèle évite de se baser sur un ancien fichier dont la structure a changé.

### 6. Fichier

Format `.xlsx`, 20 Mo maximum (`spring.servlet.multipart` et limite du proxy Nginx inner). Les lignes entièrement vides sont ignorées. Les
références (fonction, chantier, équipe) sont trouvées **sans tenir compte de la casse ni des espaces**
superflus.

### 7. Performance

Les référentiels nécessaires (fonctions, chantiers actifs, employés par CIN, équipes, CIN déjà présents, couples
employé/période existants) sont chargés **une seule fois** avant la lecture des lignes : aucune requête par ligne
dans la boucle (`conventions/performance.md`).

---

## Ce que chaque import exige

| | Équipes | Fonctions | Employés | Paie |
|---|---|---|---|---|
| Lignes d'en-tête | 1 | 1 | 1 | **3** |
| Colonnes | 2 | 1 | 6 | 13 |
| En-têtes | `Code`, `Libellé` | `Fonction` | Voir [Employés](employee/README.md) | Voir [Paie](paie/README.md) |
| Fonction | — | — (c'est la donnée importée) | Doit **exister** | **Créée automatiquement** si absente |
| Chantier | — | — | Doit exister **et être actif** | Doit exister **et être actif** |
| Employé | — | — | Créé (toujours `ACTIF`) | Doit **exister** (par CIN) |
| Équipe | Créée (code et libellé uniques) | — | — | Doit exister si renseignée ; jamais créée |
| Période | — | — | — | Paramètre de la requête (`?periode=aaaa-MM`), valable pour tout le fichier |
| Total de paie | — | — | — | Repris **tel quel** de la colonne « Total » ; jamais recalculé |

Exception assumée : l'import Paie crée les fonctions inconnues (un intitulé qui n'a pas encore été saisi ne doit
pas bloquer l'import mensuel de centaines de lignes), alors qu'un CIN, un chantier ou une équipe inconnus restent
des erreurs de saisie à corriger. Ces créations sont dédupliquées et listées dans `fonctionsCreees`. Elles
n'ont lieu que si **tout** le fichier est valide.

---

## Interface

Sur chaque écran concerné, le bouton fractionné « Importer » (dont le menu propose le modèle Excel) apparaît avec la permission
`*_IMPORT`. « Importer » ouvre le sélecteur de fichier (Paie : choix de la période d'abord), envoie le fichier,
affiche un résumé en notification, puis le détail des lignes rejetées dans une fenêtre défilante. Voir
[frontend/README.md](frontend/README.md).

---

## Ajouter un nouvel import

1. Un sous-package `imports/` dans le domaine (service, contrôleur, DTO de résultat, exception de fichier
   illisible).
2. Suivre les règles ci-dessus : ajout seul, atomique, une raison par ligne, même forme de réponse, modèle sans
   exemple, chargements préalables.
3. Permission `<DOMAINE>_IMPORT` par migration (catalogue fixe) et ligne dans `EndpointSecurityTest`.
4. Documenter le format des colonnes dans le README du domaine et ajouter la ligne aux tableaux ci-dessus.
