import { CurrentUser, PermissionSummary, RoleSummary } from '../../../core/auth/models/auth.model';

export type AdminUser = CurrentUser;

export interface UserCreateRequest {
  username: string;
  email: string;
  motDePasse: string;
  employeeId: number | null;
  roleIds: number[];
}

export interface UserUpdateRequest {
  email: string;
  actif: boolean;
  employeeId: number | null;
  roleIds: number[];
}

export interface DenyPermissionsRequest {
  permissionIds: number[];
}

export interface AdminResetPasswordRequest {
  nouveauMotDePasse: string;
}

export interface Role {
  id: number;
  nom: string;
  description: string | null;
  permissions: PermissionSummary[];
}

export interface RoleCreateRequest {
  nom: string;
  description: string | null;
  permissionIds: number[];
}

export interface RoleUpdateRequest {
  nom: string;
  description: string | null;
  permissionIds: number[];
}

export { PermissionSummary, RoleSummary };
