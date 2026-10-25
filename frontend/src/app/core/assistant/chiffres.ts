/**
 * Chiffres cités par une réponse vérifiée de l'assistant, et leur mise en évidence dans la vue ouverte. Le rapprochement est
 * exact (valeur numérique identique), jamais approché : une valeur affichée n'est surlignée que si la réponse la cite.
 */

// Un nombre isolé : jamais les chiffres d'un code (« C-f0e214bf », « CIN12 », « E-07 »).
const NOMBRE = /(?<![\p{L}\d_-])(?:\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\d_-])/gu;
const PERIODE = /\b\d{4}-\d{2}\b/g;
const CLASSE = 'assistant-cite';

/** Valeur numérique canonique : « 1 250 000,50 » et « 1250000.5 » donnent « 1250000.5 ». */
export function canonique(texte: string): string {
  const brut = texte.replace(/[   ]/g, '').replace(',', '.');
  const nombre = Number(brut);
  return Number.isFinite(nombre) ? String(nombre) : brut;
}

/**
 * Nombres significatifs d'un texte, sans les périodes AAAA-MM ni les petits entiers (moins de 10), trop ambigus pour être
 * repérés dans un écran.
 */
export function chiffresCites(texte: string): string[] {
  const sansPeriodes = texte.replace(PERIODE, ' ');
  const trouves = new Set<string>();
  for (const correspondance of sansPeriodes.matchAll(NOMBRE)) {
    const valeur = canonique(correspondance[0]);
    if (Number(valeur) >= 10 || valeur.includes('.')) {
      trouves.add(valeur);
    }
  }
  return [...trouves];
}

/**
 * Surligne dans `racine` les éléments courts dont le texte affiche l'un des `chiffres`. La vue se charge de façon asynchrone :
 * le balayage se répète à chaque changement du DOM pendant `dureeMs`. Renvoie la fonction qui retire le surlignage.
 */
export function surlignerChiffres(racine: HTMLElement, chiffres: readonly string[], dureeMs = 6000): () => void {
  const cibles = new Set(chiffres);
  const surlignes = new Set<Element>();
  const balayer = () => {
    if (cibles.size === 0) {
      return;
    }
    const parcours = racine.ownerDocument.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      const element = noeud.parentElement;
      const texte = noeud.textContent?.trim() ?? '';
      if (!element || texte.length === 0 || texte.length > 40 || surlignes.has(element)) {
        continue;
      }
      const valeurs = [...texte.replace(PERIODE, ' ').matchAll(NOMBRE)].map((m) => canonique(m[0]));
      if (valeurs.some((v) => cibles.has(v))) {
        element.classList.add(CLASSE);
        surlignes.add(element);
      }
    }
  };
  balayer();
  const observateur = new MutationObserver(balayer);
  observateur.observe(racine, { childList: true, subtree: true, characterData: true });
  const arret = setTimeout(() => observateur.disconnect(), dureeMs);
  return () => {
    clearTimeout(arret);
    observateur.disconnect();
    surlignes.forEach((element) => element.classList.remove(CLASSE));
    surlignes.clear();
  };
}
