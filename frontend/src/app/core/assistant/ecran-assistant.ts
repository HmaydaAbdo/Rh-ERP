/**
 * Contexte de l'écran ouvert envoyé à l'agent, en lecture seule. Ces indices ont une confiance limitée : le service IA
 * les revérifie et les réécrit (`ia/src/staport_ia/ecran.py`, KAN-83) et n'en garde que les domaines et filtres qu'il
 * connaît ; les deux listes évoluent ensemble.
 */

const DOMAINES: Readonly<Record<string, string>> = {
  paie: 'Paie',
  employees: 'Employés',
  chantiers: 'Chantiers',
  equipes: 'Équipes',
  functions: 'Fonctions',
  audit: 'Journal d’audit'
};

/** Les filtres d'écran utiles à l'agent : période, identifiants et statuts. Les saisies libres (nom, CIN, code…) ne partent pas. */
const FILTRES = new Set(['periode', 'chantierIds', 'equipeIds', 'fonctionIds', 'statut', 'actif', 'page']);

function domaineDe(url: string): string | null {
  const premier = url.split('?')[0].split('/').filter(Boolean)[0] ?? '';
  return DOMAINES[premier] ?? null;
}

/** Contexte envoyé à l'agent avec chaque question : l'écran, son domaine et ses filtres lisibles. */
export function contexteEcran(url: string): { ecran: string; domaine: string | null; filtres: Record<string, string> } {
  const [chemin, requete = ''] = url.split('?');
  const filtres: Record<string, string> = {};
  new URLSearchParams(requete).forEach((valeur, cle) => {
    if (FILTRES.has(cle) && valeur.length <= 100) {
      filtres[cle] = valeur;
    }
  });
  return { ecran: chemin, domaine: domaineDe(url), filtres };
}
