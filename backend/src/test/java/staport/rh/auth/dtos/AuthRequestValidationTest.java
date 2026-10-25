package staport.rh.auth.dtos;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.request.DenyPermissionsRequestDto;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Les bornes HTTP protègent les tailles de stockage avant tout appel au service. */
class AuthRequestValidationTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = FACTORY.getValidator();

    @AfterAll
    static void fermerValidateur() {
        FACTORY.close();
    }

    @Test
    void laCreationEtLaModificationDeCompteRefusentUnEmailAuDelaDeLaColonne() {
        String email = "a".repeat(250) + "@exemple.test";
        for (Object dto : Set.of(
                new UserCreateRequestDto("compte", email, "mot-de-passe-valide", null, Set.of()),
                new UserUpdateRequestDto(0L, email, true, null, Set.of()))) {
            assertThat(VALIDATOR.validate(dto)).anySatisfy(violation -> {
                assertThat(violation.getPropertyPath().toString()).isEqualTo("email");
                assertThat(violation.getConstraintDescriptor().getAnnotation()).isInstanceOf(Size.class);
            });
        }
    }

    @Test
    void leNomEtLaDescriptionDesRolesRespectentLesMemesBornesEnCreationEtModification() {
        for (Object dto : Set.of(
                new RoleCreateRequestDto("A", "d".repeat(256), Set.of()),
                new RoleUpdateRequestDto(0L, "A", "d".repeat(256), Set.of()))) {
            assertThat(VALIDATOR.validate(dto)).extracting(violation -> violation.getPropertyPath().toString())
                    .containsExactlyInAnyOrder("nom", "description");
        }
    }

    @Test
    void lesContratsValidesAcceptentLeLienEmployeEtLesCollectionsVides() {
        assertThat(VALIDATOR.validate(new UserCreateRequestDto("compte", "compte@exemple.test", "mot-de-passe-valide", null, Set.of())))
                .isEmpty();
        assertThat(VALIDATOR.validate(new RoleCreateRequestDto("RH", null, Set.of()))).isEmpty();
    }

    @Test
    void lesIdentifiantsDeDroitsEtRolesSontPositifsEtNeContiennentPasDeNull() {
        Set<Long> invalides = new HashSet<>(Arrays.asList(null, 0L, -1L));
        for (Object dto : Set.of(
                new RoleCreateRequestDto("RH", null, invalides),
                new RoleUpdateRequestDto(0L, "RH", null, invalides),
                new UserCreateRequestDto("compte", "compte@exemple.test", "mot-de-passe-valide", null, invalides),
                new UserUpdateRequestDto(0L, "compte@exemple.test", true, null, invalides),
                new DenyPermissionsRequestDto(0L, invalides))) {
            assertThat(VALIDATOR.validate(dto)).hasSize(3);
        }
    }

    @Test
    void lesTaillesDeNomPortentSurLaValeurSansEspacesExterieurs() {
        assertThat(VALIDATOR.validate(new UserCreateRequestDto("  a  ", "compte@exemple.test", "mot-de-passe-valide", null, Set.of())))
                .extracting(violation -> violation.getPropertyPath().toString()).containsExactly("username");
        assertThat(VALIDATOR.validate(new RoleCreateRequestDto("  A  ", null, Set.of())))
                .extracting(violation -> violation.getPropertyPath().toString()).containsExactly("nom");
        RoleUpdateRequestDto role = new RoleUpdateRequestDto(0L, " RH ", null, Set.of());
        UserUpdateRequestDto compte = new UserUpdateRequestDto(0L, " compte@exemple.test ", true, null, Set.of());
        assertThat(role.nom()).isEqualTo("RH");
        assertThat(compte.email()).isEqualTo("compte@exemple.test");
        assertThat(VALIDATOR.validate(role)).isEmpty();
        assertThat(VALIDATOR.validate(compte)).isEmpty();
    }
}
