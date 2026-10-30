import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { finalize } from 'rxjs';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { HeuresSuppCreationEmploye, HeuresSuppImportAnalyse, HeuresSuppImportForfait, HeuresSuppImportResult } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';

type DonneeCreation = Omit<HeuresSuppCreationEmploye, 'numeroLigne'>;
type BrouillonCreation = Omit<DonneeCreation, 'typeSalaire'> & { typeSalaire: '' | DonneeCreation['typeSalaire'] };
const VIDE: BrouillonCreation = { dateNaissance: '', dateEmbauche: '', fonctionId: 0, salaire: Number.NaN, typeSalaire: '' };

@Component({
  selector: 'app-heures-supp-import',
  imports: [DecimalPipe, ButtonComponent, MessageComponent, MonthInputComponent, LazySelectComponent, RouterLink, DialogComponent],
  templateUrl: './heures-supp-import.component.html',
  styleUrl: './heures-supp-import.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppImportComponent {
  protected readonly chantiers = inject(ChantierReferenceService);
  protected readonly fonctions = inject(FunctionReferenceService);
  protected readonly etape = signal(1);
  protected readonly mois = signal<Date | null>(null);
  protected readonly chantierId = signal<number | null>(null);
  protected readonly chantierLibelle = signal('');
  protected readonly fichier = signal<File | null>(null);
  protected readonly texteForfaits = signal('');
  protected readonly analyse = signal<HeuresSuppImportAnalyse | null>(null);
  protected readonly resultat = signal<HeuresSuppImportResult | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly chargement = signal(false);
  protected readonly telechargementModele = signal(false);
  protected readonly peutRemplacer = computed(() => {
    const erreurs = this.analyse()?.erreurs ?? [];
    return erreurs.length > 0 && erreurs.every((message) => message.includes('existe déjà'));
  });
  private readonly creations = signal<Record<number, BrouillonCreation>>({});
  private readonly alignements = signal<number[]>([]);
  private readonly service = inject(HeuresSuppService);
  private readonly confirmation = inject(ConfirmDialogService);
  protected readonly periode = computed(() => { const d = this.mois(); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : ''; });

  protected choisirChantier(value: unknown): void { this.chantierId.set(typeof value === 'number' ? value : null); }
  protected choisirFonction(numero: number, value: unknown): void { this.modifierCreation(numero, 'fonctionId', typeof value === 'number' ? value : 0); }
  protected telechargerModele(): void {
    if (this.telechargementModele()) return;
    this.telechargementModele.set(true);
    this.service.telechargerModele().pipe(finalize(() => this.telechargementModele.set(false))).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Heures_Supplementaires.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.erreur.set('Le modèle Excel n’a pas pu être téléchargé. Réessayez.')
    });
  }
  protected inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected nombreValue(event: Event): number { return Number(this.inputValue(event)); }
  protected choisirFichier(event: Event): void { this.fichier.set((event.target as HTMLInputElement).files?.[0] ?? null); this.analyse.set(null); }
  protected creation(numero: number): BrouillonCreation { return this.creations()[numero] ?? VIDE; }
  protected valeurSalaire(numero: number): string { const valeur = this.creation(numero).salaire; return Number.isFinite(valeur) ? String(valeur) : ''; }
  protected modifierCreation<K extends keyof BrouillonCreation>(numero: number, cle: K, valeur: BrouillonCreation[K] | string): void {
    this.creations.update((actuel) => ({ ...actuel, [numero]: { ...(actuel[numero] ?? VIDE), [cle]: valeur } as BrouillonCreation }));
  }
  protected estAligne(id: number): boolean { return this.alignements().includes(id); }
  protected basculerAlignement(id: number): void { this.alignements.update((ids) => ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]); }

  protected verifierContexte(): void {
    const chantierId = this.chantierId(); if (!this.periode() || !chantierId) return;
    this.lancer(this.service.verifierPrerequis(this.periode(), chantierId), (prerequis) => {
      if (!prerequis.pret) { this.erreur.set(prerequis.message ?? 'La paie de ce mois est absente.'); return; }
      this.chantiers.fetchById(chantierId).subscribe((chantier: ChantierReference) => this.chantierLibelle.set(`${chantier.code} · ${chantier.nom ?? chantier.designation}`));
      this.etape.set(2);
    });
  }
  protected analyser(): void {
    const file = this.fichier(); const id = this.chantierId(); if (!file || !id) return;
    const forfaits = this.lireForfaits(); if (!forfaits) return;
    this.lancer(this.service.analyserImport(file, this.periode(), id, forfaits), (analyse) => { this.analyse.set(analyse); this.etape.set(3); });
  }
  protected corriger(): void {
    const file = this.fichier(); const id = this.chantierId(); const analyse = this.analyse(); if (!file || !id || !analyse) return;
    const forfaits = this.lireForfaits(); if (!forfaits) return;
    for (const ligne of analyse.lignes.filter((l) => l.employeId === null)) {
      const c = this.creation(ligne.numeroLigne);
      if (!c.dateNaissance || !c.dateEmbauche || !c.fonctionId || !Number.isFinite(c.salaire) || c.salaire < 0 || !c.typeSalaire) { this.erreur.set('Complétez les dates, la fonction, le salaire et le type de salaire de chaque nouvel employé.'); return; }
    }
    const creer: HeuresSuppCreationEmploye[] = analyse.lignes.filter((l) => l.employeId === null).map((l) => ({ numeroLigne: l.numeroLigne, ...this.creation(l.numeroLigne), typeSalaire: this.creation(l.numeroLigne).typeSalaire as DonneeCreation['typeSalaire'] }));
    const corrections = { aligner: this.alignements().map((employeId) => ({ employeId })), creer };
    this.lancer(this.service.corrigerImport(file, this.periode(), id, corrections, forfaits), (nouvelleAnalyse) => this.analyse.set(nouvelleAnalyse));
  }
  protected importer(): void {
    const file = this.fichier(); const id = this.chantierId(); const analyse = this.analyse(); if (!file || !id || !analyse?.pret) return;
    const forfaits = this.lireForfaits(); if (!forfaits) return;
    this.lancer(this.service.importer(file, this.periode(), id, forfaits), (resultat) => this.resultat.set(resultat));
  }
  protected demanderRemplacement(): void {
    this.confirmation.confirm({
      header: 'Remplacer les heures déjà importées ?',
      message: `Les lignes existantes du chantier ${this.chantierLibelle()} pour ${this.periode()} seront remplacées par ce classeur. Cette action est enregistrée dans le journal d’audit.`,
      acceptLabel: 'Remplacer', rejectLabel: 'Annuler', accept: () => this.remplacer()
    });
  }
  private remplacer(): void {
    const file = this.fichier(); const id = this.chantierId();
    if (!file || !id) return;
    const forfaits = this.lireForfaits(); if (!forfaits) return;
    this.lancer(this.service.remplacer(file, this.periode(), id, forfaits), (resultat) => this.resultat.set(resultat));
  }

  private lireForfaits(): HeuresSuppImportForfait[] | null {
    try {
      return this.texteForfaits().split(/\r?\n/).map((ligne) => ligne.trim()).filter(Boolean).map((ligne) => {
        const [cin, montant] = ligne.split(/[;\t]/).map((valeur) => valeur.trim());
        if (!cin || montant === undefined || !Number.isFinite(Number(montant.replace(',', '.')))) throw new Error('Forfait invalide. Utilisez une ligne CIN;montant, par exemple CIN123;500.');
        return { cin, montantDh: Number(montant.replace(',', '.')) };
      });
    } catch (e) { this.erreur.set(e instanceof Error ? e.message : 'Forfait invalide.'); return null; }
  }
  private lancer<T>(source: import('rxjs').Observable<T>, succes: (valeur: T) => void): void {
    this.erreur.set(null); this.chargement.set(true);
    source.subscribe({ next: (valeur) => { this.chargement.set(false); succes(valeur); }, error: (e: { error?: { message?: string }; message?: string }) => { this.chargement.set(false); this.erreur.set(e.error?.message ?? e.message ?? 'L’opération a échoué. Réessayez.'); } });
  }
}
