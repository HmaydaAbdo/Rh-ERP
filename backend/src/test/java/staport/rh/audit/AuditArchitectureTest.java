package staport.rh.audit;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaCall;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import jakarta.persistence.Entity;
import org.hibernate.envers.Audited;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.TypeOperation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Garde-fous de l'audit (conventions/audit.md, « Garde-fous automatiques ») : un oubli lors d'une évolution fait
 * échouer la CI au lieu de créer un trou silencieux dans l'historique.
 */
class AuditArchitectureTest {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("staport.rh");

    /** Entités volontairement hors des instantanés Envers — chacune dit pourquoi. */
    private static final Map<String, String> ENTITES_EXCLUES = Map.of(
            "staport.rh.auth.entities.RefreshToken",
            "Jeton technique à courte vie (secret) : sa vie est tracée par les événements de sécurité",
            "staport.rh.auth.entities.ResetPasswordToken",
            "Jeton technique à courte vie (secret) : sa vie est tracée par les événements de sécurité",
            "staport.rh.audit.entities.AuditRevision",
            "Entité de révision d'Envers : c'est l'audit lui-même",
            "staport.rh.audit.entities.AuditJournalEntry",
            "Journal d'audit : c'est l'audit lui-même");

    /**
     * Méthodes d'écriture de service qui n'ont volontairement pas de {@code @AuditableAction} — chacune dit pourquoi.
     * Toute nouvelle ligne est une décision à relire.
     */
    private static final Map<String, String> ECRITURES_NON_ANNOTEES = Map.of(
            "AuthService.login", "Ne fait qu'écrire un jeton de rafraîchissement (non audité) ; tracée par les événements de sécurité",
            "AuthService.refresh", "Ne fait que faire pivoter des jetons (non audités) ; la réutilisation d'un jeton est un événement de sécurité",
            "AuthService.logout", "Ne fait que révoquer un jeton (non audité) ; tracée par l'événement DECONNEXION",
            "AuthService.demanderReinitialisationMotDePasse", "Ne fait qu'écrire un jeton (non audité) ; tracée par l'événement MOT_DE_PASSE_OUBLIE",
            "AuthService.reinitialiserMotDePasse", "Le mot de passe est @NotAudited par principe ; tracée par l'événement MOT_DE_PASSE_REINITIALISE",
            "AuthService.revoquerSessions", "Ne fait que révoquer des jetons (non audités) ; appelée par des actions elles-mêmes tracées (désactivation, réinitialisation)",
            "UserService.adminResetPassword", "Le mot de passe est @NotAudited par principe ; tracée par l'événement MOT_DE_PASSE_REINITIALISE_PAR_ADMIN",
            "ChantierSyncTransactionalOperations.creerSiAbsent", "Transaction unitaire de CHANTIER_SYNCHRONISATION, annotée en amont : une entrée pour l'ensemble, révisions reliées par request_id");

    private static final Set<String> ECRITURES_EN_MASSE = Set.of("deleteAllInBatch", "deleteInBatch", "deleteAllByIdInBatch");

    private static String nom(JavaMethod methode) {
        return methode.getOwner().getSimpleName() + "." + methode.getName();
    }

    // --- entités ---

    @Test
    void toute_entite_est_auditee_ou_explicitement_exclue() {
        DescribedPredicate<JavaClass> exclue = new DescribedPredicate<>("explicitement exclue de l'audit") {
            @Override
            public boolean test(JavaClass classe) {
                return ENTITES_EXCLUES.containsKey(classe.getName());
            }
        };
        classes().that().areAnnotatedWith(Entity.class).and().doNotHaveModifier(JavaModifier.ABSTRACT)
                .and(DescribedPredicate.not(exclue))
                .should().beAnnotatedWith(Audited.class)
                .because("une entité sans @Audited n'a aucun historique (conventions/audit.md) : l'annoter, ou la lister "
                        + "dans ENTITES_EXCLUES avec sa justification")
                .check(CLASSES);
    }

    @Test
    void les_exclusions_designent_des_entites_qui_existent_encore() {
        // Une exclusion qui ne désigne plus rien masquerait l'oubli d'une entité renommée.
        for (String nom : ENTITES_EXCLUES.keySet()) {
            JavaClass classe = CLASSES.get(nom);
            assertThat(classe.isAnnotatedWith(Entity.class))
                    .as("%s doit rester une entité, sinon retirer l'exclusion", nom).isTrue();
            assertThat(classe.isAnnotatedWith(Audited.class))
                    .as("%s est exclue de l'audit : elle ne doit pas porter @Audited", nom).isFalse();
        }
    }

    // --- opérations ---

    @Test
    void toute_methode_d_ecriture_d_un_service_porte_une_action_d_audit_ou_une_exception_justifiee() {
        DescribedPredicate<JavaMethod> ecriture = new DescribedPredicate<>("transactionnelle en écriture") {
            @Override
            public boolean test(JavaMethod methode) {
                return methode.tryGetAnnotationOfType(Transactional.class).map(t -> !t.readOnly()).orElse(false);
            }
        };
        DescribedPredicate<JavaMethod> justifiee = new DescribedPredicate<>("justifiée dans ECRITURES_NON_ANNOTEES") {
            @Override
            public boolean test(JavaMethod methode) {
                return ECRITURES_NON_ANNOTEES.containsKey(nom(methode));
            }
        };
        methods().that().areDeclaredInClassesThat().areAnnotatedWith(Service.class)
                .or().areDeclaredInClassesThat().areAnnotatedWith(Component.class)
                .and(ecriture).and(DescribedPredicate.not(justifiee))
                .should().beAnnotatedWith(AuditableAction.class)
                .because("une écriture sans @AuditableAction n'a pas d'entrée de journal (conventions/audit.md) : "
                        + "l'annoter, ou la lister dans ECRITURES_NON_ANNOTEES avec sa justification")
                .allowEmptyShould(true)
                .check(CLASSES);
    }

    @Test
    void les_exceptions_d_ecriture_designent_des_methodes_qui_existent_encore() {
        List<String> existantes = new ArrayList<>();
        CLASSES.stream().flatMap(c -> c.getMethods().stream()).forEach(m -> existantes.add(nom(m)));
        assertThat(existantes).containsAll(ECRITURES_NON_ANNOTEES.keySet());
    }

    @Test
    void toute_action_d_operation_declare_son_type_et_son_entite_et_son_perimetre_est_un_composant() {
        List<String> anomalies = new ArrayList<>();
        CLASSES.stream().flatMap(c -> c.getMethods().stream())
                .filter(m -> m.isAnnotatedWith(AuditableAction.class))
                .forEach(m -> {
                    AuditableAction action = m.reflect().getAnnotation(AuditableAction.class);
                    if (action.categorie() == CategorieAudit.SECURITE) {
                        anomalies.add(nom(m) + " : la catégorie SECURITE est réservée aux événements");
                    }
                    if (action.categorie() == CategorieAudit.OPERATION
                            && (action.type() == TypeOperation.AUCUN || action.entite() == Void.class)) {
                        anomalies.add(nom(m) + " : une action OPERATION déclare son type et son entité");
                    }
                    if (!AnnotatedElementUtils.isAnnotated(action.perimetre(), Component.class)) {
                        anomalies.add(nom(m) + " : le périmètre " + action.perimetre().getSimpleName() + " doit être un @Component");
                    }
                });
        assertThat(anomalies).isEmpty();
    }

    // --- écritures en masse ---

    @Test
    void aucune_ecriture_en_masse_ne_contourne_l_audit() {
        DescribedPredicate<JavaCall<?>> enMasse = new DescribedPredicate<>("une écriture en masse") {
            @Override
            public boolean test(JavaCall<?> appel) {
                String methode = appel.getTarget().getName();
                boolean toutSupprimer = methode.equals("deleteAll") && appel.getTarget().getRawParameterTypes().isEmpty();
                boolean sqlDirect = methode.equals("executeUpdate")
                        || (appel.getTarget().getOwner().isAssignableTo(JdbcOperations.class)
                        && Set.of("update", "batchUpdate", "execute").contains(methode));
                return ECRITURES_EN_MASSE.contains(methode) || toutSupprimer || sqlDirect;
            }
        };
        noClasses().should().callMethodWhere(new DescribedPredicate<JavaCall<?>>("") {
            @Override
            public boolean test(JavaCall<?> appel) {
                return enMasse.test(appel);
            }
        }).because("une écriture en masse part directement en base : Envers ne voit rien (conventions/jpa.md). "
                + "Supprimer ou modifier entité par entité").check(CLASSES);
    }

    @Test
    void aucune_requete_de_modification_n_est_declaree_sur_un_repository() {
        methods().should().notBeAnnotatedWith(Modifying.class)
                .because("une requête @Modifying contourne Envers (conventions/jpa.md)")
                .allowEmptyShould(true)
                .check(CLASSES);
    }
}
