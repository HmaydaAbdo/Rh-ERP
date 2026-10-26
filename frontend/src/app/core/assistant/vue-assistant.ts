/**
 * Traduction d'une vue proposée par l'assistant (ViewSpec produite par un outil Spring, docs/ia.md § 6) en route connue de
 * l'application. Liste blanche stricte : module, vue et paramètres inconnus ou mal formés sont refusés. La vue n'accorde aucun
 * droit — les gardes de route s'appliquent à la navigation — et ne déclenche aucune action métier.
 */

export interface VueProposee {
  readonly module: string;
  readonly vue: string;
  readonly parametres: Readonly<Record<string, string>>;
}

export interface CibleVue {
  /** Commandes du routeur, par exemple `['/paie', 'analytique']`. */
  readonly commandes: readonly string[];
  readonly queryParams: Readonly<Record<string, string>>;
  /** « Paie · Analytique ». */
  readonly libelle: string;
  /** Filtres lisibles, par exemple « Période 2026-09 », « 1 chantier ». */
  readonly filtres: readonly string[];
}

type Vue = 'tabulaire' | 'cartes' | 'analytique' | 'fiche';

const MODULES: Readonly<Record<string, { route: string; libelle: string; vues: readonly Vue[] }>> = {
  paie: { route: '/paie', libelle: 'Paie', vues: ['tabulaire', 'cartes', 'analytique'] },
  employees: { route: '/employees', libelle: 'Employés', vues: ['tabulaire', 'cartes', 'analytique', 'fiche'] },
  chantiers: { route: '/chantiers', libelle: 'Chantiers', vues: ['tabulaire', 'cartes', 'analytique', 'fiche'] },
  equipes: { route: '/equipes', libelle: 'Équipes', vues: ['tabulaire', 'cartes', 'analytique', 'fiche'] },
  functions: { route: '/functions', libelle: 'Fonctions', vues: ['tabulaire', 'cartes', 'analytique', 'fiche'] },
  audit: { route: '/audit', libelle: 'Journal d’audit', vues: ['tabulaire'] },
  'admin/parametres': { route: '/admin/parametres', libelle: 'Paramètres', vues: ['tabulaire'] },
  'admin/roles': { route: '/admin/roles', libelle: 'Rôles', vues: ['tabulaire'] }
};

const LIBELLES_VUES: Readonly<Record<Vue, string>> = {
  tabulaire: 'Tabulaire',
  cartes: 'Cartes',
  analytique: 'Analytique',
  fiche: 'Fiche'
};

const IDENTIFIANTS = /^\d{1,12}(,\d{1,12}){0,49}$/;

/** Paramètres d'URL que les vues lisent déjà, avec leur format admis. */
const PARAMETRES: Readonly<Record<string, (valeur: string) => boolean>> = {
  periode: (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  chantierIds: (v) => IDENTIFIANTS.test(v),
  equipeIds: (v) => IDENTIFIANTS.test(v),
  fonctionIds: (v) => IDENTIFIANTS.test(v),
  // Mêmes bornes que les contrats Employé; le CIN n'impose pas d'alphabet particulier.
  nom: (v) => v.trim().length > 0 && v.length <= 150,
  cin: (v) => v.trim().length > 0 && v.length <= 30,
  code: (v) => v.trim().length > 0 && v.length <= 50,
  statut: (v) => /^[A-Z_]{1,30}$/.test(v),
  action: (v) => v === 'export'
};

export function cibleDeVue(proposee: unknown): CibleVue | null {
  if (!estVueProposee(proposee)) {
    return null;
  }
  const module = MODULES[proposee.module];
  const vue = proposee.vue as Vue;
  if (!module || !module.vues.includes(vue)) {
    return null;
  }
  const queryParams: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(proposee.parametres)) {
    if (cle === 'id' && vue === 'fiche') {
      continue;
    }
    const valide = PARAMETRES[cle];
    if (!valide || typeof valeur !== 'string' || !valide(valeur)) {
      return null;
    }
    queryParams[cle] = valeur;
  }
  let commandes: string[];
  if (vue === 'fiche') {
    const id = proposee.parametres['id'];
    if (typeof id !== 'string' || !/^\d{1,12}$/.test(id)) {
      return null;
    }
    commandes = [module.route, id];
  } else {
    commandes = vue === 'tabulaire' ? [module.route] : [module.route, vue];
  }
  return {
    commandes,
    queryParams,
    libelle: `${module.libelle} · ${LIBELLES_VUES[vue]}`,
    filtres: filtresLisibles(queryParams)
  };
}

function estVueProposee(valeur: unknown): valeur is VueProposee {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const v = valeur as Record<string, unknown>;
  return (
    typeof v['module'] === 'string' &&
    typeof v['vue'] === 'string' &&
    typeof v['parametres'] === 'object' &&
    v['parametres'] !== null &&
    !Array.isArray(v['parametres'])
  );
}

function filtresLisibles(params: Readonly<Record<string, string>>): string[] {
  const filtres: string[] = [];
  const nombre = (cle: string, singulier: string, pluriel: string) => {
    const n = params[cle]?.split(',').length ?? 0;
    if (n > 0) {
      filtres.push(`${n} ${n > 1 ? pluriel : singulier}`);
    }
  };
  if (params['periode']) filtres.push(`Période ${params['periode']}`);
  nombre('chantierIds', 'chantier', 'chantiers');
  nombre('equipeIds', 'équipe', 'équipes');
  nombre('fonctionIds', 'fonction', 'fonctions');
  if (params['nom']) filtres.push(`Nom « ${params['nom']} »`);
  if (params['cin']) filtres.push(`CIN ${params['cin']}`);
  if (params['code']) filtres.push(`Code ${params['code']}`);
  if (params['statut']) filtres.push(`Statut ${params['statut'].toLowerCase().replaceAll('_', ' ')}`);
  return filtres;
}
