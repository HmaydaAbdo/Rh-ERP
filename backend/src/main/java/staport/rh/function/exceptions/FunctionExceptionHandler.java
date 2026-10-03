package staport.rh.function.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.function.controller.FunctionController;
import staport.rh.function.imports.FunctionImportController;
import staport.rh.function.imports.FunctionImportException;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = {FunctionController.class, FunctionImportController.class})
@Order(0)
public class FunctionExceptionHandler {

    @ExceptionHandler(FunctionNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(FunctionNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(FunctionAlreadyExistsException.class)
    public ResponseEntity<ErrorResponseDto> handleAlreadyExists(FunctionAlreadyExistsException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(FunctionImportException.class)
    public ResponseEntity<ErrorResponseDto> handleImportException(FunctionImportException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseDto> handleDataIntegrityViolation(DataIntegrityViolationException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, "Cette fonction est utilisée par au moins un employé ou un bulletin de paie et ne peut pas être supprimée.", request);
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
