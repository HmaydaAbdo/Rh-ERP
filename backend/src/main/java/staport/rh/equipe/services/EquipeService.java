package staport.rh.equipe.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeSearchCriteria;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.exceptions.EquipeAlreadyExistsException;
import staport.rh.equipe.exceptions.EquipeNotFoundException;
import staport.rh.equipe.mappers.EquipeMapper;
import staport.rh.equipe.repositories.EquipeRepository;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.equipe.specifications.EquipeSpecification;

import java.util.Locale;

@Service
public class EquipeService implements IEquipeService {

    private static final Logger log = LoggerFactory.getLogger(EquipeService.class);

    private final EquipeRepository repository;
    private final EquipeMapper mapper;

    public EquipeService(EquipeRepository repository, EquipeMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public EquipeResponseDto create(EquipeCreateRequestDto dto) {
        String code = normaliserCode(dto.code());
        String libelle = dto.libelle().trim();
        verifierUnicite(null, code, libelle);

        Equipe entity = mapper.toEntity(dto);
        entity.setCode(code);
        entity.setLibelle(libelle);
        Equipe saved = repository.save(entity);
        log.info("Équipe créée : id={}", saved.getId());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    public EquipeResponseDto update(Long id, EquipeUpdateRequestDto dto) {
        Equipe entity = getEntityById(id);
        String code = normaliserCode(dto.code());
        String libelle = dto.libelle().trim();
        verifierUnicite(id, code, libelle);

        mapper.updateEntityFromDto(dto, entity);
        entity.setCode(code);
        entity.setLibelle(libelle);
        Equipe updated = repository.save(entity);
        log.info("Équipe mise à jour : id={}", updated.getId());
        return mapper.toDto(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public EquipeResponseDto findById(Long id) {
        return mapper.toDto(getEntityById(id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EquipeResponseDto> search(EquipeSearchCriteria criteria, Pageable pageable) {
        Specification<Equipe> spec = EquipeSpecification.searchByCriteria(criteria);
        return repository.findAll(spec, pageable).map(mapper::toDto);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        Equipe entity = getEntityById(id);
        repository.delete(entity);
        log.info("Équipe supprimée : id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    private Equipe getEntityById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EquipeNotFoundException(id));
    }

    /** Le code sert de clé de sélection/regroupement : toujours stocké trimé et en majuscules, pour
     * que "ch" et "CH " ne produisent jamais deux équipes distinctes. */
    private static String normaliserCode(String code) {
        return code.trim().toUpperCase(Locale.FRANCE);
    }

    private void verifierUnicite(Long idCourant, String code, String libelle) {
        repository.findByCodeIgnoreCase(code)
                .filter(existante -> !existante.getId().equals(idCourant))
                .ifPresent(existante -> {
                    throw EquipeAlreadyExistsException.parCode(code);
                });
        repository.findByLibelleIgnoreCase(libelle)
                .filter(existante -> !existante.getId().equals(idCourant))
                .ifPresent(existante -> {
                    throw EquipeAlreadyExistsException.parLibelle(libelle);
                });
    }
}
