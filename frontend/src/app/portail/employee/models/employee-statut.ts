import { EmployeeStatut } from './employee.model';

/**
 * Le statut d'un employé dit en termes RH : « En poste » ou « Sorti » (STC, ou absent de la dernière paie importée). L'API
 * garde les valeurs `ACTIF` / `INACTIF` ; seuls les libellés de l'interface changent.
 */
const LIBELLES: Record<EmployeeStatut, string> = {
  ACTIF: 'En poste',
  INACTIF: 'Sorti'
};

export function libelleStatutEmploye(statut: EmployeeStatut): string {
  return LIBELLES[statut];
}

export const STATUT_EMPLOYE_OPTIONS: { label: string; value: EmployeeStatut }[] = [
  { label: LIBELLES.ACTIF, value: 'ACTIF' },
  { label: LIBELLES.INACTIF, value: 'INACTIF' }
];
