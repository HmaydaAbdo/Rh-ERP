package staport.rh.paie.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.paie.controller.PaieController;
import staport.rh.paie.export.PaieExportController;
import staport.rh.paie.imports.PaieImportController;
import staport.rh.paie.imports.PaieImportException;
import staport.rh.paie.report.PaieReportController;
import java.time.Instant;

@RestControllerAdvice(assignableTypes = {PaieController.class, PaieImportController.class, PaieExportController.class, PaieReportController.class})
@Order(0)
public class PaieExceptionHandler {

    @ExceptionHandler(PaieNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(PaieNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(AucunePaiePeriodeException.class)
    public ResponseEntity<ErrorResponseDto> handleAucunePaiePeriode(AucunePaiePeriodeException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(PaieAlreadyExistsException.class)
    public ResponseEntity<ErrorResponseDto> handleAlreadyExists(PaieAlreadyExistsException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(PaieGroupeModifieException.class)
    public ResponseEntity<ErrorResponseDto> handleGroupeModifie(PaieGroupeModifieException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidReferenceException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidReference(InvalidReferenceException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(PaieImportException.class)
    public ResponseEntity<ErrorResponseDto> handleImportException(PaieImportException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(InvalidPeriodeException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalidPeriode(InvalidPeriodeException ex, HttpServletRequest request) {
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
