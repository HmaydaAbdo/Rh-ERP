package staport.rh.paie.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.ChantierMasse;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Evolution;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.FonctionMasse;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Kpi;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Qualite;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Tranche;
import staport.rh.paie.repositories.FiltresPaie;
import staport.rh.paie.repositories.PaieKpiProjection;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.List;
import java.util.stream.IntStream;

@Service
public class PaieAnalytiqueService implements IPaieAnalytiqueService {

    private static final int NOMBRE_TRANCHES = 6;
    /** Largeur minimale d'une tranche, et pas d'arrondi de sa largeur (en DH) : des bornes lisibles (500, 1 000, 1 500…). */
    private static final BigDecimal PAS_TRANCHE = new BigDecimal("500");

    private final PaieRepository repository;

    public PaieAnalytiqueService(PaieRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public PaieAnalytiqueDto analyser(PaieSearchCriteria criteres) {
        YearMonth periode = criteres.periode();
        FiltresPaie filtres = FiltresPaie.depuis(criteres);

        PaieKpiProjection courant = repository.resumerKpi(periode, filtres);
        if (courant.getEffectif() == 0) {
            return new PaieAnalytiqueDto(periode.toString(), versKpi(courant), null, List.of(), List.of(), List.of(), List.of(),
                    new Qualite(0, 0));
        }

        PaieKpiProjection precedent = repository.resumerKpi(periode.minusMonths(1), filtres);
        return new PaieAnalytiqueDto(
                periode.toString(),
                versKpi(courant),
                precedent.getEffectif() > 0 ? versKpi(precedent) : null,
                repository.sommerParChantier(periode, filtres).stream()
                        .map(c -> new ChantierMasse(c.getId(), c.getCode(), libelleChantier(c.getNom(), c.getDesignation()),
                                c.getMasse(), c.getEffectif(), c.getStc()))
                        .toList(),
                repository.sommerParFonction(periode, filtres).stream()
                        .map(f -> new FonctionMasse(f.getId(), f.getLibelle(), f.getMasse(), f.getEffectif()))
                        .toList(),
                repartirParTranche(repository.listerTotaux(periode, filtres)),
                repository.sommerParPeriode(filtres).stream()
                        .map(e -> new Evolution(e.getPeriode().toString(), e.getMasse(), e.getEffectif()))
                        .toList(),
                new Qualite(courant.getSansEquipe(), courant.getSansObservation()));
    }

    private static Kpi versKpi(PaieKpiProjection projection) {
        long effectif = projection.getEffectif();
        BigDecimal coutMoyen = effectif > 0 ? projection.getMasse().divide(BigDecimal.valueOf(effectif), 2, RoundingMode.HALF_UP) : null;
        return new Kpi(projection.getMasse(), effectif, coutMoyen, projection.getChantiers(), projection.getStc());
    }

    /** Le nom du chantier, à défaut sa désignation (même règle que {@code PaieService.findChantiersDeLaPeriode}). */
    private static String libelleChantier(String nom, String designation) {
        return nom != null && !nom.isBlank() ? nom : designation;
    }

    /**
     * Répartit les totaux en {@value #NOMBRE_TRANCHES} tranches de même largeur, la dernière étant ouverte. La largeur est
     * celle qui couvre le plus gros total en {@value #NOMBRE_TRANCHES} tranches, arrondie au pas supérieur : les bornes
     * restent lisibles et suivent la réalité du périmètre, sans seuils métier inventés.
     */
    private static List<Tranche> repartirParTranche(List<BigDecimal> totaux) {
        BigDecimal plusGrand = totaux.stream().max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
        BigDecimal largeur = plusGrand
                .divide(BigDecimal.valueOf(NOMBRE_TRANCHES), 0, RoundingMode.CEILING)
                .divide(PAS_TRANCHE, 0, RoundingMode.CEILING)
                .multiply(PAS_TRANCHE)
                .max(PAS_TRANCHE);

        long[] effectifs = new long[NOMBRE_TRANCHES];
        for (BigDecimal total : totaux) {
            int indice = total.divide(largeur, 0, RoundingMode.DOWN).intValue();
            effectifs[Math.min(indice, NOMBRE_TRANCHES - 1)]++;
        }
        return IntStream.range(0, NOMBRE_TRANCHES)
                .mapToObj(i -> new Tranche(
                        largeur.multiply(BigDecimal.valueOf(i)),
                        i < NOMBRE_TRANCHES - 1 ? largeur.multiply(BigDecimal.valueOf(i + 1L)) : null,
                        effectifs[i]))
                .toList();
    }
}
