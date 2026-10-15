package staport.rh.common.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.Test;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.events.ActionSecurite;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.chantier.sync.ChantierSyncMetrics;

import java.util.Arrays;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class MetricsConformityTest {

    @Test
    void audit_metrics_utilisent_des_series_bornees_et_des_jauges_booleennes() {
        SimpleMeterRegistry registre = new SimpleMeterRegistry();
        AuditMetrics metriques = new AuditMetrics(registre);

        for (CategorieAudit categorie : CategorieAudit.values()) {
            metriques.ecritureEnEchec(categorie);
        }
        for (ActionSecurite action : ActionSecurite.values()) {
            metriques.evenementSecurite(action);
        }
        metriques.integriteCompromise(true);
        metriques.chaineInvalide(true);

        assertThat(registre.get("rh.audit.ecriture.echec").counters()).hasSize(CategorieAudit.values().length);
        assertThat(registre.get("rh.audit.evenement.securite").counters()).hasSize(ActionSecurite.values().length);
        assertThat(registre.get("rh.audit.ecriture.echec").counters())
                .extracting(compteur -> compteur.getId().getTag("categorie"))
                .containsExactlyInAnyOrder("OPERATION", "SECURITE", "ACCES");
        assertThat(registre.get("rh.audit.evenement.securite").counters())
                .extracting(compteur -> compteur.getId().getTag("action"))
                .containsExactlyInAnyOrder(Arrays.stream(ActionSecurite.values()).map(Enum::name).toArray(String[]::new));
        assertThat(registre.get("rh.audit.integrite.compromise").gauge().value()).isEqualTo(1.0);
        assertThat(registre.get("rh.audit.chaine.invalide").gauge().value()).isEqualTo(1.0);
        assertThat(registre.getMeters()).allSatisfy(metre -> assertThat(metre.getId().getTags())
                .allSatisfy(tag -> assertThat(tag.getKey()).isIn("categorie", "action")));
    }

    @Test
    void synchronisation_compte_succes_echecs_lignes_ignorees_et_duree_sans_dimensions_libres() {
        SimpleMeterRegistry registre = new SimpleMeterRegistry();
        ChantierSyncMetrics metriques = new ChantierSyncMetrics(registre);

        metriques.recordSuccess(125);
        metriques.recordFailure(375);
        metriques.recordIgnoredRecords(3);

        assertThat(registre.get("rh.chantier.sync.success").counter().count()).isEqualTo(1.0);
        assertThat(registre.get("rh.chantier.sync.failure").counter().count()).isEqualTo(1.0);
        assertThat(registre.get("rh.chantier.sync.records.ignored").counter().count()).isEqualTo(3.0);
        assertThat(registre.get("rh.chantier.sync.duration").timer().count()).isEqualTo(2);
        assertThat(registre.get("rh.chantier.sync.duration").timer().totalTime(TimeUnit.MILLISECONDS)).isEqualTo(500.0);
        assertThat(registre.getMeters()).allSatisfy(metre -> assertThat(metre.getId().getTags()).isEmpty());
    }

    @Test
    void duree_synchronisation_expose_un_histogramme_prometheus_en_secondes() {
        PrometheusMeterRegistry registre = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        try {
            ChantierSyncMetrics metriques = new ChantierSyncMetrics(registre);
            metriques.recordSuccess(125);

            String exposition = registre.scrape();
            assertThat(exposition).contains("rh_chantier_sync_duration_seconds_bucket");
            assertThat(exposition).contains("rh_chantier_sync_duration_seconds_count 1");
        } finally {
            registre.close();
        }
    }
}
