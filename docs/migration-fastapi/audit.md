# Domaine `audit` en Python (KAN-214)

Code : `api/src/staport/domains/audit/`. Tests : `api/tests/test_audit.py`, `api/tests/test_audit_consultation.py`
(PostgreSQL réel, schéma construit par Alembic). Le domaine remplace Hibernate Envers, l'aspect `GenericAuditAspect`,
l'écouteur d'événements de sécurité, la consultation du journal et la vérification d'intégrité. Il n'est pas encore branché
en production : la bascule se fait à la fin d'E2 (KAN-50), conformément à la [stratégie](strategie.md).

## Décision du propriétaire (2026-11-03) : l'audit ne trace que ce qui change l'état

Le journal contient **les opérations qui changent l'état** (catégorie `OPERATION`) et **les événements de sécurité**
(`SECURITE` : connexions, sessions, mots de passe, accès refusés). Il ne contient **aucune lecture** ni aucune sortie de
données (exports, rapports, appels MCP de lecture), et rien pour `/health`. Une lecture noie la liste sans valeur ajoutée.

| Retiré par rapport à Spring | Conséquence |
|---|---|
| `LECTURE_METIER` (`AuditLectureResponseAdvice`) et son filet « écriture HTTP sans trace métier » | Le test d'architecture ci-dessous garantit à la place qu'aucune route d'écriture n'échappe à l'audit |
| Catégorie `ACCES` (exports Excel/PDF, `MCP_<OUTIL>`) | Non écrite par le code Python ; l'énumération la garde pour lire l'historique déjà écrit par Spring |
| `AuditAccesTest` (2 tests) | Non repris |

À la bascule, `docs/audit/README.md` (journal, tableau des actions `ACCES` et `LECTURE_METIER`, tests) est mis à jour en
conséquence ; la convention générale `conventions/audit.md` n'est pas modifiée (« les lectures ordinaires ne sont tracées que
lorsqu'un besoin le justifie »).

## Organisation

| Module | Rôle |
|---|---|
| `models.py` | `audit_revision`, `audit_revision_entite`, `audit_journal` (chaîne de hachage posée par le déclencheur V19) |
| `registre.py` | Registre des entités auditées : remplace `@Audited` / `@NotAudited`. Un champ absent n'est jamais historisé |
| `ecouteur.py` | Écouteurs de session SQLAlchemy `before_flush` / `after_flush` / `before_commit` : remplace Envers |
| `service.py` | `Audit` : seul point d'écriture du journal (`auditer`, `publier`) |
| `consultation.py`, `router.py`, `schemas.py` | Les 4 routes `/logs/...` (`AUDIT_READ`, lecture seule) |
| `integrite.py` | Vérification du compte applicatif et de la chaîne, périodique, sous verrou consultatif |
| `metriques.py` | Compteurs `rh.audit.*` (liaison à l'export de métriques avec la plateforme) |

Le domaine `common` porte le contexte (`audit_contexte.py` : origine, utilisateur, `contexte_batch`) et les événements
(`securite.py`) ; les domaines métier ne connaissent que le port `Auditeur` et déclarent leurs entités auditées dans leur
propre module (`auth/audit.py` : tables `*_aud` et champs de `Permission`, `Role`, `Utilisateur`).

## Comment l'historique est produit

1. Chaque `flush` enregistre en mémoire l'état des entités auditées dont un **champ audité** a réellement changé. Un
   changement de mot de passe seul, un verrouillage ou un incrément de version ne produisent rien.
2. Juste avant le commit, une **révision** est créée (qui, quand, d'où, identifiant de requête) et les instantanés sont
   insérés dans les tables `*_aud`. Une transaction annulée ne laisse ni révision ni ligne.
3. Fusion dans une même transaction : ajout puis modification = ajout ; modification puis suppression = suppression ; ajout
   puis suppression = rien ; liaison ajoutée puis retirée = rien.
4. Les tables d'audit n'acceptent que l'insertion (droits du compte applicatif) : chaque ligne est écrite une seule fois, à
   son état final. Les noms de champs (`nomPrenom`, `permissionsRefusees`, ...) et le nom d'entité enregistré dans
   `audit_revision_entite` (`staport.rh.auth.entities.Role`, ...) sont ceux de Spring : l'historique existant et le nouveau
   forment une seule chronologie.

`async with audit.auditer(session, action, type, entite)` entoure **toute** l'opération, comme l'aspect Spring :
- succès : `flush` (les contraintes sont vérifiées avant l'entrée), puis entrée écrite **dans la transaction métier** et liée
  à sa révision (même vide) ; si l'entrée ne peut pas s'écrire, l'opération échoue (fermé pour les données) ;
- exception : entrée `ECHEC` dans une **transaction séparée** (motif = nom de l'exception), l'exception d'origine repart ;
- seule l'action la plus externe écrit une entrée.

Les événements de sécurité sont écrits dans une transaction séparée, **ouverts en cas d'échec** : une panne du journal ne
bloque pas la connexion, elle est consignée et comptée.

## Contexte : qui agit, d'où

`contexte_audit_courant()` résout, dans cet ordre : traitement hors requête (`contexte_batch`, par exemple l'amorçage de
l'administrateur : « Système », `DEMARRAGE`) ; utilisateur authentifié de la requête (posé par la dépendance
`authentifie`) ; visiteur « Anonyme » ; à défaut « Système » d'origine `INCONNUE`, qui rend visible un oubli de contexte.
L'identifiant de requête est généré côté serveur et renvoyé dans `X-Request-Id` ; l'adresse IP et le `User-Agent` (255
caractères) viennent de la requête.

## Écarts avec Spring

| Point | Spring | Python | Pourquoi |
|---|---|---|---|
| Lectures, exports, `LECTURE_METIER` | Journalisés (`ACCES`) | Jamais | Décision du propriétaire |
| Détail `ACCES_REFUSE` | Méthode et route | Idem | Parité |
| Validation de `POST /logs/search` | 400 | 400 | Parité |
| Un enregistrement créé puis supprimé dans la même transaction | Selon Envers | Aucune ligne | Rien à historiser |
| Pool de connexions | Idem | Une requête qui écrit un événement ou un échec utilise une seconde connexion | Dimensionner le pool en conséquence |
| Métriques | Micrometer | Compteurs en mémoire, export à brancher avec la plateforme | Pas encore de supervision Python |
| Restauration de paie (`instantanesPaiePourRestauration`) | Dans `AuditJournalService` | Avec le domaine paie (KAN-49) | Dépend de `Paie` |

## Parité vérifiée

| Test Java | Équivalent Python |
|---|---|
| `AuditRevisionTest` (11) | `test_audit.py` : création attribuée, versions conservées, enregistrement identique, suppression avec contenu, transaction annulée, contexte hors requête, visiteur anonyme, mot de passe jamais audité, droits ajoutés et retirés, administrateur du démarrage |
| `AuditOperationTest` (comptes et rôles) | `test_audit.py` : entrée liée à sa révision, opération rejetée tracée sans rien enregistrer, rôle attribué non supprimé |
| `AuditSecurityEventsTest` | `test_audit.py` : connexion réussie et échouée (identifiant inconnu non conservé), accès refusé avec route et requête, accès anonyme avec route normalisée, réinitialisation par un administrateur ; les autres événements sont couverts par `test_auth_session.py` |
| `AuditDefaillanceTest` (2) | `test_audit.py` : entrée impossible = opération annulée et tracée `AuditIndisponible` ; événement impossible = connexion qui continue, erreur comptée |
| `AuditIntegriteTest` (5) | `test_audit.py` : chaîne valide puis falsification détectée, vérification périodique (comptes, chaîne), verrou consultatif ; les droits du compte restreint sont couverts par `test_migrations.py` |
| `AuditConsultationTest` (14) | `test_audit_consultation.py` : détail création / modification / suppression, droits ajoutés et retirés, détail vide, pagination, historique, 404, filtres sans jokers, multiselect, chaque colonne triable, périmètre décodé, permission requise, lecture seule |
| `AuditArchitectureTest` (7) | `test_audit.py` : toute route d'écriture déclare son audit ou son événement de sécurité (une route ajoutée sans déclaration fait échouer le test) |

Non repris : `AuditAccesTest`, `LECTURE_METIER` (décision ci-dessus) ; `AuditImportTest`, `AuditSynchronisationTest`,
`AuditOperationTest` (paie, équipe), `AuditMigration*Test` (données des autres domaines) arrivent avec KAN-49 et KAN-50.

## Ce qui n'est pas encore prouvé

- **Comparaison des lignes `*_aud` écrites par Spring et par FastAPI sur un même scénario** (preuve demandée par le
  ticket) : non exécutée, Spring n'est pas lancé dans cette session. La parité est établie par la lecture du code Java et
  par des tests qui rejouent les scénarios Java. À faire à la fin d'E2, dans le test de bascule (stratégie, § données réelles).
- Les entités des autres domaines (`Paie`, `Employe`, ...) rejoignent le registre avec leur domaine.
- La charge : un `flush` d'un millier de lignes auditées (suppression de groupe) n'est pas mesuré ; les mesures sont faites
  après la clôture d'E2.
