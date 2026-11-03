-- Numéro de version pour détecter les modifications concurrentes sur les entités persistées.
-- Les versions Envers sont exclues par org.hibernate.envers.do_not_audit_optimistic_locking_field.
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
