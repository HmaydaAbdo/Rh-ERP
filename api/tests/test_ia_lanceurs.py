"""Lanceurs du service IA contre l'API Python (KAN-234, remplacent `FluxAgUiIntegrationTest`, `EvaluationAgentIaTest` et
`BancAssistantTest` du backend Spring retiré).

L'application complète écoute sur un port loopback (base PostgreSQL réelle, données synthétiques) et le service IA
(`uvicorn --factory erp_rh_ia.app:creer_app`) est lancé relié à elle :

- le test de fumée (toujours joué si `uv` est présent) vérifie le démarrage du service, l'activation de l'IA et le refus
  d'un appel `POST /agui` sans jeton valide ; il n'appelle aucun modèle ;
- les trois lanceurs avec un vrai modèle sont opt-in, comme leurs ancêtres Java : `IA_AGUI=1` (client AG-UI officiel),
  `IA_EVALUATION=1` (évaluation sur le jeu de référence) et `IA_BANC=1` (banc de démonstration pour le navigateur), avec
  une passerelle LiteLLM prête (`IA_LITELLM_BASE_URL`, `IA_LITELLM_API_KEY`). Journaux et rapports dans `api/target/`.
"""

# ruff: noqa: F811  (la fixture `serveur_loopback` importée est reprise par nom)

import contextlib
import json
import os
import random
import shutil
import socket
import subprocess
import time
import uuid
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import psutil
import pytest
from conftest import Plateforme
from sqlalchemy import text
from test_mcp_clients_externes import serveur_loopback  # noqa: F401  # pyright: ignore[reportUnusedImport]

RACINE = Path(__file__).resolve().parents[2]
SERVICE_IA = RACINE / "ia"
CLIENT_AGUI = RACINE / "scripts" / "ia" / "agui-client"
SORTIE = Path(__file__).resolve().parents[1] / "target"
UV = shutil.which("uv")

DROITS_FLUX = {"IA_UTILISER", "PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ", "EQUIPE_READ", "FUNCTION_READ"}
DROITS_EVALUATION = DROITS_FLUX | {"PAIE_EXPORT", "PARAMETRE_READ", "ROLE_MANAGE", "AUDIT_READ"}
DROITS_BANC = DROITS_FLUX | {"CARTE_READ"}
DROITS_RESTREINTS = {"IA_UTILISER", "EMPLOYEE_READ"}

pytestmark = pytest.mark.skipif(UV is None, reason="uv absent")


def _passerelle_prete() -> bool:
    return bool(os.environ.get("IA_LITELLM_BASE_URL") and os.environ.get("IA_LITELLM_API_KEY"))


def _opt_in(nom: str) -> None:
    if os.environ.get(nom) != "1":
        pytest.skip(f"Lancer avec {nom}=1 (passerelle LiteLLM requise)")
    if not _passerelle_prete():
        pytest.skip("IA_LITELLM_BASE_URL et IA_LITELLM_API_KEY requis")


def _port_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@dataclass
class Referentiel:
    suffixe: str
    fonction_id: int
    chantier_id: int
    equipe_id: int
    employe_id: int


def _referentiel(p: Plateforme) -> Referentiel:
    """Une fonction, un chantier `C-<suffixe>`, une équipe `E<suffixe>` et un employé `CIN<suffixe>`."""
    suffixe = uuid.uuid4().hex[:8].upper()
    with p.moteur.begin() as c:
        fonction = c.execute(
            text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": f"Fonction {suffixe}"}
        ).scalar_one()
        chantier = c.execute(
            text("INSERT INTO chantier (code, designation, nom) VALUES (:c, 'Désignation', :n) RETURNING id"),
            {"c": f"C-{suffixe}", "n": f"Chantier {suffixe}"},
        ).scalar_one()
        equipe = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, :l) RETURNING id"),
            {"c": f"E{suffixe}", "l": f"Équipe {suffixe}"},
        ).scalar_one()
        employe = c.execute(
            text(
                "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                "equipe_id, statut) VALUES (:n, :cin, '1990-01-01', :e, :f, :c, :q, 'ACTIF') RETURNING id"
            ),
            {
                "n": f"Employé {suffixe}",
                "cin": f"CIN{suffixe}",
                "e": date.today() - timedelta(days=400),
                "f": fonction,
                "c": chantier,
                "q": equipe,
            },
        ).scalar_one()
    return Referentiel(suffixe, fonction, chantier, equipe, employe)


def _bulletin(p: Plateforme, ref: Referentiel, periode: int, total: int = 3000) -> None:
    with p.moteur.begin() as c:
        c.execute(
            text(
                "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, "
                "nombre_jours_travailles, salaire_mensuel, salaire_total) VALUES (:e, :p, :f, :c, :q, 26, :t, :t)"
            ),
            {
                "e": ref.employe_id,
                "p": periode,
                "f": ref.fonction_id,
                "c": ref.chantier_id,
                "q": ref.equipe_id,
                "t": total,
            },
        )


def _jeton(
    p: Plateforme, creer: Callable[..., tuple[int, str]], permis: set[str], duree: timedelta = timedelta(minutes=14)
) -> tuple[str, str]:
    """`(jeton de connexion, nom)` d'un compte limité aux droits `permis` (administrateur dont le reste est refusé)."""
    with p.moteur.connect() as c:
        tous = [r[0] for r in c.execute(text("SELECT code FROM permission"))]
    identifiant, _ = creer("ia-lanceur", roles=("SYSTEM_ADMIN",), refusees=tuple(sorted(set(tous) - permis)))
    with p.moteur.connect() as c:
        nom = c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    return p.contexte.emetteur.emettre_acces(identifiant, nom, permis, set(), duree), nom


@contextmanager
def _service_ia(api: str, port: int, journal: Path) -> Generator[subprocess.Popen[bytes]]:
    SORTIE.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "IA_ENABLED": "true",
        "IA_ERP_API_URL": api,
        # Valeurs inoffensives quand aucune passerelle n'est fournie (test de fumée : aucun modèle n'est appelé).
        "IA_LITELLM_BASE_URL": os.environ.get("IA_LITELLM_BASE_URL", "http://127.0.0.1:9/v1"),
        "IA_LITELLM_API_KEY": os.environ.get("IA_LITELLM_API_KEY", "sk-test-cle"),
    }
    commande = [str(UV), "run", "--locked", "uvicorn", "--factory", "erp_rh_ia.app:creer_app"]
    commande += ["--host", "127.0.0.1", "--port", str(port)]
    with journal.open("wb") as sortie:
        # Commande fixe (uv) lancée avec des arguments littéraux et des ports locaux : aucune entrée non fiable.
        service = subprocess.Popen(commande, cwd=SERVICE_IA, env=env, stdout=sortie, stderr=subprocess.STDOUT)  # noqa: S603
        try:
            yield service
        finally:
            _arreter_arbre(service)


def _arreter_arbre(service: subprocess.Popen[bytes]) -> None:
    """`uv run` lance uvicorn dans un processus enfant : le tuer seul laisserait le service (370 Mo) orphelin."""
    try:
        racine = psutil.Process(service.pid)
        processus = [*racine.children(recursive=True), racine]
    except psutil.NoSuchProcess:
        processus = []
    for p in processus:
        with contextlib.suppress(psutil.NoSuchProcess):
            p.kill()
    psutil.wait_procs(processus, timeout=30)
    service.wait(timeout=30)


def _attendre(url: str, service: subprocess.Popen[bytes], journal: Path, delai: float = 90) -> None:
    limite = time.monotonic() + delai
    while time.monotonic() < limite:
        assert service.poll() is None, f"service IA arrêté :\n{journal.read_text(errors='replace')}"
        try:
            if httpx.get(url, timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    pytest.fail(f"service IA non prêt :\n{journal.read_text(errors='replace')}")


def test_le_service_ia_demarre_contre_l_api_python_et_refuse_un_appel_sans_jeton(
    plateforme: Plateforme, serveur_loopback: str, creer_utilisateur: Callable[..., tuple[int, str]]
) -> None:
    port = _port_libre()
    journal = SORTIE / "ia-fumee.txt"
    with _service_ia(serveur_loopback, port, journal) as service:
        racine = f"http://127.0.0.1:{port}"
        _attendre(f"{racine}/health", service, journal)
        assert httpx.get(f"{racine}/health").json()["status"] == "UP"
        assert httpx.get(f"{racine}/health/ia").json()["ia"] == "ACTIVE"
        corps: dict[str, Any] = {
            "threadId": "t",
            "runId": "r",
            "state": {},
            "messages": [{"id": "m1", "role": "user", "content": "Bonjour"}],
            "tools": [],
            "context": [],
        }
        assert httpx.post(f"{racine}/agui", json=corps).status_code == 401
        faux = {"Authorization": "Bearer pas-un-jeton"}
        assert httpx.post(f"{racine}/agui", json=corps, headers=faux).status_code == 401
        jeton, _ = _jeton(plateforme, creer_utilisateur, DROITS_FLUX)
        # Le jeton est accepté pour l'échange : seule la passerelle (absente ici) empêcherait la suite du flux.
        echange = httpx.post(f"{serveur_loopback}/auth/jetons/agent", headers={"Authorization": f"Bearer {jeton}"})
        assert echange.status_code == 200, echange.text


def test_le_client_ag_ui_officiel_obtient_une_reponse_verifiee(
    plateforme: Plateforme, serveur_loopback: str, creer_utilisateur: Callable[..., tuple[int, str]]
) -> None:
    _opt_in("IA_AGUI")
    if shutil.which("node") is None or shutil.which("npm") is None:
        pytest.skip("Node/npm absents")
    # Un mois isolé des autres tests et un chantier à un seul bulletin de 3 000 MAD : la réponse est connue.
    annee, mois = 3500 + random.randrange(400), 1 + random.randrange(12)  # noqa: S311
    ref = _referentiel(plateforme)
    _bulletin(plateforme, ref, annee * 100 + mois)
    jeton, _ = _jeton(plateforme, creer_utilisateur, DROITS_FLUX)
    port = _port_libre()
    journal_ia, journal_client = SORTIE / "agui-service.txt", SORTIE / "agui-client.txt"
    if not (CLIENT_AGUI / "node_modules").exists():
        subprocess.run(["npm", "ci", "--ignore-scripts"], cwd=CLIENT_AGUI, check=True, timeout=600)  # noqa: S607
    with _service_ia(serveur_loopback, port, journal_ia) as service:
        _attendre(f"http://127.0.0.1:{port}/health/ready", service, journal_ia)
        env = {
            **os.environ,
            "AGUI_URL": f"http://127.0.0.1:{port}/agui",
            "AGUI_JETON": jeton,
            "AGUI_QUESTION": f"Quelle est la masse salariale du chantier C-{ref.suffixe} en {annee}-{mois:02d} ?",
            "AGUI_ATTENDU": "3000",
        }
        with journal_client.open("wb") as sortie:
            node = subprocess.run(
                ["node", "--test", "src/flux.test.ts"],  # noqa: S607
                cwd=CLIENT_AGUI,
                env=env,
                stdout=sortie,
                stderr=subprocess.STDOUT,
                timeout=12 * 60,
                check=False,
            )
        texte_client = journal_client.read_text(errors="replace")
        texte_service = journal_ia.read_text(errors="replace")
        assert node.returncode == 0, f"Client :\n{texte_client}\nService :\n{texte_service}"


def test_l_agent_est_evalue_sur_le_jeu_de_reference(
    plateforme: Plateforme, serveur_loopback: str, creer_utilisateur: Callable[..., tuple[int, str]]
) -> None:
    """Mesure sans seuil tant que le propriétaire n'en a pas fixé un ; rapport : `api/target/evaluation-ia.json`."""
    _opt_in("IA_EVALUATION")
    # Deux mois récents et contigus : les années lointaines étaient prises pour un code de période par les modèles.
    jour = date.today().replace(day=1) - timedelta(days=31)
    mois_a = (jour.year, jour.month)
    mois_b = (mois_a[0] + mois_a[1] // 12, mois_a[1] % 12 + 1)
    periode_a, periode_b = mois_a[0] * 100 + mois_a[1], mois_b[0] * 100 + mois_b[1]
    refs = [_referentiel(plateforme) for _ in range(3)]
    for ref in refs:
        _bulletin(plateforme, ref, periode_a)
        _bulletin(plateforme, ref, periode_b)
    a, b, c = refs
    noms = {a.employe_id: "Karim Bennani", b.employe_id: "Salma El Idrissi", c.employe_id: "Youssef Tazi"}
    with plateforme.moteur.begin() as cx:
        for identifiant, nom in noms.items():
            cx.execute(text("UPDATE employe SET nom_prenom = :n WHERE id = :i"), {"n": nom, "i": identifiant})
        cx.execute(
            text("UPDATE employe SET salaire = 3000, type_salaire = 'MENSUEL' WHERE id = :i"), {"i": a.employe_id}
        )
        cx.execute(
            text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, :p, 'STC')"),
            {"e": c.employe_id, "p": periode_b},
        )
        parametre = cx.execute(
            text("SELECT id FROM parametre WHERE cle = 'securite.jeton-session.heures'")
        ).scalar_one()
    donnees: dict[str, Any] = {
        "periode_a": f"{mois_a[0]}-{mois_a[1]:02d}",
        "periode_b": f"{mois_b[0]}-{mois_b[1]:02d}",
        "chantier_a_id": a.chantier_id,
        "chantier_a_code": f"C-{a.suffixe}",
        "equipe_a_id": a.equipe_id,
        "equipe_a_code": f"E{a.suffixe}",
        "employe_a_id": a.employe_id,
        "employe_a_nom": "Karim Bennani",
        "employe_a_cin": f"CIN{a.suffixe}",
        "chantier_b_id": b.chantier_id,
        "chantier_b_code": f"C-{b.suffixe}",
        "equipe_b_id": b.equipe_id,
        "equipe_b_code": f"E{b.suffixe}",
        "employe_b_id": b.employe_id,
        "employe_b_nom": "Salma El Idrissi",
        "employe_b_cin": f"CIN{b.suffixe}",
        "parametre_id": parametre,
    }
    # Jetons de quatre heures : l'évaluation dure plus que les 15 minutes d'un jeton ordinaire.
    complet, _ = _jeton(plateforme, creer_utilisateur, DROITS_EVALUATION, timedelta(hours=4))
    restreint, _ = _jeton(plateforme, creer_utilisateur, DROITS_RESTREINTS, timedelta(hours=4))
    SORTIE.mkdir(parents=True, exist_ok=True)
    rapport, journal = SORTIE / "evaluation-ia.json", SORTIE / "evaluation-ia.txt"
    rapport.unlink(missing_ok=True)
    commande = [str(UV), "run", "--locked", "python", "-m", "erp_rh_ia.evaluation", "--rapport", str(rapport)]
    commande += ["--repetitions", os.environ.get("IA_EVALUATION_REPETITIONS", "1")]
    commande += ["--concurrence", os.environ.get("IA_EVALUATION_CONCURRENCE", "2")]
    if os.environ.get("IA_EVALUATION_CAS"):  # rejoue seulement ces cas (diagnostic)
        commande += ["--cas", os.environ["IA_EVALUATION_CAS"]]
    env = {
        **os.environ,
        "EVAL_API_URL": serveur_loopback,
        "LITELLM_LOCAL_MODEL_COST_MAP": "True",
        "EVAL_JETON_COMPLET": complet,
        "EVAL_JETON_RESTREINT": restreint,
        "EVAL_DONNEES": json.dumps(donnees),
    }
    with journal.open("wb") as sortie:
        resultat = subprocess.run(  # noqa: S603
            commande, cwd=SERVICE_IA, env=env, stdout=sortie, stderr=subprocess.STDOUT, timeout=150 * 60, check=False
        )
    assert resultat.returncode == 0, journal.read_text(errors="replace")
    assert rapport.exists()


def test_le_banc_de_demonstration_reste_ouvert_pour_le_navigateur(
    plateforme: Plateforme, serveur_loopback: str, creer_utilisateur: Callable[..., tuple[int, str]]
) -> None:
    """Données fictives, compte de test et service IA laissés en marche ; `api/target/banc-assistant.json` donne les
    adresses. S'arrête quand `api/target/banc-assistant.stop` apparaît, ou après 45 minutes. Aucune donnée réelle."""
    _opt_in("IA_BANC")
    septembre = 202609
    refs = [_referentiel(plateforme) for _ in range(3)]
    for ref in refs:
        _bulletin(plateforme, ref, septembre - 1)
        _bulletin(plateforme, ref, septembre)
        with plateforme.moteur.begin() as c:
            c.execute(
                text("UPDATE employe SET salaire = 3000, type_salaire = 'MENSUEL' WHERE id = :i"), {"i": ref.employe_id}
            )
    _, compte = _jeton(plateforme, creer_utilisateur, DROITS_BANC)
    port = int(os.environ.get("IA_BANC_PORT", "5103"))
    arret, journal = SORTIE / "banc-assistant.stop", SORTIE / "banc-assistant-ia.txt"
    arret.unlink(missing_ok=True)
    with _service_ia(serveur_loopback, port, journal) as service:
        banc = {
            "backend": serveur_loopback,
            "ia": f"http://127.0.0.1:{port}",
            "utilisateur": compte,
            "chantiers": [f"C-{r.suffixe}" for r in refs],
            "periode": "2026-09",
        }
        (SORTIE / "banc-assistant.json").write_text(json.dumps(banc), encoding="utf-8")
        fin = time.monotonic() + 45 * 60
        while time.monotonic() < fin and not arret.exists() and service.poll() is None:
            time.sleep(2)
    arret.unlink(missing_ok=True)
