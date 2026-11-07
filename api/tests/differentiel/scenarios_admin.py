"""Rôles, permissions, utilisateurs, paramètres, accueil, journal d'audit et matrice des permissions (étape 3)."""

from typing import Any

from .harnais import MOT_DE_PASSE_TEST, Etape

M = "admin"


def _e(nom: str, methode: str, chemin: str, corps: Any = None, **kw: Any) -> Etape:
    return Etape(M, nom, methode, chemin, json=corps, **kw)


def _roles() -> list[Etape]:
    perm = "/permissions"
    return [
        _e(
            "permissions",
            "GET",
            perm,
            capture={
                "p_paie_read": "code=PAIE_READ.id",
                "p_emp_read": "code=EMPLOYEE_READ.id",
                "p_user": "code=USER_MANAGE.id",
            },
        ),
        _e(
            "role-creer",
            "POST",
            "/roles",
            {"nom": "Lecteur Paie", "description": "Lecture", "permissionIds": ["{p_paie_read}"]},
            capture={"r_lect": "id"},
        ),
        _e("role-creer-vide", "POST", "/roles", {"nom": "Aucun Droit", "permissionIds": []}, capture={"r_aucun": "id"}),
        _e("role-creer-doublon", "POST", "/roles", {"nom": "lecteur paie", "permissionIds": []}),
        _e("role-creer-nom-court", "POST", "/roles", {"nom": "x", "permissionIds": []}),
        _e("role-creer-nom-long", "POST", "/roles", {"nom": "x" * 51, "permissionIds": []}),
        _e("role-creer-permission-inconnue", "POST", "/roles", {"nom": "Fantome", "permissionIds": [999999]}),
        _e("role-creer-sans-permissions", "POST", "/roles", {"nom": "Sans Champ"}),
        _e("role-lire", "GET", "/roles/{r_lect}"),
        _e("role-lire-inconnu", "GET", "/roles/999999"),
        _e(
            "role-modifier",
            "PUT",
            "/roles/{r_lect}",
            {"nom": "Lecteur Paie 2", "permissionIds": ["{p_paie_read}", "{p_emp_read}"], "version": 0},
        ),
        _e(
            "role-modifier-version-perimee",
            "PUT",
            "/roles/{r_lect}",
            {"nom": "Lecteur Paie 3", "permissionIds": [], "version": 0},
        ),
        _e("role-modifier-sans-version", "PUT", "/roles/{r_lect}", {"nom": "Lecteur Paie 3", "permissionIds": []}),
        _e("role-recherche", "POST", "/roles/search", {}),
        _e("role-recherche-nom", "POST", "/roles/search", {"nom": "lect"}),
        _e("role-recherche-corps-absent", "POST", "/roles/search"),
        _e("role-recherche-tri-nom-desc", "POST", "/roles/search", {}, params={"sort": "nom,desc"}),
        _e(
            "role-recherche-tri-inconnu",
            "POST",
            "/roles/search",
            {},
            params={"sort": "zzz"},
            question="Q2 tri inconnu.",
        ),
        _e("role-recherche-nom-long", "POST", "/roles/search", {"nom": "x" * 51}),
    ]


def _utilisateurs() -> list[Etape]:
    def corps(nom: str, **plus: Any) -> dict[str, Any]:
        base: dict[str, Any] = {
            "username": nom,
            "email": f"{nom}@example.org",
            "motDePasse": MOT_DE_PASSE_TEST,
            "roleIds": ["{r_aucun}"],
        }
        base.update(plus)
        return base

    return [
        _e("user-creer-sans-droit", "POST", "/users", corps("sansdroit"), capture={"u_aucun": "id"}),
        _e("user-creer-lecteur", "POST", "/users", corps("lecteur", roleIds=["{r_lect}"]), capture={"u_lect": "id"}),
        _e("user-creer-doublon", "POST", "/users", corps("SansDroit", email="autre@example.org")),
        _e("user-creer-email-doublon", "POST", "/users", corps("autre", email="sansdroit@example.org")),
        _e("user-creer-email-invalide", "POST", "/users", corps("autre2", email="pas-un-courriel")),
        _e("user-creer-nom-court", "POST", "/users", corps("ab")),
        _e("user-creer-mdp-faible", "POST", "/users", corps("faible", motDePasse="abc")),
        _e("user-creer-role-inconnu", "POST", "/users", corps("sansrole", roleIds=[999999])),
        _e("user-creer-employe-inconnu", "POST", "/users", corps("sansemploye", employeeId=999999)),
        _e("user-lire", "GET", "/users/{u_lect}"),
        _e("user-lire-inconnu", "GET", "/users/999999"),
        _e(
            "user-modifier",
            "PUT",
            "/users/{u_lect}",
            {"version": 0, "email": "lecteur2@example.org", "actif": True, "roleIds": ["{r_lect}"]},
        ),
        _e(
            "user-modifier-version-perimee",
            "PUT",
            "/users/{u_lect}",
            {"version": 0, "email": "l3@example.org", "actif": True, "roleIds": ["{r_lect}"]},
        ),
        _e(
            "user-modifier-sans-actif",
            "PUT",
            "/users/{u_lect}",
            {"version": 1, "email": "l3@example.org", "roleIds": ["{r_lect}"]},
        ),
        _e(
            "user-permissions-refusees",
            "PUT",
            "/users/{u_lect}/permissions-refusees",
            {"version": 1, "permissionIds": ["{p_emp_read}"]},
        ),
        _e(
            "user-permissions-refusees-version-perimee",
            "PUT",
            "/users/{u_lect}/permissions-refusees",
            {"version": 0, "permissionIds": []},
        ),
        _e("user-reset-mdp", "POST", "/users/{u_lect}/reset-password", {"nouveauMotDePasse": MOT_DE_PASSE_TEST}),
        _e("user-reset-mdp-vide", "POST", "/users/{u_lect}/reset-password", {"nouveauMotDePasse": ""}),
        _e("user-recherche", "POST", "/users/search", {}),
        _e("user-recherche-actif", "POST", "/users/search", {"actif": True}),
        _e("user-recherche-nom", "POST", "/users/search", {"username": "sans"}),
        _e("user-recherche-courriel", "POST", "/users/search", {"email": "EXAMPLE"}),
        _e("user-recherche-corps-absent", "POST", "/users/search"),
        _e("user-recherche-tri-email", "POST", "/users/search", {}, params={"sort": "email,desc"}),
        _e("user-recherche-page", "POST", "/users/search", {}, params={"size": "1", "page": "1"}),
        _e("role-supprimer-utilise", "DELETE", "/roles/{r_lect}"),
        _e("role-supprimer-inconnu", "DELETE", "/roles/999999"),
        _e("role-supprimer-libre", "DELETE", "/roles/{r_libre}"),
    ]


def _parametres_accueil() -> list[Etape]:
    return [
        _e("parametres", "GET", "/parametres", capture={"par_id": "0.id"}),
        _e("parametre-modifier", "PUT", "/parametres/{par_id}", {"version": 0, "valeur": "12"}),
        _e("parametre-version-perimee", "PUT", "/parametres/{par_id}", {"version": 0, "valeur": "13"}),
        _e("parametre-valeur-vide", "PUT", "/parametres/{par_id}", {"version": 1, "valeur": ""}),
        _e("parametre-valeur-texte", "PUT", "/parametres/{par_id}", {"version": 1, "valeur": "abc"}),
        _e("parametre-valeur-negative", "PUT", "/parametres/{par_id}", {"version": 1, "valeur": "-5"}),
        _e("parametre-valeur-longue", "PUT", "/parametres/{par_id}", {"version": 1, "valeur": "9" * 256}),
        _e("parametre-inconnu", "PUT", "/parametres/999999", {"version": 0, "valeur": "1"}),
        _e("parametre-sans-version", "PUT", "/parametres/{par_id}", {"valeur": "1"}),
        _e("parametres-apres", "GET", "/parametres"),
        _e("accueil", "GET", "/accueil"),
        _e("accueil-enregistrer", "PUT", "/accueil", {"indicateurs": ["MASSE_SALARIALE"]}),
        _e("accueil-enregistrer-inconnu", "PUT", "/accueil", {"indicateurs": ["N_IMPORTE_QUOI"]}),
        _e("accueil-enregistrer-trop", "PUT", "/accueil", {"indicateurs": [f"I{i}" for i in range(21)]}),
        _e("accueil-version-perimee", "PUT", "/accueil", {"version": 99, "indicateurs": []}),
        _e("accueil-apres", "GET", "/accueil"),
        _e("accueil-supprimer", "DELETE", "/accueil"),
        _e("accueil-utilisateur", "GET", "/accueil/utilisateurs/{u_lect}"),
        _e("accueil-utilisateur-inconnu", "GET", "/accueil/utilisateurs/999999"),
        _e("accueil-utilisateur-enregistrer", "PUT", "/accueil/utilisateurs/{u_lect}", {"indicateurs": []}),
        _e("accueil-utilisateur-supprimer", "DELETE", "/accueil/utilisateurs/{u_lect}"),
    ]


def _journal() -> list[Etape]:
    return [
        _e(
            "journal",
            "POST",
            "/logs/search",
            {},
            params={"sort": "id,asc", "size": "1000"},
            capture={"l_id": "content.0.id"},
        ),
        _e("journal-categorie", "POST", "/logs/search", {"categories": ["SECURITE"]}, params={"sort": "id,asc"}),
        _e("journal-utilisateur", "POST", "/logs/search", {"utilisateur": "ci-admin"}, params={"sort": "id,asc"}),
        _e("journal-entite", "POST", "/logs/search", {"entiteType": "Role"}, params={"sort": "id,asc"}),
        _e("journal-corps-absent", "POST", "/logs/search", params={"sort": "id,asc"}),
        _e("journal-categorie-inconnue", "POST", "/logs/search", {"categories": ["NOPE"]}),
        _e("journal-tri-inconnu", "POST", "/logs/search", {}, params={"sort": "zzz"}, question="Q2 tri inconnu."),
        _e("journal-entree", "GET", "/logs/{l_id}"),
        _e("journal-entree-inconnue", "GET", "/logs/999999"),
        _e("journal-details", "GET", "/logs/{l_id}/details"),
        _e("journal-historique-role", "GET", "/logs/historique/Role/{r_lect}"),
        _e("journal-historique-inconnu", "GET", "/logs/historique/Inconnu/1"),
    ]


def _matrice() -> list[Etape]:
    """Chaque route protégée, appelée par un compte sans aucun droit (403 attendu), puis sans jeton (401)."""
    routes = [
        ("GET", "/parametres"),
        ("PUT", "/parametres/1"),
        ("GET", "/accueil"),
        ("PUT", "/accueil"),
        ("DELETE", "/accueil"),
        ("GET", "/accueil/utilisateurs/1"),
        ("POST", "/logs/search"),
        ("GET", "/logs/1"),
        ("GET", "/logs/1/details"),
        ("GET", "/logs/historique/Role/1"),
        ("GET", "/permissions"),
        ("POST", "/roles/search"),
        ("GET", "/roles/1"),
        ("POST", "/roles"),
        ("PUT", "/roles/1"),
        ("DELETE", "/roles/1"),
        ("POST", "/users/search"),
        ("GET", "/users/1"),
        ("POST", "/users"),
        ("PUT", "/users/1"),
        ("PUT", "/users/1/permissions-refusees"),
        ("POST", "/users/1/reset-password"),
        ("POST", "/employees/search"),
        ("GET", "/employees/1"),
        ("POST", "/employees"),
        ("PUT", "/employees/1"),
        ("DELETE", "/employees/1"),
        ("POST", "/employees/analytique"),
        ("POST", "/employees/regroupements"),
        ("POST", "/employees/sorties-mois"),
        ("GET", "/employees/import/modele"),
        ("POST", "/functions/search"),
        ("POST", "/functions"),
        ("PUT", "/functions/1"),
        ("DELETE", "/functions/1"),
        ("GET", "/functions/import/modele"),
        ("POST", "/equipes/search"),
        ("POST", "/equipes"),
        ("PUT", "/equipes/1"),
        ("DELETE", "/equipes/1"),
        ("GET", "/equipes/import/modele"),
        ("POST", "/chantiers/search"),
        ("POST", "/chantiers"),
        ("PUT", "/chantiers/1"),
        ("DELETE", "/chantiers/1"),
        ("POST", "/chantiers/sync"),
        ("POST", "/paie/search"),
        ("GET", "/paie/1"),
        ("POST", "/paie"),
        ("PUT", "/paie/1"),
        ("DELETE", "/paie/1"),
        ("GET", "/paie/periodes"),
        ("POST", "/paie/periodes/search"),
        ("POST", "/paie/chantiers/search"),
        ("GET", "/paie/materiel"),
        ("POST", "/paie/analytique"),
        ("POST", "/paie/effectifs"),
        ("POST", "/paie/options/chantiers"),
        ("POST", "/paie/options/equipes"),
        ("GET", "/paie/employes/1/parcours"),
        ("POST", "/paie/export"),
        ("POST", "/paie/report/pdf"),
        ("POST", "/paie/suppression"),
        ("POST", "/paie/restauration/1"),
        ("GET", "/paie/import/modele"),
        ("POST", "/paie/import/analyse"),
        ("POST", "/paie/import"),
        ("POST", "/paie/import/corrections"),
        ("POST", "/heures-supp/search"),
        ("GET", "/heures-supp/periodes"),
        ("POST", "/heures-supp/analytique"),
        ("POST", "/heures-supp/export/pdf"),
        ("POST", "/heures-supp/suppression-mois"),
        ("GET", "/heures-supp/import/modele"),
        ("GET", "/heures-supp/import/prerequis"),
        ("POST", "/heures-supp/import/analyse"),
        ("POST", "/heures-supp/import"),
        ("POST", "/heures-supp/import/remplacement"),
        ("POST", "/heures-supp/import/corrections"),
        ("POST", "/auth/jetons/agent"),
    ]
    e: list[Etape] = []
    for methode, chemin in routes:
        nom = f"{methode.lower()}{chemin.replace('/', '-')}"
        e.append(Etape(M, f"403{nom}", methode, chemin, utilisateur="sansdroit"))
        e.append(Etape(M, f"401{nom}", methode, chemin, jeton=False))
    return e


def etapes() -> list[Etape]:
    libre = _e(
        "role-creer-libre", "POST", "/roles", {"nom": "Role Libre", "permissionIds": []}, capture={"r_libre": "id"}
    )
    toutes = [*_roles(), libre, *_utilisateurs(), *_parametres_accueil(), *_journal(), *_matrice()]
    for e in toutes:
        e.module = M
        if e.nom.startswith(("403", "401")) and (e.methode in ("POST", "PUT") or "prerequis" in e.chemin):
            e.decide = "Spring valide le corps ou les paramètres avant les droits (400) ; Python refuse d'abord (403)."
        if e.nom.startswith("journal") and e.nom != "journal-categorie-inconnue" and "tri" not in e.nom:
            e.decide = "Journal d'audit : opérations seulement, jamais les lectures (décision du propriétaire)."
        if e.nom == "user-modifier-sans-actif":
            e.question = "Spring : actif absent = corps illisible (booléen primitif) ; Python : champ obligatoire."
        if e.nom.startswith("403") and "import" in e.chemin:
            e.question = (
                "Spring écrit error='Internal Server Error' sur ce 403 (étiquette fausse) ; Python 'Forbidden'."
            )
        e.trier_listes = e.trier_listes or e.chemin.startswith(
            ("/roles", "/users")
        )  # permissions : ensemble non ordonné
    return toutes
