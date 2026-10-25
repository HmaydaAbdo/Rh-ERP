package staport.rh.auth.exceptions;

/** L'intégration IA (MCP et jeton délégué) n'est pas activée dans cet environnement (MCP_ENABLED=false). */
public class IaDesactiveeException extends RuntimeException {

    public IaDesactiveeException() {
        super("L'assistant IA n'est pas activé");
    }
}
