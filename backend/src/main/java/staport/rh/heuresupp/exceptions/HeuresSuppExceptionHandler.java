package staport.rh.heuresupp.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.heuresupp.controllers.HeuresSuppImportController;
import staport.rh.heuresupp.controllers.HeuresSuppController;
import staport.rh.heuresupp.imports.HeuresSuppImportException;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = {HeuresSuppController.class, HeuresSuppImportController.class})
@Order(0)
public class HeuresSuppExceptionHandler {

    @ExceptionHandler(HeuresSuppImportException.class)
    public ResponseEntity<ErrorResponseDto> handleImport(HeuresSuppImportException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidHeuresSuppPeriodeException.class)
    public ResponseEntity<ErrorResponseDto> handlePeriode(InvalidHeuresSuppPeriodeException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseDto> handleConflit(DataIntegrityViolationException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, "Une autre opération a modifié ce lot. Réanalysez le fichier avant de réessayer.", request);
    }

    private ResponseEntity<ErrorResponseDto> build(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ErrorResponseDto(Instant.now(), status.value(),
                status.getReasonPhrase(), message, request.getRequestURI()));
    }
}
