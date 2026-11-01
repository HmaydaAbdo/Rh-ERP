package staport.rh.accueil.services;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.accueil.dtos.request.AccueilUpdateRequestDto;
import staport.rh.accueil.dtos.response.AccueilResponseDto;
import staport.rh.accueil.dtos.response.IndicateurDisponibleDto;
import staport.rh.accueil.entities.IndicateurAccueil;
import staport.rh.accueil.entities.PreferenceAccueil;
import staport.rh.accueil.exceptions.AccueilInvalideException;
import staport.rh.accueil.repositories.PreferenceAccueilRepository;
import staport.rh.accueil.services.interfaces.IAccueilService;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.common.VersionOptimiste;
import staport.rh.common.exception.ConflitModificationException;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class AccueilService implements IAccueilService {

    private static final String SEPARATEUR = ",";

    private final PreferenceAccueilRepository repository;
    private final IUserService userService;

    public AccueilService(PreferenceAccueilRepository repository, IUserService userService) {
        this.repository = repository;
        this.userService = userService;
    }

    @Override
    @Transactional(readOnly = true)
    public AccueilResponseDto lire(String username) {
        return lireDe(userService.findByUsername(username));
    }

    @Override
    @Transactional
    @AuditableAction(action = "ACCUEIL_MODIFICATION", type = TypeOperation.UPDATE, entite = PreferenceAccueil.class)
    public AccueilResponseDto enregistrer(String username, AccueilUpdateRequestDto dto) {
        return enregistrerDe(userService.findByUsername(username), dto);
    }

    @Override
    @Transactional
    @AuditableAction(action = "ACCUEIL_REINITIALISATION", type = TypeOperation.DELETE, entite = PreferenceAccueil.class)
    public AccueilResponseDto reinitialiser(String username) {
        return reinitialiserDe(userService.findByUsername(username));
    }

    @Override
    @Transactional(readOnly = true)
    public AccueilResponseDto lireDe(Long utilisateurId) {
        return lireDe(userService.findById(utilisateurId));
    }

    @Override
    @Transactional
    @AuditableAction(action = "ACCUEIL_MODIFICATION", type = TypeOperation.UPDATE, entite = PreferenceAccueil.class)
    public AccueilResponseDto enregistrerDe(Long utilisateurId, AccueilUpdateRequestDto dto) {
        return enregistrerDe(userService.findById(utilisateurId), dto);
    }

    @Override
    @Transactional
    @AuditableAction(action = "ACCUEIL_REINITIALISATION", type = TypeOperation.DELETE, entite = PreferenceAccueil.class)
    public AccueilResponseDto reinitialiserDe(Long utilisateurId) {
        return reinitialiserDe(userService.findById(utilisateurId));
    }

    private AccueilResponseDto lireDe(UserResponseDto utilisateur) {
        return reponse(utilisateur, repository.findByUtilisateurId(utilisateur.id()));
    }

    private AccueilResponseDto enregistrerDe(UserResponseDto utilisateur, AccueilUpdateRequestDto dto) {
        Set<String> autorises = codesAutorises(utilisateur);
        Set<String> vus = new HashSet<>();
        for (String code : dto.indicateurs()) {
            if (IndicateurAccueil.depuisCode(code).isEmpty()) {
                throw new AccueilInvalideException("Indicateur inconnu : " + code);
            }
            if (!autorises.contains(code)) {
                throw new AccueilInvalideException("Indicateur non autorisé pour cet utilisateur : " + code);
            }
            if (!vus.add(code)) {
                throw new AccueilInvalideException("Indicateur en double : " + code);
            }
        }
        PreferenceAccueil preference = repository.findByUtilisateurId(utilisateur.id()).orElse(null);
        if (preference == null) {
            VersionOptimiste.verifier(dto.version(), null);
            preference = new PreferenceAccueil();
            preference.setUtilisateurId(utilisateur.id());
        } else {
            VersionOptimiste.verifier(dto.version(), preference.getVersion());
        }
        preference.setIndicateurs(String.join(SEPARATEUR, dto.indicateurs()));
        try {
            return reponse(utilisateur, Optional.of(repository.saveAndFlush(preference)));
        } catch (DataIntegrityViolationException e) {
            // Deux premiers enregistrements simultanés du même utilisateur : le second perd, comme une version périmée.
            throw new ConflitModificationException();
        }
    }

    private AccueilResponseDto reinitialiserDe(UserResponseDto utilisateur) {
        repository.findByUtilisateurId(utilisateur.id()).ifPresent(repository::delete);
        repository.flush();
        return reponse(utilisateur, Optional.empty());
    }

    /** Sans choix enregistré : tous les indicateurs autorisés, dans l'ordre du catalogue ; sinon le choix, amputé de ce qui n'est plus autorisé (un choix vidé par la perte de droits retombe sur tous). */
    private AccueilResponseDto reponse(UserResponseDto utilisateur, Optional<PreferenceAccueil> preference) {
        Set<String> autorises = codesAutorises(utilisateur);
        List<String> tous = Arrays.stream(IndicateurAccueil.values()).map(IndicateurAccueil::code).filter(autorises::contains).toList();
        List<String> choisis = preference
                .map(p -> Arrays.stream(p.getIndicateurs().split(SEPARATEUR)).filter(autorises::contains).toList())
                .orElse(tous);
        // Un choix que les permissions ont vidé (droit retiré depuis) ne laisse pas un accueil blanc : retour à tout ce qui est autorisé.
        List<String> indicateurs = choisis.isEmpty() && !preference.map(p -> p.getIndicateurs().isEmpty()).orElse(false) ? tous : choisis;
        List<IndicateurDisponibleDto> disponibles = Arrays.stream(IndicateurAccueil.values())
                .filter(indicateur -> autorises.contains(indicateur.code()))
                .map(indicateur -> new IndicateurDisponibleDto(indicateur.code(), indicateur.libelle(), indicateur.description()))
                .toList();
        return new AccueilResponseDto(preference.map(PreferenceAccueil::getVersion).orElse(null), preference.isPresent(), indicateurs, disponibles);
    }

    private static Set<String> codesAutorises(UserResponseDto utilisateur) {
        Set<String> codes = new HashSet<>();
        for (IndicateurAccueil indicateur : IndicateurAccueil.values()) {
            if (utilisateur.permissionsEffectives().contains(indicateur.permission())) {
                codes.add(indicateur.code());
            }
        }
        return codes;
    }
}
