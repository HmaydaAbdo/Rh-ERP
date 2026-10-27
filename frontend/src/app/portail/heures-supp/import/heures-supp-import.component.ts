import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { finalize } from 'rxjs';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { HeuresSuppCreationEmploye, HeuresSuppImportAnalyse, HeuresSuppImportForfait, HeuresSuppImportResult } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';

type DonneeCreation = Omit<HeuresSuppCreationEmploye, 'numeroLigne'>;
type BrouillonCreation = Omit<DonneeCreation, 'typeSalaire'> & { typeSalaire: '' | DonneeCreation['typeSalaire'] };
const VIDE: BrouillonCreation = { dateNaissance: '', dateEmbauche: '', salaire: Number.NaN, typeSalaire: '' };

@Component({
  selector: 'app-heures-supp-import',
  imports: [DecimalPipe, ButtonComponent, MessageComponent, MonthInputComponent, LazySelectComponent, RouterLink],
  template: `
    <main class="hs-import">
      <header class="hs-import__header">
        <a stp-button variant="text" icon="arrow-left" routerLink="/heures-supp">Retour</a>
        <div><p class="hs-import__eyebrow">ASSISTANT DE SAISIE</p><h1>Importer les heures supplémentaires</h1><p>Un chantier et un mois par import. La paie doit exister avant de poursuivre.</p></div>
      </header>
      <ol class="hs-import__steps" aria-label="Étapes de l’import">
        <li [class.active]="etape() === 1" [attr.aria-current]="etape() === 1 ? 'step' : null"><span>01</span> Période & chantier</li>
        <li [class.active]="etape() === 2" [attr.aria-current]="etape() === 2 ? 'step' : null"><span>02</span> Fichier & forfaits</li>
        <li [class.active]="etape() === 3" [attr.aria-current]="etape() === 3 ? 'step' : null"><span>03</span> Contrôle & import</li>
      </ol>

      @if (erreur()) { <stp-message severity="error" [text]="erreur()!" /> }
      @if (resultat(); as bilan) {
        <section class="hs-import__success" role="status">
          <p class="hs-import__eyebrow">IMPORT TERMINÉ</p><h2>{{ bilan.lignesHeures }} lignes importées · {{ bilan.lignesZero }} à 0</h2>
          <p>{{ bilan.heuresTotales | number:'1.0-1' }} h · Net à payer {{ bilan.netTotalDh | number:'1.2-2' }} DH</p>
          <a stp-button variant="primary" routerLink="/heures-supp">Voir les heures supplémentaires</a>
        </section>
      } @else if (etape() === 1) {
        <section class="hs-import__panel" aria-labelledby="hs-context-title">
          <p class="hs-import__eyebrow">ÉTAPE 1 / 3</p><h2 id="hs-context-title">Choisir le mois et le chantier</h2>
          <div class="hs-import__grid">
            <label for="hs-import-periode">Mois de la paie <stp-month-input inputId="hs-import-periode" ariaLabel="Mois à importer" [value]="mois()" (valueChange)="mois.set($event)" /></label>
            <label for="hs-import-chantier">Chantier <app-lazy-select inputId="hs-import-chantier" ariaLabel="Chantier à importer" placeholder="Rechercher un chantier" optionLabel="code" dataKey="id" [source]="chantiers" [value]="chantierId()" (valueChange)="choisirChantier($event)" /></label>
          </div>
          <div class="hs-import__actions"><button stp-button variant="primary" type="button" [loading]="chargement()" [disabled]="!mois() || !chantierId()" (click)="verifierContexte()">Vérifier la paie et continuer</button></div>
        </section>
      } @else if (etape() === 2) {
        <section class="hs-import__panel" aria-labelledby="hs-file-title">
          <p class="hs-import__eyebrow">ÉTAPE 2 / 3 · {{ periode() }} · {{ chantierLibelle() }}</p><h2 id="hs-file-title">Déposer le pointage et saisir les forfaits</h2>
          <p>Excel attendu : <strong>Nom, Prenom, CIN, Funct, HS</strong>. HS peut être égal à zéro ; ces lignes sont conservées avec un montant nul. Le fichier reste contrôlé par CIN et les valeurs de l’Employé et de la Paie.</p>
          <div class="hs-import__template"><button stp-button variant="secondary" icon="file-spreadsheet" type="button" [loading]="telechargementModele()" (click)="telechargerModele()">Télécharger le modèle Excel</button><small>Commencez avec ce fichier pour respecter les colonnes et le format attendus.</small></div>
          <label class="hs-import__file">Fichier Excel (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="choisirFichier($event)" /></label>
          <label class="hs-import__forfaits">Forfaits supplémentaires — une ligne par employé, format <code>CIN;montant</code>
            <textarea rows="4" [value]="texteForfaits()" (input)="texteForfaits.set(inputValue($event))" placeholder="AB12345;500"></textarea>
            <small>Un forfait peut être ajouté même si l’employé n’a aucune ligne HS. Un forfait est refusé si le bulletin du mois est STC/sortie.</small>
          </label>
          <div class="hs-import__actions"><button stp-button variant="secondary" type="button" (click)="etape.set(1)">Retour</button><button stp-button variant="primary" type="button" [disabled]="!fichier()" [loading]="chargement()" (click)="analyser()">Analyser le fichier</button></div>
        </section>
      } @else if (analyse(); as a) {
        <section class="hs-import__panel" aria-labelledby="hs-review-title">
          <p class="hs-import__eyebrow">ÉTAPE 3 / 3 · {{ a.periode }} · {{ chantierLibelle() }}</p><h2 id="hs-review-title">Contrôler avant import</h2>
          <div class="hs-import__totals"><span>{{ a.totalLignes }} lignes lues</span><span>{{ a.lignesZero }} lignes HS = 0 conservées</span><span>{{ a.lignes.length }} employés / forfaits</span><strong>Import {{ a.pret ? 'prêt' : 'bloqué' }}</strong></div>
          @if (a.erreurs.length) { <stp-message severity="error"><p>Corrigez les éléments suivants avant l’import :</p><ul>@for (message of a.erreurs; track $index) { <li>{{ message }}</li> }</ul></stp-message> }
          @for (ligne of a.lignes; track ligne.cin) {
            @if (ligne.employeId === null) {
              <article class="hs-import__correction">
                <div><strong>{{ ligne.nomFichier }}</strong><span>{{ ligne.cin }} · {{ ligne.fonctionFichier }}</span></div>
                <p>Aucune fiche Employé : renseignez les données absentes du fichier. Le bulletin de paie du mois reste obligatoire.</p>
                <div class="hs-import__grid">
                  <label>Date de naissance<input type="date" [value]="creation(ligne.numeroLigne).dateNaissance" (input)="modifierCreation(ligne.numeroLigne, 'dateNaissance', inputValue($event))" /></label>
                  <label>Date d’embauche<input type="date" [value]="creation(ligne.numeroLigne).dateEmbauche" (input)="modifierCreation(ligne.numeroLigne, 'dateEmbauche', inputValue($event))" /></label>
                  <label>Salaire de référence (DH)<input type="number" min="0" step="0.01" [value]="valeurSalaire(ligne.numeroLigne)" (input)="modifierCreation(ligne.numeroLigne, 'salaire', nombreValue($event))" /></label>
                  <label>Type de salaire<select [value]="creation(ligne.numeroLigne).typeSalaire" (change)="modifierCreation(ligne.numeroLigne, 'typeSalaire', inputValue($event))"><option value="" disabled>Choisir un type</option><option value="JOURNALIER">Journalier</option><option value="MENSUEL">Mensuel</option></select></label>
                </div>
              </article>
            } @else if (ligne.identiteEcart || ligne.fonctionEcart) {
              <label class="hs-import__aligner"><input type="checkbox" [checked]="estAligne(ligne.employeId)" (change)="basculerAlignement(ligne.employeId)" />
                Aligner {{ ligne.cin }} depuis le fichier : {{ ligne.nomFichier }} · {{ ligne.fonctionFichier }}
              </label>
            }
          }
          <details class="hs-import__table"><summary>Voir le récapitulatif détaillé</summary>
            <div class="hs-import__overflow"><table class="app-static-table"><thead><tr><th>CIN</th><th>Employé</th><th>P/H</th><th>S/H (DH/h)</th><th>Montant</th><th>STC</th><th>Forfait</th><th>Net à payer</th></tr></thead><tbody>
              @for (ligne of a.lignes; track ligne.cin) { <tr><td>{{ ligne.cin }}</td><td>{{ ligne.nomPrenom || ligne.nomFichier }}<small>{{ ligne.fonction || ligne.fonctionFichier }}</small></td><td>{{ ligne.heuresSupplementaires === null ? 'Forfait seul' : (ligne.heuresSupplementaires | number:'1.0-1') + ' h' }}</td><td>{{ ligne.salaireHoraireDh === null ? '—' : (ligne.salaireHoraireDh | number:'1.2-2') }}</td><td>{{ ligne.montantDh | number:'1.2-2' }}</td><td>{{ ligne.stcDh | number:'1.2-2' }}</td><td>{{ ligne.forfaitDh === null ? '—' : (ligne.forfaitDh | number:'1.2-2') }}</td><td><strong>{{ ligne.netAPayerDh | number:'1.2-2' }}</strong></td></tr> }
            </tbody></table></div>
          </details>
          <div class="hs-import__actions"><button stp-button variant="secondary" type="button" (click)="etape.set(2)">Modifier le fichier / forfaits</button>
            @if (!a.pret) { <button stp-button variant="secondary" type="button" [loading]="chargement()" (click)="corriger()">Enregistrer les corrections puis réanalyser</button> }
            @if (peutRemplacer()) { <button stp-button variant="danger" type="button" [loading]="chargement()" (click)="demanderRemplacement()">Remplacer les lignes existantes</button> }
            <button stp-button variant="primary" type="button" [disabled]="!a.pret" [loading]="chargement()" (click)="importer()">Confirmer l’import</button></div>
        </section>
      }
    </main>
  `,
  styles: `
    :host{display:block;padding:clamp(1rem,3vw,2.5rem);color:var(--color-text)}
    .hs-import{max-width:1100px;margin:auto}.hs-import__header{display:flex;align-items:flex-start;gap:1rem;margin-bottom:1.5rem}.hs-import__header h1{margin:.15rem 0;font-size:clamp(1.5rem,3vw,2.25rem)}.hs-import__header p{margin:.4rem 0;color:var(--color-text-muted)}
    .hs-import__eyebrow{font-size:.72rem;letter-spacing:.12em;color:var(--color-primary);font-weight:700}.hs-import__steps{display:flex;gap:.5rem;list-style:none;padding:0;margin:1rem 0 1.5rem}.hs-import__steps li{flex:1;padding:.85rem 1rem;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text-muted)}.hs-import__steps li.active{border-color:var(--color-primary);color:var(--color-text);box-shadow:0 0 0 1px color-mix(in srgb,var(--color-primary) 25%,transparent)}.hs-import__steps span{color:var(--color-primary);font-weight:700;margin-right:.5rem}
    .hs-import__panel,.hs-import__success{border:1px solid var(--color-border);border-radius:var(--radius-xl);padding:clamp(1rem,3vw,2rem);background:var(--color-surface-alt);box-shadow:var(--shadow-md)}.hs-import__panel h2,.hs-import__success h2{margin:.2rem 0 1rem}.hs-import__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:1rem 0}.hs-import label{display:grid;gap:.45rem;font-weight:600}.hs-import input:not([type=checkbox]),.hs-import select,.hs-import textarea{width:100%;min-height:2.75rem;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:.6rem .75rem;background:var(--color-surface);color:var(--color-text)}.hs-import textarea{min-height:auto}.hs-import__file,.hs-import__forfaits{margin:1.2rem 0}.hs-import__template{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin:1rem 0}.hs-import__template small{color:var(--color-text-muted)}.hs-import__actions{display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;margin-top:1.5rem}.hs-import__totals{display:flex;gap:.75rem;flex-wrap:wrap;padding:1rem;border-radius:var(--radius-lg);background:var(--color-surface);margin:1rem 0}.hs-import__totals>*{padding:.25rem .65rem;border:1px solid var(--color-border);border-radius:99px}.hs-import__correction{padding:1rem;margin:1rem 0;border:1px solid var(--color-warning);border-radius:var(--radius-lg);background:var(--color-surface)}.hs-import__correction span,.hs-import__correction small,.hs-import__table small{display:block;color:var(--color-text-muted)}.hs-import__aligner{display:flex!important;align-items:center;padding:1rem;border:1px solid var(--color-warning);border-radius:var(--radius-lg);margin:.75rem 0}.hs-import__table{margin-top:1rem}.hs-import__overflow{overflow:auto}.hs-import__success{text-align:center;margin-top:2rem}
    @media(max-width:650px){.hs-import__steps{display:grid}.hs-import__header{flex-wrap:wrap}}
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppImportComponent {
  protected readonly chantiers = inject(ChantierReferenceService);
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
      if (!c.dateNaissance || !c.dateEmbauche || !Number.isFinite(c.salaire) || c.salaire < 0 || !c.typeSalaire) { this.erreur.set('Complétez les dates, le salaire et le type de salaire de chaque nouvel employé.'); return; }
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
