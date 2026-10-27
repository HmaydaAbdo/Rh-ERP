CREATE TABLE heures_supp (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    employee_id BIGINT NOT NULL,
    paie_id BIGINT NOT NULL,
    fonction_id BIGINT NOT NULL,
    chantier_id BIGINT NOT NULL,
    periode INTEGER NOT NULL,
    salaire_reference NUMERIC(10, 2),
    type_salaire_reference VARCHAR(20),
    s_h NUMERIC(30, 20),
    p_h NUMERIC(8, 1),
    montant NUMERIC(16, 2) NOT NULL,
    est_stc_ou_sortie BOOLEAN NOT NULL,
    stc_dh NUMERIC(16, 2) NOT NULL,
    forfait NUMERIC(16, 2),
    net_a_payer NUMERIC(16, 2) NOT NULL,

    CONSTRAINT fk_heures_supp_employee FOREIGN KEY (employee_id) REFERENCES employe (id),
    CONSTRAINT fk_heures_supp_paie FOREIGN KEY (paie_id) REFERENCES paie (id),
    CONSTRAINT fk_heures_supp_fonction FOREIGN KEY (fonction_id) REFERENCES fonction (id),
    CONSTRAINT fk_heures_supp_chantier FOREIGN KEY (chantier_id) REFERENCES chantier (id),
    CONSTRAINT uk_heures_supp_employee_periode_chantier UNIQUE (employee_id, periode, chantier_id),
    CONSTRAINT ck_heures_supp_periode CHECK (periode >= 190001 AND periode % 100 BETWEEN 1 AND 12),
    CONSTRAINT ck_heures_supp_type_salaire CHECK (type_salaire_reference IS NULL OR type_salaire_reference IN ('MENSUEL', 'JOURNALIER')),
    CONSTRAINT ck_heures_supp_salaire_reference CHECK (salaire_reference IS NULL OR salaire_reference >= 0),
    CONSTRAINT ck_heures_supp_s_h CHECK (s_h IS NULL OR s_h >= 0),
    CONSTRAINT ck_heures_supp_p_h CHECK (p_h IS NULL OR p_h >= 0),
    CONSTRAINT ck_heures_supp_montant CHECK (montant >= 0),
    CONSTRAINT ck_heures_supp_stc_dh CHECK (stc_dh >= 0),
    CONSTRAINT ck_heures_supp_forfait CHECK (forfait IS NULL OR forfait >= 0),
    CONSTRAINT ck_heures_supp_net CHECK (net_a_payer >= 0),
    CONSTRAINT ck_heures_supp_ligne_non_vide CHECK (p_h IS NOT NULL OR forfait IS NOT NULL),
    CONSTRAINT ck_heures_supp_forfait_stc CHECK (NOT est_stc_ou_sortie OR forfait IS NULL),
    CONSTRAINT ck_heures_supp_stc_montant CHECK (
        (est_stc_ou_sortie AND stc_dh = montant)
        OR (NOT est_stc_ou_sortie AND stc_dh = 0)
    ),
    CONSTRAINT ck_heures_supp_net_calcule CHECK (net_a_payer = montant - stc_dh + COALESCE(forfait, 0)),
    CONSTRAINT ck_heures_supp_taux_presence CHECK (
        (p_h IS NULL AND salaire_reference IS NULL AND type_salaire_reference IS NULL AND s_h IS NULL
            AND montant = 0 AND stc_dh = 0 AND NOT est_stc_ou_sortie)
        OR (p_h IS NOT NULL AND salaire_reference IS NOT NULL AND type_salaire_reference IS NOT NULL AND s_h IS NOT NULL)
    )
);

CREATE INDEX idx_heures_supp_periode ON heures_supp (periode);
CREATE INDEX idx_heures_supp_chantier_periode ON heures_supp (chantier_id, periode);
CREATE INDEX idx_heures_supp_employee_periode ON heures_supp (employee_id, periode);
CREATE INDEX idx_heures_supp_fonction_periode ON heures_supp (fonction_id, periode);

CREATE TABLE heures_supp_aud (
    id BIGINT NOT NULL,
    rev BIGINT NOT NULL,
    revtype SMALLINT NOT NULL,
    employee_id BIGINT,
    paie_id BIGINT,
    fonction_id BIGINT,
    chantier_id BIGINT,
    periode INTEGER,
    salaire_reference NUMERIC(10, 2),
    type_salaire_reference VARCHAR(20),
    s_h NUMERIC(30, 20),
    p_h NUMERIC(8, 1),
    montant NUMERIC(16, 2),
    est_stc_ou_sortie BOOLEAN,
    stc_dh NUMERIC(16, 2),
    forfait NUMERIC(16, 2),
    net_a_payer NUMERIC(16, 2),
    CONSTRAINT pk_heures_supp_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_heures_supp_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_heures_supp_aud_rev ON heures_supp_aud (rev);
