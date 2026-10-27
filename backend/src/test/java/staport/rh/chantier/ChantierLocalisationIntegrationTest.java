package staport.rh.chantier;

import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.chantier.controller.ChantierController;
import staport.rh.chantier.dtos.request.*;
import staport.rh.chantier.entities.NatureChantier;
import staport.rh.chantier.exceptions.ChantierExceptionHandler;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.common.exception.GlobalExceptionHandler;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Vraie persistance PostgreSQL, mapping Hibernate, audit et contrat HTTP avec les vrais services. */
@TestPropertySource(properties = "security.cors.allowed-origins=http://localhost:4200")
class ChantierLocalisationIntegrationTest extends AuditIntegrationTestBase {
    @Autowired IChantierService chantiers;
    @Autowired Validator validation;

    @Test
    void qualification_modification_statut_et_retrait_de_la_carte_sont_audites() {
        var cree = chantiers.create(new ChantierCreateRequestDto("GEO-" + UUID.randomUUID(), "Site synthétique", null,
                NatureChantier.CONCASSAGE, "google.com/maps?q=10.12345678,-20.12345678", null, null, true));
        assertThat(cree.latitude()).isEqualByComparingTo("10.12345678");
        assertThat(chantiers.carte()).anyMatch(c -> c.id().equals(cree.id()) && c.nature() == NatureChantier.CONCASSAGE);
        var entree = uneEntree("CHANTIER_CREATION", cree.id());
        assertThat(jdbc.queryForObject("SELECT latitude FROM chantier_aud WHERE id = ? AND rev = ?", BigDecimal.class, cree.id(), revisionDe(entree)))
                .isEqualByComparingTo(cree.latitude());

        var cloture = chantiers.changerStatut(cree.id(), new ChantierStatutRequestDto(cree.version(), false));
        assertThat(cloture.nature()).isEqualTo(cree.nature());
        assertThat(cloture.localisation()).isEqualTo(cree.localisation());
        assertThat(cloture.afficherSurCarte()).isTrue();

        var retire = chantiers.update(cree.id(), new ChantierUpdateRequestDto(cloture.version(), cloture.code(), cloture.designation(), null,
                false, cloture.nature(), null, BigDecimal.ZERO, BigDecimal.ZERO, false));
        assertThat(retire.latitude()).isEqualByComparingTo("0");
        assertThat(chantiers.carte()).noneMatch(c -> c.id().equals(cree.id()));
        assertThatThrownBy(() -> chantiers.changerStatut(cree.id(), new ChantierStatutRequestDto(cree.version(), true)))
                .isInstanceOf(staport.rh.common.exception.ConflitModificationException.class);
        assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
    }

    @Test
    void les_chantiers_non_qualifies_restent_hors_carte_et_peuvent_etre_clotures() {
        var ref = donnees.creerReferentiel();
        var ancien = chantiers.findById(ref.chantierId());
        assertThat(ancien.nature()).isNull();
        assertThat(ancien.afficherSurCarte()).isFalse();
        var cloture = chantiers.changerStatut(ancien.id(), new ChantierStatutRequestDto(ancien.version(), false));
        assertThat(cloture.actif()).isFalse();
        assertThat(cloture.nature()).isNull();
        assertThat(chantiers.carte()).noneMatch(c -> c.id().equals(ancien.id()));
    }

    @Test
    void une_modification_geographique_refusee_conserve_la_fiche_et_trace_son_echec() {
        var cree = chantiers.create(new ChantierCreateRequestDto("ROLLBACK-" + UUID.randomUUID(), "Site synthétique", null,
                NatureChantier.AO, null, BigDecimal.TEN, BigDecimal.valueOf(20), true));
        assertThatThrownBy(() -> chantiers.update(cree.id(), new ChantierUpdateRequestDto(cree.version(), cree.code(), "Ne doit pas être enregistré", null,
                true, NatureChantier.CONCASSAGE, "https://example.test/?q=10,20", null, null, true)))
                .isInstanceOf(staport.rh.chantier.exceptions.ChantierLocalisationException.class);
        var conserve = chantiers.findById(cree.id());
        assertThat(conserve.designation()).isEqualTo(cree.designation());
        assertThat(conserve.nature()).isEqualTo(NatureChantier.AO);
        assertThat(conserve.version()).isEqualTo(cree.version());
        var echecs = entrees("CHANTIER_MODIFICATION", cree.id());
        assertThat(echecs).hasSize(1);
        assertThat(echecs.getFirst().get("resultat")).isEqualTo("ECHEC");
        assertThat(echecs.getFirst().get("revision_id")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chantier_aud WHERE id = ?", Long.class, cree.id())).isEqualTo(1);
    }

    @Test
    void le_contrat_http_refuse_les_champs_requis_absents_et_les_liens_invalides() throws Exception {
        var http = MockMvcBuilders.standaloneSetup(new ChantierController(chantiers))
                .setControllerAdvice(new ChantierExceptionHandler(), new GlobalExceptionHandler()).build();
        http.perform(post("/chantiers").contentType("application/json").content("""
                {"code":"HTTP-GEO","designation":"Test"}
                """)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("nature")));
        http.perform(post("/chantiers").contentType("application/json").content("""
                {"code":"HTTP-GEO","designation":"Test","nature":"AO","afficherSurCarte":true,"localisation":"https://example.test/?q=10,20"}
                """)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Google Maps")));
        assertThat(validation.validate(new ChantierCreateRequestDto("VALID-GEO", "Test", null, NatureChantier.AO, null, null, null, null)))
                .anyMatch(v -> v.getPropertyPath().toString().equals("afficherSurCarte"));
    }

    @Test
    void la_base_refuse_un_affichage_sans_nature_ou_une_paire_de_coordonnees_incomplete() {
        var ref = donnees.creerReferentiel();
        assertThatThrownBy(() -> transaction.executeWithoutResult(s -> jdbc.update("UPDATE chantier SET afficher_sur_carte = true WHERE id = ?", ref.chantierId())))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transaction.executeWithoutResult(s -> jdbc.update("UPDATE chantier SET latitude = 10 WHERE id = ?", ref.chantierId())))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transaction.executeWithoutResult(s -> jdbc.update("UPDATE chantier SET latitude = 91, longitude = 20 WHERE id = ?", ref.chantierId())))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void la_reprise_est_auditee_idempotente_et_preserve_les_qualifications_manuelles() throws Exception {
        String reprise = new ClassPathResource("db/migration/V38__reprise_qualification_chantiers.sql").getContentAsString(StandardCharsets.UTF_8);
        transaction.executeWithoutResult(s -> {
            s.setRollbackOnly();
            for (String code : new String[]{"C057", "C163", "C085", "C129"}) {
                jdbc.update("INSERT INTO chantier (code, designation, source_erp, actif) SELECT ?, 'Test reprise', true, false WHERE NOT EXISTS (SELECT 1 FROM chantier WHERE code = ?)", code, code);
            }
            jdbc.update("UPDATE chantier SET nature = 'AO', latitude = 1, longitude = 2, localisation = 'https://www.google.com/maps?q=1,2' WHERE code = 'C129'");
            long avant = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);
            jdbc.execute(reprise);
            assertThat(jdbc.queryForObject("SELECT nature FROM chantier WHERE code = 'C057'", String.class)).isEqualTo("DEPOT");
            assertThat(jdbc.queryForObject("SELECT afficher_sur_carte FROM chantier WHERE code = 'C057'", Boolean.class)).isTrue();
            assertThat(jdbc.queryForObject("SELECT afficher_sur_carte FROM chantier WHERE code = 'C085'", Boolean.class)).isFalse();
            assertThat(jdbc.queryForObject("SELECT latitude FROM chantier WHERE code = 'C163'", BigDecimal.class)).isNull();
            assertThat(jdbc.queryForObject("SELECT nature FROM chantier WHERE code = 'C163'", String.class)).isEqualTo("AO");
            assertThat(jdbc.queryForObject("SELECT latitude FROM chantier WHERE code = 'C129'", BigDecimal.class)).isEqualByComparingTo("1");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class)).isEqualTo(avant + 1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chantier_aud WHERE rev = (SELECT max(id) FROM audit_revision)", Long.class)).isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chantier WHERE code IN ('C057', 'C163', 'C085') AND actif", Long.class)).isZero();
            jdbc.execute(reprise);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class)).isEqualTo(avant + 1);
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
        });
    }
}
