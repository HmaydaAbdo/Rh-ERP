"""Documents administratifs (KAN-320) : déclaration CNSS et civilité de l'employé, permission d'édition.

- `employe` et `employe_aud` reçoivent `matricule_cnss` (chiffres seulement, unique), `date_declaration_cnss` et
  `civilite` (`MONSIEUR`, `MADAME`, `MADEMOISELLE`), tous facultatifs : ils se remplissent par l'import des
  déclarations CNSS, la fiche de l'employé ou l'impression d'une attestation.
- Permission `DOCUMENT_ADMIN_EDITER` (imprimer les documents administratifs, d'abord l'attestation de travail),
  accordée à l'installation à `SYSTEM_ADMIN` et à `CHARGE_RH` (décision du propriétaire, 2026-11-25) ; elle reste
  ensuite administrable depuis l'écran Rôles.

Tables auditées : révision MIGRATION, lignes `_aud` et entrée de journal (gabarit de `conventions/database.md`).
Ajouter des colonnes vides ne change aucune ligne : rien n'est historisé pour `employe`.

Revision ID: 0012_documents_administratifs
Revises: 0011_identifiants_canoniques
"""

from alembic import op

revision = "0012_documents_administratifs"
down_revision = "0011_identifiants_canoniques"
branch_labels = None
depends_on = None

COLONNES = """
ALTER TABLE employe
    ADD COLUMN matricule_cnss VARCHAR(20),
    ADD COLUMN date_declaration_cnss DATE,
    ADD COLUMN civilite VARCHAR(12),
    ADD CONSTRAINT ck_employe_matricule_cnss CHECK (matricule_cnss ~ '^[0-9]+$'),
    ADD CONSTRAINT ck_employe_civilite CHECK (civilite IN ('MONSIEUR', 'MADAME', 'MADEMOISELLE')),
    ADD CONSTRAINT uk_employe_matricule_cnss UNIQUE (matricule_cnss);
ALTER TABLE employe_aud
    ADD COLUMN matricule_cnss VARCHAR(20),
    ADD COLUMN date_declaration_cnss DATE,
    ADD COLUMN civilite VARCHAR(12);
"""

PERMISSION = """
DO $$
DECLARE
    v_rev   BIGINT;
    v_perm  BIGINT;
    v_roles INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM permission WHERE code = 'DOCUMENT_ADMIN_EDITER') THEN
        RETURN;
    END IF;
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('DOCUMENT_ADMIN_EDITER', 'Imprimer les documents administratifs des employés (attestation de travail)')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'DOCUMENT_ADMIN_EDITER';

    CREATE TEMPORARY TABLE roles_documents_admin ON COMMIT DROP AS
    SELECT id, nom, description FROM role WHERE nom IN ('SYSTEM_ADMIN', 'CHARGE_RH');

    INSERT INTO role_permission (role_id, permission_id) SELECT id, v_perm FROM roles_documents_admin;
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, id, v_perm FROM roles_documents_admin;
    INSERT INTO role_aud (id, rev, revtype, nom, description)
    SELECT id, v_rev, 1, nom, description FROM roles_documents_admin;
    SELECT count(*) INTO v_roles FROM roles_documents_admin;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, 1 + v_roles,
           jsonb_build_object('migration', '0012_documents_administratifs', 'permission', 'DOCUMENT_ADMIN_EDITER',
                              'rolesAttribues', v_roles),
           id
    FROM audit_revision WHERE id = v_rev;
END $$;
"""


def upgrade() -> None:
    op.execute(COLONNES)
    op.execute(PERMISSION)


def downgrade() -> None:
    op.execute("""
    DELETE FROM role_permission WHERE permission_id = (SELECT id FROM permission WHERE code = 'DOCUMENT_ADMIN_EDITER');
    DELETE FROM permission WHERE code = 'DOCUMENT_ADMIN_EDITER';
    ALTER TABLE employe_aud DROP COLUMN civilite, DROP COLUMN date_declaration_cnss, DROP COLUMN matricule_cnss;
    ALTER TABLE employe DROP COLUMN civilite, DROP COLUMN date_declaration_cnss, DROP COLUMN matricule_cnss;
    """)
