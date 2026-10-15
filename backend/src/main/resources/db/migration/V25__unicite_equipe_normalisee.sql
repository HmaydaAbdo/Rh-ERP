-- Code et libellé sont normalisés (trim + comparaison sans casse) par le service.
-- Reproduire cette règle en base pour les écritures concurrentes et hors service.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM equipe
        GROUP BY UPPER(BTRIM(code))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doublons de code Équipe après trim et sans casse : traiter le prérequis de qualité des données avant V25';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM equipe
        GROUP BY UPPER(BTRIM(libelle))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doublons de libellé Équipe après trim et sans casse : traiter le prérequis de qualité des données avant V25';
    END IF;
END;
$$;

ALTER TABLE equipe DROP CONSTRAINT uk_equipe_code;
ALTER TABLE equipe DROP CONSTRAINT uk_equipe_libelle;
DROP INDEX uk_equipe_code_upper;
CREATE UNIQUE INDEX uk_equipe_code_normalise ON equipe (UPPER(BTRIM(code)));
CREATE UNIQUE INDEX uk_equipe_libelle_normalise ON equipe (UPPER(BTRIM(libelle)));
