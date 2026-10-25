package staport.rh.auth.security;

import java.time.Duration;

/**
 * Contrat du jeton délégué de l'agent IA (docs/ia.md, § 5) : identité seulement, jamais de permission. Spring relit
 * le compte et ses droits effectifs à chaque appel MCP.
 */
public final class JetonAgent {

    /** Le service IA authentifie l'utilisateur avec ce jeton… */
    public static final String AUDIENCE_IA = "erp-rh-ia";
    /** …puis le présente au serveur MCP, second destinataire prévu. */
    public static final String AUDIENCE_MCP = "erp-rh-mcp";
    public static final String CLAIM_SCOPE = "scope";
    public static final String SCOPE_LECTURE = "mcp:lecture";
    /** Autorité attribuée quand le jeton porte {@link #SCOPE_LECTURE}. */
    public static final String AUTORITE_LECTURE = "SCOPE_" + SCOPE_LECTURE;
    /** Droit d'utiliser l'IA, revérifié à l'émission et à chaque appel MCP. */
    public static final String PERMISSION_IA = "IA_UTILISER";
    public static final Duration DUREE = Duration.ofMinutes(5);

    private JetonAgent() {
    }
}
