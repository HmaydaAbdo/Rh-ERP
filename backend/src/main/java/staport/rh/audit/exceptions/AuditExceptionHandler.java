package staport.rh.audit.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import staport.rh.audit.controller.AuditController;
import staport.rh.common.dtos.ErrorResponseDto;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = AuditController.class)
@Order(0)
public class AuditExceptionHandler {

    @ExceptionHandler({AuditEntryNotFoundException.class, UnknownAuditEntityException.class})
    public ResponseEntity<ErrorResponseDto> handleNotFound(RuntimeException ex, HttpServletRequest request) {
        ErrorResponseDto body = new ErrorResponseDto(
                Instant.now(),
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI()
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }
}
