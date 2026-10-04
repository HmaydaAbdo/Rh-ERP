package staport.rh.auth.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.RolesSysteme;

@Mapper(componentModel = "spring", imports = RolesSysteme.class)
public interface RoleMapper {

    @Mapping(target = "protege", expression = "java(RolesSysteme.SYSTEM_ADMIN.equals(entity.getNom()))")
    RoleResponseDto toDto(Role entity);

    PermissionResponseDto toPermissionDto(Permission permission);
}
