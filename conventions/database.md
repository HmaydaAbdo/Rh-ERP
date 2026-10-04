# Base de données — PostgreSQL, migrations Flyway

> La base de données est vivante dès qu'elle contient des données réelles. Toute évolution du
> schéma doit être versionnée, explicite, et ne jamais dépendre d'une génération automatique.

---

## Principe fondamental

Le schéma est géré **exclusivement** par des migrations Flyway versionnées
(`backend/src/main/resources/db/migration/`). `spring.jpa.hibernate.ddl-auto` est fixé à
`validate` : Hibernate compare les entités JPA au schéma réel au démarrage et **échoue** s'il y a
la moindre divergence, mais ne modifie jamais la base.

Conséquence directe : **toute modification d'une entité JPA qui touche au schéma (nouvelle
colonne, colonne renommée, type modifié, contrainte ajoutée, nouvelle table, etc.) doit
s'accompagner d'un nouveau fichier de migration Flyway.** Une entité modifiée sans migration
correspondante fait échouer le démarrage de l'application (`ddl-auto=validate`) — c'est le
comportement voulu : il transforme un oubli de migration en échec immédiat et explicite plutôt
qu'en dérive silencieuse.

Voir `conventions/deployment.md` pour la façon dont Flyway s'exécute (Docker Compose, local, tests).

---

## Ajouter une migration

1. Créer un fichier dans `backend/src/main/resources/db/migration/`, nommé
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

Le backfill (`UPDATE`) doit produire une valeur réellement correcte métier si elle existe, ou être
signalé comme un point à clarifier avec l'utilisateur si aucune valeur par défaut n'a de sens
(ne jamais inventer une règle métier — voir `CLAUDE.md`, section « En cas de doute »).

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

Une entité auditée (`conventions/audit.md`) a une table d'audit `<table>_aud` (Envers) : `id`, `rev`, `revtype`, puis
les colonnes auditées. Elle suit ces règles, que `ddl-auto: validate` et les tests d'architecture font respecter :

- **Même migration que la table** : une entité auditée sans table d'audit fait échouer le démarrage.
- **Colonnes nullables** (hors `id`, `rev`, `revtype`) : une ancienne version, ou un instantané de suppression, n'a pas
  forcément de valeur. Clé primaire (`id`, `rev`) — (`rev`, `<id1>`, `<id2>`) pour une table de liaison — et un index
  sur `rev`.
- **Aucune clé étrangère vers une table métier** : une ligne d'historique doit survivre à la suppression de ce qu'elle
  décrit. Seule la clé vers `audit_revision` existe.
- **Une colonne d'audit n'est jamais supprimée ni renommée** : elle documente ce que la donnée a été. Entité dont une
  colonne est renommée : ajouter la nouvelle colonne à la table d'audit, y recopier l'ancienne, **conserver** l'ancienne.
  Entité dont une colonne est supprimée : la colonne d'audit reste (elle sera simplement vide pour les nouvelles versions).
- **Aucune cascade SQL** (`ON DELETE CASCADE`) sur une table auditée, liaisons comprises : une cascade supprime des
  lignes sans passer par Hibernate, donc sans trace. Utiliser `ON DELETE RESTRICT` ; c'est au service de refuser
  proprement (`409`) une suppression qui laisserait des dépendants.
- **Aucune écriture en masse** (`deleteAllInBatch`, `@Modifying`, SQL natif d'écriture) sur une entité auditée — voir
  `conventions/jpa.md`.
- Un secret (hash de mot de passe, jeton) n'a pas de colonne d'audit : il est `@NotAudited`.

---

## Migrations qui modifient des données auditées

Une migration Flyway écrit en SQL, hors JPA : Envers ne la voit pas. Toute migration qui **insère, modifie ou supprime
des lignes d'une table auditée** (backfill, correction, fusion de doublons, seed d'une nouvelle permission) écrit **dans le
même fichier** — donc de façon atomique avec la modification — sa révision, ses lignes d'audit et son entrée de journal.

Gabarit (SQL PostgreSQL, un bloc par migration) :

```sql
DO $$
DECLARE
    v_rev BIGINT;
    v_nb  INTEGER;
BEGIN
    -- 1. La révision : une par migration, d'origine MIGRATION.
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- 2. Chaque modification, en reprenant les lignes touchées (RETURNING) dans la table d'audit :
    --    revtype 0 = ajout (état après), 1 = modification (état après), 2 = suppression (état avant).
    WITH touchees AS (
        UPDATE <table> SET <colonne> = <valeur> WHERE <condition> RETURNING *
    )
    INSERT INTO <table>_aud (id, rev, revtype, <colonnes auditées>)
    SELECT id, v_rev, 1, <colonnes auditées> FROM touchees;
    GET DIAGNOSTICS v_nb = ROW_COUNT;

    -- 3. Les types d'entités touchés : le nom Hibernate de l'entité (nom complet de la classe).
    INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, '<package.Entite>');

    -- 4. L'entrée du journal.
    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', '<ENTITE>_<VERBE>', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, v_nb, '{"migration": "V<n>__<description>"}'::jsonb, id
    FROM audit_revision WHERE id = v_rev;
END $$;
```

- Une **suppression** relève l'état *avant* : `WITH supprimees AS (DELETE FROM <table> WHERE … RETURNING *) INSERT INTO
  <table>_aud … SELECT id, v_rev, 2, … FROM supprimees`.
- Une table de liaison s'audite de la même façon (`INSERT INTO <liaison>_aud (rev, revtype, <id1>, <id2>)`).
- Une migration qui ne touche **aucune** table auditée (schéma seul, table non auditée) n'a rien de tel à écrire.
- La **première** mise en place de l'audit sur une base existante écrit, de la même façon, une révision d'état initial
  (tous les enregistrements, `revtype` 0) : sans elle, la première modification d'une donnée existante n'aurait pas
  d'« avant ».
- Le gabarit s'applique **aussi aux migrations d'un projet qui reprend ces conventions** : relire toute migration de
  données à la revue, avec la même exigence que pour une migration de schéma.

---

## Droits PostgreSQL — deux comptes

Flyway s'exécute avec le **compte propriétaire** du schéma ; l'application, avec un **compte applicatif** distinct qui
n'a que `SELECT, INSERT` sur les tables d'audit (`conventions/audit.md`, « Intégrité », et
`conventions/deployment.md`). Les droits sont recalculés par un rappel Flyway `afterMigrate.sql`, idempotent, qui
s'applique donc aussi aux tables créées plus tard : **aucune migration n'accorde de droit à la main**.

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

* Le schéma vit uniquement dans `backend/src/main/resources/db/migration/` — jamais généré
  automatiquement.
* `ddl-auto=validate` : toute divergence entité/schéma fait échouer le démarrage, par conception.
* Un fichier de migration déjà appliqué n'est jamais modifié ni renuméroté — toujours une nouvelle
  migration.
* Toute contrainte resserrée sur des données existantes (`NOT NULL`, `UNIQUE`, `CHECK`) exige un
  backfill ou une vérification préalable, dans la migration elle-même.
* Toute valeur de repli ou règle de fusion est une décision métier — jamais une hypothèse.
* Une table auditée a sa table `_aud` (même migration, colonnes nullables, jamais supprimée ni renommée), aucune cascade
  SQL, aucune écriture en masse ; une migration qui modifie des données auditées écrit aussi l'audit (gabarit).
