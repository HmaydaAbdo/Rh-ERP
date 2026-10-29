#!/usr/bin/env python3
"""Smoke tests for the running AI gateway. Uses only Python's standard library.

  python test_providers.py                    # full suite (10 requests)
  python test_providers.py --tag ocr          # one capability: simple|medium|complex|code|ocr
  python test_providers.py --providers        # one request per deployment: key, model name, vision
  python test_providers.py --providers nvidia-kimi-k3 groq-gpt-oss-120b
  python test_providers.py --list             # pools read from litellm_config.yaml, no request sent
  python test_providers.py --production-key sk-...   # a production key must be denied eval models

Set LITELLM_GATEWAY_URL and LITELLM_TEST_API_KEY in the repository root .env (the single .env shared by
all services), or pass --key with a virtual key allowed to call the capability, test and selftest groups.
The admin master key is deliberately not used.
"""
import argparse
import base64
import json
import os
import random
import re
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT_ENV = os.path.join(os.path.dirname(HERE), ".env")


def load_env_file():
    try:
        with open(ROOT_ENV, encoding="utf-8") as env_file:
            for line in env_file:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, value = line.split("=", 1)
                name, value = name.strip(), value.strip().strip('"').strip("'")
                if name and name not in os.environ:
                    os.environ[name] = value
    except FileNotFoundError:
        pass


def load_deployments():
    """Return {deployment id: (tags, weight)} from litellm_config.yaml, without a YAML dependency."""
    with open(os.path.join(HERE, "litellm_config.yaml"), encoding="utf-8") as config:
        text = "\n".join(line for line in config.read().splitlines() if not line.lstrip().startswith("#"))
    deployments = {}
    for block in re.split(r"\n\s*- model_name:", text)[1:]:
        dep_id = re.search(
            r"model_info:\s*(?:\{\s*id:\s*([^,}\s]+)|\r?\n\s+id:\s*([^,\s]+))",
            block,
        )
        tags = re.search(r"tags:\s*\[([^\]]*)\]", block)
        weight = re.search(r"weight:\s*(\d+)", block)
        if dep_id and "model_name: ai-gateway-test-" in "model_name:" + block:
            tag_list = [t.strip().strip("\"'") for t in tags.group(1).split(",")] if tags else []
            deployments[dep_id.group(1) or dep_id.group(2)] = (tag_list, int(weight.group(1)) if weight else 1)
    return deployments


load_env_file()
URL = os.getenv("LITELLM_GATEWAY_URL", "http://127.0.0.1:4000/v1/chat/completions")
BASE = URL.split("/v1/", 1)[0]
KEY = os.getenv("LITELLM_TEST_API_KEY", "")
DEPLOYMENTS = load_deployments()
CAPABILITIES = ["simple", "tool-selection", "medium", "complex", "code", "ocr"]
PROMPTS = {
    "simple": "Donne trois avantages du travail hybride, une phrase chacun.",
    "medium": "Rédige une courte description de poste pour un contrôleur de gestion (5 lignes).",
    "complex": "Explique quelles données sont nécessaires pour analyser un écart de trésorerie mensuel, "
    "et dans quel ordre les vérifier.",
    "code": "Écris une requête SQL qui compte les salariés par département, triée par effectif décroissant.",
}

# Same grounding template as the README: answer only from the context, or abstain explicitly.
GROUNDED_SYSTEM = (
    "Réponds uniquement à partir du CONTEXTE. Chaque passage commence par un identifiant entre crochets. "
    "Si le contexte ne contient pas l'information demandée, mets information_insuffisante à true et laisse "
    "reponse et sources vides. N'utilise aucune connaissance extérieure et n'invente rien."
)
GROUNDED_CONTEXT = (
    "[doc-1] Contrat du salarié : début le 1er mars 2026, poste de contrôleur de gestion, "
    "salaire brut de 12 000 MAD par mois.\n[doc-2] Lieu de travail : Casablanca."
)
ANSWER_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "reponse_fondee",
        "schema": {
            "type": "object",
            "properties": {
                "reponse": {"type": "string"},
                "sources": {"type": "array", "items": {"type": "string"}},
                "information_insuffisante": {"type": "boolean"},
            },
            "required": ["reponse", "sources", "information_insuffisante"],
        },
    },
}
INVOICE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "facture",
        "schema": {
            "type": "object",
            "properties": {
                "montant_ht": {"type": "number"},
                "montant_tva": {"type": "number", "description": "Montant de la TVA, pas le taux."},
                "montant_ttc": {"type": "number"},
                "devise": {"type": "string"},
            },
            "required": ["montant_ht", "montant_tva", "montant_ttc", "devise"],
        },
    },
}
SELECTION_TOOLS = [
    "audit_historique", "audit_rechercher", "chantier_fiche", "chantier_rechercher", "employe_fiche",
    "employe_parcours", "employes_compter", "employes_rechercher", "employes_regrouper", "employes_sorties",
    "equipe_fiche", "equipe_rechercher", "fonction_fiche", "fonction_rechercher", "paie_bulletins_rechercher",
    "paie_comparer", "paie_evolution", "paie_indicateurs", "paie_mouvements", "paie_periodes", "paie_qualite",
    "paie_repartition", "parametres_lire", "rapport_preparer", "roles_lister", "systeme_identite",
]
SELECTION_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "tool_selection",
        "schema": {
            "type": "object",
            "properties": {"tools": {"type": "array", "items": {"type": "string", "enum": SELECTION_TOOLS}}},
            "required": ["tools"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}

# 5x7 bitmap digits, so the OCR test needs no image file and no third-party library.
DIGIT_GLYPHS = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}

SENT = 0
RESULTS = []


def render_number_png(number, scale=8, margin=2):
    """Black digits on a white background, as a grayscale PNG."""
    units = [""] * 7
    for index, digit in enumerate(number):
        for row in range(7):
            units[row] += ("0" if index else "") + DIGIT_GLYPHS[digit][row]
    blank = "0" * len(units[0])
    units = [blank] * margin + units + [blank] * margin
    units = ["0" * margin + row + "0" * margin for row in units]
    rows = []
    for row in units:
        line = bytes(0 if bit == "1" else 255 for bit in row for _ in range(scale))
        rows.extend([line] * scale)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", len(rows[0]), len(rows), 8, 0, 0, 0, 0)
    raw = b"".join(b"\x00" + row for row in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def request_json(url, key, payload=None, timeout=300):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, response.headers, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, exc.headers, {"error": body[:400]}


def chat(key, tags, messages, max_tokens=1000, response_format=None, model="ai-gateway"):
    """One request through the gateway. Reasoning models spend part of max_tokens before answering."""
    global SENT
    if model == "ai-gateway":
        tag = (tags or ["medium"])[0]
        # Le smoke test du sélecteur qualifie le groupe de production exact ; les autres capacités utilisent
        # leurs alias de test afin d'éviter d'exercer les groupes de production pendant les sondes.
        model = "ai-gateway-tool-selection" if tag == "tool-selection" else "ai-gateway-" + (
            "test-" + tag[3:] if tag.startswith("id:") else tag
        )
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if tags:
        payload["metadata"] = {"tags": tags}
    if response_format:
        payload["response_format"] = response_format
    reply = {"deployment": "-", "fallbacks": 0, "text": "", "error": "", "elapsed": 0.0}
    started = time.monotonic()
    SENT += 1
    try:
        status, headers, body = request_json(URL, key, payload)
    except (OSError, ValueError) as exc:  # network error or invalid JSON
        reply.update(elapsed=time.monotonic() - started, error=f"{type(exc).__name__}: {exc}")
        return reply
    reply["elapsed"] = time.monotonic() - started
    reply["deployment"] = headers.get("x-litellm-model-id") or "inconnu"
    reply["fallbacks"] = int(headers.get("x-litellm-attempted-fallbacks") or 0)
    if status != 200:
        reply["error"] = f"HTTP {status}: {body.get('error', body)}"
        return reply
    choices = body.get("choices") or []
    reply["text"] = ((choices[0].get("message") or {}).get("content") or "").strip() if choices else ""
    if not reply["text"]:
        reply["error"] = "HTTP 200 sans texte (max_tokens consommé par le raisonnement ?)"
    return reply


def pool(tag):
    return {dep for dep, (tags, _) in DEPLOYMENTS.items() if tag in tags}


def preview(text, size=70):
    return text[:size].replace("\n", " ")


def parse_json(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except ValueError:
        return None


def report(level, name, reply, detail):
    RESULTS.append(level)
    route = reply["deployment"] + (f" (+{reply['fallbacks']} bascule)" if reply["fallbacks"] else "")
    print(f"[{level}]{' ' * (5 - len(level))}{name:28s} {reply['elapsed']:5.1f}s  {route:34s} {detail}")


def verdict(name, reply, expected, ok=True, detail=""):
    if reply["error"]:
        report("FAIL", name, reply, reply["error"])
    elif reply["deployment"].split("--", 1)[0] not in expected:
        report("FAIL", name, reply, f"modèle hors du pool attendu : {', '.join(sorted(expected))}")
    elif not ok:
        report("FAIL", name, reply, detail)
    else:
        report("OK", name, reply, detail or preview(reply["text"]))


def check_ocr(key, name, tags, expected):
    """A random number drawn in a PNG: a model that cannot see the image cannot guess it."""
    number = str(random.SystemRandom().randint(100000, 999999))
    image = "data:image/png;base64," + base64.b64encode(render_number_png(number)).decode("ascii")
    messages = [{"role": "user", "content": [
        {"type": "text", "text": "Lis le nombre écrit sur cette image. Réponds uniquement avec les chiffres. "
         "Si tu ne vois aucune image, réponds AUCUNE_IMAGE."},
        {"type": "image_url", "image_url": {"url": image}},
    ]}]
    reply = chat(key, tags, messages)
    found = number in re.sub(r"\D", "", reply["text"])
    detail = f"{number} lu correctement" if found else f"attendu {number}, reçu {preview(reply['text'], 40)!r}"
    verdict(name, reply, expected, found, detail)


def check_capability(key, tag):
    if tag == "ocr":
        return check_ocr(key, "ocr (image réelle)", ["ocr"], pool("ocr"))
    if tag == "tool-selection":
        return check_tool_selection(key, [tag], pool(tag))
    reply = chat(key, [tag], [{"role": "user", "content": PROMPTS[tag]}])
    verdict(tag, reply, pool(tag))


def check_structured_output(key):
    reply = chat(key, ["medium"], [{"role": "user", "content":
                 "Extrait les montants de cette facture : HT 1 250 MAD, TVA 20 %, TTC 1 500 MAD."}],
                 response_format=INVOICE_FORMAT)
    data = parse_json(reply["text"]) or {}
    values = (data.get("montant_ht"), data.get("montant_tva"), data.get("montant_ttc"))
    verdict("json_schema (facture)", reply, pool("medium"), values == (1250, 250, 1500), f"valeurs lues : {values}")


def check_tool_selection(key, tags, expected):
    """Même JSON Schema strict que LLMToolSelectorMiddleware, avec les noms MCP autorisés."""
    messages = [
        {
            "role": "system",
            "content": "Sélectionne tous les outils nécessaires pour répondre à la question. Pour toute question portant "
            "sur les données ERP, sélectionne au moins un outil métier pertinent. Pour savoir quels mois sont "
            "importés ou combien il y en a, choisis `paie_periodes`. En cas d'incertitude, sélectionne les candidats "
            "pertinents au lieu de répondre qu'aucun outil n'est disponible.",
        },
        {"role": "user", "content": "Combien de mois de paie ont été importés ?"},
    ]
    reply = chat(key, tags, messages, max_tokens=500, response_format=SELECTION_FORMAT)
    data = parse_json(reply["text"]) or {}
    selected = data.get("tools", [])
    correct = "paie_periodes" in selected
    verdict("json_schema (sélecteur MCP)", reply, expected, correct,
            f"outils : {','.join(selected) or 'aucun'}; attendu : paie_periodes")


def check_grounding(key):
    for name, question, expect_answer in (
        ("ancrage (info présente)", "Quel est le salaire brut mensuel ?", True),
        ("abstention (info absente)", "Quelle est la durée de la période d'essai ?", False),
    ):
        messages = [{"role": "system", "content": GROUNDED_SYSTEM},
                    {"role": "user", "content": f"CONTEXTE :\n{GROUNDED_CONTEXT}\n\nQUESTION : {question}"}]
        reply = chat(key, ["complex"], messages, max_tokens=1500, response_format=ANSWER_FORMAT)
        data = parse_json(reply["text"]) or {}
        if expect_answer:
            ok = (data.get("information_insuffisante") is False and "12" in str(data.get("reponse"))
                  and "doc-1" in json.dumps(data.get("sources")))
        else:
            ok = data.get("information_insuffisante") is True
        verdict(name, reply, pool("complex"), ok, preview(json.dumps(data, ensure_ascii=False), 90))


def check_failover(key):
    """In ai-gateway-selftest the probe points to a closed local port; the router must switch to the target."""
    reply = chat(key, None, [{"role": "user", "content": "Réponds uniquement par : OK"}], max_tokens=300,
                 model="ai-gateway-selftest")
    if reply["error"] or reply["deployment"] != "test-failover-target":
        verdict("failover", reply, {"test-failover-target"})
    elif reply["fallbacks"] >= 1:
        report("OK", "failover", reply, "sonde injoignable ignorée, bascule automatique")
    else:
        report("WARN", "failover", reply, "sonde déjà en cooldown : bascule non exercée, relancer dans 2 min")


def check_production_key(key):
    """A production key (only the five capability model groups) must be refused before any
    provider call: no quota is consumed when the policy is correct."""
    ping = [{"role": "user", "content": "Réponds uniquement par : OK"}]
    for name, tags, model, reason in (
        ("prod : pool eval refusé", ["eval-complex"], "ai-gateway-eval-complex", "la clé applicative accède au groupe évaluation"),
        ("prod : déploiement direct refusé", None, "ai-gateway-test-groq-gpt-oss-20b", "la clé accède au groupe de test"),
        ("prod : alias selftest refusé", None, "ai-gateway-selftest", "la clé accède à l'alias interne de test"),
    ):
        reply = chat(key, tags, ping, max_tokens=300, model=model)
        if reply["error"].startswith(("HTTP 401:", "HTTP 403:")):
            report("OK", name, reply, preview(reply["error"], 90))
        else:
            report("FAIL", name, reply, reason if not reply["error"] else reply["error"])


def check_providers(key, only):
    targets = [dep for dep in DEPLOYMENTS if not dep.startswith("test-")]
    unknown = sorted(set(only) - set(targets))
    if unknown:
        sys.exit(f"Déploiement(s) inconnu(s) : {', '.join(unknown)}. Voir --list.")
    for dep in only or targets:
        tags = DEPLOYMENTS[dep][0]
        if "tool-selection" in tags:
            check_tool_selection(key, [f"id:{dep}"], {dep})
        elif "ocr" in tags or "eval-ocr" in tags:
            check_ocr(key, dep, [f"id:{dep}"], {dep})
        else:
            reply = chat(key, [f"id:{dep}"], [{"role": "user", "content": "Réponds uniquement par le mot : prêt"}])
            verdict(dep, reply, {dep})


def print_pools():
    tags = sorted({t for tag_list, _ in DEPLOYMENTS.values() for t in tag_list if not t.startswith("id:") and t not in {"default", "eval"}},
                  key=lambda t: (t.startswith("eval"), t))
    for tag in tags:
        members = [(dep, weight) for dep, (tag_list, weight) in DEPLOYMENTS.items() if tag in tag_list]
        total = sum(weight for _, weight in members)
        print(f"{tag:14s} " + ", ".join(f"{dep} {100 * weight / total:.0f}%" for dep, weight in members))


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Smoke tests for the official LiteLLM capability groups")
    parser.add_argument("--tag", choices=CAPABILITIES, help="test only one capability")
    parser.add_argument("--providers", nargs="*", metavar="ID",
                        help="one request per deployment (all, or the given ids)")
    parser.add_argument("--list", action="store_true", help="show the pools of litellm_config.yaml and exit")
    parser.add_argument("--key", help="virtual key; defaults to LITELLM_TEST_API_KEY from .env")
    parser.add_argument("--production-key", metavar="KEY",
                        help="check that this production key is denied eval models and the selftest alias")
    args = parser.parse_args()
    if args.list:
        return print_pools()
    key = args.production_key or args.key or KEY
    if not key:
        sys.exit("Clé manquante : définissez LITELLM_TEST_API_KEY ou utilisez --key avec une clé virtuelle.")

    try:
        status, _, _ = request_json(BASE + "/health/readiness", "", timeout=8)
    except (OSError, ValueError) as exc:
        sys.exit(f"Gateway indisponible ({BASE}) : {exc}")
    if status != 200:
        sys.exit(f"Gateway non prête : HTTP {status}")

    if args.production_key:
        check_production_key(key)
    elif args.providers is not None:
        check_providers(key, args.providers)
    elif args.tag:
        check_capability(key, args.tag)
    else:
        for tag in CAPABILITIES:
            check_capability(key, tag)
        check_structured_output(key)
        check_grounding(key)
        check_failover(key)

    print(f"\n{SENT} requête(s) envoyée(s) : {RESULTS.count('OK')} OK, "
          f"{RESULTS.count('WARN')} WARN, {RESULTS.count('FAIL')} FAIL")
    sys.exit(1 if "FAIL" in RESULTS else 0)


if __name__ == "__main__":
    main()
