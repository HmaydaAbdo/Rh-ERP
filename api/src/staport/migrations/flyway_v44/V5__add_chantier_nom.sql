-- Nom optionnel d'un chantier, distinct de `designation` (synchronisée depuis l'ERP et écrasée à
-- chaque synchronisation quotidienne, voir ChantierSyncTransactionalOperations). `nom` n'est JAMAIS
-- touché par la synchronisation ERP (qui ne l'expose pas) : uniquement saisi/modifié manuellement,
-- via le formulaire chantier. Utilisé par le rapport PDF/l'export Excel de la paie pour afficher
-- "CHANTIER : <code> (<nom>)" quand renseigné.
ALTER TABLE chantier ADD COLUMN nom VARCHAR(255);
