
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  LucideBriefcase,
  LucideBuilding,
  LucideChevronDown,
  LucideClock3,
  LucideHistory,
  LucideLayers,
  LucideLogOut,
  LucideMapPinned,
  LucideMenu,
  LucideMoon,
  LucideNetwork,
  LucideShield,
  LucideSettings,
  LucideSun,
  LucideUserCog,
  LucideUsers,
  LucideWallet,
  LucideX
} from '@lucide/angular';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AssistantRacineComponent } from './core/assistant/assistant-racine.component';
import { AuthService } from './core/auth/services/auth.service';
import { SIDEBAR_ITEMS } from './core/navigation/nav-items';
import { ThemeService } from './core/theme/theme.service';
import { FeedbackViewportComponent } from './shared/feedback/feedback-viewport.component';

function estRouteAuthentification(url: string): boolean {
  const chemin = url.split(/[?#]/, 1)[0] ?? '';
  return chemin === '/login' || chemin === '/forgot-password' || chemin === '/reset-password';
}

@Component({
    selector: 'app-root',
    imports: [
      RouterOutlet,
      RouterLink,
      RouterLinkActive,
      FeedbackViewportComponent,
      AssistantRacineComponent,
      LucideBriefcase,
      LucideBuilding,
      LucideChevronDown,
      LucideClock3,
      LucideHistory,
      LucideLayers,
      LucideLogOut,
      LucideMapPinned,
      LucideMenu,
      LucideMoon,
      LucideNetwork,
      LucideShield,
      LucideSettings,
      LucideSun,
      LucideUserCog,
      LucideUsers,
      LucideWallet,
      LucideX
    ],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly theme = inject(ThemeService);

  /** Menu en tiroir (téléphone, tablette tactile) : ouvert par le bouton de la barre du haut, fermé par le fond, Échap ou un choix. */
  readonly menuOuvert = signal(false);
  readonly menuCarteOuvert = signal(false);

  readonly user = this.authService.user;
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly estRouteAuthentification = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => estRouteAuthentification(event.urlAfterRedirects)),
      startWith(estRouteAuthentification(this.router.url))
    ),
    { initialValue: estRouteAuthentification(this.router.url) }
  );
  readonly navigationVisible = computed(() => this.isAuthenticated() && !this.estRouteAuthentification());
  /** Assistant RH (docs/ia.md, T8) : réservé au droit IA_UTILISER ; l'application reste entièrement utilisable sans lui. */
  readonly assistantVisible = computed(() => this.navigationVisible() && this.authService.hasPermission('IA_UTILISER'));
  private readonly routeCourante = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );
  readonly estCarte = computed(() => (this.routeCourante().split(/[?#]/, 1)[0] ?? '') === '/carte');
  private fermetureMenuCarte?: number;
  private readonly refermerMenuCarteHorsRoute = effect(() => {
    if (!this.estCarte()) {
      this.menuCarteOuvert.set(false);
      const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
      if (this.fermetureMenuCarte !== undefined) fenetre?.clearTimeout(this.fermetureMenuCarte);
      this.fermetureMenuCarte = undefined;
    }
  });

  readonly navItems = computed(() =>
    SIDEBAR_ITEMS.filter((item) => this.authService.hasPermission(item.permission))
  );
  readonly administrationItems = computed(() => this.navItems().filter((item) => item.group === 'administration-systeme'));
  readonly administrationOuverte = signal(false);
  private readonly ouvrirGroupeActif = effect(() => {
    const route = this.routeCourante();
    if (route.startsWith('/admin/') || route.startsWith('/audit')) this.administrationOuverte.set(true);
  });

  changerGroupe(groupe: 'administration-systeme', evenement: Event): void {
    const ouvert = (evenement.currentTarget as HTMLDetailsElement).open;
    if (groupe === 'administration-systeme') this.administrationOuverte.set(ouvert);
  }

  basculerMenu(): void {
    this.menuOuvert.update((ouvert) => !ouvert);
  }

  /** Lien d'évitement : le focus passe au contenu (un `href="#…"` suivrait la balise `<base>` et rechargerait l'accueil). */
  allerAuContenu(evenement: Event): void {
    evenement.preventDefault();
    document.getElementById('contenu')?.focus();
  }

  fermerMenu(): void {
    this.menuOuvert.set(false);
    this.menuCarteOuvert.set(false);
  }

  ouvrirMenuCarteAuSurvol(evenement: PointerEvent): void {
    if (evenement.pointerType === 'mouse') this.ouvrirMenuCarte();
  }

  cliquerMenuCarte(): void {
    const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
    if (fenetre?.matchMedia('(hover: hover)').matches) this.ouvrirMenuCarte();
    else this.menuCarteOuvert.update((ouvert) => !ouvert);
  }

  reporterFermetureMenuCarteAuPointeur(evenement: PointerEvent): void {
    if (evenement.pointerType === 'mouse') this.reporterFermetureMenuCarte();
  }

  ouvrirMenuCarte(): void {
    if (!this.estCarte()) return;
    const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
    if (this.fermetureMenuCarte !== undefined) fenetre?.clearTimeout(this.fermetureMenuCarte);
    this.fermetureMenuCarte = undefined;
    this.menuCarteOuvert.set(true);
  }

  reporterFermetureMenuCarte(): void {
    if (!this.estCarte()) return;
    const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
    if (!fenetre) return;
    if (this.fermetureMenuCarte !== undefined) fenetre.clearTimeout(this.fermetureMenuCarte);
    this.fermetureMenuCarte = fenetre.setTimeout(() => {
      const racine = this.hote.nativeElement;
      const bouton = racine.querySelector('.app-carte-menu');
      const sidebar = racine.querySelector('.app-sidebar');
      const pointeurDansZone = bouton?.matches(':hover') || sidebar?.matches(':hover');
      const focusDansZone = bouton?.matches(':focus-visible') || sidebar?.matches(':focus-within');
      if (!pointeurDansZone && !focusDansZone) this.menuCarteOuvert.set(false);
      this.fermetureMenuCarte = undefined;
    }, 140);
  }

  onLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
