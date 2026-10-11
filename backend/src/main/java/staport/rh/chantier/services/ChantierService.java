package staport.rh.chantier.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.common.VersionOptimiste;
import staport.rh.chantier.dtos.request.ChantierCreateRequestDto;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.dtos.request.ChantierUpdateRequestDto;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.exceptions.ChantierAlreadyExistsException;
import staport.rh.chantier.exceptions.ChantierNotFoundException;
import staport.rh.chantier.mappers.ChantierMapper;
import staport.rh.chantier.repositories.ChantierRepository;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.chantier.specifications.ChantierSpecification;

@Service
public class ChantierService implements IChantierService {

    private static final Logger log = LoggerFactory.getLogger(ChantierService.class);

    private final ChantierRepository repository;
    private final ChantierMapper mapper;

    public ChantierService(ChantierRepository repository, ChantierMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    @AuditableAction(action = "CHANTIER_CREATION", type = TypeOperation.CREATE, entite = Chantier.class)
    public ChantierResponseDto create(ChantierCreateRequestDto dto) {
        if (repository.existsByCodeIgnoreCase(dto.code())) {
            throw new ChantierAlreadyExistsException(dto.code());
        }

        Chantier entity = mapper.toEntity(dto);
        Chantier saved = repository.save(entity);
        log.info("Chantier créé : id={}", saved.getId());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "CHANTIER_MODIFICATION", type = TypeOperation.UPDATE, entite = Chantier.class)
    public ChantierResponseDto update(Long id, ChantierUpdateRequestDto dto) {
        Chantier entity = getEntityById(id);
        VersionOptimiste.verifier(dto.version(), entity.getVersion());

        repository.findByCodeIgnoreCase(dto.code())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ChantierAlreadyExistsException(dto.code());
                });

        mapper.updateEntityFromDto(dto, entity);
        Chantier updated = repository.saveAndFlush(entity);
        log.info("Chantier mis à jour : id={}", updated.getId());
        return mapper.toDto(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public ChantierResponseDto findById(Long id) {
        return mapper.toDto(getEntityById(id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ChantierResponseDto> search(ChantierSearchCriteria criteria, Pageable pageable) {
        Specification<Chantier> spec = ChantierSpecification.searchByCriteria(criteria);
        return repository.findAll(spec, pageable).map(mapper::toDto);
    }

    @Override
    @Transactional
    @AuditableAction(action = "CHANTIER_SUPPRESSION", type = TypeOperation.DELETE, entite = Chantier.class)
    public void delete(Long id) {
        Chantier entity = getEntityById(id);
        repository.delete(entity);
        log.info("Chantier supprimé : id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    private Chantier getEntityById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ChantierNotFoundException(id));
    }
}
