package staport.rh.auth.exceptions;

import java.util.Set;

public class UnknownPermissionException extends RuntimeException {

    public UnknownPermissionException(Set<String> codesInconnus) {
        super("Permission(s) inconnue(s) : " + String.join(", ", codesInconnus));
    }
}
