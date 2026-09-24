import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from './core/auth/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastModule, TooltipModule, ButtonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  title = 'Staport RH';

  readonly user = this.authService.user;
  readonly isAuthenticated = this.authService.isAuthenticated;

  private readonly allNavItems: NavItem[] = [
    { label: 'Paie', icon: 'pi pi-wallet', route: '/paie' },
    { label: 'Employés', icon: 'pi pi-users', route: '/employees' },
    { label: 'Chantiers', icon: 'pi pi-building', route: '/chantiers' },
    { label: 'Fonctions', icon: 'pi pi-briefcase', route: '/functions' },
    { label: 'Utilisateurs', icon: 'pi pi-user-edit', route: '/admin/users', permission: 'USER_MANAGE' },
    { label: 'Rôles', icon: 'pi pi-shield', route: '/admin/roles', permission: 'ROLE_MANAGE' }
  ];

  readonly navItems = computed(() =>
    this.allNavItems.filter((item) => !item.permission || this.authService.hasPermission(item.permission))
  );

  onLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
