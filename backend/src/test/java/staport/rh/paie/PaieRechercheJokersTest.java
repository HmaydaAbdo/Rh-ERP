package staport.rh.paie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les jokers {@code %} et {@code _} tapés dans le nom ou le CIN sont des caractères ordinaires, dans la liste
 * (Specification) comme dans les agrégats (JPQL) — deux chemins, un même comportement.
 */
class PaieRechercheJokersTest extends AuditIntegrationTestBase {

    @Autowired
    private IPaieService paieService;

    private Referentiel employeNomme(String nom, String cin, YearMonth periode) {
        Referentiel ref = donnees.creerReferentiel();
        jdbc.update("UPDATE employe SET nom_prenom = ?, cin = ? WHERE id = ?", nom, cin, ref.employeId());
        donnees.creerBulletin(ref, periode);
        return ref;
    }

    private long dansLaListe(String cin, String nom) {
        return paieService.search(new PaieSearchCriteria(cin, nom, null, null, null, null), PageRequest.of(0, 50)).getTotalElements();
    }

    private long dansLesAgregats(String cin, String nom, YearMonth periode) {
        return paieService.findPeriodes(new PaieSearchCriteria(cin, nom, periode, null, null, null)).stream()
                .mapToLong(resume -> resume.nombreBulletins()).sum();
    }

    @Test
    void un_pourcent_ou_un_tiret_bas_tape_dans_le_nom_ne_filtre_que_ce_caractere() {
        String s = DonneesDeTest.suffixeUnique();
        YearMonth periode = YearMonth.of(2091, 3);
        employeNomme("Zq%Xy " + s, "J1" + s, periode);
        employeNomme("ZqAXy " + s, "J2" + s, periode);
        employeNomme("Zq_Xy " + s, "J3" + s, periode);

        // « % » : le seul nom qui contient un pourcentage (avant : tous les noms, « % » étant un joker).
        assertThat(dansLaListe(null, "q%xy " + s)).isEqualTo(1);
        assertThat(dansLesAgregats(null, "q%xy " + s, periode)).isEqualTo(1);
        // « _ » : le seul nom qui contient un tiret bas (avant : les trois, « _ » valant un caractère quelconque).
        assertThat(dansLaListe(null, "q_xy " + s)).isEqualTo(1);
        assertThat(dansLesAgregats(null, "q_xy " + s, periode)).isEqualTo(1);
        // Sans joker, la recherche « contient » reste ce qu'elle était : insensible à la casse, sur une partie du nom.
        assertThat(dansLaListe(null, "ZQAX")).isGreaterThanOrEqualTo(1);
        assertThat(dansLesAgregats(null, "yz-introuvable " + s, periode)).isZero();
    }

    @Test
    void les_jokers_tapes_dans_le_cin_sont_traites_comme_du_texte() {
        String s = DonneesDeTest.suffixeUnique();
        YearMonth periode = YearMonth.of(2091, 4);
        employeNomme("Nom " + s + " a", "AB%" + s, periode);
        employeNomme("Nom " + s + " b", "ABX" + s, periode);

        assertThat(dansLaListe("ab%" + s, null)).isEqualTo(1);
        assertThat(dansLesAgregats("ab%" + s, null, periode)).isEqualTo(1);
        assertThat(dansLaListe("ab_" + s, null)).as("« _ » n'est pas un joker : aucun CIN ne contient de tiret bas").isZero();
        assertThat(dansLesAgregats("ab_" + s, null, periode)).isZero();
    }
}
