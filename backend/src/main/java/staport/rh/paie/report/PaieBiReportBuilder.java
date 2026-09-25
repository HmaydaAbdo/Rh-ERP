package staport.rh.paie.report;

import org.springframework.stereotype.Service;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.specifications.PaieSpecification;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Construit la vue-modèle du rapport PDF BI (voir {@code docs/report/README.md} pour le modèle
 * analytique complet). Contrairement à l'export Excel ({@code PaiePerimetreService}, qui projette
 * une sélection manuelle de sous-feuilles), ce rapport agrège systématiquement TOUT le périmètre
 * filtré : aucune configuration de "quelles équipes afficher", chaque chantier et chaque équipe
 * réellement présents dans les données sont représentés, "Sans équipe" compris.
 *
 * <p>{@link #construire(YearMonth, PaieReportPdfRequestDto)} fait l'accès base (courant + mois
 * précédent, même périmètre hors période) ; {@link #construireDepuis} est le calcul pur, séparé
 * pour être testable sans dépendre du repository.
 */
@Service
class PaieBiReportBuilder {

    private static final String SANS_EQUIPE = "Sans équipe";
    private static final int MAX_BARRES_GRAPHIQUE = 12;
    private static final DateTimeFormatter FORMAT_DATE_GENERATION =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE);

    /** Agrégat brut (avant formatage) d'un groupe de lignes — évite tout aller-retour par une
     * chaîne déjà formatée pour trier ou construire un graphique. */
    private record Agregat(String cle, int effectif, BigDecimal montant) {
    }

    private final PaieRepository repository;
    private final PaieReportChartService chartService;

    PaieBiReportBuilder(PaieRepository repository, PaieReportChartService chartService) {
        this.repository = repository;
        this.chartService = chartService;
    }

    RapportBiVue construire(YearMonth periode, PaieReportPdfRequestDto requete) {
        List<Paie> courant = rechercher(periode, requete);
        List<Paie> precedent = rechercher(periode.minusMonths(1), requete);
        return construireDepuis(periode, requete, courant, precedent);
    }

    RapportBiVue construireDepuis(YearMonth periode, PaieReportPdfRequestDto requete, List<Paie> courant, List<Paie> precedent) {
        if (courant.isEmpty()) {
            throw new AucunePaiePeriodeException(periode);
        }

        BigDecimal masseCourante = sommer(courant);
        BigDecimal massePrecedente = precedent.isEmpty() ? null : sommer(precedent);

        List<Agregat> agregatChantier = agreger(courant, this::codeChantier);
        List<Agregat> agregatEquipe = agreger(courant, this::libelleEquipe);

        SyntheseGlobaleVue synthese = new SyntheseGlobaleVue(
                kpiMontant(masseCourante, massePrecedente),
                kpiEffectif(courant.size(), precedent.size()),
                PaieReportNumberFormat.montant(masseCourante.divide(BigDecimal.valueOf(courant.size()), 2, RoundingMode.HALF_UP)),
                agregatChantier.size(),
                distinct(courant, p -> p.getFonction().getLibelle()).size(),
                versDistribution(agregatChantier, masseCourante),
                versDistribution(agregatEquipe, masseCourante),
                effectifParFonction(courant),
                grapheDistribution(agregatChantier),
                grapheDistribution(agregatEquipe)
        );

        List<LigneMatriceFonctionChantierVue> matrice = matriceFonctionChantier(courant);
        List<ChantierBiVue> chantiers = agregatChantier.stream()
                .map(Agregat::cle)
                .sorted()
                .map(code -> chantierVue(code, filtrerParChantier(courant, code), filtrerParChantier(precedent, code), masseCourante))
                .toList();

        return new RapportBiVue(
                libellePeriode(periode),
                LocalDateTime.now().format(FORMAT_DATE_GENERATION),
                filtresActifs(requete, courant),
                synthese,
                matrice,
                chantiers);
    }

    private ChantierBiVue chantierVue(String code, List<Paie> lignesChantier, List<Paie> lignesChantierPrecedent, BigDecimal masseGlobale) {
        BigDecimal masseChantier = sommer(lignesChantier);
        BigDecimal masseChantierPrecedente = lignesChantierPrecedent.isEmpty() ? null : sommer(lignesChantierPrecedent);
        List<Agregat> agregatEquipe = agreger(lignesChantier, this::libelleEquipe);

        List<EquipeBiVue> equipes = agregatEquipe.stream()
                .map(Agregat::cle)
                .sorted(Comparator.comparing((String nom) -> nom.equals(SANS_EQUIPE) ? 1 : 0).thenComparing(Comparator.naturalOrder()))
                .map(nom -> equipeVue(nom, filtrerParEquipe(lignesChantier, nom), masseChantier))
                .toList();

        return new ChantierBiVue(
                code,
                "CHANTIER : " + code,
                kpiMontant(masseChantier, masseChantierPrecedente),
                kpiEffectif(lignesChantier.size(), lignesChantierPrecedent.size()),
                PaieReportNumberFormat.part(masseChantier, masseGlobale),
                versDistribution(agregatEquipe, masseChantier),
                effectifParFonction(lignesChantier),
                equipes);
    }

    private EquipeBiVue equipeVue(String nom, List<Paie> lignesEquipe, BigDecimal masseChantier) {
        BigDecimal masseEquipe = sommer(lignesEquipe);
        List<LigneEmployeVue> employes = lignesEquipe.stream()
                .sorted(Comparator.comparing(p -> p.getEmployee().getNomPrenom(), String.CASE_INSENSITIVE_ORDER))
                .map(this::ligneEmploye)
                .toList();

        return new EquipeBiVue(
                nom,
                nom.equals(SANS_EQUIPE) ? SANS_EQUIPE.toUpperCase(Locale.FRANCE) : "ÉQUIPE : " + nom.toUpperCase(Locale.FRANCE),
                lignesEquipe.size(),
                PaieReportNumberFormat.montant(masseEquipe),
                PaieReportNumberFormat.part(masseEquipe, masseChantier),
                employes);
    }

    private LigneEmployeVue ligneEmploye(Paie paie) {
        return new LigneEmployeVue(
                paie.getEmployee().getNomPrenom(),
                paie.getFonction().getLibelle(),
                paie.getEmployee().getCin(),
                paie.getNombreJoursTravailles() != null ? paie.getNombreJoursTravailles() : 0,
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationOuvrable()),
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireMensuel()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageOrdinaire()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireTotal()),
                paie.getObservation());
    }

    private List<LigneMatriceFonctionChantierVue> matriceFonctionChantier(List<Paie> lignes) {
        Map<String, Map<String, List<Paie>>> parChantierPuisFonction = lignes.stream()
                .collect(Collectors.groupingBy(this::codeChantier, TreeMap::new,
                        Collectors.groupingBy(p -> p.getFonction().getLibelle(), TreeMap::new, Collectors.toList())));

        List<LigneMatriceFonctionChantierVue> resultat = new ArrayList<>();
        parChantierPuisFonction.forEach((chantier, parFonction) -> parFonction.forEach((fonction, lignesFonction) ->
                resultat.add(new LigneMatriceFonctionChantierVue(
                        chantier, fonction, lignesFonction.size(),
                        (int) lignesFonction.stream().filter(ObservationStc::estStcOuSortie).count()))));
        return resultat;
    }

    private List<EffectifFonctionSimpleVue> effectifParFonction(List<Paie> lignes) {
        Map<String, List<Paie>> parFonction = lignes.stream()
                .collect(Collectors.groupingBy(p -> p.getFonction().getLibelle(), TreeMap::new, Collectors.toList()));
        return parFonction.entrySet().stream()
                .map(entree -> new EffectifFonctionSimpleVue(
                        entree.getKey(),
                        entree.getValue().size(),
                        (int) entree.getValue().stream().filter(ObservationStc::estStcOuSortie).count()))
                .toList();
    }

    /** Regroupe par {@code cle} (code chantier, ou libellé équipe avec "Sans équipe") et calcule
     * l'agrégat brut de chaque groupe, trié par montant décroissant — un classement, la lecture BI
     * la plus directe d'une distribution. */
    private List<Agregat> agreger(List<Paie> lignes, Function<Paie, String> cle) {
        Map<String, List<Paie>> groupes = lignes.stream().collect(Collectors.groupingBy(cle, LinkedHashMap::new, Collectors.toList()));
        return groupes.entrySet().stream()
                .map(entree -> new Agregat(entree.getKey(), entree.getValue().size(), sommer(entree.getValue())))
                .sorted(Comparator.comparing(Agregat::montant).reversed())
                .toList();
    }

    /** @param total dénominateur du pourcentage — masse globale pour une distribution "globale",
     * masse du chantier pour une distribution intra-chantier (jamais mélangé, voir README section
     * « Cohérence global → local »). */
    private List<DistributionVue> versDistribution(List<Agregat> agregats, BigDecimal total) {
        return agregats.stream()
                .map(a -> new DistributionVue(a.cle(), a.effectif(), PaieReportNumberFormat.montant(a.montant()),
                        PaieReportNumberFormat.part(a.montant(), total)))
                .toList();
    }

    /** Plafonne le graphique aux {@value #MAX_BARRES_GRAPHIQUE} plus grosses valeurs (le reste
     * regroupé sous "Autres") — un graphique à direction reste lisible, pas un mur de barres ; le
     * tableau de distribution associé, lui, n'est jamais tronqué. */
    private String grapheDistribution(List<Agregat> agregats) {
        List<Map.Entry<String, BigDecimal>> valeurs = new ArrayList<>();
        BigDecimal resteAutres = BigDecimal.ZERO;
        for (int i = 0; i < agregats.size(); i++) {
            Agregat agregat = agregats.get(i);
            if (i < MAX_BARRES_GRAPHIQUE) {
                valeurs.add(Map.entry(agregat.cle(), agregat.montant()));
            } else {
                resteAutres = resteAutres.add(agregat.montant());
            }
        }
        if (resteAutres.compareTo(BigDecimal.ZERO) > 0) {
            valeurs.add(Map.entry("Autres", resteAutres));
        }
        return chartService.genererBarresHorizontales(valeurs);
    }

    private List<String> filtresActifs(PaieReportPdfRequestDto requete, List<Paie> courant) {
        List<String> filtres = new ArrayList<>();
        if (requete.chantierId() != null) {
            courant.stream().filter(p -> requete.chantierId().equals(p.getChantier().getId())).findFirst()
                    .ifPresent(p -> filtres.add("Chantier : " + p.getChantier().getCode()));
        }
        if (requete.fonctionId() != null) {
            courant.stream().filter(p -> requete.fonctionId().equals(p.getFonction().getId())).findFirst()
                    .ifPresent(p -> filtres.add("Fonction : " + p.getFonction().getLibelle()));
        }
        if (requete.nomPrenom() != null && !requete.nomPrenom().isBlank()) {
            filtres.add("Nom & prénom contient : " + requete.nomPrenom());
        }
        if (requete.cin() != null && !requete.cin().isBlank()) {
            filtres.add("CIN contient : " + requete.cin());
        }
        return filtres;
    }

    private KpiMontantVue kpiMontant(BigDecimal actuel, BigDecimal precedent) {
        return new KpiMontantVue(
                PaieReportNumberFormat.montant(actuel),
                PaieReportNumberFormat.montantOuIntrouvable(precedent),
                PaieReportNumberFormat.variationAbsolue(actuel, precedent),
                PaieReportNumberFormat.variationPourcent(actuel, precedent),
                PaieReportNumberFormat.tendance(actuel, precedent));
    }

    private KpiEffectifVue kpiEffectif(int actuel, int precedent) {
        int variation = actuel - precedent;
        String signe = variation > 0 ? "+" : "";
        return new KpiEffectifVue(actuel, precedent, signe + variation);
    }

    private String codeChantier(Paie paie) {
        return paie.getChantier().getCode();
    }

    /** "Sans équipe" pour un bulletin sans équipe renseignée — jamais exclu des distributions. */
    private String libelleEquipe(Paie paie) {
        String equipe = paie.getEquipe();
        return equipe == null || equipe.isBlank() ? SANS_EQUIPE : equipe;
    }

    private List<Paie> filtrerParChantier(List<Paie> lignes, String code) {
        return lignes.stream().filter(p -> codeChantier(p).equals(code)).toList();
    }

    private List<Paie> filtrerParEquipe(List<Paie> lignes, String nomEquipe) {
        return lignes.stream().filter(p -> libelleEquipe(p).equals(nomEquipe)).toList();
    }

    private List<String> distinct(List<Paie> lignes, Function<Paie, String> cle) {
        return lignes.stream().map(cle).distinct().toList();
    }

    private BigDecimal sommer(List<Paie> lignes) {
        return lignes.stream().map(Paie::getSalaireTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private List<Paie> rechercher(YearMonth periode, PaieReportPdfRequestDto requete) {
        PaieSearchCriteria criteria = new PaieSearchCriteria(
                requete.cin(), requete.nomPrenom(), periode, requete.fonctionId(), requete.chantierId(), null);
        return repository.findAll(PaieSpecification.searchByCriteria(criteria));
    }

    private static String libellePeriode(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1) + " " + periode.getYear();
    }
}
