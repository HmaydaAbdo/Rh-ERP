"""Extrait le catalogue MCP (nom, titre, description) des classes d'outils Spring : entrée de l'évaluation du routage.

Usage, depuis ia/ : ``python evaluation/extraire_catalogue.py evaluation/catalogue_mcp.json``. À relancer à chaque
changement d'une définition d'outil (docs/ia.md, T32).
"""

import glob
import json
import re
import sys
from pathlib import Path

base = Path(__file__).resolve().parents[2] / "backend" / "src" / "main" / "java" / "staport" / "rh" / "mcp" / "outils"
sortie: list[dict[str, str]] = []
for fichier in sorted(glob.glob(str(base / "*.java"))):
    source = Path(fichier).read_text(encoding="utf-8")
    for debut in re.finditer(r"@McpTool\(", source):
        i = debut.end()
        profondeur = 1
        j = i
        while profondeur and j < len(source):
            if source.startswith('"""', j):
                j = source.index('"""', j + 3) + 3
                continue
            c = source[j]
            if c == '"':
                j += 1
                while source[j] != '"':
                    if source[j] == "\\":
                        j += 1
                    j += 1
            elif c == "(":
                profondeur += 1
            elif c == ")":
                profondeur -= 1
            j += 1
        args = source[i : j - 1]
        nom = re.search(r'name\s*=\s*"([^"]+)"', args)
        titre = re.search(r'title\s*=\s*"([^"]+)"', args)
        d = re.search(r"description\s*=\s*(.*)", args, re.S)
        description = ""
        if d:
            bloc = re.search(r'"""(.*?)"""', d.group(1), re.S)
            if bloc:
                description = re.sub(r"\\\n\s*", "", bloc.group(1))
            else:
                description = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', d.group(1)))
            description = re.sub(r"\s+", " ", description).strip()
        sortie.append(
            {
                "file": Path(fichier).name,
                "name": nom.group(1) if nom else "",
                "title": titre.group(1) if titre else "",
                "description": description,
            }
        )
print(len(sortie), "outils")
Path(sys.argv[1]).write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
