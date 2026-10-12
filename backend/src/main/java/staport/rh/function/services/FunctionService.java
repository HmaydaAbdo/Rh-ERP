package staport.rh.function.services;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.common.VersionOptimiste;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.exceptions.FunctionAlreadyExistsException;
import staport.rh.function.exceptions.FunctionNotFoundException;
import staport.rh.function.mappers.FunctionMapper;
import staport.rh.function.repositories.FunctionRepository;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.function.specifications.FunctionSpecification;

@Service
public class FunctionService implements IFunctionService {

    private final FunctionRepository repository;
    private final FunctionMapper mapper;

    public FunctionService(FunctionRepository repository, FunctionMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    @AuditableAction(action = "FONCTION_CREATION", type = TypeOperation.CREATE, entite = Function.class)
    public FunctionResponseDto create(FunctionCreateRequestDto dto) {
        if (repository.existsByLibelleIgnoreCase(dto.libelle())) {
            throw new FunctionAlreadyExistsException(dto.libelle());
        }

        Function entity = mapper.toEntity(dto);
        Function saved = repository.save(entity);
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "FONCTION_MODIFICATION", type = TypeOperation.UPDATE, entite = Function.class)
    public FunctionResponseDto update(Long id, FunctionUpdateRequestDto dto) {
        Function entity = getEntityById(id);
        VersionOptimiste.verifier(dto.version(), entity.getVersion());

        repository.findByLibelleIgnoreCase(dto.libelle())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new FunctionAlreadyExistsException(dto.libelle());
                });

        mapper.updateEntityFromDto(dto, entity);
        Function updated = repository.saveAndFlush(entity);
        return mapper.toDto(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public FunctionResponseDto findById(Long id) {
        return mapper.toDto(getEntityById(id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<FunctionResponseDto> search(FunctionSearchCriteria criteria, Pageable pageable) {
        Specification<Function> spec = FunctionSpecification.searchByCriteria(criteria);
        return repository.findAll(spec, pageable).map(mapper::toDto);
    }

    @Override
    @Transactional
    @AuditableAction(action = "FONCTION_SUPPRESSION", type = TypeOperation.DELETE, entite = Function.class)
    public void delete(Long id) {
        Function entity = getEntityById(id);
        repository.delete(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    private Function getEntityById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new FunctionNotFoundException(id));
    }
}
