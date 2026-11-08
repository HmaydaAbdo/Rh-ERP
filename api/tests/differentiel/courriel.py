# pyright: basic
"""Courriel de réinitialisation : même message sur Spring et Python, puis parcours complet du jeton reçu.

À lancer après `scenarios_auth` (qui a demandé la réinitialisation de `oubli@example.org` sur les deux backends) :

    uv run python -m tests.differentiel.courriel
"""

import re
import sys
from typing import Any

import httpx

from .harnais import MOT_DE_PASSE_TEST, URLS

MAILPIT = "http://127.0.0.1:58025/api/v1"
NOUVEAU = "Nouveau-Mdp-2026!"


def _normaliser(texte: str) -> str:
    texte = re.sub(r"token=[A-Za-z0-9_\-%.]+", "token=<jeton>", texte)
    return re.sub(r"[A-Za-z0-9_\-]{40,}", "<jeton>", texte)


def _messages() -> list[dict[str, Any]]:
    liste = httpx.get(f"{MAILPIT}/messages").json()["messages"]
    return [
        httpx.get(f"{MAILPIT}/message/{m['ID']}").json() for m in liste if m["To"][0]["Address"] == "oubli@example.org"
    ]


def _jeton(message: dict[str, Any]) -> str:
    trouve = re.search(r"token=([A-Za-z0-9_\-%.]+)", message["Text"] + message["HTML"])
    assert trouve, "aucun jeton dans le courriel"
    return trouve.group(1)


def main() -> int:
    messages = _messages()
    if len(messages) != 2:
        print(f"attendu 2 courriels (un par backend), trouvé {len(messages)}")
        return 1
    ecarts = 0
    for champ in ("Subject",):
        if messages[0][champ] != messages[1][champ]:
            print(f"ÉCART {champ} : {messages[0][champ]!r} / {messages[1][champ]!r}")
            ecarts += 1
    for champ in ("From", "To", "Cc", "Bcc"):
        if messages[0][champ] != messages[1][champ]:
            print(f"ÉCART {champ} : {messages[0][champ]!r} / {messages[1][champ]!r}")
            ecarts += 1
    for champ in ("Text", "HTML"):
        a, b = _normaliser(messages[0][champ]), _normaliser(messages[1][champ])
        if a != b:
            print(f"ÉCART {champ} :\n--- {a!r}\n--- {b!r}")
            ecarts += 1
    resultats: dict[str, list[Any]] = {}
    for nom, url in URLS.items():
        etapes: list[Any] = []
        for message in messages:
            r = httpx.post(
                f"{url}/auth/reset-password", json={"token": _jeton(message), "nouveauMotDePasse": NOUVEAU}, timeout=60
            )
            etapes.append(r.status_code)
        ancien = httpx.post(f"{url}/auth/login", json={"username": "oubli", "password": MOT_DE_PASSE_TEST}, timeout=60)
        nouveau = httpx.post(f"{url}/auth/login", json={"username": "oubli", "password": NOUVEAU}, timeout=60)
        rejoue = httpx.post(
            f"{url}/auth/reset-password",
            json={"token": _jeton(messages[0]), "nouveauMotDePasse": NOUVEAU + "x"},
            timeout=60,
        )
        resultats[nom] = [
            sorted(etapes),
            ancien.status_code,
            nouveau.status_code,
            rejoue.status_code,
            rejoue.text[:120],
        ]
    if resultats["spring"] != resultats["python"]:
        print(f"ÉCART parcours du jeton : spring={resultats['spring']} python={resultats['python']}")
        ecarts += 1
    print(f"courriel : {ecarts} écart(s) ; parcours {resultats}")
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
