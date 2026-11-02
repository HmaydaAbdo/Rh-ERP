import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AssistantRacineComponent } from './core/assistant/assistant-racine.component';
import { AuthService } from './core/auth/services/auth.service';
import { SIDEBAR_ITEMS } from './core/navigation/nav-items';
import { ThemeService } from './core/theme/theme.service';
import { AppShellComponent, ShellNavGroupe, ShellNavItem } from './shared/ui/app-shell/app-shell.component';
import { FeedbackViewportComponent } from './shared/ui/feedback/feedback-viewport.component';

function cheminSansRequete(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? '';
}

function estRouteAuthentification(url: string): boolean {
  const chemin = cheminSansRequete(url);
  return chemin === '/login' || chemin === '/forgot-password' || chemin === '/reset-password';
}

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, AppShellComponent, FeedbackViewportComponent, AssistantRacineComponent],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  readonly user = this.authService.user;
  readonly isAuthenticated = this.authService.isAuthenticated;
  private readonly routeCourante = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );
  readonly estRouteAuthentification = computed(() => estRouteAuthentification(this.routeCourante()));
  readonly navigationVisible = computed(() => this.isAuthenticated() && !this.estRouteAuthentification());
  /** Staport Intelligence (docs/ia.md, T8) : réservé au droit IA_UTILISER ; l'application reste utilisable sans lui. */
  readonly assistantVisible = computed(() => this.navigationVisible() && this.authService.hasPermission('IA_UTILISER'));
  readonly estCarte = computed(() => cheminSansRequete(this.routeCourante()) === '/carte');

  /** Les destinations visibles par l'utilisateur, d'après ses permissions (jamais un rôle codé en dur). */
  readonly menu = computed<readonly ShellNavItem[]>(() =>
    SIDEBAR_ITEMS.filter((item) => this.authService.hasPermission(item.permission)).map((item) => ({
      label: item.label,
      icon: item.icon,
      route: item.route,
      groupe: item.group
    }))
  );
  readonly groupes: readonly ShellNavGroupe[] = [{ id: 'administration-systeme', label: 'Administration système', icon: 'layers' }];

  onLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
