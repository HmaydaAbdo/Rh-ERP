package staport.rh.auth.mappers;

import org.mapstruct.Mapper;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;

@Mapper(componentModel = "spring")
public interface RoleMapper {

    RoleResponseDto toDto(Role entity);

    PermissionResponseDto toPermissionDto(Permission permission);
}
