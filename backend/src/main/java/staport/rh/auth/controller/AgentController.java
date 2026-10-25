package staport.rh.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.auth.dtos.response.JetonAgentResponseDto;
import staport.rh.auth.services.interfaces.IAgentService;

/** Jeton délégué de l'agent IA (docs/ia.md, § 5). */
@RestController
@Tag(name = "Agent IA", description = "Jeton délégué de l'assistant IA")
public class AgentController {

    private final IAgentService agentService;

    public AgentController(IAgentService agentService) {
        this.agentService = agentService;
    }

    @PostMapping("/auth/jetons/agent")
    @PreAuthorize("hasAuthority('IA_UTILISER')")
    @Operation(summary = "Obtenir un jeton délégué pour l'assistant IA",
            description = "Jeton RS256 de 5 minutes, identité seule : les droits sont relus à chaque appel d'outil.")
    @ApiResponse(responseCode = "403", description = "Compte désactivé ou droit IA_UTILISER absent")
    @ApiResponse(responseCode = "404", description = "Assistant IA non activé dans cet environnement")
    public ResponseEntity<JetonAgentResponseDto> emettre(@AuthenticationPrincipal Jwt jwt) {
        Number utilisateurId = jwt.getClaim("uid");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(agentService.emettreJeton(utilisateurId.longValue()));
    }
}
