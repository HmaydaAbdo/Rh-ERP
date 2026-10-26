"""Graphe de l'agent avec un modèle et des outils simulés : routes, bornes, refus et vérification des chiffres."""

import pytest
from doubles import ModeleScripte, OutilsSimules, appel, ok

from erp_rh_ia.agent import ABSTENTION, Agent, Limites
from erp_rh_ia.modele import Brouillon, lire_brouillon, lire_domaines
from erp_rh_ia.outils import ResultatOutil

INDICATEURS = {
    "periode": "2026-09",
    "indicateurs": {"masse": 1250000.5, "effectif": 412},
    "vue": {"module": "paie", "vue": "analytique", "parametres": {"periode": "2026-09"}},
}


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


pytestmark = pytest.mark.anyio


async def test_une_reponse_fondee_sur_les_outils_est_servie_avec_sa_vue() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte(
        [appel("paie_indicateurs", periode="2026-09")],
        [Brouillon("En 2026-09 : masse 1 250 000,50 MAD, 412 bulletins.", 0, False)],
    )

    reponse = await Agent(modele).repondre("Masse salariale de septembre 2026 ?", outils)

    assert not reponse.abstention
    assert reponse.outils == ["paie_indicateurs"]
    assert reponse.vue == INDICATEURS["vue"]
    assert outils.appels == ["paie_indicateurs"]


async def test_un_chiffre_invente_est_reecrit_une_fois_puis_accepte() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte(
        [appel("paie_indicateurs")],
        [
            Brouillon("La masse a augmenté de 7 %.", None, False),
            Brouillon("La masse est de 1 250 000,50 MAD.", None, False),
        ],
    )

    reponse = await Agent(modele).repondre("Évolution de la masse ?", outils)

    assert not reponse.abstention
    assert reponse.texte == "La masse est de 1 250 000,50 MAD."
    assert "7" in modele.messages_redaction[1][-1]["content"]


async def test_des_chiffres_toujours_inventes_donnent_une_abstention() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte(
        [appel("paie_indicateurs")],
        [
            Brouillon("Environ 1 300 000 MAD.", None, False),
            Brouillon("Près de 1 300 000 MAD.", None, False),
        ],
    )

    reponse = await Agent(modele).repondre("Masse ?", outils)

    assert reponse.abstention
    assert reponse.motif == "CHIFFRES_NON_VERIFIES"
    assert reponse.texte == ABSTENTION
    assert reponse.nombres_inconnus == ["1 300 000"]


async def test_sans_outil_utile_le_modele_s_abstient() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte([], [Brouillon("Je n'ai pas cette information.", None, True)])

    reponse = await Agent(modele).repondre("Quel temps fera-t-il demain ?", outils)

    assert reponse.abstention
    assert reponse.motif == "SANS_DONNEES"
    assert outils.appels == []


async def test_un_refus_d_autorisation_n_est_jamais_retente() -> None:
    refus = ResultatOutil(
        "paie_indicateurs", {}, True, "Accès refusé : permission PAIE_READ requise pour paie_indicateurs."
    )
    outils = OutilsSimules({"paie_indicateurs": refus})
    # Le modèle insiste : le graphe passe directement à la rédaction après le refus.
    modele = ModeleScripte(
        [appel("paie_indicateurs"), appel("paie_indicateurs", "a2")],
        [Brouillon("Vous n'avez pas le droit de consulter la paie.", None, False)],
    )

    reponse = await Agent(modele).repondre("Masse ?", outils)

    assert outils.appels == ["paie_indicateurs"]
    assert not reponse.abstention
    assert "droit" in reponse.texte


async def test_un_outil_inconnu_n_est_pas_appele() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte([appel("supprimer_tout")], [Brouillon("Je ne peux pas.", None, True)])

    reponse = await Agent(modele).repondre("Supprime la paie", outils)

    assert outils.appels == []
    assert reponse.outils == ["supprimer_tout"]
    assert reponse.abstention


async def test_les_tours_d_outils_sont_bornes() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte(
        [appel("paie_indicateurs", f"a{i}") for i in range(10)], [Brouillon("412 bulletins.", None, False)]
    )

    reponse = await Agent(modele, Limites(tours=3)).repondre("Masse ?", outils)

    assert len(outils.appels) == 3
    assert not reponse.abstention


async def test_une_vue_hors_liste_est_ignoree() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte([appel("paie_indicateurs")], [Brouillon("412 bulletins.", 7, False)])

    reponse = await Agent(modele).repondre("Effectif ?", outils)

    assert reponse.vue is None


CATALOGUE = {
    nom: ok(nom, {})
    for nom in (
        "systeme_identite",
        "paie_indicateurs",
        "employe_fiche",
        "chantier_rechercher",
        "chantier_fiche",
        "roles_lister",
        "outil_futur",
    )
}


async def test_le_ciblage_ne_transmet_que_les_outils_des_domaines_utiles() -> None:
    modele = ModeleScripte([], [Brouillon("Rien.", None, True)], domaines=["paie"])

    reponse = await Agent(modele).repondre("Masse salariale ?", OutilsSimules(CATALOGUE))

    # Aucun outil d'office : ni identité, ni recherche de référentiel hors des domaines choisis.
    assert modele.outils_vus == [["paie_indicateurs"]]
    assert reponse.domaines == ["paie"]
    # Un préfixe non déclaré forme son propre domaine, proposé au ciblage comme les autres.
    assert modele.domaines_proposes == [["paie", "employes", "referentiels", "administration", "systeme", "outil"]]


async def test_plusieurs_domaines_cumulent_leurs_outils() -> None:
    modele = ModeleScripte([], [Brouillon("Rien.", None, True)], domaines=["paie", "referentiels"])

    await Agent(modele).repondre("Masse du chantier C-12 ?", OutilsSimules(CATALOGUE))

    assert modele.outils_vus == [["paie_indicateurs", "chantier_rechercher", "chantier_fiche"]]


async def test_hors_domaine_la_redaction_repond_sans_choix_d_outils() -> None:
    modele = ModeleScripte([], [Brouillon("Je ne sais pas.", None, True)], domaines=[])

    reponse = await Agent(modele).repondre("Quel temps fera-t-il ?", OutilsSimules(CATALOGUE))

    assert modele.outils_vus == []  # aucun appel « choisir » : un appel de modèle en moins
    assert len(modele.messages_redaction) == 1
    assert reponse.abstention


@pytest.mark.parametrize(
    ("message", "debut"),
    [("Bonjour", "Bonjour !"), ("merci beaucoup", "Avec plaisir"), ("Que sais-tu faire ?", "Je réponds")],
)
async def test_un_message_sans_donnee_repond_aussitot_sans_modele_ni_outil(message: str, debut: str) -> None:
    outils = OutilsSimules(CATALOGUE)
    modele = ModeleScripte([], [])

    reponse = await Agent(modele).repondre(message, outils)

    assert reponse.texte.startswith(debut)
    assert not reponse.abstention
    assert modele.domaines_proposes == [] and modele.outils_vus == [] and modele.messages_redaction == []
    assert outils.appels == []


async def test_une_salutation_suivie_d_une_question_suit_le_parcours_complet() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte([appel("paie_indicateurs")], [Brouillon("Masse : 1 250 000,50 MAD.", None, False)])

    reponse = await Agent(modele).repondre("Bonjour, quelle est la masse salariale ?", outils)

    assert outils.appels == ["paie_indicateurs"]
    assert not reponse.abstention


async def test_un_ciblage_indisponible_garde_tout_le_catalogue() -> None:
    modele = ModeleScripte([], [Brouillon("Rien.", None, True)], domaines=None)

    reponse = await Agent(modele).repondre("Masse ?", OutilsSimules(CATALOGUE))

    assert modele.outils_vus == [list(CATALOGUE)]
    assert reponse.domaines is None


async def test_une_sortie_invalide_est_redigee_une_seconde_fois() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte(
        [appel("paie_indicateurs")], [Brouillon("", None, True), Brouillon("412 bulletins.", None, False)]
    )

    reponse = await Agent(modele).repondre("Effectif ?", outils)

    assert not reponse.abstention
    assert reponse.texte == "412 bulletins."


async def test_deux_sorties_invalides_donnent_une_abstention() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    modele = ModeleScripte([appel("paie_indicateurs")], [Brouillon("", None, True), Brouillon("", None, True)])

    reponse = await Agent(modele).repondre("Effectif ?", outils)

    assert reponse.abstention
    assert reponse.motif == "SORTIE_INVALIDE"


def test_un_ciblage_invalide_est_ignore() -> None:
    domaines = ["paie", "employes"]
    assert lire_domaines('{"domaines": ["paie", "paie"]}', domaines) == ["paie"]
    assert lire_domaines('```json\n{"domaines": []}\n```', domaines) == []
    assert lire_domaines('{"domaines": ["meteo"]}', domaines) is None
    assert lire_domaines('{"domaines": "paie"}', domaines) is None
    assert lire_domaines("paie", domaines) is None


def test_une_sortie_non_json_devient_une_abstention() -> None:
    assert lire_brouillon("pas du json").abstention
    assert lire_brouillon('{"reponse": 3, "vue": null, "abstention": false}').abstention
    brouillon = lire_brouillon('```json\n{"reponse": "ok", "vue": 1, "abstention": false}\n```')
    assert (brouillon.reponse, brouillon.vue, brouillon.abstention) == ("ok", 1, False)
