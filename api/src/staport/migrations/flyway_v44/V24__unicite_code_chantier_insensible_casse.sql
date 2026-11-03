-- Le domaine Chantier compare ses codes sans tenir compte de la casse. L'index
-- protège aussi les écritures concurrentes et les écritures hors du service.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM chantier
        GROUP BY UPPER(code)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doublons de code Chantier insensibles à la casse : traiter le prérequis de qualité des données avant V24';
    END IF;
END;
$$;

ALTER TABLE chantier DROP CONSTRAINT uk_chantier_code;
CREATE UNIQUE INDEX uk_chantier_code_upper ON chantier (UPPER(code));
