-- Chaîne d'intégrité locale du journal. Elle révèle une modification/suppression/insertion incohérente,
-- mais un administrateur PostgreSQL capable de réécrire toute la table peut aussi recalculer la chaîne.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit_journal
    ADD COLUMN hash_precedent CHAR(64),
    ADD COLUMN hash_entree CHAR(64);

DO $$
DECLARE
    v_ligne RECORD;
    v_precedent CHAR(64) := repeat('0', 64);
    v_courant CHAR(64);
BEGIN
    SET LOCAL TIME ZONE 'UTC';
    FOR v_ligne IN SELECT id, to_jsonb(a) AS contenu FROM audit_journal a ORDER BY id LOOP
        v_courant := encode(digest(v_precedent || ':' ||
                (v_ligne.contenu - 'hash_precedent' - 'hash_entree')::text, 'sha256'), 'hex');
        UPDATE audit_journal
           SET hash_precedent = v_precedent, hash_entree = v_courant
         WHERE id = v_ligne.id;
        v_precedent := v_courant;
    END LOOP;
END $$;

ALTER TABLE audit_journal
    ALTER COLUMN hash_precedent SET NOT NULL,
    ALTER COLUMN hash_entree SET NOT NULL;

CREATE FUNCTION audit_journal_chaine_valide() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SET TimeZone = 'UTC' AS $$
DECLARE
    v_ligne RECORD;
    v_precedent CHAR(64) := repeat('0', 64);
    v_attendu CHAR(64);
BEGIN
    FOR v_ligne IN SELECT id, hash_precedent, hash_entree, to_jsonb(a) AS contenu
                     FROM audit_journal a ORDER BY id LOOP
        IF v_ligne.hash_precedent <> v_precedent THEN
            RETURN FALSE;
        END IF;
        v_attendu := encode(digest(v_precedent || ':' ||
                (v_ligne.contenu - 'hash_precedent' - 'hash_entree')::text, 'sha256'), 'hex');
        IF v_ligne.hash_entree <> v_attendu THEN
            RETURN FALSE;
        END IF;
        v_precedent := v_ligne.hash_entree;
    END LOOP;
    RETURN TRUE;
END $$;

CREATE FUNCTION audit_journal_chaine_ajouter() RETURNS TRIGGER
LANGUAGE plpgsql SET TimeZone = 'UTC' AS $$
DECLARE
    v_precedent CHAR(64);
BEGIN
    SELECT hash_entree INTO v_precedent FROM audit_journal ORDER BY id DESC LIMIT 1;
    NEW.hash_precedent := COALESCE(v_precedent, repeat('0', 64));
    NEW.hash_entree := encode(digest(NEW.hash_precedent || ':' ||
            (to_jsonb(NEW) - 'hash_precedent' - 'hash_entree')::text, 'sha256'), 'hex');
    RETURN NEW;
END $$;

CREATE FUNCTION audit_journal_chaine_verrouiller() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    -- Le verrou d'instruction est pris avant l'allocation des identifiants : l'ordre des IDs reste celui de la chaîne.
    PERFORM pg_advisory_xact_lock(731942, 1);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_journal_chaine_verrouiller
    BEFORE INSERT ON audit_journal
    FOR EACH STATEMENT EXECUTE FUNCTION audit_journal_chaine_verrouiller();

CREATE TRIGGER trg_audit_journal_chaine
    BEFORE INSERT ON audit_journal
    FOR EACH ROW EXECUTE FUNCTION audit_journal_chaine_ajouter();

GRANT EXECUTE ON FUNCTION audit_journal_chaine_valide() TO PUBLIC;
