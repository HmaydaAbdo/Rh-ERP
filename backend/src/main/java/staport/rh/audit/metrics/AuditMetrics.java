package staport.rh.audit.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Compteurs de supervision de l'audit (conventions/audit.md, « Défaillance de l'audit ») : un événement de sécurité
 * qui n'a pas pu s'écrire ne bloque pas l'opération, il doit donc au moins déclencher une alerte.
 */
@Component
public class AuditMetrics {

    private final MeterRegistry registre;
    private final AtomicInteger integriteCompromise = new AtomicInteger();

    public AuditMetrics(MeterRegistry registre) {
        this.registre = registre;
        registre.gauge("rh.audit.integrite.compromise", integriteCompromise);
    }

    /** Une entrée du journal n'a pas pu s'écrire (la catégorie dit si l'opération a été bloquée ou non). */
    public void ecritureEnEchec(String categorie) {
        registre.counter("rh.audit.ecriture.echec", "categorie", categorie).increment();
    }

    /** Un événement de sécurité a été journalisé. */
    public void evenementSecurite(String action) {
        registre.counter("rh.audit.evenement.securite", "action", action).increment();
    }

    /** Vaut 1 quand le compte applicatif peut modifier une table d'audit, 0 sinon. */
    public void integriteCompromise(boolean compromise) {
        integriteCompromise.set(compromise ? 1 : 0);
    }
}
