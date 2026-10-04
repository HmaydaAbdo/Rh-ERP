-- Audit : instantanés Envers de chaque version d'une ligne (tables <table>_aud, révisions audit_revision) et
-- journal unique des opérations, des événements de sécurité et des exports (audit_journal).
-- Voir conventions/audit.md et docs/audit/README.md.
--
-- Règles de ce schéma (conventions/audit.md) :
--   * Aucune clé étrangère d'une table d'audit vers une table métier : une ligne d'historique doit survivre à la
--     suppression de ce qu'elle décrit. Seule la clé vers audit_revision existe.
--   * Toutes les colonnes d'une table <table>_aud, sauf id / rev / revtype, sont nullables : un instantané de
--     suppression peut ne contenir que l'identifiant, et une colonne ajoutée plus tard à l'entité n'a pas de
--     valeur dans les anciennes versions.
--   * Une colonne d'une table d'audit n'est jamais supprimée ni renommée : elle documente ce qu'était la donnée.
--   * utilisateur_aud n'a pas de colonne mot_de_passe_hash : on n'audite jamais un secret.
--   * Écritures par insertion seulement (stratégie Envers par défaut) ; le compte applicatif n'a que SELECT et
--     INSERT sur ces tables (voir afterMigrate.sql).

-- =========================================================================
-- audit_revision — une ligne par transaction qui modifie des données auditées (entité de révision d'Envers).
-- utilisateur_id n'est pas une clé étrangère : l'historique survit au compte ; utilisateur_nom est figé.
-- =========================================================================
CREATE TABLE audit_revision (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    horodatage      TIMESTAMPTZ  NOT NULL,
    utilisateur_id  BIGINT,
    utilisateur_nom VARCHAR(50)  NOT NULL,
    origine         VARCHAR(20)  NOT NULL,
    request_id      VARCHAR(36),
    adresse_ip      VARCHAR(45),
    CONSTRAINT ck_audit_revision_origine CHECK (origine IN ('API', 'TACHE_PLANIFIEE', 'DEMARRAGE', 'MIGRATION', 'INCONNUE'))
);

CREATE INDEX idx_audit_revision_horodatage  ON audit_revision (horodatage DESC);
CREATE INDEX idx_audit_revision_utilisateur ON audit_revision (utilisateur_id, horodatage);
CREATE INDEX idx_audit_revision_request_id  ON audit_revision (request_id);

-- Types d'entités modifiés par chaque révision (@ModifiedEntityNames) : retrouver vite « ce qui a changé ».
CREATE TABLE audit_revision_entite (
    revision_id BIGINT       NOT NULL,
    entite      VARCHAR(255) NOT NULL,
    CONSTRAINT pk_audit_revision_entite PRIMARY KEY (revision_id, entite),
    CONSTRAINT fk_audit_revision_entite_revision FOREIGN KEY (revision_id) REFERENCES audit_revision (id)
);

-- =========================================================================
-- Instantanés des entités métier. revtype : 0 = ajout, 1 = modification, 2 = suppression (le contenu de la ligne
-- supprimée est conservé : store_data_at_delete).
-- =========================================================================
CREATE TABLE fonction_aud (
    id      BIGINT       NOT NULL,
    rev     BIGINT       NOT NULL,
    revtype SMALLINT     NOT NULL,
    libelle VARCHAR(100),
    CONSTRAINT pk_fonction_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_fonction_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_fonction_aud_rev ON fonction_aud (rev);

CREATE TABLE chantier_aud (
    id          BIGINT       NOT NULL,
    rev         BIGINT       NOT NULL,
    revtype     SMALLINT     NOT NULL,
    code        VARCHAR(100),
    designation VARCHAR(500),
    nom         VARCHAR(255),
    source_erp  BOOLEAN,
    actif       BOOLEAN,
    CONSTRAINT pk_chantier_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_chantier_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_chantier_aud_rev ON chantier_aud (rev);

CREATE TABLE equipe_aud (
    id      BIGINT       NOT NULL,
    rev     BIGINT       NOT NULL,
    revtype SMALLINT     NOT NULL,
    code    VARCHAR(50),
    libelle VARCHAR(100),
    CONSTRAINT pk_equipe_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_equipe_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_equipe_aud_rev ON equipe_aud (rev);

CREATE TABLE employe_aud (
    id             BIGINT       NOT NULL,
    rev            BIGINT       NOT NULL,
    revtype        SMALLINT     NOT NULL,
    nom_prenom     VARCHAR(150),
    cin            VARCHAR(30),
    date_naissance DATE,
    date_embauche  DATE,
    fonction_id    BIGINT,
    chantier_id    BIGINT,
    statut         VARCHAR(20),
    CONSTRAINT pk_employe_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_employe_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_employe_aud_rev ON employe_aud (rev);

CREATE TABLE paie_aud (
    id                          BIGINT        NOT NULL,
    rev                         BIGINT        NOT NULL,
    revtype                     SMALLINT      NOT NULL,
    employee_id                 BIGINT,
    periode                     INTEGER,
    fonction_id                 BIGINT,
    chantier_id                 BIGINT,
    equipe_id                   BIGINT,
    nombre_jours_travailles     INTEGER,
    jours_recuperation_ouvrable NUMERIC(5, 2),
    jours_recuperation_dimanche NUMERIC(5, 2),
    salaire_mensuel             NUMERIC(10, 2),
    prime_roulage_ordinaire     NUMERIC(10, 2),
    prime_roulage_dimanche      NUMERIC(10, 2),
    salaire_total               NUMERIC(10, 2),
    observation                 VARCHAR(255),
    CONSTRAINT pk_paie_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_paie_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_paie_aud_rev ON paie_aud (rev);

-- =========================================================================
-- Instantanés des comptes, rôles et permissions, et de leurs liaisons (ajouts et retraits de droits).
-- =========================================================================
CREATE TABLE permission_aud (
    id          BIGINT       NOT NULL,
    rev         BIGINT       NOT NULL,
    revtype     SMALLINT     NOT NULL,
    code        VARCHAR(50),
    description VARCHAR(255),
    CONSTRAINT pk_permission_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_permission_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_permission_aud_rev ON permission_aud (rev);

CREATE TABLE role_aud (
    id          BIGINT       NOT NULL,
    rev         BIGINT       NOT NULL,
    revtype     SMALLINT     NOT NULL,
    nom         VARCHAR(50),
    description VARCHAR(255),
    CONSTRAINT pk_role_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_role_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_role_aud_rev ON role_aud (rev);

CREATE TABLE utilisateur_aud (
    id          BIGINT       NOT NULL,
    rev         BIGINT       NOT NULL,
    revtype     SMALLINT     NOT NULL,
    username    VARCHAR(50),
    email       VARCHAR(255),
    actif       BOOLEAN,
    employee_id BIGINT,
    CONSTRAINT pk_utilisateur_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_utilisateur_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_utilisateur_aud_rev ON utilisateur_aud (rev);

CREATE TABLE role_permission_aud (
    rev           BIGINT   NOT NULL,
    revtype       SMALLINT NOT NULL,
    role_id       BIGINT   NOT NULL,
    permission_id BIGINT   NOT NULL,
    CONSTRAINT pk_role_permission_aud PRIMARY KEY (rev, role_id, permission_id),
    CONSTRAINT fk_role_permission_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);

CREATE TABLE utilisateur_role_aud (
    rev            BIGINT   NOT NULL,
    revtype        SMALLINT NOT NULL,
    utilisateur_id BIGINT   NOT NULL,
    role_id        BIGINT   NOT NULL,
    CONSTRAINT pk_utilisateur_role_aud PRIMARY KEY (rev, utilisateur_id, role_id),
    CONSTRAINT fk_utilisateur_role_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);

CREATE TABLE utilisateur_permission_refusee_aud (
    rev            BIGINT   NOT NULL,
    revtype        SMALLINT NOT NULL,
    utilisateur_id BIGINT   NOT NULL,
    permission_id  BIGINT   NOT NULL,
    CONSTRAINT pk_utilisateur_permission_refusee_aud PRIMARY KEY (rev, utilisateur_id, permission_id),
    CONSTRAINT fk_utilisateur_permission_refusee_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);

-- =========================================================================
-- audit_journal — le journal unique : opérations métier (OPERATION), événements de sécurité (SECURITE) et sorties
-- de données (ACCES : exports). Une entrée d'opération réussie est écrite dans la transaction de l'opération et
-- pointe vers sa révision ; un échec ou un accès est écrit dans une transaction séparée.
-- =========================================================================
CREATE TABLE audit_journal (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    horodatage      TIMESTAMPTZ  NOT NULL,
    categorie       VARCHAR(20)  NOT NULL,
    action          VARCHAR(60)  NOT NULL,
    type_operation  VARCHAR(10),
    resultat        VARCHAR(10)  NOT NULL,
    utilisateur_id  BIGINT,
    utilisateur_nom VARCHAR(50)  NOT NULL,
    origine         VARCHAR(20)  NOT NULL,
    request_id      VARCHAR(36),
    adresse_ip      VARCHAR(45),
    user_agent      VARCHAR(255),
    entite_type     VARCHAR(50),
    entite_id       BIGINT,
    nombre_elements INTEGER,
    perimetre       JSONB,
    motif           VARCHAR(500),
    revision_id     BIGINT,
    CONSTRAINT ck_audit_journal_categorie CHECK (categorie IN ('OPERATION', 'SECURITE', 'ACCES')),
    CONSTRAINT ck_audit_journal_type_operation CHECK (type_operation IS NULL OR type_operation IN ('CREATE', 'UPDATE', 'DELETE')),
    CONSTRAINT ck_audit_journal_resultat CHECK (resultat IN ('SUCCES', 'ECHEC')),
    CONSTRAINT ck_audit_journal_origine CHECK (origine IN ('API', 'TACHE_PLANIFIEE', 'DEMARRAGE', 'MIGRATION', 'INCONNUE')),
    CONSTRAINT fk_audit_journal_revision FOREIGN KEY (revision_id) REFERENCES audit_revision (id)
);

CREATE INDEX idx_audit_journal_horodatage       ON audit_journal (horodatage DESC);
CREATE INDEX idx_audit_journal_utilisateur      ON audit_journal (utilisateur_id, horodatage);
CREATE INDEX idx_audit_journal_categorie_action ON audit_journal (categorie, action);
CREATE INDEX idx_audit_journal_entite           ON audit_journal (entite_type, entite_id);
CREATE INDEX idx_audit_journal_request_id       ON audit_journal (request_id);
CREATE INDEX idx_audit_journal_revision         ON audit_journal (revision_id);
