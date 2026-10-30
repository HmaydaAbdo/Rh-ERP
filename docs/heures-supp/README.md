# Domaine Heures supplémentaires

## Rôle

Le domaine importe et restitue, par mois et par chantier, les heures supplémentaires et les forfaits des employés.
Il s'appuie sur les domaines Employé, Paie et Chantier pour identifier les personnes, calculer leur taux et qualifier
les STC. Il ne modifie pas les données de Paie.

Les vues sont **Tabulaire**, **Cartes** et **Analytique**. Cartes et Analytique étendent le socle partagé du périmètre et leurs agrégats sont calculés côté Spring.
L'import se fait par un assistant multistep, un chantier à la fois.
Le bouton fractionné « Importer un chantier » de la collection donne aussi accès au modèle Excel avant l'ouverture du wizard.

## Modèle et instantanés

La table `heures_supp` contient une ligne par employé, mois et chantier. La contrainte unique
`(employee_id, periode, chantier_id)` empêche les doublons ; `version` protège les modifications concurrentes.
Chaque ligne référence l'employé, le bulletin du mois, la fonction constatée et le chantier. Elle conserve le
salaire et le type de salaire utilisés, S/H, P/H, Montant, l'indicateur STC/sortie, STC (DH), Forfait et Net à payer.
Pour un forfait seul, P/H, salaire de référence, type et S/H sont absents et Montant/STC valent zéro. Les lignes
sont auditées dans `heures_supp_aud`.

Les règles de stockage complémentaires (période, non-négativité, précision de P/H, cohérence du forfait avec STC,
relation entre Montant, STC et Net à payer) sont imposées par les contraintes de la migration
`V39__heures_supp_mensuelles.sql`. Les permissions `HEURES_SUP_READ` et `HEURES_SUP_IMPORT` sont ajoutées par V40.

## API et vues

| Route | Contrat |
|---|---|
| `POST /heures-supp/search` | Recherche paginée selon période, chantier, équipe, fonction, CIN et nom ; renvoie les lignes détaillées. |
| `POST /heures-supp/analytique` | Indicateurs et répartitions par chantier, fonction et équipe selon les critères. |
| `PUT /heures-supp/{id}` | Modifie les heures et/ou le forfait d'une ligne, avec contrôle de version et recalcul des montants. |
| `POST /heures-supp` | Ajoute une ligne manuellement à partir d'un employé, d'une paie mensuelle et d'un chantier. |
| `DELETE /heures-supp/{id}` | Supprime une ligne avec audit. |
| `POST /heures-supp/suppression-mois` | Supprime toutes les lignes d'un mois, tous chantiers confondus, si le nombre correspond à celui confirmé. |
| `GET /heures-supp/periodes` | Mois ayant au moins un import. |
| `GET /heures-supp/import/prerequis?periode=aaaa-MM&chantierId=…` | Confirme que le mois de paie et le chantier permettent d'ouvrir l'étape du fichier. |
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
permissions endpoint par endpoint sont décrites dans [RBAC](../rbac/heures-supp.md).

Les routes `/heures-supp`, `/heures-supp/cartes` et `/heures-supp/analytique` gardent les filtres dans l'URL.
Tabulaire est la vue détaillée. Cartes et Analytique utilisent les composants partagés, avec le mois et le
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
| S/H | Calculé à chaque nouvel import depuis le salaire et le type de salaire courants de l'employé : salaire journalier ÷ 10 ; salaire mensuel ÷ 26 ÷ 10. La valeur calculée est conservée avec l'import. |
| Marqueur STC/sortie | Observation du bulletin de Paie de l'employé pour le même mois. Le domaine réutilise la règle Paie `ObservationStc.estStcOuSortie`. |
| Forfait | Montant en DH saisi séparément des heures supplémentaires. Il peut concerner un employé absent du fichier d'heures, mais pas un employé marqué STC/sortie ce mois-là. |

## Grandeurs métier

Les montants sont produits par Spring ; l'assistant IA ne les recalcule pas.

| Grandeur | Définition |
|---|---|
| **S/H** | Salaire horaire issu du salaire et du type de salaire de la fiche Employé au moment de l'import. Sa précision est conservée pour le calcul. |
| **P/H** | Heures supplémentaires du mois, fournies en heures décimales entre 0 inclus et une décimale au plus. |
| **Montant** | `S/H × P/H`, arrondi à deux décimales en DH. |
| **STC (DH)** | `Montant` si le bulletin du même mois est marqué exactement « STC » ou « sortie » (casse et espaces extérieurs ignorés) ; sinon `0 DH`. |
| **Forfait** | Montant en DH indépendant du **Montant** des heures supplémentaires. Interdit si le bulletin de Paie du même mois est marqué STC/sortie. |
| **Net à payer** | `Montant − STC (DH) + Forfait`. |

Une modification ultérieure du salaire ne recalcule pas un import d'heures supplémentaires déjà enregistré. Le taux S/H
retenu est un instantané de la fiche Employé au moment de chaque nouvel import.

## Assistant d'import

Depuis le tableau, les utilisateurs autorisés peuvent également ajouter une ligne manuellement en sélectionnant un employé, un mois, un chantier et au moins une valeur (heures ou forfait). Le serveur exige le bulletin de paie de cet employé pour le mois, reprend la fonction et l'observation STC/sortie de ce bulletin et refuse tout doublon employé/mois/chantier.

1. **Mois et chantier** : si aucune paie n'existe pour le mois, bloquer dès cette étape avec une explication indiquant
   d'importer d'abord la paie de ce mois.
2. **Fichier** : le bouton « Télécharger le modèle Excel » fournit le classeur `.xlsx` avec trois colonnes obligatoires (`Nom et prénom`, `CIN`, `HS`). Le wizard permet aussi de saisir les forfaits `CIN;montant`, y compris pour un employé absent du fichier d'heures.
3. **Analyse** : aucune écriture ; conserver les lignes HS à zéro avec P/H = 0 et Montant = 0, signaler une ligne HS vide par son numéro, rapprocher les employés par CIN, vérifier qu'un bulletin de
   Paie existe pour chacun dans le même mois et calculer les valeurs présentées.
4. **Corrections** : reprendre le mécanisme Paie : aligner explicitement la fiche existante sur le nom du fichier, ou créer la fiche d'un CIN inconnu en demandant ses dates, sa fonction, son salaire et son type. La sélection de fonction exige `FUNCTION_READ`. Toute ligne doit ensuite satisfaire l'exigence d'un bulletin du même mois.
5. **Forfaits** : ajouter un employé et un montant même s'il n'est pas présent dans les lignes HS ; refuser le forfait
   pour un employé marqué STC/sortie dans la paie du mois.
6. **Récapitulatif** : présenter séparément heures, Montant, STC, Forfaits et Net à payer avant confirmation.
7. **Import** : enregistrer le lot validé en une transaction et afficher un bilan final.

Un doublon pour le même employé, le même mois et le même chantier est refusé par défaut ; le remplacement possède une action et une trace d'audit distinctes. Une ligne peut être modifiée sous contrôle de version ou supprimée à l'unité. La purge d'un mois requiert la permission dédiée, la saisie du nombre de lignes à supprimer et une confirmation serveur du même compte ; elle couvre tous les chantiers du mois et conserve les instantanés Envers. Un employé marqué STC/sortie ne peut avoir de forfait pour ce mois, tous chantiers confondus.

### Classeur reçu

Le fichier `ETAT_pointage_heure_sup.xlsx` a une feuille avec les colonnes attendues. Il contient 864 lignes à zéro (conservées), 120 lignes positives et une ligne sans valeur HS à la ligne Excel 986. Cette dernière doit être corrigée ou supprimée avant import ; le lecteur ne convertit pas une cellule vide en zéro.

## IA et MCP

L'assistant IA accède aux capacités publiées du domaine par MCP, derrière les façades métier Spring et les permissions
du domaine. Les outils décrivent chaque champ avec sa source, sa période, son unité et sa définition. Ils renvoient
les montants calculés par Spring ; aucun outil ne donne accès aux repositories ou à du SQL générique.

Outils publiés : `heures_supp_periodes` (mois importés), `heures_supp_import_prerequis` (contrôle sans écriture du mois et du chantier),
`heures_supp_indicateurs` (indicateurs et répartitions filtrables par chantier, équipe, fonction, CIN ou nom) et
`heures_supp_rechercher` (lignes détaillées, pages accessibles sans plafond). Les montants viennent de Spring ; les répartitions
ne sont pas tronquées. Les trois outils de consultation exigent `IA_UTILISER`, `HEURES_SUP_READ` et `PAIE_READ` ; le précontrôle
d'import exige `IA_UTILISER`, `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ`. Aucun outil MCP ne lit un classeur ni n'effectue
une écriture. Le détail des cas d'usage et de la gouvernance est dans [docs/ia.md](../ia.md).

## Scénarios couverts par les tests

- `CalculHeuresSuppTest` : S/H journalier et mensuel sans perte de précision, Montant arrondi à deux décimales, STC et Net.
- `LecteurFichierHeuresSuppTest` : format du classeur, ligne zéro conservée, cellule HS vide, doublon CIN, valeurs négatives/précision et fichier invalide.
- `HeuresSuppImportServiceTest` : prérequis mois/chantier, analyse sans écriture, paie exigée par employé, snapshot, STC/forfait et doublon de forfait.
- `HeuresSuppAnalytiqueServiceTest` : agrégats, groupes et périodes.
- `EndpointSecurityTest`, `OpenApiContractTest` et `McpOutilsLectureIntegrationTest` : permissions, contrats HTTP/OpenAPI et outils MCP.
- Tests Angular du module, du service, du wizard, de la liste et de la coque des vues : filtres, erreurs, contrôles de l'assistant et paramètres URL.
- `frontend/e2e/full-stack.spec.ts` : création des données métier, prérequis, import Excel réel, recherche, agrégats et ouverture de la vue.

## Limites métier à arbitrer

Les décisions métier qui restent à prendre sont suivies dans [TODO du domaine](TODO.md) ; elles ne sont pas
interprétées comme des règles par l'import ou par l'assistant IA.
