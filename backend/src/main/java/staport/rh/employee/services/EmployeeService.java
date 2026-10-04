package staport.rh.employee.services;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.exceptions.CinAlreadyExistsException;
import staport.rh.employee.exceptions.EmployeeNotFoundException;
import staport.rh.employee.exceptions.InvalidReferenceException;
import staport.rh.employee.mappers.EmployeeMapper;
import staport.rh.employee.repositories.EmployeeRepository;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.employee.specifications.EmployeeSpecification;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;

@Service
public class EmployeeService implements IEmployeeService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeService.class);

    private final EmployeeRepository repository;
    private final EmployeeMapper mapper;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final EntityManager entityManager;

    public EmployeeService(EmployeeRepository repository,
                            EmployeeMapper mapper,
                            IFunctionService functionService,
                            IChantierService chantierService,
                            EntityManager entityManager) {
        this.repository = repository;
        this.mapper = mapper;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_CREATION", type = TypeOperation.CREATE, entite = Employee.class)
    public EmployeeResponseDto create(EmployeeCreateRequestDto dto) {
        if (repository.existsByCinIgnoreCase(dto.cin())) {
            throw new CinAlreadyExistsException(dto.cin());
        }

        Employee entity = mapper.toEntity(dto);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));

        Employee saved = repository.save(entity);
        log.info("Employé créé : id={}", saved.getId());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_MODIFICATION", type = TypeOperation.UPDATE, entite = Employee.class)
    public EmployeeResponseDto update(Long id, EmployeeUpdateRequestDto dto) {
        Employee entity = getEntityById(id);

        repository.findByCinIgnoreCase(dto.cin())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new CinAlreadyExistsException(dto.cin());
                });

        mapper.updateEntityFromDto(dto, entity);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));

        Employee updated = repository.save(entity);
        log.info("Employé mis à jour : id={}", updated.getId());
        return mapper.toDto(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public EmployeeResponseDto findById(Long id) {
        Employee entity = repository.findWithReferencesById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
        return mapper.toDto(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EmployeeResponseDto> search(EmployeeSearchCriteria criteria, Pageable pageable) {
        Specification<Employee> spec = EmployeeSpecification.searchByCriteria(criteria);
        return repository.findAll(spec, pageable).map(mapper::toDto);
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_SUPPRESSION", type = TypeOperation.DELETE, entite = Employee.class)
    public void delete(Long id) {
        Employee entity = getEntityById(id);
        repository.delete(entity);
        log.info("Employé supprimé : id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    private Employee getEntityById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
    }

    /**
     * La validation métier passe par IFunctionService (façade du domaine Function) ;
     * seule la résolution de la référence JPA pour la relation passe par l'EntityManager,
     * afin de ne jamais injecter le Repository d'un autre domaine (conventions/architecture.md).
     */
    private Function resolveFonctionReference(Long fonctionId) {
        if (!functionService.existsById(fonctionId)) {
            throw new InvalidReferenceException("Fonction introuvable avec l'id : " + fonctionId);
        }
        return entityManager.getReference(Function.class, fonctionId);
    }

    private Chantier resolveChantierReference(Long chantierId) {
        if (!chantierService.existsById(chantierId)) {
            throw new InvalidReferenceException("Chantier introuvable avec l'id : " + chantierId);
        }
        return entityManager.getReference(Chantier.class, chantierId);
    }
}
