package staport.rh.employee.projection;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import staport.rh.employee.dtos.response.EmployeeResponseDto;

import java.util.Set;

/**
 * Règle de divulgation des données de paie d'une fiche Employé (docs/rbac/employee.md) : le salaire et son type ne sont
 * visibles qu'avec {@code PAIE_READ}, et une liste ne peut pas être triée par eux, l'ordre les dévoilerait. Une seule
 * règle pour toutes les frontières de lecture : l'API REST et les outils MCP de l'assistant IA (docs/ia.md, § 5).
 * Les autres domaines, qui lisent la fiche par {@code IEmployeeService}, reçoivent toujours le vrai salaire.
 */
public final class ProjectionPaieEmployee {

    public static final String PERMISSION_PAIE = "PAIE_READ";
    /** Champs de la fiche réservés à {@link #PERMISSION_PAIE}. */
    public static final Set<String> CHAMPS_DE_PAIE = Set.of("salaire", "typeSalaire");

    private ProjectionPaieEmployee() {
    }

    public static boolean voitLaPaie(Authentication authentification) {
        return authentification != null && authentification.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(PERMISSION_PAIE::equals);
    }

    /** La fiche telle que le lecteur peut la voir : sans {@code PAIE_READ}, sans salaire ni type. */
    public static EmployeeResponseDto pourLeLecteur(EmployeeResponseDto employe, boolean voitLaPaie) {
        if (voitLaPaie) {
            return employe;
        }
        return new EmployeeResponseDto(employe.id(), employe.version(), employe.nomPrenom(), employe.cin(), employe.dateNaissance(),
                employe.dateEmbauche(), employe.fonction(), employe.chantier(), employe.equipe(), null, null, employe.statut());
    }
}
