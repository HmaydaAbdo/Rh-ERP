-- paie.equipe (texte libre) → paie.equipe_id (clé étrangère vers equipe). Le bulletin reste un
-- snapshot : il référence l'équipe du mois, nullable car un employé peut ne pas avoir d'équipe.
ALTER TABLE paie ADD COLUMN equipe_id BIGINT;

-- Backfill : rapprochement insensible à la casse et aux espaces superflus avec equipe.code. Une
-- valeur vide est traitée comme "sans équipe" (reste NULL).
UPDATE paie p
SET equipe_id = e.id
FROM equipe e
WHERE p.equipe IS NOT NULL
  AND TRIM(p.equipe) <> ''
  AND UPPER(TRIM(p.equipe)) = UPPER(e.code);

-- Garde-fou : aucune valeur non vide ne doit rester sans équipe rattachée, sinon la suppression de
-- la colonne perdrait de la donnée. Fait échouer la migration (et la rollback) plutôt que de
-- perdre silencieusement l'historique.
DO $$
DECLARE
    non_rattachees TEXT;
BEGIN
    SELECT string_agg(DISTINCT equipe, ', ') INTO non_rattachees
    FROM paie
    WHERE equipe IS NOT NULL AND TRIM(equipe) <> '' AND equipe_id IS NULL;

    IF non_rattachees IS NOT NULL THEN
        RAISE EXCEPTION 'Valeurs de paie.equipe sans équipe correspondante : %', non_rattachees;
    END IF;
END $$;

ALTER TABLE paie DROP COLUMN equipe;

ALTER TABLE paie ADD CONSTRAINT fk_paie_equipe FOREIGN KEY (equipe_id) REFERENCES equipe (id);
CREATE INDEX idx_paie_equipe ON paie (equipe_id);
