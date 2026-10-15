package staport.rh.chantier.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.chantier.controller.ChantierController;
import staport.rh.common.dtos.ErrorResponseDto;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = ChantierController.class)
@Order(0)
public class ChantierExceptionHandler {

    @ExceptionHandler(ChantierNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(ChantierNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(ChantierAlreadyExistsException.class)
    public ResponseEntity<ErrorResponseDto> handleAlreadyExists(ChantierAlreadyExistsException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseDto> handleDataIntegrityViolation(DataIntegrityViolationException ex, HttpServletRequest request) {
        if ("DELETE".equalsIgnoreCase(request.getMethod())) {
            return build(HttpStatus.CONFLICT, "Ce chantier est utilisé par au moins un employé ou un bulletin de paie et ne peut pas être supprimé.", request);
        }
        return build(HttpStatus.CONFLICT, "Une contrainte d'intégrité empêche cette opération.", request);
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
