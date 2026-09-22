package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.request.AdminResetPasswordRequestDto;
import staport.rh.auth.dtos.request.DenyPermissionsRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.response.UserResponseDto;

import java.util.List;

public interface IUserService {

    List<UserResponseDto> findAll();

    UserResponseDto findById(Long id);

    UserResponseDto create(UserCreateRequestDto dto);

    UserResponseDto update(Long id, UserUpdateRequestDto dto);

    UserResponseDto updateDeniedPermissions(Long id, DenyPermissionsRequestDto dto);

    void adminResetPassword(Long id, AdminResetPasswordRequestDto dto);

    /** Crée le compte SYSTEM_ADMIN de bootstrap si aucun n'existe encore — voir AdminBootstrapRunner. */
    void bootstrapAdminIfMissing(String username, String email, String motDePasse);
}
