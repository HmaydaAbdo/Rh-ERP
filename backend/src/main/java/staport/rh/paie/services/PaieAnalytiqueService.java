package staport.rh.paie.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.ChantierMasse;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Evolution;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.EquipeMasse;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.FonctionMasse;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Kpi;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Qualite;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Tranche;
import staport.rh.paie.dtos.response.PaieComparaisonDto;
import staport.rh.paie.dtos.response.PaieComparaisonDto.Groupe;
import staport.rh.paie.dtos.response.PaieComparaisonDto.Total;
import staport.rh.paie.dtos.response.PaieRepartitionDto;
import staport.rh.paie.dtos.response.PaieRepartitionDto.Dimension;
import staport.rh.paie.repositories.EquipeMasseProjection;
import staport.rh.paie.repositories.FiltresPaie;
import staport.rh.paie.repositories.PaieKpiProjection;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;

import staport.rh.parametre.services.interfaces.IParametreService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.List;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.IntStream;

@Service
public class PaieAnalytiqueService implements IPaieAnalytiqueService {

    private static final int NOMBRE_TRANCHES = 6;
    private static final Map<String, String> DEFINITIONS_COMPARAISON = Map.ofEntries(
            Map.entry("masse", "Masse salariale du mois récent, en dirhams"),
            Map.entry("masseReference", "Masse salariale du mois de comparaison ; absente si le groupe n'a pas de paie ce mois-là"),
            Map.entry("variationMasse", "Masse du mois récent moins masse du mois de comparaison, en dirhams (négative = baisse) ; absente si un mois manque"),
            Map.entry("variationPourcentage", "Variation de masse divisée par la masse du mois de comparaison, en pourcentage à une décimale ; absente si la masse de référence est nulle"),
            Map.entry("effectif", "Employés payés dans le mois récent (un bulletin par employé)"),
            Map.entry("variationEffectif", "Effectif du mois récent moins effectif du mois de comparaison ; absent si un mois manque"),
            Map.entry("coutMoyen", "Masse divisée par l'effectif du mois récent, en dirhams ; absent sans bulletin"),
            Map.entry("fonctionPrincipale", "Fonction qui compte le plus d'employés payés dans le groupe au mois récent ; à égalité, le libellé alphabétique vient en premier"),
            Map.entry("statut", "COMPARABLE (paie aux deux mois), NOUVEAU (paie seulement au mois récent) ou DISPARU (paie seulement au mois de comparaison)"),
            Map.entry("plusForteHausse", "Groupe comparable dont la masse a le plus augmenté parmi les groupes rendus ; nul si aucun n'augmente"),
            Map.entry("plusForteHausseDuPerimetre", "Groupe comparable dont la masse a le plus augmenté sur tout le périmètre, même s'il n'est pas dans la liste rendue"),
            Map.entry("plusForteBaisse", "Groupe comparable dont la masse a le plus baissé parmi les groupes rendus ; nul si aucun ne baisse"),
            Map.entry("plusForteBaisseDuPerimetre", "Groupe comparable dont la masse a le plus baissé sur tout le périmètre, même s'il n'est pas dans la liste rendue"));

    private final PaieRepository repository;
    private final IParametreService parametres;

    public PaieAnalytiqueService(PaieRepository repository, IParametreService parametres) {
        this.repository = repository;
        this.parametres = parametres;
    }

    @Override
    @Transactional(readOnly = true)
    public PaieAnalytiqueDto analyser(PaieSearchCriteria criteres) {
        YearMonth periode = criteres.periode();
        FiltresPaie filtres = FiltresPaie.depuis(criteres);

        PaieKpiProjection courant = repository.resumerKpi(periode, filtres);
        if (courant.getEffectif() == 0) {
            // Le mois n'a aucun bulletin, mais l'historique du périmètre reste consultable (ex. équipe active un autre mois).
            return new PaieAnalytiqueDto(periode.toString(), versKpi(courant), null, List.of(), List.of(), List.of(), List.of(),
                    evolution(filtres, null), new Qualite(0, 0));
        }

        PaieKpiProjection precedent = repository.resumerKpi(periode.minusMonths(1), filtres);
        return new PaieAnalytiqueDto(
                periode.toString(),
                versKpi(courant),
                precedent.getEffectif() > 0 ? versKpi(precedent) : null,
                repository.sommerParChantier(periode, filtres).stream()
                        .map(c -> new ChantierMasse(c.getId(), c.getCode(), libelleChantier(c.getNom(), c.getDesignation()),
                                c.getMasse(), c.getEffectif(), c.getStc(), c.getStcMontant()))
                        .toList(),
                repository.sommerParEquipe(periode, filtres).stream()
                        .map(this::versEquipe)
                        .toList(),
                repository.sommerParFonction(periode, filtres).stream()
                        .map(f -> new FonctionMasse(f.getId(), f.getLibelle(), f.getMasse(), f.getEffectif(), f.getStc(), f.getStcMontant()))
                        .toList(),
                repartirParTranche(repository.listerTotaux(periode, filtres)),
                evolution(filtres, null),
                new Qualite(courant.getSansEquipe(), courant.getSansObservation()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Evolution> evolutionJusqua(PaieSearchCriteria criteres) {
        return evolution(FiltresPaie.depuis(criteres), criteres.periode());
    }

    @Override
    @Transactional(readOnly = true)
    public PaieRepartitionDto repartir(PaieSearchCriteria criteres, Dimension dimension,
                                       PaieRepartitionDto.Tri tri, Boolean ascendant) {
        PaieAnalytiqueDto resultat = analyser(criteres);
        List<PaieRepartitionDto.Groupe> groupes = switch (dimension) {
            case CHANTIER -> resultat.parChantier().stream()
                    .map(g -> new PaieRepartitionDto.Groupe(g.id(), g.code(), g.libelle(), g.masse(),
                            g.effectif(), g.stc(), g.stcMontant())).toList();
            case EQUIPE -> resultat.parEquipe().stream()
                    .map(g -> new PaieRepartitionDto.Groupe(g.id(), g.code(), g.libelle(), g.masse(),
                            g.effectif(), g.stc(), g.stcMontant())).toList();
            case FONCTION -> resultat.parFonction().stream()
                    .map(g -> new PaieRepartitionDto.Groupe(g.id(), null, g.libelle(), g.masse(),
                            g.effectif(), g.stc(), g.stcMontant())).toList();
        };
        PaieRepartitionDto.Tri critere = tri == null ? PaieRepartitionDto.Tri.MASSE : tri;
        boolean texte = critere == PaieRepartitionDto.Tri.LIBELLE || critere == PaieRepartitionDto.Tri.CODE;
        boolean ordreAscendant = ascendant != null ? ascendant : texte;
        Comparator<PaieRepartitionDto.Groupe> ordre = switch (critere) {
            case MASSE -> Comparator.comparing(PaieRepartitionDto.Groupe::masse);
            case EFFECTIF -> Comparator.comparingLong(PaieRepartitionDto.Groupe::effectif);
            case STC -> Comparator.comparingLong(PaieRepartitionDto.Groupe::stc);
            case STC_MONTANT -> Comparator.comparing(PaieRepartitionDto.Groupe::stcMontant);
            case LIBELLE -> Comparator.comparing(PaieRepartitionDto.Groupe::libelle, String.CASE_INSENSITIVE_ORDER);
            case CODE -> Comparator.comparing(g -> g.code() == null ? "" : g.code(), String.CASE_INSENSITIVE_ORDER);
        };
        if (!ordreAscendant) ordre = ordre.reversed();
        List<PaieRepartitionDto.Groupe> groupesTries = groupes.stream().sorted(ordre).toList();
        return new PaieRepartitionDto(resultat.periode(), dimension, groupesTries.size(), groupesTries);
    }

    @Override
    @Transactional(readOnly = true)
    public PaieComparaisonDto comparer(PaieSearchCriteria recent, PaieSearchCriteria reference,
                                       PaieComparaisonDto.Dimension dimension, PaieComparaisonDto.Tri tri, boolean ascendant) {
        if (reference == null) {
            reference = new PaieSearchCriteria(recent.cin(), recent.nomPrenom(), recent.periode().minusMonths(1),
                    recent.fonctionIds(), recent.chantierIds(), recent.equipeIds());
        }
        PaieAnalytiqueDto actuel = analyser(recent);
        PaieAnalytiqueDto ancien = analyser(reference);
        Map<Long, GroupePaie> groupesAnciens = new LinkedHashMap<>();
        groupes(ancien, dimension).forEach(g -> groupesAnciens.put(g.id(), g));
        List<GroupeComparaison> toutes = new ArrayList<>();
        for (GroupePaie groupe : groupes(actuel, dimension)) {
            toutes.add(new GroupeComparaison(groupe, groupesAnciens.remove(groupe.id())));
        }
        groupesAnciens.values().forEach(g -> toutes.add(new GroupeComparaison(null, g)));

        PaieComparaisonDto.Tri critere = tri == null ? PaieComparaisonDto.Tri.MASSE : tri;
        Comparator<GroupeComparaison> ordre = critere == PaieComparaisonDto.Tri.LIBELLE
                ? Comparator.comparing(GroupeComparaison::libelle, String.CASE_INSENSITIVE_ORDER)
                : Comparator.comparing(g -> g.valeur(critere), Comparator.nullsLast(Comparator.<BigDecimal>naturalOrder()));
        if (!ascendant) {
            ordre = ordre.reversed();
        }
        Comparator<GroupeComparaison> comparateur = critere == PaieComparaisonDto.Tri.LIBELLE
                ? ordre
                : Comparator.comparing((GroupeComparaison g) -> g.valeur(critere) == null).thenComparing(ordre);
        List<GroupeComparaison> classees = toutes.stream().sorted(comparateur).toList();
        List<Groupe> resultats = classees.stream()
                .map(g -> versGroupe(g, fonctionPrincipale(g, dimension, recent))).toList();

        return new PaieComparaisonDto(actuel.periode(), ancien.periode(), dimension, toutes.size(),
                total(actuel.kpis(), ancien.kpis()), extreme(toutes, true), extreme(toutes, false),
                extreme(toutes, true), extreme(toutes, false), resultats, DEFINITIONS_COMPARAISON);
    }

    private record GroupePaie(Long id, String code, String libelle, BigDecimal masse, long effectif) {
    }

    private record GroupeComparaison(GroupePaie source, GroupePaie reference) {
        GroupePaie groupe() { return source != null ? source : reference; }
        Long id() { return groupe().id(); }
        String libelle() { return groupe().libelle() == null ? "" : groupe().libelle(); }
        boolean comparable() { return source != null && reference != null; }
        BigDecimal variationMasse() { return comparable() ? source.masse().subtract(reference.masse()) : null; }
        BigDecimal variationPourcentage() {
            if (!comparable() || reference.masse().signum() == 0) return null;
            return variationMasse().multiply(BigDecimal.valueOf(100)).divide(reference.masse(), 1, RoundingMode.HALF_UP);
        }
        Long variationEffectif() { return comparable() ? source.effectif() - reference.effectif() : null; }
        BigDecimal valeur(PaieComparaisonDto.Tri tri) {
            return switch (tri) {
                case MASSE -> source == null ? null : source.masse();
                case VARIATION_MASSE -> variationMasse();
                case VARIATION_POURCENTAGE -> variationPourcentage();
                case EFFECTIF -> source == null ? null : BigDecimal.valueOf(source.effectif());
                case VARIATION_EFFECTIF -> comparable() ? BigDecimal.valueOf(variationEffectif()) : null;
                case LIBELLE -> null;
            };
        }
    }

    private static List<GroupePaie> groupes(PaieAnalytiqueDto resultat, PaieComparaisonDto.Dimension dimension) {
        return switch (dimension) {
            case CHANTIER -> resultat.parChantier().stream()
                    .map(g -> new GroupePaie(g.id(), g.code(), g.libelle(), g.masse(), g.effectif())).toList();
            case EQUIPE -> resultat.parEquipe().stream()
                    .map(g -> new GroupePaie(g.id(), g.code(), g.libelle(), g.masse(), g.effectif())).toList();
            case FONCTION -> resultat.parFonction().stream()
                    .map(g -> new GroupePaie(g.id(), null, g.libelle(), g.masse(), g.effectif())).toList();
        };
    }

    private static BigDecimal coutMoyen(BigDecimal masse, long effectif) {
        return effectif == 0 ? null : masse.divide(BigDecimal.valueOf(effectif), 2, RoundingMode.HALF_UP);
    }

    private Groupe versGroupe(GroupeComparaison c, PaieComparaisonDto.FonctionPrincipale fonction) {
        boolean nouveau = c.reference() == null;
        boolean disparu = c.source() == null;
        return new Groupe(c.id(), c.groupe().code(), c.groupe().libelle(), disparu ? "DISPARU" : nouveau ? "NOUVEAU" : "COMPARABLE",
                disparu ? null : c.source().masse(), nouveau ? null : c.reference().masse(), c.variationMasse(), c.variationPourcentage(),
                disparu ? null : c.source().effectif(), nouveau ? null : c.reference().effectif(), c.variationEffectif(),
                disparu ? null : coutMoyen(c.source().masse(), c.source().effectif()),
                nouveau ? null : coutMoyen(c.reference().masse(), c.reference().effectif()), fonction);
    }

    private PaieComparaisonDto.FonctionPrincipale fonctionPrincipale(GroupeComparaison c,
            PaieComparaisonDto.Dimension dimension, PaieSearchCriteria recent) {
        if (dimension == PaieComparaisonDto.Dimension.FONCTION || c.source() == null) return null;
        PaieSearchCriteria criteria = dimension == PaieComparaisonDto.Dimension.CHANTIER
                ? new PaieSearchCriteria(recent.cin(), recent.nomPrenom(), recent.periode(), recent.fonctionIds(),
                        List.of(c.id()), recent.equipeIds())
                : new PaieSearchCriteria(recent.cin(), recent.nomPrenom(), recent.periode(), recent.fonctionIds(),
                        recent.chantierIds(), List.of(c.id() == null ? 0L : c.id()));
        return analyser(criteria).parFonction().stream()
                .max(Comparator.comparingLong(FonctionMasse::effectif)
                        .thenComparing(Comparator.comparing(FonctionMasse::libelle).reversed()))
                .map(f -> new PaieComparaisonDto.FonctionPrincipale(f.libelle(), f.effectif())).orElse(null);
    }

    private static Total total(Kpi actuel, Kpi ancien) {
        boolean comparable = ancien != null && ancien.effectif() > 0;
        BigDecimal variation = comparable ? actuel.masse().subtract(ancien.masse()) : null;
        return new Total(actuel.masse(), comparable ? ancien.masse() : null, variation,
                comparable && ancien.masse().signum() != 0
                        ? variation.multiply(BigDecimal.valueOf(100)).divide(ancien.masse(), 1, RoundingMode.HALF_UP) : null,
                actuel.effectif(), comparable ? ancien.effectif() : null,
                comparable ? actuel.effectif() - ancien.effectif() : null,
                coutMoyen(actuel.masse(), actuel.effectif()), comparable ? coutMoyen(ancien.masse(), ancien.effectif()) : null);
    }

    private static Groupe extreme(List<GroupeComparaison> comparaisons, boolean hausse) {
        return comparaisons.stream().filter(c -> c.variationMasse() != null
                        && (hausse ? c.variationMasse().signum() > 0 : c.variationMasse().signum() < 0))
                .reduce((a, b) -> (hausse ? a.variationMasse().compareTo(b.variationMasse()) >= 0
                        : a.variationMasse().compareTo(b.variationMasse()) <= 0) ? a : b)
                .map(c -> new Groupe(c.id(), c.groupe().code(), c.groupe().libelle(), "COMPARABLE",
                        c.source().masse(), c.reference().masse(), c.variationMasse(), c.variationPourcentage(),
                        c.source().effectif(), c.reference().effectif(), c.variationEffectif(),
                        coutMoyen(c.source().masse(), c.source().effectif()), coutMoyen(c.reference().masse(), c.reference().effectif()), null))
                .orElse(null);
    }

    private List<Evolution> evolution(FiltresPaie filtres, YearMonth jusqua) {
        return repository.sommerParPeriode(filtres).stream()
                .filter(e -> jusqua == null || !e.getPeriode().isAfter(jusqua))
                .map(e -> new Evolution(e.getPeriode().toString(), e.getMasse(), e.getEffectif(), e.getStc(), e.getStcMontant()))
                .toList();
    }

    private static Kpi versKpi(PaieKpiProjection projection) {
        long effectif = projection.getEffectif();
        BigDecimal coutMoyen = effectif > 0 ? projection.getMasse().divide(BigDecimal.valueOf(effectif), 2, RoundingMode.HALF_UP) : null;
        return new Kpi(projection.getMasse(), effectif, coutMoyen, projection.getChantiers(), projection.getStc(), projection.getStcMontant());
    }

    private EquipeMasse versEquipe(EquipeMasseProjection projection) {
        return new EquipeMasse(projection.getId(), projection.getCode(), projection.getLibelle(), projection.getMasse(),
                projection.getEffectif(), projection.getStc(), projection.getStcMontant());
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
    private List<Tranche> repartirParTranche(List<BigDecimal> totaux) {
        // Largeur minimale d'une tranche, et pas d'arrondi de sa largeur (en DH) : le paramètre « Pas des tranches ».
        BigDecimal pasTranche = parametres.pasTrancheAnalytique();
        BigDecimal plusGrand = totaux.stream().max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
        BigDecimal largeur = plusGrand
                .divide(BigDecimal.valueOf(NOMBRE_TRANCHES), 0, RoundingMode.CEILING)
                .divide(pasTranche, 0, RoundingMode.CEILING)
                .multiply(pasTranche)
                .max(pasTranche);

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
