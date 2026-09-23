package staport.rh.paie.report;

import org.springframework.stereotype.Component;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.reporting.PerimetreChantier;
import staport.rh.paie.reporting.PerimetrePaie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

/** Convertit {@link PerimetrePaie} (entités) en vues-modèles déjà formatées pour les templates
 * Thymeleaf du rapport PDF — les templates ne font aucun calcul ni formatage. */
@Component
class PaieReportViewModelBuilder {

    private final PaieReportChartGenerator chartGenerator;

    PaieReportViewModelBuilder(PaieReportChartGenerator chartGenerator) {
        this.chartGenerator = chartGenerator;
    }

    Map<String, Object> synthese(PerimetrePaie perimetre) {
        List<Paie> lignes = perimetre.lignesGlobales();
        BigDecimal masseTotale = sommeSalaires(lignes);
        BigDecimal masseTotalePrecedente = perimetre.totalMoisPrecedentGlobal();

        List<ChantierSyntheseVue> chantiers = perimetre.parChantier().values().stream()
                .map(chantier -> {
                    BigDecimal masse = sommeSalaires(chantier.lignes());
                    return new ChantierSyntheseVue(chantier.code(), chantier.lignes().size(),
                            PaieReportNumberFormat.montant(masse), PaieReportNumberFormat.pourcentageDe(masse, masseTotale));
                })
                .toList();

        Map<String, BigDecimal> masseParChantierBrute = perimetre.parChantier().values().stream()
                .collect(Collectors.toMap(PerimetreChantier::code, c -> sommeSalaires(c.lignes()), (a, b) -> a, LinkedHashMap::new));

        Map<String, Object> vue = new LinkedHashMap<>();
        vue.put("periodeLibelle", libellePeriode(perimetre.periode()));
        vue.put("effectifTotal", lignes.size());
        vue.put("nombreChantiers", perimetre.parChantier().size());
        vue.put("masseSalarialeTotale", PaieReportNumberFormat.montant(masseTotale));
        vue.put("masseSalarialeMoisPrecedent", PaieReportNumberFormat.montantOuIntrouvable(masseTotalePrecedente));
        vue.put("variationMasseSalariale", PaieReportNumberFormat.variationPourcent(masseTotale, masseTotalePrecedente));
        vue.put("chantiers", chantiers);
        vue.put("effectifParFonction", effectifParFonctionVue(lignes));
        vue.put("graphiqueMasseSalarialeParChantier", base64(chartGenerator.graphiqueMasseSalarialeParChantier(masseParChantierBrute)));
        vue.put("graphiqueEffectifParFonction", base64(chartGenerator.graphiqueEffectifParFonction(effectifParFonctionBrut(lignes))));
        return vue;
    }

    Map<String, Object> detaille(PerimetrePaie perimetre) {
        SectionDetailleeVue glb = sectionDetaillee("Vue globale — tous chantiers", perimetre.lignesGlobales(),
                perimetre.totalMoisPrecedentGlobal(), List.of());

        List<SectionDetailleeVue> sectionsChantier = perimetre.parChantier().values().stream()
                .map(chantier -> {
                    List<SectionDetailleeVue> sousSectionsEquipe = chantier.lignesParEquipeAGenerer().entrySet().stream()
                            .map(entree -> sectionDetaillee(
                                    chantier.code() + " — Équipe " + entree.getKey(), entree.getValue(),
                                    chantier.totalMoisPrecedentParEquipe().get(entree.getKey()), List.of()))
                            .toList();
                    return sectionDetaillee("Chantier " + chantier.code(), chantier.lignes(), chantier.totalMoisPrecedent(), sousSectionsEquipe);
                })
                .toList();

        Map<String, Object> vue = new LinkedHashMap<>();
        vue.put("periodeLibelle", libellePeriode(perimetre.periode()));
        vue.put("glb", glb);
        vue.put("chantiers", sectionsChantier);
        return vue;
    }

    private SectionDetailleeVue sectionDetaillee(String titre, List<Paie> lignes, BigDecimal totalPrecedent,
                                                 List<SectionDetailleeVue> sousSections) {
        BigDecimal total = sommeSalaires(lignes);
        return new SectionDetailleeVue(
                titre,
                lignes.size(),
                lignes.stream().map(this::ligneVue).toList(),
                PaieReportNumberFormat.montant(total),
                PaieReportNumberFormat.montantOuIntrouvable(totalPrecedent),
                PaieReportNumberFormat.variationPourcent(total, totalPrecedent),
                effectifParFonctionVue(lignes),
                sousSections);
    }

    private LigneVue ligneVue(Paie paie) {
        return new LigneVue(
                paie.getEmployee().getNomPrenom(),
                paie.getEmployee().getCin(),
                paie.getFonction().getLibelle(),
                paie.getNombreJoursTravailles() != null ? paie.getNombreJoursTravailles() : 0,
                PaieReportNumberFormat.montant(paie.getSalaireMensuel()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageOrdinaire()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireTotal()),
                paie.getObservation(),
                paie.getChantier().getCode(),
                paie.getEquipe());
    }

    private List<EffectifFonctionVue> effectifParFonctionVue(List<Paie> lignes) {
        Map<String, List<Paie>> parFonction = lignes.stream()
                .collect(Collectors.groupingBy(p -> p.getFonction().getLibelle(), TreeMap::new, Collectors.toList()));
        return parFonction.entrySet().stream()
                .map(entree -> new EffectifFonctionVue(
                        entree.getKey(),
                        entree.getValue().size(),
                        (int) entree.getValue().stream().filter(ObservationStc::estStcOuSortie).count()))
                .toList();
    }

    private Map<String, Long> effectifParFonctionBrut(List<Paie> lignes) {
        return lignes.stream().collect(Collectors.groupingBy(p -> p.getFonction().getLibelle(), TreeMap::new, Collectors.counting()));
    }

    private BigDecimal sommeSalaires(List<Paie> lignes) {
        return lignes.stream().map(Paie::getSalaireTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "Août 2026" — libellé français, première lettre en majuscule. */
    private static String libellePeriode(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1) + " " + periode.getYear();
    }

    private String base64(byte[] png) {
        return Base64.getEncoder().encodeToString(png);
    }
}