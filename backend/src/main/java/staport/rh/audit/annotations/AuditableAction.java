package staport.rh.audit.annotations;

import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.perimetre.PerimetreAucun;
import staport.rh.audit.perimetre.PerimetreAudit;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marque une méthode de Service dont l'exécution doit laisser une entrée dans le journal d'audit
 * (conventions/audit.md, « Audit des opérations »). Traitée par {@code GenericAuditAspect}, le seul aspect d'audit.
 *
 * <ul>
 *   <li>{@link #action()} : code stable de l'action ({@code <ENTITE>_<VERBE>}), jamais construit dynamiquement ;</li>
 *   <li>{@link #categorie()} : {@code OPERATION} (écriture, par défaut) ou {@code ACCES} (sortie de données) ;</li>
 *   <li>{@link #type()} et {@link #entite()} : obligatoires pour {@code OPERATION} (vérifié par un test d'architecture) ;</li>
 *   <li>{@link #perimetre()} : décrit une opération de masse ou un export.</li>
 * </ul>
 *
 * L'identifiant de la cible est le paramètre nommé {@code id}, sinon l'{@code id} du résultat.
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AuditableAction {

    String action();

    CategorieAudit categorie() default CategorieAudit.OPERATION;

    TypeOperation type() default TypeOperation.AUCUN;

    Class<?> entite() default Void.class;

    Class<? extends PerimetreAudit> perimetre() default PerimetreAucun.class;
}
