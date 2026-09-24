package staport.rh.paie.services;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.InvalidReferenceException;
import staport.rh.paie.exceptions.PaieAlreadyExistsException;
import staport.rh.paie.exceptions.PaieNotFoundException;
import staport.rh.paie.mappers.PaieMapper;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.services.interfaces.IPaieService;
import staport.rh.paie.specifications.PaieSpecification;

import java.time.YearMonth;
import java.util.List;

@Service
public class PaieService implements IPaieService {

    private static final Logger log = LoggerFactory.getLogger(PaieService.class);

    private final PaieRepository repository;
    private final PaieMapper mapper;
    private final IEmployeeService employeeService;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final EntityManager entityManager;

    public PaieService(PaieRepository repository,
                        PaieMapper mapper,
                        IEmployeeService employeeService,
                        IFunctionService functionService,
                        IChantierService chantierService,
                        EntityManager entityManager) {
        this.repository = repository;
        this.mapper = mapper;
        this.employeeService = employeeService;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional
    public PaieResponseDto create(PaieCreateRequestDto dto) {
        if (!employeeService.existsById(dto.employeeId())) {
            throw new InvalidReferenceException("Employé introuvable avec l'id : " + dto.employeeId());
        }
        if (repository.existsByEmployee_IdAndPeriode(dto.employeeId(), dto.periode())) {
            throw new PaieAlreadyExistsException(dto.employeeId(), dto.periode());
        }

        Paie entity = mapper.toEntity(dto);
        entity.setEmployee(entityManager.getReference(Employee.class, dto.employeeId()));
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));

        Paie saved = repository.save(entity);
        log.info("Bulletin de paie créé : id={}, employeeId={}, periode={}", saved.getId(), dto.employeeId(), dto.periode());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    public PaieResponseDto update(Long id, PaieUpdateRequestDto dto) {
        Paie entity = getEntityById(id);

        mapper.updateEntityFromDto(dto, entity);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));

        Paie updated = repository.save(entity);
        log.info("Bulletin de paie mis à jour : id={}", updated.getId());
        return mapper.toDto(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public PaieResponseDto findById(Long id) {
        Paie entity = repository.findWithReferencesById(id)
                .orElseThrow(() -> new PaieNotFoundException(id));
        return mapper.toDto(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PaieResponseDto> search(PaieSearchCriteria criteria, Pageable pageable) {
        Specification<Paie> spec = PaieSpecification.searchByCriteria(criteria);
        return repository.findAll(spec, pageable).map(mapper::toDto);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        Paie entity = getEntityById(id);
        repository.delete(entity);
        log.info("Bulletin de paie supprimé : id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> findDistinctEquipes(String chantierCode, YearMonth periode) {
        return repository.findDistinctEquipesByChantierCodeAndPeriode(chantierCode, periode);
    }

    private Paie getEntityById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new PaieNotFoundException(id));
    }

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
