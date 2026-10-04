package staport.rh.audit.aspect;

import jakarta.persistence.EntityManager;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.hibernate.envers.AuditReaderFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.config.OrdreIntercepteurs;
import staport.rh.audit.context.ContexteAudit;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.AuditRevision;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.audit.services.AuditJournalWriter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Le seul aspect d'audit (conventions/audit.md, « Aspect »). Pour chaque méthode {@link AuditableAction} :
 *
 * <ul>
 *   <li>seule l'action annotée <strong>la plus externe</strong> écrit une entrée (un import qui crée des référentiels
 *       manquants n'en écrit qu'une) ;</li>
 *   <li>opération réussie : {@code flush} (les contraintes sont vérifiées avant l'entrée), puis l'entrée est écrite
 *       <strong>dans la transaction métier</strong> et liée à sa révision — tout est validé ou annulé ensemble ; si
 *       l'entrée ne peut pas s'écrire, l'opération échoue (fermé pour les données) ;</li>
 *   <li>échec, ou rejet sans exception : entrée {@code ECHEC} dans une transaction séparée — la tentative reste
 *       tracée alors que les données sont annulées ; elle ne masque jamais l'exception d'origine ;</li>
 *   <li>sortie de données ({@code ACCES}) : entrée écrite à part après le succès ; sans trace, rien ne sort.</li>
 * </ul>
 *
 * S'exécute dans la transaction métier grâce à l'ordre explicite de {@link OrdreIntercepteurs}.
 */
@Aspect
@Component
@Order(OrdreIntercepteurs.AUDIT)
public class GenericAuditAspect {

    private static final Logger log = LoggerFactory.getLogger(GenericAuditAspect.class);

    private static final ThreadLocal<Boolean> ACTION_EN_COURS = new ThreadLocal<>();

    private final AuditJournalWriter ecrivain;
    private final ApplicationContext contexteSpring;
    private final EntityManager entityManager;
    private final AuditMetrics metriques;
    private final JsonMapper jsonMapper;

    public GenericAuditAspect(AuditJournalWriter ecrivain, ApplicationContext contexteSpring,
                              EntityManager entityManager, AuditMetrics metriques, JsonMapper jsonMapper) {
        this.ecrivain = ecrivain;
        this.contexteSpring = contexteSpring;
        this.entityManager = entityManager;
        this.metriques = metriques;
        this.jsonMapper = jsonMapper;
    }

    @Around("@annotation(action)")
    public Object auditer(ProceedingJoinPoint point, AuditableAction action) throws Throwable {
        if (ACTION_EN_COURS.get() != null) {
            return point.proceed();
        }
        ACTION_EN_COURS.set(Boolean.TRUE);
        try {
            return executer(point, action);
        } finally {
            ACTION_EN_COURS.remove();
        }
    }

    private Object executer(ProceedingJoinPoint point, AuditableAction action) throws Throwable {
        verifier(action);
        ContexteAudit contexte = ResolveurContexteAudit.courant();
        PerimetreAudit perimetre = contexteSpring.getBean(action.perimetre());
        boolean ecriture = action.categorie() == CategorieAudit.OPERATION;

        Object resultat;
        try {
            resultat = point.proceed();
            if (ecriture && TransactionSynchronizationManager.isActualTransactionActive()) {
                ecrivain.flush();
            }
        } catch (Throwable echec) {
            enregistrerEchec(action, contexte, perimetre, point, null, echec.getClass().getSimpleName());
            throw echec;
        }

        DescriptionPerimetre description = decrire(perimetre, point.getArgs(), resultat);
        if (description.motifRejet() != null) {
            enregistrerEchec(action, contexte, perimetre, point, resultat, description.motifRejet());
            return resultat;
        }

        AuditJournalEntry.Builder entree = entree(action, contexte, point, resultat, description, ResultatAudit.SUCCES, null);
        try {
            if (ecriture) {
                entree.revisionId(revisionCourante());
                ecrivain.ecrire(entree.build());
            } else {
                ecrivain.ecrireSeparement(entree.build());
            }
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(action.categorie().name());
            log.error("Entrée d'audit impossible à écrire : action={}, l'opération est annulée", action.action(), impossible);
            enregistrerEchec(action, contexte, perimetre, point, resultat, "AuditIndisponible");
            throw impossible;
        }
        return resultat;
    }

    /** Révision de la transaction courante, créée si besoin : l'entrée y est liée même si rien n'a changé. */
    private Long revisionCourante() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            return null;
        }
        return AuditReaderFactory.get(entityManager).getCurrentRevision(AuditRevision.class, true).getId();
    }

    private void enregistrerEchec(AuditableAction action, ContexteAudit contexte, PerimetreAudit perimetre,
                                  ProceedingJoinPoint point, Object resultat, String motif) {
        try {
            DescriptionPerimetre description = decrire(perimetre, point.getArgs(), resultat);
            ecrivain.ecrireSeparement(entree(action, contexte, point, resultat, description, ResultatAudit.ECHEC, motif).build());
        } catch (RuntimeException impossible) {
            // Ne jamais masquer l'exception d'origine : on compte et on loggue.
            metriques.ecritureEnEchec(action.categorie().name());
            log.error("Entrée d'audit d'échec impossible à écrire : action={}", action.action(), impossible);
        }
    }

    private DescriptionPerimetre decrire(PerimetreAudit perimetre, Object[] arguments, Object resultat) {
        try {
            DescriptionPerimetre description = perimetre.decrire(arguments, resultat);
            return description != null ? description : DescriptionPerimetre.AUCUNE;
        } catch (RuntimeException e) {
            log.warn("Périmètre d'audit illisible : {}", perimetre.getClass().getSimpleName(), e);
            return DescriptionPerimetre.AUCUNE;
        }
    }

    private AuditJournalEntry.Builder entree(AuditableAction action, ContexteAudit contexte, ProceedingJoinPoint point,
                                             Object resultat, DescriptionPerimetre description, ResultatAudit resultatAudit,
                                             String motif) {
        AuditJournalEntry.Builder entree = AuditJournalWriter.entreePour(contexte)
                .categorie(action.categorie())
                .action(action.action())
                .typeOperation(action.type())
                .resultat(resultatAudit)
                .motif(motif)
                .nombreElements(description.nombreElements());
        if (action.entite() != Void.class) {
            entree.entiteType(action.entite().getSimpleName());
            entree.entiteId(CibleAudit.identifiant(point, resultat));
        }
        if (description.perimetre() != null && !description.perimetre().isEmpty()) {
            entree.perimetre(jsonMapper.writeValueAsString(description.perimetre()));
        }
        return entree;
    }

    private static void verifier(AuditableAction action) {
        if (action.categorie() == CategorieAudit.SECURITE) {
            throw new IllegalStateException("La catégorie SECURITE est réservée aux événements : " + action.action());
        }
        if (action.categorie() == CategorieAudit.OPERATION
                && (action.type() == TypeOperation.AUCUN || action.entite() == Void.class)) {
            throw new IllegalStateException("Une action OPERATION déclare son type et son entité : " + action.action());
        }
    }
}
