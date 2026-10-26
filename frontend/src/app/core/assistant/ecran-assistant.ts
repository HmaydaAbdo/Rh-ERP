/**
 * Ce que l'assistant sait de l'écran ouvert : un libellé pour le contexte envoyé à l'agent, et des suggestions de
 * questions adaptées au domaine. Indices de confiance limitée : le serveur revérifie tout identifiant reçu.
 */

export interface SuggestionEcran {
  readonly title: string;
  readonly message: string;
}

interface Domaine {
  readonly libelle: string;
  readonly suggestions: readonly SuggestionEcran[];
}

const DOMAINES: Readonly<Record<string, Domaine>> = {
  paie: {
    libelle: 'Paie',
    suggestions: [
      { title: 'Masse salariale', message: 'Quelle est la masse salariale du dernier mois de paie ?' },
      { title: 'Arrivées et départs', message: 'Combien d’employés sont arrivés et partis entre les deux derniers mois de paie ?' },
      { title: 'Chantier le plus coûteux', message: 'Quel chantier a la plus grosse masse salariale le dernier mois ?' }
    ]
  },
  employees: {
    libelle: 'Employés',
    suggestions: [
      { title: 'Effectif en poste', message: 'Combien d’employés sont en poste ?' },
      { title: 'Effectif par chantier', message: 'Quel est l’effectif de chaque chantier ?' },
      { title: 'Départs du mois', message: 'Quels sont les départs du dernier mois de paie ?' }
    ]
  },
  chantiers: {
    libelle: 'Chantiers',
    suggestions: [
      { title: 'Chantiers en cours', message: 'Combien de chantiers sont en cours ?' },
      { title: 'Chantiers les plus gros', message: 'Quels chantiers ont le plus d’employés ?' }
    ]
  },
  equipes: {
    libelle: 'Équipes',
    suggestions: [
      { title: 'Équipes les plus grandes', message: 'Quelles équipes ont le plus d’employés ?' },
      { title: 'Sans équipe', message: 'Combien d’employés payés le dernier mois n’ont pas d’équipe ?' }
    ]
  },
  functions: {
    libelle: 'Fonctions',
    suggestions: [{ title: 'Effectif par métier', message: 'Combien d’employés compte chaque fonction ?' }]
  },
  audit: {
    libelle: 'Journal d’audit',
    suggestions: [{ title: 'Accès refusés', message: 'Y a-t-il eu des accès refusés récemment ?' }]
  }
};

const GENERALES: readonly SuggestionEcran[] = [
  { title: 'Masse salariale', message: 'Quelle est la masse salariale du dernier mois de paie ?' },
  { title: 'Effectif en poste', message: 'Combien d’employés sont en poste ?' },
  { title: 'Que sais-tu faire ?', message: 'Que sais-tu faire ?' }
];

function domaineDe(url: string): Domaine | null {
  const premier = url.split('?')[0].split('/').filter(Boolean)[0] ?? '';
  return DOMAINES[premier] ?? null;
}

export function suggestionsPour(url: string): readonly SuggestionEcran[] {
  return domaineDe(url)?.suggestions ?? GENERALES;
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
  return { ecran: chemin, domaine: domaineDe(url)?.libelle ?? null, filtres };
}
