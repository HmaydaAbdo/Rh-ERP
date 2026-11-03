"""Parité du domaine auth avec Spring (KAN-213) : connexion, verrouillage, rotation des sessions, mot de passe oublié.

Reprend `AuthServiceTest` et `VerrouillageConnexionIntegrationTest` sur un PostgreSQL réel, par l'API HTTP.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from collections.abc import Callable
from typing import Any

from conftest import ORIGINE, Plateforme
from sqlalchemy import text

from staport.domains.auth.securite import hasher_jeton
from staport.domains.common.securite import ActionSecurite as Action

Fabrique = Callable[..., tuple[int, str]]


def _login(p: Plateforme, username: str, mot_de_passe: str) -> Any:
    return p.client.post("/auth/login", json={"username": username, "password": mot_de_passe})


def _refresh(p: Plateforme, cookie: str | None = None) -> Any:
    if cookie is not None:
        p.client.cookies.clear()
        p.client.cookies.set("refresh_token", cookie, path="/auth")
    return p.client.post("/auth/refresh", headers={"Origin": ORIGINE})


def _ligne(p: Plateforme, identifiant: int) -> Any:
    with p.moteur.connect() as c:
        return c.execute(
            text(
                "SELECT nombre_echecs_connexion, derniere_echec_connexion, verrouillage_jusqua, mot_de_passe_hash "
                "FROM utilisateur WHERE id = :i"
            ),
            {"i": identifiant},
        ).one()


def _jetons(p: Plateforme, identifiant: int) -> list[Any]:
    with p.moteur.connect() as c:
        return list(
            c.execute(
                text("SELECT token_hash, famille, revoque FROM refresh_token WHERE utilisateur_id = :i ORDER BY id"),
                {"i": identifiant},
            ).all()
        )


def _sql(p: Plateforme, requete: str, **parametres: object) -> None:
    with p.moteur.begin() as c:
        c.execute(text(requete), parametres)


# --- Connexion ------------------------------------------------------------------------------------


def test_login_reussit_avec_des_identifiants_valides(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, mdp = creer_utilisateur("ok")
    nom = f"{_nom(plateforme, identifiant)}"
    reponse = _login(plateforme, nom, mdp)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["accessToken"].count(".") == 2
    assert corps["utilisateur"]["username"] == nom and corps["utilisateur"]["id"] == identifiant
    cookie = reponse.headers["set-cookie"]
    assert cookie.startswith("refresh_token=") and "HttpOnly" in cookie and "Path=/auth" in cookie
    assert "SameSite=lax" in cookie and "Max-Age=43200" in cookie and "Secure" not in cookie
    brut = reponse.cookies.get("refresh_token")
    stocke = _jetons(plateforme, identifiant)
    assert [j.token_hash for j in stocke] == [hasher_jeton(brut)] and brut not in stocke[0].token_hash
    assert plateforme.journal.de(nom, Action.CONNEXION_REUSSIE)


def test_login_echoue_avec_un_mot_de_passe_invalide(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, _ = creer_utilisateur("mdp")
    nom = _nom(plateforme, identifiant)
    reponse = _login(plateforme, nom, "mauvais")
    assert reponse.status_code == 401
    assert reponse.json()["message"] == "Identifiants invalides."
    assert _ligne(plateforme, identifiant).nombre_echecs_connexion == 1  # l'échec est enregistré malgré le refus
    assert plateforme.journal.de(nom, Action.CONNEXION_ECHOUEE)[0].motif == "IDENTIFIANTS_INVALIDES"
    assert _jetons(plateforme, identifiant) == []


def test_login_bloque_quinze_minutes_au_cinquieme_echec(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, _ = creer_utilisateur("blocage")
    nom = _nom(plateforme, identifiant)
    for _ in range(5):
        assert _login(plateforme, nom, "mauvais").status_code == 401
    ligne = _ligne(plateforme, identifiant)
    assert ligne.nombre_echecs_connexion == 5 and ligne.verrouillage_jusqua is not None
    with plateforme.moteur.connect() as c:
        minutes = c.execute(
            text("SELECT extract(epoch FROM verrouillage_jusqua - now()) / 60 FROM utilisateur WHERE id = :i"),
            {"i": identifiant},
        ).scalar_one()
    assert 14 < float(minutes) <= 15
    blocage = plateforme.journal.de(nom, Action.COMPTE_BLOQUE_TEMPORAIREMENT)[0]
    assert blocage.details == {"tentatives": 5, "fenetreMinutes": 15, "dureeMinutes": 15}


def test_login_refuse_un_compte_verrouille_meme_avec_le_bon_mot_de_passe(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, mdp = creer_utilisateur("verrou")
    nom = _nom(plateforme, identifiant)
    for _ in range(5):
        _login(plateforme, nom, "mauvais")
    reponse = _login(plateforme, nom, mdp)
    assert reponse.status_code == 401 and reponse.json()["message"] == "Identifiants invalides."
    assert plateforme.journal.de(nom, Action.CONNEXION_ECHOUEE)[-1].motif == "COMPTE_TEMPORAIREMENT_BLOQUE"
    assert _jetons(plateforme, identifiant) == []


def test_login_reinitialise_le_compteur_apres_quinze_minutes_sans_echec(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _ = creer_utilisateur("fenetre")
    nom = _nom(plateforme, identifiant)
    _sql(
        plateforme,
        "UPDATE utilisateur SET nombre_echecs_connexion = 4, "
        "derniere_echec_connexion = now() - interval '16 minutes' WHERE id = :i",
        i=identifiant,
    )
    assert _login(plateforme, nom, "mauvais").status_code == 401
    ligne = _ligne(plateforme, identifiant)
    assert ligne.nombre_echecs_connexion == 1 and ligne.verrouillage_jusqua is None


def test_login_reussi_efface_le_compteur_et_le_verrou_expire(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, mdp = creer_utilisateur("efface")
    nom = _nom(plateforme, identifiant)
    _sql(
        plateforme,
        "UPDATE utilisateur SET nombre_echecs_connexion = 5, derniere_echec_connexion = now() - interval '20 minutes', "
        "verrouillage_jusqua = now() - interval '5 minutes' WHERE id = :i",
        i=identifiant,
    )
    assert _login(plateforme, nom, mdp).status_code == 200
    ligne = _ligne(plateforme, identifiant)
    assert (ligne.nombre_echecs_connexion, ligne.derniere_echec_connexion, ligne.verrouillage_jusqua) == (0, None, None)


def test_login_echoue_pour_un_compte_inactif_avec_la_meme_reponse(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, mdp = creer_utilisateur("inactif", actif=False)
    nom = _nom(plateforme, identifiant)
    reponse = _login(plateforme, nom, mdp)
    assert reponse.status_code == 401 and reponse.json()["message"] == "Identifiants invalides."
    assert plateforme.journal.de(nom, Action.CONNEXION_ECHOUEE)[0].motif == "COMPTE_INACTIF"
    assert _jetons(plateforme, identifiant) == []


def test_login_echoue_pour_un_compte_inconnu_sans_conserver_l_identifiant(plateforme: Plateforme) -> None:
    avant = len(plateforme.journal.evenements)
    reponse = _login(plateforme, "personne-ici", "x")
    assert reponse.status_code == 401 and reponse.json()["message"] == "Identifiants invalides."
    nouveaux = plateforme.journal.evenements[avant:]
    assert [(e.action, e.motif, e.utilisateur_id, e.utilisateur_nom) for e in nouveaux] == [
        (Action.CONNEXION_ECHOUEE, "COMPTE_INCONNU", None, None)
    ]


def test_login_remplace_l_empreinte_bcrypt_de_spring_par_argon2(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, mdp = creer_utilisateur("bcrypt", bcrypt=True)
    nom = _nom(plateforme, identifiant)
    assert _ligne(plateforme, identifiant).mot_de_passe_hash.startswith("$2a$10$")
    assert _login(plateforme, nom, mdp).status_code == 200
    assert _ligne(plateforme, identifiant).mot_de_passe_hash.startswith("$argon2")
    assert _login(plateforme, nom, mdp).status_code == 200  # la nouvelle empreinte fonctionne


def test_login_valide_l_identifiant_sans_tenir_compte_de_la_casse_ni_des_espaces(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, mdp = creer_utilisateur("casse")
    nom = _nom(plateforme, identifiant)
    assert _login(plateforme, f"  {nom.upper()}  ", mdp).status_code == 200


# --- Renouvellement -------------------------------------------------------------------------------


def _session(p: Plateforme, creer: Fabrique, prefixe: str) -> tuple[int, str, str, str]:
    identifiant, mdp = creer(prefixe)
    nom = _nom(p, identifiant)
    reponse = _login(p, nom, mdp)
    return identifiant, nom, mdp, reponse.cookies.get("refresh_token")


def test_refresh_pivote_le_token_et_revoque_l_ancien(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, nom, _, premier = _session(plateforme, creer_utilisateur, "pivot")
    reponse = _refresh(plateforme, premier)
    assert reponse.status_code == 200 and reponse.json()["utilisateur"]["username"] == nom
    second = reponse.cookies.get("refresh_token")
    assert second and second != premier
    jetons = _jetons(plateforme, identifiant)
    assert [j.revoque for j in jetons] == [True, False]
    assert plateforme.journal.de(nom, Action.SESSION_RENOUVELEE)


def test_refresh_conserve_la_famille_lors_de_la_rotation(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, _, _, premier = _session(plateforme, creer_utilisateur, "famille")
    _refresh(plateforme, premier)
    familles = {j.famille for j in _jetons(plateforme, identifiant)}
    assert len(familles) == 1


def test_refresh_revoque_toute_la_famille_quand_un_token_consomme_est_reutilise(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, nom, _, premier = _session(plateforme, creer_utilisateur, "vol")
    second = _refresh(plateforme, premier).cookies.get("refresh_token")
    rejeu = _refresh(plateforme, premier)  # le voleur (ou le propriétaire) rejoue le jeton déjà consommé
    assert rejeu.status_code == 401
    assert rejeu.json()["message"] == "Refresh token invalide, expiré ou déjà utilisé."
    assert all(j.revoque for j in _jetons(plateforme, identifiant))  # la révocation reste enregistrée malgré le refus
    assert _refresh(plateforme, second).status_code == 401  # le jeton légitime est coupé aussi : reconnexion complète
    reutilisation = plateforme.journal.de(nom, Action.JETON_REUTILISE)[0]
    assert reutilisation.details == {"sessionsRevoquees": 1}


def test_refresh_echoue_si_le_token_est_expire(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, nom, _, premier = _session(plateforme, creer_utilisateur, "expire")
    _sql(
        plateforme,
        "UPDATE refresh_token SET expire_le = (now() at time zone 'utc') - interval '1 minute' "
        "WHERE utilisateur_id = :i",
        i=identifiant,
    )
    assert _refresh(plateforme, premier).status_code == 401
    assert plateforme.journal.de(nom, Action.SESSION_RENOUVELLEMENT_REFUSE)[0].motif == "JETON_EXPIRE"


def test_refresh_echoue_si_le_token_est_inconnu_ou_absent(plateforme: Plateforme) -> None:
    assert _refresh(plateforme, "inconnu-de-la-base").status_code == 401
    assert plateforme.journal.de(None, Action.SESSION_RENOUVELLEMENT_REFUSE)[-1].motif == "JETON_INCONNU"
    plateforme.client.cookies.clear()
    sans_cookie = _refresh(plateforme)
    assert sans_cookie.status_code == 401
    assert sans_cookie.json()["message"] == "Refresh token invalide, expiré ou déjà utilisé."


def test_refresh_refuse_un_compte_desactive_et_journalise_le_refus(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, nom, _, premier = _session(plateforme, creer_utilisateur, "desactive")
    _sql(plateforme, "UPDATE utilisateur SET actif = false WHERE id = :i", i=identifiant)
    assert _refresh(plateforme, premier).status_code == 401
    assert plateforme.journal.de(nom, Action.SESSION_RENOUVELLEMENT_REFUSE)[0].motif == "COMPTE_INACTIF"
    assert all(j.revoque for j in _jetons(plateforme, identifiant))


def test_logout_revoque_le_token_et_efface_le_cookie(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    identifiant, nom, mdp, _ = _session(plateforme, creer_utilisateur, "logout")
    acces = _login(plateforme, nom, mdp).json()["accessToken"]
    reponse = plateforme.client.post("/auth/logout", headers={"Authorization": f"Bearer {acces}"})
    assert reponse.status_code == 204
    assert "refresh_token=" in reponse.headers["set-cookie"] and "Max-Age=0" in reponse.headers["set-cookie"]
    assert [j.revoque for j in _jetons(plateforme, identifiant)][-1] is True
    assert plateforme.journal.de(nom, Action.DECONNEXION)


def test_logout_ne_fait_rien_si_le_token_est_inconnu(plateforme: Plateforme, creer_utilisateur: Fabrique) -> None:
    _, nom, mdp, _ = _session(plateforme, creer_utilisateur, "logoutinconnu")
    acces = _login(plateforme, nom, mdp).json()["accessToken"]
    plateforme.client.cookies.clear()
    plateforme.client.cookies.set("refresh_token", "inconnu", path="/auth")
    avant = len(plateforme.journal.evenements)
    assert plateforme.client.post("/auth/logout", headers={"Authorization": f"Bearer {acces}"}).status_code == 204
    assert [(e.action, e.motif) for e in plateforme.journal.evenements[avant:]] == [
        (Action.DECONNEXION, "SESSION_INCONNUE")
    ]


def test_logout_exige_une_session(plateforme: Plateforme) -> None:
    assert plateforme.client.post("/auth/logout").status_code == 401


def test_desactiver_un_compte_coupe_ses_sessions(
    plateforme: Plateforme, creer_utilisateur: Fabrique, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant, _nom_compte, _, premier = _session(plateforme, creer_utilisateur, "coupe")
    admin = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    cible = plateforme.client.get(f"/users/{identifiant}", headers={"Authorization": f"Bearer {admin}"}).json()
    plateforme.client.cookies.clear()
    modification = plateforme.client.put(
        f"/users/{identifiant}",
        headers={"Authorization": f"Bearer {admin}"},
        json={
            "version": cible["version"],
            "email": cible["email"],
            "actif": False,
            "employeeId": None,
            "roleIds": [],
        },
    )
    assert modification.status_code == 200 and modification.json()["actif"] is False
    assert all(j.revoque for j in _jetons(plateforme, identifiant))
    assert _refresh(plateforme, premier).status_code == 401
    revocation = [
        e
        for e in plateforme.journal.de(None, Action.SESSIONS_REVOQUEES)
        if e.details.get("utilisateurCibleId") == identifiant
    ]
    assert revocation and revocation[0].details["nombre"] == 1


# --- Mot de passe oublié --------------------------------------------------------------------------


def _oubli(p: Plateforme, email: str) -> Any:
    return p.client.post("/auth/forgot-password", json={"email": email})


def test_mot_de_passe_oublie_ne_revele_pas_qu_un_compte_existe(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _ = creer_utilisateur("oubli")
    with plateforme.moteur.connect() as c:
        email = c.execute(text("SELECT email FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    connu = _oubli(plateforme, email)
    inconnu = _oubli(plateforme, "personne@example.org")
    assert connu.status_code == inconnu.status_code == 202
    assert connu.content == inconnu.content == b""
    assert plateforme.journal.de(None, Action.MOT_DE_PASSE_OUBLIE)  # un événement à chaque demande, jamais l'adresse


def test_mot_de_passe_oublie_envoie_le_lien_au_proprietaire_du_compte(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _ = creer_utilisateur("lien")
    with plateforme.moteur.connect() as c:
        email = c.execute(text("SELECT email FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    avant = len(plateforme.journal.courriels)
    assert _oubli(plateforme, email.upper()).status_code == 202
    destinataire, jeton = plateforme.journal.courriels[avant]
    assert destinataire == email
    with plateforme.moteur.connect() as c:
        ligne = c.execute(
            text("SELECT token_hash, utilise FROM reset_password_token WHERE utilisateur_id = :i"), {"i": identifiant}
        ).one()
    assert ligne.token_hash == hasher_jeton(jeton) and ligne.utilise is False


def test_mot_de_passe_oublie_garde_la_reponse_generique_si_la_file_est_pleine(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _ = creer_utilisateur("saturee")
    with plateforme.moteur.connect() as c:
        email = c.execute(text("SELECT email FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    plateforme.journal.saturation = True
    try:
        reponse = _oubli(plateforme, email)
    finally:
        plateforme.journal.saturation = False
    assert reponse.status_code == 202 and reponse.content == b""


def _demander_lien(p: Plateforme, identifiant: int) -> str:
    with p.moteur.connect() as c:
        email = c.execute(text("SELECT email FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    _oubli(p, email)
    return p.journal.courriels[-1][1]


def test_reinitialiser_change_le_mot_de_passe_et_revoque_les_sessions(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, nom, mdp, premier = _session(plateforme, creer_utilisateur, "reinit")
    jeton = _demander_lien(plateforme, identifiant)
    reponse = plateforme.client.post(
        "/auth/reset-password", json={"token": jeton, "nouveauMotDePasse": "tout-nouveau-mdp-1"}
    )
    assert reponse.status_code == 204
    assert _login(plateforme, nom, mdp).status_code == 401
    assert _login(plateforme, nom, "tout-nouveau-mdp-1").status_code == 200
    assert _jetons(plateforme, identifiant)[0].revoque is True  # la session d'avant la réinitialisation est coupée
    assert _refresh(plateforme, premier).status_code == 401
    assert plateforme.journal.de(nom, Action.MOT_DE_PASSE_REINITIALISE)


def test_reinitialiser_refuse_un_mot_de_passe_non_conforme_sans_consommer_le_lien(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, nom, _, _ = _session(plateforme, creer_utilisateur, "conforme")
    jeton = _demander_lien(plateforme, identifiant)
    trop_court = plateforme.client.post("/auth/reset-password", json={"token": jeton, "nouveauMotDePasse": "court"})
    assert trop_court.status_code == 400
    assert trop_court.json()["message"] == (
        "Mot de passe non conforme : 10 caractères minimum et différent de l'identifiant."
    )
    identique = plateforme.client.post("/auth/reset-password", json={"token": jeton, "nouveauMotDePasse": nom.upper()})
    assert identique.status_code == 400
    ok = plateforme.client.post("/auth/reset-password", json={"token": jeton, "nouveauMotDePasse": "assez-long-mdp-2"})
    assert ok.status_code == 204  # le lien n'avait pas été brûlé


def test_reinitialiser_echoue_si_le_lien_est_deja_utilise_inconnu_ou_expire(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _, _, _ = _session(plateforme, creer_utilisateur, "utilise")
    jeton = _demander_lien(plateforme, identifiant)
    corps = {"token": jeton, "nouveauMotDePasse": "assez-long-mdp-3"}
    assert plateforme.client.post("/auth/reset-password", json=corps).status_code == 204
    rejeu = plateforme.client.post("/auth/reset-password", json=corps)
    assert rejeu.status_code == 400
    assert rejeu.json()["message"] == "Lien de réinitialisation invalide, expiré ou déjà utilisé."
    inconnu = plateforme.client.post("/auth/reset-password", json={**corps, "token": "inconnu"})
    assert inconnu.status_code == 400
    deuxieme = _demander_lien(plateforme, identifiant)
    _sql(
        plateforme,
        "UPDATE reset_password_token SET expire_le = (now() at time zone 'utc') - interval '1 minute' "
        "WHERE utilisateur_id = :i",
        i=identifiant,
    )
    expire = plateforme.client.post("/auth/reset-password", json={**corps, "token": deuxieme})
    assert expire.status_code == 400


def test_la_regle_des_mots_de_passe_est_publique(plateforme: Plateforme) -> None:
    reponse = plateforme.client.get("/auth/password-policy")
    assert reponse.status_code == 200 and reponse.json() == {"longueurMinimale": 10}


def test_l_administrateur_d_amorcage_existe_une_seule_fois(plateforme: Plateforme) -> None:
    with plateforme.moteur.connect() as c:
        admins = c.execute(
            text(
                "SELECT count(*) FROM utilisateur u JOIN utilisateur_role ur ON ur.utilisateur_id = u.id "
                "JOIN role r ON r.id = ur.role_id WHERE r.nom = 'SYSTEM_ADMIN' AND u.username = 'admin-essai'"
            )
        ).scalar_one()
    assert admins == 1
    reponse = _login(plateforme, "admin-essai", "mdp-admin-essai-123")
    assert reponse.status_code == 200
    assert "SYSTEM_ADMIN" in {r["nom"] for r in reponse.json()["utilisateur"]["roles"]}


def _nom(p: Plateforme, identifiant: int) -> str:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
