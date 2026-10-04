# Audit — journal, historique et garde-fous

> Ce document décrit **ce qui existe** dans rh-erp. Les règles réutilisables d'un projet à l'autre (comment écrire une
> entité, une migration, un service auditables) sont dans [`conventions/audit.md`](../../conventions/audit.md) et font foi ;
> la permission est décrite dans [rbac/audit.md](../rbac/audit.md), les tables dans [data-model.md](../data-model.md).

L'audit répond à cinq questions : **qui** a fait **quoi**, **quand**, **depuis où**, avec **quel résultat** (tentatives
refusées comprises) ; **à quoi ressemblaient les données avant** ; **sur quel périmètre** a porté une opération de masse ;
**peut-on le prouver** (l'application ne peut ni effacer ni réécrire l'historique) ; **peut-on réparer** (le contenu des
lignes supprimées est conservé).

---

## Les trois couches

| Couche | Contenu | Alimentée par |
|---|---|---|
| **Instantanés** (Hibernate Envers) | Chaque version de chaque ligne des entités métier et de sécurité : tables `<table>_aud`, révisions `audit_revision` | Automatiquement, à chaque écriture JPA |
| **Journal** (`audit_journal`) | Une entrée par opération (`OPERATION`), événement de sécurité (`SECURITE`) ou sortie de données (`ACCES`) : action, auteur, origine, périmètre, résultat | `@AuditableAction` (aspect `GenericAuditAspect`) et événements de sécurité |
| **Garde-fous** | Tests d'architecture (CI), deux comptes PostgreSQL, vérification au démarrage | — |

### Ce qui est audité

| Entité | Instantanés | Remarques |
|---|---|---|
| Bulletin de paie, employé, fonction, chantier, équipe | Oui | Relations stockées par identifiant |
| Compte utilisateur | Oui, **sauf le hash du mot de passe** | Inclut `actif`, l'employé lié, les rôles et les permissions refusées |
| Rôle, permission | Oui | Les liaisons rôle ↔ permission, compte ↔ rôle et compte ↔ permission refusée ont leur table `_aud` |
| Jeton de rafraîchissement, jeton de réinitialisation | **Non** | Secrets à courte vie : leur vie est tracée par les événements de sécurité |

L'historique des données antérieures à la mise en place de l'audit commence par une **révision d'état initial**
(migration `V14`, origine `MIGRATION`, entrée `AUDIT_ETAT_INITIAL`) : la première modification d'une donnée existante a
donc un « avant ».

---

## Qui, d'où, sous quelle requête

Chaque révision et chaque entrée portent : l'identifiant et le nom du compte **figés** (renommer ou désactiver un compte
ne réécrit pas l'histoire), l'origine, l'identifiant de requête et l'adresse IP. Ordre de résolution
(`ResolveurContexteAudit`) : contexte de traitement hors requête (`BatchAuditContext`) → utilisateur du JWT de la requête
→ `Anonyme` (requête sans authentification : connexion, mot de passe oublié) → `Système` d'origine `INCONNUE`.

| Origine | Quand |
|---|---|
| `API` | Une requête HTTP (utilisateur connecté ou visiteur) |
| `TACHE_PLANIFIEE` | La synchronisation quotidienne des chantiers (23 h) — utilisateur `Système` |
| `DEMARRAGE` | Création du compte administrateur au premier démarrage — utilisateur `Système` |
| `MIGRATION` | Migration de base de données qui écrit des données (état initial, gabarit) |
| `INCONNUE` | Une écriture hors de tout contexte : **un oubli rendu visible**, jamais attribué à tort. Un test vérifie qu'aucun scénario couvert n'en produit |

**Identifiant de requête** : `MdcRequestFilter` en génère un par requête (jamais repris du client), le pose dans les logs
(`requestId`, `userId`) et le renvoie dans l'en-tête de réponse **`X-Request-Id`**. Il relie une entrée du journal, ses
révisions et les logs techniques ; un utilisateur peut le citer pour qu'on retrouve sa requête. Un traitement planifié
reçoit son propre identifiant d'exécution.

**Adresse IP** : `X-Forwarded-For` posé par nginx, honoré par Tomcat uniquement de proxys internes
(`server.forward-headers-strategy: native`) ; le backend n'est joignable que par nginx (voir
[deployment.md](../deployment.md)).

---

## Règles transactionnelles

| Cas | Où s'écrit l'entrée | Garantie |
|---|---|---|
| Opération qui écrit et réussit | **Dans la transaction de l'opération**, après un `flush` ; liée à sa révision | Données, instantanés et entrée sont validés ou annulés ensemble |
| Opération qui échoue (exception, `409`, contrainte) | Transaction séparée, `resultat = ECHEC`, `motif` = type de l'exception | La tentative reste tracée, les données sont annulées |
| Import dont des lignes sont rejetées (résultat renvoyé, pas d'exception) | Transaction séparée, `ECHEC` | Le périmètre de l'import le déclare en échec |
| Sortie de données (`ACCES`) | Transaction séparée, après le succès | Sans trace, rien ne sort : si l'entrée ne peut pas s'écrire, l'export échoue |
| Synchronisation des chantiers (une transaction par chantier créé) | Une entrée pour l'ensemble ; chaque révision porte le même identifiant d'exécution | Le détail retrouve les révisions par `request_id` |
| Action annotée appelée par une action annotée (l'import de paie crée des fonctions) | Une seule entrée, celle de l'appel le plus externe | Pas de doublon, rien de perdu |
| Enregistrement sans aucun changement | Entrée avec une révision **vide** | Trace fidèle de l'action ; le détail dit « Aucun changement » |

**Fermé pour les données, ouvert pour la sécurité** : si l'entrée d'une modification ne peut pas s'écrire, la modification
échoue ; si un événement de sécurité ne peut pas s'écrire, la connexion continue, l'erreur est logguée et comptée
(`rh.audit.ecriture.echec`).

L'ordre des intercepteurs est explicite (`OrdreIntercepteurs`, `AuditConfig`) : la transaction enveloppe l'aspect. Le test
d'atomicité le prouve : une transaction annulée après une opération réussie ne laisse **ni entrée ni révision**.

---

## Catalogue des actions

| Domaine | Action (`audit_journal.action`) | Catégorie | Périmètre décrit |
|---|---|---|---|
| Paie | `PAIE_CREATION`, `PAIE_MODIFICATION`, `PAIE_SUPPRESSION` | `OPERATION` | — |
| Paie | `PAIE_SUPPRESSION_GROUPE` | `OPERATION` | Critères du groupe (mois, chantiers, équipes, fonctions, filtres de texte), nombre confirmé ; nombre supprimé. **Chaque bulletin** est supprimé entité par entité : tout leur contenu est dans la révision |
| Paie | `PAIE_IMPORT` | `OPERATION` | Nom, taille et **empreinte SHA-256** du fichier (jamais son contenu), mois, lignes, fonctions créées ; `ECHEC` si des lignes sont rejetées |
| Paie | `PAIE_EXPORT_EXCEL`, `PAIE_RAPPORT_PDF` | `ACCES` | Mois, format, chantiers / filtres demandés — aucun contenu |
| Employé | `EMPLOYE_CREATION`, `EMPLOYE_MODIFICATION`, `EMPLOYE_SUPPRESSION`, `EMPLOYE_IMPORT` | `OPERATION` | Import : le fichier |
| Fonction | `FONCTION_CREATION`, `FONCTION_MODIFICATION`, `FONCTION_SUPPRESSION`, `FONCTION_IMPORT` | `OPERATION` | Import : le fichier |
| Chantier | `CHANTIER_CREATION`, `CHANTIER_MODIFICATION`, `CHANTIER_SUPPRESSION`, `CHANTIER_SYNCHRONISATION` | `OPERATION` | Synchronisation : reçus, déjà présents, ignorés ; créés |
| Équipe | `EQUIPE_CREATION`, `EQUIPE_MODIFICATION`, `EQUIPE_SUPPRESSION` | `OPERATION` | — |
| Comptes | `UTILISATEUR_CREATION` (y compris l'administrateur du démarrage), `UTILISATEUR_MODIFICATION`, `UTILISATEUR_PERMISSIONS_REFUSEES` | `OPERATION` | — |
| Rôles et permissions | `ROLE_CREATION`, `ROLE_MODIFICATION`, `ROLE_SUPPRESSION` ; `PERMISSION_CREATION` (écrite par une migration qui ajoute une permission, origine `MIGRATION` — première : `V15`) | `OPERATION` | Migration : la permission et le nombre de rôles qui la reçoivent |
| Audit | `AUDIT_ETAT_INITIAL` | `OPERATION` | Nombre de lignes enregistrées par table |

### Événements de sécurité (`SECURITE`)

| Événement | Données conservées |
|---|---|
| `CONNEXION_REUSSIE` | Compte, IP, navigateur |
| `CONNEXION_ECHOUEE` | Motif (`IDENTIFIANTS_INVALIDES`, `COMPTE_INACTIF` — à la connexion comme au renouvellement de session —, `COMPTE_INCONNU`) ; le compte **seulement s'il existe** (un identifiant inconnu peut être un mot de passe tapé au mauvais endroit) |
| `DECONNEXION` | Compte |
| `JETON_REUTILISE` | Compte, nombre de sessions révoquées — signe d'un vol de jeton |
| `MOT_DE_PASSE_OUBLIE` | À chaque demande : le compte seulement s'il existe, **jamais l'adresse saisie** ; IP (repère les rafales) |
| `MOT_DE_PASSE_REINITIALISE` | Compte (par lien de courriel) |
| `MOT_DE_PASSE_REINITIALISE_PAR_ADMIN` | L'administrateur (acteur), le compte visé et le nombre de sessions coupées (détail) |
| `ACCES_REFUSE` | Compte, méthode et route refusées — **tous les `403`**, qu'ils viennent d'un `@PreAuthorize` ou de la chaîne de filtres (Spring Security publie un événement de refus unique, `EcouteurEvenementsSecurite`) |

Jamais de mot de passe, de jeton ni de contenu de fichier. Les renouvellements de session réussis et les jetons expirés ne
sont pas journalisés (bruit). La réponse HTTP ne change pas selon le motif : seul le journal le connaît.

---

## Consultation

| Route | Permission | Contenu |
|---|---|---|
| `POST /logs/search` | `AUDIT_READ` | Journal paginé ; filtres : dates, utilisateur (« contient », jokers neutralisés), catégorie, action, résultat, entité, identifiant de requête |
| `GET /logs/{id}` | `AUDIT_READ` | Une entrée avec son contexte complet et son périmètre |
| `GET /logs/{id}/details` | `AUDIT_READ` | Ce que l'opération a changé, champ par champ, **paginé** (une suppression de 1 000 bulletins = 1 000 éléments) |
| `GET /logs/historique/{entite}/{id}` | `AUDIT_READ` | Toutes les versions d'un enregistrement (`paie`, `employee`, `function`, `chantier`, `equipe`, `utilisateur`, `role`), de la plus récente à la plus ancienne |

Aucune route ne modifie ni ne supprime le journal. Les différences sont calculées à la demande (`EnversDiffService`) :
ajout → valeurs après ; modification → comparaison avec la version précédente ; suppression → valeurs avant ; relations →
`« <id> — <libellé> »` (`AuditLabelResolver`) ; collections de droits → éléments ajoutés et retirés ; les champs `@NotAudited`
n'apparaissent jamais.

**Écrans** : **Journal** (menu latéral, `/audit`, permission `AUDIT_READ`) — tableau aux conventions du projet, filtres en
temps réel, panneau latéral par entrée (contexte, périmètre, modifications paginées, lien « toutes les entrées de cette
requête ») ; bouton **Historique** sur le détail d'un bulletin et d'un employé, visible avec `AUDIT_READ`. Les horodatages
sont stockés en UTC et affichés à l'heure de Casablanca.

---

## Intégrité — l'application ne réécrit pas l'historique

- **Deux comptes PostgreSQL** : le propriétaire (`DB_MIGRATION_USER`, Flyway seulement) et le compte applicatif (`DB_USER`).
  Le rappel Flyway `db/migration/afterMigrate.sql` (idempotent, rejoué après chaque migration) **crée** le compte applicatif
  s'il n'existe pas et lui donne `SELECT, INSERT, UPDATE, DELETE` sur les tables métier, **`SELECT, INSERT` seulement** sur
  `audit_*` et `*_aud`, `SELECT` sur `flyway_schema_history`. Quand les deux comptes sont identiques (développement, CI), il
  ne fait rien.
- **Vérification au démarrage** (`VerificationIntegriteAudit`) : si le compte applicatif peut modifier une table d'audit, un
  `WARN` explicite et la jauge `rh.audit.integrite.compromise` (1) le signalent. En développement avec un seul compte,
  c'est attendu.
- **Preuve** : `AuditIntegriteTest` démarre l'application *comme en production* (Flyway propriétaire, application avec le
  compte restreint) : les opérations métier et la suppression en groupe fonctionnent, et `UPDATE`, `DELETE`, `TRUNCATE`,
  `ALTER` sur les tables d'audit sont refusés par PostgreSQL.
- **Limite assumée** : une modification faite directement en base par le détenteur du compte propriétaire n'est pas
  capturée par l'application. Elle est réservée aux administrateurs de la base ; l'extension `pgaudit` la tracerait si le
  besoin apparaissait (voir `TODO.md`).

---

## Angles morts d'Envers et leur fermeture

| Angle mort | Fermé par | Preuve |
|---|---|---|
| Suppression en groupe invisible (`deleteAllInBatch` : mesuré, 1 000 bulletins supprimés = 0 trace) | Suppression **entité par entité** ; test d'architecture qui interdit `deleteAllInBatch`, `@Modifying`, `executeUpdate`, `JdbcTemplate.update` | `AuditOperationTest`, `AuditArchitectureTest` |
| Retrait silencieux de droits (`ON DELETE CASCADE`) | `ON DELETE RESTRICT` (`V13`) ; un rôle attribué n'est pas supprimable (`409`), `SYSTEM_ADMIN` protégé | `AuditOperationTest` |
| Migrations qui écrivent des données | État initial (`V14`) et gabarit de migration auditée ([`conventions/database.md`](../../conventions/database.md)) | `AuditRevisionTest`, `AuditMigrationGabaritTest` |
| Compte PostgreSQL unique | Deux comptes, `afterMigrate.sql`, vérification au démarrage | `AuditIntegriteTest` |
| Événements sans modification de données | Événements de sécurité, un seul écouteur | `AuditSecurityEventsTest` |
| Écritures sans utilisateur (tâche planifiée, démarrage) | `BatchAuditContext`, origine explicite, `INCONNUE` visible | `AuditSynchronisationTest`, `AuditRevisionTest` |
| Opération en plusieurs transactions | Une entrée, révisions reliées par `request_id` | `AuditSynchronisationTest`, `AuditConsultationTest` |
| Import rejeté sans exception | Le périmètre de l'import le déclare en échec | `AuditImportTest` |
| Sorties de données | Catégorie `ACCES` | `AuditAccesTest` |
| Champ volontairement non audité (mot de passe) | `@NotAudited` + événement de sécurité | `AuditRevisionTest`, `AuditSecurityEventsTest` |
| Audit impossible à écrire | Fermé pour les données, ouvert pour la sécurité, compteur | `AuditDefaillanceTest` |
| Contenu supprimé non conservé | `store_data_at_delete = true` | `AuditRevisionTest`, `AuditConsultationTest` |
| Oubli futur (entité, colonne, écriture) | Tests d'architecture ; `ddl-auto: validate` | `AuditArchitectureTest` |
| Logs sans identité ni requête, avec données personnelles | `MdcRequestFilter` ; plus aucun texte saisi dans le log de suppression en groupe | `AuditSecurityEventsTest` (identifiant de requête), revue de code |
| Faux refus `403` qui noieraient le journal | La barre de filtres de la paie masque les sélecteurs dont la permission manque | `paie-filtres.component.spec.ts` |
| Identité qui change après coup | `utilisateur_nom` figé, `utilisateur_id` sans clé étrangère | `AuditRevisionTest` |
| Modification directe en base | Limite assumée (voir ci-dessus) | — |

---

## Procédures

### Bascule de la production sur deux comptes
1. Ajouter dans `.env` du serveur `POSTGRES_APP_USER` et `POSTGRES_APP_PASSWORD` (voir `.env.example` ; mot de passe sans apostrophe).
2. `docker compose pull && docker compose up -d` : Flyway (compte propriétaire) applique les migrations d'audit, **crée le
   compte applicatif et ses droits**, puis l'application se connecte avec ce compte.
3. Vérifier dans les logs : « Intégrité de l'audit : le compte applicatif ne peut pas modifier les tables d'audit ».
4. **Retour arrière** : retirer les deux variables — l'application retrouve le compte unique (le compte applicatif reste
   créé mais inutilisé ; `DROP OWNED BY <compte>; DROP ROLE <compte>;` pour le supprimer).

Essai conseillé d'abord sur une copie de la base (le déploiement a été vérifié ainsi sur une copie des données réelles :
4 migrations en 0,14 s, 2 357 lignes d'état initial).

### Restauration d'une sauvegarde
L'audit est dans la même base que les données : une restauration ramène les deux au même instant (cohérent). Ce qui s'est
passé entre la sauvegarde et la restauration n'existe plus, audit compris — à noter dans le registre d'exploitation.

### Écrire une migration qui modifie des données auditées
Suivre le gabarit de [`conventions/database.md`](../../conventions/database.md) (« Migrations qui modifient des données
auditées ») ; il est exécuté tel quel par `AuditMigrationGabaritTest`. Exemple — attribuer une nouvelle permission à un rôle :

```sql
DO $$
DECLARE v_rev BIGINT;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL) RETURNING id INTO v_rev;

    WITH p AS (INSERT INTO permission (code, description) VALUES ('XXX_READ', '…') RETURNING *)
    INSERT INTO permission_aud (id, rev, revtype, code, description) SELECT id, v_rev, 0, code, description FROM p;

    WITH l AS (INSERT INTO role_permission (role_id, permission_id)
               SELECT r.id, p.id FROM role r, permission p WHERE r.nom = 'SYSTEM_ADMIN' AND p.code = 'XXX_READ' RETURNING *)
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) SELECT v_rev, 0, role_id, permission_id FROM l;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'), (v_rev, 'staport.rh.auth.entities.Role');
    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine, request_id, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_AJOUT', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           '{"migration": "V<n>__xxx"}'::jsonb, id FROM audit_revision WHERE id = v_rev;
END $$;
```

### Ajouter une entité, une colonne, une opération
Voir la checklist de [`conventions/audit.md`](../../conventions/audit.md). Les tests d'architecture font échouer la CI si
une entité n'est ni `@Audited` ni explicitement exclue, ou si une méthode d'écriture d'un service n'a ni
`@AuditableAction` ni exception justifiée (`ECRITURES_NON_ANNOTEES` dans `AuditArchitectureTest`) ; `ddl-auto: validate`
fait échouer le démarrage si une colonne manque à une table `_aud`.

---

## Performance (mesurée sur PostgreSQL 17, 1 000 bulletins)

| Opération | Sans audit | Avec audit |
|---|---|---|
| Import dans une transaction (comme `PaieImportService`) | ≈ 1,0 s | ≈ 1,1 à 1,5 s |
| Suppression en groupe, entité par entité | 0,07 à 0,15 s | 0,16 à 0,26 s |

L'écriture regroupée (`hibernate.jdbc.batch_size=50`, `order_inserts`, `order_updates`) rend le coût de l'audit négligeable :
aucune écriture asynchrone (qui affaiblirait l'atomicité) n'est nécessaire. Volume : quelques dizaines de milliers de lignes
d'audit par an.

---

## Décisions confirmées avec la RH (2026-10-04)

| Sujet | Décision |
|---|---|
| Durée de conservation | **Tout est conservé**, aucune purge |
| Qui lit le journal | **`SYSTEM_ADMIN` seulement** à l'installation ; `AUDIT_READ` administrable depuis l'écran Rôles |
| Consultations de salaires | **Non journalisées** ; seuls les exports le sont |
| Preuve d'intégrité opposable (chaînage, ancrage externe) | **Non** : la séparation des comptes PostgreSQL suffit |
| Restauration d'un groupe supprimé | Pas d'outil pour l'instant : le contenu est conservé (`revtype = 2`) ; voir `TODO.md` |
| Suppression d'un rôle | Refusée s'il est attribué ; `SYSTEM_ADMIN` protégé (réversible) |

Données personnelles (loi 09-08) : l'audit contient des noms, des CIN, des salaires et des adresses IP — accès restreint à
`AUDIT_READ`, minimisation (voir « Événements de sécurité »), aucune route d'export du journal. L'historique de paie est tenu
au titre d'une obligation de l'employeur, ce qui justifie sa conservation.

---

## Tests

Tous sur une vraie base PostgreSQL (`AuditIntegrationTestBase`) sauf l'architecture : `AuditArchitectureTest`,
`AuditRevisionTest` (socle), `AuditOperationTest` (S1 à S5, S11 à S17, 1 000 bulletins), `AuditImportTest`,
`AuditSynchronisationTest`, `AuditSecurityEventsTest`, `AuditAccesTest`, `AuditDefaillanceTest`, `AuditMigrationGabaritTest`,
`AuditIntegriteTest`, `AuditConsultationTest` ; côté frontend `journal.component.spec.ts`,
`audit-historique.component.spec.ts`, `audit-champs.component.spec.ts`, `audit-format.spec.ts`. Voir [testing.md](../testing.md).
