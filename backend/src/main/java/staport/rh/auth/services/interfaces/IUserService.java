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

    /** Vrai si au moins un compte porte déjà le rôle SYSTEM_ADMIN — voir AdminBootstrapRunner. */
    boolean adminExiste();

    /** Crée le compte SYSTEM_ADMIN de bootstrap et retourne son identifiant — voir AdminBootstrapRunner. */
    Long creerAdminInitial(String username, String email, String motDePasse);
}
