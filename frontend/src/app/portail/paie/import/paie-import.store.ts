import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierService } from '../../chantier/services/chantier.service';
import { TypeSalaire } from '../../employee/models/employee.model';
import { PaieImportAnalyse, PaieImportResult } from '../models/paie.model';
import { libellePeriode, moisCivilPrecedent } from '../paie-format';
import { PaieService } from '../services/paie.service';

export type EtapeImport = 'fichier' | 'controle' | 'departs' | 'recap';
export type EtatImport = 'saisie' | 'import' | 'termine';

const ETAPES: EtapeImport[] = ['fichier', 'controle', 'departs', 'recap'];
const LIBELLES_ETAPES: Record<EtapeImport, string> = {
  fichier: 'Fichier',
  controle: 'Contrôle',
  departs: 'Départs',
  recap: 'Import'
};

/** Saisie d'un employé à créer depuis l'assistant : ce que le fichier de paie n'a pas. */
export interface CreationSaisie {
  dateNaissance: Date | null;
  dateEmbauche: Date | null;
  typeSalaire: TypeSalaire | null;
}

/** Choix de l'utilisateur pour un départ proposé : le confirmer (coché) et son motif. */
export interface DepartSaisi {
  coche: boolean;
  motif: string;
  /** Départ déduit de l'absence du salarié, confirmé sans motif par un choix explicite. */
  sansMotif: boolean;
}

/** Le fichier choisi dans un champ `<input type="file">`, qu'on vide pour pouvoir rechoisir le même fichier corrigé. */
export function fichierChoisi(evenement: Event): File | null {
  const champ = evenement.target as HTMLInputElement;
  const fichier = champ.files?.[0] ?? null;
  champ.value = '';
  return fichier;
}

function dateIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * État et logique de l'assistant d'import de la paie (voir `PaieImportWizardComponent` et
 * site/docs/decisions/0010-employe-etat-du-dernier-mois-de-paie.md). Le fichier est analysé sans rien enregistrer ; les écarts avec les
 * fiches se corrigent ici (mettre à jour la fiche, créer un CIN inconnu, rouvrir un chantier clôturé) ou dans le fichier,
 * qu'on réimporte — autant de fois qu'il faut. L'import n'est possible qu'une fois l'analyse prête ; les départs proposés sont cochés d'office.
 */
@Injectable()
export class PaieImportStore {
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly chantierService = inject(ChantierService);

  readonly etapes = ETAPES;
  readonly libelleEtapes = LIBELLES_ETAPES;
  readonly libellePeriode = libellePeriode;

  /** Corriger les fiches depuis l'assistant demande en plus le droit d'écrire les employés. */
  readonly peutCorriger = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));
  /** Rouvrir un chantier clôturé demande le droit de lire et d'écrire les chantiers (domaine Chantier). */
  readonly peutRouvrir = computed(() => this.authService.hasPermission('CHANTIER_READ') && this.authService.hasPermission('CHANTIER_WRITE'));

  readonly etape = signal<EtapeImport>('fichier');
  readonly etat = signal<EtatImport>('saisie');
  readonly occupe = signal(false);
  readonly erreur = signal<string | null>(null);

  /** Mois à importer, au choix de l'utilisateur ; proposé par défaut : le mois civil précédent. */
  readonly mois = signal<string | null>(null);
  readonly moisDate = computed(() => {
    const mois = this.mois();
    if (!mois) return null;
    const [annee, numero] = mois.split('-').map(Number);
    return new Date(annee, numero - 1, 1);
  });
  /** L'utilisateur a confirmé la période signalée (mois en cours ou à venir, fichier déjà importé sous un autre mois). */
  readonly periodeConfirmee = signal(false);
  readonly fichier = signal<File | null>(null);
  readonly analyse = signal<PaieImportAnalyse | null>(null);
  readonly bilan = signal<PaieImportResult | null>(null);
  readonly confirmerSalaireZero = signal(false);

  /** Type de salaire choisi pour une fiche en écart (par identifiant d'employé) ; absent = celui de la fiche. */
  readonly typesChoisis = signal<Record<number, TypeSalaire | null>>({});
  /** Saisies des employés à créer, par numéro de ligne du fichier. */
  readonly creations = signal<Record<number, CreationSaisie>>({});
  /** Choix de l'utilisateur quand le fichier laisse vide l'équipe d'un employé qui en a une (par employé). */
  readonly decisionsEquipe = signal<Record<number, 'CONSERVER' | 'VIDER'>>({});
  /** Départs proposés, par identifiant d'employé. */
  readonly departs = signal<Record<number, DepartSaisi>>({});

  readonly indexEtape = computed(() => ETAPES.indexOf(this.etape()));
  readonly pret = computed(() => {
    const analyse = this.analyse();
    if (!analyse) return false;
    const avertissementsNonConfirmes = analyse.avertissements.filter((a) =>
      !((a.codeAvertissement === 'SALAIRE_ZERO' && this.confirmerSalaireZero()) ||
        (a.codeAvertissement === 'EQUIPE_VIDE' && a.employeId != null && this.decisionsEquipe()[a.employeId] !== undefined))
    );
    // Le serveur déclare `pret` sans contrôle de période non confirmé : on le retrouve en ne comptant pas ce contrôle.
    const sansControle = analyse.pret || (analyse.controlesPeriode.length > 0 && analyse.erreurs.length === 0 && analyse.avertissements.length === 0 && analyse.ecarts.length === 0);
    const periodeAcceptee = analyse.controlesPeriode.length === 0 || this.periodeConfirmee();
    return analyse.erreurs.length === 0 && avertissementsNonConfirmes.length === 0 && periodeAcceptee &&
      (sansControle || (analyse.avertissements.length > 0 && avertissementsNonConfirmes.length === 0));
  });
  readonly avertissementSalaireZero = computed(() => {
    const avertissements = this.analyse()?.avertissements ?? [];
    return avertissements.some((a) => a.codeAvertissement === 'SALAIRE_ZERO');
  });
  readonly nombreProblemes = computed(() => {
    const a = this.analyse();
    return a ? a.erreurs.length + a.avertissements.length + a.chantiersClotures.length + a.cinInconnus.length + a.ecarts.length : 0;
  });
  readonly decisionsEquipeEnvoyees = computed(() =>
    Object.entries(this.decisionsEquipe()).map(([id, action]) => ({ employeId: Number(id), action }))
  );
  readonly departsConfirmes = computed(() =>
    (this.analyse()?.departs ?? [])
      .filter((d) => this.departs()[d.employeId]?.coche)
      .map((d) => ({
        employeId: d.employeId,
        motif: this.departs()[d.employeId].motif.trim(),
        sansMotif: this.departs()[d.employeId].sansMotif
      }))
  );
  /** Chaque départ coché a un motif ; un départ déduit de l'absence peut être confirmé sans motif, explicitement. */
  readonly departsValides = computed(() => {
    const proposes = new Map((this.analyse()?.departs ?? []).map((d) => [d.employeId, d]));
    return this.departsConfirmes().every((d) => d.motif.length > 0 || (d.sansMotif && proposes.get(d.employeId)?.motif == null));
  });

  readonly sousTitre = computed(() => {
    switch (this.etape()) {
      case 'fichier':
        return 'Choisissez le fichier de paie du mois';
      case 'controle':
        return this.pret() ? 'Le fichier concorde avec les fiches des employés' : 'Corrigez les fiches ici, ou le fichier puis réimportez-le';
      case 'departs':
        return 'Confirmez les employés qui quittent Staport';
      default:
        return 'Dernière vérification';
    }
  });

  /** Ouvre l'assistant sur un état neuf, avec le mois civil précédent proposé : le mois reste au choix de l'utilisateur. */
  ouvrir(): void {
    this.etape.set('fichier');
    this.etat.set('saisie');
    this.occupe.set(false);
    this.erreur.set(null);
    this.mois.set(moisCivilPrecedent(new Date()));
    this.periodeConfirmee.set(false);
    this.fichier.set(null);
    this.analyse.set(null);
    this.bilan.set(null);
    this.confirmerSalaireZero.set(false);
    this.typesChoisis.set({});
    this.creations.set({});
    this.departs.set({});
  }

  choisirMois(date: Date | null): void {
    this.mois.set(date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : null);
    this.periodeConfirmee.set(false);
  }

  confirmerPeriode(confirmee: boolean): void {
    this.periodeConfirmee.set(confirmee);
  }

  /** Analyse un fichier (premier choix ou fichier corrigé) : rien n'est enregistré. */
  analyser(fichier: File): void {
    const mois = this.mois();
    if (!mois) {
      this.erreur.set('Choisissez d’abord le mois du fichier.');
      return;
    }
    this.fichier.set(fichier);
    this.envoyer(this.paieService.analyserImport(fichier, mois), (analyse) => {
      this.recevoir(analyse);
      this.etape.set('controle');
    });
  }

  choisirType(employeId: number, type: TypeSalaire | null): void {
    this.typesChoisis.update((types) => ({ ...types, [employeId]: type }));
  }

  /** Met à jour les fiches choisies avec les valeurs de leur ligne ; chacune disparaît alors de la liste des écarts. */
  aligner(employeIds: number[]): void {
    const types = this.typesChoisis();
    this.corriger({
      aligner: employeIds.map((employeId) => {
        const ecart = this.analyse()?.ecarts.find((item) => item.employeId === employeId);
        const salaire = ecart?.champs.find((champ) => champ.champ === 'salaire')?.fichier;
        return {
          employeId,
          typeSalaire: types[employeId] ?? (salaire !== undefined && salaire !== null ? this.typeSalairePropose(Number(salaire)) : null)
        };
      }),
      creer: []
    });
  }

  typeSalairePourEcart(employeId: number, typeActuel: TypeSalaire | null): TypeSalaire | null {
    const choisi = this.typesChoisis()[employeId];
    if (choisi) return choisi;
    const salaire = this.analyse()?.ecarts.find((item) => item.employeId === employeId)?.champs.find((champ) => champ.champ === 'salaire')?.fichier;
    return salaire !== undefined && salaire !== null ? this.typeSalairePropose(Number(salaire)) : typeActuel;
  }

  alignerTout(): void {
    this.aligner((this.analyse()?.ecarts ?? []).map((e) => e.employeId));
  }

  saisirCreation(numeroLigne: number, saisie: Partial<CreationSaisie>): void {
    this.creations.update((creations) => ({
      ...creations,
      [numeroLigne]: { ...(creations[numeroLigne] ?? { dateNaissance: null, dateEmbauche: null, typeSalaire: null }), ...saisie }
    }));
  }

  /** Préremplissage métier du type de salaire : 500 DH et moins = journalier, au-delà = mensuel. */
  typeSalairePropose(salaire: number): TypeSalaire {
    return salaire <= 500 ? 'JOURNALIER' : 'MENSUEL';
  }

  creationComplete(numeroLigne: number, salaire: number): boolean {
    const saisie = this.creations()[numeroLigne];
    return !!saisie?.dateNaissance && !!saisie.dateEmbauche && !!(saisie.typeSalaire ?? this.typeSalairePropose(salaire));
  }

  creer(numeroLigne: number, salaire: number): void {
    const saisie = this.creations()[numeroLigne];
    const typeSalaire = saisie?.typeSalaire ?? this.typeSalairePropose(salaire);
    if (!saisie?.dateNaissance || !saisie.dateEmbauche) {
      return;
    }
    this.corriger({
      aligner: [],
      creer: [{ numeroLigne, dateNaissance: dateIso(saisie.dateNaissance), dateEmbauche: dateIso(saisie.dateEmbauche), typeSalaire }]
    });
  }

  /** Rouvre un chantier clôturé que le fichier cite, puis réanalyse le fichier (inchangé). */
  rouvrir(chantierId: number): void {
    const fichier = this.fichier();
    const mois = this.mois();
    if (!fichier || !mois) {
      return;
    }
    this.envoyer(
      this.chantierService.getById(chantierId).pipe(
        switchMap((chantier) => this.chantierService.changerStatut(chantier, true)),
        switchMap(() => this.paieService.analyserImport(fichier, mois))
      ),
      (analyse) => this.recevoir(analyse)
    );
  }

  saisirDepart(employeId: number, saisie: Partial<DepartSaisi>): void {
    this.departs.update((departs) => ({ ...departs, [employeId]: { ...departs[employeId], ...saisie } }));
  }

  suivant(): void {
    const index = this.indexEtape();
    if (this.etape() === 'controle' && !this.pret()) {
      return;
    }
    if (this.etape() === 'departs' && !this.departsValides()) {
      return;
    }
    if (index < ETAPES.length - 1 && this.analyse()) {
      this.etape.set(ETAPES[index + 1]);
    }
  }

  precedent(): void {
    const index = this.indexEtape();
    if (index > 0) {
      this.etape.set(ETAPES[index - 1]);
    }
  }

  /** On ne revient qu'aux étapes déjà franchies. */
  allerA(etape: EtapeImport): void {
    if (ETAPES.indexOf(etape) < this.indexEtape()) {
      this.etape.set(etape);
    }
  }

  /** Importe le fichier prêt, avec les départs confirmés ; `importe` est rappelé après un import réussi. */
  importer(importe: () => void): void {
    const fichier = this.fichier();
    const mois = this.mois();
    if (!fichier || !mois || !this.pret() || !this.departsValides()) {
      return;
    }
    this.etat.set('import');
    this.envoyer(
      this.paieService.importer(
        fichier, mois, this.departsConfirmes(), this.confirmerSalaireZero(), this.decisionsEquipeEnvoyees(), this.periodeConfirmee()
      ),
      (bilan) => {
        this.bilan.set(bilan);
        this.etat.set('termine');
        importe();
      },
      () => this.etat.set('saisie')
    );
  }

  private corriger(corrections: Parameters<PaieService['corrigerImport']>[2]): void {
    const fichier = this.fichier();
    const mois = this.mois();
    if (!fichier || !mois) {
      return;
    }
    this.envoyer(this.paieService.corrigerImport(fichier, mois, corrections), (analyse) => this.recevoir(analyse));
  }

  decider(employeId: number, action: 'CONSERVER' | 'VIDER'): void {
    this.decisionsEquipe.update((d) => ({ ...d, [employeId]: action }));
  }

  /** Nouvelle analyse : les départs gardent ce que l'utilisateur a déjà saisi, les nouveaux sont cochés d'office. */
  private recevoir(analyse: PaieImportAnalyse): void {
    this.analyse.set(analyse);
    if (!analyse.avertissements.some((a) => a.codeAvertissement === 'SALAIRE_ZERO')) {
      this.confirmerSalaireZero.set(false);
    }
    if (analyse.controlesPeriode.length === 0) {
      this.periodeConfirmee.set(false);
    }
    const precedents = this.departs();
    const departs: Record<number, DepartSaisi> = {};
    for (const depart of analyse.departs) {
      departs[depart.employeId] = precedents[depart.employeId] ?? { coche: true, motif: depart.motif ?? '', sansMotif: false };
    }
    this.departs.set(departs);
  }

  private envoyer<T>(requete: Observable<T>, succes: (valeur: T) => void, echec?: () => void): void {
    this.occupe.set(true);
    this.erreur.set(null);
    requete.pipe(finalize(() => this.occupe.set(false))).subscribe({
      next: succes,
      error: (err: HttpErrorResponse) => {
        this.erreur.set(err.error?.message ?? 'Le serveur n’a pas pu traiter le fichier.');
        echec?.();
      }
    });
  }
}
