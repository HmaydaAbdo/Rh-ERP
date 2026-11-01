package staport.rh.accueil;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.accueil.dtos.request.AccueilUpdateRequestDto;
import staport.rh.accueil.dtos.response.AccueilResponseDto;
import staport.rh.accueil.dtos.response.IndicateurDisponibleDto;
import staport.rh.accueil.exceptions.AccueilInvalideException;
import staport.rh.accueil.services.interfaces.IAccueilService;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.services.interfaces.IRoleService;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.common.exception.ConflitModificationException;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * L'accueil sur une vraie base : tous les indicateurs autorisés tant que rien n'est choisi, filtre par permissions, choix
 * ordonné, refus d'un indicateur inconnu, en double ou non autorisé, version optimiste, et retour au défaut.
 */
class AccueilServiceTest extends AuditIntegrationTestBase {

    @Autowired
    private IAccueilService accueil;
    @Autowired
    private IUserService userService;
    @Autowired
    private IRoleService roleService;

    private UserResponseDto compteAvec(String... permissions) {
        String s = Long.toHexString(System.nanoTime());
        Set<Long> ids = Set.of(permissions).stream()
                .map(code -> jdbc.queryForObject("SELECT id FROM permission WHERE code = ?", Long.class, code))
                .collect(java.util.stream.Collectors.toSet());
        Long role = roleService.create(new RoleCreateRequestDto("A-" + s, "rôle de test", ids)).id();
        return userService.create(new UserCreateRequestDto("a" + s, s + "@exemple.test", "motdepasse1", null, Set.of(role)));
    }

    @Test
    void sans_choix_l_accueil_montre_tous_les_indicateurs_autorises_et_seulement_ceux_la() {
        UserResponseDto compte = compteAvec("PAIE_READ");

        AccueilResponseDto reponse = accueil.lire(compte.username());

        assertThat(reponse.personnalise()).isFalse();
        assertThat(reponse.version()).isNull();
        assertThat(reponse.indicateurs()).containsExactly("paie.masse", "paie.effectif", "paie.cout-moyen", "paie.stc");
        assertThat(reponse.disponibles()).extracting(IndicateurDisponibleDto::code).containsExactlyElementsOf(reponse.indicateurs());
    }

    @Test
    void le_choix_est_ordonne_relu_puis_se_reinitialise() {
        UserResponseDto compte = compteAvec("PAIE_READ", "EMPLOYEE_READ");

        AccueilResponseDto choisi = accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("employe.effectif", "paie.masse")));

        assertThat(choisi.personnalise()).isTrue();
        assertThat(accueil.lire(compte.username()).indicateurs()).containsExactly("employe.effectif", "paie.masse");

        AccueilResponseDto modifie = accueil.enregistrerDe(compte.id(), new AccueilUpdateRequestDto(choisi.version(), List.of("paie.masse")));
        assertThat(modifie.indicateurs()).containsExactly("paie.masse");

        AccueilResponseDto defaut = accueil.reinitialiserDe(compte.id());
        assertThat(defaut.personnalise()).isFalse();
        assertThat(defaut.indicateurs()).hasSize(9);
    }

    @Test
    void un_indicateur_inconnu_en_double_ou_non_autorise_est_refuse() {
        UserResponseDto compte = compteAvec("PAIE_READ");

        assertThatThrownBy(() -> accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("inconnu"))))
                .isInstanceOf(AccueilInvalideException.class);
        assertThatThrownBy(() -> accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("paie.masse", "paie.masse"))))
                .isInstanceOf(AccueilInvalideException.class);
        assertThatThrownBy(() -> accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("employe.effectif"))))
                .as("EMPLOYEE_READ manque").isInstanceOf(AccueilInvalideException.class);
    }

    @Test
    void une_version_perimee_est_refusee() {
        UserResponseDto compte = compteAvec("PAIE_READ");
        AccueilResponseDto premier = accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("paie.masse")));
        accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(premier.version(), List.of("paie.stc")));

        assertThatThrownBy(() -> accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(premier.version(), List.of("paie.effectif"))))
                .isInstanceOf(ConflitModificationException.class);
    }

    @Test
    void un_choix_perd_les_indicateurs_dont_la_permission_est_retiree() {
        UserResponseDto compte = compteAvec("PAIE_READ", "EMPLOYEE_READ");
        accueil.enregistrer(compte.username(), new AccueilUpdateRequestDto(null, List.of("employe.effectif", "paie.masse")));
        jdbc.update("DELETE FROM role_permission WHERE permission_id = (SELECT id FROM permission WHERE code = 'EMPLOYEE_READ') "
                + "AND role_id IN (SELECT role_id FROM utilisateur_role WHERE utilisateur_id = ?)", compte.id());

        assertThat(accueil.lire(compte.username()).indicateurs()).containsExactly("paie.masse");
    }
}
