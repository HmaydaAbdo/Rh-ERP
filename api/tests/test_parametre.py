"""Parité du domaine parametre avec Spring (KAN-215).

Reprend `CleParametreTest` (catalogue, normalisation) et `ParametreServiceTest` (valeurs de départ, modification lue
aussitôt et tracée, refus sans effet, paramètre inconnu, cron invalide), sur un PostgreSQL réel par l'API HTTP, plus les
droits `PARAMETRE_READ` / `PARAMETRE_WRITE`, le verrou optimiste et l'absence de valeur de repli.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from collections.abc import Callable, Iterator
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from conftest import Plateforme
from sqlalchemy import text

from staport.domains.parametre import catalogue
from staport.domains.parametre.catalogue import DefinitionParametre, TypeParametre, expression_cron_valide
from staport.domains.parametre.exceptions import InstallationIncomplete, ParametreInvalide

# --- Catalogue (sans base) ------------------------------------------------------------------------


def test_les_codes_sont_uniques_et_retrouvables() -> None:
    codes = [d.code for d in catalogue.CATALOGUE]
    assert len(set(codes)) == len(codes) == 6
    for definition in catalogue.CATALOGUE:
        assert catalogue.depuis_code(definition.code) is definition
    assert catalogue.depuis_code("inconnu") is None


def test_un_entier_dans_les_bornes_est_accepte_sous_sa_forme_canonique() -> None:
    assert catalogue.JETON_SESSION.normaliser(" 012 ") == "12"
    assert catalogue.JETON_SESSION.normaliser("1") == "1"
    assert catalogue.JETON_SESSION.normaliser("720") == "720"
    assert catalogue.JETON_SESSION.normaliser("+5") == "5"


@pytest.mark.parametrize(
    "saisie", ["0", "721", "1,5", "1e2", "0x10", "1_0", "٣", "", "   ", "dix", None, "9" * 30, "-1"]
)
def test_un_entier_hors_bornes_ou_une_saisie_qui_n_en_est_pas_un_est_refuse(saisie: str | None) -> None:
    with pytest.raises(ParametreInvalide):
        catalogue.JETON_SESSION.normaliser(saisie)


def test_les_messages_distinguent_le_type_et_les_bornes() -> None:
    with pytest.raises(ParametreInvalide, match="entre 8 et 100"):
        catalogue.LONGUEUR_MOT_DE_PASSE.normaliser("7")
    with pytest.raises(ParametreInvalide, match="nombre entier"):
        catalogue.LONGUEUR_MOT_DE_PASSE.normaliser("dix")
    assert catalogue.LONGUEUR_MOT_DE_PASSE.minimum == 8


@pytest.mark.parametrize(
    "expression",
    [
        " 0 30 2 * * * ",
        "0 0 23 * * *",
        "0 0/15 8-18 * * MON-FRI",
        "0 0 6 1 JAN *",
        "*/10 * * * * *",
        "0 0 9 * * mon,wed",
    ],
)
def test_une_expression_cron_a_six_champs_est_acceptee(expression: str) -> None:
    assert catalogue.CRON_SYNCHRONISATION_CHANTIERS.normaliser(expression) == expression.strip()


@pytest.mark.parametrize(
    "expression",
    [
        "0 30 2",  # trois champs
        "",
        "tous les soirs",
        "0 0 23 * * * *",  # sept champs
        "0 0 24 * * *",  # heure hors plage
        "0 60 23 * * *",  # minute hors plage
        "0 0 23 * * 1",  # jour numérique : 0 = lundi pour APScheduler, dimanche pour Spring
        "0 0 23 * * 0-6",
        "0 0 23 ? * MON",  # `?` de Spring non reconnu
    ],
)
def test_une_expression_cron_invalide_est_refusee(expression: str) -> None:
    assert not expression_cron_valide(expression)
    with pytest.raises(ParametreInvalide, match="cron"):
        catalogue.CRON_SYNCHRONISATION_CHANTIERS.normaliser(expression)


# --- API sur PostgreSQL réel ----------------------------------------------------------------------

DEPART = {
    catalogue.JETON_ACCES.code: "15",
    catalogue.JETON_SESSION.code: "12",
    catalogue.LIEN_REINITIALISATION.code: "60",
    catalogue.LONGUEUR_MOT_DE_PASSE.code: "10",
    catalogue.PAS_TRANCHE_ANALYTIQUE.code: "500",
    catalogue.CRON_SYNCHRONISATION_CHANTIERS.code: "0 0 23 * * *",
}


@pytest.fixture
def admin(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    acces = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    plateforme.client.cookies.clear()
    return {"Authorization": f"Bearer {acces}"}


@pytest.fixture(autouse=True)
def valeurs_de_depart(plateforme: Plateforme) -> Iterator[None]:
    """La base des tests est partagée : chaque test restitue les valeurs posées par la migration."""
    yield
    with plateforme.moteur.begin() as c:
        for cle, valeur in DEPART.items():
            c.execute(text("UPDATE parametre SET valeur = :v WHERE cle = :c"), {"v": valeur, "c": cle})


def _lister(p: Plateforme, admin: dict[str, str]) -> dict[str, dict[str, Any]]:
    reponse = p.client.get("/parametres", headers=admin)
    assert reponse.status_code == 200, reponse.text
    return {ligne["cle"]: ligne for ligne in reponse.json()}


def _lignes(p: Plateforme, sql: str, **parametres: Any) -> list[dict[str, Any]]:
    with p.moteur.connect() as c:
        return [dict(ligne) for ligne in c.execute(text(sql), parametres).mappings()]


def test_la_migration_pose_une_valeur_de_depart_pour_chaque_cle_du_catalogue(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    parametres = _lister(plateforme, admin)
    assert list(parametres) == [d.code for d in catalogue.CATALOGUE]
    assert {cle: p["valeur"] for cle, p in parametres.items()} == DEPART

    session = plateforme.client.portal  # boucle de l'application : les lecteurs typés sont asynchrones
    assert session is not None

    async def lire() -> tuple[object, ...]:
        fabrique = plateforme.app.state.fabrique_sessions
        service = plateforme.contexte.parametres
        async with fabrique() as s, s.begin():
            return (
                await service.duree_jeton_acces(s),
                await service.duree_jeton_session(s),
                await service.duree_lien_reinitialisation(s),
                await service.longueur_minimale_mot_de_passe(s),
                await service.pas_tranche_analytique(s),
                await service.cron_synchronisation_chantiers(s),
            )

    assert session.call(lire) == (
        timedelta(minutes=15),
        timedelta(hours=12),
        timedelta(hours=1),
        10,
        Decimal(500),
        "0 0 23 * * *",
    )


def test_la_liste_expose_les_metadonnees_de_saisie_du_catalogue(plateforme: Plateforme, admin: dict[str, str]) -> None:
    parametres = _lister(plateforme, admin)
    session = parametres["securite.jeton-session.heures"]
    assert set(session) == {
        "id",
        "version",
        "cle",
        "libelle",
        "description",
        "type",
        "unite",
        "minimum",
        "maximum",
        "valeur",
    }
    assert (session["type"], session["unite"], session["minimum"], session["maximum"]) == ("ENTIER", "heures", 1, 720)
    assert session["libelle"] == "Durée de la session"
    cron = parametres["chantier.synchronisation.cron"]
    assert (cron["type"], cron["unite"], cron["minimum"], cron["maximum"]) == ("CRON", None, None, None)


def test_une_modification_se_lit_aussitot_et_laisse_une_entree_d_audit_avec_l_ancienne_et_la_nouvelle_valeur(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    avant = _lister(plateforme, admin)["securite.jeton-session.heures"]

    reponse = plateforme.client.put(
        f"/parametres/{avant['id']}", headers=admin, json={"version": avant["version"], "valeur": " 8 "}
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["valeur"] == "8"  # espaces retirés
    assert reponse.json()["version"] == avant["version"] + 1
    assert _lister(plateforme, admin)["securite.jeton-session.heures"]["valeur"] == "8"

    entree = _lignes(
        plateforme,
        "SELECT * FROM audit_journal WHERE request_id = :r",
        r=reponse.headers["X-Request-Id"],
    )[0]
    assert (entree["categorie"], entree["action"], entree["type_operation"], entree["resultat"]) == (
        "OPERATION",
        "PARAMETRE_MODIFICATION",
        "UPDATE",
        "SUCCES",
    )
    assert entree["utilisateur_nom"] == "admin-essai"
    historique = _lignes(
        plateforme, "SELECT cle, valeur, revtype FROM parametre_aud WHERE rev = :r", r=entree["revision_id"]
    )
    assert historique == [{"cle": "securite.jeton-session.heures", "valeur": "8", "revtype": 1}]


def test_la_valeur_modifiee_est_celle_que_lit_l_authentification(plateforme: Plateforme, admin: dict[str, str]) -> None:
    longueur = _lister(plateforme, admin)["securite.mot-de-passe.longueur-minimale"]
    plateforme.client.put(
        f"/parametres/{longueur['id']}", headers=admin, json={"version": longueur["version"], "valeur": "14"}
    )

    politique = plateforme.client.get("/auth/password-policy")

    assert politique.status_code == 200, politique.text
    assert 14 in politique.json().values()


def test_une_valeur_hors_bornes_ou_d_un_autre_type_est_refusee_sans_rien_changer(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    ligne = _lister(plateforme, admin)["securite.mot-de-passe.longueur-minimale"]
    url = f"/parametres/{ligne['id']}"
    avant = _lignes(plateforme, "SELECT count(*) AS n FROM parametre_aud")[0]["n"]

    hors_bornes = plateforme.client.put(url, headers=admin, json={"version": ligne["version"], "valeur": "3"})
    mauvais_type = plateforme.client.put(url, headers=admin, json={"version": ligne["version"], "valeur": "dix"})

    assert hors_bornes.status_code == 400
    assert "entre 8 et 100" in hors_bornes.json()["message"]
    assert mauvais_type.status_code == 400
    apres = _lister(plateforme, admin)["securite.mot-de-passe.longueur-minimale"]
    assert (apres["valeur"], apres["version"]) == ("10", ligne["version"])
    assert _lignes(plateforme, "SELECT count(*) AS n FROM parametre_aud")[0]["n"] == avant
    echec = _lignes(
        plateforme, "SELECT resultat FROM audit_journal WHERE request_id = :r", r=hors_bornes.headers["X-Request-Id"]
    )
    assert echec == [{"resultat": "ECHEC"}]  # l'opération rejetée est tracée, sans rien enregistrer


def test_une_expression_cron_invalide_est_refusee_par_l_api(plateforme: Plateforme, admin: dict[str, str]) -> None:
    ligne = _lister(plateforme, admin)["chantier.synchronisation.cron"]

    reponse = plateforme.client.put(
        f"/parametres/{ligne['id']}", headers=admin, json={"version": ligne["version"], "valeur": "tous les soirs"}
    )

    assert reponse.status_code == 400
    assert "cron" in reponse.json()["message"]
    assert _lister(plateforme, admin)["chantier.synchronisation.cron"]["valeur"] == "0 0 23 * * *"


def test_un_parametre_inconnu_est_introuvable(plateforme: Plateforme, admin: dict[str, str]) -> None:
    reponse = plateforme.client.put("/parametres/-1", headers=admin, json={"version": 0, "valeur": "5"})

    assert reponse.status_code == 404
    assert reponse.json()["message"] == "Paramètre introuvable avec l'id : -1"


def test_une_version_perimee_est_un_conflit(plateforme: Plateforme, admin: dict[str, str]) -> None:
    ligne = _lister(plateforme, admin)["securite.jeton-acces.minutes"]
    url = f"/parametres/{ligne['id']}"
    premiere = plateforme.client.put(url, headers=admin, json={"version": ligne["version"], "valeur": "20"})
    assert premiere.status_code == 200

    perimee = plateforme.client.put(url, headers=admin, json={"version": ligne["version"], "valeur": "30"})

    assert perimee.status_code == 409
    assert _lister(plateforme, admin)["securite.jeton-acces.minutes"]["valeur"] == "20"


@pytest.mark.parametrize("corps", [{"valeur": "5"}, {"version": 0}, {"version": 0, "valeur": "  "}])
def test_une_requete_incomplete_est_refusee(
    plateforme: Plateforme, admin: dict[str, str], corps: dict[str, Any]
) -> None:
    ligne = _lister(plateforme, admin)["securite.jeton-acces.minutes"]

    reponse = plateforme.client.put(f"/parametres/{ligne['id']}", headers=admin, json=corps)

    assert reponse.status_code == 400


def test_chaque_route_exige_sa_permission(
    plateforme: Plateforme,
    admin: dict[str, str],
    creer_utilisateur: Callable[..., tuple[int, str]],
    connecter: Callable[[str, str], dict[str, Any]],
) -> None:
    ligne = _lister(plateforme, admin)["securite.jeton-acces.minutes"]
    identifiant, mot_de_passe = creer_utilisateur()
    nom = _lignes(plateforme, "SELECT username FROM utilisateur WHERE id = :i", i=identifiant)[0]["username"]
    simple = {"Authorization": f"Bearer {connecter(nom, mot_de_passe)['accessToken']}"}
    plateforme.client.cookies.clear()

    assert plateforme.client.get("/parametres", headers=simple).status_code == 403
    assert (
        plateforme.client.put(
            f"/parametres/{ligne['id']}", headers=simple, json={"version": ligne["version"], "valeur": "20"}
        ).status_code
        == 403
    )
    assert plateforme.client.get("/parametres").status_code == 401
    assert _lister(plateforme, admin)["securite.jeton-acces.minutes"]["valeur"] == "15"


def test_une_cle_du_catalogue_sans_ligne_est_une_installation_incomplete(plateforme: Plateforme) -> None:
    """Aucune valeur de repli ne masque une installation incomplète (parité avec Spring)."""
    inconnue = DefinitionParametre("test.absente", "Absente", "", TypeParametre.ENTIER, None, 1, 2)
    portail = plateforme.client.portal
    assert portail is not None

    async def lire() -> None:
        fabrique = plateforme.app.state.fabrique_sessions
        async with fabrique() as s, s.begin():
            await plateforme.contexte.parametres._valeur(s, inconnue)  # pyright: ignore[reportPrivateUsage]

    with pytest.raises(InstallationIncomplete, match=r"test\.absente"):
        portail.call(lire)
