package staport.rh.paie.services;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.paie.audit.PerimetreSuppressionGroupePaie;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaieMaterielTableauDto;
import staport.rh.paie.dtos.response.PaieEquipePeriodeDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.InvalidPeriodeException;
import staport.rh.paie.exceptions.InvalidReferenceException;
import staport.rh.paie.exceptions.PaieAlreadyExistsException;
import staport.rh.paie.exceptions.PaieGroupeModifieException;
import staport.rh.paie.exceptions.PaieNotFoundException;
import staport.rh.paie.mappers.PaieMapper;
import staport.rh.paie.reporting.MaterielChantierCatalogue;
import staport.rh.paie.repositories.ChantierEquipePeriodeProjection;
import staport.rh.paie.repositories.FiltresPaie;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.services.interfaces.IPaieService;
import staport.rh.paie.specifications.PaieSpecification;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PaieService implements IPaieService {

    private static final Logger log = LoggerFactory.getLogger(PaieService.class);

    private final PaieRepository repository;
    private final PaieMapper mapper;
    private final IEmployeeService employeeService;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final IEquipeService equipeService;
    private final EntityManager entityManager;

    public PaieService(PaieRepository repository,
                        PaieMapper mapper,
                        IEmployeeService employeeService,
                        IFunctionService functionService,
                        IChantierService chantierService,
                        IEquipeService equipeService,
                        EntityManager entityManager) {
        this.repository = repository;
        this.mapper = mapper;
        this.employeeService = employeeService;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.equipeService = equipeService;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional
    @AuditableAction(action = "PAIE_CREATION", type = TypeOperation.CREATE, entite = Paie.class)
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
        entity.setEquipe(resolveEquipeReference(dto.equipeId()));

        Paie saved = repository.save(entity);
        log.info("Bulletin de paie créé : id={}, employeeId={}, periode={}", saved.getId(), dto.employeeId(), dto.periode());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "PAIE_MODIFICATION", type = TypeOperation.UPDATE, entite = Paie.class)
    public PaieResponseDto update(Long id, PaieUpdateRequestDto dto) {
        Paie entity = getEntityById(id);

        mapper.updateEntityFromDto(dto, entity);
        entity.setFonction(resolveFonctionReference(dto.fonctionId()));
        entity.setChantier(resolveChantierReference(dto.chantierId()));
        entity.setEquipe(resolveEquipeReference(dto.equipeId()));

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
    @AuditableAction(action = "PAIE_SUPPRESSION", type = TypeOperation.DELETE, entite = Paie.class)
    public void delete(Long id) {
        Paie entity = getEntityById(id);
        repository.delete(entity);
        log.info("Bulletin de paie supprimé : id={}", id);
    }

    @Override
    @Transactional
    @AuditableAction(action = "PAIE_SUPPRESSION_GROUPE", type = TypeOperation.DELETE, entite = Paie.class,
            perimetre = PerimetreSuppressionGroupePaie.class)
    public long deleteGroupe(PaieSearchCriteria criteres, long nombreAttendu) {
        if (criteres == null || criteres.periode() == null) {
            throw new InvalidPeriodeException("La période est obligatoire pour supprimer un groupe de bulletins (format aaaa-MM)");
        }
        // Même filtre que la liste (PaieSpecification) : le groupe supprimé est celui que la carte comptait.
        List<Paie> groupe = repository.findAll(PaieSpecification.searchByCriteria(criteres));
        if (groupe.size() != nombreAttendu) {
            throw new PaieGroupeModifieException(groupe.size(), nombreAttendu);
        }
        // Entité par entité, jamais en masse (deleteAllInBatch) : seul moyen pour que l'audit voie chaque bulletin
        // supprimé (conventions/audit.md). Le log ne porte que des identifiants et des nombres, pas les textes de filtre.
        repository.deleteAll(groupe);
        log.info("Groupe de bulletins de paie supprimé : periode={}, nombre={}", criteres.periode(), groupe.size());
        return groupe.size();
    }

    @Override
    @Transactional(readOnly = true)
    public List<PaiePeriodeResumeDto> findPeriodes(PaieSearchCriteria criteres) {
        return repository.resumerParPeriode(FiltresPaie.depuis(criteres)).stream()
                .map(p -> new PaiePeriodeResumeDto(p.getPeriode().toString(), p.getBulletins(), p.getChantiers(),
                        p.getMasse(), p.getStc()))
                .toList();
    }

    @Override
    public List<PaieMaterielTableauDto> findTableauxMateriel() {
        return MaterielChantierCatalogue.tableaux().stream()
                .map(t -> new PaieMaterielTableauDto(t.chantierCode(), t.equipeCode(), t.titre(), t.libelles()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<PaieChantierPeriodeDto> findChantiersDeLaPeriode(YearMonth periode, PaieSearchCriteria criteres) {
        Map<String, List<ChantierEquipePeriodeProjection>> parChantier = new LinkedHashMap<>();
        for (ChantierEquipePeriodeProjection ligne : repository.resumerChantiersEtEquipesParPeriode(periode, FiltresPaie.depuis(criteres))) {
            parChantier.computeIfAbsent(ligne.getChantierCode(), code -> new ArrayList<>()).add(ligne);
        }
        return parChantier.values().stream()
                .map(this::versChantierPeriode)
                .sorted(Comparator.comparing(PaieChantierPeriodeDto::masse).reversed())
                .toList();
    }

    private PaieChantierPeriodeDto versChantierPeriode(List<ChantierEquipePeriodeProjection> lignes) {
        ChantierEquipePeriodeProjection premiere = lignes.get(0);
        String nom = premiere.getChantierNom();
        String libelle = nom != null && !nom.isBlank() ? nom : premiere.getChantierDesignation();
        List<PaieEquipePeriodeDto> equipes = lignes.stream()
                .filter(l -> l.getEquipeId() != null)
                .map(l -> new PaieEquipePeriodeDto(l.getEquipeId(), l.getEquipeCode(), l.getEquipeLibelle(), l.getEffectif(), l.getMasse()))
                .sorted(Comparator.comparing(PaieEquipePeriodeDto::code))
                .toList();
        return new PaieChantierPeriodeDto(
                premiere.getChantierId(),
                premiere.getChantierCode(),
                libelle,
                lignes.stream().mapToLong(ChantierEquipePeriodeProjection::getEffectif).sum(),
                lignes.stream().map(ChantierEquipePeriodeProjection::getMasse).reduce(BigDecimal.ZERO, BigDecimal::add),
                equipes);
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

    /** Un bulletin peut ne pas avoir d'équipe : {@code null} reste {@code null}, un id inconnu est rejeté. */
    private Equipe resolveEquipeReference(Long equipeId) {
        if (equipeId == null) {
            return null;
        }
        if (!equipeService.existsById(equipeId)) {
            throw new InvalidReferenceException("Équipe introuvable avec l'id : " + equipeId);
        }
        return entityManager.getReference(Equipe.class, equipeId);
    }

    private Chantier resolveChantierReference(Long chantierId) {
        if (!chantierService.existsById(chantierId)) {
            throw new InvalidReferenceException("Chantier introuvable avec l'id : " + chantierId);
        }
        return entityManager.getReference(Chantier.class, chantierId);
    }
}
