package staport.rh.heuresupp.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;

import java.time.YearMonth;
import java.util.Map;
import java.util.LinkedHashMap;

@Component
public class PerimetreSuppressionGroupeHeuresSupp implements PerimetreAudit {
    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Object mois = arguments[0] instanceof YearMonth periode ? periode.toString() : null;
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("periode", mois);
        return DescriptionPerimetre.de(perimetre, resultat instanceof Number nombre ? nombre.intValue() : null);
    }
}
