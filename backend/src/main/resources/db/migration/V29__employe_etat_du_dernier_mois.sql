-- La fiche employé porte l'état du DERNIER MOIS DE PAIE importé (voir docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md) :
-- en plus de la fonction et du chantier, l'équipe, le salaire et son type (mensuel ou journalier). Les trois colonnes sont
-- nullables : un employé créé sans paie n'a encore ni salaire ni équipe connus ; le premier import de paie les renseigne.
-- La reprise des données existantes est faite par V30 (migration de données, auditée).
ALTER TABLE employe
    ADD COLUMN equipe_id    BIGINT,
    ADD COLUMN salaire      NUMERIC(10, 2),
    ADD COLUMN type_salaire VARCHAR(20),
    ADD CONSTRAINT fk_employe_equipe FOREIGN KEY (equipe_id) REFERENCES equipe (id),
    ADD CONSTRAINT ck_employe_salaire CHECK (salaire IS NULL OR salaire >= 0),
    ADD CONSTRAINT ck_employe_type_salaire CHECK (type_salaire IS NULL OR type_salaire IN ('MENSUEL', 'JOURNALIER'));
CREATE INDEX idx_employe_equipe ON employe (equipe_id);

ALTER TABLE employe_aud
    ADD COLUMN equipe_id    BIGINT,
    ADD COLUMN salaire      NUMERIC(10, 2),
    ADD COLUMN type_salaire VARCHAR(20);

-- Départs d'un employé de l'entreprise : un par mois au plus. Le mois est celui de la paie qui constate le départ (STC dans
-- le fichier, ou absence du fichier), stocké aaaaMM comme paie.periode. Le motif vaut « STC » ou un texte saisi. Un employé
-- qui revient puis repart a plusieurs départs : la table garde tout son parcours.
CREATE TABLE employe_sortie (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version     BIGINT       NOT NULL DEFAULT 0,
    employee_id BIGINT       NOT NULL,
    periode     INT          NOT NULL,
    motif       VARCHAR(255) NOT NULL,
    CONSTRAINT uk_employe_sortie_employee_periode UNIQUE (employee_id, periode),
    CONSTRAINT fk_employe_sortie_employee FOREIGN KEY (employee_id) REFERENCES employe (id)
);
CREATE INDEX idx_employe_sortie_periode ON employe_sortie (periode);

CREATE TABLE employe_sortie_aud (
    id          BIGINT   NOT NULL,
    rev         BIGINT   NOT NULL,
    revtype     SMALLINT NOT NULL,
    employee_id BIGINT,
    periode     INT,
    motif       VARCHAR(255),
    CONSTRAINT pk_employe_sortie_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_employe_sortie_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_employe_sortie_aud_rev ON employe_sortie_aud (rev);
