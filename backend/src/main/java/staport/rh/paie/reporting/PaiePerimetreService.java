package staport.rh.paie.reporting;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Calcule le périmètre d'une période (GLB + par chantier, avec exclusions et sélection des
 * équipes à générer) — logique partagée entre l'export Excel ({@code PaieExportService}) et le
 * rapport PDF ({@code PaieReportPdfService}), pour ne jamais dupliquer la lecture de
 * {@code feuillesEquipeMode}/{@code equipesParChantier}/{@code equipesExcluesFeuilleChantier}.
 */
@Service
public class PaiePerimetreService {

    private final PaieRepository repository;

    public PaiePerimetreService(PaieRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public PerimetrePaie calculer(YearMonth periode, FeuillesEquipeMode mode,
                                   Map<String, List<String>> equipesParChantier,
                                   Map<String, List<String>> equipesExcluesFeuilleChantier) {
        List<Paie> lignesPeriode = repository.findByPeriode(periode);
        List<Paie> lignesPeriodePrecedente = repository.findByPeriode(periode.minusMonths(1));

        Map<String, List<Paie>> lignesParChantier = groupBy(lignesPeriode, p -> p.getChantier().getCode());
        Map<String, List<Paie>> lignesPrecedentesParChantier = groupBy(lignesPeriodePrecedente, p -> p.getChantier().getCode());

        FeuillesEquipeMode modeResolu = mode == null ? FeuillesEquipeMode.AUCUNE : mode;
        Map<String, PerimetreChantier> parChantier = new TreeMap<>();

        for (Map.Entry<String, List<Paie>> entree : lignesParChantier.entrySet()) {
            String chantierCode = entree.getKey();
            List<Paie> lignesChantier = entree.getValue();

            List<Paie> lignesRetenues = exclureEquipes(lignesChantier, chantierCode, equipesExcluesFeuilleChantier);
            List<Paie> lignesPrecedentesRetenues = exclureEquipes(
                    lignesPrecedentesParChantier.getOrDefault(chantierCode, List.of()), chantierCode, equipesExcluesFeuilleChantier);

            List<String> equipesAGenerer = equipesAGenererPour(chantierCode, lignesChantier, modeResolu, equipesParChantier);
            Map<String, List<Paie>> lignesParEquipeAGenerer = groupBy(
                    lignesChantier.stream()
                            .filter(p -> p.getEquipe() != null && !p.getEquipe().isBlank() && equipesAGenerer.contains(p.getEquipe()))
                            .toList(),
                    Paie::getEquipe);
            Map<String, List<Paie>> lignesPrecedentesParEquipe = groupBy(
                    lignesPrecedentesParChantier.getOrDefault(chantierCode, List.of()).stream()
                            .filter(p -> p.getEquipe() != null && !p.getEquipe().isBlank())
                            .toList(),
                    Paie::getEquipe);
            Map<String, BigDecimal> totalMoisPrecedentParEquipe = new TreeMap<>();
            for (String equipe : equipesAGenerer) {
                BigDecimal total = totalSalairesOuNull(lignesPrecedentesParEquipe.getOrDefault(equipe, List.of()));
                if (total != null) {
                    totalMoisPrecedentParEquipe.put(equipe, total);
                }
            }

            parChantier.put(chantierCode, new PerimetreChantier(
                    chantierCode, lignesRetenues, totalSalairesOuNull(lignesPrecedentesRetenues),
                    lignesParEquipeAGenerer, totalMoisPrecedentParEquipe));
        }

        return new PerimetrePaie(periode, lignesPeriode, totalSalairesOuNull(lignesPeriodePrecedente), parChantier);
    }

    private List<String> equipesAGenererPour(String chantierCode, List<Paie> lignesChantier, FeuillesEquipeMode mode,
                                              Map<String, List<String>> equipesParChantier) {
        return switch (mode) {
            case AUCUNE -> List.of();
            case TOUTES -> lignesChantier.stream()
                    .map(Paie::getEquipe)
                    .filter(equipe -> equipe != null && !equipe.isBlank())
                    .distinct()
                    .toList();
            case PERSONNALISE -> equipesParChantier == null
                    ? List.of()
                    : equipesParChantier.getOrDefault(chantierCode, List.of());
        };
    }

    private List<Paie> exclureEquipes(List<Paie> lignes, String chantierCode, Map<String, List<String>> equipesExcluesParChantier) {
        if (equipesExcluesParChantier == null) {
            return lignes;
        }
        List<String> exclues = equipesExcluesParChantier.get(chantierCode);
        if (exclues == null || exclues.isEmpty()) {
            return lignes;
        }
        Set<String> exclusionSet = new HashSet<>(exclues);
        return lignes.stream().filter(p -> p.getEquipe() == null || !exclusionSet.contains(p.getEquipe())).toList();
    }

    private Map<String, List<Paie>> groupBy(List<Paie> lignes, java.util.function.Function<Paie, String> classificateur) {
        return lignes.stream().collect(Collectors.groupingBy(classificateur, TreeMap::new, Collectors.toList()));
    }

    /**
     * Total de la période précédente pour le périmètre donné, ou {@code null} si aucune paie
     * n'existe pour ce périmètre sur cette période — distingue "aucune donnée" ({@code INTROUVABLE}
     * dans l'export) de "total réellement nul".
     */
    private BigDecimal totalSalairesOuNull(List<Paie> lignes) {
        if (lignes.isEmpty()) {
            return null;
        }
        return lignes.stream()
                .map(Paie::getSalaireTotal)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
