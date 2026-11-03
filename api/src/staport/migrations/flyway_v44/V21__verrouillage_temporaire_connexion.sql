-- Compteur de tentatives de connexion et verrouillage temporaire par compte.
-- Ces champs opérationnels sont @NotAudited : les tentatives et blocages sont conservés dans audit_journal.
ALTER TABLE utilisateur
    ADD COLUMN nombre_echecs_connexion INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN derniere_echec_connexion TIMESTAMPTZ,
    ADD COLUMN verrouillage_jusqua TIMESTAMPTZ,
    ADD CONSTRAINT ck_utilisateur_nombre_echecs_connexion
        CHECK (nombre_echecs_connexion >= 0);
