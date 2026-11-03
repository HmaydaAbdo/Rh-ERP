"""Compare deux sorties `pg_dump --schema-only` (KAN-212) : base gérée par Flyway et base construite par Alembic.

Ignore ce qui ne relève pas du schéma applicatif (jetons `\restrict`, tables d'historique des migrations, extension pgaudit)
et compare les contraintes CHECK par colonnes et valeurs, car PostgreSQL 17 et 18 n'écrivent pas de la même façon la même
expression.

    python scripts/migration/comparer-schemas.py schema_flyway.sql schema_alembic.sql
"""

import re
import sys


def normaliser(chemin):
    texte = open(chemin, encoding="utf-8").read()
    texte = re.sub(r"^\\(un)?restrict .*$", "", texte, flags=re.M)
    lignes = [ligne.rstrip() for ligne in texte.split("\n") if ligne.strip() and not ligne.startswith("--")]
    sortie, saut = [], False
    for ligne in lignes:
        if "pgaudit" in ligne:
            continue
        if re.match(r"CREATE TABLE public\.(alembic_version|flyway_schema_history) ", ligne):
            saut = True
        if saut:
            if ligne.startswith(");"):
                saut = False
            continue
        if re.search(r"(alembic_version|flyway_schema_history)", ligne):
            continue
        if "CHECK" in ligne:
            nom = re.search(r"CONSTRAINT (\w+) CHECK", ligne).group(1)
            valeurs = sorted(re.findall(r"'([^']*)'", ligne))
            colonnes = sorted(set(re.findall(r"\(\(?\(?(\w+)\)?::text", ligne)))
            ligne = f"CHECK {nom} colonnes={colonnes} valeurs={valeurs} nul={'IS NULL' in ligne}"
        sortie.append(ligne.rstrip(","))
    return sortie


a, b = normaliser(sys.argv[1]), normaliser(sys.argv[2])
print(f"lignes comparées : réel={len(a)} alembic={len(b)}")
sa, sb = set(a), set(b)
for l in sorted(sa - sb):
    print("SEULEMENT DANS LA BASE RÉELLE :", l[:220])
for l in sorted(sb - sa):
    print("SEULEMENT DANS ALEMBIC        :", l[:220])
print("IDENTIQUE" if a == b else ("MÊMES LIGNES, ORDRE DIFFÉRENT" if sa == sb else "DIFFÉRENCES"))
