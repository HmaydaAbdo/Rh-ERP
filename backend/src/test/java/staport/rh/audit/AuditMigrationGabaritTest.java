package staport.rh.audit;

import org.junit.jupiter.api.Test;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scénario S9 : le gabarit de migration de conventions/database.md (« Migrations qui modifient des données auditées »)
 * fonctionne tel quel — la modification, sa révision, ses lignes d'audit et son entrée de journal sont écrites
 * ensemble, et l'historique d'Envers reste cohérent avec elles.
 */
class AuditMigrationGabaritTest extends AuditIntegrationTestBase {

    @Test
    void le_gabarit_ecrit_la_revision_les_lignes_d_audit_et_l_entree_du_journal() {
        Referentiel ref = donnees.creerReferentiel();
        String nouveau = "F-CORRIGEE-" + ref.suffixe();

        // Le bloc ci-dessous est le gabarit de la convention, appliqué à une correction de fonction.
        jdbc.execute("""
                DO $$
                DECLARE
                    v_rev BIGINT;
                    v_nb  INTEGER;
                BEGIN
                    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
                    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
                    RETURNING id INTO v_rev;

                    WITH touchees AS (
                        UPDATE fonction SET libelle = '%s' WHERE id = %d RETURNING *
                    )
                    INSERT INTO fonction_aud (id, rev, revtype, libelle)
                    SELECT id, v_rev, 1, libelle FROM touchees;
                    GET DIAGNOSTICS v_nb = ROW_COUNT;

                    INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.function.entities.Function');

                    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                               request_id, nombre_elements, perimetre, revision_id)
                    SELECT now(), 'OPERATION', 'FONCTION_CORRECTION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                           request_id, v_nb, '{"migration": "V99__exemple"}'::jsonb, id
                    FROM audit_revision WHERE id = v_rev;
                END $$;""".formatted(nouveau, ref.fonctionId()));

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'FONCTION_CORRECTION' ORDER BY id DESC LIMIT 1");
        long revision = revisionDe(entree);
        assertThat(entree.get("origine")).isEqualTo("MIGRATION");
        assertThat(((Number) entree.get("nombre_elements")).intValue()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT libelle FROM fonction_aud WHERE id = ? AND rev = ? AND revtype = 1", String.class,
                ref.fonctionId(), revision)).isEqualTo(nouveau);
        assertThat(jdbc.queryForObject("SELECT origine FROM audit_revision WHERE id = ?", String.class, revision)).isEqualTo("MIGRATION");
        // Les versions que la migration a écrites se lisent avec les autres : création (Envers), puis correction.
        assertThat(jdbc.queryForList("SELECT revtype FROM fonction_aud WHERE id = ? ORDER BY rev", Integer.class, ref.fonctionId()))
                .containsExactly(0, 1);
    }
}
