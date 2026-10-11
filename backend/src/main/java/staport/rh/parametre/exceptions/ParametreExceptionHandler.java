package staport.rh.parametre.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.parametre.controller.ParametreController;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = ParametreController.class)
@Order(0)
public class ParametreExceptionHandler {

    @ExceptionHandler(ParametreNotFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNotFound(ParametreNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(ParametreInvalideException.class)
    public ResponseEntity<ErrorResponseDto> handleInvalide(ParametreInvalideException ex, HttpServletRequest request) {
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
