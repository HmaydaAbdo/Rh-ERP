"""Profil de performance de l'API (KAN-233, remplace `PerformanceProfileTest` et la porte CI `performance-profile`).

Opt-in localement (`PERFORMANCE_PROFILE=1`) et exécuté comme porte CI dédiée ; les objectifs et la commande sont dans
`site/docs/exploitation/tests.md`. PostgreSQL réel (testcontainers), données uniquement synthétiques, appels HTTP réels
sur un port loopback : 1 000 employés sur 60 mois (60 000 bulletins), puis, en même temps,

- 600 recherches de paie à 10 requêtes par seconde, réparties sur 20 sessions ;
- 20 analyses d'import, 20 exports Excel et 20 rapports PDF de 1 000 lignes, chacun en série.

Le rendu PDF exige les bibliothèques natives de WeasyPrint (Pango) : absentes (poste Windows), l'étape PDF est omise et
dite omise dans le bilan ; la CI, qui les installe, pose `PERFORMANCE_PDF_REQUIS=1` pour en faire un échec.

Le résultat est imprimé (`PERFORMANCE_PROFILE ...`) et écrit dans `api/target/performance-profile.json`
(artefact « Performance profile » de la CI).
"""

import importlib
import json
import os
import socket
import statistics
import subprocess
import sys
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import psutil
import pytest
from conftest import ADMIN, Plateforme
from openpyxl import Workbook
from pydantic import SecretStr
from sqlalchemy import text

from staport.platform.configuration import Configuration

pytestmark = pytest.mark.skipif(
    os.environ.get("PERFORMANCE_PROFILE") != "1", reason="Lancer avec PERFORMANCE_PROFILE=1 (mesure longue)"
)

EMPLOYES = 1_000
PERIODES = 60
REQUETES = 600
CADENCE = 10  # requêtes par seconde
SESSIONS = 20
ECHANTILLONS_LOURDS = 20
PERIODE_COURANTE = (2026, 8)
SORTIE = Path(__file__).resolve().parents[1] / "target"

# Objectifs en millisecondes. Recherche relevée à 1 000 / 2 000 ms (750 / 1 500 au départ, backend retiré) : sur le
# runner partagé à 2 vCPU, le même code mesure de 382 à 949 ms de p95 et jusqu'à 1 531 ms de p99, médiane 25 ms.
OBJECTIFS = {
    "recherche_p95": 1_000,
    "recherche_p99": 2_000,
    "import_p95": 10_000,
    "excel_p95": 30_000,
    "excel_p99": 60_000,
    "pdf_p95": 30_000,
    "pdf_p99": 60_000,
}


@pytest.fixture
def serveur_isole(plateforme: Plateforme) -> Iterator[str]:
    """L'API dans son propre processus (uvicorn), comme en production : ni son GIL ni sa boucle ne sont partagés avec
    les clients de charge du test. Même base, mêmes clés : les jetons émis par `plateforme` y sont valides."""
    env = {**os.environ}
    for nom in Configuration.model_fields:
        valeur = getattr(plateforme.configuration, nom)
        valeur = valeur.get_secret_value() if isinstance(valeur, SecretStr) else valeur
        env[nom.upper()] = str(valeur).lower() if isinstance(valeur, bool) else str(valeur)
    with socket.socket() as ephemere:
        ephemere.bind(("127.0.0.1", 0))
        port = ephemere.getsockname()[1]
    SORTIE.mkdir(parents=True, exist_ok=True)
    # Windows : psycopg asynchrone exige un `SelectorEventLoop`, que `uvicorn.run` ne choisit pas ; Linux : sans effet.
    programme = (
        "import asyncio, sys, uvicorn;"
        "from staport.main import application;"
        "serveur = uvicorn.Server(uvicorn.Config(application, factory=True, host='127.0.0.1', "
        "port=int(sys.argv[1]), log_level='warning'));"
        "asyncio.run(serveur.serve(), loop_factory=asyncio.SelectorEventLoop)"
    )
    commande = [sys.executable, "-c", programme, str(port)]
    with (SORTIE / "performance-api.txt").open("wb") as journal:
        # Interpréteur du venv et arguments littéraux : aucune entrée non fiable.
        serveur = subprocess.Popen(commande, env=env, stdout=journal, stderr=subprocess.STDOUT)  # noqa: S603
        try:
            limite = time.monotonic() + 60
            while time.monotonic() < limite:
                assert serveur.poll() is None, (SORTIE / "performance-api.txt").read_text(errors="replace")
                try:
                    if httpx.get(f"http://127.0.0.1:{port}/health", timeout=2).status_code == 200:
                        break
                except httpx.HTTPError:
                    time.sleep(0.5)
            else:
                pytest.fail("l'API isolée n'a pas démarré")
            yield f"http://127.0.0.1:{port}"
        finally:
            serveur.kill()
            serveur.wait(timeout=30)


def _pdf_disponible() -> bool:
    try:
        # Import différé : la bibliothèque native peut manquer.
        importlib.import_module("weasyprint")
    except OSError:
        return False
    return True


@dataclass
class Jeu:
    prefixe: str
    chantier_id: int
    code_chantier: str
    libelle_fonction: str


class Sondeur:
    """Pics de ressources du processus (API et clients du test) et de connexions PostgreSQL, toutes les 500 ms."""

    def __init__(self, plateforme: Plateforme) -> None:
        self._moteur = plateforme.moteur
        self._processus = psutil.Process()
        self._arret = threading.Event()
        self._fil = threading.Thread(target=self._boucle, daemon=True)
        self.pic_connexions = 0
        self.pic_memoire_mib = 0
        self.pic_fils = 0
        self.cpu_max = 0.0

    def demarrer(self) -> None:
        self._processus.cpu_percent(None)
        self._fil.start()

    def arreter(self) -> None:
        self._arret.set()
        self._fil.join(timeout=10)

    def _boucle(self) -> None:
        while not self._arret.wait(0.5):
            try:
                with self._moteur.connect() as c:
                    connexions = c.execute(
                        text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
                    ).scalar_one()
                self.pic_connexions = max(self.pic_connexions, int(connexions))
                self.pic_memoire_mib = max(self.pic_memoire_mib, self._processus.memory_info().rss // (1024 * 1024))
                self.pic_fils = max(self.pic_fils, self._processus.num_threads())
                self.cpu_max = max(
                    self.cpu_max, round(self._processus.cpu_percent(None) / (psutil.cpu_count() or 1), 1)
                )
            except Exception:  # noqa: S110  le sondeur ne doit jamais interrompre le scénario mesuré
                pass


def _periode(decalage: int) -> int:
    annee, mois = PERIODE_COURANTE
    total = annee * 12 + (mois - 1) - decalage
    return (total // 12) * 100 + total % 12 + 1


def _libelle(periode: int) -> str:
    return f"{periode // 100}-{periode % 100:02d}"


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    prefixe = "PF" + uuid.uuid4().hex[:10].upper()
    periodes = [_periode(i) for i in range(PERIODES)]
    with plateforme.moteur.begin() as c:
        fonction = c.execute(
            text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": f"{prefixe}-OUVRIER"}
        ).scalar_one()
        chantier = c.execute(
            text(
                "INSERT INTO chantier (code, designation, actif, source_erp) "
                "VALUES (:c, 'Jeu synthétique performance', true, false) RETURNING id"
            ),
            {"c": f"{prefixe}-C000"},
        ).scalar_one()
        c.execute(
            text(
                "INSERT INTO employe (cin, nom_prenom, date_naissance, date_embauche, fonction_id, chantier_id, "
                "statut) "
                "SELECT :p || lpad(i::text, 4, '0'), 'Employé synthétique ' || i, DATE '1980-01-01', "
                "DATE '2020-01-01', :f, :c, 'ACTIF' FROM generate_series(0, :n - 1) AS i"
            ),
            {"p": prefixe, "f": fonction, "c": chantier, "n": EMPLOYES},
        )
        c.execute(
            text(
                "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, "
                "salaire_mensuel, salaire_total) SELECT e.id, p.periode, :f, :c, 26, 10000.00, 10000.00 "
                "FROM employe e CROSS JOIN unnest(CAST(:periodes AS integer[])) AS p(periode) WHERE e.cin LIKE :m"
            ),
            {"f": fonction, "c": chantier, "periodes": periodes, "m": f"{prefixe}%"},
        )
    with plateforme.moteur.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        c.execute(text("ANALYZE paie"))
        c.execute(text("ANALYZE employe"))
    yield Jeu(prefixe, chantier, f"{prefixe}-C000", f"{prefixe}-OUVRIER")
    with plateforme.moteur.begin() as c:
        c.execute(
            text("DELETE FROM paie WHERE employee_id IN (SELECT id FROM employe WHERE cin LIKE :m)"),
            {"m": f"{prefixe}%"},
        )
        c.execute(text("DELETE FROM employe WHERE cin LIKE :m"), {"m": f"{prefixe}%"})
        c.execute(text("DELETE FROM chantier WHERE id = :c"), {"c": chantier})
        c.execute(text("DELETE FROM fonction WHERE id = :f"), {"f": fonction})


def _fichier_import(jeu: Jeu) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for _ in range(3):
        feuille.append([])
    for i in range(EMPLOYES):
        ligne: list[Any] = [f"Employé synthétique {i}", jeu.libelle_fonction, f"{jeu.prefixe}{i:04d}", 26]
        ligne += [0, 0, 10000, 0, 0, 10000, None, jeu.code_chantier, None]
        feuille.append(ligne)
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _percentile(valeurs: list[float], rang: float) -> int:
    ordonnees = sorted(valeurs)
    assert ordonnees
    return round(ordonnees[max(0, -(-int(rang * 100) * len(ordonnees) // 100) - 1)])


def _mesurer(operation: Callable[[], httpx.Response]) -> float:
    debut = time.perf_counter()
    reponse = operation()
    assert reponse.status_code == 200, f"{reponse.status_code} {reponse.text[:300]}"
    return (time.perf_counter() - debut) * 1000


def test_profil_de_charge_et_operations_lourdes(plateforme: Plateforme, serveur_isole: str, jeu: Jeu) -> None:
    avec_pdf = _pdf_disponible()
    if not avec_pdf:
        assert os.environ.get("PERFORMANCE_PDF_REQUIS") != "1", "bibliothèques natives de WeasyPrint absentes"
        print("PERFORMANCE_PDF_OMIS bibliothèques natives de WeasyPrint absentes : rapport PDF non mesuré")
    with plateforme.moteur.connect() as c:
        assert (
            c.execute(
                text("SELECT count(*) FROM paie WHERE employee_id IN (SELECT id FROM employe WHERE cin LIKE :m)"),
                {"m": f"{jeu.prefixe}%"},
            ).scalar_one()
            == EMPLOYES * PERIODES
        )
        administrateur = c.execute(text("SELECT id FROM utilisateur WHERE username = :u"), {"u": ADMIN[0]}).scalar_one()
    jeton = plateforme.contexte.emetteur.emettre_acces(
        administrateur, ADMIN[0], {"PAIE_READ", "PAIE_EXPORT", "PAIE_IMPORT"}, set(), timedelta(hours=1)
    )
    entetes = {"Authorization": f"Bearer {jeton}"}
    periode = _libelle(_periode(0))
    suivante = _libelle(_periode(-1))
    fichier = _fichier_import(jeu)
    criteres: dict[str, Any] = {"periode": periode}
    erreurs: list[str] = []

    def client() -> httpx.Client:
        return httpx.Client(base_url=serveur_isole, headers=entetes, timeout=300)

    def recherche(http: httpx.Client) -> float:
        return _mesurer(lambda: http.post("/paie/search?page=0&size=20", json=criteres))

    def en_serie(operation: Callable[[httpx.Client], float]) -> list[float]:
        durees: list[float] = []
        with client() as http:
            for _ in range(ECHANTILLONS_LOURDS):
                try:
                    durees.append(operation(http))
                except AssertionError as erreur:
                    erreurs.append(str(erreur))
        return durees

    def analyse(http: httpx.Client) -> float:
        # L'analyse est l'étape lourde de l'import (lecture du fichier, rapprochement avec toutes les fiches) ; elle
        # n'écrit rien, elle porte donc toujours sur le mois qui suit la période courante.
        envoi = {
            "file": ("performance.xlsx", fichier, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        return _mesurer(lambda: http.post("/paie/import/analyse", data={"periode": suivante}, files=envoi))

    def excel(http: httpx.Client) -> float:
        corps = {"periode": periode, "feuillesEquipeMode": "AUCUNE", "chantiers": [jeu.code_chantier]}
        return _mesurer(lambda: http.post("/paie/export", json=corps))

    def pdf(http: httpx.Client) -> float:
        corps = {"periode": periode, "chantierId": jeu.chantier_id, "sansVueEnsemble": True}
        return _mesurer(lambda: http.post("/paie/report/pdf", json=corps))

    with client() as chaud:
        for _ in range(20):
            recherche(chaud)

    sondeur = Sondeur(plateforme)
    sondeur.demarrer()
    latences: list[float] = []
    verrou = threading.Lock()

    def requete(http: httpx.Client) -> None:
        try:
            duree = recherche(http)
            with verrou:
                latences.append(duree)
        except (AssertionError, httpx.HTTPError) as erreur:
            with verrou:
                erreurs.append(str(erreur))

    try:
        with ThreadPoolExecutor(3) as lourds, ThreadPoolExecutor(SESSIONS) as utilisateurs:
            # PERFORMANCE_LOURDS="analyse,excel" : diagnostic, seulement ces opérations lourdes ("" = aucune).
            actives = set(os.environ.get("PERFORMANCE_LOURDS", "analyse,excel,pdf").split(","))
            analyses = lourds.submit(en_serie, analyse) if "analyse" in actives else None
            exports = lourds.submit(en_serie, excel) if "excel" in actives else None
            rapports = lourds.submit(en_serie, pdf) if avec_pdf and "pdf" in actives else None
            sessions = [client() for _ in range(SESSIONS)]
            try:
                depart = time.perf_counter()
                for numero in range(REQUETES):
                    attente = depart + numero / CADENCE - time.perf_counter()
                    if attente > 0:
                        time.sleep(attente)
                    utilisateurs.submit(requete, sessions[numero % SESSIONS])
                utilisateurs.shutdown(wait=True)
            finally:
                for session in sessions:
                    session.close()
            imports = analyses.result(timeout=300) if analyses else []
            excels = exports.result(timeout=300) if exports else []
            pdfs = rapports.result(timeout=300) if rapports else []
    finally:
        sondeur.arreter()

    assert len(latences) == REQUETES, f"{len(latences)} recherches abouties sur {REQUETES} : {erreurs[:3]}"
    assert not erreurs, erreurs[:3]
    bilan: dict[str, Any] = {
        "employes": EMPLOYES,
        "periodes": PERIODES,
        "bulletins": EMPLOYES * PERIODES,
        "lectures": REQUETES,
        "lecturesParSeconde": CADENCE,
        "recherche_p95": _percentile(latences, 0.95),
        "recherche_p99": _percentile(latences, 0.99),
        "recherche_mediane": round(statistics.median(latences)),
        "import_echantillons": len(imports),
        "import_p95": _percentile(imports, 0.95) if imports else None,
        "excel_echantillons": len(excels),
        "excel_p95": _percentile(excels, 0.95) if excels else None,
        "excel_p99": _percentile(excels, 0.99) if excels else None,
        "pdf_echantillons": len(pdfs),
        "pdf_p95": _percentile(pdfs, 0.95) if pdfs else None,
        "pdf_p99": _percentile(pdfs, 0.99) if pdfs else None,
        "erreurs": len(erreurs),
        "pic_connexions_db": sondeur.pic_connexions,
        "pic_memoire_mib": sondeur.pic_memoire_mib,
        "pic_fils": sondeur.pic_fils,
        "cpu_max_pourcent": sondeur.cpu_max,
        "objectifs": OBJECTIFS,
    }
    SORTIE.mkdir(parents=True, exist_ok=True)
    (SORTIE / "performance-profile.json").write_text(json.dumps(bilan, indent=2), encoding="utf-8")
    print("PERFORMANCE_PROFILE " + " ".join(f"{cle}={valeur}" for cle, valeur in bilan.items() if cle != "objectifs"))
    for nom, plafond in OBJECTIFS.items():
        if bilan[nom] is None:
            continue
        assert bilan[nom] <= plafond, f"{nom} : {bilan[nom]} ms > {plafond} ms"
