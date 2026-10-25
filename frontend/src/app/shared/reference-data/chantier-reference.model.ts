export interface ChantierReference {
  id: number;
  code: string;
  designation: string;
  nom?: string | null;
  actif: boolean;
}
