export interface NavItem {
  label: string;
  icon: 'wallet' | 'users' | 'building' | 'map-pinned' | 'briefcase' | 'network' | 'user-cog' | 'shield' | 'settings' | 'history';
  route: string;
  /** Permission de lecture qui donne accès à l'écran (jamais un rôle codé en dur). */
  permission: string;
  /** Regroupement visuel du menu, sans effet sur la route ni sur la permission. */
  group?: 'referentiel-rh' | 'administration-systeme';
}

/** Priorité de l'écran d'accueil (premier écran autorisé, voir `homeGuard`). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Paie', icon: 'wallet', route: '/paie', permission: 'PAIE_READ' },
  { label: 'Employés', icon: 'users', route: '/employees', permission: 'EMPLOYEE_READ' },
  { label: 'Chantiers', icon: 'building', route: '/chantiers', permission: 'CHANTIER_READ' },
  { label: 'Carte', icon: 'map-pinned', route: '/carte', permission: 'CARTE_READ' },
  { label: 'Fonctions', icon: 'briefcase', route: '/functions', permission: 'FUNCTION_READ', group: 'referentiel-rh' },
  { label: 'Équipes', icon: 'network', route: '/equipes', permission: 'EQUIPE_READ', group: 'referentiel-rh' },
  { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', permission: 'USER_MANAGE', group: 'administration-systeme' },
  { label: 'Rôles', icon: 'shield', route: '/admin/roles', permission: 'ROLE_MANAGE', group: 'administration-systeme' },
  { label: 'Paramètres', icon: 'settings', route: '/admin/parametres', permission: 'PARAMETRE_READ', group: 'administration-systeme' },
  { label: 'Journal', icon: 'history', route: '/audit', permission: 'AUDIT_READ', group: 'administration-systeme' }
];

/** La Carte ouvre le menu latéral; cette présentation ne change pas l'accueil existant. */
export const SIDEBAR_ITEMS: readonly NavItem[] = [...NAV_ITEMS].sort(
  (a, b) => Number(b.route === '/carte') - Number(a.route === '/carte')
);
