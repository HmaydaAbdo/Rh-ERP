import { computed, Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SelectOption } from '../../shared/ui/select/select.component';
import { LigneMouvement } from '../mouvement/mouvement-agregats';
import { EtatMouvement } from '../mouvement/mouvement-etat';
import { MouvementRequete } from '../mouvement/mouvement-filtres';
import { SortiesMois } from './models/sortie.model';
import { SortieService } from './services/sortie.service';

/** Libellé affiché pour le motif que l'API renvoie quand aucun motif n'a été saisi. */
export const LIBELLE_MOTIF_NON_PRECISE = 'Non précisé';

export function libelleMotif(motif: string): string {
  return motif === 'NON_PRECISE' ? LIBELLE_MOTIF_NON_PRECISE : motif;
}

/** Le mois des sorties, chargé une fois par la coque `SortieVuesComponent` et lu par ses trois vues. */
@Injectable()
export class SortieEtat extends EtatMouvement<SortiesMois> {
  private readonly service = inject(SortieService);
  protected readonly cleFiltre = 'motifs';
  protected readonly messageErreurChargement = 'Impossible de charger les sorties du mois.';
  protected readonly messageErreurPdf = 'Impossible de générer le PDF des sortants.';

  readonly lignes = computed<LigneMouvement[]>(() =>
    (this.resultat()?.sorties ?? []).map((s) => ({
      employeId: s.employeId,
      nomPrenom: s.nomPrenom,
      categorie: libelleMotif(s.motif),
      categorieCle: s.motif,
      chantierId: s.chantierId,
      chantier: s.chantier,
      equipeId: s.equipeId,
      equipe: s.equipe,
      fonctionId: s.fonctionId,
      fonction: s.fonction,
      montant: s.montantDernierBulletin
    }))
  );

  /** Les motifs proposés au filtre : ceux du périmètre (avec leur nombre) et ceux déjà choisis. */
  readonly optionsMotifs = computed<SelectOption<string>[]>(() => {
    const parMotif = this.resultat()?.parMotif ?? {};
    const motifs = new Set([...Object.keys(parMotif), ...this.filtres().valeurs]);
    return [...motifs].sort().map((motif) => ({ value: motif, label: parMotif[motif] ? `${libelleMotif(motif)} (${parMotif[motif]})` : libelleMotif(motif) }));
  });

  constructor() {
    super();
    this.suivreUrl();
  }

  protected appeler(requete: MouvementRequete): Observable<SortiesMois> {
    return this.service.sortiesDuMois(requete);
  }

  protected appelerPdf(requete: MouvementRequete): Observable<Blob> {
    return this.service.exporterPdf(requete);
  }

  protected nomPdf(periode: string): string {
    return `Sortants_${periode}.pdf`;
  }
}
