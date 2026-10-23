package staport.rh.equipe.services;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.common.VersionOptimiste;
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

    private final EquipeRepository repository;
    private final EquipeMapper mapper;

    public EquipeService(EquipeRepository repository, EquipeMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    @AuditableAction(action = "EQUIPE_CREATION", type = TypeOperation.CREATE, entite = Equipe.class)
    public EquipeResponseDto create(EquipeCreateRequestDto dto) {
        String code = normaliserCode(dto.code());
        String libelle = dto.libelle().strip();
        verifierUnicite(null, code, libelle);

        Equipe entity = mapper.toEntity(dto);
        entity.setCode(code);
        entity.setLibelle(libelle);
        Equipe saved = repository.save(entity);
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "EQUIPE_MODIFICATION", type = TypeOperation.UPDATE, entite = Equipe.class)
    public EquipeResponseDto update(Long id, EquipeUpdateRequestDto dto) {
        Equipe entity = getEntityById(id);
        VersionOptimiste.verifier(dto.version(), entity.getVersion());
        String code = normaliserCode(dto.code());
        String libelle = dto.libelle().strip();
        verifierUnicite(id, code, libelle);

        mapper.updateEntityFromDto(dto, entity);
        entity.setCode(code);
        entity.setLibelle(libelle);
        Equipe updated = repository.saveAndFlush(entity);
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
    @AuditableAction(action = "EQUIPE_SUPPRESSION", type = TypeOperation.DELETE, entite = Equipe.class)
    public void delete(Long id) {
        Equipe entity = getEntityById(id);
        repository.delete(entity);
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

    /** Le code d'échange est stocké trimé et en majuscules, pour que "ch" et "CH " ne produisent
     * jamais deux équipes distinctes. La sélection utilisateur privilégie le libellé. */
    private static String normaliserCode(String code) {
        return code.strip().toUpperCase(Locale.ROOT);
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
