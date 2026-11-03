-- Paramètres administrables (docs/parametre/README.md) : les valeurs de fonctionnement qui peuvent évoluer (durées des jetons,
-- longueur minimale du mot de passe, pas des tranches de l'analytique de paie, planification de la synchronisation des
-- chantiers) ne sont plus codées dans le code ni dans application.yml (conventions/configuration.md, « Configuration
-- métier ») : un administrateur les règle depuis l'écran Paramètres.
--
-- Le catalogue des clés (type, bornes, libellé) est dans le code (CleParametre) ; ici, les VALEURS de départ, qui sont
-- celles en vigueur jusqu'ici — sauf la durée de la session (jeton de rafraîchissement), ramenée de 30 jours à 12 heures
-- (décision du 2026-10-11).
--
-- Deux nouvelles permissions, attribuées au seul rôle SYSTEM_ADMIN à l'installation (administrables ensuite depuis l'écran
-- Rôles) : PARAMETRE_READ (consulter) et PARAMETRE_WRITE (modifier).
--
-- La migration modifie des tables auditées (parametre, permission, role, role_permission) : elle écrit sa révision, ses
-- lignes d'audit et ses entrées de journal avec le gabarit de conventions/database.md.
CREATE TABLE parametre (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cle    VARCHAR(100) NOT NULL,
    valeur VARCHAR(255) NOT NULL,
    CONSTRAINT uk_parametre_cle UNIQUE (cle)
);

CREATE TABLE parametre_aud (
    id      BIGINT       NOT NULL,
    rev     BIGINT       NOT NULL,
    revtype SMALLINT     NOT NULL,
    cle     VARCHAR(100),
    valeur  VARCHAR(255),
    CONSTRAINT pk_parametre_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_parametre_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_parametre_aud_rev ON parametre_aud (rev);

DO $$
DECLARE
    v_rev   BIGINT;
    v_perms INTEGER;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- Les paramètres (revtype 0 : ajout, état après).
    WITH ajoutes AS (
        INSERT INTO parametre (cle, valeur) VALUES
            ('securite.jeton-acces.minutes', '15'),
            ('securite.jeton-session.heures', '12'),
            ('securite.lien-reinitialisation.minutes', '60'),
            ('securite.mot-de-passe.longueur-minimale', '10'),
            ('paie.analytique.pas-tranche', '500'),
            ('chantier.synchronisation.cron', '0 0 23 * * *')
        RETURNING *
    )
    INSERT INTO parametre_aud (id, rev, revtype, cle, valeur)
    SELECT id, v_rev, 0, cle, valeur FROM ajoutes;

    -- Les permissions.
    WITH ajoutees AS (
        INSERT INTO permission (code, description) VALUES
            ('PARAMETRE_READ', 'Consulter les paramètres de fonctionnement (durées des sessions, règle des mots de passe...)'),
            ('PARAMETRE_WRITE', 'Modifier les paramètres de fonctionnement')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutees;

    -- Leur attribution à SYSTEM_ADMIN : une liaison ajoutée s'audite au nom du rôle propriétaire de la collection (la ligne
    -- de liaison, revtype 0, et la ligne du rôle, revtype 1).
    CREATE TEMPORARY TABLE roles_concernes ON COMMIT DROP AS
    SELECT r.id, r.nom, r.description FROM role r WHERE r.nom = 'SYSTEM_ADMIN';

    INSERT INTO role_permission (role_id, permission_id)
    SELECT r.id, p.id FROM roles_concernes r CROSS JOIN permission p WHERE p.code IN ('PARAMETRE_READ', 'PARAMETRE_WRITE');
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, r.id, p.id FROM roles_concernes r CROSS JOIN permission p WHERE p.code IN ('PARAMETRE_READ', 'PARAMETRE_WRITE');
    INSERT INTO role_aud (id, rev, revtype, nom, description) SELECT id, v_rev, 1, nom, description FROM roles_concernes;
    SELECT count(*) INTO v_perms FROM permission WHERE code IN ('PARAMETRE_READ', 'PARAMETRE_WRITE');

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.parametre.entities.Parametre'),
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PARAMETRE_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, 6, jsonb_build_object('migration', 'V16__parametres_administrables'), id
    FROM audit_revision WHERE id = v_rev;

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, v_perms + 1,
           jsonb_build_object('migration', 'V16__parametres_administrables', 'permissions',
                              jsonb_build_array('PARAMETRE_READ', 'PARAMETRE_WRITE'), 'rolesAttribues', 1),
           id
    FROM audit_revision WHERE id = v_rev;
END $$;
