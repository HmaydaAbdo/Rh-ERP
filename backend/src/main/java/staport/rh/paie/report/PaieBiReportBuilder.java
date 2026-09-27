package staport.rh.paie.report;

import org.springframework.stereotype.Service;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.repositories.EvolutionChantierEquipeProjection;
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
    private static final int MAX_BARRES_GRAPHIQUE = 20;
    private static final int MOIS_EVOLUTION = 12;
    private static final DateTimeFormatter FORMAT_DATE_GENERATION =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE);
    private static final DateTimeFormatter FORMAT_MOIS_COURT = DateTimeFormatter.ofPattern("MMM yy", Locale.FRENCH);

    /** Agrégat brut (avant formatage) d'un groupe de lignes — évite tout aller-retour par une
     * chaîne déjà formatée pour trier ou construire un graphique. {@code stc}/{@code stcMontant} :
     * nombre et masse salariale des STC/sorties dans ce groupe (même définition qu'aux autres
     * niveaux, voir {@code ObservationStc}) — les 2 représentations sont portées côte à côte, jamais
     * l'une déduite de l'autre. */
    private record Agregat(String cle, int effectif, BigDecimal montant, int stc, BigDecimal stcMontant) {
    }

    /** Historique mensuel aux 3 niveaux du rapport (global, chantier, équipe) — dérivés en Java d'un
     * seul jeu de lignes déjà groupé en base au niveau le plus fin (voir
     * {@code PaieRepository.sommerParChantierEquipePeriode}), jamais une requête par chantier/équipe.
     * {@code parEquipe} est clé par {@code "<chantierCode>|<nomEquipe>"} : une équipe n'est unique
     * qu'au sein de son chantier, jamais globalement (deux chantiers peuvent tous deux avoir une
     * équipe "A"). */
    private record EvolutionParNiveau(
            List<RepartitionBean> global,
            Map<String, List<RepartitionBean>> parChantier,
            Map<String, List<RepartitionBean>> parEquipe) {

        static final EvolutionParNiveau VIDE = new EvolutionParNiveau(List.of(), Map.of(), Map.of());

        List<RepartitionBean> pourChantier(String code) {
            return parChantier.getOrDefault(code, List.of());
        }

        List<RepartitionBean> pourEquipe(String chantierCode, String nomEquipe) {
            return parEquipe.getOrDefault(chantierCode + "|" + nomEquipe, List.of());
        }
    }

    /** Accumulateur mutable (masse, effectif, STC en personnes et en montant) d'un mois — évite de
     * porter quatre Map parallèles pour la même clé pendant l'agrégation. */
    private static final class Cumul {
        private BigDecimal masse = BigDecimal.ZERO;
        private long effectif;
        private long stc;
        private BigDecimal stcMontant = BigDecimal.ZERO;
    }

    private final PaieRepository repository;

    PaieBiReportBuilder(PaieRepository repository) {
        this.repository = repository;
    }

    RapportBiVue construire(YearMonth periode, PaieReportPdfRequestDto requete) {
        List<Paie> courant = rechercher(periode, requete);
        List<Paie> precedent = rechercher(periode.minusMonths(1), requete);
        EvolutionParNiveau evolutions = evolutionParNiveau(periode);
        return construireDepuis(periode, requete, courant, precedent, evolutions);
    }

    /** Surcharge sans historique d'évolution (utilisée par les tests de {@link PaieBiReportBuilder},
     * qui ne dépendent jamais du repository — voir {@code PaieBiReportBuilderTest}) : les graphiques
     * d'évolution restent alors simplement vides, sans incidence sur le reste du calcul. */
    RapportBiVue construireDepuis(YearMonth periode, PaieReportPdfRequestDto requete, List<Paie> courant, List<Paie> precedent) {
        return construireDepuis(periode, requete, courant, precedent, EvolutionParNiveau.VIDE);
    }

    RapportBiVue construireDepuis(YearMonth periode, PaieReportPdfRequestDto requete, List<Paie> courant, List<Paie> precedent,
                                   EvolutionParNiveau evolutions) {
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
                (int) courant.stream().filter(ObservationStc::estStcOuSortie).count(),
                versRepartition(agregatChantier),
                versRepartition(agregatFonction),
                evolutions.global()
        );

        // agregatChantier est déjà trié par masse (salaireTotal) décroissante — voir agreger() — le
        // plus gros chantier en premier, jamais un ré-tri alphabétique qui l'annulerait.
        List<ChantierBiVue> chantiers = agregatChantier.stream()
                .map(Agregat::cle)
                .map(code -> chantierVue(code, filtrerParChantier(courant, code), filtrerParChantier(precedent, code), masseCourante, evolutions))
                .toList();

        return new RapportBiVue(
                libellePeriode(periode),
                LocalDateTime.now().format(FORMAT_DATE_GENERATION),
                filtresActifs(requete, courant),
                synthese,
                chantiers);
    }

    private ChantierBiVue chantierVue(String code, List<Paie> lignesChantier, List<Paie> lignesChantierPrecedent, BigDecimal masseGlobale,
                                       EvolutionParNiveau evolutions) {
        BigDecimal masseChantier = sommer(lignesChantier);
        BigDecimal masseChantierPrecedente = lignesChantierPrecedent.isEmpty() ? null : sommer(lignesChantierPrecedent);
        List<Agregat> agregatEquipe = agreger(lignesChantier, this::libelleEquipe);
        int stc = (int) lignesChantier.stream().filter(ObservationStc::estStcOuSortie).count();

        List<EquipeBiVue> equipes = agregatEquipe.stream()
                .map(Agregat::cle)
                .sorted(Comparator.comparing((String nom) -> nom.equals(SANS_EQUIPE) ? 1 : 0).thenComparing(Comparator.naturalOrder()))
                .map(nom -> equipeVue(nom, filtrerParEquipe(lignesChantier, nom), masseChantier, code, evolutions))
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
                versRepartition(agregatEquipe),
                evolutions.pourChantier(code),
                equipes);
    }

    private EquipeBiVue equipeVue(String nom, List<Paie> lignesEquipe, BigDecimal masseChantier, String chantierCode,
                                   EvolutionParNiveau evolutions) {
        BigDecimal masseEquipe = sommer(lignesEquipe);
        List<Agregat> agregatFonctionEquipe = agreger(lignesEquipe, this::libelleFonction);
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
                (int) lignesEquipe.stream().filter(ObservationStc::estStcOuSortie).count(),
                versDistribution(agregatFonctionEquipe, masseEquipe),
                versRepartition(agregatFonctionEquipe),
                evolutions.pourEquipe(chantierCode, nom),
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
                .map(entree -> {
                    List<Paie> lignesStc = entree.getValue().stream().filter(ObservationStc::estStcOuSortie).toList();
                    return new Agregat(entree.getKey(), entree.getValue().size(), sommer(entree.getValue()),
                            lignesStc.size(), sommer(lignesStc));
                })
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
     * valeurs (le reste regroupé sous "Autres", masse, effectif ET STC cumulés) — demande explicite de
     * direction (Top 20, un graphique complet à 25+ catégories devient trop dense pour rester
     * lisible imprimé), voir {@code docs/report/README.md}. Le résultat est retrié par montant
     * décroissant (y compris "Autres" à sa vraie place) : un graphique BI doit rester visuellement
     * monotone, jamais un bloc "Autres" plus grand que plusieurs barres qui le précèdent. Déjà trié
     * par montant décroissant en entrée (voir {@link #agreger}). La même liste alimente le graphique
     * à barres groupées (masse/effectif/STC, 3 séries) de la dimension (chantier, équipe ou fonction),
     * voir {@code PaieReportGroupedChartCustomizer}. */
    private List<RepartitionBean> versRepartition(List<Agregat> agregats) {
        List<RepartitionBean> valeurs = new ArrayList<>();
        int effectifAutres = 0;
        int stcAutres = 0;
        BigDecimal montantAutres = BigDecimal.ZERO;
        BigDecimal stcMontantAutres = BigDecimal.ZERO;
        for (int i = 0; i < agregats.size(); i++) {
            Agregat agregat = agregats.get(i);
            if (i < MAX_BARRES_GRAPHIQUE) {
                valeurs.add(new RepartitionBean(agregat.cle(), agregat.effectif(), agregat.montant(), agregat.stc(),
                        agregat.stcMontant()));
            } else {
                effectifAutres += agregat.effectif();
                stcAutres += agregat.stc();
                montantAutres = montantAutres.add(agregat.montant());
                stcMontantAutres = stcMontantAutres.add(agregat.stcMontant());
            }
        }
        if (effectifAutres > 0) {
            valeurs.add(new RepartitionBean("Autres", effectifAutres, montantAutres, stcAutres, stcMontantAutres));
        }
        valeurs.sort(Comparator.comparing(RepartitionBean::getMontant).reversed());
        return valeurs;
    }

    /** Masse et effectif des {@value #MOIS_EVOLUTION} derniers mois (mois courant compris),
     * alimentant les 2 graphiques d'évolution de la synthèse globale — un point par mois, y compris
     * les mois sans aucun bulletin (masse et effectif à 0, une absence réelle de paie ce mois-là,
     * jamais une valeur inconnue à distinguer comme le fait la comparaison mois précédent). */
    /** Historique mensuel aux 3 niveaux (global, chantier, équipe) — une seule requête groupée au
     * niveau le plus fin (voir {@code PaieRepository.sommerParChantierEquipePeriode} pour la
     * justification performance), le global et le chantier en sont dérivés par simple somme des
     * lignes déjà en mémoire, jamais une requête supplémentaire par chantier/équipe. */
    private EvolutionParNiveau evolutionParNiveau(YearMonth periode) {
        YearMonth debut = periode.minusMonths(MOIS_EVOLUTION - 1);
        List<EvolutionChantierEquipeProjection> lignes = repository.sommerParChantierEquipePeriode(debut, periode);

        Map<YearMonth, Cumul> global = new LinkedHashMap<>();
        Map<String, Map<YearMonth, Cumul>> parChantier = new LinkedHashMap<>();
        Map<String, Map<YearMonth, Cumul>> parEquipe = new LinkedHashMap<>();

        for (EvolutionChantierEquipeProjection ligne : lignes) {
            YearMonth mois = ligne.getPeriode();
            BigDecimal masse = ligne.getMasse() == null ? BigDecimal.ZERO : ligne.getMasse();
            long effectif = ligne.getEffectif() == null ? 0 : ligne.getEffectif();
            long stc = ligne.getStc() == null ? 0 : ligne.getStc();
            BigDecimal stcMontant = ligne.getStcMontant() == null ? BigDecimal.ZERO : ligne.getStcMontant();
            String chantier = ligne.getChantierCode();
            String equipe = libelleEquipe(ligne.getEquipe());

            cumuler(global, mois, masse, effectif, stc, stcMontant);
            cumuler(parChantier.computeIfAbsent(chantier, c -> new LinkedHashMap<>()), mois, masse, effectif, stc, stcMontant);
            cumuler(parEquipe.computeIfAbsent(chantier + "|" + equipe, c -> new LinkedHashMap<>()), mois, masse, effectif, stc, stcMontant);
        }

        return new EvolutionParNiveau(
                pointsMensuels(periode, global),
                versPointsParCle(periode, parChantier),
                versPointsParCle(periode, parEquipe));
    }

    private void cumuler(Map<YearMonth, Cumul> parMois, YearMonth mois, BigDecimal masse, long effectif, long stc,
                          BigDecimal stcMontant) {
        Cumul cumul = parMois.computeIfAbsent(mois, m -> new Cumul());
        cumul.masse = cumul.masse.add(masse);
        cumul.effectif += effectif;
        cumul.stc += stc;
        cumul.stcMontant = cumul.stcMontant.add(stcMontant);
    }

    private Map<String, List<RepartitionBean>> versPointsParCle(YearMonth periode, Map<String, Map<YearMonth, Cumul>> parCle) {
        Map<String, List<RepartitionBean>> resultat = new LinkedHashMap<>();
        parCle.forEach((cle, parMois) -> resultat.put(cle, pointsMensuels(periode, parMois)));
        return resultat;
    }

    /** Un point par mois sur {@value #MOIS_EVOLUTION} mois (mois courant compris), y compris les mois
     * sans aucun bulletin pour ce périmètre (masse, effectif et STC à 0 — une absence réelle de paie
     * ce mois-là, pas une valeur inconnue à distinguer comme le fait la comparaison mois précédent). */
    private List<RepartitionBean> pointsMensuels(YearMonth periode, Map<YearMonth, Cumul> parMois) {
        List<RepartitionBean> points = new ArrayList<>();
        YearMonth debut = periode.minusMonths(MOIS_EVOLUTION - 1);
        for (YearMonth mois = debut; !mois.isAfter(periode); mois = mois.plusMonths(1)) {
            Cumul cumul = parMois.get(mois);
            points.add(new RepartitionBean(
                    mois.format(FORMAT_MOIS_COURT),
                    cumul == null ? 0 : (int) cumul.effectif,
                    cumul == null ? BigDecimal.ZERO : cumul.masse,
                    cumul == null ? 0 : (int) cumul.stc,
                    cumul == null ? BigDecimal.ZERO : cumul.stcMontant));
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
        return libelleEquipe(paie.getEquipe());
    }

    private String libelleEquipe(String equipeBrut) {
        return equipeBrut == null || equipeBrut.isBlank() ? SANS_EQUIPE : equipeBrut;
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
