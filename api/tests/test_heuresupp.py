"""Heures supplémentaires et forfaits, de bout en bout sur PostgreSQL réel (parité `HeuresSuppService`)."""

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from sqlalchemy import text

from staport.domains.employee.models import TypeSalaire
from staport.domains.heuresupp import calcul

PERIODE = 209807
MOIS = "2098-07"


@dataclass
class Jeu:
    fonction: int
    chantier: int
    autre_chantier: int
    equipe: int
    employes: list[int]  # 0 mensuel 2600 (S/H 10), 1 journalier 105 (S/H 10), 2 mensuel 10000 (STC, S/H 38)
    bulletins: list[int]


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    marque = uuid.uuid4().hex[:8]
    with plateforme.moteur.begin() as c:
        fonction = c.execute(
            text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": f"HS {marque}"}
        ).scalar_one()
        chantiers = [
            c.execute(
                text("INSERT INTO chantier (code, designation, nom) VALUES (:c, 'HS', :n) RETURNING id"),
                {"c": f"H{marque}{rang}", "n": f"Chantier {rang}"},
            ).scalar_one()
            for rang in range(2)
        ]
        equipe = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, 'Equipe HS') RETURNING id"), {"c": f"E{marque}"}
        ).scalar_one()
        employes: list[int] = []
        bulletins: list[int] = []
        for rang, (salaire, type_salaire, observation, equipe_bulletin) in enumerate(
            [(2600, "MENSUEL", None, equipe), (105, "JOURNALIER", None, None), (10000, "MENSUEL", "STC", None)]
        ):
            employe = c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "statut, salaire, type_salaire) VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF', "
                    ":s, :t) RETURNING id"
                ),
                {
                    "n": f"Heures {rang}",
                    "cin": f"HS{marque}{rang}",
                    "f": fonction,
                    "c": chantiers[0],
                    "s": salaire,
                    "t": type_salaire,
                },
            ).scalar_one()
            employes.append(employe)
            bulletins.append(
                c.execute(
                    text(
                        "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, "
                        "nombre_jours_travailles, salaire_mensuel, salaire_total, observation) "
                        "VALUES (:e, :p, :f, :c, :q, 26, 100, 100, :o) RETURNING id"
                    ),
                    {
                        "e": employe,
                        "p": PERIODE,
                        "f": fonction,
                        "c": chantiers[0],
                        "q": equipe_bulletin,
                        "o": observation,
                    },
                ).scalar_one()
            )
    yield Jeu(fonction, chantiers[0], chantiers[1], equipe, employes, bulletins)
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM heures_supp WHERE employee_id = ANY(:e)"), {"e": employes})
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": employes})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": employes})
        c.execute(text("DELETE FROM equipe WHERE id = :q"), {"q": equipe})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:c)"), {"c": chantiers})
        c.execute(text("DELETE FROM fonction WHERE id = :f"), {"f": fonction})


@pytest.fixture
def entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _creer(p: Plateforme, entetes: dict[str, str], jeu: Jeu, rang: int, **champs: Any) -> Any:
    corps = {"employeeId": jeu.employes[rang], "periode": MOIS, "chantierId": jeu.chantier} | champs
    return p.client.post("/heures-supp", headers=entetes, json=corps)


def _journal(p: Plateforme, action: str, resultat: str = "SUCCES") -> Any:
    with p.moteur.connect() as c:
        return (
            c.execute(
                text(
                    "SELECT type_operation, entite_type, entite_id, resultat, perimetre, nombre_elements "
                    "FROM audit_journal WHERE action = :a AND resultat = :r ORDER BY id DESC LIMIT 1"
                ),
                {"a": action, "r": resultat},
            )
            .mappings()
            .one()
        )


def _revisions(p: Plateforme, identifiant: int) -> list[int]:
    with p.moteur.connect() as c:
        return list(
            c.execute(
                text("SELECT revtype FROM heures_supp_aud WHERE id = :i ORDER BY rev"), {"i": identifiant}
            ).scalars()
        )


def test_le_calcul_arrondit_a_deux_decimales_demi_superieur() -> None:
    assert calcul.salaire_horaire(Decimal("105"), TypeSalaire.JOURNALIER) == Decimal("10.50")
    assert calcul.salaire_horaire(Decimal("2600"), TypeSalaire.MENSUEL) == Decimal("10.00")
    assert calcul.salaire_horaire(Decimal("10000"), TypeSalaire.MENSUEL) == Decimal("38.46")  # 38,4615
    assert calcul.salaire_horaire(Decimal("4500"), TypeSalaire.MENSUEL) == Decimal("17.31")  # 17,3077
    assert calcul.montant(Decimal(10), Decimal("1.5")) == Decimal("15.00")
    assert calcul.montant(Decimal("17.31"), Decimal("7.5")) == Decimal("129.83")  # 129,825 : demi supérieur
    assert calcul.montant(None, Decimal(2)) == 0
    assert calcul.net_a_payer(Decimal(100), Decimal(100), Decimal(30)) == 30


def test_creation_calcule_le_taux_le_montant_et_l_audit(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    reponse = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="7.5", forfaitDh="20")

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["periode"] == MOIS
    assert (corps["salaireReferenceDh"], corps["typeSalaireReference"], corps["salaireHoraireDh"]) == (
        2600.0,
        "MENSUEL",
        10.0,
    )
    assert (corps["heuresSupplementaires"], corps["montantDh"], corps["stcDh"], corps["forfaitDh"]) == (
        7.5,
        75.0,
        0.0,
        20.0,
    )
    assert (corps["netAPayerDh"], corps["stcOuSortie"], corps["nomPrenom"], corps["codeChantier"]) == (
        95.0,
        False,
        "Heures 0",
        corps["codeChantier"],
    )
    assert corps["chantier"] == "Chantier 0"
    assert _revisions(plateforme, corps["id"]) == [0]
    journal = _journal(plateforme, "HEURES_SUP_CREATION_UNITAIRE")
    assert (journal["type_operation"], journal["entite_type"], journal["entite_id"]) == (
        "CREATE",
        "HeureSupp",
        corps["id"],
    )


def test_le_taux_journalier_garde_ses_centimes_et_un_forfait_seul_n_a_pas_de_taux(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    journalier = _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="1.5").json()
    forfait = _creer(plateforme, entetes, jeu, 0, forfaitDh="500").json()

    assert (journalier["salaireHoraireDh"], journalier["montantDh"]) == (10.5, 15.75)
    assert forfait["heuresSupplementaires"] is None
    assert (forfait["salaireHoraireDh"], forfait["salaireReferenceDh"], forfait["typeSalaireReference"]) == (
        None,
        None,
        None,
    )
    assert (forfait["montantDh"], forfait["netAPayerDh"]) == (0.0, 500.0)


def test_creation_refuse_les_saisies_incoherentes_avec_les_messages_de_spring(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    premiere = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1")
    with plateforme.moteur.begin() as c:  # forfait déjà posé sur l'autre chantier pour l'employé en STC
        c.execute(
            text(
                "INSERT INTO heures_supp (employee_id, paie_id, fonction_id, chantier_id, periode, montant, "
                "est_stc_ou_sortie, stc_dh, forfait, net_a_payer) "
                "VALUES (:e, :p, :f, :c, :m, 0, false, 0, 40, 40)"
            ),
            {"e": jeu.employes[2], "p": jeu.bulletins[2], "f": jeu.fonction, "c": jeu.autre_chantier, "m": PERIODE},
        )
    cas = [
        (_creer(plateforme, entetes, jeu, 0), "Saisissez des heures supplémentaires ou un forfait."),
        (
            _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1", periode="2098-08"),
            "Aucune paie n'existe pour cet employé pendant ce mois.",
        ),
        (
            _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1", chantierId=999999999),
            "Le chantier sélectionné n'existe plus.",
        ),
        (
            _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1"),
            "Une ligne existe déjà pour cet employé, ce mois et ce chantier.",
        ),
        (
            _creer(plateforme, entetes, jeu, 2, forfaitDh="10"),
            "Le forfait est interdit car la paie est marquée STC/sortie.",
        ),
        (
            _creer(plateforme, entetes, jeu, 2, heuresSupplementaires="1"),
            "Un forfait existe déjà pour cet employé sur un autre chantier pendant ce mois marqué STC/sortie.",
        ),
    ]
    assert premiere.status_code == 200
    for reponse, message in cas:
        assert reponse.status_code == 400, reponse.text
        assert reponse.json()["message"] == message
    inconnu = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1", employeeId=999999999)
    assert inconnu.status_code == 404
    invalide = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="-1")
    assert invalide.status_code == 400


def test_un_forfait_decimal_est_arrondi_automatiquement_a_deux_decimales(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    corps = _creer(plateforme, entetes, jeu, 0, forfaitDh="1.555").json()

    assert (corps["forfaitDh"], corps["netAPayerDh"]) == (1.56, 1.56)


def test_un_bulletin_stc_donne_un_montant_porte_en_stc_sans_forfait(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    corps = _creer(plateforme, entetes, jeu, 2, heuresSupplementaires="2").json()

    assert (corps["stcOuSortie"], corps["salaireHoraireDh"], corps["montantDh"]) == (True, 38.46, 76.92)
    assert (corps["stcDh"], corps["forfaitDh"], corps["netAPayerDh"]) == (76.92, None, 0.0)


def test_modification_recalcule_avec_le_taux_enregistre_et_controle_la_version(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    ligne = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1").json()
    chemin = f"/heures-supp/{ligne['id']}"

    modifiee = plateforme.client.put(
        chemin, headers=entetes, json={"version": ligne["version"], "heuresSupplementaires": "3", "forfaitDh": "5"}
    )
    perimee = plateforme.client.put(
        chemin, headers=entetes, json={"version": ligne["version"], "heuresSupplementaires": "4"}
    )
    vide = plateforme.client.put(chemin, headers=entetes, json={"version": modifiee.json()["version"]})
    forfait_seul = plateforme.client.put(
        chemin, headers=entetes, json={"version": modifiee.json()["version"], "forfaitDh": "9"}
    )
    inconnue = plateforme.client.put("/heures-supp/999999999", headers=entetes, json={"version": 0, "forfaitDh": "1"})

    assert modifiee.status_code == 200, modifiee.text
    assert (modifiee.json()["montantDh"], modifiee.json()["netAPayerDh"]) == (30.0, 35.0)
    assert perimee.status_code == 400
    assert perimee.json()["message"] == "Cette ligne a été modifiée entre-temps. Actualisez-la avant de réessayer."
    assert vide.json()["message"] == "Saisissez des heures supplémentaires ou un forfait."
    assert forfait_seul.status_code == 200, forfait_seul.text
    assert (forfait_seul.json()["salaireHoraireDh"], forfait_seul.json()["salaireReferenceDh"]) == (None, None)
    assert (forfait_seul.json()["montantDh"], forfait_seul.json()["netAPayerDh"]) == (0.0, 9.0)
    assert (inconnue.status_code, inconnue.json()["message"]) == (
        400,
        "La ligne d'heures supplémentaires demandée n'existe pas.",
    )
    assert _journal(plateforme, "HEURES_SUP_MODIFICATION")["type_operation"] == "UPDATE"
    assert _revisions(plateforme, ligne["id"]) == [0, 1, 1]


def test_recherche_filtres_tri_et_pagination(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1")
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="5")
    _creer(plateforme, entetes, jeu, 2, heuresSupplementaires="2")
    filtre = {"periode": MOIS, "chantierIds": [jeu.chantier], "fonctionIds": [jeu.fonction]}

    par_montant = plateforme.client.post("/heures-supp/search?sort=montant,desc", headers=entetes, json=filtre)
    sans_equipe = plateforme.client.post("/heures-supp/search", headers=entetes, json=filtre | {"equipeIds": [0]})
    de_l_equipe = plateforme.client.post(
        "/heures-supp/search", headers=entetes, json=filtre | {"equipeIds": [jeu.equipe]}
    )
    par_nom = plateforme.client.post(
        "/heures-supp/search?sort=employee.nomPrenom,asc", headers=entetes, json=filtre | {"nomPrenom": "heures"}
    )
    par_cin = plateforme.client.post("/heures-supp/search", headers=entetes, json=filtre | {"cin": "hs"})
    page = plateforme.client.post("/heures-supp/search?size=2&page=1", headers=entetes, json=filtre)
    plusieurs = plateforme.client.post(
        "/heures-supp/search", headers=entetes, json={"periodes": [MOIS, "2098-08"], "chantierIds": [jeu.chantier]}
    )
    tri_inconnu = plateforme.client.post("/heures-supp/search?sort=nimporte,asc", headers=entetes, json=filtre)

    assert [ligne["montantDh"] for ligne in par_montant.json()["content"]] == [76.92, 52.5, 10.0]
    assert par_montant.json()["page"] == {"size": 20, "number": 0, "totalElements": 3, "totalPages": 1}
    assert [ligne["nomPrenom"] for ligne in sans_equipe.json()["content"]] == ["Heures 1", "Heures 2"]
    assert [ligne["nomPrenom"] for ligne in de_l_equipe.json()["content"]] == ["Heures 0"]
    assert [ligne["nomPrenom"] for ligne in par_nom.json()["content"]] == ["Heures 0", "Heures 1", "Heures 2"]
    assert par_cin.json()["page"]["totalElements"] == 3
    assert (len(page.json()["content"]), page.json()["page"]["totalPages"]) == (1, 2)
    assert plusieurs.json()["page"]["totalElements"] == 3
    assert tri_inconnu.status_code == 400


def test_lecture_par_identifiant_et_mois_disponibles(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    ligne = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1").json()

    lue = plateforme.client.get(f"/heures-supp/{ligne['id']}", headers=entetes)
    absente = plateforme.client.get("/heures-supp/999999999", headers=entetes)
    mois = plateforme.client.get("/heures-supp/periodes", headers=entetes)

    assert lue.json() == ligne
    assert absente.status_code == 400
    assert MOIS in mois.json()
    assert mois.json() == sorted(mois.json(), reverse=True)


def test_analytique_indicateurs_et_repartitions(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1", forfaitDh="20")
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="5")
    _creer(plateforme, entetes, jeu, 2, heuresSupplementaires="2")
    _creer(plateforme, entetes, jeu, 1, forfaitDh="7", chantierId=jeu.autre_chantier)

    reponse = plateforme.client.post(
        "/heures-supp/analytique", headers=entetes, json={"periode": MOIS, "fonctionIds": [jeu.fonction]}
    )

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["periode"] == MOIS
    assert corps["indicateurs"] == {
        "employes": 3,
        "lignesHeures": 3,
        "heures": 8.0,
        "montantDh": 139.42,
        "stcDh": 76.92,
        "forfaitDh": 27.0,
        "netAPayerDh": 89.5,
    }
    chantiers = corps["parChantier"]
    assert [groupe["id"] for groupe in chantiers] == [jeu.chantier, jeu.autre_chantier]
    assert chantiers[0]["effectif"] == 3
    assert chantiers[0]["libelle"] == "Chantier 0"
    equipes = {groupe["id"]: groupe for groupe in corps["parEquipe"]}
    assert equipes[0]["libelle"] == "Sans équipe"
    assert equipes[0]["code"] is None
    assert equipes[jeu.equipe]["effectif"] == 1
    nets = [groupe["netAPayerDh"] for groupe in corps["parEquipe"]]
    assert nets == sorted(nets, reverse=True)
    assert corps["definitions"]["stcDh"].startswith("Somme du Montant")
    assert set(corps["definitions"]) == {"heures", "montantDh", "stcDh", "forfaitDh", "netAPayerDh"}


def test_suppression_unitaire_est_auditee(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    ligne = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1").json()

    supprimee = plateforme.client.delete(f"/heures-supp/{ligne['id']}", headers=entetes)
    encore = plateforme.client.delete(f"/heures-supp/{ligne['id']}", headers=entetes)

    assert supprimee.status_code == 204
    assert encore.status_code == 400
    assert _journal(plateforme, "HEURES_SUP_SUPPRESSION")["type_operation"] == "DELETE"
    assert _revisions(plateforme, ligne["id"]) == [0, 2]


def test_suppression_du_mois_confirme_le_nombre(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1")
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="1")

    # Des lignes d'autres tests peuvent exister sur un mois partagé : le mois réservé à ce fichier est 2098-07.
    refusee = plateforme.client.post(
        "/heures-supp/suppression-mois", headers=entetes, json={"periode": MOIS, "nombreAttendu": 1}
    )
    supprimees = plateforme.client.post(
        "/heures-supp/suppression-mois", headers=entetes, json={"periode": MOIS, "nombreAttendu": 2}
    )
    restant = plateforme.client.post("/heures-supp/search", headers=entetes, json={"periode": MOIS})

    assert refusee.status_code == 409
    assert refusee.json()["message"] == (
        "Le mois contient maintenant 2 lignes au lieu des 1 confirmées. "
        "Aucune ligne n'a été supprimée ; actualisez puis recommencez."
    )
    assert (supprimees.status_code, supprimees.json()) == (200, 2)
    assert restant.json()["page"]["totalElements"] == 0
    journal = _journal(plateforme, "HEURES_SUP_SUPPRESSION_MOIS")
    assert (journal["type_operation"], journal["nombre_elements"], journal["perimetre"]) == (
        "DELETE",
        2,
        {"periode": MOIS},
    )
    assert _journal(plateforme, "HEURES_SUP_SUPPRESSION_MOIS", "ECHEC")["entite_type"] == "HeureSupp"


def test_modifier_le_bulletin_recalcule_les_lignes_liees(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    ligne = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="2", forfaitDh="30").json()
    bulletin = plateforme.client.get(f"/paie/{jeu.bulletins[0]}", headers=entetes).json()
    corps = {
        "version": bulletin["version"],
        "fonctionId": jeu.fonction,
        "chantierId": jeu.chantier,
        "equipeId": jeu.equipe,
        "nombreJoursTravailles": "26",
        "salaireMensuel": "100.00",
        "salaireTotal": "100.00",
    }

    en_stc = plateforme.client.put(f"/paie/{jeu.bulletins[0]}", headers=entetes, json=corps | {"observation": " stc "})
    apres = plateforme.client.get(f"/heures-supp/{ligne['id']}", headers=entetes).json()
    sorti = plateforme.client.put(
        f"/paie/{jeu.bulletins[0]}",
        headers=entetes,
        json=corps | {"version": en_stc.json()["version"], "observation": None},
    )
    retour = plateforme.client.get(f"/heures-supp/{ligne['id']}", headers=entetes).json()

    assert en_stc.status_code == 200, en_stc.text
    assert (apres["stcOuSortie"], apres["montantDh"], apres["stcDh"], apres["forfaitDh"], apres["netAPayerDh"]) == (
        True,
        20.0,
        20.0,
        None,
        0.0,
    )
    assert sorti.status_code == 200, sorti.text
    assert (retour["stcOuSortie"], retour["stcDh"], retour["netAPayerDh"]) == (False, 0.0, 20.0)


def test_un_bulletin_lie_ne_peut_pas_etre_supprime(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    ligne = _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1").json()
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="1")

    unitaire = plateforme.client.delete(f"/paie/{jeu.bulletins[0]}", headers=entetes)
    groupe = plateforme.client.post(
        "/paie/suppression",
        headers=entetes,
        json={"criteres": {"periode": MOIS, "chantierIds": [jeu.chantier]}, "nombreAttendu": 3},
    )
    plateforme.client.delete(f"/heures-supp/{ligne['id']}", headers=entetes)
    apres = plateforme.client.delete(f"/paie/{jeu.bulletins[2]}", headers=entetes)

    assert unitaire.status_code == 409
    assert unitaire.json()["message"] == (
        "Suppression impossible : une ligne d'heures supplémentaires s'appuie sur ce bulletin. Supprimez-la d'abord."
    )
    assert groupe.status_code == 409
    assert groupe.json()["message"] == (
        "Suppression impossible : 2 lignes d'heures supplémentaires s'appuient sur ces bulletins. "
        "Supprimez-les d'abord."
    )
    assert apres.status_code == 204
