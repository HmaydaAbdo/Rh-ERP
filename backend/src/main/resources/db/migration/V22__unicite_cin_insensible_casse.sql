-- La règle métier compare le CIN sans tenir compte de la casse. L'index fonctionnel
-- protège aussi les créations concurrentes et les écritures hors du service.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM employe
        GROUP BY UPPER(cin)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doublons de CIN insensibles à la casse : traiter le prérequis de qualité des données avant V22';
    END IF;
END;
$$;

ALTER TABLE employe DROP CONSTRAINT uk_employe_cin;
CREATE UNIQUE INDEX uk_employe_cin_upper ON employe (UPPER(cin));
