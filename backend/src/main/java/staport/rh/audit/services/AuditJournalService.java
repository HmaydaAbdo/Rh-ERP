package staport.rh.audit.services;

import jakarta.persistence.EntityManager;
import org.hibernate.envers.AuditReader;
import org.hibernate.envers.AuditReaderFactory;
import org.hibernate.envers.RevisionType;
import org.hibernate.envers.query.AuditEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditChangementDto;
import staport.rh.audit.dtos.response.AuditJournalDto;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.dtos.response.PaieRestaurationInstantane;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.envers.EnversDiffService;
import staport.rh.audit.exceptions.AuditEntryNotFoundException;
import staport.rh.audit.exceptions.AuditEntryNotRestaurableException;
import staport.rh.audit.mappers.AuditJournalMapper;
import staport.rh.audit.repositories.AuditJournalRepository;
import staport.rh.audit.services.interfaces.IAuditJournalService;
import staport.rh.audit.specifications.AuditJournalSpecification;
import staport.rh.paie.entities.Paie;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

@Service
public class AuditJournalService implements IAuditJournalService {

    private final AuditJournalRepository repository;
    private final AuditJournalMapper mapper;
    private final EnversDiffService diffService;
    private final EntityManager entityManager;
    private final JsonMapper jsonMapper;

    public AuditJournalService(AuditJournalRepository repository, AuditJournalMapper mapper, EnversDiffService diffService,
                               EntityManager entityManager, JsonMapper jsonMapper) {
        this.repository = repository;
        this.mapper = mapper;
        this.diffService = diffService;
        this.entityManager = entityManager;
        this.jsonMapper = jsonMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<AuditJournalLigneDto> search(AuditSearchCriteria criteria, Pageable pageable) {
        return repository.findAll(AuditJournalSpecification.searchByCriteria(criteria), pageable).map(mapper::toLigne);
    }

    @Override
    @Transactional(readOnly = true)
    public AuditJournalDto findById(Long id) {
        AuditJournalEntry entree = getEntryById(id);
        return mapper.toDto(entree, decoder(entree.getPerimetre()));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<AuditChangementDto> details(Long id, Pageable pageable) {
        AuditJournalEntry entree = getEntryById(id);
        return diffService.changements(revisionsDe(entree), pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<AuditVersionDto> historique(String entite, Long id, Pageable pageable) {
        return diffService.historique(diffService.classeAuditee(entite), id, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PaieRestaurationInstantane> instantanesPaiePourRestauration(Long idEntree) {
        AuditJournalEntry entree = getEntryById(idEntree);
        if (!"PAIE_SUPPRESSION_GROUPE".equals(entree.getAction())
                || entree.getCategorie() != CategorieAudit.OPERATION
                || entree.getResultat() != ResultatAudit.SUCCES
                || entree.getTypeOperation() == null
                || !"DELETE".equals(entree.getTypeOperation().name())
                || !"Paie".equals(entree.getEntiteType())
                || entree.getRevisionId() == null
                || entree.getNombreElements() == null
                || entree.getNombreElements() <= 0) {
            throw new AuditEntryNotRestaurableException(idEntree);
        }

        AuditReader lecteur = AuditReaderFactory.get(entityManager);
        List<?> lignes = lecteur.createQuery().forRevisionsOfEntity(Paie.class, false, true)
                .add(AuditEntity.revisionNumber().eq(entree.getRevisionId()))
                .add(AuditEntity.revisionType().eq(RevisionType.DEL))
                .addOrder(AuditEntity.id().asc())
                .getResultList();
        List<PaieRestaurationInstantane> instantanes = lignes.stream()
                .map(ligne -> versInstantane((Object[]) ligne))
                .toList();
        if (instantanes.size() != entree.getNombreElements()) {
            throw new AuditEntryNotRestaurableException(idEntree);
        }
        return instantanes;
    }

    private PaieRestaurationInstantane versInstantane(Object[] ligne) {
        Paie paie = (Paie) ligne[0];
        return new PaieRestaurationInstantane(paie.getId(), identifiant(paie.getEmployee()), paie.getPeriode(),
                identifiant(paie.getFonction()), identifiant(paie.getChantier()), identifiant(paie.getEquipe()),
                paie.getNombreJoursTravailles(), paie.getJoursRecuperationOuvrable(), paie.getJoursRecuperationDimanche(),
                paie.getSalaireMensuel(), paie.getPrimeRoulageOrdinaire(), paie.getPrimeRoulageDimanche(),
                paie.getSalaireTotal(), paie.getObservation());
    }

    private Long identifiant(Object entite) {
        if (entite == null) {
            return null;
        }
        Object id = entityManager.getEntityManagerFactory().getPersistenceUnitUtil().getIdentifier(entite);
        return id instanceof Number nombre ? nombre.longValue() : null;
    }

    /**
     * La révision de l'entrée ; pour une opération en plusieurs transactions (synchronisation), qui n'a pas de révision
     * unique, toutes celles qui portent le même identifiant de requête. Une opération échouée n'a rien modifié.
     */
    private List<Long> revisionsDe(AuditJournalEntry entree) {
        if (entree.getRevisionId() != null) {
            return List.of(entree.getRevisionId());
        }
        if (entree.getCategorie() == CategorieAudit.OPERATION && entree.getResultat() == ResultatAudit.SUCCES
                && entree.getRequestId() != null) {
            return entityManager.createQuery("SELECT r.id FROM AuditRevision r WHERE r.requestId = :requestId", Long.class)
                    .setParameter("requestId", entree.getRequestId())
                    .getResultList();
        }
        return List.of();
    }

    private Map<String, Object> decoder(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        return jsonMapper.readValue(json, new TypeReference<Map<String, Object>>() {
        });
    }

    private AuditJournalEntry getEntryById(Long id) {
        return repository.findById(id).orElseThrow(() -> new AuditEntryNotFoundException(id));
    }
}
