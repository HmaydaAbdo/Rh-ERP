package staport.rh.support;

import staport.rh.parametre.dtos.request.ParametreUpdateRequestDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.services.interfaces.IParametreService;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

/**
 * Les paramètres tels qu'ils sont posés à l'installation (migration V16), pour les tests qui n'ont pas la base : un
 * {@link IParametreService} figé, sans écriture. Les tests d'intégration lisent les vraies valeurs de la base.
 */
public final class ParametresDeTest implements IParametreService {

    public static final int LONGUEUR_MOT_DE_PASSE = 10;

    private final Duration dureeJetonAcces;

    private ParametresDeTest(Duration dureeJetonAcces) {
        this.dureeJetonAcces = dureeJetonAcces;
    }

    public static IParametreService parDefaut() {
        return new ParametresDeTest(Duration.ofMinutes(15));
    }

    /** Pour un test plus long qu'un jeton d'accès ordinaire (évaluation de l'agent) ; le reste est inchangé. */
    public static IParametreService avecDureeJetonAcces(Duration duree) {
        return new ParametresDeTest(duree);
    }

    @Override
    public List<ParametreResponseDto> findAll() {
        throw new UnsupportedOperationException("Paramètres figés : lecture typée seulement");
    }

    @Override
    public ParametreResponseDto update(Long id, ParametreUpdateRequestDto dto) {
        throw new UnsupportedOperationException("Paramètres figés : lecture typée seulement");
    }

    @Override
    public Duration dureeJetonAcces() {
        return dureeJetonAcces;
    }

    @Override
    public Duration dureeJetonSession() {
        return Duration.ofHours(12);
    }

    @Override
    public Duration dureeLienReinitialisation() {
        return Duration.ofHours(1);
    }

    @Override
    public int longueurMinimaleMotDePasse() {
        return LONGUEUR_MOT_DE_PASSE;
    }

    @Override
    public BigDecimal pasTrancheAnalytique() {
        return new BigDecimal("500");
    }

    @Override
    public String cronSynchronisationChantiers() {
        return "0 0 23 * * *";
    }
}
