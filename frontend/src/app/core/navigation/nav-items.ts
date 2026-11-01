export interface NavItem {
  label: string;
  icon: 'wallet' | 'users' | 'building' | 'map-pinned' | 'briefcase' | 'network' | 'user-cog' | 'shield' | 'settings' | 'history' | 'clock-3';
  route: string;
  /** Où mène le menu quand la destination a plusieurs vues : la vue Cartes (décision du propriétaire, 2026-11-01). */
  ouverture?: string;
  /** Permission de lecture qui donne accès à l'écran (jamais un rôle codé en dur). */
  permission: string;
  /** Regroupement visuel du menu, sans effet sur la route ni sur la permission. */
  group?: 'administration-systeme';
}

/** Entrées du menu, dans l'ordre : l'écran d'arrivée est le premier auquel l'utilisateur a accès (voir `homeGuard`). L'Accueil est dans la barre Staport, indisponible jusqu'à la définition des fiches de poste. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Paie', icon: 'wallet', route: '/paie', ouverture: '/paie/cartes', permission: 'PAIE_READ' },
  { label: 'Heures sup.', icon: 'clock-3', route: '/heures-supp', ouverture: '/heures-supp/cartes', permission: 'HEURES_SUP_READ' },
  { label: 'Employés', icon: 'users', route: '/employees', ouverture: '/employees/cartes', permission: 'EMPLOYEE_READ' },
  { label: 'Chantiers', icon: 'building', route: '/chantiers', ouverture: '/chantiers/cartes', permission: 'CHANTIER_READ' },
  { label: 'Carte', icon: 'map-pinned', route: '/carte', permission: 'CARTE_READ' },
  { label: 'Fonctions', icon: 'briefcase', route: '/functions', ouverture: '/functions/cartes', permission: 'FUNCTION_READ' },
  { label: 'Équipes', icon: 'network', route: '/equipes', ouverture: '/equipes/cartes', permission: 'EQUIPE_READ' },
  { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', permission: 'USER_MANAGE', group: 'administration-systeme' },
  { label: 'Rôles', icon: 'shield', route: '/admin/roles', permission: 'ROLE_MANAGE', group: 'administration-systeme' },
  { label: 'Paramètres', icon: 'settings', route: '/admin/parametres', permission: 'PARAMETRE_READ', group: 'administration-systeme' },
  { label: 'Journal', icon: 'history', route: '/audit', permission: 'AUDIT_READ', group: 'administration-systeme' }
];

/** La Carte ouvre le menu latéral; cette présentation ne change pas l'accueil existant. */
export const SIDEBAR_ITEMS: readonly NavItem[] = [...NAV_ITEMS].sort(
  (a, b) => Number(b.route === '/carte') - Number(a.route === '/carte')
);
