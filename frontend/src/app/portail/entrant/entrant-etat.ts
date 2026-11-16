import { computed, Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { LigneMouvement } from '../mouvement/mouvement-agregats';
import { EtatMouvement } from '../mouvement/mouvement-etat';
import { MouvementRequete } from '../mouvement/mouvement-filtres';
import { EntrantsMois, TypeEntree } from './models/entrant.model';
import { EntrantService } from './services/entrant.service';

const LIBELLES_TYPE: Record<TypeEntree, string> = { NOUVELLE_EMBAUCHE: 'Nouvelle embauche', RETOUR: 'Retour' };

export function libelleType(type: TypeEntree): string {
  return LIBELLES_TYPE[type];
}

/** Le mois des entrants, chargé une fois par la coque `EntrantVuesComponent` et lu par ses trois vues. */
@Injectable()
export class EntrantEtat extends EtatMouvement<EntrantsMois> {
  private readonly service = inject(EntrantService);
  protected readonly cleFiltre = 'types';
  protected readonly messageErreurChargement = 'Impossible de charger les entrants du mois.';
  protected readonly messageErreurPdf = 'Impossible de générer le PDF des entrants.';

  readonly lignes = computed<LigneMouvement[]>(() =>
    (this.resultat()?.entrants ?? []).map((e) => ({
      employeId: e.employeId,
      nomPrenom: e.nomPrenom,
      categorie: libelleType(e.type),
      categorieCle: e.type,
      chantierId: e.chantierId,
      chantier: e.chantier,
      equipeId: e.equipeId,
      equipe: e.equipe,
      fonctionId: e.fonctionId,
      fonction: e.fonction,
      montant: e.montantBulletin
    }))
  );

  /** Vrai quand le mois ou le mois civil précédent n'a aucun bulletin : on ne peut pas dire qui entre. */
  readonly nonComparable = computed(() => this.resultat()?.comparable === false);

  constructor() {
    super();
    this.suivreUrl();
  }

  protected appeler(requete: MouvementRequete): Observable<EntrantsMois> {
    return this.service.entrantsDuMois(requete);
  }

  protected appelerPdf(requete: MouvementRequete): Observable<Blob> {
    return this.service.exporterPdf(requete);
  }

  protected nomPdf(periode: string): string {
    return `Entrants_${periode}.pdf`;
  }
}
