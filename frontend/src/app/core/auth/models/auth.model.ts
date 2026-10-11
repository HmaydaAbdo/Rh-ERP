export interface RoleSummary {
  id: number;
  nom: string;
}

export interface PermissionSummary {
  id: number;
  version: number;
  code: string;
  description: string;
}

export interface EmployeeSummary {
  id: number;
  nomPrenom: string;
  cin: string;
}

export interface CurrentUser {
  id: number;
  version: number;
  username: string;
  email: string;
  actif: boolean;
  employee: EmployeeSummary | null;
  roles: RoleSummary[];
  permissionsRefusees: PermissionSummary[];
  permissionsEffectives: string[];
}

export interface LoginResponse {
  accessToken: string;
  utilisateur: CurrentUser;
}
