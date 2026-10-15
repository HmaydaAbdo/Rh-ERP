package staport.rh.referentiel;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Les index SQL protègent l'unicité métier même en cas d'écritures concurrentes ou hors service. */
class ReferentielUniciteInsensibleCasseTest extends AuditIntegrationTestBase {

    @Test
    void la_base_refuse_un_libelle_fonction_deja_present_avec_une_casse_differente() {
        Referentiel ref = donnees.creerReferentiel();

        assertThatThrownBy(() -> jdbc.update("INSERT INTO fonction (libelle) SELECT lower(libelle) FROM fonction WHERE id = ?",
                ref.fonctionId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void la_base_refuse_un_code_chantier_deja_present_avec_une_casse_differente() {
        Referentiel ref = donnees.creerReferentiel();

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO chantier (code, designation, source_erp, actif)
                SELECT lower(code), designation, source_erp, actif FROM chantier WHERE id = ?
                """, ref.chantierId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void la_base_refuse_un_code_equipe_avec_casse_ou_espaces_differents() {
        Referentiel ref = donnees.creerReferentiel();

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO equipe (code, libelle)
                SELECT lower(code) || ' ', 'Libellé différent' FROM equipe WHERE id = ?
                """, ref.equipeId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void la_base_refuse_un_libelle_equipe_avec_casse_ou_espaces_differents() {
        Referentiel ref = donnees.creerReferentiel();

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO equipe (code, libelle)
                SELECT 'AUTRE-' || code, lower(libelle) || ' ' FROM equipe WHERE id = ?
                """, ref.equipeId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
