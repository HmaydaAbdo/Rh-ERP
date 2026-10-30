/**
 * Contexte de l'écran ouvert envoyé à l'agent. Ces indices ont une confiance limitée : le serveur revérifie tout
 * identifiant reçu.
 */

const DOMAINES: Readonly<Record<string, string>> = {
  paie: 'Paie',
  employees: 'Employés',
  chantiers: 'Chantiers',
  equipes: 'Équipes',
  functions: 'Fonctions',
  audit: 'Journal d’audit'
};

function domaineDe(url: string): string | null {
  const premier = url.split('?')[0].split('/').filter(Boolean)[0] ?? '';
  return DOMAINES[premier] ?? null;
}

/** Contexte envoyé à l'agent avec chaque question : l'écran, son domaine et ses filtres lisibles. */
export function contexteEcran(url: string): { ecran: string; domaine: string | null; filtres: Record<string, string> } {
  const [chemin, requete = ''] = url.split('?');
  const filtres: Record<string, string> = {};
  new URLSearchParams(requete).forEach((valeur, cle) => {
    if (valeur.length <= 100) {
      filtres[cle] = valeur;
    }
  });
  return { ecran: chemin, domaine: domaineDe(url), filtres };
}
