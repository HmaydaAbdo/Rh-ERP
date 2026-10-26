package staport.rh.mcp.outils;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;

/** Mois de paie des outils MCP : celui demandé, sinon le dernier mois importé (jamais le mois courant du calendrier). */
@Component
@ConditionalOnBooleanProperty("security.mcp.enabled")
class PeriodePaie {

    private final IPaieService paie;

    PeriodePaie(IPaieService paie) {
        this.paie = paie;
    }

    YearMonth ou(String periode) {
        if (periode != null && !periode.isBlank()) {
            return YearMonth.parse(periode.trim());
        }
        return paie.findPeriodes(null).stream().findFirst()
                .map(resume -> YearMonth.parse(resume.periode()))
                .orElseThrow(() -> new IllegalArgumentException("Aucune paie n'est encore importée."));
    }

    /** Le mois précis demandé, ou {@code null} quand l'argument est absent. */
    static YearMonth demande(String periode) {
        return periode == null || periode.isBlank() ? null : YearMonth.parse(periode.trim());
    }
}
