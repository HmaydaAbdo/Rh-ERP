# Audit

> Conventions d'audit applicables à tous les modules. Ce document est générique et réutilisable d'un projet à
> l'autre : il décrit un audit à trois couches (instantanés Envers, journal unique, événements de sécurité) et les
> garde-fous qui l'empêchent d'avoir des trous. Les noms de tables et de classes sont ceux du projet de référence ;
> le catalogue d'actions, les entités auditées et les décisions propres à un projet vivent dans sa documentation
> (`docs/audit/`), jamais ici.

---

# Ce que l'audit doit permettre de répondre

1. **Qui** a fait **quoi**, **quand**, **depuis où**, avec **quel résultat** — tentatives refusées comprises.
2. **À quoi ressemblaient les données avant** chaque modification ou suppression, champ par champ.
3. **Sur quel périmètre** a porté une opération de masse (import, suppression en groupe, export).
4. **Pouvoir le prouver** : l'application elle-même ne peut ni effacer ni réécrire l'historique.
5. **Pouvoir réparer** : le contenu d'une ligne supprimée reste récupérable.

Un audit n'est fiable que s'il ne laisse aucun chemin d'écriture sans trace. Les règles ci-dessous existent
chacune parce qu'un chemin a été trouvé qui passait sous le radar d'Envers seul — voir « Angles morts ».

---

# Architecture — trois couches

```text
 requête ──► MdcRequestFilter : identifiant de requête, utilisateur (logs + contexte d'audit)
                │
  service annoté @AuditableAction ──► GenericAuditAspect (dans la transaction métier)
                │                           │
                ▼                           ▼
  écritures JPA ──► Envers : <table>_aud    audit_journal  (OPERATION / ACCES)
                │   + audit_revision         ▲
                │   (qui, quand, d'où)       │ revision_id / request_id
                │                            │
  services d'authentification, refus 403 ──► événements Spring ──► écouteur unique ──► audit_journal (SECURITE)

  Garde-fous : tests d'architecture (CI) · droits PostgreSQL · vérification au démarrage
```

| Couche | Rôle | Alimentée par |
|---|---|---|
| **Instantanés** (Envers) | Chaque version de chaque ligne auditée : comparaison avant / après, restauration | Automatiquement, à chaque écriture JPA |
| **Journal** (`audit_journal`) | L'**intention** : quelle action, sur quel périmètre, avec quel résultat — et ce qu'Envers ne voit pas | `@AuditableAction` (aspect) et événements de sécurité |
| **Garde-fous** | L'audit ne peut pas avoir de trou, ni être réécrit | Tests d'architecture, droits de base de données |

* **Un seul mécanisme** pour toute l'application : jamais un second système d'audit, jamais de logique d'audit
  dupliquée dans un service.
* Les **logs ne remplacent jamais l'audit** (`conventions/logging.md`) : ils servent au diagnostic, l'audit à tracer
  les actions.

---

# Angles morts d'Envers — et comment ils sont fermés

Envers n'est pas un audit complet à lui seul. Chacun de ces trous est réel ; chaque fermeture est une règle de ce
document, vérifiée par un test.

| Angle mort | Pourquoi Envers ne voit rien | Fermé par |
|---|---|---|
| Suppression ou modification **en masse** (`deleteAllInBatch`, `@Modifying`, SQL natif) | Le SQL part directement, sans événement Hibernate | Aucune écriture en masse sur une entité auditée (« Garde-fous ») |
| **Cascade SQL** (`ON DELETE CASCADE`) | La base supprime les liaisons sans passer par Hibernate : un droit retiré, sans trace | `ON DELETE RESTRICT` sur toute table auditée ; l'application refuse (`409`) une suppression qui ôterait des liaisons |
| **Migrations de données** (Flyway, SQL) | Écrites hors JPA | Révision d'état initial, et gabarit de migration qui écrit aussi l'audit (`conventions/database.md`) |
| **Événements sans modification** (connexion, refus, jeton, mot de passe) | Aucune entité auditée ne change | Événements de sécurité (« Événements de sécurité ») |
| **Traitements sans utilisateur** (tâche planifiée, démarrage) | Aucune identité dans le contexte de sécurité | `BatchAuditContext`, origine explicite |
| **Opération en plusieurs transactions** | Une révision par transaction | Une entrée de journal pour l'ensemble, révisions reliées par `request_id` |
| **Rejet sans exception** (import dont les lignes sont rejetées, résultat renvoyé et non levé) | L'opération « réussit » du point de vue de la méthode | Le périmètre décide du résultat (« Périmètre d'une opération de masse ») |
| **Sorties de données** (export, rapport) | Lecture seule : aucune écriture | Catégorie `ACCES` |
| **Champs volontairement exclus** (mot de passe) | `@NotAudited` : aucune révision | Événement de sécurité dédié |
| **Audit impossible à écrire** | — | Fermé pour les données, ouvert pour la sécurité (« Défaillance de l'audit ») |
| **Oubli futur** (entité, colonne, écriture sans audit) | — | Tests d'architecture et `ddl-auto: validate` |
| **Compte de base unique** | L'application pourrait réécrire l'historique | Deux comptes PostgreSQL (« Intégrité ») |
| **Modification directe en base** | Hors application | **Limite assumée** (« Intégrité ») |

---

# Audit des entités — instantanés

* Toute entité est soit annotée `@Audited`, soit **explicitement exclue** avec sa justification dans le test
  d'architecture. Une entité qui n'est ni l'un ni l'autre fait échouer la CI.
* Sont exclus par principe : les **jetons techniques** (jeton de rafraîchissement, lien de réinitialisation — secrets
  à courte vie, leur vie est tracée par les événements de sécurité), et les entités d'audit elles-mêmes.
* Les champs sensibles sont exclus avec `@NotAudited`. **Ne jamais auditer un mot de passe, un secret ou une donnée
  confidentielle** ; leur modification est tracée comme événement de sécurité, sans valeur.
* Les relations sont stockées par identifiant (`<relation>_id`). Une entité auditée ne référence que des entités
  elles-mêmes auditées.
* Réglages Envers (`application.yml`) :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `audit_table_suffix` | `_aud` | Une table `<table>_aud` par entité |
| `revision_field_name` / `revision_type_field_name` | `rev` / `revtype` | Noms stables, écrits dans les migrations |
| `store_data_at_delete` | `true` | Une suppression conserve **tout le contenu** de la ligne : sans cela, ni comparaison ni restauration |
| Stratégie d'audit | **Par défaut (insertions seulement)** | La stratégie « validity » met à jour l'historique : incompatible avec un audit que l'application ne peut pas réécrire |
| `hibernate.jdbc.batch_size`, `order_inserts`, `order_updates` | Activés | Un import ou une suppression de plusieurs milliers de lignes écrit autant de lignes d'audit, envoyées par lots |

* Une écriture qui ne change aucune valeur auditée (enregistrement identique, modification d'un champ
  `@NotAudited` seul) **ne crée aucune révision** — c'est le comportement d'Envers, vérifié.

---

# Schéma d'audit

Créé par migration Flyway (`conventions/database.md`), jamais généré. `ddl-auto: validate` fait échouer le démarrage
si une table ou une colonne d'audit manque : un oubli devient une erreur immédiate.

* **`audit_revision`** — l'entité de révision d'Envers, une ligne par transaction qui modifie des données auditées :
  `id` (identité), `horodatage` (`TIMESTAMPTZ`), `utilisateur_id` (**sans clé étrangère** : l'historique survit au
  compte), `utilisateur_nom` (figé), `origine`, `request_id`, `adresse_ip`. Les types d'entités modifiés sont dans
  `audit_revision_entite` (`@ModifiedEntityNames`).
* **`<table>_aud`** — une par table auditée : `id`, `rev`, `revtype` (`0` ajout, `1` modification, `2` suppression),
  puis les colonnes auditées. Clé primaire (`id`, `rev`) ; index sur `rev`. Les tables de liaison ont pour clé
  (`rev`, `<id1>`, `<id2>`).
  * **Toutes les colonnes d'une table d'audit, hors `id` / `rev` / `revtype`, sont nullables** : un instantané de
    suppression ou une ancienne version n'ont pas forcément de valeur.
  * **Aucune clé étrangère vers une table métier** : une ligne d'historique doit survivre à la suppression de ce
    qu'elle décrit. Seule la clé vers `audit_revision` existe.
  * **Une colonne d'une table d'audit n'est jamais supprimée ni renommée** : elle documente ce que la donnée a été.
* **`audit_journal`** — le journal unique (voir ci-dessous).
* Horodatage : `Instant`, `TIMESTAMPTZ` (UTC) ; affiché à l'heure locale côté interface.

---

# Identité et contexte de la révision

Chaque révision et chaque entrée du journal enregistrent **qui, d'où, sous quel identifiant de requête**. Le
résolveur est unique (`ResolveurContexteAudit`) ; l'identité est résolue dans cet ordre :

1. `BatchAuditContext` — posé par un traitement hors requête (tâche planifiée, initialisation) ;
2. l'utilisateur authentifié de la requête (claims du JWT — identifiant du compte et identifiant de connexion, aucune
   requête en base) ;
3. à défaut : un visiteur `Anonyme` (requête sans authentification : connexion, mot de passe oublié), sinon
   `Système` d'origine `INCONNUE`.

* `origine` : `API`, `TACHE_PLANIFIEE`, `DEMARRAGE`, `MIGRATION`, et `INCONNUE` — jamais posée volontairement : elle
  **rend visible** une écriture faite hors de tout contexte (un oubli de `BatchAuditContext`) au lieu de l'attribuer
  à tort. Un test d'intégration vérifie qu'aucun scénario couvert ne la produit.
* **Tout traitement qui écrit hors requête ouvre un `BatchAuditContext`** (try-with-resources). L'identifiant
  d'exécution qu'il génère tient lieu de `request_id`, et est posé dans le MDC.
* `request_id` vient du MDC (`MdcRequestFilter`, `conventions/logging.md`) : il relie une révision, une entrée du
  journal et les logs techniques. L'adresse IP est celle du client réel (en-têtes du proxy, voir
  `conventions/deployment.md`).
* L'écouteur de révision Envers n'est pas un bean Spring : il ne dépend que de contextes statiques.

---

# Audit des opérations — `@AuditableAction`

* Toute opération métier qui **écrit** ou qui **fait sortir des données** est annotée `@AuditableAction`.
* L'annotation est placée sur les méthodes de **Service** (jamais Controller, jamais Repository).
* Ne jamais déduire une opération auditée à partir du nom de la méthode.

```java
@AuditableAction(action = "XXX_SUPPRESSION_GROUPE", type = TypeOperation.DELETE, entite = Xxx.class,
                 perimetre = PerimetreSuppressionGroupe.class)
```

| Attribut | Règle |
|---|---|
| `action` | Code stable de l'action (`<ENTITE>_<VERBE>`), constante : jamais construit dynamiquement |
| `categorie` | `OPERATION` (défaut : écriture) ou `ACCES` (sortie de données) — la catégorie `SECURITE` est réservée aux événements |
| `type` | `CREATE`, `UPDATE`, `DELETE` — obligatoire pour `OPERATION`. Une méthode « upsert » est un `UPDATE` |
| `entite` | Classe de la cible — obligatoire pour `OPERATION` |
| `perimetre` | Classe qui décrit une opération de masse (voir ci-dessous) — facultatif |

* **Identifiant de la cible** : le paramètre nommé `id` ; sinon l'`id` du résultat. Une méthode dont l'identifiant
  n'est pas un paramètre le **retourne** au lieu de `void`.
* **Une action de masse** (import, suppression en groupe, synchronisation) produit **une seule entrée**, avec le nombre
  d'éléments et un périmètre ; le détail ligne par ligne est dans les instantanés de sa révision.

## Périmètre d'une opération de masse

Une petite classe (`PerimetreAudit`, Strategy — justifiée : plusieurs opérations de masse aux paramètres différents,
sans logique d'audit dans les services) décrit, à partir des paramètres et du résultat :

* le **périmètre** (JSON : mois, critères, nom et **empreinte SHA-256** d'un fichier — jamais son contenu) ;
* le **nombre d'éléments** concernés ;
* le **résultat** : un traitement qui **rejette sans lever d'exception** (import dont des lignes sont refusées, résultat
  renvoyé) est un `ECHEC` — c'est au périmètre, qui connaît le résultat, de le dire.

Les implémentations vivent dans le module concerné, pas dans le module d'audit.

---

# Aspect

* Un seul aspect d'audit est utilisé : `GenericAuditAspect`. Le point d'entrée est `@AuditableAction`.
* Ne jamais créer un aspect dédié à une entité ou à un module.
* **Seule l'action annotée la plus externe produit une entrée** : un service annoté qui en appelle un autre (un import
  qui crée des référentiels manquants) n'écrit qu'une entrée ; la révision contient tout.
* **Ordre des intercepteurs explicite** : la transaction enveloppe l'aspect (l'aspect s'exécute dans la transaction
  métier). Cet ordre est posé par configuration et prouvé par un test d'intégration d'atomicité — jamais laissé aux
  valeurs par défaut.

---

# Transaction

| Cas | Où s'écrit l'entrée du journal | Garantie |
|---|---|---|
| Opération qui écrit et réussit | **Dans la même transaction**, après un `flush` (les contraintes sont vérifiées avant l'entrée) ; la révision est liée (`revision_id`) | Tout ou rien : données, instantanés et entrée sont validés ou annulés ensemble |
| Opération qui échoue (exception, `409`, rejet) | **Transaction séparée** (`REQUIRES_NEW`), `resultat = ECHEC`, `motif` | La tentative reste tracée alors que les données sont annulées |
| Sortie de données (`ACCES`) | Transaction séparée, après le succès | Une transaction en lecture seule ne peut pas écrire |
| Opération en plusieurs transactions | Une entrée pour l'ensemble, dans une transaction séparée ; ses révisions sont reliées par `request_id` | Le détail retrouve chaque révision |
| Enregistrement sans aucun changement | Entrée créée, liée à une révision **vide** (aucun instantané), détail « Aucun changement » | Trace fidèle de l'action demandée, qui, quand et d'où compris |

* Ne jamais enregistrer l'entrée « succès » d'une opération qui peut encore être annulée (l'ancien « après le commit »
  laissait une opération validée sans entrée en cas de panne entre les deux).
* Le motif d'un échec est le **type** de l'exception (nom court de la classe) — jamais son message, qui peut reprendre une
  donnée saisie, ni une trace d'appels. Ce qui précise le contexte (nombre de lignes, critères) vient du périmètre.

---

# Journal d'audit — `audit_journal`

* **Un seul journal**, trois catégories : `OPERATION` (opérations métier), `SECURITE` (événements de sécurité),
  `ACCES` (sorties de données). Un seul écran, une seule chronologie.
* Colonnes : `horodatage`, `categorie`, `action`, `type_operation`, `resultat` (`SUCCES` / `ECHEC`), l'identité et le
  contexte (`utilisateur_id`, `utilisateur_nom`, `origine`, `request_id`, `adresse_ip`, `user_agent` pour la
  sécurité), la cible (`entite_type`, `entite_id`), `nombre_elements`, `perimetre` (JSONB), `motif`, `revision_id`.
* Chaque entrée d'opération référence sa révision Envers (`revision_id`), ou, pour une opération en plusieurs
  transactions, ses révisions par `request_id`.
* Aucune route ne modifie ni ne supprime une entrée. Le journal ne transite jamais par un export.

---

# Événements de sécurité

Ce que le journal doit contenir et qu'Envers ne voit pas : **connexion réussie ou échouée** (motif :
identifiants invalides, compte inactif, compte inconnu), **déconnexion**, **réutilisation d'un jeton déjà consommé**
(vol présumé), **demande de réinitialisation** de mot de passe, **réinitialisation** (par lien, par un administrateur)
et **accès refusé** (`403`, avec méthode et route).

* Les services d'authentification **publient** un événement Spring (pattern Observer / Event,
  `conventions/design-patterns.md`) ; **un seul écouteur** l'écrit dans le journal. Un service ne dépend jamais du
  journal.
* Les refus d'accès (`403`) sont journalisés **à un point unique** : le framework de sécurité publie lui-même un événement
  de refus pour chaque contrôle — de méthode (`@PreAuthorize`) comme de chaîne de filtres —, que l'écouteur unique écrit
  (avec la méthode et la route). Jamais dans chaque contrôleur ; un visiteur non authentifié (`401`) n'est pas un refus.
* Ne sont pas journalisés (bruit) : les renouvellements de session réussis, les jetons expirés.
* **Minimisation des données personnelles** :
  * jamais de mot de passe, de jeton, de contenu de fichier (empreinte SHA-256 seulement) ;
  * un identifiant saisi lors d'une connexion échouée n'est conservé **que s'il correspond à un compte** — sinon on
    risque de stocker un mot de passe tapé dans le mauvais champ ;
  * une demande de mot de passe oublié ne conserve jamais l'adresse saisie (le compte seulement, s'il existe) ;
  * navigateur tronqué à 255 caractères.
* La réponse HTTP d'un événement ne change jamais (un compte inconnu et un mot de passe faux restent
  indiscernables pour l'appelant, `conventions/security.md`) : seul le journal connaît le motif.

---

# Défaillance de l'audit

* **Fermé pour les données** : si l'entrée d'une modification de données ne peut pas s'écrire, la modification échoue.
  On ne modifie jamais des données sans trace.
* **Ouvert pour la sécurité** : si un événement de sécurité ne peut pas s'écrire, l'opération continue (une panne
  d'audit ne doit pas empêcher tout le monde de se connecter) ; une erreur est loguée et **comptée** (métrique), pour
  qu'elle déclenche une alerte.
* Un échec d'écriture de l'entrée « échec » ne masque jamais l'exception d'origine.

---

# Garde-fous automatiques

Tests d'architecture (exécutés par la CI) — un oubli lors d'une évolution fait échouer le build au lieu de créer un
trou silencieux :

* toute entité est `@Audited` ou figure dans la liste des exclusions justifiées ;
* toute méthode d'écriture d'un service (`@Transactional` non `readOnly`) porte `@AuditableAction` ou figure dans la
  liste des **exceptions justifiées** (chaque ligne dit pourquoi) ;
* **aucune écriture en masse** sur une entité auditée : ni `deleteAllInBatch`, `deleteInBatch`, `deleteAll()` sans
  argument, ni requête `@Modifying`, ni SQL natif d'écriture — la suppression en groupe supprime **entité par
  entité**, seul moyen pour qu'Envers voie chaque ligne ;
* toute action `OPERATION` déclare son `type` et son `entite`.

Règles de schéma (`conventions/database.md`) : aucune cascade SQL sur une table auditée ; toute colonne ajoutée à une
entité auditée l'est à sa table d'audit, dans la même migration ; toute migration qui modifie des données auditées
suit le gabarit d'audit.

---

# Intégrité — l'application ne réécrit pas l'historique

* **Deux comptes PostgreSQL** : le propriétaire du schéma (utilisé par Flyway seulement) et un compte applicatif
  (exécution). Avec un seul compte, un `REVOKE` est cosmétique : le propriétaire peut tout.
* Le compte applicatif a `SELECT, INSERT, UPDATE, DELETE` sur les tables métier, et **`SELECT, INSERT` seulement** sur
  les tables d'audit. Les droits sont recalculés après chaque migration (rappel Flyway `afterMigrate`, idempotent) : un
  rappel plutôt qu'une migration, pour s'appliquer aussi aux tables créées plus tard.
* Vérification au démarrage : si le compte applicatif peut modifier une table d'audit, un `WARN` explicite et un
  indicateur de supervision le signalent.
* **Limite assumée** : une modification faite directement en base par le détenteur du compte propriétaire n'est pas
  capturée par l'application. Elle se limite aux administrateurs de la base ; l'extension `pgaudit` la tracerait si
  le besoin apparaît.
* Restauration d'une sauvegarde : l'audit est dans la même base que les données, il revient au même instant (cohérent).

---

# Détail des modifications

* Les différences avant/après sont **calculées à la demande**, jamais stockées.
* Utiliser `AuditReader` via `EnversDiffService`.
* Le détail ne transite jamais par la réponse de liste : il est exposé uniquement par `GET /logs/{id}/details`,
  **paginé** (une suppression en groupe de mille lignes produit mille éléments), et chargé par le frontend à
  l'ouverture du détail.
* Ajout → valeurs après ; modification → comparaison avec la version précédente ; suppression → valeurs avant
  (grâce à `store_data_at_delete`).
* Les relations simples (`@ManyToOne`, `@OneToOne`) sont comparées sur l'identifiant de la cible, jamais sur leur
  `toString()`. Les **collections de droits** (rôles, permissions) sont comparées comme **ensembles d'identifiants** :
  éléments ajoutés et éléments retirés.
* Le rendu d'une relation passe par `AuditLabelResolver` : `"<id> — <libellé>"`. L'identifiant est toujours conservé
  en tête — c'est la seule valeur exacte et toujours disponible ; le libellé peut avoir changé ou concerner une cible
  supprimée depuis.
* Ordre de résolution du libellé : `nom`, `nomPrenom`, `libelle`, `designation`, `intitule`, `reference`, `numero`, `code`,
  `username` ; à défaut, tout accesseur `getNumeroXxx` renvoyant une chaîne. Sans correspondance, seul l'identifiant
  est rendu.
* La résolution passe par les getters, jamais par les champs : sur un proxy Hibernate les champs déclarés sont ceux de
  la sous-classe générée et sont vides.
* Une erreur de lecture d'un champ ne doit jamais faire échouer la consultation du journal.
* Les montants, mois, booléens et énumérations sont formatés pour la lecture.
* Ne jamais comparer les champs manuellement dans un aspect.

---

# Consultation

* Lecture réservée à une **permission dédiée** (`AUDIT_READ`), attribuée à l'administrateur système seulement à
  l'installation, puis administrable comme toute permission (`conventions/security.md`). L'audit contient des données
  personnelles et des montants.
* Routes : recherche paginée du journal (filtres : dates, utilisateur, catégorie, action, résultat, entité), lecture
  d'une entrée, détail paginé, historique de toutes les versions d'un enregistrement. **Aucune route de modification
  ni de suppression** ; pagination bornée (`conventions/security.md`).
* Le bouton « Historique » d'un écran métier est visible seulement avec la permission d'audit.

---

# Données personnelles

L'audit contient des données personnelles (noms, identifiants nationaux, montants, adresses IP) : accès restreint,
minimisation (voir « Événements de sécurité »), aucune route d'export du journal. La **durée de conservation** et
l'articulation avec le droit à l'effacement sont des décisions **par projet** — à trancher avec le responsable des
données au regard de la loi applicable, jamais par défaut dans le code.

---

# Tests

* Architecture : les garde-fous ci-dessus.
* Intégration sur une vraie base (les instantanés, les transactions et les droits ne se simulent pas) — au minimum :
  création, modification, suppression (révision au bon nom, à la bonne origine, contenu conservé) ; transaction
  annulée (ni instantané ni entrée « succès », entrée « échec ») ; violation de contrainte au moment d'écrire ;
  action imbriquée (une seule entrée) ; traitement hors requête (origine explicite) ; écriture d'audit impossible ;
  opération volumineuse ; **chaque événement de sécurité** (et l'absence de donnée personnelle dans le journal) ;
  l'ordre transaction / aspect.
* Sécurité : l'application démarrée **avec le compte restreint** fonctionne, et ce compte ne peut ni modifier, ni supprimer,
  ni vider une table d'audit ; le gabarit de migration de `conventions/database.md` est exécuté tel quel par un test.
* Toute nouvelle opération annotée ajoute son scénario.

---

# Checklist — ajouter ou modifier

| Je… | Je dois… |
|---|---|
| Ajoute une **entité** | `@Audited` (ou exclusion justifiée dans le test d'architecture) ; table `<table>_aud` dans la **même migration** |
| Ajoute une **colonne** à une entité auditée | La même colonne, **nullable**, dans sa table `_aud`, dans la même migration |
| Ajoute une **opération d'écriture** | `@AuditableAction` sur la méthode du service, et la ligne dans le catalogue d'actions du projet |
| Ajoute une **opération de masse** ou un **export** | Une classe de périmètre ; suppression entité par entité ; catégorie `ACCES` pour une sortie |
| Écris une **migration qui modifie des données** | Le gabarit d'audit de `conventions/database.md` |
| Ajoute un **événement de sécurité** | Le publier depuis le service, l'écouteur unique l'écrit ; le tester |
| Écris un **traitement hors requête** | Ouvrir un `BatchAuditContext` |

---

# Principes

* Un seul mécanisme d'audit pour toute l'application.
* Toute nouvelle fonctionnalité sensible doit être auditée.
* Les instantanés Envers sont la source de vérité de l'historique ; le journal est la source de vérité de l'intention.
* Ne jamais dupliquer la logique d'audit dans les services ou les aspects.
* Un audit qui peut échouer en silence, ou être réécrit par ce qu'il surveille, n'est pas un audit.
