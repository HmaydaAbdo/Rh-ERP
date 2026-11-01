-- Accueil personnalisé (docs/accueil/README.md) : chaque utilisateur voit sur son accueil les indicateurs que ses permissions
-- autorisent ; l'utilisateur, ou un administrateur, peut en choisir et en ordonner une partie. Le catalogue des indicateurs est
-- dans le code (IndicateurAccueil) ; ici, seulement le choix de chacun.
--
-- Trois nouvelles permissions, attribuées au seul rôle SYSTEM_ADMIN à l'installation (administrables ensuite depuis l'écran
-- Rôles, comme les autres) : ACCUEIL_READ (voir son accueil), ACCUEIL_WRITE (choisir et ordonner ses indicateurs) et ACCUEIL_ADMIN
-- (consulter et régler l'accueil d'un autre utilisateur). Les autres rôles, dont DIRECTION qui ne porte à l'installation que la
-- consultation de la carte, n'en reçoivent aucune : c'est au propriétaire de les attribuer. Chaque endpoint porte une permission
-- explicite (EndpointSecurityTest).
--
-- La migration modifie des tables auditées (permission, role, role_permission) : elle écrit sa révision, ses lignes d'audit et
-- son entrée de journal avec le gabarit de conventions/database.md.
CREATE TABLE accueil_preference (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version        BIGINT       NOT NULL DEFAULT 0,
    utilisateur_id BIGINT       NOT NULL,
    indicateurs    VARCHAR(500) NOT NULL,
    CONSTRAINT uk_accueil_preference_utilisateur UNIQUE (utilisateur_id),
    CONSTRAINT fk_accueil_preference_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);

CREATE TABLE accueil_preference_aud (
    id             BIGINT   NOT NULL,
    rev            BIGINT   NOT NULL,
    revtype        SMALLINT NOT NULL,
    utilisateur_id BIGINT,
    indicateurs    VARCHAR(500),
    CONSTRAINT pk_accueil_preference_aud PRIMARY KEY (id, rev),
    CONSTRAINT fk_accueil_preference_aud_rev FOREIGN KEY (rev) REFERENCES audit_revision (id)
);
CREATE INDEX idx_accueil_preference_aud_rev ON accueil_preference_aud (rev);

DO $$
DECLARE
    v_rev   BIGINT;
    v_roles INTEGER;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutees AS (
        INSERT INTO permission (code, description) VALUES
            ('ACCUEIL_READ', 'Voir son écran d’accueil'),
            ('ACCUEIL_WRITE', 'Choisir et ordonner les indicateurs de son accueil'),
            ('ACCUEIL_ADMIN', 'Consulter et régler les indicateurs de l’accueil d’un autre utilisateur')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutees;

    CREATE TEMPORARY TABLE roles_concernes ON COMMIT DROP AS
    SELECT r.id, r.nom, r.description FROM role r WHERE r.nom = 'SYSTEM_ADMIN';

    INSERT INTO role_permission (role_id, permission_id)
    SELECT r.id, p.id FROM roles_concernes r CROSS JOIN permission p WHERE p.code IN ('ACCUEIL_READ', 'ACCUEIL_WRITE', 'ACCUEIL_ADMIN');
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, r.id, p.id FROM roles_concernes r CROSS JOIN permission p WHERE p.code IN ('ACCUEIL_READ', 'ACCUEIL_WRITE', 'ACCUEIL_ADMIN');
    INSERT INTO role_aud (id, rev, revtype, nom, description) SELECT id, v_rev, 1, nom, description FROM roles_concernes;
    SELECT count(*) INTO v_roles FROM roles_concernes;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, 3 + v_roles,
           jsonb_build_object('migration', 'V42__accueil_personnalise', 'permissions', jsonb_build_array('ACCUEIL_READ', 'ACCUEIL_WRITE', 'ACCUEIL_ADMIN'), 'rolesAttribues', v_roles),
           id
    FROM audit_revision WHERE id = v_rev;
END $$;
