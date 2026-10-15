-- Le domaine Fonction compare ses libellés sans tenir compte de la casse. L'index
-- protège aussi les écritures concurrentes et les écritures hors du service.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM fonction
        GROUP BY UPPER(libelle)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doublons de libellé Fonction insensibles à la casse : traiter le prérequis de qualité des données avant V23';
    END IF;
END;
$$;

ALTER TABLE fonction DROP CONSTRAINT uk_fonction_libelle;
CREATE UNIQUE INDEX uk_fonction_libelle_upper ON fonction (UPPER(libelle));
