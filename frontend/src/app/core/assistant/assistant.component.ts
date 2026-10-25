import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideArrowUpRight,
  LucideChevronDown,
  LucideMinus,
  LucidePlus,
  LucideShieldCheck,
  LucideSquare,
  LucideTriangleAlert
} from '@lucide/angular';

import { AssistantService, type Echange, type Humeur } from './assistant.service';

const LIBELLES_HUMEUR: Readonly<Record<Humeur, string>> = {
  neutral: 'Prêt',
  attentive: 'À l’écoute',
  thinking: 'Réfléchit…',
  searching: 'Cherche dans les données…',
  found: 'Trouvé',
  asking: 'Attend votre accord',
  apologetic: 'Désolé'
};

const SUGGESTIONS = [
  'Quelle est la masse salariale du dernier mois de paie ?',
  'Combien d’employés sont en poste ?',
  'Combien d’entrées la paie du dernier mois constate-t-elle ?'
];

/**
 * Assistant RH immersif (docs/ia.md, T8) : barre de commande (`Ctrl K`) au repos, fil de discussion ancré à droite dès la
 * première question. Chaque réponse montre ses étapes et ses outils dans un bloc repliable, le texte vérifié, les chiffres
 * cités, puis la vue que l'assistant a ouverte lui-même, avec retour à l'écran précédent.
 */
@Component({
  selector: 'app-assistant',
  imports: [
    NgTemplateOutlet,
    LucideArrowLeft,
    LucideArrowRight,
    LucideArrowUpRight,
    LucideChevronDown,
    LucideMinus,
    LucidePlus,
    LucideShieldCheck,
    LucideSquare,
    LucideTriangleAlert
  ],
  templateUrl: './assistant.component.html',
  styleUrl: './assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'raccourci($event)' }
})
export class AssistantComponent {
  private readonly assistant = inject(AssistantService);
  private readonly champ = viewChild<ElementRef<HTMLTextAreaElement>>('champ');
  private readonly fil = viewChild<ElementRef<HTMLElement>>('fil');

  readonly echanges = this.assistant.echanges;
  readonly enCours = this.assistant.enCours;
  readonly humeur = this.assistant.humeur;
  readonly libelleHumeur = computed(() => LIBELLES_HUMEUR[this.humeur()]);
  readonly suggestions = SUGGESTIONS;

  readonly question = signal('');
  readonly reduit = signal(false);
  /** Blocs d'étapes ouverts à la main ; un échange en cours est toujours déplié. */
  readonly etapesOuvertes = signal<ReadonlySet<string>>(new Set());
  readonly panneau = computed(() => this.echanges().length > 0 && !this.reduit());
  readonly erreurSaisie = signal('');

  constructor() {
    // Le fil suit la réponse en cours d'écriture.
    effect(() => {
      this.echanges();
      untracked(() => queueMicrotask(() => this.fil()?.nativeElement.scrollTo({ top: 1e9, behavior: 'smooth' })));
    });
  }

  envoyer(): void {
    const texte = this.question().trim();
    if (!texte) {
      this.erreurSaisie.set('Saisissez une question.');
      this.champ()?.nativeElement.focus();
      return;
    }
    if (texte.length > 2000) {
      this.erreurSaisie.set('La question dépasse 2 000 caractères.');
      return;
    }
    this.erreurSaisie.set('');
    this.question.set('');
    this.reduit.set(false);
    void this.assistant.demander(texte);
  }

  suggerer(texte: string): void {
    this.question.set(texte);
    this.envoyer();
  }

  touche(evenement: KeyboardEvent): void {
    if (evenement.key === 'Enter' && !evenement.shiftKey) {
      evenement.preventDefault();
      if (this.enCours()) {
        return;
      }
      this.envoyer();
    }
  }

  saisir(valeur: string): void {
    this.question.set(valeur);
    if (this.erreurSaisie()) {
      this.erreurSaisie.set('');
    }
  }

  arreter(): void {
    this.assistant.arreter();
  }

  revenir(echange: Echange): void {
    void this.assistant.revenir(echange);
  }

  rouvrir(echange: Echange): void {
    void this.assistant.rouvrir(echange);
  }

  nouvelleDiscussion(): void {
    this.assistant.nouvelleDiscussion();
    this.etapesOuvertes.set(new Set());
    queueMicrotask(() => this.champ()?.nativeElement.focus());
  }

  reduire(): void {
    this.reduit.set(true);
  }

  etapesVisibles(echange: Echange): boolean {
    return echange.etat === 'encours' || this.etapesOuvertes().has(echange.id);
  }

  basculerEtapes(echange: Echange): void {
    this.etapesOuvertes.update((ouverts) => {
      const copie = new Set(ouverts);
      if (copie.has(echange.id)) {
        copie.delete(echange.id);
      } else {
        copie.add(echange.id);
      }
      return copie;
    });
  }

  resumeEtapes(echange: Echange): string {
    if (echange.etat === 'encours') {
      return echange.etapes.at(-1)?.libelle ?? 'Démarrage…';
    }
    const outils = echange.outils.length;
    return `${echange.etapes.length} étapes · ${outils} ${outils > 1 ? 'outils' : 'outil'}`;
  }

  chiffre(valeur: string): string {
    const nombre = Number(valeur);
    return Number.isFinite(nombre) ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(nombre) : valeur;
  }

  /** `Ctrl K` (ou `⌘ K`) ouvre l'assistant depuis n'importe quel écran ; `Échap` le réduit. */
  raccourci(evenement: KeyboardEvent): void {
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
      evenement.preventDefault();
      this.reduit.set(false);
      queueMicrotask(() => this.champ()?.nativeElement.focus());
    } else if (evenement.key === 'Escape' && this.panneau()) {
      this.reduit.set(true);
    }
  }
}
