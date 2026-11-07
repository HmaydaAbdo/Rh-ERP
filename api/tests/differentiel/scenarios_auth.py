"""Authentification : connexion, verrouillage, cookie de rafraîchissement, mot de passe, JWKS, jeton agent."""

from typing import Any

from .harnais import MOT_DE_PASSE_TEST, Etape

M = "auth"
ORIGINE = {"Origin": "http://localhost:4300"}


def _e(nom: str, methode: str, chemin: str, corps: Any = None, **kw: Any) -> Etape:
    return Etape(M, nom, methode, chemin, json=corps, **kw)


def _comptes() -> list[Etape]:
    return [
        _e("permissions", "GET", "/permissions", capture={"p_ia": "code=IA_UTILISER.id"}),
        _e("role-ia", "POST", "/roles", {"nom": "Agent IA", "permissionIds": ["{p_ia}"]}, capture={"r_ia": "id"}),
        _e("role-vide", "POST", "/roles", {"nom": "Rien", "permissionIds": []}, capture={"r_rien": "id"}),
        *[
            _e(
                f"compte-{nom}",
                "POST",
                "/users",
                {
                    "username": nom,
                    "email": f"{nom}@example.org",
                    "motDePasse": MOT_DE_PASSE_TEST,
                    "roleIds": ["{" + r + "}"],
                },
                capture={f"u_{nom}": "id"},
            )
            for nom, r in (("agent", "r_ia"), ("simple", "r_rien"), ("verrou", "r_rien"), ("oubli", "r_rien"))
        ],
        _e(
            "compte-inactif",
            "POST",
            "/users",
            {
                "username": "inactif",
                "email": "inactif@example.org",
                "motDePasse": MOT_DE_PASSE_TEST,
                "roleIds": ["{r_rien}"],
            },
            capture={"u_inactif": "id"},
        ),
        _e(
            "desactiver-compte",
            "PUT",
            "/users/{u_inactif}",
            {"version": 0, "email": "inactif@example.org", "actif": False, "roleIds": ["{r_rien}"]},
        ),
    ]


def _connexions() -> list[Etape]:
    def login(nom: str, user: str, mdp: str, **kw: Any) -> Etape:
        return _e(nom, "POST", "/auth/login", {"username": user, "password": mdp}, jeton=False, **kw)

    return [
        login("login-ok", "simple", MOT_DE_PASSE_TEST),
        login("login-casse-differente", "SIMPLE", MOT_DE_PASSE_TEST),
        login("login-mauvais-mdp", "simple", "Mauvais-Mdp-2026!"),
        login("login-inconnu", "nexistepas", MOT_DE_PASSE_TEST),
        login("login-inactif", "inactif", MOT_DE_PASSE_TEST),
        login("login-mdp-vide", "simple", ""),
        _e("login-sans-corps", "POST", "/auth/login", jeton=False),
        _e("login-champ-absent", "POST", "/auth/login", {"username": "simple"}, jeton=False),
        *[login(f"verrou-echec-{i}", "verrou", "Mauvais-Mdp-2026!") for i in range(1, 8)],
        login("verrou-bon-mdp-apres-echecs", "verrou", MOT_DE_PASSE_TEST),
        _e("me", "GET", "/auth/me"),
        _e("me-sans-jeton", "GET", "/auth/me", jeton=False),
        _e("me-jeton-invalide", "GET", "/auth/me", jeton=False, en_tetes={"Authorization": "Bearer abc.def.ghi"}),
        _e("me-schema-incorrect", "GET", "/auth/me", jeton=False, en_tetes={"Authorization": "Basic YWJjOmRlZg=="}),
        _e("politique-mdp", "GET", "/auth/password-policy", jeton=False),
        _e("jwks", "GET", "/.well-known/jwks.json", jeton=False, ignorer=("keys",)),
    ]


def _session() -> list[Etape]:
    return [
        _e("refresh-ok", "POST", "/auth/login", {"username": "simple", "password": MOT_DE_PASSE_TEST}, jeton=False),
        _e("refresh-sans-origine", "POST", "/auth/refresh", jeton=False),
        _e(
            "refresh-origine-inconnue", "POST", "/auth/refresh", jeton=False, en_tetes={"Origin": "http://evil.example"}
        ),
        _e("refresh-avec-cookie", "POST", "/auth/refresh", jeton=False, en_tetes=ORIGINE),
        _e("refresh-rejoue", "POST", "/auth/refresh", jeton=False, en_tetes=ORIGINE),
        _e("logout-sans-jeton", "POST", "/auth/logout", jeton=False),
        _e("logout", "POST", "/auth/logout"),
        _e("refresh-apres-logout", "POST", "/auth/refresh", jeton=False, en_tetes=ORIGINE),
    ]


def _mot_de_passe() -> list[Etape]:
    return [
        _e("oubli-compte-existant", "POST", "/auth/forgot-password", {"email": "oubli@example.org"}, jeton=False),
        _e("oubli-compte-inconnu", "POST", "/auth/forgot-password", {"email": "personne@example.org"}, jeton=False),
        _e("oubli-courriel-invalide", "POST", "/auth/forgot-password", {"email": "pas-un-courriel"}, jeton=False),
        _e("oubli-sans-corps", "POST", "/auth/forgot-password", jeton=False),
        _e(
            "reinit-jeton-inconnu",
            "POST",
            "/auth/reset-password",
            {"token": "inconnu", "nouveauMotDePasse": "Nouveau-Mdp-2026!"},
            jeton=False,
        ),
        _e("reinit-mdp-vide", "POST", "/auth/reset-password", {"token": "x", "nouveauMotDePasse": ""}, jeton=False),
        _e("reinit-sans-corps", "POST", "/auth/reset-password", jeton=False),
        _e("reinit-admin-mdp-court", "POST", "/users/{u_simple}/reset-password", {"nouveauMotDePasse": "abc"}),
        _e(
            "reinit-admin-mdp-egal-identifiant",
            "POST",
            "/users/{u_simple}/reset-password",
            {"nouveauMotDePasse": "SIMPLE"},
        ),
        _e("reinit-admin-ok", "POST", "/users/{u_simple}/reset-password", {"nouveauMotDePasse": "Autre-Mdp-2026!"}),
        _e(
            "login-ancien-mdp",
            "POST",
            "/auth/login",
            {"username": "simple", "password": MOT_DE_PASSE_TEST},
            jeton=False,
        ),
        _e(
            "login-nouveau-mdp",
            "POST",
            "/auth/login",
            {"username": "simple", "password": "Autre-Mdp-2026!"},
            jeton=False,
        ),
    ]


def _agent() -> list[Etape]:
    return [
        _e("jeton-agent-ok", "POST", "/auth/jetons/agent", utilisateur="agent", ignorer=("jeton",)),
        _e("jeton-agent-sans-droit", "POST", "/auth/jetons/agent", utilisateur="simple"),
        _e("jeton-agent-sans-jeton", "POST", "/auth/jetons/agent", jeton=False),
    ]


def etapes() -> list[Etape]:
    toutes = [*_comptes(), *_connexions(), *_session(), *_mot_de_passe(), *_agent()]
    for e in toutes:
        e.module = M
        e.trier_listes = True  # permissions effectives : ensemble non ordonné
        if e.nom in ("refresh-ok", "login-nouveau-mdp"):
            e.ignorer = ("utilisateur.version",)  # Spring répond la version d'avant le vidage de la réinitialisation
    return toutes
