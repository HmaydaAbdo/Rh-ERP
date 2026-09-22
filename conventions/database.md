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
| Colonne renommée | `ALTER TABLE … RENAME COLUMN …` (préserve les données, contrairement à un DROP+ADD) |
| Colonne supprimée | `ALTER TABLE … DROP COLUMN …` — vérifier qu'aucun code ne la lit plus avant de fusionner |
| Type de colonne modifié | `ALTER TABLE … ALTER COLUMN … TYPE …` — vérifier la compatibilité/conversion implicite PostgreSQL |
| Valeur d'enum Java ajoutée (`VARCHAR` + `CHECK`) | `ALTER TABLE … DROP CONSTRAINT …`, puis `ADD CONSTRAINT … CHECK (… IN (…))` avec la liste étendue |
| Valeur d'enum Java supprimée | Migrer les lignes concernées **avant** de resserrer le `CHECK` — voir « Cas fréquents » |
| Contrainte `UNIQUE` ajoutée | Vérifier/nettoyer les doublons existants avant la migration, sinon elle échoue au déploiement |
| Index ajouté | `CREATE INDEX` — acceptable sans précaution particulière |

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
