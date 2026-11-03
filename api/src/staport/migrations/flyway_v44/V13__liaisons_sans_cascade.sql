-- Aucune cascade SQL sur une table auditée (conventions/database.md, « Tables auditées ») : une cascade supprime des
-- liaisons sans passer par Hibernate, donc sans que l'audit voie le retrait d'un droit.
--
-- Avant : supprimer un rôle retirait ce rôle à tous ses comptes, en silence (ON DELETE CASCADE sur
-- utilisateur_role.role_id), et pouvait supprimer SYSTEM_ADMIN d'un coup. Après : la base refuse (RESTRICT) et le
-- service répond 409 avant d'y arriver (RoleService.delete) — un rôle attribué n'est plus supprimable.
--
-- role_permission.role_id reste cohérent avec la suppression d'un rôle : c'est Hibernate (propriétaire de la
-- collection Role.permissions) qui supprime les liaisons du rôle avant le rôle, donc audité.

ALTER TABLE role_permission DROP CONSTRAINT fk_role_permission_role;
ALTER TABLE role_permission ADD CONSTRAINT fk_role_permission_role
    FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE RESTRICT;

ALTER TABLE role_permission DROP CONSTRAINT fk_role_permission_permission;
ALTER TABLE role_permission ADD CONSTRAINT fk_role_permission_permission
    FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE RESTRICT;

ALTER TABLE utilisateur_role DROP CONSTRAINT fk_utilisateur_role_utilisateur;
ALTER TABLE utilisateur_role ADD CONSTRAINT fk_utilisateur_role_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE RESTRICT;

ALTER TABLE utilisateur_role DROP CONSTRAINT fk_utilisateur_role_role;
ALTER TABLE utilisateur_role ADD CONSTRAINT fk_utilisateur_role_role
    FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE RESTRICT;

ALTER TABLE utilisateur_permission_refusee DROP CONSTRAINT fk_upr_utilisateur;
ALTER TABLE utilisateur_permission_refusee ADD CONSTRAINT fk_upr_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE RESTRICT;

ALTER TABLE utilisateur_permission_refusee DROP CONSTRAINT fk_upr_permission;
ALTER TABLE utilisateur_permission_refusee ADD CONSTRAINT fk_upr_permission
    FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE RESTRICT;
