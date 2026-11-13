"""Permission EMPLOYEE_EXPORT : PDF des sortants, des entrants et des mouvements du mois.

Attribution à l'installation : SYSTEM_ADMIN et chaque rôle qui détient PAIE_EXPORT (PAIE_MANAGER en fait partie) ; les
droits se retirent ensuite depuis l'écran Rôles. La révision modifie des tables auditées (permission, role,
role_permission) : elle écrit sa révision, ses lignes d'audit et son entrée de journal avec le gabarit de
`conventions/database.md`.

Revision ID: 0005_permission_employee_export
Revises: 0004_nombres_metier_entiers
"""

from alembic import op

revision = "0005_permission_employee_export"
down_revision = "0004_nombres_metier_entiers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev   BIGINT;
        v_perm  BIGINT;
        v_roles INTEGER;
    BEGIN
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id INTO v_rev;

        WITH ajoutee AS (
            INSERT INTO permission (code, description)
            VALUES ('EMPLOYEE_EXPORT', 'Exporter en PDF les sortants, les entrants et les mouvements du mois')
            RETURNING *
        )
        INSERT INTO permission_aud (id, rev, revtype, code, description)
        SELECT id, v_rev, 0, code, description FROM ajoutee;
        SELECT id INTO v_perm FROM permission WHERE code = 'EMPLOYEE_EXPORT';

        CREATE TEMPORARY TABLE roles_concernes ON COMMIT DROP AS
        SELECT DISTINCT r.id, r.nom, r.description
        FROM role r
        WHERE r.nom = 'SYSTEM_ADMIN'
           OR EXISTS (SELECT 1 FROM role_permission rp JOIN permission p ON p.id = rp.permission_id
                      WHERE rp.role_id = r.id AND p.code = 'PAIE_EXPORT');

        INSERT INTO role_permission (role_id, permission_id) SELECT id, v_perm FROM roles_concernes;
        INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
        SELECT v_rev, 0, id, v_perm FROM roles_concernes;
        INSERT INTO role_aud (id, rev, revtype, nom, description)
        SELECT id, v_rev, 1, nom, description FROM roles_concernes;
        SELECT count(*) INTO v_roles FROM roles_concernes;

        INSERT INTO audit_revision_entite (revision_id, entite) VALUES
            (v_rev, 'staport.rh.auth.entities.Permission'),
            (v_rev, 'staport.rh.auth.entities.Role');

        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
               request_id, 1 + v_roles,
               jsonb_build_object('migration', '0005_permission_employee_export', 'permission', 'EMPLOYEE_EXPORT',
                                  'rolesAttribues', v_roles),
               id
        FROM audit_revision WHERE id = v_rev;
    END $$;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM role_permission WHERE permission_id = (SELECT id FROM permission WHERE code = 'EMPLOYEE_EXPORT');
    DELETE FROM permission WHERE code = 'EMPLOYEE_EXPORT';
    """)
