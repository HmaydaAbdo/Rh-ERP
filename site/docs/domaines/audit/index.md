---
title: "Audit — journal, historique et garde-fous"
sidebar_position: 1
---

> Ce document décrit **ce qui existe** dans Staport Intelligence. Les règles réutilisables d'un projet à l'autre (comment écrire une
> entité, une migration, un service auditables) sont dans `conventions/audit.md` (`conventions/audit.md`) et font foi ;
> la permission est décrite dans [rbac/audit.md](droits.md), les tables dans data-model.md ([architecture/modele-de-donnees](../../architecture/modele-de-donnees.md)).

L'audit répond à cinq questions : **qui** a fait **quoi**, **quand**, **depuis où**, avec **quel résultat** (tentatives
refusées comprises) ; **à quoi ressemblaient les données avant** ; **sur quel périmètre** a porté une opération de masse ;
**peut-on le prouver** (l'application ne peut ni effacer ni réécrire l'historique) ; **peut-on réparer** (le contenu des
lignes supprimées est conservé).

Le [modèle et les contrats DTO](contrats.md) décrivent les filtres, réponses, types et contraintes du
journal et des différences. Ce domaine expose uniquement des consultations ; la restauration de Paie
reste une action du domaine Paie avec sa propre permission.

---

## Les trois couches

| Couche | Contenu | Alimentée par |
|---|---|---|
| **Instantanés** (écouteurs de session SQLAlchemy) | Chaque version de chaque ligne des entités métier et de sécurité : tables `<table>_aud`, révisions `audit_revision` | Automatiquement, à chaque écriture de la session |
| **Journal** (`audit_journal`) | Une entrée par opération (`OPERATION`), événement de sécurité (`SECURITE`) ou accès (`ACCES`) : action, auteur, origine, périmètre, résultat | Décorateur d'action auditée et événements de sécurité |
| **Garde-fous** | Tests d'architecture (CI), deux comptes PostgreSQL, vérification au démarrage | — |

Les composants transverses, dont la sécurité, écrivent via la façade `IAuditJournalWriter`. Son implémentation
`Audit` (`api/src/staport/domains/audit/service.py`) gère les écritures dans la transaction courante ou dans une transaction séparée ; les consommateurs
hors du domaine audit dépendent de l'interface.

> **Backend Python (FastAPI)** : sur décision du propriétaire (2026-11-03), l'audit ne trace que les opérations qui
> changent l'état et les événements de sécurité. Les catégories `ACCES` et `LECTURE_METIER` (lectures, exports, appels MCP
> de lecture) ne sont plus écrites ; l'historique déjà produit reste lisible.

### Ce qui est audité

| Entité | Instantanés | Remarques |
|---|---|---|
| Bulletin de paie, employé, fonction, chantier, équipe | Oui | Relations stockées par identifiant |
| Compte utilisateur | Oui, **sauf le hash du mot de passe** | Inclut `actif`, l'employé lié, les rôles et les permissions refusées |
| Rôle, permission | Oui | Les liaisons rôle ↔ permission, compte ↔ rôle et compte ↔ permission refusée ont leur table `_aud` |
| Jeton de rafraîchissement, jeton de réinitialisation | **Non** | Secrets exclus des instantanés ; émission, renouvellement, refus, révocation, déconnexion et réinitialisation sont tracés par événements de sécurité sans enregistrer les jetons |

L'historique des données antérieures à la mise en place de l'audit commence par une **révision d'état initial**
(migration `V14`, origine `MIGRATION`, entrée `AUDIT_ETAT_INITIAL`) : la première modification d'une donnée existante a
donc un « avant ».

---

## Qui, d'où, sous quelle requête

Chaque révision et chaque entrée portent : l'identifiant et le nom du compte **figés** (renommer ou désactiver un compte
ne réécrit pas l'histoire), l'origine, l'identifiant de requête et l'adresse IP. Ordre de résolution
(`contexte_audit_courant`) : contexte de traitement hors requête (`contexte_batch`) → utilisateur du JWT de la requête
→ `Anonyme` (requête sans authentification : connexion, mot de passe oublié) → `Système` d'origine `INCONNUE`.

| Origine | Quand |
|---|---|
| `API` | Une requête HTTP (utilisateur connecté ou visiteur) |
| `TACHE_PLANIFIEE` | La synchronisation quotidienne des chantiers (23 h) — utilisateur `Système` |
| `DEMARRAGE` | Création du compte administrateur au premier démarrage — utilisateur `Système` |
| `MIGRATION` | Migration de base de données qui écrit des données (état initial, gabarit) |
| `INCONNUE` | Une écriture hors de tout contexte : **un oubli rendu visible**, jamais attribué à tort. Un test vérifie qu'aucun scénario couvert n'en produit |

**Identifiant de requête** : Le middleware de requête (`platform/requete.py`) en génère un par requête (jamais repris du client), le pose dans les logs
(`requestId` uniquement) et le renvoie dans l'en-tête de réponse **`X-Request-Id`**. Le contexte est porté par une variable de
contexte, sans donnée d'identité. Il relie une entrée du journal, ses
révisions et les logs techniques ; un utilisateur peut le citer pour qu'on retrouve sa requête. Un traitement planifié
reçoit son propre identifiant d'exécution.

**Adresse IP** : `X-Forwarded-For` posé par nginx, honoré par uvicorn uniquement de proxys internes
(`--forwarded-allow-ips`) ; le backend n'est joignable que par nginx (voir
deployment.md ([exploitation/deploiement](../../exploitation/deploiement.md))).

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

L'écouteur de session SQLAlchemy écrit le journal dans la transaction de l'opération (`ecouteur.py`). Le test
d'atomicité le prouve : une transaction annulée après une opération réussie ne laisse **ni entrée ni révision**.

---

## Catalogue des actions

| Domaine | Action (`audit_journal.action`) | Catégorie | Périmètre décrit |
|---|---|---|---|
| Paie | `PAIE_CREATION`, `PAIE_MODIFICATION`, `PAIE_SUPPRESSION` | `OPERATION` | — |
| Paie | `PAIE_SUPPRESSION_GROUPE` | `OPERATION` | Critères du groupe (mois, chantiers, équipes, fonctions, filtres de texte), nombre confirmé ; nombre supprimé. **Chaque bulletin** est supprimé entité par entité : tout leur contenu est dans la révision |
| Paie | `PAIE_RESTAURATION_GROUPE` | `OPERATION` | Identifiant de l'entrée source et nombre recréé ; les données restaurées sont dans la révision des nouveaux bulletins |
| Paie | `PAIE_IMPORT` | `OPERATION` | Nom, taille et **empreinte SHA-256** du fichier (jamais son contenu), mois, bulletins créés, départs et retours ; `ECHEC` (motif `PaieImportException`) si le fichier n'est pas prêt — rien n'est alors enregistré. Les départs (`EMPLOYE_SORTIE`) et retours sont des actions imbriquées : leurs versions sont dans la révision de l'import |
| Paie | `PAIE_IMPORT_CORRECTION` | `OPERATION` | Corrections de l'assistant d'import : le fichier de référence (nom, taille, empreinte), le mois, le nombre de fiches alignées et d'employés créés ; chaque version de fiche (et fonction créée) est dans la révision de l'entrée |
| Paie | `PAIE_EXPORT_EXCEL`, `PAIE_RAPPORT_PDF` | `ACCES` | Mois, format, chantiers / filtres demandés — aucun contenu |
| Heures supplémentaires | `HEURES_SUP_EXPORT_PDF` | `ACCES` | Mois, format, filtres et tri demandés — aucun contenu |
| Assistant IA | `MCP_<OUTIL>` (historique existant seulement) | `ACCES` | Chaque appel d'un outil MCP de lecture, pour l'utilisateur pour qui l'agent agit. **Plus écrit par le serveur MCP** (décision du propriétaire, 2026-11-04) : le diagnostic des appels d'outils (outil, utilisateur, statut, nombre de résultats) est dans les traces Phoenix, conservées sans limite ; l'émission du jeton agent et les accès refusés restent des événements de sécurité |
| API sécurité | `TENTATIVE_HTTP_REJETEE` | `SECURITE` | Écriture HTTP d’authentification rejetée ; méthode, route et statut, sans secret |
| Employé | `EMPLOYE_CREATION`, `EMPLOYE_MODIFICATION`, `EMPLOYE_SUPPRESSION`, `EMPLOYE_IMPORT` ; `EMPLOYE_SORTIE` (départs enregistrés — première écriture : la reprise `V30`, origine `MIGRATION`, qui écrit aussi une `EMPLOYE_MODIFICATION` et une `EMPLOYE_SUPPRESSION` groupées) | `OPERATION` | Import : le fichier ; `V30` : la migration, le dernier mois de paie, le nombre de lignes |
| Fonction | `FONCTION_CREATION`, `FONCTION_MODIFICATION`, `FONCTION_SUPPRESSION`, `FONCTION_IMPORT` | `OPERATION` | Import : le fichier |
| Chantier | `CHANTIER_CREATION`, `CHANTIER_MODIFICATION`, `CHANTIER_SUPPRESSION`, `CHANTIER_SYNCHRONISATION` | `OPERATION` | Synchronisation : reçus, déjà présents, ignorés ; créés |
| Équipe | `EQUIPE_CREATION`, `EQUIPE_MODIFICATION`, `EQUIPE_SUPPRESSION` | `OPERATION` | — |
| Comptes | `UTILISATEUR_CREATION` (y compris l'administrateur du démarrage), `UTILISATEUR_MODIFICATION`, `UTILISATEUR_PERMISSIONS_REFUSEES` | `OPERATION` | — |
| Rôles et permissions | `ROLE_CREATION`, `ROLE_MODIFICATION`, `ROLE_SUPPRESSION` ; `PERMISSION_CREATION` (écrite par une migration qui ajoute une permission, origine `MIGRATION` — première : `V15`) ; `ROLE_CREATION` écrite aussi par une migration quand elle crée un rôle (`V28`, rôle `DIRECTION` ; `0010`, rôle `CHARGE_RH`, qui écrit aussi `UTILISATEUR_CREATION` pour le compte qu'elle crée) | `OPERATION` | Migration : la permission et le nombre de rôles qui la reçoivent |
| Audit | `AUDIT_ETAT_INITIAL` | `OPERATION` | Nombre de lignes enregistrées par table |
| Paramètres | `PARAMETRE_MODIFICATION` | `OPERATION` | — |

### Événements de sécurité (`SECURITE`)

| Événement | Données conservées |
|---|---|
| `CONNEXION_REUSSIE` | Compte, IP, navigateur |
| `CONNEXION_ECHOUEE` | Motif (`IDENTIFIANTS_INVALIDES`, `COMPTE_INACTIF`, `COMPTE_INCONNU`, `COMPTE_TEMPORAIREMENT_BLOQUE`) ; le compte **seulement s'il existe** (un identifiant inconnu peut être un mot de passe tapé au mauvais endroit) |
| `COMPTE_BLOQUE_TEMPORAIREMENT` | Compte et règle déclenchée (5 erreurs dans une fenêtre de 15 minutes, blocage de 15 minutes) ; aucun secret saisi |
| `SESSION_RENOUVELEE` | Compte ; aucune donnée du jeton |
| `SESSION_RENOUVELLEMENT_REFUSE` | Compte s'il est connu et motif catégorisé (`JETON_INCONNU`, `JETON_EXPIRE`, `COMPTE_INACTIF`) |
| `SESSIONS_REVOQUEES` | Compte acteur, identifiant du compte cible et nombre de sessions révoquées |
| `DECONNEXION` | Compte s'il est identifié ; sinon tentative sans session valide |
| `JETON_REUTILISE` | Compte, nombre de sessions révoquées — signe d'un vol de jeton |
| `ACCES_ANONYME_REFUSE` | Méthode, statut `401` et identifiant de requête ; aucun token ni corps de requête |
| `MOT_DE_PASSE_OUBLIE` | À chaque demande : le compte seulement s'il existe, **jamais l'adresse saisie** ; IP (repère les rafales) |
| `MOT_DE_PASSE_REINITIALISE` | Compte (par lien de courriel) |
| `MOT_DE_PASSE_REINITIALISE_PAR_ADMIN` | L'administrateur (acteur), le compte visé et le nombre de sessions coupées (détail) |
| `ACCES_REFUSE` | Compte, méthode et route refusées — **tous les `403`**, qu'ils viennent d'un contrôle de permission de route ou de la dépendance d'authentification (un événement de refus unique) |

Jamais de mot de passe, de jeton ni de contenu de fichier. Les renouvellements de session réussis, les refus sur jeton
inconnu ou expiré, les réutilisations d'un jeton révoqué, les révocations groupées, les déconnexions et les changements de
mot de passe sont tracés sans conserver les secrets. La réponse HTTP ne change pas selon le motif : seul le journal le connaît.

---

## Consultation

| Route | Permission | Contenu |
|---|---|---|
| `POST /logs/search` | `AUDIT_READ` | Journal paginé ; filtres : dates, utilisateur (« contient », jokers neutralisés), catégories/actions/entités multiples, résultat, identifiant de requête. Les critères singuliers restent acceptés pour compatibilité. |
| `GET /logs/{id}` | `AUDIT_READ` | Une entrée avec son contexte complet et son périmètre |
| `GET /logs/{id}/details` | `AUDIT_READ` | Ce que l'opération a changé, champ par champ, **paginé** (une suppression de 1 000 bulletins = 1 000 éléments) |
| `GET /logs/historique/{entite}/{id}` | `AUDIT_READ` | Toutes les versions d'une entité auditée (`paie`, `employee`, `function`, `chantier`, `equipe`, `utilisateur`, `role`, `permission`, `parametre`, notamment), de la plus récente à la plus ancienne |

Le journal reste non modifiable. La restauration d'un groupe n'altère pas l'entrée source : le bouton visible sur une suppression
de groupe réussie appelle `POST /paie/restauration/{idEntreeAudit}` (`PAIE_RESTORE`). L'audit fournit à Paie les instantanés
`*_aud` ; Paie vérifie les références et les conflits employé × mois, puis recrée le groupe dans une transaction avec de nouveaux
identifiants. Un conflit rejette tout le groupe (`409`). L'opération `PAIE_RESTAURATION_GROUPE` trace son succès ou son échec et
référence l'entrée d'audit source sans recopier les données salariales dans son périmètre.

Aucune route ne modifie ni ne supprime le journal. Les différences sont calculées à la demande (`consultation.py`) :
ajout → valeurs après ; modification → comparaison avec la version précédente ; suppression → valeurs avant ; relations →
`« <id> — <libellé> »` (`consultation.py`) ; collections de droits → éléments ajoutés et retirés ; les champs absents du registre d'audit
n'apparaissent jamais.

**Écrans** : **Journal** (menu latéral, `/audit`, permission `AUDIT_READ`) — tableau aux conventions du projet, filtres en
temps réel, panneau latéral par entrée (contexte, périmètre, modifications paginées, lien « toutes les entrées de cette
requête ») ; bouton **Historique** sur le détail d'un bulletin et d'un employé, visible avec `AUDIT_READ`. Les horodatages
sont stockés en UTC et affichés à l'heure de Casablanca.

Les filtres reviennent à la première page du journal. Une réponse tardive ne peut pas remplacer la
recherche ou l'entrée sélectionnée plus récemment. Le chargement de l'entrée, de ses modifications et
de l'historique dispose d'un état annoncé ; les erreurs de lecture sont distinguées d'un résultat vide
et proposent un réessai. Une page d'historique échouée est redemandée avant de passer à la suivante,
sans perdre les versions déjà affichées. Changer d'enregistrement recharge son propre historique.

Il n'existe ni import ni export du journal, ni vue Cartes ou Analytique : la consultation porte sur des
événements et des versions, sans indicateur Paie ajouté au domaine.

---

## Intégrité — l'application ne réécrit pas l'historique

- **Deux comptes PostgreSQL** : le propriétaire (`DB_MIGRATION_USER`, migrations seulement) et le compte applicatif (`DB_USER`).
  Les droits sont recalculés après chaque migration (`api/src/staport/migrations/droits.py`, idempotent) : le module **crée** le
  compte applicatif s'il n'existe pas et lui donne `SELECT, INSERT, UPDATE, DELETE` sur les tables métier, **`SELECT, INSERT` seulement** sur
  `audit_*` et `*_aud`, `SELECT` sur l'historique des migrations. Quand les deux comptes sont identiques (développement, CI), il
  ne fait rien.
- **Vérification au démarrage** (`VerificationIntegrite`) : si le compte applicatif peut modifier une table d'audit, un
  `WARN` explicite et la jauge `rh_audit_integrite_compromise` (1) le signalent. En développement avec un seul compte,
  c'est attendu.
- **Preuve** : `test_audit.py` démarre l'application *comme en production* (migrations par le propriétaire, application avec le
  compte restreint) : les opérations métier et la suppression en groupe fonctionnent, et `UPDATE`, `DELETE`, `TRUNCATE`,
  `ALTER` sur les tables d'audit sont refusés par PostgreSQL.
- **Chaîne locale** (`V19`) : chaque entrée de `audit_journal` porte le SHA-256 de son contenu et le hash précédent ; le
  chaînage existant est initialisé par migration, puis un trigger sérialise les ajouts. La chaîne est vérifiée au démarrage
  et une fois par jour ; une rupture produit une erreur et la jauge `rh_audit_chaine_invalide`. Elle détecte une altération
  incohérente, mais ne résiste pas à un superutilisateur qui réécrit les données et recalcule toute la chaîne : aucun ancrage
  externe n'est configuré.
- **SQL PostgreSQL direct dans la base Staport Intelligence uniquement** (`pgAudit`, `V20`) : l'image PostgreSQL 18 du projet précharge l'extension ; en production,
  `PGAUDIT_ENABLED=true` crée l'extension et active toutes les classes `all`, y compris `ROLE` (création/modification/
  suppression de rôles et changements de privilèges). Aucune classe pgAudit n'est exclue. `log_parameter=off` évite de
  recopier les valeurs de paramètres préparés. pgAudit remplace le texte après le mot-clé `PASSWORD` par `<REDACTED>` dans
  les commandes directes `CREATE ROLE` et `ALTER ROLE`. Sa propre documentation précise que cette protection ne couvre pas
  tous les cas : `droits.py` masque donc le texte SQL uniquement pendant la transaction qui reçoit le secret, tout
  en conservant les événements de classe, commande et objet ; le réglage est rétabli ensuite. Aucun secret brut ne doit être
  ajouté à une migration ou à une commande SQL sans avoir confirmé sa redaction effective. Le réglage est au niveau
  de la base Staport Intelligence, pas du cluster : les commandes exécutées dans une autre base ne sont pas couvertes.
  **Validation locale (2026-10-11)** : l'image `database/Dockerfile` a été construite ; PostgreSQL 18.6 démarre avec
  pgAudit préchargé, `CREATE EXTENSION pgaudit` réussit et une requête de contrôle produit une ligne `AUDIT: SESSION`.
  Cette preuve ne remplace pas l'activation et le contrôle sur le serveur de production.
  Les journaux CSV tournent quotidiennement dans le volume PostgreSQL. Décision RH du 2026-10-15 : leur conservation est
  limitée à 90 jours, distincte de la conservation à vie décidée pour `audit_journal` et les tables `*_aud`. Le service Compose
  `postgres-log-retention` purge au démarrage puis chaque jour à 03:00 UTC les fichiers `postgresql-*.csv*` âgés de plus
  de 90 jours. Le nom configuré omet le suffixe `.csv`, que PostgreSQL ajoute lui-même. L'activation et la purge effective
  doivent encore être vérifiées en production ; les droits d'accès au volume et les alertes d'exploitation restent suivis
  dans Jira (KAN-163). Les CSV restent sur le serveur et sont exposés au risque de perte de ce volume.
- **Limite de confiance** : une modification faite directement en base par le détenteur du compte propriétaire n'est pas
  capturée par l'application. pgAudit est préparé pour tracer le SQL direct après migration de production vers PostgreSQL 18 ;
  un superutilisateur peut toutefois modifier la configuration ou réécrire les journaux locaux.

---

## Angles morts de l'historique et leur fermeture

| Angle mort | Fermé par | Preuve |
|---|---|---|
| Suppression en groupe invisible (1 000 bulletins supprimés = 0 trace) | Suppression **entité par entité** ; test d'architecture qui interdit les écritures ORM en masse sur une entité auditée | `test_architecture.py`, `test_audit.py` |
| Retrait silencieux de droits (`ON DELETE CASCADE`) | `ON DELETE RESTRICT` (`V13`) ; un rôle attribué n'est pas supprimable (`409`), `SYSTEM_ADMIN` protégé | `test_audit.py` |
| Migrations qui écrivent des données | État initial (`V14`) et gabarit de migration auditée (`conventions/database.md`) | `test_audit.py`, `test_migrations.py` |
| Compte PostgreSQL unique | Deux comptes, droits recalculés après chaque migration (`migrations/droits.py`), vérification au démarrage | `test_audit.py` |
| Événements sans modification de données | Événements de sécurité, un seul écouteur | `test_audit.py` |
| Écritures sans utilisateur (tâche planifiée, démarrage) | Contexte d'audit explicite, origine explicite, `INCONNUE` visible | `test_chantier_synchronisation.py`, `test_audit.py` |
| Opération en plusieurs transactions | Une entrée, révisions reliées par `request_id` | `test_audit_consultation.py` |
| Import rejeté sans exception | Le périmètre de l'import le déclare en échec | `test_audit.py` |
| Champ volontairement non audité (mot de passe) | Absent du registre d'audit + événement de sécurité | `test_audit.py` |
| Audit impossible à écrire | Fermé pour les données, ouvert pour la sécurité, compteur | `test_audit.py` |
| Contenu supprimé non conservé | L'instantané de suppression garde les valeurs d'avant | `test_audit_consultation.py` |
| Oubli futur (entité, colonne, écriture) | Tests d'architecture ; contrôle de dérive Alembic | `test_architecture.py`, `test_migrations.py` |
| Logs sans identité ni requête, avec données personnelles | Identifiant de requête généré par le middleware (`platform/requete.py`) | `test_common.py` |
| Faux refus `403` qui noieraient le journal | La barre de filtres de la paie masque les sélecteurs dont la permission manque | `paie-filtres.component.spec.ts` |
| Identité qui change après coup | `utilisateur_nom` figé, `utilisateur_id` sans clé étrangère | `test_audit.py` |
| Modification directe en base | Limite assumée (voir ci-dessus) | — |

---

## Procédures

### Bascule de la production sur deux comptes
1. Ajouter dans `.env` du serveur `POSTGRES_APP_USER` et `POSTGRES_APP_PASSWORD` (voir `.env.example` ; mot de passe sans apostrophe).
2. `docker compose pull && docker compose up -d` : le démarrage de `api` (migration avec le compte propriétaire) applique les migrations d'audit, **crée le
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
Suivre le gabarit de `conventions/database.md` (`conventions/database.md`) (« Migrations qui modifient des données
auditées ») ; il est exécuté tel quel par `api/tests/test_migrations.py`. Exemple — attribuer une nouvelle permission à un rôle :

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
Voir la checklist de `conventions/audit.md` (`conventions/audit.md`). Les tests d'architecture font échouer la CI si
une entité n'est pas déclarée dans le registre d'audit ou explicitement exclue, ou si une route d'écriture n'a ni
action d'audit déclarée ni exception justifiée (`AUDITEES` dans `test_audit.py`) ; le test de comparaison Alembic
fait échouer la CI si une colonne manque à une table `_aud`.

---

## Performance (mesurée sur PostgreSQL 17, 1 000 bulletins)

| Opération | Sans audit | Avec audit |
|---|---|---|
| Import dans une transaction (comme l'import de paie) | ≈ 1,0 s | ≈ 1,1 à 1,5 s |
| Suppression en groupe, entité par entité | 0,07 à 0,15 s | 0,16 à 0,26 s |

L'écriture regroupée (insertions et mises à jour groupées par lots de 50) rend le coût de l'audit négligeable :
aucune écriture asynchrone (qui affaiblirait l'atomicité) n'est nécessaire. Volume : quelques dizaines de milliers de lignes
d'audit par an.

---

## Décisions confirmées avec la RH (2026-10-04)

| Sujet | Décision |
|---|---|
| Durée de conservation | **Conservation à vie, sans purge**, pour `OPERATION`, `SECURITE` et `ACCES`, y compris les adresses IP, les consultations de salaires et les instantanés `*_aud` (décision RH du 2026-10-11) |
| Qui lit le journal | **`SYSTEM_ADMIN` seulement** à l'installation ; `AUDIT_READ` administrable depuis l'écran Rôles |
| Lectures métier | **Non journalisées** (décision du propriétaire, 2026-11-03) ; les écritures sont journalisées par le décorateur d'action auditée, les événements de sécurité par leur propre port |
| Chaîne d'intégrité locale | **Oui** depuis `V19` ; aucun ancrage externe, donc pas de preuve opposable face à un superutilisateur PostgreSQL |
| `pgAudit` pour le SQL direct et les requêtes de base Staport Intelligence | Toutes les classes sont configurées dans `V20` ; activation de production à effectuer avec la bascule PG18 |
| Restauration d'un groupe supprimé | Mise en œuvre : instantanés conservés dans `*_aud`, recréation avec nouveaux identifiants, contrôle atomique des conflits, permission `PAIE_RESTORE`, journalisation de l'action |
| Suppression d'un rôle | Refusée s'il est attribué ; `SYSTEM_ADMIN` protégé (réversible) |

Données personnelles (loi 09-08) : l'audit contient des noms, des CIN, des salaires et des adresses IP — accès restreint à
`AUDIT_READ`, minimisation (voir « Événements de sécurité »), aucune route d'export du journal. La durée de conservation est
à vie et aucune purge n'est effectuée, conformément à la décision de la RH.

### Portée de l'audit

Seules les opérations qui changent l'état et les événements de sécurité sont écrits dans le journal (décision du propriétaire,
2026-11-03) : les lectures, les exports et les appels d'outils MCP de lecture n'y laissent aucune entrée. Le diagnostic des appels
d'outils (outil, utilisateur, statut, nombre de résultats) est dans les traces Phoenix. Les refus `401` et `403` produisent un
événement de sécurité (`ACCES_ANONYME_REFUSE`, `ACCES_REFUSE`) avec l'identifiant de requête, la méthode et la route.

Les appels SQL internes à un cas d'usage ne créent pas chacun une entrée métier distincte ; pgAudit les conserve dans les
journaux de la base Staport Intelligence, sans identité HTTP, request ID ni périmètre fonctionnel, et toute instruction SQL dans la
base est tracée techniquement par pgAudit. Les ressources statiques servies directement par le serveur web, les réponses servies
depuis un cache ou le navigateur sans appel à l'API, les requêtes arrêtées avant l'API et les accès aux fichiers, volumes
ou console du serveur ne sont pas des opérations HTTP/SQL vues par ces mécanismes. Les commandes SQL dans les autres bases
du même cluster sont hors du périmètre pgAudit choisi. L'empreinte locale ne protège pas contre un superutilisateur qui
réécrit puis recalcule les empreintes.

---

## Tests

Tous sur une vraie base PostgreSQL (`conftest.py`) sauf l'architecture : `test_audit.py`,
`test_audit.py` (socle), `test_audit.py` (S1 à S5, S11 à S17, 1 000 bulletins), `test_audit.py`,
`test_audit.py`, `test_migrations.py`,
`test_audit.py`, `test_audit_consultation.py` ; côté frontend `journal.component.spec.ts`,
`audit-historique.component.spec.ts`, `audit-champs.component.spec.ts`, `audit-format.spec.ts`. Voir testing.md ([exploitation/tests](../../exploitation/tests.md)).
Les specs du journal et de l'historique couvrent aussi la remise à zéro du paginateur, les réponses tardives,
les erreurs de lecture et le réessai de la page en échec. Les événements de sécurité ne déclenchent pas une
lecture inutile de différences d'historique.

## Couche IA

L'assistant RH peut interroger le journal d'audit par deux outils MCP de lecture, en plus de `IA_UTILISER` ; il n'écrit rien dans le journal et ne peut ni le purger ni le corriger. Ses lectures ne sont pas écrites dans le journal ; leur diagnostic est dans les traces Phoenix.

| Outil | Ce qu'il fait | Permission | Audit |
|---|---|---|---|
| `audit_rechercher` | Cherche dans le journal, des entrées les plus récentes aux plus anciennes : horodatage, catégorie, action, résultat, utilisateur, entité, nombre d'éléments, motif ; tous les filtres facultatifs et combinables (pages de 20, total et pages suivantes accessibles) | `AUDIT_READ` | `MCP_AUDIT_RECHERCHER` |
| `audit_historique` | Toutes les versions d'un enregistrement (bulletin, employé, chantier, équipe, fonction, rôle, paramètre) avec auteur, opération et champs modifiés (pages de 10 accessibles) | `AUDIT_READ` | `MCP_AUDIT_HISTORIQUE` |

- **Usage.** « Qui a fait quoi », « quels accès refusés cette semaine », « qui a modifié X et quand ». Sur `/audit`, l'assistant propose « Accès refusés ».
- **Refus.** Un refus de permission d'un outil est journalisé comme tout accès refusé (`ACCES_REFUSE`, périmètre de la route `/mcp`).
- **Limites.** Aucun outil d'écriture ; la chaîne de hachage du journal n'est pas exposée ; pas de périmètre par fiche de poste avant le jalon J2 de [ia.md](../../ia/vue-d-ensemble.md).

## Guide agent

### Lire avant d'agir

- [README Audit](index.md)
- [Permissions d'audit](droits.md)
- Modèle de données ([architecture/modele-de-donnees](../../architecture/modele-de-donnees.md))
- `conventions/audit.md` et `conventions/database.md`

### Garde-fous

- Distinguer instantanés `*_aud`, journal d'actions et garde-fous PostgreSQL ; ne pas écrire à la
  main dans les tables d'historique hors migrations documentées.
- Les écritures de succès restent cohérentes avec la transaction métier ; les échecs suivent le
  mécanisme séparé documenté.
- Le compte applicatif ne peut ni modifier ni supprimer l'historique. Aucune route d'écriture ou de
  suppression du journal ne doit être ajoutée.
- Limiter et protéger l'accès aux données personnelles, CIN, adresses IP et montants ; utiliser
  `AUDIT_READ` tel que décrit dans RBAC.
- Une migration qui change une entité auditée met à jour son schéma d'audit et la documentation.
- Les [contrats](contrats.md) décrivent les types et contraintes de recherche et de lecture ;
  ne pas confondre une entrée de journal, une page de différences et l'historique d'un enregistrement.
- Les filtres reviennent à la première page ; une réponse tardive ne remplace pas une sélection récente.
  Un échec de page d'historique se réessaie avant d'avancer, sans perdre les versions déjà lues.
- Annoncer chargement, erreur et vide séparément. Les événements de sécurité ne demandent pas de
  différences d'historique quand ils ne portent aucune opération métier réussie.

### Vérification

Tester commit/rollback, auteur et origine, échec métier/sécurité, accès non autorisé, historique
complet et droits SQL du compte applicatif avec PostgreSQL.
Vérifier aussi erreurs/réessais, pagination et changement d'enregistrement dans les composants de consultation.
