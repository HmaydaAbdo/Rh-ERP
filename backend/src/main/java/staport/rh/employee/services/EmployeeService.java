package staport.rh.employee.services;

import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.common.VersionOptimiste;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeSortie;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.exceptions.CinAlreadyExistsException;
import staport.rh.employee.exceptions.EmployeeNotFoundException;
import staport.rh.employee.exceptions.InvalidReferenceException;
import staport.rh.employee.mappers.EmployeeMapper;
import staport.rh.employee.repositories.EmployeeRepository;
import staport.rh.employee.repositories.EmployeeSortieRepository;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.employee.specifications.EmployeeSpecification;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;

import java.time.YearMonth;

@Service
public class EmployeeService implements IEmployeeService {

    private final EmployeeRepository repository;
    private final EmployeeSortieRepository sortieRepository;
    private final EmployeeMapper mapper;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final IEquipeService equipeService;
    private final EntityManager entityManager;

    public EmployeeService(EmployeeRepository repository,
                            EmployeeSortieRepository sortieRepository,
                            EmployeeMapper mapper,
                            IFunctionService functionService,
                            IChantierService chantierService,
                            IEquipeService equipeService,
                            EntityManager entityManager) {
        this.repository = repository;
        this.sortieRepository = sortieRepository;
        this.mapper = mapper;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.equipeService = equipeService;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_CREATION", type = TypeOperation.CREATE, entite = Employee.class)
    public EmployeeResponseDto create(EmployeeCreateRequestDto dto) {
        String cin = dto.cin().strip();
        if (repository.existsByCinIgnoreCase(cin)) {
            throw new CinAlreadyExistsException(cin);
        }

        Employee entity = mapper.toEntity(dto);
        entity.setCin(cin);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));
        entity.setEquipe(resolveEquipeReference(dto.equipeId()));

        Employee saved = repository.save(entity);
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_MODIFICATION", type = TypeOperation.UPDATE, entite = Employee.class)
    public EmployeeResponseDto update(Long id, EmployeeUpdateRequestDto dto) {
        Employee entity = getEntityById(id);
        VersionOptimiste.verifier(dto.version(), entity.getVersion());

        String cin = dto.cin().strip();
        repository.findByCinIgnoreCase(cin)
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new CinAlreadyExistsException(cin);
                });

        mapper.updateEntityFromDto(dto, entity);
        entity.setCin(cin);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));
        entity.setEquipe(resolveEquipeReference(dto.equipeId()));

        Employee updated = repository.saveAndFlush(entity);
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
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    @Override
    @Transactional
    @AuditableAction(action = "EMPLOYE_SORTIE", type = TypeOperation.UPDATE, entite = Employee.class)
    public void enregistrerSortie(Long id, YearMonth periode, String motif) {
        Employee entity = getEntityById(id);
        if (motif == null || motif.isBlank() || motif.strip().length() > 255) {
            throw new InvalidReferenceException("Le motif du départ est obligatoire (255 caractères au plus)");
        }
        if (sortieRepository.existsByEmployee_IdAndPeriode(id, periode)) {
            throw new InvalidReferenceException("Un départ est déjà enregistré pour cet employé ce mois-ci : " + periode);
        }
        EmployeeSortie sortie = new EmployeeSortie();
        sortie.setEmployee(entity);
        sortie.setPeriode(periode);
        sortie.setMotif(motif.strip());
        sortieRepository.save(sortie);
        entity.setStatut(EmployeeStatut.INACTIF);
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

    /** L'équipe est facultative : {@code null} = sans équipe. */
    private Equipe resolveEquipeReference(Long equipeId) {
        if (equipeId == null) {
            return null;
        }
        if (!equipeService.existsById(equipeId)) {
            throw new InvalidReferenceException("Équipe introuvable avec l'id : " + equipeId);
        }
        return entityManager.getReference(Equipe.class, equipeId);
    }
}
