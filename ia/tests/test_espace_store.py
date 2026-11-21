# LangGraph ne publie pas de stubs complets : seules ces deux règles sont levées, et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Espace du Store par identifiant interne (KAN-303) : un point dans le nom d'utilisateur ne casse plus l'assistant.

Le Store de LangGraph refuse un point dans une étiquette d'espace de noms. L'espace des fichiers et de la mémoire
longue est donc rangé sous l'identifiant interne de l'utilisateur (champ ``uid`` du jeton agent), et ce qui existait
sous le nom d'utilisateur est déplacé une fois.
"""

import base64
import json

import pytest
from langgraph.store.base import InvalidNamespaceError
from langgraph.store.memory import InMemoryStore

import staport_ia.memoire as memoire
from staport_ia.memoire import proprietaire, rapatrier, sujet


def _jeton(sub: str, uid: int | None = None) -> str:
    claims: dict[str, str | int] = {"sub": sub}
    if uid is not None:
        claims["uid"] = uid
    charge = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"entete.{charge}.signature"


@pytest.fixture(autouse=True)
def _rapatries_vides() -> None:
    memoire._RAPATRIES.clear()  # pyright: ignore[reportPrivateUsage]


def test_l_espace_du_store_porte_l_identifiant_interne_meme_avec_un_point_dans_le_nom() -> None:
    assert proprietaire(_jeton("prenom.nom", 7)) == "u7"
    assert proprietaire(_jeton("rh", 12)) == "u12"
    assert proprietaire(_jeton("rh", 12)) != proprietaire(_jeton("rh", 13))


async def test_le_store_accepte_l_espace_d_un_nom_avec_un_point() -> None:
    store = InMemoryStore()
    espace = (proprietaire(_jeton("prenom.nom", 7)), "memoire")
    await store.aput(espace, "AGENTS.md", {"content": "x"})
    assert (await store.aget(espace, "AGENTS.md")) is not None
    with pytest.raises(InvalidNamespaceError):  # c'était la panne : le nom d'utilisateur comme étiquette
        await store.aput((sujet(_jeton("prenom.nom", 7)), "memoire"), "AGENTS.md", {"content": "x"})


async def test_sans_uid_l_espace_retombe_sur_le_nom_d_utilisateur() -> None:
    assert proprietaire(_jeton("rh")) == "rh"
    assert proprietaire("pas-un-jwt") == sujet("pas-un-jwt")


async def test_ce_qui_etait_range_sous_le_nom_est_deplace_sous_l_identifiant_une_seule_fois() -> None:
    store = InMemoryStore()
    jeton = _jeton("rh", 5)
    await store.aput(("rh", "memoire"), "AGENTS.md", {"content": "préférence"})
    await store.aput(("rh", "espace"), "rapport.md", {"content": "fichier"})

    await rapatrier(store, jeton)

    assert (await store.aget(("u5", "memoire"), "AGENTS.md")).value == {"content": "préférence"}  # type: ignore[union-attr]
    assert (await store.aget(("u5", "espace"), "rapport.md")).value == {"content": "fichier"}  # type: ignore[union-attr]
    assert await store.asearch(("rh", "memoire")) == []
    assert await store.asearch(("rh", "espace")) == []

    await rapatrier(store, jeton)  # idempotent
    assert len(await store.asearch(("u5", "memoire"))) == 1


async def test_le_deplacement_n_ecrase_ni_ne_supprime_une_ligne_en_conflit() -> None:
    store = InMemoryStore()
    await store.aput(("rh", "memoire"), "AGENTS.md", {"content": "ancien"})
    await store.aput(("u5", "memoire"), "AGENTS.md", {"content": "récent"})

    await rapatrier(store, _jeton("rh", 5))

    assert (await store.aget(("u5", "memoire"), "AGENTS.md")).value == {"content": "récent"}  # type: ignore[union-attr]
    # Rien n'est supprimé : l'ancienne ligne reste sous l'ancien nom.
    assert (await store.aget(("rh", "memoire"), "AGENTS.md")).value == {"content": "ancien"}  # type: ignore[union-attr]


async def test_un_nom_avec_un_point_n_a_rien_a_deplacer_et_ne_leve_pas() -> None:
    store = InMemoryStore()
    await rapatrier(store, _jeton("prenom.nom", 7))
    assert await store.asearch(("u7", "memoire")) == []


async def test_le_deplacement_d_un_utilisateur_ne_touche_pas_l_espace_d_un_autre() -> None:
    store = InMemoryStore()
    await store.aput(("rh", "memoire"), "AGENTS.md", {"content": "rh"})
    await store.aput(("comptable", "memoire"), "AGENTS.md", {"content": "comptable"})

    await rapatrier(store, _jeton("rh", 5))

    assert len(await store.asearch(("comptable", "memoire"))) == 1
    assert await store.asearch(("u6", "memoire")) == []
