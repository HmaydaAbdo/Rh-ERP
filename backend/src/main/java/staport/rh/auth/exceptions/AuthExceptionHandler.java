package staport.rh.auth.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.auth.controller.AuthController;
import staport.rh.auth.controller.RoleController;
import staport.rh.auth.controller.UserController;
import staport.rh.common.dtos.ErrorResponseDto;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = {AuthController.class, UserController.class, RoleController.class})
@Order(0)
public class AuthExceptionHandler {

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidCredentials(InvalidCredentialsException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidRefreshToken(InvalidRefreshTokenException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidResetTokenException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidResetToken(InvalidResetTokenException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler({UtilisateurNotFoundException.class, RoleNotFoundException.class})
    public ResponseEntity<ErrorResponseDto> handleNotFound(RuntimeException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler({UsernameAlreadyExistsException.class, EmailAlreadyExistsException.class, RoleAlreadyExistsException.class,
            RoleInUseException.class, ProtectedRoleException.class})
    public ResponseEntity<ErrorResponseDto> handleAlreadyExists(RuntimeException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler({UnknownPermissionException.class, InvalidReferenceException.class, MotDePasseNonConformeException.class})
    public ResponseEntity<ErrorResponseDto> handleBadRequest(RuntimeException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    private ResponseEntity<ErrorResponseDto> build(HttpStatus status, String message, HttpServletRequest request) {
        ErrorResponseDto body = new ErrorResponseDto(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI()
        );
        return ResponseEntity.status(status).body(body);
    }
}
