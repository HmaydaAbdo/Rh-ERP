"""Serveur MCP Python (KAN-216) : parité avec `McpSecurityConfig` et les outils d'identité, de paramètres, de rôles et
d'audit de Spring, sur le SDK MCP officiel monté dans l'application, avec un PostgreSQL réel.

Couvre l'authentification (jeton agent seul, compte relu à chaque requête, `Origin` refusé), les droits par outil, les
filtres et pages, l'absence de toute écriture au journal d'audit par un appel d'outil, et le span de diagnostic.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import json
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from conftest import Plateforme
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import text

ENTETES = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
Fabrique = Callable[..., tuple[int, str]]


@pytest.fixture(scope="module")
def spans() -> Iterator[InMemorySpanExporter]:
    exportateur = InMemorySpanExporter()
    fournisseur = TracerProvider()
    fournisseur.add_span_processor(SimpleSpanProcessor(exportateur))
    trace.set_tracer_provider(fournisseur)
    yield exportateur


def _jeton_agent(p: Plateforme, connecter: Callable[[str, str], dict[str, Any]], nom: str, mdp: str) -> str:
    acces = connecter(nom, mdp)["accessToken"]
    reponse = p.client.post("/auth/jetons/agent", headers={"Authorization": f"Bearer {acces}"})
    assert reponse.status_code == 200, reponse.text
    return reponse.json()["jeton"]


def _nom(p: Plateforme, identifiant: int) -> str:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()


def _rpc(p: Plateforme, jeton: str | None, methode: str, params: dict[str, Any] | None = None, **entetes: str) -> Any:
    en_tetes = {**ENTETES, **entetes}
    if jeton is not None:
        en_tetes["Authorization"] = f"Bearer {jeton}"
    corps = {"jsonrpc": "2.0", "id": 1, "method": methode, "params": params or {}}
    return p.client.post("/mcp", json=corps, headers=en_tetes)


def _appel(p: Plateforme, jeton: str, outil: str, **arguments: Any) -> dict[str, Any]:
    reponse = _rpc(p, jeton, "tools/call", {"name": outil, "arguments": arguments})
    assert reponse.status_code == 200, reponse.text
    return reponse.json()["result"]


def _donnees(resultat: dict[str, Any]) -> dict[str, Any]:
    assert not resultat.get("isError"), resultat
    return resultat.get("structuredContent") or json.loads(resultat["content"][0]["text"])


@pytest.fixture
def admin(
    plateforme: Plateforme, creer_utilisateur: Fabrique, connecter: Callable[[str, str], dict[str, Any]]
) -> tuple[str, str, int]:
    """Un administrateur et son jeton agent : `(jeton, nom, identifiant)`."""
    identifiant, mdp = creer_utilisateur("mcp-admin", roles=("SYSTEM_ADMIN",))
    nom = _nom(plateforme, identifiant)
    return _jeton_agent(plateforme, connecter, nom, mdp), nom, identifiant


# --- Authentification ------------------------------------------------------------------------------


def test_sans_jeton_ou_avec_un_jeton_invalide_la_route_repond_401(plateforme: Plateforme) -> None:
    assert _rpc(plateforme, None, "tools/list").status_code == 401
    assert _rpc(plateforme, "pas-un-jwt", "tools/list").status_code == 401


def test_un_jeton_d_acces_rest_n_est_pas_un_jeton_agent(
    plateforme: Plateforme, creer_utilisateur: Fabrique, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant, mdp = creer_utilisateur("mcp-rest", roles=("SYSTEM_ADMIN",))
    acces = connecter(_nom(plateforme, identifiant), mdp)["accessToken"]
    assert _rpc(plateforme, acces, "tools/list").status_code == 401


def test_un_navigateur_n_appelle_jamais_mcp(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    assert _rpc(plateforme, admin[0], "tools/list", Origin="http://localhost:5002").status_code == 403


def test_un_compte_desactive_apres_l_emission_est_refuse(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    jeton, _, identifiant = admin
    assert _rpc(plateforme, jeton, "tools/list").status_code == 200
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE utilisateur SET actif = false WHERE id = :i"), {"i": identifiant})
    assert _rpc(plateforme, jeton, "tools/list").status_code == 401


def test_le_droit_ia_retire_apres_l_emission_donne_403(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    jeton, _, identifiant = admin
    assert _rpc(plateforme, jeton, "tools/list").status_code == 200
    with plateforme.moteur.begin() as c:
        c.execute(
            text(
                "INSERT INTO utilisateur_permission_refusee (utilisateur_id, permission_id) "
                "SELECT :i, id FROM permission WHERE code = 'IA_UTILISER'"
            ),
            {"i": identifiant},
        )
    assert _rpc(plateforme, jeton, "tools/list").status_code == 403


# --- Catalogue et identité -------------------------------------------------------------------------


def test_le_catalogue_expose_les_cinq_outils_en_lecture_seule(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    outils = {o["name"]: o for o in _rpc(plateforme, admin[0], "tools/list").json()["result"]["tools"]}
    assert set(outils) == {
        "systeme_identite",
        "parametres_lire",
        "roles_lister",
        "audit_rechercher",
        "audit_historique",
    }
    for outil in outils.values():
        assert outil["annotations"]["readOnlyHint"] is True and outil["annotations"]["destructiveHint"] is False
        assert outil["annotations"]["idempotentHint"] is True and outil["annotations"]["openWorldHint"] is False
        assert outil["description"] and outil["outputSchema"]
    assert "Parameters" not in json.dumps(outils["audit_historique"]["inputSchema"])


def test_l_identite_vient_du_jeton_puis_de_la_base_jamais_d_un_argument(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    jeton, nom, _ = admin
    donnees = _donnees(_appel(plateforme, jeton, "systeme_identite"))
    assert donnees["utilisateur"] == nom
    assert {"IA_UTILISER", "AUDIT_READ", "SYSTEM_ADMIN"} <= set(donnees["autorites"])
    assert "mcp:lecture" not in donnees["autorites"]
    assert donnees["autorites"] == sorted(donnees["autorites"])


def test_les_droits_sont_relus_en_base_a_chaque_appel(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    jeton, _, identifiant = admin
    assert "AUDIT_READ" in _donnees(_appel(plateforme, jeton, "systeme_identite"))["autorites"]
    with plateforme.moteur.begin() as c:
        c.execute(
            text(
                "INSERT INTO utilisateur_permission_refusee (utilisateur_id, permission_id) "
                "SELECT :i, id FROM permission WHERE code = 'AUDIT_READ'"
            ),
            {"i": identifiant},
        )
    assert "AUDIT_READ" not in _donnees(_appel(plateforme, jeton, "systeme_identite"))["autorites"]


# --- Droits par outil ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("outil", "permission", "arguments"),
    [
        ("parametres_lire", "PARAMETRE_READ", {}),
        ("roles_lister", "ROLE_MANAGE", {}),
        ("audit_rechercher", "AUDIT_READ", {}),
        ("audit_historique", "AUDIT_READ", {"entite": "Parametre", "id": 1}),
    ],
)
def test_chaque_outil_exige_la_permission_de_son_ecran(
    plateforme: Plateforme,
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
    outil: str,
    permission: str,
    arguments: dict[str, Any],
) -> None:
    identifiant, mdp = creer_utilisateur("mcp-sans-droit", roles=("SYSTEM_ADMIN",), refusees=(permission,))
    jeton = _jeton_agent(plateforme, connecter, _nom(plateforme, identifiant), mdp)
    resultat = _appel(plateforme, jeton, outil, **arguments)
    assert resultat["isError"] is True and permission in resultat["content"][0]["text"]


# --- Paramètres et rôles ---------------------------------------------------------------------------


def test_les_parametres_sont_lus_avec_leurs_bornes(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    donnees = _donnees(_appel(plateforme, admin[0], "parametres_lire"))
    par_cle = {p["cle"]: p for p in donnees["parametres"]}
    assert len(par_cle) == 6
    session = par_cle["securite.jeton-session.heures"]
    assert (session["unite"], session["minimum"], session["maximum"]) == ("heures", 1, 720)
    assert session["type"] == "ENTIER" and session["valeur"] and session["libelle"] and session["description"]
    assert donnees["vue"] == {"module": "admin/parametres", "vue": "tabulaire", "parametres": {}}


def test_les_roles_sont_filtres_par_nom_et_parcourus_par_pages(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    tous = _donnees(_appel(plateforme, admin[0], "roles_lister"))
    assert tous["total"] >= 1 and tous["page"] == 0
    role = _donnees(_appel(plateforme, admin[0], "roles_lister", nom="SYSTEM_ADMIN"))["roles"][0]
    assert role["protege"] is True and "AUDIT_READ" in role["permissions"]
    assert role["permissions"] == sorted(role["permissions"])
    assert [r["nom"] for r in tous["roles"]] == sorted(r["nom"] for r in tous["roles"])
    filtre = _donnees(_appel(plateforme, admin[0], "roles_lister", nom="system"))
    assert [r["nom"] for r in filtre["roles"]] == ["SYSTEM_ADMIN"] and filtre["total"] == 1
    page = _donnees(_appel(plateforme, admin[0], "roles_lister", limite=1, page=0))
    assert len(page["roles"]) == 1 and page["total"] == tous["total"]
    vide = _donnees(_appel(plateforme, admin[0], "roles_lister", nom="aucun-role-de-ce-nom"))
    assert vide["roles"] == [] and vide["total"] == 0


@pytest.mark.parametrize("arguments", [{"limite": 0}, {"limite": 21}, {"page": -1}, {"nom": "x" * 51}])
def test_les_arguments_hors_bornes_sont_refuses(
    plateforme: Plateforme, admin: tuple[str, str, int], arguments: dict[str, Any]
) -> None:
    assert _appel(plateforme, admin[0], "roles_lister", **arguments)["isError"] is True


# --- Journal d'audit -------------------------------------------------------------------------------


def _modifier_un_parametre(p: Plateforme, connecter: Callable[[str, str], dict[str, Any]], valeur: str) -> int:
    """Modifie la durée de session par l'API REST (opération auditée) et retourne l'identifiant du paramètre."""
    from conftest import ADMIN

    acces = connecter(*ADMIN)["accessToken"]
    en_tetes = {"Authorization": f"Bearer {acces}"}
    cle = "securite.jeton-session.heures"
    courant = next(x for x in p.client.get("/parametres", headers=en_tetes).json() if x["cle"] == cle)
    reponse = p.client.put(
        f"/parametres/{courant['id']}", headers=en_tetes, json={"version": courant["version"], "valeur": valeur}
    )
    assert reponse.status_code == 200, reponse.text
    return courant["id"]


def test_le_journal_et_l_historique_retrouvent_une_modification(
    plateforme: Plateforme, admin: tuple[str, str, int], connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant = _modifier_un_parametre(plateforme, connecter, "11")
    trouve = _donnees(
        _appel(plateforme, admin[0], "audit_rechercher", action="PARAMETRE_MODIFICATION", entite="Parametre", limite=5)
    )
    assert trouve["total"] >= 1 and trouve["page"] == 0
    entree = trouve["entrees"][0]
    assert entree["action"] == "PARAMETRE_MODIFICATION" and entree["resultat"] == "SUCCES"
    assert entree["categorie"] == "OPERATION" and entree["entiteId"] == identifiant
    assert entree["horodatage"] and entree["origine"] and entree["utilisateur"]
    assert trouve["vue"] == {"module": "audit", "vue": "tabulaire", "parametres": {}}

    historique = _donnees(_appel(plateforme, admin[0], "audit_historique", entite="Parametre", id=identifiant))
    derniere = historique["versions"][0]
    assert derniere["operation"] == "MODIFICATION" and historique["total"] >= 1
    assert {"champ": "valeur", "avant": derniere["champs"][0]["avant"], "apres": "11"}.items() <= (
        derniere["champs"][0].items()
    )
    assert set(derniere["champs"][0]) == {"champ", "avant", "apres", "ajoutes", "retires"}


def test_les_filtres_du_journal_se_combinent_et_les_dates_sont_validees(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    jeton = admin[0]
    assert _donnees(_appel(plateforme, jeton, "audit_rechercher", depuis="2999-01-01"))["total"] == 0
    assert _donnees(_appel(plateforme, jeton, "audit_rechercher", jusqua="2000-01-01"))["total"] == 0
    refus = _donnees(_appel(plateforme, jeton, "audit_rechercher", resultat="ECHEC", categorie="SECURITE", limite=3))
    assert all(e["resultat"] == "ECHEC" and e["categorie"] == "SECURITE" for e in refus["entrees"])
    assert len(refus["entrees"]) <= 3
    erreur = _appel(plateforme, jeton, "audit_rechercher", depuis="2026-02-30")
    assert erreur["isError"] is True and "depuis" in erreur["content"][0]["text"]
    assert _appel(plateforme, jeton, "audit_rechercher", depuis="demain")["isError"] is True
    assert _appel(plateforme, jeton, "audit_rechercher", entite_id=0)["isError"] is True
    assert _appel(plateforme, jeton, "audit_rechercher", categorie="INCONNUE")["isError"] is True


def test_un_type_d_enregistrement_inconnu_est_refuse_avec_les_valeurs_possibles(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    erreur = _appel(plateforme, admin[0], "audit_historique", entite="Inconnu", id=1)
    assert erreur["isError"] is True and "Parametre" in erreur["content"][0]["text"]
    assert _appel(plateforme, admin[0], "audit_historique", entite="Parametre", id=0)["isError"] is True


# --- Aucune écriture d'audit, diagnostic par span --------------------------------------------------


def _nombre_d_entrees(p: Plateforme) -> int:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT count(*) FROM audit_journal")).scalar_one()


def test_un_appel_d_outil_n_ecrit_rien_au_journal_d_audit(plateforme: Plateforme, admin: tuple[str, str, int]) -> None:
    jeton = admin[0]
    avant = _nombre_d_entrees(plateforme)
    for outil in ("systeme_identite", "parametres_lire", "roles_lister", "audit_rechercher"):
        _donnees(_appel(plateforme, jeton, outil))
    _appel(plateforme, jeton, "audit_historique", entite="Parametre", id=1)
    assert _appel(plateforme, jeton, "roles_lister", limite=0)["isError"] is True
    assert _nombre_d_entrees(plateforme) == avant
    with plateforme.moteur.connect() as c:
        assert c.execute(text("SELECT count(*) FROM audit_journal WHERE action LIKE 'MCP\\_%'")).scalar_one() == 0


def _span(exportateur: InMemorySpanExporter, outil: str) -> ReadableSpan:
    return next(s for s in reversed(exportateur.get_finished_spans()) if (s.attributes or {}).get("mcp.outil") == outil)


def test_le_span_decrit_l_appel_sans_copier_les_arguments_ni_le_resultat(
    plateforme: Plateforme, admin: tuple[str, str, int], spans: InMemorySpanExporter
) -> None:
    jeton, nom, _ = admin
    _donnees(_appel(plateforme, jeton, "roles_lister", nom="system"))
    attributs = dict(_span(spans, "roles_lister").attributes or {})
    assert attributs["enduser.id"] == nom and attributs["mcp.statut"] == "SUCCES" and attributs["mcp.resultats"] == 1
    assert "system" not in json.dumps(attributs, default=str).lower().replace("system_admin", "")
    assert "SYSTEM_ADMIN" not in json.dumps(attributs, default=str)


def test_le_span_d_un_appel_refuse_porte_le_statut_refuse(
    plateforme: Plateforme,
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
    spans: InMemorySpanExporter,
) -> None:
    identifiant, mdp = creer_utilisateur("mcp-span", roles=("SYSTEM_ADMIN",), refusees=("PARAMETRE_READ",))
    jeton = _jeton_agent(plateforme, connecter, _nom(plateforme, identifiant), mdp)
    assert _appel(plateforme, jeton, "parametres_lire")["isError"] is True
    attributs = dict(_span(spans, "parametres_lire").attributes or {})
    assert attributs["mcp.statut"] == "REFUSE"


# --- Sonde de santé --------------------------------------------------------------------------------


def test_la_sonde_de_sante_est_publique_hors_schema_et_n_ecrit_rien(plateforme: Plateforme) -> None:
    avant = _nombre_d_entrees(plateforme)
    reponse = plateforme.client.get("/health")
    assert reponse.status_code == 200 and reponse.json() == {"status": "UP"}
    assert "/health" not in plateforme.app.openapi()["paths"]
    assert _nombre_d_entrees(plateforme) == avant
