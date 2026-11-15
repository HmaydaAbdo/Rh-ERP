-- Tous les montants des heures supplémentaires sont des entiers de dirhams (S/H, Montant, STC, Forfait, Net à payer).
-- Arrondi HALF_DOWN comme S/H : exactement 0,5 on descend (CEIL(x - 0,5) pour x >= 0). Une seule instruction pour que les
-- contraintes (STC = Montant, Net = Montant - STC + Forfait) restent vraies ligne par ligne.
UPDATE heures_supp SET
    montant = CEIL(montant - 0.5),
    stc_dh = CASE WHEN est_stc_ou_sortie THEN CEIL(montant - 0.5) ELSE 0 END,
    forfait = CASE WHEN forfait IS NULL THEN NULL ELSE CEIL(forfait - 0.5) END,
    net_a_payer = CEIL(montant - 0.5) - CASE WHEN est_stc_ou_sortie THEN CEIL(montant - 0.5) ELSE 0 END
        + COALESCE(CASE WHEN forfait IS NULL THEN NULL ELSE CEIL(forfait - 0.5) END, 0);

ALTER TABLE heures_supp ALTER COLUMN montant TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp ALTER COLUMN stc_dh TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp ALTER COLUMN forfait TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp ALTER COLUMN net_a_payer TYPE NUMERIC(16, 0);

ALTER TABLE heures_supp_aud ALTER COLUMN montant TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp_aud ALTER COLUMN stc_dh TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp_aud ALTER COLUMN forfait TYPE NUMERIC(16, 0);
ALTER TABLE heures_supp_aud ALTER COLUMN net_a_payer TYPE NUMERIC(16, 0);
