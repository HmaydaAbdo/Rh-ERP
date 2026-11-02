# Accueil

> L'écran d'arrivée de chaque utilisateur : des indicateurs choisis, dans l'ordre voulu, parmi ceux que ses permissions
> l'autorisent à voir. Le domaine ne garde que ce choix ; la valeur de chaque indicateur vient de l'API du domaine qui la porte.

## Rôle et décisions

Décisions du propriétaire (2026-11-01) :

- l'accueil **diffère d'un utilisateur à l'autre** et un administrateur règle les indicateurs affichés ;
- **l'utilisateur peut aussi masquer, ordonner et ajouter** des indicateurs pour lui-même, **dans la limite de ceux que ses
  permissions autorisent** ;
- **la configuration par défaut par fiche de poste attend E6** (sécurité par fiche de poste) : la « fiche de poste » n'existe pas
  encore dans l'erp. Tant qu'aucun choix n'est enregistré, l'utilisateur voit **tous les indicateurs que ses permissions autorisent**,
  dans l'ordre du catalogue. Quand E9 créera la fiche de poste, un accueil par défaut s'y rattachera (couche entre « choix de
  l'utilisateur » et « tous les indicateurs autorisés ») par une migration ; voir le plan de travail, ligne E0.5b.

## Catalogue des indicateurs

Le catalogue est fixe, dans `IndicateurAccueil` ; chaque indicateur exige la permission de lecture de son domaine.

| Code | Libellé | Permission | Source de la valeur |
|---|---|---|---|
| `paie.masse` | Masse salariale | `PAIE_READ` | `POST /paie/analytique`, dernier mois de paie, variation sur le mois précédent |
| `paie.effectif` | Bulletins de paie | `PAIE_READ` | idem |
| `paie.cout-moyen` | Coût moyen par personne | `PAIE_READ` | idem |
| `paie.stc` | Soldes de tout compte | `PAIE_READ` | idem |
| `employe.effectif` | Employés | `EMPLOYEE_READ` | `POST /employees/analytique` |
| `employe.en-poste` | Employés en poste | `EMPLOYEE_READ` | idem |
| `employe.age-moyen` | Âge moyen | `EMPLOYEE_READ` | idem |
| `employe.anciennete-moyenne` | Ancienneté moyenne | `EMPLOYEE_READ` | idem |
| `employe.embauches` | Embauches sur 12 mois | `EMPLOYEE_READ` | idem |

Ajouter un indicateur = une valeur dans `IndicateurAccueil`, son calcul dans `AccueilComponent` (frontend) et une ligne de ce
tableau. Une permission retirée à un utilisateur retire aussitôt l'indicateur de son accueil, même s'il l'avait choisi.

## Modèle

| Champ de `accueil_preference` | Type | Contraintes et rôle |
|---|---|---|
| `id` | `bigint` | Identifiant technique généré |
| `version` | `bigint` | Version optimiste ; obligatoire à la modification d'un choix existant |
| `utilisateur_id` | `bigint` | Obligatoire, unique, clé étrangère vers `utilisateur` (`ON DELETE CASCADE`) ; un seul choix par utilisateur |
| `indicateurs` | `varchar(500)` | Codes du catalogue, séparés par des virgules, dans l'ordre d'affichage |

Pas de ligne = aucun choix : tous les indicateurs autorisés. La table est auditée par Envers (`accueil_preference_aud`).

## Contrats DTO

| DTO et champ | Type | Description |
|---|---|---|
| `AccueilResponseDto.version` | `Long` ou `null` | Version du choix ; absente tant que rien n'est enregistré |
| `personnalise` | `boolean` | Vrai si un choix est enregistré |
| `indicateurs` | `List<String>` | Codes affichés, dans l'ordre, déjà filtrés par les permissions |
| `disponibles` | `List<IndicateurDisponibleDto>` | Indicateurs que les permissions autorisent : `code`, `libelle`, `description` |
| `AccueilUpdateRequestDto.version` | `Long` ou `null` | Version lue ; `null` pour un premier choix |
| `AccueilUpdateRequestDto.indicateurs` | `List<String>` | Au plus 20 codes, sans doublon, tous connus et autorisés |

Codes d'erreur : `400` indicateur inconnu, en double ou non autorisé ; `404` utilisateur introuvable ; `409` version périmée ;
`401`/`403` accès non autorisé.

## API et autorisations

| Méthode | Route | Permission | Rôle |
|---|---|---|---|
| `GET` | `/accueil` | `ACCUEIL_READ` | Lire son accueil et les indicateurs qu'on peut y mettre. |
| `PUT` | `/accueil` | `ACCUEIL_WRITE` | Choisir et ordonner ses indicateurs. |
| `DELETE` | `/accueil` | `ACCUEIL_WRITE` | Revenir à tous les indicateurs autorisés. |
| `GET` | `/accueil/utilisateurs/{id}` | `ACCUEIL_ADMIN` | Lire l'accueil d'un utilisateur. |
| `PUT` | `/accueil/utilisateurs/{id}` | `ACCUEIL_ADMIN` | Régler l'accueil d'un utilisateur. |
| `DELETE` | `/accueil/utilisateurs/{id}` | `ACCUEIL_ADMIN` | Rendre à un utilisateur tous ses indicateurs autorisés. |

À l'installation (`V42`), seul `SYSTEM_ADMIN` reçoit les trois permissions ; les autres rôles, dont `DIRECTION` (qui ne porte que la
consultation de la carte), n'en ont aucune tant que le propriétaire ne les leur attribue pas depuis l'écran Rôles.

## Audit

Chaque écriture passe par `@AuditableAction` : `ACCUEIL_MODIFICATION` et `ACCUEIL_REINITIALISATION`, avec l'instantané Envers du choix.

## Frontend

- `/accueil` (`ACCUEIL_READ`) : les tuiles `app-kpi` des indicateurs choisis, un bouton « Personnaliser » (avec `ACCUEIL_WRITE`
  côté serveur) qui ouvre `app-accueil-editeur` : liste ordonnée des indicateurs affichés (monter, descendre, retirer) et liste de
  ceux qu'on peut ajouter. Seules les sources nécessaires sont appelées (paie : dernier mois puis `POST /paie/analytique` ; fiches
  Employé : `POST /employees/analytique`). Sans paie, la tuile montre « — ».
- `/admin/users` : avec `ACCUEIL_ADMIN`, l'action « Régler l'accueil » ouvre le même éditeur pour l'utilisateur de la ligne.
- L'arrivée (`/`) mène au premier écran autorisé du menu ; l'Accueil en est le premier (`NAV_ITEMS`).

## IA

Voir [`../ia.md`](../ia.md) : l'outil MCP `accueil_lire` (lecture seule, `ACCUEIL_READ`) rend à l'assistant l'accueil de
l'utilisateur pour qui il agit. L'assistant ne règle pas l'accueil ; les valeurs se lisent avec les outils `paie_*` et `employes_*`.
