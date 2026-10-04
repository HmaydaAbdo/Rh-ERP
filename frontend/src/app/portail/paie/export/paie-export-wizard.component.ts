import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { finalize } from 'rxjs';

import { MonthPickerComponent } from '../../../shared/components/month-picker/month-picker.component';
import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import {
  PaieChantierPeriode,
  PaieExportRequest,
  PaieMaterielTableau,
  PaiePeriodeResume,
  PaieRapportPdfRequest
} from '../models/paie.model';
import { formaterMontant, libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';

type Format = 'PDF' | 'EXCEL';
type EtapeId = 'periode' | 'format' | 'equipes' | 'materiel' | 'recap';
type Etat = 'saisie' | 'generation' | 'termine';

const LIBELLES_ETAPES: Record<EtapeId, string> = {
  periode: 'Mois',
  format: 'Format',
  equipes: 'Équipes',
  materiel: 'Matériel',
  recap: 'Export'
};
const SOUS_TITRES: Record<EtapeId, string> = {
  periode: 'Choisissez le mois à exporter',
  format: 'Choisissez le format du fichier',
  equipes: 'Étape facultative',
  materiel: 'Nombre de camions et d\'engins du chantier',
  recap: 'Dernière vérification'
};
const NOMBRE_MAX_MATERIEL = 999;
/** Dernière saisie du parc matériel, gardée dans le navigateur pour préremplir l'export suivant (jamais en base). */
const CLE_MATERIEL_MEMORISE = 'paie.export.materiel';

/**
 * Assistant d'export de la paie — PDF ou Excel — en étapes guidées : mois (contrôlé dès le choix), format, équipes à
 * détailler (facultatif), parc matériel (seulement si un tableau matériel sera imprimé) puis récapitulatif et
 * génération. Une seule sélection d'équipes sert les deux formats (voir docs/report/README.md, « Export unifié
 * PDF/Excel ») ; l'exclusion de la feuille du chantier ne concerne que l'Excel.
 */
@Component({
  selector: 'app-paie-export-wizard',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, MonthPickerComponent, CountUpDirective],
  templateUrl: './paie-export-wizard.component.html',
  styleUrl: './paie-export-wizard.component.scss'
})
export class PaieExportWizardComponent implements OnChanges {
  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(MessageService);

  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  readonly etape = signal<EtapeId>('periode');
  readonly sens = signal<'avant' | 'arriere'>('avant');
  readonly etat = signal<Etat>('saisie');
  readonly erreur = signal<string | null>(null);

  readonly periodes = signal<PaiePeriodeResume[]>([]);
  readonly periodesEnCours = signal(false);
  readonly periode = signal<string | null>(null);
  readonly format = signal<Format>('PDF');

  readonly chantiers = signal<PaieChantierPeriode[]>([]);
  readonly chantiersEnCours = signal(false);
  readonly recherche = signal('');
  /** Chantiers dont la liste d'équipes est dépliée (simple état d'affichage). */
  readonly ouverts = signal<string[]>([]);
  /** Chantier -> codes des équipes à détailler (liste vide ou absente : aucune équipe détaillée). */
  readonly detail = signal<Record<string, string[]>>({});
  /** Chantier -> codes des équipes retirées de la feuille du chantier (Excel uniquement). */
  readonly retirees = signal<Record<string, string[]>>({});

  readonly tableauxMateriel = signal<PaieMaterielTableau[]>([]);
  /** Libellé de la ligne -> nombre saisi, ou `null` (non renseigné : la colonne reste vide à l'impression). */
  readonly nombres = signal<Record<string, number | null>>({});
  /** Titre du tableau -> la colonne « Nbre » reste vide (à remplir au stylo). */
  readonly laisseVide = signal<Record<string, boolean>>({});

  readonly resume = computed(() => this.periodes().find((p) => p.periode === this.periode()) ?? null);
  readonly disponibles = computed(() => this.periodes().map((p) => p.periode));
  readonly dernierEnregistre = signal<{ blob: Blob; nom: string } | null>(null);

  /** Tableaux matériel qui seront réellement imprimés : leur chantier est détaillé avec l'équipe qui les porte. */
  readonly tableauxConcernes = computed(() =>
    this.tableauxMateriel().filter((t) => this.detail()[t.chantierCode]?.includes(t.equipeCode))
  );

  readonly etapes = computed<EtapeId[]>(() => {
    const ids: EtapeId[] = ['periode', 'format', 'equipes'];
    if (this.tableauxConcernes().length > 0) {
      ids.push('materiel');
    }
    ids.push('recap');
    return ids;
  });
  readonly indexEtape = computed(() => this.etapes().indexOf(this.etape()));

  readonly chantiersFiltres = computed(() => {
    const terme = this.recherche().trim().toLowerCase();
    return this.chantiers().filter(
      (c) => !terme || c.code.toLowerCase().includes(terme) || (c.libelle ?? '').toLowerCase().includes(terme)
    );
  });

  readonly nomFichier = computed(() => {
    const periode = this.periode() ?? '';
    return this.format() === 'PDF' ? `Paie_Rapport_BI_${periode}.pdf` : `Paie_Export_${periode}.xlsx`;
  });

  readonly libelleEtapes = LIBELLES_ETAPES;
  readonly nombreMax = NOMBRE_MAX_MATERIEL;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.ouvrir();
    }
  }

  setVisible(valeur: boolean): void {
    if (!valeur && this.etat() === 'generation') {
      return;
    }
    this.visible = valeur;
    this.visibleChange.emit(valeur);
  }

  sousTitre(): string {
    return this.etat() === 'termine' ? 'Téléchargement lancé' : SOUS_TITRES[this.etape()];
  }

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;

  /** Un nouveau mois invalide tout ce qui dépend du précédent (chantiers chargés, équipes choisies). */
  choisirPeriode(periode: string): void {
    this.periode.set(periode);
    this.erreur.set(null);
    this.chantiers.set([]);
    this.ouverts.set([]);
    this.detail.set({});
    this.retirees.set({});
  }

  choisirFormat(format: Format): void {
    this.format.set(format);
  }

  // ---- Navigation ----

  suivant(): void {
    if (this.etat() === 'generation') {
      return;
    }
    const courante = this.etape();
    if (courante === 'periode') {
      if (!this.resume()) {
        this.erreur.set('Choisissez un mois qui contient des bulletins.');
        return;
      }
      this.chargerChantiers();
    }
    if (courante === 'materiel' && !this.materielValide()) {
      return;
    }
    if (courante === 'recap') {
      this.generer();
      return;
    }
    this.aller(this.etapes()[this.indexEtape() + 1], 'avant');
  }

  precedent(): void {
    if (this.etat() === 'saisie' && this.indexEtape() > 0) {
      this.aller(this.etapes()[this.indexEtape() - 1], 'arriere');
    }
  }

  allerA(id: EtapeId): void {
    if (this.etat() === 'saisie' && this.etapes().indexOf(id) < this.indexEtape()) {
      this.aller(id, 'arriere');
    }
  }

  private aller(id: EtapeId, sens: 'avant' | 'arriere'): void {
    this.erreur.set(null);
    this.sens.set(sens);
    this.etape.set(id);
  }

  // ---- Étape équipes ----

  rechercher(valeur: string): void {
    this.recherche.set(valeur);
  }

  /** Un chantier est « détaillé » dès qu'au moins une de ses équipes est cochée. */
  estDetaille(code: string): boolean {
    return this.equipesChoisies(code).length > 0;
  }

  estOuvert(code: string): boolean {
    return this.ouverts().includes(code);
  }

  /** Déplie ou replie la liste des équipes d'un chantier. Tous les chantiers figurent de toute façon dans l'export :
   * ouvrir un chantier ne sert qu'à en choisir les équipes. Un chantier sans équipe ne se déplie pas. */
  basculerOuverture(chantier: PaieChantierPeriode): void {
    if (chantier.equipes.length === 0) {
      return;
    }
    this.ouverts.set(
      this.estOuvert(chantier.code) ? this.ouverts().filter((c) => c !== chantier.code) : [...this.ouverts(), chantier.code]
    );
  }

  equipesChoisies(code: string): string[] {
    return this.detail()[code] ?? [];
  }

  basculerEquipe(code: string, equipe: string): void {
    const choisies = this.equipesChoisies(code);
    const suivantes = choisies.includes(equipe) ? choisies.filter((e) => e !== equipe) : [...choisies, equipe];
    this.detail.set({ ...this.detail(), [code]: suivantes });
    if (!suivantes.includes(equipe)) {
      this.retirerDeLaListeRetiree(code, equipe);
    }
  }

  toutesLesEquipes(chantier: PaieChantierPeriode, toutes: boolean): void {
    this.detail.set({ ...this.detail(), [chantier.code]: toutes ? chantier.equipes.map((e) => e.code) : [] });
    if (!toutes) {
      this.retirees.set({ ...this.retirees(), [chantier.code]: [] });
    }
  }

  estRetiree(code: string, equipe: string): boolean {
    return this.retirees()[code]?.includes(equipe) ?? false;
  }

  basculerRetrait(code: string, equipe: string): void {
    const actuelles = this.retirees()[code] ?? [];
    const suivantes = actuelles.includes(equipe) ? actuelles.filter((e) => e !== equipe) : [...actuelles, equipe];
    this.retirees.set({ ...this.retirees(), [code]: suivantes });
  }

  private retirerDeLaListeRetiree(code: string, equipe: string): void {
    this.retirees.set({ ...this.retirees(), [code]: (this.retirees()[code] ?? []).filter((e) => e !== equipe) });
  }

  texteDetail(): string {
    const parties = this.chantiers()
      .filter((c) => this.equipesChoisies(c.code).length > 0)
      .map((c) => {
        const n = this.equipesChoisies(c.code).length;
        return `${c.code} (${n} équipe${n > 1 ? 's' : ''})`;
      });
    return parties.length > 0 ? parties.join(', ') : 'Aucun, une section par chantier';
  }

  // ---- Étape matériel ----

  nombre(libelle: string): number | null {
    return this.nombres()[libelle] ?? null;
  }

  estVide(tableau: PaieMaterielTableau): boolean {
    return this.laisseVide()[tableau.titre] ?? false;
  }

  basculerVide(tableau: PaieMaterielTableau): void {
    this.laisseVide.set({ ...this.laisseVide(), [tableau.titre]: !this.estVide(tableau) });
  }

  saisirNombre(libelle: string, brut: string): void {
    this.erreur.set(null);
    if (brut.trim() === '') {
      this.nombres.set({ ...this.nombres(), [libelle]: null });
      return;
    }
    const valeur = Number(brut);
    if (!Number.isInteger(valeur) || valeur < 0 || valeur > NOMBRE_MAX_MATERIEL) {
      this.erreur.set(`Saisissez un nombre entier entre 0 et ${NOMBRE_MAX_MATERIEL}.`);
      return;
    }
    this.nombres.set({ ...this.nombres(), [libelle]: valeur });
  }

  ajuster(libelle: string, delta: number): void {
    const courant = this.nombre(libelle);
    const base = courant === null && delta < 0 ? 0 : (courant ?? 0) + delta;
    this.nombres.set({ ...this.nombres(), [libelle]: Math.max(0, Math.min(NOMBRE_MAX_MATERIEL, base)) });
    this.erreur.set(null);
  }

  /** Entrée dans un champ de nombre : passe au champ suivant, puis au bouton « Continuer » après le dernier. */
  entreeSuivante(evenement: Event): void {
    evenement.preventDefault();
    const champs = Array.from(document.querySelectorAll<HTMLInputElement>('.export-wizard__materiel-champ'));
    const suivant = champs[champs.indexOf(evenement.target as HTMLInputElement) + 1];
    if (suivant) {
      suivant.focus();
    } else {
      document.querySelector<HTMLButtonElement>('.export-wizard__pied button:last-child')?.focus();
    }
  }

  mettreZeroAuxVides(tableau: PaieMaterielTableau): void {
    const nombres = { ...this.nombres() };
    tableau.libelles.forEach((libelle) => {
      if (nombres[libelle] === null || nombres[libelle] === undefined) {
        nombres[libelle] = 0;
      }
    });
    this.nombres.set(nombres);
  }

  renseignees(tableau: PaieMaterielTableau): number {
    return tableau.libelles.filter((l) => this.nombre(l) !== null).length;
  }

  total(tableau: PaieMaterielTableau): number {
    return tableau.libelles.reduce((somme, l) => somme + (this.nombre(l) ?? 0), 0);
  }

  texteMateriel(tableau: PaieMaterielTableau): string {
    if (this.estVide(tableau)) {
      return 'Colonne laissée vide, à remplir au stylo';
    }
    const n = this.renseignees(tableau);
    return `${n} ligne${n > 1 ? 's' : ''} renseignée${n > 1 ? 's' : ''} sur ${tableau.libelles.length} · total ${this.total(tableau)}`;
  }

  /** Refuse de continuer tant qu'un champ contient une valeur invalide (le message est déjà affiché). */
  private materielValide(): boolean {
    return this.erreur() === null;
  }

  // ---- Génération ----

  private generer(): void {
    const periode = this.periode();
    if (!periode) {
      return;
    }
    this.etat.set('generation');
    const equipesParChantier = this.construireEquipesParChantier();
    const materiel = this.construireMateriel();
    const nom = this.nomFichier();
    const requete$ =
      this.format() === 'EXCEL'
        ? this.paieService.exporter(this.requeteExcel(periode, equipesParChantier, materiel))
        : this.paieService.telechargerRapportPdf(this.requetePdf(periode, equipesParChantier, materiel));

    requete$
      .pipe(
        finalize(() => {
          if (this.etat() === 'generation') {
            this.etat.set('saisie');
          }
        })
      )
      .subscribe({
        next: (blob) => {
          this.memoriserMateriel();
          this.dernierEnregistre.set({ blob, nom });
          this.telecharger(blob, nom);
          this.etat.set('termine');
        },
        error: (err: HttpErrorResponse) => void this.afficherErreur(err)
      });
  }

  retelecharger(): void {
    const fichier = this.dernierEnregistre();
    if (fichier) {
      this.telecharger(fichier.blob, fichier.nom);
    }
  }

  nouvelExport(): void {
    this.ouvrir();
  }

  private construireEquipesParChantier(): Record<string, string[]> {
    return Object.fromEntries(Object.entries(this.detail()).filter(([, equipes]) => equipes.length > 0));
  }

  /** Lignes à envoyer : celles des tableaux imprimés dont la colonne n'est pas laissée vide et dont le nombre est renseigné. */
  private construireMateriel(): Record<string, number> | null {
    const materiel: Record<string, number> = {};
    for (const tableau of this.tableauxConcernes()) {
      if (this.estVide(tableau)) {
        continue;
      }
      for (const libelle of tableau.libelles) {
        const valeur = this.nombre(libelle);
        if (valeur !== null) {
          materiel[libelle] = valeur;
        }
      }
    }
    return Object.keys(materiel).length > 0 ? materiel : null;
  }

  private requeteExcel(periode: string, equipesParChantier: Record<string, string[]>, materiel: Record<string, number> | null): PaieExportRequest {
    const exclues: Record<string, string[]> = {};
    for (const [code, equipes] of Object.entries(equipesParChantier)) {
      const retirees = equipes.filter((e) => this.estRetiree(code, e));
      if (retirees.length > 0) {
        exclues[code] = retirees;
      }
    }
    const avecDetail = Object.keys(equipesParChantier).length > 0;
    return {
      periode,
      feuillesEquipeMode: avecDetail ? 'PERSONNALISE' : 'AUCUNE',
      equipesParChantier: avecDetail ? equipesParChantier : null,
      equipesExcluesFeuilleChantier: Object.keys(exclues).length > 0 ? exclues : null,
      chantiers: null,
      materiel
    };
  }

  private requetePdf(periode: string, equipesParChantier: Record<string, string[]>, materiel: Record<string, number> | null): PaieRapportPdfRequest {
    return {
      periode,
      equipesParChantier: Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null,
      materiel
    };
  }

  private telecharger(blob: Blob, nomFichier: string): void {
    const url = window.URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    window.URL.revokeObjectURL(url);
  }

  /** Avec responseType 'blob', le corps d'erreur JSON du backend arrive lui aussi en Blob : on le relit pour afficher
   * son message — l'intercepteur global ne peut pas le faire, il ne voit qu'un Blob opaque sur cette requête. */
  private async afficherErreur(err: HttpErrorResponse): Promise<void> {
    let detail = 'L\'export n\'a pas pu être généré.';
    if (err.error instanceof Blob) {
      try {
        const corps = JSON.parse(await err.error.text()) as { message?: string };
        if (corps.message) {
          detail = corps.message;
        }
      } catch {
        // corps non JSON : on garde le message générique
      }
    }
    this.messageService.add({ severity: 'error', summary: 'Export paie', detail, life: 8000 });
  }

  // ---- Chargements et état initial ----

  private ouvrir(): void {
    this.etape.set('periode');
    this.sens.set('avant');
    this.etat.set('saisie');
    this.erreur.set(null);
    this.periode.set(null);
    this.format.set('PDF');
    this.chantiers.set([]);
    this.recherche.set('');
    this.ouverts.set([]);
    this.detail.set({});
    this.retirees.set({});
    this.laisseVide.set({});
    this.nombres.set(this.lireMaterielMemorise());
    this.dernierEnregistre.set(null);
    this.chargerPeriodes();
    this.chargerTableauxMateriel();
  }

  private chargerPeriodes(): void {
    this.periodesEnCours.set(true);
    this.paieService
      .listerPeriodes()
      .pipe(finalize(() => this.periodesEnCours.set(false)))
      .subscribe((periodes) => {
        this.periodes.set(periodes);
        if (periodes.length > 0) {
          this.choisirPeriode(periodes[0].periode);
        }
      });
  }

  private chargerTableauxMateriel(): void {
    this.paieService.listerTableauxMateriel().subscribe((tableaux) => this.tableauxMateriel.set(tableaux));
  }

  private chargerChantiers(): void {
    const periode = this.periode();
    if (!periode || this.chantiers().length > 0) {
      return;
    }
    this.chantiersEnCours.set(true);
    this.paieService
      .listerChantiersDeLaPeriode(periode)
      .pipe(finalize(() => this.chantiersEnCours.set(false)))
      .subscribe((chantiers) => this.chantiers.set(chantiers));
  }

  private lireMaterielMemorise(): Record<string, number | null> {
    try {
      const brut = localStorage.getItem(CLE_MATERIEL_MEMORISE);
      return brut ? (JSON.parse(brut) as Record<string, number | null>) : {};
    } catch {
      return {};
    }
  }

  private memoriserMateriel(): void {
    try {
      localStorage.setItem(CLE_MATERIEL_MEMORISE, JSON.stringify(this.nombres()));
    } catch {
      // stockage indisponible : sans conséquence, le préremplissage est un simple confort
    }
  }
}
