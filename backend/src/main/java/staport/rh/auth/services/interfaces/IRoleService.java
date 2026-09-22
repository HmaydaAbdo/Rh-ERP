package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;

import java.util.List;

public interface IRoleService {

    List<RoleResponseDto> findAll();

    RoleResponseDto findById(Long id);

    RoleResponseDto create(RoleCreateRequestDto dto);

    RoleResponseDto update(Long id, RoleUpdateRequestDto dto);

    void delete(Long id);

    List<PermissionResponseDto> findAllPermissions();
}
