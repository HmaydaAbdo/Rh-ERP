package staport.rh.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_FIELD_INJECTION;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING;

/**
 * Garde-fous des conventions d'architecture (conventions/architecture.md, jpa.md, logging.md, swagger.md) : un écart
 * introduit lors d'une évolution fait échouer le build au lieu de s'installer en silence. Complète
 * {@code AuditArchitectureTest} (audit) et {@code EndpointSecurityTest} (permissions des routes).
 */
class ArchitectureConventionsTest {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("staport.rh");

    /** Les domaines métier et techniques : un package racine chacun (conventions/architecture.md, « Organisation des packages »). */
    private static final List<String> DOMAINES = List.of("audit", "auth", "chantier", "employee", "equipe", "function", "mcp", "paie", "parametre");

    private static final DescribedPredicate<JavaClass> UN_CONTROLLEUR = DescribedPredicate.describe(
            "contrôleur REST", classe -> classe.isAnnotatedWith(RestController.class));

    // --- couches ---

    @Test
    void un_controleur_n_accede_jamais_a_un_repository() {
        noClasses().that(UN_CONTROLLEUR).should().dependOnClassesThat().resideInAPackage("..repositories..")
                .because("un contrôleur délègue au service (conventions/architecture.md, « Controller »)")
                .check(CLASSES);
    }

    @Test
    void un_mapper_ne_fait_que_convertir() {
        noClasses().that().resideInAPackage("..mappers..").should().dependOnClassesThat()
                .resideInAnyPackage("..repositories..", "..services..", "..controller..")
                .because("un mapper convertit, sans logique métier ni accès aux données (conventions/architecture.md, « Mapper »)")
                .check(CLASSES);
    }

    @Test
    void un_repository_ne_depend_ni_d_un_service_ni_d_un_controleur() {
        noClasses().that().resideInAPackage("..repositories..").should().dependOnClassesThat()
                .resideInAnyPackage("..services..", "..controller..")
                .because("un repository n'a aucune logique métier (conventions/jpa.md, « Repository »)")
                .check(CLASSES);
    }

    @Test
    void une_entite_ne_depend_ni_de_l_api_ni_des_services() {
        noClasses().that().areAnnotatedWith(Entity.class).should().dependOnClassesThat()
                .resideInAnyPackage("..dtos..", "..services..", "..controller..", "..mappers..", "..repositories..")
                .because("une entité est un modèle de persistance, sans logique (conventions/architecture.md, « Entity »)")
                .check(CLASSES);
    }

    @Test
    void un_controleur_n_expose_jamais_une_entite_jpa() {
        noClasses().that(UN_CONTROLLEUR).should().dependOnClassesThat().areAnnotatedWith(Entity.class)
                .because("les entités ne sortent jamais par l'API : des DTO (conventions/architecture.md, « Entity »)")
                .check(CLASSES);
    }

    @Test
    void les_dto_sont_des_records() {
        classes().that().resideInAPackage("..dtos..").and().areNotNestedClasses().should().beRecords()
                .because("DTO : Java Records uniquement (conventions/architecture.md, « DTO »)")
                .check(CLASSES);
    }

    // --- frontières entre domaines ---

    @Test
    void un_domaine_n_utilise_ni_le_repository_ni_le_service_concret_d_un_autre() {
        for (String domaine : DOMAINES) {
            List<String> interdits = DOMAINES.stream().filter(autre -> !autre.equals(domaine))
                    .flatMap(autre -> java.util.stream.Stream.of("staport.rh." + autre + "..repositories..", "staport.rh." + autre + ".services"))
                    .toList();
            noClasses().that().resideInAPackage("staport.rh." + domaine + "..").should().dependOnClassesThat()
                    .resideInAnyPackage(interdits.toArray(String[]::new))
                    .because("la communication inter-domaines passe par la façade I<Domaine>Service uniquement (conventions/architecture.md, « Encapsulation des domaines »)")
                    .check(CLASSES);
        }
    }

    // --- injection, journalisation ---

    @Test
    void l_injection_se_fait_par_le_constructeur() {
        NO_CLASSES_SHOULD_USE_FIELD_INJECTION.check(CLASSES);
    }

    @Test
    void aucune_sortie_standard_ni_java_util_logging() {
        NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS.because("les logs passent par SLF4J (conventions/logging.md)").check(CLASSES);
        NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING.check(CLASSES);
    }

    @Test
    void un_logger_est_un_champ_prive_statique_final_nomme_log() {
        fields().that().haveRawType(Logger.class).should().bePrivate().andShould().beStatic().andShould().beFinal()
                .andShould().haveName("log")
                .because("conventions/logging.md, « Logger »")
                .check(CLASSES);
    }

    @Test
    void les_logs_metier_s_ecrivent_dans_les_services_pas_dans_les_couches_d_acces() {
        noClasses().that(UN_CONTROLLEUR).or().resideInAnyPackage("..repositories..", "..mappers..")
                .should().dependOnClassesThat().areAssignableTo(Logger.class)
                .because("conventions/logging.md, « Emplacement »")
                .check(CLASSES);
    }

    // --- JPA ---

    @Test
    void toute_entite_declare_sa_table() {
        classes().that().areAnnotatedWith(Entity.class).should().beAnnotatedWith(Table.class)
                .because("le nom de la table est explicite (conventions/jpa.md, « Entités »)")
                .check(CLASSES);
    }

    @Test
    void toute_entite_modifiable_est_versionnee() {
        List<String> entitesAppendOnly = List.of(
                "staport.rh.audit.entities.AuditRevision",
                "staport.rh.audit.entities.AuditJournalEntry");
        classes().that().areAnnotatedWith(Entity.class).should(new ArchCondition<>("déclarer @Version, sauf les journaux immuables") {
            @Override
            public void check(JavaClass entite, ConditionEvents evenements) {
                boolean appendOnly = entitesAppendOnly.contains(entite.getName());
                boolean versionnee = entite.getFields().stream().anyMatch(champ -> champ.isAnnotatedWith(Version.class));
                if (!appendOnly && !versionnee) {
                    evenements.add(SimpleConditionEvent.violated(entite,
                            entite.getName() + " est modifiable mais ne déclare pas de @Version"));
                }
            }
        }).because("les écritures concurrentes doivent être détectées (conventions/jpa.md, « Entités »)")
                .check(CLASSES);
    }

    @Test
    void aucune_relation_n_est_chargee_en_eager() {
        fields().that().areAnnotatedWith(ManyToOne.class).or().areAnnotatedWith(OneToOne.class)
                .or().areAnnotatedWith(OneToMany.class).or().areAnnotatedWith(ManyToMany.class)
                .should(new ArchCondition<JavaField>("être chargée en LAZY") {
                    @Override
                    public void check(JavaField champ, ConditionEvents evenements) {
                        FetchType fetch = champ.tryGetAnnotationOfType(ManyToOne.class).map(ManyToOne::fetch)
                                .or(() -> champ.tryGetAnnotationOfType(OneToOne.class).map(OneToOne::fetch))
                                .or(() -> champ.tryGetAnnotationOfType(OneToMany.class).map(OneToMany::fetch))
                                .or(() -> champ.tryGetAnnotationOfType(ManyToMany.class).map(ManyToMany::fetch))
                                .orElse(FetchType.LAZY);
                        if (fetch == FetchType.EAGER) {
                            evenements.add(SimpleConditionEvent.violated(champ, champ.getFullName() + " est en EAGER"));
                        }
                    }
                })
                .because("FetchType.LAZY par défaut, @EntityGraph pour charger ce qui est nécessaire (conventions/jpa.md, « Relations »)")
                .check(CLASSES);
    }

    // --- documentation d'API ---

    @Test
    void chaque_controleur_porte_un_tag_et_chaque_route_une_operation() {
        classes().that(UN_CONTROLLEUR).should().beAnnotatedWith(Tag.class)
                .because("conventions/swagger.md, « @Tag »").check(CLASSES);

        methods().that().areDeclaredInClassesThat(UN_CONTROLLEUR).and(uneRoute())
                .should().beAnnotatedWith(Operation.class)
                .because("conventions/swagger.md, « @Operation »").check(CLASSES);
    }

    private static DescribedPredicate<JavaMethod> uneRoute() {
        return DescribedPredicate.describe("route HTTP", methode -> methode.isAnnotatedWith(GetMapping.class)
                || methode.isAnnotatedWith(PostMapping.class) || methode.isAnnotatedWith(PutMapping.class)
                || methode.isAnnotatedWith(DeleteMapping.class) || methode.isAnnotatedWith(PatchMapping.class)
                || methode.isAnnotatedWith(RequestMapping.class));
    }
}
