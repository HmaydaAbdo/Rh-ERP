#!/bin/sh
# Prépare le fond auto-hébergé de la carte des chantiers (voir docs/chantier/carte.md) : le monde entier, le Maroc en détail.
#   - monde.pmtiles : plan du monde (build quotidien Protomaps, données OpenStreetMap, ODbL) jusqu'au zoom ZOOM_MONDE,
#     complété par le Maroc jusqu'au zoom 15 (rues, bâtiments, commerces) ;
#   - monde-relief.pmtiles : relief du monde (Mapterhorn, données ouvertes) jusqu'au zoom ZOOM_RELIEF_MONDE, complété par
#     le Maroc jusqu'au zoom 11 ;
#   - fonts/ et sprites/v4/ : polices (SIL OFL) et icônes (MIT) des styles Protomaps.
# Tout est gratuit et open source ; aucune clé ni aucun compte n'est nécessaire.
#
# Usage : [ZOOM_MONDE=13] [ZOOM_RELIEF_MONDE=8] scripts/carte/preparer-fond-carte.sh <dossier-cible> [AAAAMMJJ]
#   dossier-cible     : carte-fond, à côté de docker-compose.yml (CARTE_FOND_DIR par défaut), en production comme en
#                       développement (frontend/carte-fond y renvoie, voir docs/chantier/carte.md).
#   AAAAMMJJ          : date du build Protomaps (liste sur https://maps.protomaps.com/builds), défaut : hier.
#   ZOOM_MONDE        : détail du plan hors du Maroc. 10 = 3,8 Go, 11 = 8 Go, 12 = 18 Go, 13 = 36 Go (défaut : toutes les
#                       rues du monde). Le monde complet au zoom 15 pèserait 139 Go.
#   ZOOM_RELIEF_MONDE : détail du relief hors du Maroc. 7 = 0,9 Go, 8 = 3,2 Go (défaut), 9 = 10 Go.
# Espace disque : environ deux fois la taille finale pendant la préparation (extraits, puis fusion).
# Prérequis : git, et l'outil `pmtiles` (https://github.com/protomaps/go-pmtiles/releases) dans le PATH.
set -eu

CIBLE="${1:?Usage : $0 <dossier-cible> [AAAAMMJJ]}"
BUILD="${2:-$(date -u -d yesterday +%Y%m%d 2>/dev/null || date -u -v-1d +%Y%m%d)}"
ZOOM_MONDE="${ZOOM_MONDE:-13}"
ZOOM_RELIEF_MONDE="${ZOOM_RELIEF_MONDE:-8}"

# Emprise du Maroc : lue dans le fichier calculé depuis sa frontière (scripts/carte/calculer-emprise.mjs) ; aucune valeur
# n'est répétée ici.
FICHIER_EMPRISE="$(dirname "$0")/../../frontend/src/app/portail/chantier/carte/emprise-maroc.json"
EMPRISE="$(sed -n 's/.*"emprise": *\[\([^]]*\)\].*/\1/p' "$FICHIER_EMPRISE" | tr -d ' ')"
case "$EMPRISE" in
  *,*,*,*) ;;
  *) echo "Emprise illisible dans $FICHIER_EMPRISE" >&2; exit 1 ;;
esac
ZOOM_MAROC=15
PLAN="https://build.protomaps.com/$BUILD.pmtiles"
# Relief : tuiles de 512 px ; le zoom 11 vaut un zoom 12 classique (environ 38 m par pixel).
RELIEF="https://download.mapterhorn.com/planet.pmtiles"
ZOOM_RELIEF_MAROC=11

for zoom in "$ZOOM_MONDE" "$ZOOM_RELIEF_MONDE"; do
  case "$zoom" in
    ''|*[!0-9]*) echo "Zoom invalide : $zoom" >&2; exit 1 ;;
  esac
done
[ "$ZOOM_MONDE" -lt "$ZOOM_MAROC" ] || { echo "ZOOM_MONDE doit être inférieur à $ZOOM_MAROC" >&2; exit 1; }
[ "$ZOOM_RELIEF_MONDE" -lt "$ZOOM_RELIEF_MAROC" ] || { echo "ZOOM_RELIEF_MONDE doit être inférieur à $ZOOM_RELIEF_MAROC" >&2; exit 1; }

command -v pmtiles >/dev/null || { echo "pmtiles introuvable : https://github.com/protomaps/go-pmtiles/releases" >&2; exit 1; }
command -v git >/dev/null || { echo "git introuvable" >&2; exit 1; }

mkdir -p "$CIBLE"
# Dossier de travail à côté de la cible (même disque, hors du dossier servi) : les archives, volumineuses, y sont
# déplacées sans copie ; /tmp est parfois en mémoire et trop petit. Il est GARDÉ en cas d'échec : relancer la même
# commande reprend où elle s'était arrêtée (chaque étape terminée est sautée). Supprimé seulement en cas de succès.
TRAVAIL="${CIBLE%/}.preparation"
mkdir -p "$TRAVAIL"

# Chaque étape écrit dans un fichier provisoire, renommé seulement si elle réussit : un fichier présent est complet.
# Les noms portent le build et les zooms : une préparation avec d'autres valeurs ne reprend pas des fichiers étrangers.
TENTATIVES=3
extraire() { # extraire <source> <fichier> <options pmtiles extract…>
  source_archive="$1"; fichier="$2"; shift 2
  if [ -f "$fichier" ]; then
    echo "  déjà fait : $(basename "$fichier")"
    return 0
  fi
  essai=1
  until pmtiles extract "$source_archive" "$fichier.partiel" "$@"; do
    rm -f "$fichier.partiel"
    [ "$essai" -lt "$TENTATIVES" ] || { echo "Échec après $TENTATIVES essais. Relancer la même commande pour reprendre." >&2; exit 1; }
    essai=$((essai + 1))
    echo "  coupure ou erreur : nouvel essai ($essai/$TENTATIVES) dans 30 s…" >&2
    sleep 30
  done
  mv "$fichier.partiel" "$fichier"
}
fusionner() { # fusionner <sortie> <entrée…> : deux extraits disjoints en une seule archive
  sortie="$1"; shift
  if [ ! -f "$sortie" ]; then
    pmtiles merge "$@" "$sortie.partiel"
    mv "$sortie.partiel" "$sortie"
  fi
  rm -f "$@"
}

# Polices et icônes d'abord : elles sont petites, et un échec ici ne doit pas faire perdre le gros téléchargement.
# Chemins sans « / » initial : sous Git Bash (Windows), un argument qui commence par « / » est réécrit en chemin Windows
# avant d'arriver à git, et la sélection ne trouve alors plus rien.
echo "Récupération des polices et des icônes…"
rm -rf "$TRAVAIL/assets"
git clone --quiet --depth 1 --filter=blob:none --sparse https://github.com/protomaps/basemaps-assets.git "$TRAVAIL/assets"
git -C "$TRAVAIL/assets" sparse-checkout set --cone "fonts/Noto Sans Regular" "fonts/Noto Sans Medium" "fonts/Noto Sans Italic" "sprites/v4"
for obligatoire in "fonts/Noto Sans Regular/0-255.pbf" "fonts/Noto Sans Medium/0-255.pbf" "fonts/Noto Sans Italic/0-255.pbf" "sprites/v4/light.json" "sprites/v4/dark.json"; do
  [ -f "$TRAVAIL/assets/$obligatoire" ] || { echo "Fichier manquant après la récupération : $obligatoire" >&2; exit 1; }
done

# Le monde jusqu'à un zoom, le Maroc au-delà : deux extraits disjoints du même build, fusionnés en une seule archive.
MONDE="$TRAVAIL/monde-$BUILD-z$ZOOM_MONDE.pmtiles"
if [ ! -f "$MONDE" ]; then
  echo "Plan du monde (build Protomaps $BUILD, zoom 0 à $ZOOM_MONDE)…"
  extraire "$PLAN" "$TRAVAIL/plan-monde-$BUILD-z$ZOOM_MONDE.pmtiles" --maxzoom="$ZOOM_MONDE"
  echo "Plan du Maroc (emprise $EMPRISE, zoom $((ZOOM_MONDE + 1)) à $ZOOM_MAROC)…"
  extraire "$PLAN" "$TRAVAIL/plan-maroc-$BUILD-z$ZOOM_MONDE.pmtiles" --bbox="$EMPRISE" --minzoom="$((ZOOM_MONDE + 1))" --maxzoom="$ZOOM_MAROC"
  fusionner "$MONDE" "$TRAVAIL/plan-monde-$BUILD-z$ZOOM_MONDE.pmtiles" "$TRAVAIL/plan-maroc-$BUILD-z$ZOOM_MONDE.pmtiles"
else
  echo "Plan déjà prêt : $(basename "$MONDE")"
fi

RELIEF_FINAL="$TRAVAIL/monde-relief-z$ZOOM_RELIEF_MONDE.pmtiles"
if [ ! -f "$RELIEF_FINAL" ]; then
  echo "Relief du monde (Mapterhorn, zoom 0 à $ZOOM_RELIEF_MONDE)…"
  extraire "$RELIEF" "$TRAVAIL/relief-monde-z$ZOOM_RELIEF_MONDE.pmtiles" --maxzoom="$ZOOM_RELIEF_MONDE"
  echo "Relief du Maroc (zoom $((ZOOM_RELIEF_MONDE + 1)) à $ZOOM_RELIEF_MAROC)…"
  extraire "$RELIEF" "$TRAVAIL/relief-maroc-z$ZOOM_RELIEF_MONDE.pmtiles" --bbox="$EMPRISE" --minzoom="$((ZOOM_RELIEF_MONDE + 1))" --maxzoom="$ZOOM_RELIEF_MAROC"
  fusionner "$RELIEF_FINAL" "$TRAVAIL/relief-monde-z$ZOOM_RELIEF_MONDE.pmtiles" "$TRAVAIL/relief-maroc-z$ZOOM_RELIEF_MONDE.pmtiles"
else
  echo "Relief déjà prêt : $(basename "$RELIEF_FINAL")"
fi

# Remplacement en fin de traitement seulement : un échec plus haut laisse le fond précédent intact.
rm -rf "$CIBLE/fonts" "$CIBLE/sprites"
mkdir -p "$CIBLE/sprites"
mv "$TRAVAIL/assets/fonts" "$CIBLE/fonts"
mv "$TRAVAIL/assets/sprites/v4" "$CIBLE/sprites/v4"
mv -f "$MONDE" "$CIBLE/monde.pmtiles"
mv -f "$RELIEF_FINAL" "$CIBLE/monde-relief.pmtiles"
# Archives de l'ancien fond limité au Maroc, remplacées par celles du monde.
rm -f "$CIBLE/maroc.pmtiles" "$CIBLE/maroc-relief.pmtiles"
rm -rf "$TRAVAIL"

echo "Fond de carte prêt dans $CIBLE (build $BUILD, monde au zoom $ZOOM_MONDE, relief du monde au zoom $ZOOM_RELIEF_MONDE) :"
du -sh "$CIBLE/monde.pmtiles" "$CIBLE/monde-relief.pmtiles" "$CIBLE/fonts" "$CIBLE/sprites"
