package staport.rh.heuresupp.services;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppModificationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppCreationDto;
import jakarta.persistence.EntityManager;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.services.interfaces.IPaieService;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.heuresupp.audit.PerimetreSuppressionGroupeHeuresSupp;
import staport.rh.heuresupp.imports.HeuresSuppImportException;
import staport.rh.heuresupp.exceptions.HeuresSuppGroupeModifieException;
import staport.rh.heuresupp.mappers.HeuresSuppMapper;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.heuresupp.services.interfaces.IHeuresSuppService;
import staport.rh.heuresupp.specifications.HeuresSuppSpecification;

@Service
public class HeuresSuppService implements IHeuresSuppService {

    private final HeuresSuppRepository repository;
    private final HeuresSuppMapper mapper;
    private final EntityManager entityManager;
    private final IEmployeeService employes;
    private final IPaieService paies;
    private final IChantierService chantiers;

    public HeuresSuppService(HeuresSuppRepository repository, HeuresSuppMapper mapper, EntityManager entityManager,
                             IEmployeeService employes, IPaieService paies, IChantierService chantiers) {
        this.repository = repository;
        this.mapper = mapper;
        this.entityManager = entityManager;
        this.employes = employes;
        this.paies = paies;
        this.chantiers = chantiers;
    }

    @Override
    @Transactional
    @AuditableAction(action = "HEURES_SUP_CREATION_UNITAIRE", type = TypeOperation.CREATE, entite = HeureSupp.class)
    public HeureSuppResponseDto creer(HeuresSuppCreationDto requete) {
        if (requete.heuresSupplementaires() == null && requete.forfaitDh() == null)
            throw new HeuresSuppImportException("Saisissez des heures supplémentaires ou un forfait.");
        var employe = employes.findById(requete.employeeId());
        var bulletin = paies.findByEmployeeIdAndPeriode(requete.employeeId(), requete.periode())
                .orElseThrow(() -> new HeuresSuppImportException("Aucune paie n'existe pour cet employé pendant ce mois."));
        if (!chantiers.existsById(requete.chantierId())) throw new HeuresSuppImportException("Le chantier sélectionné n'existe plus.");
        if (repository.existsByEmployee_IdAndPeriodeAndChantier_Id(requete.employeeId(), requete.periode(), requete.chantierId()))
            throw new HeuresSuppImportException("Une ligne existe déjà pour cet employé, ce mois et ce chantier.");
        boolean stc = ObservationStc.estStcOuSortie(bulletin.observation());
        if (stc && requete.forfaitDh() != null) throw new HeuresSuppImportException("Le forfait est interdit car la paie est marquée STC/sortie.");
        if (stc && repository.existsByEmployee_IdAndPeriodeAndForfaitIsNotNullAndChantier_IdNot(requete.employeeId(), requete.periode(), requete.chantierId()))
            throw new HeuresSuppImportException("Un forfait existe déjà pour cet employé sur un autre chantier pendant ce mois marqué STC/sortie.");
        var taux = requete.heuresSupplementaires() == null ? null : CalculHeuresSupp.salaireHoraire(employe.salaire(), employe.typeSalaire());
        var montant = taux == null ? java.math.BigDecimal.ZERO : CalculHeuresSupp.montant(taux, requete.heuresSupplementaires());
        var ligne = new HeureSupp();
        ligne.setEmployee(entityManager.getReference(Employee.class, employe.id()));
        ligne.setPaie(entityManager.getReference(Paie.class, bulletin.id()));
        ligne.setFonction(entityManager.getReference(Function.class, bulletin.fonction().id()));
        ligne.setChantier(entityManager.getReference(Chantier.class, requete.chantierId()));
        ligne.setPeriode(requete.periode());
        ligne.setHeures(requete.heuresSupplementaires());
        ligne.setSalaireReference(requete.heuresSupplementaires() == null ? null : employe.salaire());
        ligne.setTypeSalaireReference(requete.heuresSupplementaires() == null ? null : employe.typeSalaire());
        ligne.setSalaireHoraire(taux);
        ligne.setMontant(montant);
        ligne.setStcOuSortie(stc);
        ligne.setStcDh(CalculHeuresSupp.stcDh(montant, stc));
        ligne.setForfait(requete.forfaitDh());
        ligne.setNetAPayer(CalculHeuresSupp.netAPayer(montant, ligne.getStcDh(), requete.forfaitDh()));
        return mapper.toDto(repository.save(ligne));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<HeureSuppResponseDto> rechercher(HeuresSuppSearchCriteria criteres, Pageable pageable) {
        return repository.findAll(HeuresSuppSpecification.rechercher(criteres), pageable).map(mapper::toDto);
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_MODIFICATION", type = TypeOperation.UPDATE, entite = HeureSupp.class)
    public HeureSuppResponseDto modifier(Long id, HeuresSuppModificationDto requete) {
        HeureSupp ligne = repository.findById(id).orElseThrow(() -> new HeuresSuppImportException("La ligne d'heures supplémentaires demandée n'existe pas."));
        if (!ligne.getVersion().equals(requete.version())) {
            throw new HeuresSuppImportException("Cette ligne a été modifiée entre-temps. Actualisez-la avant de réessayer.");
        }
        if (requete.heuresSupplementaires() == null && requete.forfaitDh() == null) {
            throw new HeuresSuppImportException("Saisissez des heures supplémentaires ou un forfait.");
        }
        if (ligne.isStcOuSortie() && requete.forfaitDh() != null) {
            throw new HeuresSuppImportException("Le forfait est interdit car la paie du mois est marquée STC/sortie.");
        }
        var taux = ligne.getSalaireHoraire();
        if (requete.heuresSupplementaires() != null && taux == null) {
            throw new HeuresSuppImportException("Aucun taux horaire n'est enregistré pour cette ligne.");
        }
        var montant = requete.heuresSupplementaires() == null ? java.math.BigDecimal.ZERO
                : CalculHeuresSupp.montant(taux, requete.heuresSupplementaires());
        var stc = CalculHeuresSupp.stcDh(montant, ligne.isStcOuSortie());
        ligne.setHeures(requete.heuresSupplementaires());
        if (requete.heuresSupplementaires() == null) {
            ligne.setSalaireReference(null);
            ligne.setTypeSalaireReference(null);
            ligne.setSalaireHoraire(null);
        }
        ligne.setMontant(montant);
        ligne.setStcDh(stc);
        ligne.setForfait(requete.forfaitDh());
        ligne.setNetAPayer(CalculHeuresSupp.netAPayer(montant, stc, requete.forfaitDh()));
        return mapper.toDto(repository.save(ligne));
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_SUPPRESSION", type = TypeOperation.DELETE, entite = HeureSupp.class)
    public void supprimer(Long id) {
        HeureSupp ligne = repository.findById(id).orElseThrow(() -> new HeuresSuppImportException("La ligne d'heures supplémentaires demandée n'existe pas."));
        repository.delete(ligne);
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_SUPPRESSION_MOIS", type = TypeOperation.DELETE, entite = HeureSupp.class,
            perimetre = PerimetreSuppressionGroupeHeuresSupp.class)
    public long supprimerMois(java.time.YearMonth periode, long nombreAttendu) {
        if (periode == null || nombreAttendu < 0) throw new HeuresSuppImportException("Le mois et le nombre confirmé sont obligatoires.");
        var lignes = repository.findByPeriodeOrderByEmployee_NomPrenomAsc(periode);
        if (lignes.size() != nombreAttendu) throw new HeuresSuppGroupeModifieException(lignes.size(), nombreAttendu);
        repository.deleteAll(lignes);
        return lignes.size();
    }
}
