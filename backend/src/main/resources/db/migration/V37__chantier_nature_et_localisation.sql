-- Qualification manuelle : aucune nature ni position n'est inventée pour les chantiers existants.
ALTER TABLE chantier
    ADD COLUMN nature VARCHAR(30),
    ADD COLUMN localisation VARCHAR(2048),
    ADD COLUMN latitude NUMERIC(11,8),
    ADD COLUMN longitude NUMERIC(11,8),
    ADD COLUMN afficher_sur_carte BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT ck_chantier_nature CHECK (nature IN ('AO', 'DEPOT', 'EMULSION', 'CONCASSAGE', 'POSTE_ENROBE', 'CENTRALE_A_BETON')),
    ADD CONSTRAINT ck_chantier_latitude CHECK (latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT ck_chantier_longitude CHECK (longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT ck_chantier_coordonnees_paire CHECK ((latitude IS NULL) = (longitude IS NULL)),
    ADD CONSTRAINT ck_chantier_localisation CHECK (localisation IS NULL OR btrim(localisation) <> ''),
    ADD CONSTRAINT ck_chantier_affichage_carte CHECK (
        NOT afficher_sur_carte OR (nature IS NOT NULL AND localisation IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL)
    );

-- Les anciennes révisions restent inchangées ; ces colonnes étaient inconnues à leur date.
ALTER TABLE chantier_aud
    ADD COLUMN nature VARCHAR(30),
    ADD COLUMN localisation VARCHAR(2048),
    ADD COLUMN latitude NUMERIC(11,8),
    ADD COLUMN longitude NUMERIC(11,8),
    ADD COLUMN afficher_sur_carte BOOLEAN;
