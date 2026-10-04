export interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Permission de lecture qui donne accès à l'écran (jamais un rôle codé en dur). */
  permission: string;
}

/** Écrans de l'application dans l'ordre du menu — source unique du menu latéral et de l'écran d'accueil
 * (premier écran autorisé de la liste, voir `homeGuard`). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Paie', icon: 'pi pi-wallet', route: '/paie', permission: 'PAIE_READ' },
  { label: 'Employés', icon: 'pi pi-users', route: '/employees', permission: 'EMPLOYEE_READ' },
  { label: 'Chantiers', icon: 'pi pi-building', route: '/chantiers', permission: 'CHANTIER_READ' },
  { label: 'Fonctions', icon: 'pi pi-briefcase', route: '/functions', permission: 'FUNCTION_READ' },
  { label: 'Équipes', icon: 'pi pi-sitemap', route: '/equipes', permission: 'EQUIPE_READ' },
  { label: 'Utilisateurs', icon: 'pi pi-user-edit', route: '/admin/users', permission: 'USER_MANAGE' },
  { label: 'Rôles', icon: 'pi pi-shield', route: '/admin/roles', permission: 'ROLE_MANAGE' },
  { label: 'Journal', icon: 'pi pi-history', route: '/audit', permission: 'AUDIT_READ' }
];
