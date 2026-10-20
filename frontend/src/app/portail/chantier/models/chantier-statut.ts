import { Chantier } from './chantier.model';

/**
 * Le statut d'un chantier dit en termes de chantier : « En cours » ou « Clôturé ». L'API garde le booléen `actif` ; seuls les
 * libellés de l'interface changent. Un chantier clôturé ne peut plus être cité par un fichier de paie (l'assistant d'import
 * propose de le rouvrir).
 */
export function libelleStatutChantier(actif: boolean): string {
  return actif ? 'En cours' : 'Clôturé';
}

export const STATUT_CHANTIER_OPTIONS: { label: string; value: boolean }[] = [
  { label: libelleStatutChantier(true), value: true },
  { label: libelleStatutChantier(false), value: false }
];

/** La confirmation demandée avant de clôturer un chantier en cours, ou de rouvrir un chantier clôturé. */
export function confirmationStatutChantier(chantier: Chantier): { header: string; message: string; acceptLabel: string } {
  return chantier.actif
    ? {
        header: 'Clôturer ce chantier',
        message: `Clôturer le chantier ${chantier.code} ? Un fichier de paie qui le cite sera arrêté à l'import, jusqu'à ce qu'il soit rouvert.`,
        acceptLabel: 'Clôturer'
      }
    : {
        header: 'Rouvrir ce chantier',
        message: `Rouvrir le chantier ${chantier.code} ? Il repasse en cours : la paie et les fiches des employés peuvent de nouveau le citer.`,
        acceptLabel: 'Rouvrir'
      };
}
