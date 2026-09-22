export interface PaieEmployeeSummary {
  id: number;
  nomPrenom: string;
  cin: string;
}

export interface PaieFunctionSummary {
  id: number;
  libelle: string;
}

export interface PaieChantierSummary {
  id: number;
  code: string;
  designation: string;
}

export interface Paie {
  id: number;
  employee: PaieEmployeeSummary;
  periode: string;
  fonction: PaieFunctionSummary;
  chantier: PaieChantierSummary;
  equipe: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable: number | null;
  joursRecuperationDimanche: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire: number | null;
  primeRoulageDimanche: number | null;
  salaireTotal: number;
  observation: string | null;
}

/** Ne porte pas salaireTotal : calculé côté serveur (salaireMensuel + primes), jamais saisi. */
export interface PaieCreateRequest {
  employeeId: number;
  periode: string;
  fonctionId: number;
  chantierId: number;
  equipe?: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  observation?: string | null;
}

/** Ne porte pas salaireTotal : calculé côté serveur (salaireMensuel + primes), jamais saisi. */
export interface PaieUpdateRequest {
  fonctionId: number;
  chantierId: number;
  equipe?: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  observation?: string | null;
}

export interface PaieSearchCriteria {
  cin?: string;
  nomPrenom?: string;
  periode?: string;
  fonctionId?: number;
  chantierId?: number;
  equipe?: string;
}

export interface PaieImportLigneIgnoree {
  numeroLigne: number;
  cin: string | null;
  nomPrenom: string | null;
  raison: string;
}

export interface PaieImportResult {
  periode: string;
  totalLignes: number;
  crees: number;
  misAJour: number;
  ignores: number;
  lignesIgnorees: PaieImportLigneIgnoree[];
  fonctionsCreees: string[];
}
