ALTER TABLE paie
    ALTER COLUMN nombre_jours_travailles TYPE NUMERIC(5, 2)
    USING nombre_jours_travailles::NUMERIC(5, 2);

ALTER TABLE paie_aud
    ALTER COLUMN nombre_jours_travailles TYPE NUMERIC(5, 2)
    USING nombre_jours_travailles::NUMERIC(5, 2);
