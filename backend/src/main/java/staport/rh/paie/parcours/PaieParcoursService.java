package staport.rh.paie.parcours;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.parcours.ParcoursEmployeDto.EvenementDto;
import staport.rh.paie.parcours.ParcoursEmployeDto.Indicateurs;
import staport.rh.paie.parcours.ParcoursEmployeDto.MoisDto;
import staport.rh.paie.parcours.ParcoursEmployeDto.TypeEvenement;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Le parcours d'un employé est calculé à partir de ses bulletins (instantanés du mois) et de ses départs : rien n'est
 * recopié dans une table d'historique (ADR 0010). Entre deux mois de paie qui se suivent, chaque différence d'affectation
 * ou de salaire devient un événement ; une paie après un départ est un retour.
 */
@Service
public class PaieParcoursService {

    private static final Comparator<EvenementDto> PLUS_RECENT_D_ABORD = Comparator
            .comparing(EvenementDto::periode).reversed()
            .thenComparing(EvenementDto::type, Comparator.reverseOrder());

    private final PaieRepository repository;
    private final IEmployeeService employeeService;

    public PaieParcoursService(PaieRepository repository, IEmployeeService employeeService) {
        this.repository = repository;
        this.employeeService = employeeService;
    }

    @Transactional(readOnly = true)
    public ParcoursEmployeDto parcours(Long employeId) {
        if (!employeeService.existsById(employeId)) {
            throw new ParcoursEmployeIntrouvableException(employeId);
        }
        List<Paie> bulletins = repository.findByEmployee_IdOrderByPeriodeAsc(employeId);
        List<EmployeeSortieDto> departs = employeeService.listerSorties(employeId);

        List<EvenementDto> evenements = new ArrayList<>();
        Paie precedent = null;
        for (Paie bulletin : bulletins) {
            if (precedent == null) {
                evenements.add(new EvenementDto(bulletin.getPeriode(), TypeEvenement.ENTREE, null,
                        bulletin.getChantier().getCode() + " · " + bulletin.getFonction().getLibelle(), null));
            } else {
                Paie avant = precedent;
                if (departs.stream().anyMatch(d -> !d.periode().isBefore(avant.getPeriode()) && d.periode().isBefore(bulletin.getPeriode()))) {
                    evenements.add(new EvenementDto(bulletin.getPeriode(), TypeEvenement.RETOUR, null, null, null));
                }
                changement(evenements, bulletin, TypeEvenement.CHANGEMENT_CHANTIER, avant.getChantier().getCode(), bulletin.getChantier().getCode());
                changement(evenements, bulletin, TypeEvenement.CHANGEMENT_FONCTION, avant.getFonction().getLibelle(), bulletin.getFonction().getLibelle());
                changement(evenements, bulletin, TypeEvenement.CHANGEMENT_EQUIPE, codeEquipe(avant), codeEquipe(bulletin));
                if (avant.getSalaireMensuel().compareTo(bulletin.getSalaireMensuel()) != 0) {
                    evenements.add(new EvenementDto(bulletin.getPeriode(), TypeEvenement.CHANGEMENT_SALAIRE,
                            avant.getSalaireMensuel().toPlainString(), bulletin.getSalaireMensuel().toPlainString(), null));
                }
            }
            precedent = bulletin;
        }
        departs.forEach(depart -> evenements.add(new EvenementDto(depart.periode(), TypeEvenement.DEPART, null, null, depart.motif())));
        evenements.sort(PLUS_RECENT_D_ABORD);

        List<MoisDto> mois = new ArrayList<>(bulletins.stream().map(PaieParcoursService::mois).toList());
        mois.sort(Comparator.comparing(MoisDto::periode).reversed());
        return new ParcoursEmployeDto(employeId, indicateurs(bulletins), mois, evenements);
    }

    private static void changement(List<EvenementDto> evenements, Paie bulletin, TypeEvenement type, String avant, String apres) {
        if (!Objects.equals(avant, apres)) {
            evenements.add(new EvenementDto(bulletin.getPeriode(), type, avant, apres, null));
        }
    }

    private static String codeEquipe(Paie bulletin) {
        return bulletin.getEquipe() == null ? null : bulletin.getEquipe().getCode();
    }

    private static Indicateurs indicateurs(List<Paie> bulletins) {
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal jours = BigDecimal.ZERO;
        for (Paie bulletin : bulletins) {
            total = total.add(bulletin.getSalaireTotal());
            jours = jours.add(bulletin.getNombreJoursTravailles());
        }
        return new Indicateurs(bulletins.size(), total, jours,
                bulletins.isEmpty() ? null : bulletins.get(0).getPeriode(),
                bulletins.isEmpty() ? null : bulletins.get(bulletins.size() - 1).getPeriode());
    }

    private static MoisDto mois(Paie bulletin) {
        return new MoisDto(bulletin.getId(), bulletin.getPeriode(), bulletin.getFonction().getLibelle(), bulletin.getChantier().getCode(),
                codeEquipe(bulletin), bulletin.getNombreJoursTravailles(), bulletin.getSalaireMensuel(), bulletin.getSalaireTotal(),
                bulletin.getObservation());
    }
}
