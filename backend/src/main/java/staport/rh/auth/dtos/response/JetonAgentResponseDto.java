package staport.rh.auth.dtos.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Jeton délégué de l'agent IA, à transmettre au service IA avec la question")
public record JetonAgentResponseDto(
        @Schema(description = "JWT RS256, audiences erp-rh-ia et erp-rh-mcp, sans permission")
        String jeton,
        @Schema(description = "Type d'autorisation HTTP", example = "Bearer")
        String typeJeton,
        @Schema(description = "Durée de validité en secondes", example = "300")
        long expireDansSecondes
) {
}
