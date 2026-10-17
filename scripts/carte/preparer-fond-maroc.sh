#!/bin/sh
# Prépare le fond de carte auto-hébergé de la carte des chantiers (voir docs/chantier/carte.md) :
#   - maroc.pmtiles : extrait du Maroc d'un build quotidien Protomaps (données OpenStreetMap, ODbL) ;
#   - fonts/ et sprites/v4/ : polices (SIL OFL) et icônes (MIT) des styles Protomaps.
# Tout est gratuit et open source ; aucune clé ni aucun compte n'est nécessaire.
#
# Usage : scripts/carte/preparer-fond-maroc.sh <dossier-cible> [AAAAMMJJ]
#   dossier-cible : frontend/carte-fond en développement, le dossier CARTE_FOND_DIR sur le serveur.
#   AAAAMMJJ      : date du build Protomaps (liste sur https://maps.protomaps.com/builds), défaut : hier.
# Prérequis : git, et l'outil `pmtiles` (https://github.com/protomaps/go-pmtiles/releases) dans le PATH.
set -eu

CIBLE="${1:?Usage : $0 <dossier-cible> [AAAAMMJJ]}"
BUILD="${2:-$(date -u -d yesterday +%Y%m%d 2>/dev/null || date -u -v-1d +%Y%m%d)}"

# Emprise : lue dans le fichier calculé depuis la frontière du Maroc (scripts/carte/calculer-emprise.mjs), la même source que
# la carte (carte.config.ts) ; aucune valeur n'est répétée ici.
FICHIER_EMPRISE="$(dirname "$0")/../../frontend/src/app/portail/chantier/carte/emprise-maroc.json"
EMPRISE="$(sed -n 's/.*"emprise": *\[\([^]]*\)\].*/\1/p' "$FICHIER_EMPRISE" | tr -d ' ')"
case "$EMPRISE" in
  *,*,*,*) ;;
  *) echo "Emprise illisible dans $FICHIER_EMPRISE" >&2; exit 1 ;;
esac
ZOOM_MAX=15

command -v pmtiles >/dev/null || { echo "pmtiles introuvable : https://github.com/protomaps/go-pmtiles/releases" >&2; exit 1; }
command -v git >/dev/null || { echo "git introuvable" >&2; exit 1; }

mkdir -p "$CIBLE"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

echo "Extraction du Maroc depuis le build Protomaps $BUILD (emprise $EMPRISE, zoom 0 à $ZOOM_MAX)…"
pmtiles extract "https://build.protomaps.com/$BUILD.pmtiles" "$TEMP/maroc.pmtiles" --bbox="$EMPRISE" --maxzoom="$ZOOM_MAX"

echo "Récupération des polices et des icônes…"
git clone --quiet --depth 1 --filter=blob:none --sparse https://github.com/protomaps/basemaps-assets.git "$TEMP/assets"
git -C "$TEMP/assets" sparse-checkout set --no-cone \
  '/fonts/Noto Sans Regular/' '/fonts/Noto Sans Medium/' '/fonts/Noto Sans Italic/' '/fonts/OFL.txt' '/sprites/v4/'

# Remplacement en fin de traitement seulement : un échec plus haut laisse le fond précédent intact.
rm -rf "$CIBLE/fonts" "$CIBLE/sprites"
mkdir -p "$CIBLE/sprites"
mv "$TEMP/assets/fonts" "$CIBLE/fonts"
mv "$TEMP/assets/sprites/v4" "$CIBLE/sprites/v4"
mv "$TEMP/maroc.pmtiles" "$CIBLE/maroc.pmtiles"

echo "Fond de carte prêt dans $CIBLE (build $BUILD) :"
du -sh "$CIBLE/maroc.pmtiles" "$CIBLE/fonts" "$CIBLE/sprites"
