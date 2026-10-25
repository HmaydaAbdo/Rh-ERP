package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.response.IdentiteAgentDto;
import staport.rh.auth.dtos.response.JetonAgentResponseDto;

import java.util.Map;
import java.util.Optional;

/**
 * Façade du domaine auth pour l'agent IA (docs/ia.md, § 5) : émission du jeton délégué, clés publiques et
 * identité effective d'un appel MCP.
 */
public interface IAgentService {

    /**
     * Émet un jeton délégué pour l'utilisateur connecté, après avoir revérifié en base que son compte est actif et
     * qu'il détient toujours {@code IA_UTILISER}.
     *
     * @throws staport.rh.auth.exceptions.IaDesactiveeException si MCP est désactivé dans cet environnement
     * @throws org.springframework.security.access.AccessDeniedException si le compte ou le droit ne le permet plus
     */
    JetonAgentResponseDto emettreJeton(Long utilisateurId);

    /** Document JWKS des clés publiques acceptées. */
    Map<String, Object> clesPubliques();

    /** Identité effective d'un compte actif, vide pour un compte inconnu ou désactivé. */
    Optional<IdentiteAgentDto> identiteActive(Long utilisateurId);
}
