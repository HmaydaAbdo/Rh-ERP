package staport.rh.parametre;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.parametre.dtos.request.ParametreUpdateRequestDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.entities.CleParametre;
import staport.rh.parametre.exceptions.ParametreInvalideException;
import staport.rh.parametre.exceptions.ParametreNotFoundException;
import staport.rh.parametre.services.interfaces.IParametreService;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Les paramètres administrables sur une vraie base : valeurs de départ posées par la migration V16, modification qui se
 * lit aussitôt, refus d'une valeur hors catalogue, et trace dans le journal d'audit avec l'ancienne et la nouvelle valeur.
 */
class ParametreServiceTest extends AuditIntegrationTestBase {

    @Autowired
    private IParametreService parametres;

    @AfterEach
    void remettreLesValeursDeDepart() {
        remettre(CleParametre.JETON_SESSION, "12");
        remettre(CleParametre.LONGUEUR_MOT_DE_PASSE, "10");
    }

    private void remettre(CleParametre cle, String valeur) {
        Long id = idDe(cle);
        parametres.update(id, new ParametreUpdateRequestDto(versionDe(id), valeur));
    }

    private Long idDe(CleParametre cle) {
        return parametres.findAll().stream().filter(p -> p.cle().equals(cle.code())).findFirst().orElseThrow().id();
    }

    private Long versionDe(Long id) {
        return parametres.findAll().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().version();
    }

    @Test
    void la_migration_pose_une_valeur_de_depart_pour_chaque_cle_du_catalogue() {
        assertThat(parametres.findAll()).extracting(ParametreResponseDto::cle)
                .containsExactlyInAnyOrder(java.util.Arrays.stream(CleParametre.values()).map(CleParametre::code).toArray(String[]::new));
        assertThat(parametres.dureeJetonAcces()).isEqualTo(Duration.ofMinutes(15));
        assertThat(parametres.dureeJetonSession()).as("la session passe de 30 jours à 12 heures").isEqualTo(Duration.ofHours(12));
        assertThat(parametres.dureeLienReinitialisation()).isEqualTo(Duration.ofHours(1));
        assertThat(parametres.longueurMinimaleMotDePasse()).isEqualTo(10);
        assertThat(parametres.pasTrancheAnalytique()).isEqualByComparingTo("500");
        assertThat(parametres.cronSynchronisationChantiers()).isEqualTo("0 0 23 * * *");
    }

    @Test
    void une_modification_se_lit_aussitot_et_laisse_une_entree_d_audit_avec_l_ancienne_et_la_nouvelle_valeur() {
        Long id = idDe(CleParametre.JETON_SESSION);

        ParametreResponseDto modifie = parametres.update(id, new ParametreUpdateRequestDto(versionDe(id), " 8 "));

        assertThat(modifie.valeur()).as("espaces retirés").isEqualTo("8");
        assertThat(parametres.dureeJetonSession()).isEqualTo(Duration.ofHours(8));
        // Les autres tests de la classe modifient aussi ce paramètre (puis le remettent) : on lit la dernière entrée.
        java.util.List<Map<String, Object>> entrees = entrees("PARAMETRE_MODIFICATION", id);
        Map<String, Object> entree = entrees.get(entrees.size() - 1);
        assertThat(entree.get("type_operation")).isEqualTo("UPDATE");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(lignesAud("parametre_aud", revisionDe(entree), (short) 1)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT valeur FROM parametre_aud WHERE id = ? AND rev = ?", String.class, id, revisionDe(entree)))
                .isEqualTo("8");
    }

    @Test
    void une_valeur_hors_bornes_ou_d_un_autre_type_est_refusee_sans_rien_changer() {
        Long id = idDe(CleParametre.LONGUEUR_MOT_DE_PASSE);

        Long version = versionDe(id);
        assertThatThrownBy(() -> parametres.update(id, new ParametreUpdateRequestDto(version, "3")))
                .isInstanceOf(ParametreInvalideException.class).hasMessageContaining("entre 8 et 100");
        assertThatThrownBy(() -> parametres.update(id, new ParametreUpdateRequestDto(version, "dix")))
                .isInstanceOf(ParametreInvalideException.class);

        assertThat(parametres.longueurMinimaleMotDePasse()).isEqualTo(10);
    }

    @Test
    void un_parametre_inconnu_est_introuvable() {
        assertThatThrownBy(() -> parametres.update(-1L, new ParametreUpdateRequestDto(0L, "5")))
                .isInstanceOf(ParametreNotFoundException.class);
    }

    @Test
    void une_expression_cron_invalide_est_refusee() {
        Long id = idDe(CleParametre.CRON_SYNCHRONISATION_CHANTIERS);

        assertThatThrownBy(() -> parametres.update(id, new ParametreUpdateRequestDto(versionDe(id), "tous les soirs")))
                .isInstanceOf(ParametreInvalideException.class).hasMessageContaining("cron");
        assertThat(parametres.cronSynchronisationChantiers()).isEqualTo("0 0 23 * * *");
    }
}
