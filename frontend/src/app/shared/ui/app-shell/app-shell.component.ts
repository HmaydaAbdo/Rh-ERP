import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { IconComponent } from '../icon/icon.component';

/** Destination du menu : l'icône est le nom d'une icône de `stp-icon`. `groupe` rattache l'entrée à un groupe repliable. */
export interface ShellNavItem {
  readonly label: string;
  readonly icon: string;
  readonly route: string;
  readonly groupe?: string;
}

/** Groupe repliable du menu (placé à l'endroit de sa première entrée). */
export interface ShellNavGroupe {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

type EntreeMenu =
  | { readonly type: 'lien'; readonly item: ShellNavItem; readonly index: number }
  | { readonly type: 'groupe'; readonly groupe: ShellNavGroupe; readonly enfants: readonly ShellNavItem[]; readonly index: number };

/**
 * Coque de l'application : rail de navigation iconique qui se déploie au survol ou au focus, barre du haut et tiroir sur
 * téléphone et tablette tactile, mode carte (le rail cède la largeur à la carte, un bouton ouvre le volet), lien d'évitement
 * et zone de contenu. Le contenu de l'écran courant est projeté ; la navigation, le thème et la déconnexion sont pilotés
 * par l'application (entrées et sorties), jamais codés ici.
 *
 *   <stp-app-shell [items]="…" [groupes]="…" [utilisateur]="…" [theme]="…" (basculerTheme)="…" (deconnecter)="…">
 *     <router-outlet />
 *   </stp-app-shell>
 */
@Component({
  selector: 'stp-app-shell',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input<readonly ShellNavItem[]>([]);
  readonly groupes = input<readonly ShellNavGroupe[]>([]);
  readonly utilisateur = input<string | null>(null);
  readonly theme = input<'light' | 'dark'>('light');
  /** Faux sur les écrans publics (connexion…) : seul le contenu est affiché, sans navigation. */
  readonly navigationVisible = input(true);
  /** Vrai sur l'écran carte : le rail se replie derrière un bouton. */
  readonly modeCarte = input(false);

  readonly basculerTheme = output<void>();
  readonly deconnecter = output<void>();

  /** Menu en tiroir (téléphone, tablette tactile) : ouvert par le bouton de la barre du haut, fermé par le fond, Échap ou un choix. */
  protected readonly menuOuvert = signal(false);
  protected readonly menuCarteOuvert = signal(false);
  private readonly groupesRepliesParUtilisateur = signal<ReadonlyMap<string, boolean>>(new Map());
  private fermetureMenuCarte?: number;

  private readonly urlCourante = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/, 1)[0] ?? ''),
      startWith((this.router.url.split(/[?#]/, 1)[0]) ?? '')
    ),
    { initialValue: this.router.url.split(/[?#]/, 1)[0] ?? '' }
  );

  protected readonly entrees = computed<readonly EntreeMenu[]>(() => {
    const groupes = this.groupes();
    const resultat: EntreeMenu[] = [];
    this.items().forEach((item, index) => {
      const groupe = groupes.find((g) => g.id === item.groupe);
      if (!groupe) {
        resultat.push({ type: 'lien', item, index });
      } else if (!resultat.some((e) => e.type === 'groupe' && e.groupe.id === groupe.id)) {
        resultat.push({ type: 'groupe', groupe, enfants: this.items().filter((i) => i.groupe === groupe.id), index });
      }
    });
    return resultat;
  });

  constructor() {
    effect(() => {
      if (!this.modeCarte()) {
        this.menuCarteOuvert.set(false);
        this.annulerFermetureMenuCarte();
      }
    });
    inject(DestroyRef).onDestroy(() => this.annulerFermetureMenuCarte());
  }

  /** Un groupe est ouvert quand l'écran courant en fait partie, sauf si l'utilisateur l'a replié ou déplié lui-même depuis. */
  protected groupeOuvert(groupe: ShellNavGroupe, enfants: readonly ShellNavItem[]): boolean {
    const choix = this.groupesRepliesParUtilisateur().get(groupe.id);
    if (choix !== undefined) return choix;
    const url = this.urlCourante();
    return enfants.some((e) => url === e.route || url.startsWith(`${e.route}/`));
  }

  protected changerGroupe(groupe: ShellNavGroupe, evenement: Event): void {
    const ouvert = (evenement.currentTarget as HTMLDetailsElement).open;
    this.groupesRepliesParUtilisateur.update((m) => new Map(m).set(groupe.id, ouvert));
  }

  protected basculerMenu(): void {
    this.menuOuvert.update((ouvert) => !ouvert);
  }

  protected fermerMenu(): void {
    this.menuOuvert.set(false);
    this.menuCarteOuvert.set(false);
  }

  /** Lien d'évitement : le focus passe au contenu (un `href="#…"` suivrait la balise `<base>` et rechargerait l'accueil). */
  protected allerAuContenu(evenement: Event): void {
    evenement.preventDefault();
    const lien = evenement.currentTarget as HTMLElement | null;
    lien?.closest('.app-shell')?.querySelector<HTMLElement>('main#contenu')?.focus();
  }

  protected ouvrirMenuCarteAuSurvol(evenement: PointerEvent): void {
    if (evenement.pointerType === 'mouse') this.ouvrirMenuCarte();
  }

  protected cliquerMenuCarte(): void {
    const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
    if (fenetre?.matchMedia('(hover: hover)').matches) this.ouvrirMenuCarte();
    else this.menuCarteOuvert.update((ouvert) => !ouvert);
  }

  protected reporterFermetureMenuCarteAuPointeur(evenement: PointerEvent): void {
    if (evenement.pointerType === 'mouse') this.reporterFermetureMenuCarte();
  }

  protected ouvrirMenuCarte(): void {
    if (!this.modeCarte()) return;
    this.annulerFermetureMenuCarte();
    this.menuCarteOuvert.set(true);
  }

  protected reporterFermetureMenuCarte(): void {
    if (!this.modeCarte()) return;
    const fenetre = this.hote.nativeElement.ownerDocument.defaultView;
    if (!fenetre) return;
    this.annulerFermetureMenuCarte();
    this.fermetureMenuCarte = fenetre.setTimeout(() => {
      const racine = this.hote.nativeElement;
      const bouton = racine.querySelector('.app-carte-menu');
      const rail = racine.querySelector('.app-sidebar');
      const pointeurDansZone = bouton?.matches(':hover') || rail?.matches(':hover');
      const focusDansZone = bouton?.matches(':focus-visible') || rail?.matches(':focus-within');
      if (!pointeurDansZone && !focusDansZone) this.menuCarteOuvert.set(false);
      this.fermetureMenuCarte = undefined;
    }, 140);
  }

  private annulerFermetureMenuCarte(): void {
    if (this.fermetureMenuCarte === undefined) return;
    this.hote.nativeElement.ownerDocument.defaultView?.clearTimeout(this.fermetureMenuCarte);
    this.fermetureMenuCarte = undefined;
  }
}
