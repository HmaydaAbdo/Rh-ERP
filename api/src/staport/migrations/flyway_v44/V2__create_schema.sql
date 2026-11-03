-- Schéma initial — reflète exactement les entités JPA du projet au 2026-09-22 (Function sans champ
-- actif, Employee avec dates obligatoires, Paie avec salaireTotal dérivé mais toujours stocké).
-- Ordre de création : référentiels sans dépendance (fonction, chantier) d'abord, puis employe
-- (dépend des deux), puis paie (dépend des trois).

-- =========================================================================
-- fonction — référentiel des fonctions occupées par les employés.
-- Pas de notion actif/inactif : une fonction existe ou n'existe pas
-- (voir docs/function/README.md).
-- =========================================================================
CREATE TABLE fonction (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    libelle VARCHAR(100) NOT NULL,
    CONSTRAINT uk_fonction_libelle UNIQUE (libelle)
);

-- =========================================================================
-- chantier — référentiel des chantiers, alimenté par saisie manuelle et par
-- synchronisation ERP quotidienne (voir docs/chantier/README.md).
-- =========================================================================
CREATE TABLE chantier (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         VARCHAR(100)  NOT NULL,
    designation  VARCHAR(500),
    source_erp   BOOLEAN       NOT NULL DEFAULT FALSE,
    actif        BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT uk_chantier_code UNIQUE (code)
);

CREATE INDEX idx_chantier_actif      ON chantier (actif);
CREATE INDEX idx_chantier_source_erp ON chantier (source_erp);

-- =========================================================================
-- employe — fiche d'identité des employés (voir docs/employee/README.md).
-- statut : enum Java (ACTIF/INACTIF) persisté par nom (EnumType.STRING) — représenté ici par
-- varchar + CHECK plutôt qu'un type ENUM natif Postgres, pour rester extensible sans ALTER TYPE.
-- =========================================================================
CREATE TABLE employe (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom_prenom      VARCHAR(150) NOT NULL,
    cin             VARCHAR(30)  NOT NULL,
    date_naissance  DATE         NOT NULL,
    date_embauche   DATE         NOT NULL,
    fonction_id     BIGINT       NOT NULL,
    chantier_id     BIGINT       NOT NULL,
    statut          VARCHAR(20)  NOT NULL DEFAULT 'ACTIF',
    CONSTRAINT uk_employe_cin UNIQUE (cin),
    CONSTRAINT ck_employe_statut CHECK (statut IN ('ACTIF', 'INACTIF')),
    CONSTRAINT fk_employe_fonction FOREIGN KEY (fonction_id) REFERENCES fonction (id),
    CONSTRAINT fk_employe_chantier FOREIGN KEY (chantier_id) REFERENCES chantier (id)
);

CREATE INDEX idx_employe_fonction      ON employe (fonction_id);
CREATE INDEX idx_employe_chantier      ON employe (chantier_id);
CREATE INDEX idx_employe_statut        ON employe (statut);
CREATE INDEX idx_employe_date_embauche ON employe (date_embauche);

-- =========================================================================
-- paie — bulletins de paie mensuels (voir docs/paie/README.md).
-- fonction/chantier/equipe sont un snapshot figé au mois du bulletin, jamais une référence vivante
-- à l'affectation courante de l'employé. periode : YearMonth Java stocké en entier aaaaMM (ex.
-- 202608), via YearMonthAttributeConverter. salaire_total : calculé côté serveur, jamais saisi,
-- mais toujours stocké (Paie.calculerSalaireTotal()).
-- =========================================================================
CREATE TABLE paie (
    id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id                   BIGINT        NOT NULL,
    periode                       INTEGER       NOT NULL,
    fonction_id                   BIGINT        NOT NULL,
    chantier_id                   BIGINT        NOT NULL,
    equipe                        VARCHAR(50),
    nombre_jours_travailles       INTEGER       NOT NULL,
    jours_recuperation_ouvrable   NUMERIC(5,2),
    jours_recuperation_dimanche   NUMERIC(5,2),
    salaire_mensuel               NUMERIC(10,2) NOT NULL,
    prime_roulage_ordinaire       NUMERIC(10,2),
    prime_roulage_dimanche        NUMERIC(10,2),
    salaire_total                 NUMERIC(10,2) NOT NULL,
    observation                   VARCHAR(255),
    CONSTRAINT uk_paie_employee_periode UNIQUE (employee_id, periode),
    CONSTRAINT fk_paie_employee  FOREIGN KEY (employee_id) REFERENCES employe (id),
    CONSTRAINT fk_paie_fonction  FOREIGN KEY (fonction_id) REFERENCES fonction (id),
    CONSTRAINT fk_paie_chantier  FOREIGN KEY (chantier_id) REFERENCES chantier (id)
);

CREATE INDEX idx_paie_employee ON paie (employee_id);
CREATE INDEX idx_paie_periode  ON paie (periode);
CREATE INDEX idx_paie_chantier ON paie (chantier_id);
