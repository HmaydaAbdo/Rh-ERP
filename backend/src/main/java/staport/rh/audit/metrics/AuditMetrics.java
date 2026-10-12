package staport.rh.audit.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.events.ActionSecurite;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Compteurs de supervision de l'audit (conventions/audit.md, « Défaillance de l'audit ») : un événement de sécurité
 * qui n'a pas pu s'écrire ne bloque pas l'opération, il doit donc au moins déclencher une alerte.
 */
@Component
public class AuditMetrics {

    private final MeterRegistry registre;
    private final AtomicInteger integriteCompromise = new AtomicInteger();
    private final AtomicInteger chaineInvalide = new AtomicInteger();

    public AuditMetrics(MeterRegistry registre) {
        this.registre = registre;
        registre.gauge("rh.audit.integrite.compromise", integriteCompromise);
        registre.gauge("rh.audit.chaine.invalide", chaineInvalide);
    }

    /** Une entrée du journal n'a pas pu s'écrire (la catégorie dit si l'opération a été bloquée ou non). */
    public void ecritureEnEchec(CategorieAudit categorie) {
        registre.counter("rh.audit.ecriture.echec", "categorie", categorie.name()).increment();
    }

    /** Un événement de sécurité a été journalisé. */
    public void evenementSecurite(ActionSecurite action) {
        registre.counter("rh.audit.evenement.securite", "action", action.name()).increment();
    }

    /** Vaut 1 quand le compte applicatif peut modifier une table d'audit, 0 sinon. */
    public void integriteCompromise(boolean compromise) {
        integriteCompromise.set(compromise ? 1 : 0);
    }

    /** Vaut 1 quand la vérification du chaînage local échoue. */
    public void chaineInvalide(boolean invalide) {
        chaineInvalide.set(invalide ? 1 : 0);
    }
}
