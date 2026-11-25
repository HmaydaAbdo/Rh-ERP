"""Rôle CHARGE_RH (chargée RH du département RH) et compte de Rania Atik.

Décision du propriétaire (2026-11-25) : le chargé RH **consulte** le périmètre RH et en tire les exports, sans
rien écrire, importer ni supprimer. Le rôle reçoit à l'installation :
- consultation : EMPLOYEE_READ, FUNCTION_READ, CHANTIER_READ, EQUIPE_READ, PAIE_READ, HEURES_SUP_READ ;
- exports : EMPLOYEE_EXPORT, PAIE_EXPORT ;
- accueil et assistant : ACCUEIL_READ, ACCUEIL_WRITE, IA_UTILISER.
Aucune écriture, aucun import, aucune suppression ou purge, ni administration, audit, paramètres ou carte. Ses
attributions restent ensuite administrables dans l'écran Rôles.

Le compte `rania.atik` (rania.atik@staport-sa.ma) porte ce rôle. Il naît **sans mot de passe utilisable** : son
empreinte est celle d'un secret aléatoire jeté aussitôt ; elle choisit le sien par « Mot de passe oublié ». Il est
relié à sa fiche employé quand une seule fiche libre porte son nom.

Idempotente et sans blocage au démarrage : un rôle CHARGE_RH déjà créé depuis l'écran Rôles est repris (il reçoit
seulement les permissions qui lui manquent) ; un compte qui a déjà cet identifiant ou ce courriel est repris et reçoit
seulement le rôle. Tables auditées : révision MIGRATION, lignes `_aud` et entrées du journal (gabarit de
`conventions/database.md`).

Revision ID: 0010_role_charge_rh
Revises: 0009_type_salaire_deduit
"""

import json
import secrets

import sqlalchemy as sa
from alembic import op
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

revision = "0010_role_charge_rh"
down_revision = "0009_type_salaire_deduit"
branch_labels = None
depends_on = None

MIGRATION = "0010_role_charge_rh"
ROLE = "CHARGE_RH"
ROLE_DESCRIPTION = "Chargé RH : consultation du périmètre RH (employés, paie, heures supplémentaires) et exports"
PERMISSIONS = (
    "EMPLOYEE_READ",
    "FUNCTION_READ",
    "CHANTIER_READ",
    "EQUIPE_READ",
    "PAIE_READ",
    "HEURES_SUP_READ",
    "EMPLOYEE_EXPORT",
    "PAIE_EXPORT",
    "ACCUEIL_READ",
    "ACCUEIL_WRITE",
    "IA_UTILISER",
)
USERNAME = "rania.atik"
EMAIL = "rania.atik@staport-sa.ma"


def _journal(
    conn: sa.Connection, rev: int, request_id: str, action: str, nombre: int, perimetre: dict[str, object]
) -> None:
    conn.execute(
        sa.text("""
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', :action, 'CREATE', 'SUCCES', 'Système', 'MIGRATION', :request_id, :nombre,
                CAST(:perimetre AS jsonb), :rev)
        """),
        {"action": action, "request_id": request_id, "nombre": nombre, "perimetre": json.dumps(perimetre), "rev": rev},
    )


def upgrade() -> None:
    conn = op.get_bind()
    rev, request_id = conn.execute(
        sa.text("""
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id, request_id
        """)
    ).one()

    # Rôle : créé, ou repris s'il existe déjà (même comparaison que l'unicité des noms, V27).
    role = conn.execute(
        sa.text("SELECT id, nom, description FROM role WHERE UPPER(BTRIM(nom)) = :nom"), {"nom": ROLE}
    ).one_or_none()
    role_cree = role is None
    if role_cree:
        role = conn.execute(
            sa.text("INSERT INTO role (nom, description) VALUES (:nom, :description) RETURNING id, nom, description"),
            {"nom": ROLE, "description": ROLE_DESCRIPTION},
        ).one()
    conn.execute(
        sa.text(
            "INSERT INTO role_aud (id, rev, revtype, nom, description) VALUES (:id, :rev, :type, :nom, :description)"
        ),
        {"id": role.id, "rev": rev, "type": 0 if role_cree else 1, "nom": role.nom, "description": role.description},
    )
    ajoutees = (
        conn.execute(
            sa.text("""
        INSERT INTO role_permission (role_id, permission_id)
        SELECT :role, p.id FROM permission p
         WHERE p.code = ANY(:codes)
           AND NOT EXISTS (SELECT 1 FROM role_permission rp WHERE rp.role_id = :role AND rp.permission_id = p.id)
        RETURNING permission_id
        """),
            {"role": role.id, "codes": list(PERMISSIONS)},
        )
        .scalars()
        .all()
    )
    for permission_id in ajoutees:
        conn.execute(
            sa.text(
                "INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) VALUES (:rev, 0, :role, :p)"
            ),
            {"rev": rev, "role": role.id, "p": permission_id},
        )

    # Compte : repris s'il existe (identifiant ou courriel), sinon créé sans mot de passe utilisable.
    compte = conn.execute(
        sa.text("""
        SELECT id, username, email, actif, employee_id FROM utilisateur
         WHERE UPPER(BTRIM(username)) = UPPER(:username) OR UPPER(BTRIM(email)) = UPPER(:email)
        ORDER BY id LIMIT 1
        """),
        {"username": USERNAME, "email": EMAIL},
    ).one_or_none()
    compte_cree = compte is None
    if compte_cree:
        fiches = (
            conn.execute(
                sa.text("""
            SELECT id FROM employe
             WHERE UPPER(BTRIM(nom_prenom)) IN ('ATIK RANIA', 'RANIA ATIK')
               AND NOT EXISTS (SELECT 1 FROM utilisateur u WHERE u.employee_id = employe.id)
            """)
            )
            .scalars()
            .all()
        )
        empreinte = PasswordHash((Argon2Hasher(),)).hash(secrets.token_urlsafe(48))
        compte = conn.execute(
            sa.text("""
            INSERT INTO utilisateur (username, email, mot_de_passe_hash, actif, employee_id)
            VALUES (:username, :email, :empreinte, true, :employe)
            RETURNING id, username, email, actif, employee_id
            """),
            {
                "username": USERNAME,
                "email": EMAIL,
                "empreinte": empreinte,
                "employe": fiches[0] if len(fiches) == 1 else None,
            },
        ).one()
    role_attribue = conn.execute(
        sa.text("""
        INSERT INTO utilisateur_role (utilisateur_id, role_id) VALUES (:u, :r)
        ON CONFLICT DO NOTHING RETURNING role_id
        """),
        {"u": compte.id, "r": role.id},
    ).scalar_one_or_none()
    if compte_cree or role_attribue is not None:
        conn.execute(
            sa.text("""
            INSERT INTO utilisateur_aud (id, rev, revtype, username, email, actif, employee_id)
            VALUES (:id, :rev, :type, :username, :email, :actif, :employe)
            """),
            {
                "id": compte.id,
                "rev": rev,
                "type": 0 if compte_cree else 1,
                "username": compte.username,
                "email": compte.email,
                "actif": compte.actif,
                "employe": compte.employee_id,
            },
        )
    if role_attribue is not None:
        conn.execute(
            sa.text(
                "INSERT INTO utilisateur_role_aud (rev, revtype, utilisateur_id, role_id) VALUES (:rev, 0, :u, :r)"
            ),
            {"rev": rev, "u": compte.id, "r": role.id},
        )

    conn.execute(
        sa.text("""
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES
            (:rev, 'staport.rh.auth.entities.Role'), (:rev, 'staport.rh.auth.entities.Utilisateur')
        """),
        {"rev": rev},
    )
    if role_cree or ajoutees:
        _journal(
            conn,
            rev,
            request_id,
            "ROLE_CREATION",
            1 + len(ajoutees),
            {"migration": MIGRATION, "role": ROLE, "permissionsAttribuees": len(ajoutees)},
        )
    if compte_cree or role_attribue is not None:
        _journal(
            conn,
            rev,
            request_id,
            "UTILISATEUR_CREATION",
            1,
            {"migration": MIGRATION, "utilisateur": compte.username, "role": ROLE, "compteCree": compte_cree},
        )


def downgrade() -> None:
    conn = op.get_bind()
    parametres = {"role": ROLE, "username": USERNAME}
    conn.execute(
        sa.text("DELETE FROM utilisateur_role WHERE role_id = (SELECT id FROM role WHERE nom = :role)"), parametres
    )
    conn.execute(sa.text("DELETE FROM utilisateur WHERE username = :username"), parametres)
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE role_id = (SELECT id FROM role WHERE nom = :role)"), parametres
    )
    conn.execute(sa.text("DELETE FROM role WHERE nom = :role"), parametres)
