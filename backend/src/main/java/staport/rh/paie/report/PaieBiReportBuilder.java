package staport.rh.paie.report;

import org.springframework.stereotype.Service;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.repositories.EvolutionMensuelleProjection;
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
import java.util.Set;
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
    private static final String AUTRES = "Autres";
    private static final int MAX_BARRES_GRAPHIQUE = 20;
    private static final int MAX_FONCTIONS_CROISEMENT = 8;
    private static final int MOIS_EVOLUTION = 12;
    private static final DateTimeFormatter FORMAT_DATE_GENERATION =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE);
    private static final DateTimeFormatter FORMAT_MOIS_COURT = DateTimeFormatter.ofPattern("MMM yy", Locale.FRENCH);

    /** Agrégat brut (avant formatage) d'un groupe de lignes — évite tout aller-retour par une
     * chaîne déjà formatée pour trier ou construire un graphique. */
    private record Agregat(String cle, int effectif, BigDecimal montant) {
    }

    private final PaieRepository repository;

    PaieBiReportBuilder(PaieRepository repository) {
        this.repository = repository;
    }

    RapportBiVue construire(YearMonth periode, PaieReportPdfRequestDto requete) {
        List<Paie> courant = rechercher(periode, requete);
        List<Paie> precedent = rechercher(periode.minusMonths(1), requete);
        List<RepartitionBean> evolution = evolutionMensuelle(periode);
        return construireDepuis(periode, requete, courant, precedent, evolution);
    }

    /** Surcharge sans historique d'évolution (utilisée par les tests de {@link PaieBiReportBuilder},
     * qui ne dépendent jamais du repository — voir {@code PaieBiReportBuilderTest}) : le graphique
     * d'évolution reste alors simplement vide, sans incidence sur le reste du calcul. */
    RapportBiVue construireDepuis(YearMonth periode, PaieReportPdfRequestDto requete, List<Paie> courant, List<Paie> precedent) {
        return construireDepuis(periode, requete, courant, precedent, List.of());
    }

    RapportBiVue construireDepuis(YearMonth periode, PaieReportPdfRequestDto requete, List<Paie> courant, List<Paie> precedent,
                                   List<RepartitionBean> evolutionMensuelle) {
        if (courant.isEmpty()) {
            throw new AucunePaiePeriodeException(periode);
        }

        BigDecimal masseCourante = sommer(courant);
        BigDecimal massePrecedente = precedent.isEmpty() ? null : sommer(precedent);

        List<Agregat> agregatChantier = agreger(courant, this::codeChantier);
        List<Agregat> agregatFonction = agreger(courant, this::libelleFonction);

        SyntheseGlobaleVue synthese = new SyntheseGlobaleVue(
                kpiMontant(masseCourante, massePrecedente),
                kpiEffectif(courant.size(), precedent.size()),
                PaieReportNumberFormat.montant(masseCourante.divide(BigDecimal.valueOf(courant.size()), 2, RoundingMode.HALF_UP)),
                agregatChantier.size(),
                versRepartition(agregatChantier),
                versRepartition(agregatFonction),
                evolutionMensuelle
        );

        // agregatChantier est déjà trié par masse (salaireTotal) décroissante — voir agreger() — le
        // plus gros chantier en premier, jamais un ré-tri alphabétique qui l'annulerait.
        List<ChantierBiVue> chantiers = agregatChantier.stream()
                .map(Agregat::cle)
                .map(code -> chantierVue(code, filtrerParChantier(courant, code), filtrerParChantier(precedent, code), masseCourante))
                .toList();

        return new RapportBiVue(
                libellePeriode(periode),
                LocalDateTime.now().format(FORMAT_DATE_GENERATION),
                filtresActifs(requete, courant),
                synthese,
                chantiers);
    }

    private ChantierBiVue chantierVue(String code, List<Paie> lignesChantier, List<Paie> lignesChantierPrecedent, BigDecimal masseGlobale) {
        BigDecimal masseChantier = sommer(lignesChantier);
        BigDecimal masseChantierPrecedente = lignesChantierPrecedent.isEmpty() ? null : sommer(lignesChantierPrecedent);
        List<Agregat> agregatEquipe = agreger(lignesChantier, this::libelleEquipe);
        List<Agregat> agregatFonction = agreger(lignesChantier, this::libelleFonction);
        int stc = (int) lignesChantier.stream().filter(ObservationStc::estStcOuSortie).count();

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
                PaieReportNumberFormat.montant(masseChantier.divide(BigDecimal.valueOf(lignesChantier.size()), 2, RoundingMode.HALF_UP)),
                PaieReportNumberFormat.part(masseChantier, masseGlobale),
                stc,
                versDistribution(agregatEquipe, masseChantier),
                versDistribution(agregatFonction, masseChantier),
                croisementEquipeFonction(lignesChantier),
                equipes);
    }

    /** Une ligne par paire (équipe, fonction) réellement présente sur ce chantier, masse cumulée —
     * alimente le stacked bar chart Équipe × Fonction (une catégorie = une équipe, une série = une
     * fonction) : JasperReports construit dynamiquement les séries à partir des valeurs distinctes de
     * {@code fonction} dans cette liste à plat, jamais une série codée en dur par fonction (leur
     * nombre varie d'un chantier à l'autre) — voir {@code rapport.jrxml}, CroisementBean. Plafonné
     * aux {@value #MAX_FONCTIONS_CROISEMENT} fonctions les plus lourdes (masse cumulée sur tout le
     * chantier), le reste regroupé sous "Autres" par équipe — même principe que
     * {@link #versRepartition} : le référentiel Fonction porte aujourd'hui des doublons non nettoyés
     * (voir TODO.md), un segment par doublon rendrait ce graphique illisible bien avant même que la
     * direction n'ait demandé un plafond ici. */
    private List<CroisementBean> croisementEquipeFonction(List<Paie> lignesChantier) {
        List<Paie> lignesValides = lignesChantier.stream().filter(p -> p.getSalaireTotal() != null).toList();
        Set<String> fonctionsRetenues = fonctionsLesPlusLourdes(lignesValides, MAX_FONCTIONS_CROISEMENT);

        Map<String, Map<String, BigDecimal>> parEquipePuisFonction = lignesValides.stream()
                .collect(Collectors.groupingBy(this::libelleEquipe, LinkedHashMap::new,
                        Collectors.groupingBy(p -> fonctionRetenueOuAutres(p, fonctionsRetenues), LinkedHashMap::new,
                                Collectors.reducing(BigDecimal.ZERO, Paie::getSalaireTotal, BigDecimal::add))));

        List<CroisementBean> croisement = new ArrayList<>();
        parEquipePuisFonction.forEach((equipe, parFonction) ->
                parFonction.forEach((fonction, montant) -> croisement.add(new CroisementBean(equipe, fonction, montant))));
        return croisement;
    }

    private String fonctionRetenueOuAutres(Paie paie, Set<String> fonctionsRetenues) {
        String fonction = libelleFonction(paie);
        return fonctionsRetenues.contains(fonction) ? fonction : AUTRES;
    }

    private Set<String> fonctionsLesPlusLourdes(List<Paie> lignesValides, int max) {
        return lignesValides.stream()
                .collect(Collectors.groupingBy(this::libelleFonction, Collectors.reducing(BigDecimal.ZERO, Paie::getSalaireTotal, BigDecimal::add)))
                .entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(max)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
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
                paie.getObservation() != null ? paie.getObservation() : "");
    }

    /** Regroupe par {@code cle} (code chantier, libellé fonction, ou libellé équipe avec "Sans
     * équipe") et calcule l'agrégat brut de chaque groupe, trié par montant décroissant — un
     * classement, la lecture BI la plus directe d'une distribution. */
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

    /** Plafonne un graphique de la synthèse globale aux {@value #MAX_BARRES_GRAPHIQUE} plus grosses
     * valeurs (le reste regroupé sous "Autres", masse ET effectif cumulés) — demande explicite de
     * direction (Top 20, un graphique complet à 25+ catégories devient trop dense pour rester
     * lisible imprimé), voir {@code docs/report/README.md}. Le résultat est retrié par montant
     * décroissant (y compris "Autres" à sa vraie place) : un graphique BI doit rester visuellement
     * monotone, jamais un bloc "Autres" plus grand que plusieurs barres qui le précèdent. Déjà trié
     * par montant décroissant en entrée (voir {@link #agreger}). La même liste alimente à la fois le
     * graphique de masse et celui d'effectif de la dimension (chantier ou fonction). */
    private List<RepartitionBean> versRepartition(List<Agregat> agregats) {
        List<RepartitionBean> valeurs = new ArrayList<>();
        int effectifAutres = 0;
        BigDecimal montantAutres = BigDecimal.ZERO;
        for (int i = 0; i < agregats.size(); i++) {
            Agregat agregat = agregats.get(i);
            if (i < MAX_BARRES_GRAPHIQUE) {
                valeurs.add(new RepartitionBean(agregat.cle(), agregat.effectif(), agregat.montant()));
            } else {
                effectifAutres += agregat.effectif();
                montantAutres = montantAutres.add(agregat.montant());
            }
        }
        if (effectifAutres > 0) {
            valeurs.add(new RepartitionBean("Autres", effectifAutres, montantAutres));
        }
        valeurs.sort(Comparator.comparing(RepartitionBean::getMontant).reversed());
        return valeurs;
    }

    /** Masse et effectif des {@value #MOIS_EVOLUTION} derniers mois (mois courant compris),
     * alimentant les 2 graphiques d'évolution de la synthèse globale — un point par mois, y compris
     * les mois sans aucun bulletin (masse et effectif à 0, une absence réelle de paie ce mois-là,
     * jamais une valeur inconnue à distinguer comme le fait la comparaison mois précédent). */
    private List<RepartitionBean> evolutionMensuelle(YearMonth periode) {
        YearMonth debut = periode.minusMonths(MOIS_EVOLUTION - 1);
        Map<YearMonth, EvolutionMensuelleProjection> parPeriode = repository.sommerParPeriode(debut, periode).stream()
                .collect(Collectors.toMap(EvolutionMensuelleProjection::getPeriode, Function.identity()));

        List<RepartitionBean> points = new ArrayList<>();
        for (YearMonth mois = debut; !mois.isAfter(periode); mois = mois.plusMonths(1)) {
            EvolutionMensuelleProjection valeur = parPeriode.get(mois);
            points.add(new RepartitionBean(
                    mois.format(FORMAT_MOIS_COURT),
                    valeur == null ? 0 : valeur.getEffectif().intValue(),
                    valeur == null ? BigDecimal.ZERO : valeur.getMasse()));
        }
        return points;
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

    private String libelleFonction(Paie paie) {
        return paie.getFonction().getLibelle();
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

    private BigDecimal sommer(List<Paie> lignes) {
        return lignes.stream().map(Paie::getSalaireTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private List<Paie> rechercher(YearMonth periode, PaieReportPdfRequestDto requete) {
        PaieSearchCriteria criteria = new PaieSearchCriteria(
                requete.cin(), requete.nomPrenom(), periode,
                requete.fonctionId() != null ? List.of(requete.fonctionId()) : null,
                requete.chantierId() != null ? List.of(requete.chantierId()) : null,
                null);
        return repository.findAll(PaieSpecification.searchByCriteria(criteria));
    }

    private static String libellePeriode(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1) + " " + periode.getYear();
    }
}
