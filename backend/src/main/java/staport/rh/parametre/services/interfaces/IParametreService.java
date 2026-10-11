package staport.rh.parametre.services.interfaces;

import staport.rh.parametre.dtos.request.ParametreUpdateRequestDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

/**
 * Façade publique du module Paramètre — seule cette interface peut être injectée par un autre domaine
 * (conventions/architecture.md, « Encapsulation des domaines »). Les lecteurs typés lisent la valeur courante (mise en
 * mémoire, rafraîchie à chaque modification) : ils ne coûtent pas une requête.
 */
public interface IParametreService {

    List<ParametreResponseDto> findAll();

    ParametreResponseDto update(Long id, ParametreUpdateRequestDto dto);

    /** Durée de vie de l'Access Token (JWT). */
    Duration dureeJetonAcces();

    /** Durée de vie du jeton de session (Refresh Token et son cookie). */
    Duration dureeJetonSession();

    /** Validité du lien de réinitialisation du mot de passe. */
    Duration dureeLienReinitialisation();

    /** Longueur minimale d'un mot de passe, en caractères. */
    int longueurMinimaleMotDePasse();

    /** Largeur minimale et pas d'arrondi des tranches de l'analytique de paie, en DH. */
    BigDecimal pasTrancheAnalytique();

    /** Expression cron de la synchronisation planifiée des chantiers. */
    String cronSynchronisationChantiers();
}
