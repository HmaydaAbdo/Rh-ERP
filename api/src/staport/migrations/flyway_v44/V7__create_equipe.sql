-- equipe — référentiel des équipes (voir docs/equipe/README.md). Remplace la table de libellés codée
-- en dur (EquipeLibelleCatalogue) et le texte libre de paie.equipe.
-- Le code est stocké normalisé (trim + majuscules, voir EquipeService) ; l'unicité est en plus
-- garantie insensiblement à la casse par un index sur UPPER(code), pour qu'aucun doublon ne puisse
-- exister quelle que soit la voie d'écriture.
CREATE TABLE equipe (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code    VARCHAR(50)  NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    CONSTRAINT uk_equipe_code    UNIQUE (code),
    CONSTRAINT uk_equipe_libelle UNIQUE (libelle)
);

CREATE UNIQUE INDEX uk_equipe_code_upper ON equipe (UPPER(code));

-- Seed : table fournie par la direction (EQUIPES.xlsx, 2026-09-29). ENR et ENROCHEMENT désignaient
-- la même équipe : fusionnées sous le code ENROCHEMENT (valeur réellement présente en base et dans
-- les fichiers d'import). A, LABO, ASPHALET et 8 sont des valeurs trouvées sur des bulletins
-- existants (diagnostic du 2026-10-03), absentes du catalogue : créées avec libelle = code en
-- attendant que la RH renseigne le vrai libellé via l'écran Équipes.
INSERT INTO equipe (code, libelle) VALUES
    ('CH',          'CHAUFFEURS'),
    ('OP',          'OPERATEURS'),
    ('AT',          'ATELIER'),
    ('EE',          'ENROBE'),
    ('TER',         'TERASSEMENT'),
    ('GA',          'GARDIENS'),
    ('TOPO',        'TOPOGRAPHES'),
    ('ADMIN',       'ADMINISTRATION'),
    ('ENROCHEMENT', 'ENROCHEMENT'),
    ('R CONT',      'REMBLAIS CONTIGUE'),
    ('GABION',      'GABION'),
    ('PHS',         'PLAN HYGIENE ET SECURITE'),
    ('EB',          'BETON'),
    ('A',           'A'),
    ('LABO',        'LABO'),
    ('ASPHALET',    'ASPHALET'),
    ('8',           '8');
