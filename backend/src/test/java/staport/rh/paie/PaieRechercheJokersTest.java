package staport.rh.paie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieOptionsChantierRequest;
import staport.rh.paie.dtos.request.PaieOptionsEquipeRequest;
import staport.rh.paie.services.interfaces.IPaieService;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.repositories.FiltresPaie;

import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les jokers {@code %} et {@code _} tapés dans le nom ou le CIN sont des caractères ordinaires, dans la liste
 * (Specification) comme dans les agrégats (JPQL) — deux chemins, un même comportement.
 */
class PaieRechercheJokersTest extends AuditIntegrationTestBase {

    @Autowired
    private IPaieService paieService;

    @Autowired
    private PaieRepository repository;

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

    @Test
    void tendances_du_pdf_et_effectifs_appliquent_les_memes_filtres_que_la_liste() {
        String s = DonneesDeTest.suffixeUnique();
        YearMonth periode = YearMonth.of(2091, 6);
        Referentiel retenu = employeNomme("Rapport% " + s, "RP%" + s, periode);
        employeNomme("RapportX " + s, "RPX" + s, periode);
        FiltresPaie filtres = new FiltresPaie("rapport% " + s, "rp%" + s,
                List.of(retenu.chantierId()), List.of(retenu.fonctionId()), List.of(retenu.equipeId()));

        assertThat(repository.sommerParChantierEquipePeriode(periode.minusMonths(11), periode, filtres))
                .singleElement().satisfies(ligne -> {
                    assertThat(ligne.getChantierId()).isEqualTo(retenu.chantierId());
                    assertThat(ligne.getEffectif()).isEqualTo(1L);
                });
        assertThat(repository.listerEffectifs(filtres)).extracting("employeId").containsExactly(retenu.employeId());
        FiltresPaie aucun = new FiltresPaie("rapport% " + s, null, null, List.of(-9L), null);
        assertThat(repository.sommerParChantierEquipePeriode(periode.minusMonths(11), periode, aucun)).isEmpty();
        assertThat(repository.listerEffectifs(aucun)).isEmpty();
    }

    @Test
    void les_options_des_filtres_sont_recherchees_et_pagees_par_la_base_sur_le_mois_et_le_chantier() {
        String s = DonneesDeTest.suffixeUnique();
        YearMonth periode = YearMonth.of(2091, 5);
        Referentiel a = donnees.creerReferentiel();
        Referentiel b = donnees.creerReferentiel();
        Referentiel c = donnees.creerReferentiel();
        donnees.creerBulletin(a, periode);
        donnees.creerBulletin(b, periode);
        donnees.creerBulletin(c, periode);
        jdbc.update("UPDATE chantier SET code = ?, designation = ? WHERE id = ?", "O%T-A-" + s, "Site Alpha " + s, a.chantierId());
        jdbc.update("UPDATE chantier SET code = ?, designation = ? WHERE id = ?", "OPT-B-" + s, "Site Beta " + s, b.chantierId());
        jdbc.update("UPDATE chantier SET code = ?, designation = ? WHERE id = ?", "OPT-C-" + s, "Site Gamma " + s, c.chantierId());
        jdbc.update("UPDATE equipe SET code = ?, libelle = ? WHERE id = ?", "TEAM-A-" + s, "Crew Alpha " + s, a.equipeId());
        jdbc.update("UPDATE equipe SET code = ?, libelle = ? WHERE id = ?", "TEAM-B-" + s, "Crew Beta " + s, b.equipeId());

        var premierePage = paieService.rechercherOptionsChantiers(
                new PaieOptionsChantierRequest(periode, null), PageRequest.of(0, 2));
        var deuxiemePage = paieService.rechercherOptionsChantiers(
                new PaieOptionsChantierRequest(periode, null), PageRequest.of(1, 2));
        assertThat(premierePage.getTotalElements()).isEqualTo(3);
        assertThat(premierePage.getContent()).hasSize(2);
        assertThat(deuxiemePage.getContent()).hasSize(1);

        var chantierJoker = paieService.rechercherOptionsChantiers(
                new PaieOptionsChantierRequest(periode, "%"), PageRequest.of(0, 10));
        assertThat(chantierJoker.getContent()).extracting("id").containsExactly(a.chantierId());

        var equipes = paieService.rechercherOptionsEquipes(
                new PaieOptionsEquipeRequest(periode, List.of(a.chantierId()), "crew alpha " + s), PageRequest.of(0, 10));
        assertThat(equipes.getTotalElements()).isEqualTo(1);
        assertThat(equipes.getContent()).extracting("id").containsExactly(a.equipeId());
    }
}
