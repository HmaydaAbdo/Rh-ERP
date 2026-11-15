-- Numéro de version pour détecter les modifications concurrentes sur les entités persistées.
-- La colonne de version n'est pas copiée dans l'historique.
ALTER TABLE fonction ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chantier ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE equipe ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE employe ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE paie ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE permission ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE role ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE utilisateur ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE parametre ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE refresh_token ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE reset_password_token ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
