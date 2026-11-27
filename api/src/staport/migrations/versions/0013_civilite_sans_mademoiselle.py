"""Civilité : « Mademoiselle » retirée (décision du propriétaire, 2026-11-27).

L'attestation de travail ne propose plus que Monsieur ou Madame. Une fiche encore en `MADEMOISELLE` passe en `MADAME`
(même accord au féminin), puis la contrainte `ck_employe_civilite` n'accepte plus que `MONSIEUR` et `MADAME`.

Chaque fiche modifiée est journalisée dans une révision MIGRATION (gabarit de `conventions/database.md`). Idempotente :
sans fiche concernée, elle n'écrit rien dans l'audit. La correction de données n'est pas réversible : `downgrade` rouvre
seulement la contrainte.

Revision ID: 0013_civilite_sans_mademoiselle
Revises: 0012_documents_administratifs
"""

from alembic import op

revision = "0013_civilite_sans_mademoiselle"
down_revision = "0012_documents_administratifs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
        v_employes INTEGER := 0;
        v_request TEXT := gen_random_uuid()::text;
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM employe WHERE civilite = 'MADEMOISELLE') THEN
            RETURN;
        END IF;

        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', v_request, NULL)
        RETURNING id INTO v_rev;

        WITH modifies AS (
            UPDATE employe SET civilite = 'MADAME', version = version + 1
             WHERE civilite = 'MADEMOISELLE'
            RETURNING *
        )
        INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
                                 chantier_id, statut, equipe_id, salaire, type_salaire, matricule_cnss,
                                 date_declaration_cnss, civilite)
        SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut,
               equipe_id, salaire, type_salaire, matricule_cnss, date_declaration_cnss, civilite
        FROM modifies;
        GET DIAGNOSTICS v_employes = ROW_COUNT;

        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.employee.entities.Employee');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat,
                                   utilisateur_nom, origine, request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                v_request, v_employes,
                jsonb_build_object('migration', '0013_civilite_sans_mademoiselle', 'regle', 'CIVILITE'), v_rev);
    END $$;
    ALTER TABLE employe DROP CONSTRAINT ck_employe_civilite;
    ALTER TABLE employe ADD CONSTRAINT ck_employe_civilite CHECK (civilite IN ('MONSIEUR', 'MADAME'));
    """)


def downgrade() -> None:
    """La contrainte accepte de nouveau `MADEMOISELLE` ; les fiches passées en `MADAME` le restent."""
    op.execute("""
    ALTER TABLE employe DROP CONSTRAINT ck_employe_civilite;
    ALTER TABLE employe ADD CONSTRAINT ck_employe_civilite CHECK (civilite IN ('MONSIEUR', 'MADAME', 'MADEMOISELLE'));
    """)
