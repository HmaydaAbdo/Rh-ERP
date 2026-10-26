package staport.rh.paie;

import jakarta.validation.Validation;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class PaieRequestValidationTest {

    @ParameterizedTest
    @CsvSource({
            "nombreJoursTravailles,1000", "joursRecuperationOuvrable,1000", "joursRecuperationDimanche,1.001",
            "salaireMensuel,100000000", "primeRoulageOrdinaire,1.001", "primeRoulageDimanche,100000000",
            "salaireTotal,1.001"
    })
    void refuse_les_valeurs_qui_debordent_ou_seraient_arrondies_par_la_base(String champ, String valeur) {
        try (var fabrique = Validation.buildDefaultValidatorFactory()) {
            var validateur = fabrique.getValidator();
            assertThat(validateur.validateValue(PaieCreateRequestDto.class, champ, new BigDecimal(valeur))).isNotEmpty();
            assertThat(validateur.validateValue(PaieUpdateRequestDto.class, champ, new BigDecimal(valeur))).isNotEmpty();
        }
    }

    @ParameterizedTest
    @CsvSource({
            "nombreJoursTravailles,999.99", "joursRecuperationOuvrable,999.99", "joursRecuperationDimanche,999.99",
            "salaireMensuel,99999999.99", "primeRoulageOrdinaire,99999999.99", "primeRoulageDimanche,99999999.99",
            "salaireTotal,99999999.99"
    })
    void accepte_les_limites_exactes_du_contrat_et_du_stockage(String champ, String valeur) {
        try (var fabrique = Validation.buildDefaultValidatorFactory()) {
            var validateur = fabrique.getValidator();
            assertThat(validateur.validateValue(PaieCreateRequestDto.class, champ, new BigDecimal(valeur))).isEmpty();
            assertThat(validateur.validateValue(PaieUpdateRequestDto.class, champ, new BigDecimal(valeur))).isEmpty();
        }
    }
}
