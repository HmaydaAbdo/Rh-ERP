package staport.rh.parametre.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.common.VersionOptimiste;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.parametre.dtos.request.ParametreUpdateRequestDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.entities.CleParametre;
import staport.rh.parametre.entities.Parametre;
import staport.rh.parametre.exceptions.ParametreNotFoundException;
import staport.rh.parametre.mappers.ParametreMapper;
import staport.rh.parametre.repositories.ParametreRepository;
import staport.rh.parametre.services.interfaces.IParametreService;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ParametreService implements IParametreService {

    private static final Logger log = LoggerFactory.getLogger(ParametreService.class);

    private final ParametreRepository repository;
    private final ParametreMapper mapper;

    /** Valeurs courantes par clé ; {@code null} = à recharger. Une seule instance du backend : aucune invalidation distante. */
    private volatile Map<CleParametre, String> valeurs;

    public ParametreService(ParametreRepository repository, ParametreMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ParametreResponseDto> findAll() {
        Map<String, Parametre> parCle = new HashMap<>();
        repository.findAll().forEach(parametre -> parCle.put(parametre.getCle(), parametre));
        return Arrays.stream(CleParametre.values())
                .map(cle -> mapper.toDto(ligneDe(parCle, cle), cle))
                .toList();
    }

    @Override
    @Transactional
    @AuditableAction(action = "PARAMETRE_MODIFICATION", type = TypeOperation.UPDATE, entite = Parametre.class)
    public ParametreResponseDto update(Long id, ParametreUpdateRequestDto dto) {
        Parametre parametre = repository.findById(id).orElseThrow(() -> new ParametreNotFoundException(id));
        VersionOptimiste.verifier(dto.version(), parametre.getVersion());
        CleParametre cle = CleParametre.depuisCode(parametre.getCle())
                .orElseThrow(() -> new IllegalStateException("Clé de paramètre inconnue du catalogue : " + parametre.getCle()));
        parametre.setValeur(cle.normaliser(dto.valeur()));
        Parametre enregistre = repository.saveAndFlush(parametre);
        invaliderApresValidation();
        log.info("Paramètre modifié : id={}, cle={}", enregistre.getId(), cle.code());
        return mapper.toDto(enregistre, cle);
    }

    @Override
    public Duration dureeJetonAcces() {
        return Duration.ofMinutes(entier(CleParametre.JETON_ACCES));
    }

    @Override
    public Duration dureeJetonSession() {
        return Duration.ofHours(entier(CleParametre.JETON_SESSION));
    }

    @Override
    public Duration dureeLienReinitialisation() {
        return Duration.ofMinutes(entier(CleParametre.LIEN_REINITIALISATION));
    }

    @Override
    public int longueurMinimaleMotDePasse() {
        return (int) entier(CleParametre.LONGUEUR_MOT_DE_PASSE);
    }

    @Override
    public BigDecimal pasTrancheAnalytique() {
        return BigDecimal.valueOf(entier(CleParametre.PAS_TRANCHE_ANALYTIQUE));
    }

    @Override
    public String cronSynchronisationChantiers() {
        return valeur(CleParametre.CRON_SYNCHRONISATION_CHANTIERS);
    }

    private long entier(CleParametre cle) {
        return Long.parseLong(valeur(cle));
    }

    private String valeur(CleParametre cle) {
        Map<CleParametre, String> courantes = valeurs;
        if (courantes == null) {
            courantes = charger();
            valeurs = courantes;
        }
        return courantes.get(cle);
    }

    /** Lit toutes les valeurs ; une clé du catalogue sans ligne en base est une installation incomplète : on refuse de continuer. */
    private Map<CleParametre, String> charger() {
        Map<CleParametre, String> lues = new EnumMap<>(CleParametre.class);
        repository.findAll().forEach(parametre -> CleParametre.depuisCode(parametre.getCle())
                .ifPresent(cle -> lues.put(cle, parametre.getValeur())));
        for (CleParametre cle : CleParametre.values()) {
            if (!lues.containsKey(cle)) {
                throw new IllegalStateException("Paramètre absent de la table parametre : " + cle.code());
            }
        }
        return lues;
    }

    private static Parametre ligneDe(Map<String, Parametre> parCle, CleParametre cle) {
        Parametre parametre = parCle.get(cle.code());
        if (parametre == null) {
            throw new IllegalStateException("Paramètre absent de la table parametre : " + cle.code());
        }
        return parametre;
    }

    /** Les valeurs mises en mémoire ne changent qu'une fois la modification validée : jamais sur une transaction annulée. */
    private void invaliderApresValidation() {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                valeurs = null;
            }
        });
    }
}
