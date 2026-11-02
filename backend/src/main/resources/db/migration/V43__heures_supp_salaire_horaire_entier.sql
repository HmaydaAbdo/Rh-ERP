-- S/H n'a pas de virgule : le salaire par heure stocké est un entier de dirhams (arrondi HALF_DOWN au calcul).
-- La table est vide en production ; si des lignes existaient, PostgreSQL arrondirait à l'entier le plus proche.
ALTER TABLE heures_supp ALTER COLUMN s_h TYPE NUMERIC(10, 0);
ALTER TABLE heures_supp_aud ALTER COLUMN s_h TYPE NUMERIC(10, 0);
