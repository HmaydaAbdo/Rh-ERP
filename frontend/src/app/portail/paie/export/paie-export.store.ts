import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { PaieChantierPeriode, PaieEquipePeriode, PaieExportRequest, PaieMaterielTableau, PaieMaterielValeur, PaiePeriodeResume, PaieRapportPdfRequest } from '../models/paie.model';
import { formaterMontant, libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';

export type Format = 'PDF' | 'EXCEL';
export type EtapeId = 'periode' | 'format' | 'chantier' | 'equipes' | 'materiel' | 'recap';
export type Etat = 'saisie' | 'generation' | 'termine';
/** Présentation d'une équipe dans son chantier : dans la liste du chantier, section (ou feuille) à part, ou réunie à d'autres (PDF). */
export type Traitement = 'liste' | 'separee' | 'reunie';
type Chargement = 'periodes' | 'chantiers' | 'materiel';
type EtatLigneMateriel = 'conserve' | 'modifie' | 'nouveau';

const OPTIONS_TRAITEMENT: Record<Format, { valeur: Traitement; libelle: string }[]> = {
  PDF: [
    { valeur: 'liste', libelle: 'Dans la liste' },
    { valeur: 'separee', libelle: 'Séparée' },
    { valeur: 'reunie', libelle: 'Réunie' }
  ],
  EXCEL: [
    { valeur: 'liste', libelle: 'Feuille du chantier' },
    { valeur: 'separee', libelle: 'Feuille à part' }
  ]
};
const REUNION_INCOMPLETE = 'Une seule équipe est réunie dans ce chantier : choisissez-en au moins deux, ou remettez-la dans la liste.';

const LIBELLES_ETAPES: Record<EtapeId, string> = {
  periode: 'Mois',
  format: 'Format',
  chantier: 'Marchés',
  equipes: 'Équipes',
  materiel: 'Matériel',
  recap: 'Export'
};
const SOUS_TITRES: Record<EtapeId, string> = {
  periode: 'Choisissez le mois à exporter',
  format: 'Choisissez le format du fichier',
  chantier: 'Choisissez un ou plusieurs marchés',
  equipes: 'Facultatif : la présentation des équipes, chantier par chantier',
  materiel: 'Nombre de camions et d\'engins du chantier',
  recap: 'Dernière vérification'
};
export const NOMBRE_MAX_MATERIEL = 999;

/**
 * État et logique de l'assistant d'export de la paie (voir `PaieExportWizardComponent`) : fourni par l'assistant, injecté
 * par lui et par chacune de ses étapes — aucune étape n'a d'état propre au-delà de son affichage. Mois, format, chantier
 * (PDF), présentation des équipes chantier par chantier, parc matériel, génération du fichier.
 */
@Injectable()
export class PaieExportStore {
  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requetes: Partial<Record<Chargement | 'memoire', Subscription>> = {};
  readonly erreursChargement = signal<Chargement[]>([]);
  readonly materielEnCours = signal(false);
  readonly chargementBloquant = computed(() => this.periodesEnCours() || this.chantiersEnCours()
    || this.materielEnCours() || this.erreursChargement().length > 0);

  readonly libelleEtapes = LIBELLES_ETAPES;
  readonly nombreMax = NOMBRE_MAX_MATERIEL;
  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;

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
  /** Codes des marchés retenus pour le PDF ; liste vide = tous les marchés. */
  readonly marchesChoisis = signal<string[]>([]);
  readonly rechercheChantier = signal('');
  /** Retire le chapitre « Vue d'ensemble » du PDF (voir `PaieReportPdfRequestDto.sansVueEnsemble`). */
  readonly sansVueEnsemble = signal(false);
  /** Chantier -> libellé d'équipe -> présentation choisie ; une équipe absente reste dans la liste du chantier. */
  readonly traitements = signal<Record<string, Record<string, Traitement>>>({});
  /** Chantier -> libellés des équipes retirées de la feuille du chantier (Excel uniquement). */
  readonly retirees = signal<Record<string, string[]>>({});
  /** Rang, dans `chantiersAvecEquipes`, du chantier affiché par l'étape équipes. */
  readonly positionChantier = signal(0);

  readonly tableauxMateriel = signal<PaieMaterielTableau[]>([]);
  /** Libellé de la ligne -> nombre saisi, ou `null` (champ vide tant que l'utilisateur ne saisit rien). */
  readonly nombres = signal<Record<string, number | null>>({});
  /** Derniers nombres mémorisés par ligne (KAN-229) : proposés par défaut, remplacés seulement par une saisie explicite. */
  readonly memoire = signal<Record<string, PaieMaterielValeur>>({});
  private readonly propose = new Set<string>();
  /** Titre du tableau -> l'utilisateur choisit de ne pas saisir de quantités pour ce tableau. */
  readonly laisseVide = signal<Record<string, boolean>>({});

  readonly resume = computed(() => this.periodes().find((p) => p.periode === this.periode()) ?? null);
  readonly disponibles = computed(() => this.periodes().map((p) => p.periode));
  readonly dernierEnregistre = signal<{ blob: Blob; nom: string } | null>(null);

  /** Tableaux matériel qui seront réellement imprimés : l'équipe qui les porte a sa section à part dans un chantier du rapport. */
  readonly tableauxConcernes = computed(() =>
    this.tableauxMateriel().filter((t) => this.chantiersPourEquipes().some((c) => c.code === t.chantierCode)
      && this.traitement(t.chantierCode, this.libelleEquipe(t.chantierCode, t.equipeCode)) === 'separee')
  );

  /** Présentations proposées pour une équipe : la réunion n'existe que dans le rapport PDF. */
  readonly optionsTraitement = computed(() => OPTIONS_TRAITEMENT[this.format()]);

  /** Les marchés choisis ne restreignent que le rapport PDF, pas l'export Excel. */
  readonly marchesEffectifs = computed(() => (this.format() === 'PDF' ? this.marchesChoisis() : []));

  /** Les chantiers que l'étape équipes propose : ceux retenus à l'étape marché, ou tous. */
  readonly chantiersPourEquipes = computed(() => {
    const codes = this.marchesEffectifs();
    return codes.length > 0 ? this.chantiers().filter((c) => codes.includes(c.code)) : this.chantiers();
  });

  /** Les chantiers que l'étape équipes parcourt, un écran chacun : ceux qui comptent au moins une équipe. */
  readonly chantiersAvecEquipes = computed(() => this.chantiersPourEquipes().filter((c) => c.equipes.length > 0));
  readonly chantierCourant = computed<PaieChantierPeriode | null>(() => {
    const chantiers = this.chantiersAvecEquipes();
    return chantiers[Math.min(this.positionChantier(), chantiers.length - 1)] ?? null;
  });
  /** Chantiers encore à voir après celui affiché. */
  readonly chantiersRestants = computed(() => Math.max(0, this.chantiersAvecEquipes().length - 1 - this.positionChantier()));
  /** Chantiers dont au moins une équipe quitte la liste du chantier. */
  readonly chantiersRegles = computed(() =>
    this.chantiersAvecEquipes().filter((c) => c.equipes.some((e) => this.traitement(c.code, e.libelle) !== 'liste'))
  );

  /** Les chantiers proposés, filtrés par la recherche de l'étape chantier. */
  readonly chantiersProposes = computed(() => {
    const terme = this.rechercheChantier().trim().toLowerCase();
    return this.chantiers().filter((c) => !terme || c.code.toLowerCase().includes(terme) || (c.libelle ?? '').toLowerCase().includes(terme));
  });

  readonly etapes = computed<EtapeId[]>(() => {
    const ids: EtapeId[] = ['periode', 'format'];
    if (this.format() === 'PDF') {
      ids.push('chantier');
    }
    ids.push('equipes');
    if (this.tableauxConcernes().length > 0) {
      ids.push('materiel');
    }
    ids.push('recap');
    return ids;
  });
  readonly indexEtape = computed(() => this.etapes().indexOf(this.etape()));

  readonly nomFichier = computed(() => {
    const periode = this.periode() ?? '';
    return this.format() === 'PDF' ? `Paie_Rapport_BI_${periode}.pdf` : `Paie_Export_${periode}.xlsx`;
  });

  sousTitre(): string {
    return this.etat() === 'termine' ? 'Téléchargement lancé' : SOUS_TITRES[this.etape()];
  }

  /** Un nouveau mois invalide tout ce qui dépend du précédent (chantiers chargés, équipes choisies). */
  choisirPeriode(periode: string): void {
    this.requetes.chantiers?.unsubscribe();
    this.retirerErreurChargement('chantiers');
    this.periode.set(periode);
    this.chargerMemoireMateriel(periode);
    this.erreur.set(null);
    this.chantiers.set([]);
    this.marchesChoisis.set([]);
    this.sansVueEnsemble.set(false);
    this.traitements.set({});
    this.retirees.set({});
    this.positionChantier.set(0);
  }

  choisirFormat(format: Format): void {
    this.format.set(format);
  }

  // ---- Étape chantier (PDF) ----

  rechercherChantier(valeur: string): void {
    this.rechercheChantier.set(valeur);
  }

  /** Choisit les marchés du rapport (liste vide : tous). Un périmètre choisi démarre sans vue d'ensemble. */
  choisirMarches(codes: string[]): void {
    this.marchesChoisis.set([...new Set(codes)]);
    this.sansVueEnsemble.set(codes.length > 0);
  }

  basculerMarche(code: string): void {
    const choisis = this.marchesChoisis();
    this.choisirMarches(choisis.includes(code) ? choisis.filter((c) => c !== code) : [...choisis, code]);
  }

  marcheChoisi(code: string): boolean {
    return this.marchesChoisis().includes(code);
  }

  basculerVueEnsemble(): void {
    this.sansVueEnsemble.set(!this.sansVueEnsemble());
  }

  texteChantier(): string {
    const codes = this.marchesEffectifs();
    if (codes.length === 0) {
      return 'Tous les marchés';
    }
    return this.chantiers().filter((c) => codes.includes(c.code))
      .map((c) => `${c.code}${c.libelle ? ' — ' + c.libelle : ''}`).join(', ');
  }

  texteVueEnsemble(): string {
    return this.sansVueEnsemble() ? 'Retirée : le rapport commence par le premier chantier' : 'Incluse';
  }

  // ---- Navigation ----

  suivant(): void {
    if (this.etat() === 'generation' || this.chargementBloquant()) {
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
    if (courante === 'equipes') {
      if (this.reunionIncomplete(this.chantierCourant())) {
        this.erreur.set(REUNION_INCOMPLETE);
        return;
      }
      if (this.chantiersRestants() > 0) {
        this.afficherChantier(this.positionChantier() + 1, 'avant');
        return;
      }
      if (this.retenirSurReunionIncomplete()) {
        return;
      }
    }
    this.aller(this.etapes()[this.indexEtape() + 1], 'avant');
  }

  precedent(): void {
    if (this.etat() !== 'saisie') {
      return;
    }
    if (this.etape() === 'equipes' && this.positionChantier() > 0) {
      this.afficherChantier(this.positionChantier() - 1, 'arriere');
    } else if (this.indexEtape() > 0) {
      this.aller(this.etapes()[this.indexEtape() - 1], 'arriere');
    }
  }

  allerA(id: EtapeId): void {
    if (this.etat() === 'saisie' && this.etapes().indexOf(id) < this.indexEtape()) {
      this.aller(id, 'arriere');
      this.positionChantier.set(0);
    }
  }

  /** Arrivée sur l'étape équipes : par l'avant on commence au premier chantier, par le retour on retrouve le dernier. */
  private aller(id: EtapeId, sens: 'avant' | 'arriere'): void {
    this.erreur.set(null);
    this.sens.set(sens);
    this.etape.set(id);
    if (id === 'equipes') {
      this.positionChantier.set(sens === 'avant' ? 0 : Math.max(0, this.chantiersAvecEquipes().length - 1));
    }
  }

  // ---- Étape équipes : un chantier par écran ----

  private afficherChantier(position: number, sens: 'avant' | 'arriere'): void {
    this.erreur.set(null);
    this.sens.set(sens);
    this.positionChantier.set(position);
  }

  /** Depuis le récapitulatif : rouvre l'étape équipes sur ce chantier. */
  allerAuChantier(code: string): void {
    const position = this.chantiersAvecEquipes().findIndex((c) => c.code === code);
    if (this.etat() === 'saisie' && position >= 0) {
      this.aller('equipes', 'arriere');
      this.positionChantier.set(position);
    }
  }

  /** Laisse les chantiers suivants tels quels (par défaut, une simple liste) et passe à l'étape d'après. */
  passerChantiersRestants(): void {
    if (this.etape() !== 'equipes' || this.etat() !== 'saisie' || this.chargementBloquant()) {
      return;
    }
    if (this.reunionIncomplete(this.chantierCourant())) {
      this.erreur.set(REUNION_INCOMPLETE);
      return;
    }
    if (!this.retenirSurReunionIncomplete()) {
      this.aller(this.etapes()[this.indexEtape() + 1], 'avant');
    }
  }

  /** Une réunion compte au moins deux équipes : le serveur refuse un groupe d'une seule. */
  private reunionIncomplete(chantier: PaieChantierPeriode | null): boolean {
    return chantier !== null && this.equipesReunies(chantier).length === 1;
  }

  /** Avant de quitter l'étape : ramène sur le premier chantier dont la réunion est incomplète, s'il y en a un. */
  private retenirSurReunionIncomplete(): boolean {
    const position = this.chantiersAvecEquipes().findIndex((c) => this.reunionIncomplete(c));
    if (position < 0) {
      return false;
    }
    this.afficherChantier(position, 'arriere');
    this.erreur.set(REUNION_INCOMPLETE);
    return true;
  }

  /** Présentation d'une équipe dans son chantier. En Excel la réunion n'existe pas : l'équipe reste dans la feuille du chantier. */
  traitement(code: string, equipe: string): Traitement {
    const choisi = this.traitements()[code]?.[equipe] ?? 'liste';
    return choisi === 'reunie' && this.format() !== 'PDF' ? 'liste' : choisi;
  }

  choisirTraitement(code: string, equipe: string, traitement: Traitement): void {
    this.erreur.set(null);
    this.traitements.set({ ...this.traitements(), [code]: { ...this.traitements()[code], [equipe]: traitement } });
    if (traitement !== 'separee') {
      this.retirees.set({ ...this.retirees(), [code]: (this.retirees()[code] ?? []).filter((e) => e !== equipe) });
    }
  }

  /** Raccourci : la même présentation pour toutes les équipes du chantier. */
  toutTraiter(chantier: PaieChantierPeriode, traitement: Traitement): void {
    this.erreur.set(null);
    this.traitements.set({
      ...this.traitements(),
      [chantier.code]: Object.fromEntries(chantier.equipes.map((e) => [e.libelle, traitement]))
    });
    if (traitement !== 'separee') {
      this.retirees.set({ ...this.retirees(), [chantier.code]: [] });
    }
  }

  private equipesTraitees(chantier: PaieChantierPeriode, traitement: Traitement): PaieEquipePeriode[] {
    return chantier.equipes.filter((e) => this.traitement(chantier.code, e.libelle) === traitement);
  }

  /** Libellés des équipes qui ont leur section (PDF) ou leur feuille (Excel) à part, dans l'ordre du chantier. */
  equipesSeparees(chantier: PaieChantierPeriode): string[] {
    return this.equipesTraitees(chantier, 'separee').map((e) => e.libelle);
  }

  /** Libellés des équipes réunies en une section commune (PDF), dans l'ordre du chantier : c'est l'ordre du titre. */
  equipesReunies(chantier: PaieChantierPeriode): string[] {
    return this.equipesTraitees(chantier, 'reunie').map((e) => e.libelle);
  }

  libelleEquipe(chantierCode: string, equipeCode: string): string {
    return this.chantiers().find((chantier) => chantier.code === chantierCode)?.equipes
      .find((equipe) => equipe.code === equipeCode)?.libelle ?? equipeCode;
  }

  estRetiree(code: string, equipe: string): boolean {
    return this.retirees()[code]?.includes(equipe) ?? false;
  }

  basculerRetrait(code: string, equipe: string): void {
    const actuelles = this.retirees()[code] ?? [];
    const suivantes = actuelles.includes(equipe) ? actuelles.filter((e) => e !== equipe) : [...actuelles, equipe];
    this.retirees.set({ ...this.retirees(), [code]: suivantes });
  }

  /** Ce que le fichier contiendra pour ce chantier, dans l'ordre d'impression : sections du PDF ou feuilles de l'Excel. */
  apercu(chantier: PaieChantierPeriode): { titre: string; effectif: number }[] {
    const effectif = (equipes: PaieEquipePeriode[]) => equipes.reduce((somme, e) => somme + e.effectif, 0);
    const separees = this.equipesTraitees(chantier, 'separee');
    if (this.format() === 'EXCEL') {
      const retirees = separees.filter((e) => this.estRetiree(chantier.code, e.libelle));
      return [
        { titre: `Feuille du chantier ${chantier.code}`, effectif: chantier.effectif - effectif(retirees) },
        ...separees.map((e) => ({ titre: `Feuille de l'équipe ${e.libelle}`, effectif: e.effectif }))
      ];
    }
    const reunies = this.equipesTraitees(chantier, 'reunie');
    if (separees.length === 0 && reunies.length < 2) {
      return [{ titre: 'Liste de tout le chantier, avec la colonne Équipe', effectif: chantier.effectif }];
    }
    const groupe = reunies.length >= 2 ? reunies : [];
    const reste = chantier.effectif - effectif(separees) - effectif(groupe);
    return [
      ...(groupe.length > 0 ? [{ titre: `Section ${groupe.map((e) => e.libelle).join(' + ')}`, effectif: effectif(groupe) }] : []),
      ...separees.map((e) => ({ titre: `Section ${e.libelle}`, effectif: e.effectif })),
      ...(reste > 0 ? [{ titre: 'Liste des autres employés, sans colonne Équipe', effectif: reste }] : [])
    ];
  }

  /** Résumé d'un chantier réglé, pour le récapitulatif. */
  texteEquipes(chantier: PaieChantierPeriode): string {
    const separees = this.equipesSeparees(chantier);
    const reunies = this.equipesReunies(chantier);
    const enListe = chantier.equipes.length - separees.length - reunies.length;
    const excel = this.format() === 'EXCEL';
    const retirees = separees.filter((e) => this.estRetiree(chantier.code, e)).length;
    return [
      reunies.length > 0 ? `Réunies : ${reunies.join(' + ')}` : '',
      separees.length > 0 ? `${excel ? 'Feuille à part' : (separees.length > 1 ? 'Séparées' : 'Séparée')} : ${separees.join(', ')}` : '',
      retirees > 0 ? `${retirees} retirée${retirees > 1 ? 's' : ''} de la feuille du chantier` : '',
      enListe > 0 ? `${enListe} ${excel ? 'dans la feuille du chantier' : 'dans la liste'}` : ''
    ].filter((partie) => partie !== '').join(' · ');
  }

  // ---- Étape matériel ----

  nombre(libelle: string): number | null {
    return this.nombres()[libelle] ?? null;
  }

  /** Une ligne dont le nombre vient de la mémoire est « conservée », « modifiée » si on l'a changée, « nouvelle » sinon. */
  etatLigne(libelle: string): EtatLigneMateriel | null {
    const valeur = this.nombre(libelle);
    if (valeur === null) {
      return null;
    }
    const memorise = this.memoire()[libelle];
    if (!memorise) {
      return 'nouveau';
    }
    return memorise.quantite === valeur ? 'conserve' : 'modifie';
  }

  texteMemoire(libelle: string): string | null {
    const memorise = this.memoire()[libelle];
    const etat = this.etatLigne(libelle);
    if (!memorise || etat === null) {
      return memorise ? `Dernier nombre : ${memorise.quantite} (${memorise.periode})` : null;
    }
    return etat === 'conserve' ? `Repris de ${memorise.periode}` : `Remplace ${memorise.quantite} (${memorise.periode})`;
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
      this.propose.delete(libelle);
      this.nombres.set({ ...this.nombres(), [libelle]: null });
      return;
    }
    const valeur = Number(brut);
    if (!Number.isInteger(valeur) || valeur < 0 || valeur > NOMBRE_MAX_MATERIEL) {
      this.erreur.set(`Saisissez un nombre entier entre 0 et ${NOMBRE_MAX_MATERIEL}.`);
      return;
    }
    this.propose.delete(libelle);
    this.nombres.set({ ...this.nombres(), [libelle]: valeur });
  }

  ajuster(libelle: string, delta: number): void {
    this.propose.delete(libelle);
    const courant = this.nombre(libelle);
    const base = courant === null && delta < 0 ? 0 : (courant ?? 0) + delta;
    this.nombres.set({ ...this.nombres(), [libelle]: Math.max(0, Math.min(NOMBRE_MAX_MATERIEL, base)) });
    this.erreur.set(null);
  }

  /** Entrée dans un champ de nombre : passe au champ suivant, puis au bouton « Continuer » après le dernier. */
  entreeSuivante(evenement: Event): void {
    evenement.preventDefault();
    const champs = Array.from(document.querySelectorAll<HTMLInputElement>('.app-wizard__materiel-champ'));
    const suivant = champs[champs.indexOf(evenement.target as HTMLInputElement) + 1];
    if (suivant) {
      suivant.focus();
    } else {
      document.querySelector<HTMLButtonElement>('.app-wizard__pied button:last-child')?.focus();
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
    const etats = tableau.libelles.map((l) => this.etatLigne(l));
    const details = (['conserve', 'modifie', 'nouveau'] as const)
      .map((etat) => ({ etat, nombre: etats.filter((e) => e === etat).length }))
      .filter((x) => x.nombre > 0)
      .map((x) => `${x.nombre} ${{ conserve: 'reprise', modifie: 'modifiée', nouveau: 'nouvelle' }[x.etat]}${x.nombre > 1 ? 's' : ''}`);
    const suite = details.length > 0 ? ` (${details.join(', ')})` : '';
    return `${n} ligne${n > 1 ? 's' : ''} renseignée${n > 1 ? 's' : ''} sur ${tableau.libelles.length}${suite} · total ${this.total(tableau)}`;
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
    return Object.fromEntries(
      this.chantiersAvecEquipes()
        .map((c) => [c.code, this.equipesSeparees(c)] as const)
        .filter(([, equipes]) => equipes.length > 0)
    );
  }

  /** Chaque chantier envoie sa propre réunion : une section commune pour ses équipes réunies (au moins deux). */
  private construireRegroupements(): Record<string, string[][]> | null {
    const reunions: Record<string, string[][]> = {};
    for (const chantier of this.chantiersAvecEquipes()) {
      const reunies = this.equipesReunies(chantier);
      if (reunies.length >= 2) {
        reunions[chantier.code] = [reunies];
      }
    }
    return Object.keys(reunions).length > 0 ? reunions : null;
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
      chantierIds: this.marchesEffectifs().length > 0
        ? this.chantiers().filter((c) => this.marchesEffectifs().includes(c.code)).map((c) => c.id)
        : null,
      sansVueEnsemble: this.sansVueEnsemble(),
      equipesParChantier: Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null,
      regroupementsEquipesParChantier: this.construireRegroupements(),
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

  /** Remet l'assistant à son état de départ (ouverture, ou « Nouvel export »). */
  ouvrir(): void {
    Object.values(this.requetes).forEach((requete) => requete.unsubscribe());
    this.erreursChargement.set([]);
    this.etape.set('periode');
    this.sens.set('avant');
    this.etat.set('saisie');
    this.erreur.set(null);
    this.periode.set(null);
    this.format.set('PDF');
    this.chantiers.set([]);
    this.rechercheChantier.set('');
    this.marchesChoisis.set([]);
    this.sansVueEnsemble.set(false);
    this.traitements.set({});
    this.retirees.set({});
    this.positionChantier.set(0);
    this.laisseVide.set({});
    this.nombres.set({});
    this.memoire.set({});
    this.propose.clear();
    this.dernierEnregistre.set(null);
    this.chargerPeriodes();
    this.chargerTableauxMateriel();
  }

  private chargerPeriodes(): void {
    this.requetes.periodes?.unsubscribe();
    this.periodesEnCours.set(true);
    this.requetes.periodes = this.paieService
      .listerPeriodes()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.periodesEnCours.set(false)))
      .subscribe({ next: (periodes) => {
        this.retirerErreurChargement('periodes');
        this.periodes.set(periodes);
        if (!this.periode() && periodes.length > 0) {
          this.choisirPeriode(periodes[0].periode);
        }
      }, error: () => this.ajouterErreurChargement('periodes') });
  }

  private chargerTableauxMateriel(): void {
    this.requetes.materiel?.unsubscribe();
    this.materielEnCours.set(true);
    this.requetes.materiel = this.paieService.listerTableauxMateriel()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.materielEnCours.set(false)))
      .subscribe({
        next: (tableaux) => { this.tableauxMateriel.set(tableaux); this.retirerErreurChargement('materiel'); },
        error: () => this.ajouterErreurChargement('materiel')
      });
  }

  /** Facultatif : sans réponse, l'assistant reste utilisable avec des lignes vides. */
  private chargerMemoireMateriel(periode: string): void {
    this.requetes.memoire?.unsubscribe();
    this.requetes.memoire = this.paieService.listerValeursMateriel(periode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (valeurs) => {
          const nombres = { ...this.nombres() };
          for (const ligne of Object.values(this.memoire())) {
            if (this.propose.has(ligne.libelle)) {
              delete nombres[ligne.libelle];
              this.propose.delete(ligne.libelle);
            }
          }
          for (const valeur of valeurs) {
            if (nombres[valeur.libelle] === undefined || nombres[valeur.libelle] === null) {
              nombres[valeur.libelle] = valeur.quantite;
              this.propose.add(valeur.libelle);
            }
          }
          this.memoire.set(Object.fromEntries(valeurs.map((v) => [v.libelle, v])));
          this.nombres.set(nombres);
        },
        error: () => this.memoire.set({})
      });
  }

  private chargerChantiers(): void {
    const periode = this.periode();
    if (!periode || this.chantiers().length > 0) {
      return;
    }
    this.requetes.chantiers?.unsubscribe();
    this.chantiersEnCours.set(true);
    this.requetes.chantiers = this.paieService
      .listerChantiersDeLaPeriode(periode)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.chantiersEnCours.set(false)))
      .subscribe({
        next: (chantiers) => { this.chantiers.set(chantiers); this.retirerErreurChargement('chantiers'); },
        error: () => this.ajouterErreurChargement('chantiers')
      });
  }

  reessayerChargements(): void {
    for (const chargement of this.erreursChargement()) {
      if (chargement === 'periodes') this.chargerPeriodes();
      else if (chargement === 'chantiers') this.chargerChantiers();
      else this.chargerTableauxMateriel();
    }
  }

  private ajouterErreurChargement(chargement: Chargement): void {
    this.erreursChargement.update((erreurs) => [...new Set([...erreurs, chargement])]);
  }

  private retirerErreurChargement(chargement: Chargement): void {
    this.erreursChargement.update((erreurs) => erreurs.filter((erreur) => erreur !== chargement));
  }

}
