package staport.rh.accueil.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.accueil.controller.AccueilController;
import staport.rh.auth.exceptions.UtilisateurNotFoundException;
import staport.rh.common.dtos.ErrorResponseDto;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = AccueilController.class)
@Order(0)
public class AccueilExceptionHandler {

    @ExceptionHandler(UtilisateurNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(UtilisateurNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(AccueilInvalideException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalide(AccueilInvalideException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    private ResponseEntity<ErrorResponseDto> build(HttpStatus status, String message, HttpServletRequest request) {
        ErrorResponseDto body = new ErrorResponseDto(Instant.now(), status.value(), status.getReasonPhrase(), message, request.getRequestURI());
        return ResponseEntity.status(status).body(body);
    }
}
