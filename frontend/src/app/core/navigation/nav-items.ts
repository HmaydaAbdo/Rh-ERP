export interface NavItem {
  label: string;
  icon: 'wallet' | 'users' | 'building' | 'map-pinned' | 'briefcase' | 'network' | 'user-cog' | 'shield' | 'settings' | 'history';
  route: string;
  /** Permission de lecture qui donne accès à l'écran (jamais un rôle codé en dur). */
  permission: string;
}

/** Écrans de l'application dans l'ordre du menu — source unique du menu latéral et de l'écran d'accueil
 * (premier écran autorisé de la liste, voir `homeGuard`). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Paie', icon: 'wallet', route: '/paie', permission: 'PAIE_READ' },
  { label: 'Employés', icon: 'users', route: '/employees', permission: 'EMPLOYEE_READ' },
  { label: 'Chantiers', icon: 'building', route: '/chantiers', permission: 'CHANTIER_READ' },
  { label: 'Carte', icon: 'map-pinned', route: '/carte', permission: 'CARTE_READ' },
  { label: 'Fonctions', icon: 'briefcase', route: '/functions', permission: 'FUNCTION_READ' },
  { label: 'Équipes', icon: 'network', route: '/equipes', permission: 'EQUIPE_READ' },
  { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', permission: 'USER_MANAGE' },
  { label: 'Rôles', icon: 'shield', route: '/admin/roles', permission: 'ROLE_MANAGE' },
  { label: 'Paramètres', icon: 'settings', route: '/admin/parametres', permission: 'PARAMETRE_READ' },
  { label: 'Journal', icon: 'history', route: '/audit', permission: 'AUDIT_READ' }
];
