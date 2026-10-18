# Base de données — PostgreSQL, migrations Flyway

> La base de données est vivante dès qu'elle contient des données réelles. Toute évolution du
> schéma doit être versionnée, explicite, et ne jamais dépendre d'une génération automatique.

---

## Principe fondamental

Le schéma est géré **exclusivement** par des migrations Flyway versionnées, dans le dossier de
migrations configuré par le projet. `spring.jpa.hibernate.ddl-auto` est fixé à
`validate` : Hibernate compare les entités JPA au schéma réel au démarrage et **échoue** s'il y a
la moindre divergence, mais ne modifie jamais la base.

Conséquence directe : **toute modification d'une entité JPA qui touche au schéma (nouvelle
colonne, colonne renommée, type modifié, contrainte ajoutée, nouvelle table, etc.) doit
s'accompagner d'un nouveau fichier de migration Flyway.** Une entité modifiée sans migration
correspondante fait échouer le démarrage de l'application (`ddl-auto=validate`) — c'est le
comportement voulu : il transforme un oubli de migration en échec immédiat et explicite plutôt
qu'en dérive silencieuse.

Voir `conventions/deployment.md` pour la façon dont Flyway s'exécute (Docker Compose, local, tests).

PostgreSQL est le moteur relationnel de référence. Chaque projet verrouille une version prise en
charge dans sa configuration de build et de déploiement, puis teste avec la même version majeure
que celle qui sera déployée. La convention ne fixe pas un numéro de version commun à toutes les
applications.

Vérifier la politique de support officielle avant de choisir ou mettre à niveau une majeure, et
utiliser son dernier correctif pris en charge. Verrouiller la version du serveur dans le
déploiement. Si une extension telle que pgvector est utilisée, verrouiller également sa version et
confirmer sa disponibilité chez le fournisseur de production ; les tests d'intégration utilisent
les mêmes majeures PostgreSQL et versions d'extension que la cible.

### Mise à niveau d'une majeure PostgreSQL en production

Une mise à niveau de majeure ne réutilise jamais directement le volume de données de l'ancienne
version. Préparer et répéter une migration logique sur PostgreSQL cible, avec les mêmes extensions,
rôles, droits et versions applicatives que la production. Avant la fenêtre de maintenance, vérifier
la restauration d'une sauvegarde ; pendant la bascule, suspendre les écritures, produire le dump
final, restaurer dans un volume neuf et exécuter les migrations Flyway manquantes jusqu'à la version
du dépôt. Contrôler les données, les extensions, les droits et le démarrage applicatif avant de
rouvrir le trafic. Garder l'ancien volume intact comme retour arrière ; après reprise des écritures
sur la nouvelle majeure, un retour arrière exige une réconciliation des nouvelles écritures. Voir
`conventions/deployment.md` et la procédure propre au projet dans `docs/deployment.md`.

Utiliser un type décimal exact pour les quantités monétaires ou les mesures décimales qui exigent
une précision déterministe ; ne pas représenter ces valeurs par des nombres flottants. Stocker les
instants dans un type avec fuseau horaire en UTC et convertir vers l'heure locale uniquement pour
l'affichage. Préciser les précisions, échelles et unités dans le modèle et les contraintes.

Les migrations se vérifient sur PostgreSQL réel, pas uniquement sur H2 ou des repositories mockés :
tester une base vierge, une mise à niveau depuis la version de schéma prise en charge et la
validation du mapping ORM. Toute évolution doit préserver les données existantes ou décrire un
backfill sûr et sa stratégie de déploiement.

---

## Ajouter une migration

1. Créer un fichier dans le dossier Flyway du projet, nommé
   `V<n>__description_en_minuscules_avec_underscores.sql`, où `<n>` est le numéro de version
   suivant, strictement supérieur au dernier existant (voir les fichiers déjà présents pour
   connaître le dernier numéro utilisé).
2. Écrire du SQL PostgreSQL explicite — pas de génération automatique. Utiliser des noms de
   contrainte/index explicites et lisibles (`fk_<table>_<cible>`, `uk_<table>_<colonnes>`,
   `idx_<table>_<colonne>`…), jamais les noms générés par défaut par Hibernate.
3. Modifier l'entité JPA en cohérence exacte avec la migration (mêmes colonnes, mêmes types,
   mêmes contraintes `nullable`/`unique`).
4. Vérifier localement que `ddl-auto=validate` passe : démarrer l'application (ou lancer les
   tests) contre une base à jour — toute divergence fait échouer le démarrage avec un message
   listant précisément la colonne/contrainte en cause.

**Règles strictes :**

- Un fichier de migration déjà appliqué sur un environnement partagé (donc a fortiori une fois
  poussé sur la branche principale) **n'est jamais modifié ni renuméroté** — Flyway détecte toute
  modification d'un fichier déjà appliqué (checksum) et refuse de démarrer. Toute correction se
  fait par une nouvelle migration.
- Un numéro de version n'est jamais réutilisé.
- Une migration ne doit faire qu'une chose cohérente (une table, une évolution logique) — pas de
  fichier fourre-tout accumulant plusieurs changements sans rapport.

Flyway exécute les migrations PostgreSQL via JDBC. Ne pas utiliser de méta-commandes propres à
`psql` sans équivalent JDBC. Vérifier la documentation de la version Flyway retenue et ajouter le
module de support PostgreSQL au classpath lorsqu'il n'est pas fourni par cette version. Aligner la
version de ce module avec celle du moteur Flyway selon la gestion de dépendances retenue.

Rendre une opération de données idempotente lorsqu'elle est conçue pour être relancée. Ne pas
ajouter systématiquement `IF EXISTS` ou `IF NOT EXISTS` si cela pouvait masquer une dérive inattendue
du schéma.

## Préparer et relire une migration

Avant d'écrire le SQL, lire le modèle de données et les règles du domaine ainsi que les conventions
de base et d'audit. Déterminer si les tables concernées sont auditées, non vides, volumineuses ou
utilisées simultanément par plusieurs versions de l'application. Signaler les risques de verrou,
de durée, de backfill et de déploiement progressif.

Clarifier toute décision manquante sur une valeur de repli, une fusion ou une suppression de données
avant d'écrire la migration ; aucune règle métier n'est inventée. Dans la même revue, synchroniser
le SQL, les entités, les tables d'audit, les permissions ou données initiales concernées et la
documentation.

Tester la migration sur une base PostgreSQL vierge et depuis la version précédente supportée, avec
la même version majeure et les mêmes extensions que l'environnement cible. Vérifier
`ddl-auto=validate`, les invariants et le résultat des backfills. Pour une migration modifiant des
données, prévoir une restauration ou une stratégie de retour arrière ; consigner les risques de
verrouillage et de volume.

---

## Checklist avant toute modification de schéma

| Changement | Migration à écrire |
|---|---|
| Nouvelle table | `CREATE TABLE` avec contraintes et index explicites |
| Nouvelle colonne nullable | `ALTER TABLE … ADD COLUMN … ` |
| Nouvelle colonne `NOT NULL` sur table potentiellement non vide | Backfill puis contrainte — voir « Cas fréquents » |
| Colonne renommée | `ALTER TABLE … RENAME COLUMN …` (préserve les données, contrairement à un DROP+ADD). **Entité auditée** : voir « Tables auditées » (jamais de `RENAME` sur une table d'audit) |
| Colonne supprimée | `ALTER TABLE … DROP COLUMN …` — vérifier qu'aucun code ne la lit plus avant de fusionner. **Entité auditée** : la colonne de la table d'audit reste |
| Type de colonne modifié | `ALTER TABLE … ALTER COLUMN … TYPE …` — vérifier la compatibilité/conversion implicite PostgreSQL |
| Valeur d'enum Java ajoutée (`VARCHAR` + `CHECK`) | `ALTER TABLE … DROP CONSTRAINT …`, puis `ADD CONSTRAINT … CHECK (… IN (…))` avec la liste étendue |
| Valeur d'enum Java supprimée | Migrer les lignes concernées **avant** de resserrer le `CHECK` — voir « Cas fréquents » |
| Contrainte `UNIQUE` ajoutée | Vérifier/nettoyer les doublons existants avant la migration, sinon elle échoue au déploiement |
| Index ajouté | `CREATE INDEX` — acceptable sans précaution particulière |
| Nouvelle entité auditée (`@Audited`) | `CREATE TABLE <table>_aud` dans **la même migration** que la table — voir « Tables auditées » |
| Nouvelle colonne sur une entité auditée | `ADD COLUMN` sur la table **et** sur sa table `_aud` (nullable), dans la même migration |
| Nouvelle propriété explicitement exclue de l'audit (`@NotAudited`) | Colonne sur la table métier uniquement ; documenter la finalité et journaliser séparément les événements de sécurité si nécessaire |
| Données modifiées par la migration (backfill, correction, seed, fusion de doublons) sur une table auditée | Le gabarit d'audit — voir « Migrations qui modifient des données auditées » |

Toute case marquée comme nécessitant un backfill ou une vérification de données existantes doit
être traitée **dans la migration elle-même** (une migration Flyway est un fichier SQL classique :
un `UPDATE` de backfill avant l'`ALTER` qui resserre la contrainte est parfaitement normal et
s'exécute dans la même transaction que le reste de la migration).

---

## Cas fréquents

### Nouvelle colonne NOT NULL sur table non vide

```sql
ALTER TABLE xxx ADD COLUMN nouvelle_colonne VARCHAR(20);
UPDATE xxx SET nouvelle_colonne = 'TEMP-' || id WHERE nouvelle_colonne IS NULL;
ALTER TABLE xxx ALTER COLUMN nouvelle_colonne SET NOT NULL;
```

Le backfill (`UPDATE`) doit produire une valeur réellement correcte métier si elle existe. Si aucune
valeur par défaut n'a de sens, clarifier la règle avec le responsable métier avant d'écrire la
migration ; ne jamais inventer une valeur métier.

### Colonne renommée

```sql
ALTER TABLE xxx RENAME COLUMN ancien_nom TO nouveau_nom;
```

`RENAME COLUMN` préserve les données — pas besoin de script de copie séparé.

### Enum (`VARCHAR` + `CHECK`) — valeur supprimée

```sql
UPDATE xxx SET statut = 'VALEUR_DE_REPLI' WHERE statut = 'VALEUR_SUPPRIMEE';
ALTER TABLE xxx DROP CONSTRAINT chk_xxx_statut;
ALTER TABLE xxx ADD CONSTRAINT chk_xxx_statut CHECK (statut IN ('VALEUR_A', 'VALEUR_DE_REPLI'));
```

La valeur de repli (`'VALEUR_DE_REPLI'` ci-dessus) est un exemple — la vraie valeur de repli est
une règle métier à confirmer, jamais à deviner.

### Contrainte UNIQUE ajoutée sur données existantes

Diagnostiquer avant d'écrire la migration :

```sql
SELECT colonne, COUNT(*) FROM table GROUP BY colonne HAVING COUNT(*) > 1;
```

Si des doublons existent, la résolution (fusion, suppression, renommage) est une décision métier
à faire valider avant d'écrire la migration.

---

## Tables auditées

Les tables d'audit et leurs relations suivent les règles de `conventions/audit.md`. La table métier
et sa structure d'audit sont créées ou modifiées dans la même migration Flyway. Les contraintes
spécifiques aux colonnes d'historique, aux suppressions et aux migrations qui modifient des lignes
auditées sont définies dans cette convention d'audit.

---

## Migrations qui modifient des données auditées

Une migration Flyway qui modifie des lignes auditées doit écrire leurs instantanés et l'entrée de
journal de façon atomique avec ces changements. Appliquer le gabarit de `conventions/audit.md` ; une
migration de schéma seule n'ajoute pas de lignes d'audit.

---

## Droits PostgreSQL — deux comptes

Séparer le compte de migration du compte d'exécution lorsqu'un audit exige que l'application ne
puisse pas réécrire son historique. Les privilèges et leur vérification sont définis dans
`conventions/audit.md` ; leur création et leur application au déploiement sont décrites dans
`conventions/deployment.md`.

---

## pgvector et données vectorielles

`pgvector` est une capacité facultative : sa disponibilité ne justifie pas de vectoriser des données.
L'activer uniquement pour un cas d'usage autorisé et validé, sur une base et un environnement qui
la prennent en charge.

* Gérer l'extension et son schéma par les migrations ou les opérations de base de données autorisées.
  Ne pas laisser le démarrage applicatif créer ou modifier automatiquement le schéma vectoriel.
* Garder les vecteurs dans un espace logique dérivé du modèle métier, avec provenance, version de
  source, date d'indexation et règles d'accès explicites. Vérifier les permissions avant de restituer
  un résultat de recherche.
* Documenter dans un ADR le modèle d'embedding, les dimensions, la distance, l'index et les seuils
  retenus. Un changement incompatible de modèle ou de dimensions requiert une réindexation planifiée.
* Définir la fraîcheur, la réindexation, la rétention, la suppression et la sauvegarde des vecteurs
  avec le cycle de vie des sources. Isoler les corpus contenant des données sensibles.

---

## Base graphe facultative (Neo4j)

Une base graphe n'est introduite que pour un GraphRAG ou une mémoire de connaissances justifiés par
l'évaluation (voir [`rag.md`](rag.md)), après un ADR. Elle reste une projection dérivée : jamais une
source de vérité métier, jamais une copie des tables transactionnelles d'un domaine.

* Retenir l'édition Community (open source) sauf besoin documenté ; vérifier la version, sa licence et
  sa compatibilité avec le client Java retenu, puis verrouiller l'image Docker par empreinte comme les
  autres images.
* Le schéma (contraintes d'unicité, index vectoriels et plein texte) est créé par des scripts versionnés
  appliqués au déploiement, comme une migration ; le démarrage applicatif ne le crée pas implicitement.
* L'application utilise un compte dédié sans droit d'administration. L'édition Community n'offrant pas
  de contrôle d'accès fin par rôle, les droits de l'utilisateur sont appliqués dans chaque requête par
  l'application (voir [`rag.md`](rag.md)).
* Comme le graphe est reconstructible depuis les sources, sa sauvegarde est facultative ; documenter le
  temps de reconstruction et la procédure de réindexation complète.
* Les tests d'intégration utilisent l'image Neo4j de même version (Testcontainers).

---

## Mots réservés PostgreSQL — liste de vigilance

PostgreSQL accepte la plupart des mots ci-dessous comme identifiants non-réservés en pratique,
mais certains sont strictement réservés et font échouer du SQL non échappé. Éviter comme nom de
colonne/table sans guillemets, ou utiliser `@Column(name = "...")` :

`ALL`, `ANALYSE`, `ANALYZE`, `AND`, `ANY`, `ARRAY`, `AS`, `ASC`, `ASYMMETRIC`, `BOTH`, `CASE`,
`CAST`, `CHECK`, `COLLATE`, `COLUMN`, `CONSTRAINT`, `CREATE`, `CURRENT_DATE`, `CURRENT_ROLE`,
`CURRENT_TIME`, `CURRENT_TIMESTAMP`, `CURRENT_USER`, `DEFAULT`, `DEFERRABLE`, `DESC`, `DISTINCT`,
`DO`, `ELSE`, `END`, `EXCEPT`, `FALSE`, `FETCH`, `FOR`, `FOREIGN`, `FROM`, `GRANT`, `GROUP`,
`HAVING`, `IN`, `INITIALLY`, `INTERSECT`, `INTO`, `LEADING`, `LIMIT`, `LOCALTIME`,
`LOCALTIMESTAMP`, `NEW`, `NOT`, `NULL`, `OFF`, `OFFSET`, `OLD`, `ON`, `ONLY`, `OR`, `ORDER`,
`PLACING`, `PRIMARY`, `REFERENCES`, `RETURNING`, `SELECT`, `SESSION_USER`, `SOME`, `SYMMETRIC`,
`TABLE`, `THEN`, `TO`, `TRAILING`, `TRUE`, `UNION`, `UNIQUE`, `USER`, `USING`, `VARIADIC`, `WHEN`,
`WHERE`, `WINDOW`, `WITH`.

En cas de doute sur un identifiant précis, se référer à la colonne « reserved » de la
documentation officielle PostgreSQL (`SELECT * FROM pg_get_keywords()`).

---

## Responsabilités

| Qui | Quoi |
|---|---|
| Développeur (IA) | Écrire la migration Flyway en même temps que le changement d'entité, jamais l'un sans l'autre |
| Développeur (IA) | Signaler toute migration nécessitant une décision métier (valeur de repli, fusion de doublons) avant de l'écrire |
| Développeur (IA) | Vérifier que `ddl-auto=validate` passe avant de considérer la tâche terminée |
| Développeur (IA) | Pour une entité auditée : table `_aud` dans la même migration ; pour une migration de données : le gabarit d'audit |
| Développeur (humain) | Valider les décisions métier signalées |
| Développeur (humain) | Exécuter/valider les migrations sur les environnements partagés au moment du déploiement |

---

## Résumé

* Le schéma vit uniquement dans les migrations Flyway configurées du projet — jamais généré
  automatiquement.
* `ddl-auto=validate` : toute divergence entité/schéma fait échouer le démarrage, par conception.
* Un fichier de migration déjà appliqué n'est jamais modifié ni renuméroté — toujours une nouvelle
  migration.
* Toute contrainte resserrée sur des données existantes (`NOT NULL`, `UNIQUE`, `CHECK`) exige un
  backfill ou une vérification préalable, dans la migration elle-même.
* Toute valeur de repli ou règle de fusion est une décision métier — jamais une hypothèse.
* Une table auditée a sa table `_aud` (même migration, colonnes nullables, jamais supprimée ni renommée), aucune cascade
  SQL, aucune écriture en masse ; une migration qui modifie des données auditées écrit aussi l'audit (gabarit).

## Références officielles

* [Politique de versions et de support PostgreSQL](https://www.postgresql.org/support/versioning/)
* [Support PostgreSQL dans Flyway](https://documentation.red-gate.com/flyway/reference/database-driver-reference/postgresql-database)
