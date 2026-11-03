-- Renseigne le nom (voir V5__add_chantier_nom.sql) des chantiers existants — liste fournie par la
-- direction (HMAYDA, 2026-09-29, fichier "code chantier.xlsx", période Avril 2023). UPDATE uniquement
-- (jamais un INSERT) : ces chantiers existent déjà en base, créés par la synchronisation ERP ou
-- manuellement — un code absent de la table n'est simplement pas modifié par cette migration, sans
-- erreur (aucune contrainte à respecter, `nom` reste NULL pour ce code jusqu'à saisie manuelle).
UPDATE chantier SET nom = 'DEPOT HARBIL'                    WHERE code = 'C057';
UPDATE chantier SET nom = 'TIZNIT'                          WHERE code = 'C085';
UPDATE chantier SET nom = 'STATION DES EMULSIONS'           WHERE code = 'C129';
UPDATE chantier SET nom = 'KHOURIBGA'                       WHERE code = 'C155';
UPDATE chantier SET nom = 'AIT HKIM'                        WHERE code = 'C163';
UPDATE chantier SET nom = 'TAMANSOURT'                      WHERE code = 'C167';
UPDATE chantier SET nom = 'NADOR'                           WHERE code = 'C168';
UPDATE chantier SET nom = 'CONC. NADOR'                     WHERE code = 'C168A';
UPDATE chantier SET nom = 'CONC.NADOR 3'                    WHERE code = 'C168A3';
UPDATE chantier SET nom = 'POSTE NADOR'                     WHERE code = 'C168B';
UPDATE chantier SET nom = 'POSTE TAMANSOURT'                WHERE code = 'C176B';
UPDATE chantier SET nom = 'IKNIOUNE'                        WHERE code = 'C184';
UPDATE chantier SET nom = 'CONC. IKNIOUNE'                  WHERE code = 'C184A';
UPDATE chantier SET nom = 'BARRAGE MESKDAL'                 WHERE code = 'C186';
UPDATE chantier SET nom = 'CONC. BARRAGE MESKDAL'           WHERE code = 'C186A';
UPDATE chantier SET nom = 'AGADIR'                          WHERE code = 'C189';
UPDATE chantier SET nom = 'AVENUE MY ABD ELLAH MARRAKECH'   WHERE code = 'C196';
UPDATE chantier SET nom = 'TINGHIR'                         WHERE code = 'C198';
UPDATE chantier SET nom = 'BENSLIMANE'                      WHERE code = 'C206';
UPDATE chantier SET nom = 'POSTE BENSLIMANE'                WHERE code = 'C206B';
UPDATE chantier SET nom = 'GUERSIF'                         WHERE code = 'C208';
UPDATE chantier SET nom = 'TAROUDANET'                      WHERE code = 'C209';
UPDATE chantier SET nom = 'MEKNES'                          WHERE code = 'C214';
