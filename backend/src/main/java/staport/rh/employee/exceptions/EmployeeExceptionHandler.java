package staport.rh.employee.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.employee.controller.EmployeeController;
import staport.rh.employee.imports.EmployeeImportController;
import staport.rh.employee.imports.EmployeeImportException;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = {EmployeeController.class, EmployeeImportController.class})
@Order(0)
public class EmployeeExceptionHandler {

    @ExceptionHandler(EmployeeNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(EmployeeNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(CinAlreadyExistsException.class)
    public ResponseEntity<ErrorResponseDto> handleCinAlreadyExists(CinAlreadyExistsException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidReferenceException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidReference(InvalidReferenceException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    /** La base refuse de supprimer un employé encore référencé : un refus explicite (409), comme pour les autres référentiels. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseDto> handleDataIntegrityViolation(DataIntegrityViolationException ex, HttpServletRequest request) {
        if ("DELETE".equalsIgnoreCase(request.getMethod())) {
            return build(HttpStatus.CONFLICT, "Cet employé est lié à au moins un bulletin de paie ou un compte utilisateur et ne peut pas être supprimé. "
                    + "Passez-le à INACTIF pour conserver son historique.", request);
        }
        return build(HttpStatus.CONFLICT, "Une contrainte d'intégrité empêche cette opération.", request);
    }

    @ExceptionHandler(EmployeeImportException.class)
    public ResponseEntity<ErrorResponseDto> handleImportException(EmployeeImportException ex, HttpServletRequest request) {
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
