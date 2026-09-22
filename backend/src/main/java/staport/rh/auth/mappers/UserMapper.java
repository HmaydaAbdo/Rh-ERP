package staport.rh.auth.mappers;

import org.mapstruct.Mapper;
import staport.rh.auth.dtos.response.EmployeeSummaryDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleSummaryDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.employee.entities.Employee;

import java.util.Set;

/**
 * Conversion uniquement — le calcul des permissions effectives (union des rôles, moins les deny
 * overrides) est une règle métier et reste dans {@code EffectivePermissionResolver}/le Service,
 * jamais dans le Mapper (conventions/architecture.md).
 */
@Mapper(componentModel = "spring")
public interface UserMapper {

    UserResponseDto toDto(Utilisateur entity, Set<String> permissionsEffectives);

    RoleSummaryDto toRoleSummary(Role role);

    PermissionResponseDto toPermissionDto(Permission permission);

    EmployeeSummaryDto toEmployeeSummary(Employee employee);
}
