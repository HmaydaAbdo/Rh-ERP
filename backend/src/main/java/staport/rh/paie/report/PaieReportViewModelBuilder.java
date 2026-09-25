package staport.rh.paie.report;

import org.springframework.stereotype.Component;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.reporting.PerimetreChantier;
import staport.rh.paie.reporting.PerimetrePaie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Convertit {@link PerimetrePaie} (entités) en vue-modèle hiérarchique Chantier → Équipe déjà
 * formatée — le template Thymeleaf ne fait aucun calcul ni formatage. */
@Component
class PaieReportViewModelBuilder {

    RapportPaieVue construire(PerimetrePaie perimetre) {
        List<ChantierRapportVue> chantiers = perimetre.parChantier().values().stream()
                .map(this::chantierVue)
                .toList();
        return new RapportPaieVue(libellePeriode(perimetre.periode()), chantiers);
    }

    private ChantierRapportVue chantierVue(PerimetreChantier chantier) {
        List<EquipeRapportVue> equipes = chantier.lignesParEquipeAGenerer().entrySet().stream()
                .map(entree -> equipeVue(entree.getKey(), entree.getValue()))
                .toList();

        return new ChantierRapportVue(
                chantier.code(),
                "CHANTIER : " + chantier.code(),
                chantier.lignes().stream().map(this::ligneVue).toList(),
                totaux(chantier.lignes()),
                effectifParFonctionVue(chantier.lignes()),
                equipes);
    }

    private EquipeRapportVue equipeVue(String nom, List<Paie> lignes) {
        return new EquipeRapportVue(
                nom,
                "ÉQUIPE : " + nom.toUpperCase(Locale.FRANCE),
                lignes.stream().map(this::ligneVue).toList(),
                totaux(lignes),
                effectifParFonctionVue(lignes));
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
                paie.getObservation());
    }

    private TotauxVue totaux(List<Paie> lignes) {
        int sommeJours = lignes.stream()
                .mapToInt(p -> p.getNombreJoursTravailles() != null ? p.getNombreJoursTravailles() : 0)
                .sum();
        BigDecimal sommeSalaires = sommer(lignes, Paie::getSalaireMensuel);
        BigDecimal totalGeneral = sommer(lignes, Paie::getSalaireTotal);
        return new TotauxVue(lignes.size(), PaieReportNumberFormat.entier(sommeJours),
                PaieReportNumberFormat.montant(sommeSalaires), PaieReportNumberFormat.montant(totalGeneral));
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

    private BigDecimal sommer(List<Paie> lignes, Function<Paie, BigDecimal> champ) {
        return lignes.stream().map(champ).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "Août 2026" — libellé français, première lettre en majuscule. */
    private static String libellePeriode(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1) + " " + periode.getYear();
    }
}