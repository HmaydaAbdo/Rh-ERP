package staport.rh.paie.report;

import org.springframework.stereotype.Service;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.repositories.EvolutionChantierEquipeProjection;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.reporting.MaterielChantierCatalogue;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.specifications.PaieSpecification;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
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
 * analytique complet). Le périmètre de données (quels chantiers/employés) reste toujours TOUT le
 * périmètre filtré, mais depuis la fusion des exports PDF/Excel (demande explicite de direction,
 * 2026-09-29 — voir {@code evolution-rapport/rapport-v2.md}), {@code PaieReportPdfRequestDto.equipesParChantier}
 * porte la MÊME sélection manuelle que l'export Excel ({@code PaieExportRequestDto.equipesParChantier})
 * pour décider, chantier par chantier, quelles équipes obtiennent leur propre section détaillée (voir
 * {@link ChantierBiVue#avecDetailEquipe()}) — contrairement à l'Excel, un employé n'apparaît jamais
 * dans deux sections du PDF (voir {@link EquipeBiVue}).
 *
 * <p>{@link #construire(YearMonth, PaieReportPdfRequestDto)} fait l'accès base (courant + mois
 * précédent, même périmètre hors période) ; {@link #construireDepuis} est le calcul pur, séparé
 * pour être testable sans dépendre du repository.
 */
@Service
class PaieBiReportBuilder {

    private static final String SANS_EQUIPE = "Sans équipe";
    private static final int MAX_BARRES_GRAPHIQUE = 15;
    private static final int MOIS_EVOLUTION = 12;
    private static final DateTimeFormatter FORMAT_MOIS_COURT = DateTimeFormatter.ofPattern("M/yyyy");

    /** Agrégat brut (avant formatage) d'un groupe de lignes — évite tout aller-retour par une
     * chaîne déjà formatée pour trier ou construire un graphique. {@code stc}/{@code stcMontant} :
     * nombre et masse salariale des STC/sorties dans ce groupe (même définition qu'aux autres
     * niveaux, voir {@code ObservationStc}) — les 2 représentations sont portées côte à côte, jamais
     * l'une déduite de l'autre. */
    private record Agregat(String cle, int effectif, BigDecimal montant, int stc, BigDecimal stcMontant) {
    }

    /** Historique mensuel dérivé en Java d'un seul jeu
     * de lignes déjà groupé en base au niveau le plus fin (voir
     * {@code PaieRepository.sommerParChantierEquipePeriode}), jamais une requête par chantier. Aucune
     * BI (donc aucune évolution) au niveau équipe (demande explicite de direction). */
    private record EvolutionParNiveau(
            List<RepartitionBean> global,
            Map<String, List<RepartitionBean>> parChantier) {

        static final EvolutionParNiveau VIDE = new EvolutionParNiveau(List.of(), Map.of());

        List<RepartitionBean> pourChantier(String code) {
            return parChantier.getOrDefault(code, List.of());
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
        EvolutionParNiveau evolutions = evolutionParNiveau(periode, requete.chantiersEffectifs());
        return construireDepuis(periode, requete, courant, precedent, evolutions);
    }

    /** Surcharge sans historique d'évolution utilisée par les tests du calcul pur, sans repository. */
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
        SyntheseGlobaleVue synthese = new SyntheseGlobaleVue(
                kpiMontant(masseCourante, massePrecedente),
                kpiEffectif(courant.size(), precedent.size(), !precedent.isEmpty()),
                agregatChantier.size(),
                (int) courant.stream().filter(ObservationStc::estStcOuSortie).count(),
                montantStc(courant),
                repartitionChantiers(agregatChantier, courant),
                evolutions.global()
        );

        // agregatChantier est déjà trié par masse (salaireTotal) décroissante — voir agreger() — le
        // plus gros chantier en premier, jamais un ré-tri alphabétique qui l'annulerait. Cet ordre de
        // liste, lu tel quel par RapportPageModelBuilder, détermine entièrement la
        // numérotation des chapitres : chaque chantier a désormais sa propre section, qu'il ait ou non
        // une équipe détaillée (voir ChantierBiVue.avecDetailEquipe, plus de chapitre final consolidé —
        // voir evolution-rapport/rapport-v2.md).
        List<ChantierBiVue> chantiers = agregatChantier.stream()
                .map(Agregat::cle)
                .map(code -> chantierVue(code, filtrerParChantier(courant, code), filtrerParChantier(precedent, code),
                        evolutions, equipesSelectionneesPour(requete, code), requete.materiel()))
                .toList();

        return new RapportBiVue(
                libellePeriode(periode),
                filtresActifs(requete, courant),
                synthese,
                chantiers);
    }

    /** Sélection manuelle d'équipes à détailler pour ce chantier (voir
     * {@code PaieReportPdfRequestDto.equipesParChantier}) — vide si le chantier est absent de la map
     * ou si sa liste est vide, auquel cas {@code ChantierBiVue.avecDetailEquipe} vaudra {@code false}. */
    private Set<String> equipesSelectionneesPour(PaieReportPdfRequestDto requete, String chantierCode) {
        if (requete.equipesParChantier() == null) {
            return Set.of();
        }
        List<String> equipes = requete.equipesParChantier().get(chantierCode);
        return equipes == null ? Set.of() : new HashSet<>(equipes);
    }

    private ChantierBiVue chantierVue(String code, List<Paie> lignesChantier, List<Paie> lignesChantierPrecedent,
                                       EvolutionParNiveau evolutions, Set<String> equipesSelectionnees,
                                       Map<String, Integer> nombresMateriel) {
        BigDecimal masseChantier = sommer(lignesChantier);
        BigDecimal masseChantierPrecedente = lignesChantierPrecedent.isEmpty() ? null : sommer(lignesChantierPrecedent);
        List<Agregat> agregatEquipe = agreger(lignesChantier, this::libelleEquipe);
        Map<String, String> libellesEquipes = libellesParCode(lignesChantier);
        int stc = (int) lignesChantier.stream().filter(ObservationStc::estStcOuSortie).count();
        boolean avecDetailEquipe = !equipesSelectionnees.isEmpty();
        String identifiantChantier = identifiantChantier(code, lignesChantier);
        String titreChantier = "CHANTIER : " + identifiantChantier;

        List<EquipeBiVue> equipes = new ArrayList<>();
        if (avecDetailEquipe) {
            // Une section par équipe SÉLECTIONNÉE (pas forcément toutes les équipes réelles du
            // chantier, voir agregatEquipe ci-dessus qui, lui, alimente le graphique avec la
            // distribution COMPLÈTE) — puis, si des employés restent (équipes non sélectionnées, "Sans
            // équipe" compris), une dernière section "reste" les regroupant tous, jamais nommée "Sans
            // équipe" (elle peut très bien contenir des employés d'une vraie équipe non sélectionnée,
            // voir le Javadoc de EquipeBiVue) mais portant le nom du chantier.
            agregatEquipe.stream()
                    .map(Agregat::cle)
                    .filter(equipesSelectionnees::contains)
                    .forEach(nom -> equipes.add(equipeVue(
                            nom, titreEquipe(nom, libellesEquipes), libellesEquipes.getOrDefault(nom, nom),
                            filtrerParEquipe(lignesChantier, nom), filtrerParEquipe(lignesChantierPrecedent, nom),
                            materiel(code, nom, nombresMateriel), false)));
            List<Paie> reste = filtrerHorsEquipes(lignesChantier, equipesSelectionnees);
            if (!reste.isEmpty()) {
                List<Paie> restePrecedent = filtrerHorsEquipes(lignesChantierPrecedent, equipesSelectionnees);
                equipes.add(equipeVue(code, titreChantier, code, reste, restePrecedent, List.of(), true));
            }
        } else {
            // Aucune équipe sélectionnée pour ce chantier : une seule section réunissant tous ses
            // employés, sans graphique de répartition par équipe (voir rapport.jrxml, GroupChantier).
            equipes.add(equipeVue(code, titreChantier, code, lignesChantier, lignesChantierPrecedent, List.of(), true));
        }

        return new ChantierBiVue(
                code,
                identifiantChantier,
                titreChantier,
                kpiMontant(masseChantier, masseChantierPrecedente),
                kpiEffectif(lignesChantier.size(), lignesChantierPrecedent.size(), !lignesChantierPrecedent.isEmpty()),
                stc,
                montantStc(lignesChantier),
                versRepartitionEquipe(agregatEquipe, libellesEquipes),
                evolutions.pourChantier(code),
                equipes,
                avecDetailEquipe);
    }

    /** "&lt;nom&gt; (&lt;code&gt;)" quand {@code Chantier.nom} est renseigné (champ optionnel, jamais
     * exposé par la synchronisation ERP — voir {@code docs/chantier/README.md}), "&lt;code&gt;" seul
     * sinon (demande explicite de direction, 2026-09-29 : le nom prime partout où il existe, le code
     * reste l'identifiant de repli). Le nom est lu sur la première ligne du chantier : toutes les
     * lignes d'un même {@code code} partagent la même entité {@code Chantier}. */
    private String identifiantChantier(String code, List<Paie> lignesChantier) {
        String nom = lignesChantier.isEmpty() ? null : lignesChantier.get(0).getChantier().getNom();
        return nom != null && !nom.isBlank() ? nom + " (" + code + ")" : code;
    }

    private String titreEquipe(String nom, Map<String, String> libellesEquipes) {
        return nom.equals(SANS_EQUIPE)
                ? SANS_EQUIPE.toUpperCase(Locale.FRANCE)
                : "ÉQUIPE : " + libellesEquipes.getOrDefault(nom, nom).toUpperCase(Locale.FRANCE);
    }

    /** Code → libellé des équipes présentes dans ces lignes (les bulletins sans équipe sont absents :
     * "Sans équipe" n'a pas de libellé, il s'affiche tel quel). Le code reste la clé de
     * sélection/regroupement, le libellé ne sert qu'à l'AFFICHAGE. */
    private Map<String, String> libellesParCode(List<Paie> lignes) {
        Map<String, String> libelles = new HashMap<>();
        for (Paie paie : lignes) {
            if (paie.getEquipe() != null) {
                libelles.put(paie.getEquipe().getCode(), paie.getEquipe().getLibelle());
            }
        }
        return libelles;
    }

    private List<Paie> filtrerHorsEquipes(List<Paie> lignes, Set<String> equipesSelectionnees) {
        return lignes.stream().filter(p -> !equipesSelectionnees.contains(libelleEquipe(p))).toList();
    }

    /** Lignes du parc matériel de ce chantier/équipe (vide si aucun cas prévu), avec le nombre saisi dans l'assistant
     * d'export — {@code null} pour une ligne non renseignée. */
    private List<MaterielLigneVue> materiel(String chantierCode, String equipe, Map<String, Integer> nombres) {
        return MaterielChantierCatalogue.libelles(chantierCode, equipe).stream()
                .map(libelle -> new MaterielLigneVue(libelle, MaterielChantierCatalogue.nombre(nombres, libelle)))
                .toList();
    }

    /** Somme des salaires totaux des seuls bulletins STC/sortie, formatée en DH. */
    private String montantStc(List<Paie> lignes) {
        BigDecimal montant = lignes.stream().filter(ObservationStc::estStcOuSortie)
                .map(Paie::getSalaireTotal).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return PaieReportNumberFormat.montant(montant);
    }

    private EquipeBiVue equipeVue(String nom, String titre, String libelleAffiche, List<Paie> lignesEquipe,
                                   List<Paie> lignesEquipePrecedent,
                                   List<MaterielLigneVue> materiel, boolean afficherEquipeReelle) {
        BigDecimal masseEquipe = sommer(lignesEquipe);
        BigDecimal masseEquipePrecedente = lignesEquipePrecedent.isEmpty() ? null : sommer(lignesEquipePrecedent);
        // agregatFonctionEquipe sert à la fois à ordonner le tableau employé ET à alimenter le tableau
        // récap Fonction/Effectif/STC (demande explicite de direction, 2026-09-29) — jamais un
        // graphique, voir le Javadoc de EquipeBiVue. Trié par ordre ALPHABÉTIQUE de la fonction
        // (demande explicite de direction, 2026-09-29 : plus par masse décroissante comme le reste des
        // classements BI du rapport — spécifique à ce tableau employé/récap) : on écrase donc le tri
        // par montant décroissant renvoyé par agreger().
        List<Agregat> agregatFonctionEquipe = agreger(lignesEquipe, this::libelleFonction).stream()
                .sorted(Comparator.comparing(Agregat::cle, String.CASE_INSENSITIVE_ORDER))
                .toList();
        Map<String, Integer> rangFonction = new LinkedHashMap<>();
        for (int i = 0; i < agregatFonctionEquipe.size(); i++) {
            rangFonction.put(agregatFonctionEquipe.get(i).cle(), i);
        }
        List<LigneEmployeVue> employes = lignesEquipe.stream()
                .sorted(Comparator.comparing((Paie p) -> rangFonction.get(libelleFonction(p)))
                        .thenComparing(p -> p.getEmployee().getNomPrenom(), String.CASE_INSENSITIVE_ORDER))
                .map(p -> ligneEmploye(p, afficherEquipeReelle))
                .toList();

        return new EquipeBiVue(
                nom,
                titre,
                libelleAffiche,
                kpiEffectif(lignesEquipe.size(), lignesEquipePrecedent.size(), !lignesEquipePrecedent.isEmpty()),
                kpiMontant(masseEquipe, masseEquipePrecedente),
                (int) lignesEquipe.stream().filter(ObservationStc::estStcOuSortie).count(),
                montantStc(lignesEquipe),
                repartitionFonctionSimple(agregatFonctionEquipe),
                materiel,
                employes);
    }

    /** Convertit un agrégat par fonction en tableau récap (voir {@link EquipeBiVue#repartitionFonction()})
     * — jamais plafonné aux {@value #MAX_BARRES_GRAPHIQUE} plus grosses valeurs comme
     * {@link #versRepartition} : ce n'est pas un graphique, un tableau imprime toutes ses lignes (le
     * nombre de fonctions distinctes d'une équipe reste de toute façon faible). */
    private List<RepartitionBean> repartitionFonctionSimple(List<Agregat> agregats) {
        return agregats.stream()
                .map(a -> new RepartitionBean(a.cle(), a.effectif(), a.montant(), a.stc(), a.stcMontant()))
                .toList();
    }

    /** {@code afficherEquipeReelle} : {@code false} dans une section équipe sélectionnée (déjà nommée
     * par son titre, redondant de répéter l'équipe par ligne) ; {@code true} dans la section "reste"
     * d'un chantier (ou l'unique section d'un chantier sans détail), où les employés viennent
     * potentiellement de plusieurs équipes non sélectionnées mélangées — voir le Javadoc de
     * {@link LigneEmployeVue#equipeReelle()}. */
    private LigneEmployeVue ligneEmploye(Paie paie, boolean afficherEquipeReelle) {
        return new LigneEmployeVue(
                paie.getEmployee().getNomPrenom(),
                paie.getFonction().getLibelle(),
                paie.getEmployee().getCin(),
                paie.getNombreJoursTravailles() != null ? paie.getNombreJoursTravailles() : BigDecimal.ZERO,
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationOuvrable()),
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireMensuel()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageOrdinaire()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireTotal()),
                paie.getObservation() != null ? paie.getObservation() : "",
                afficherEquipeReelle ? libelleAfficheEquipe(paie) : "");
    }

    /** Code de l'équipe pour la colonne "Équipe", ou {@code ""} (jamais "Sans équipe" — demande
     * explicite de direction, 2026-09-29) quand l'employé n'a aucune équipe renseignée. */
    private String libelleAfficheEquipe(Paie paie) {
        return paie.getEquipe() == null ? "" : paie.getEquipe().getCode();
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

    /** TOUS les chantiers, du plus gros au plus petit — {@code agregats} est déjà trié par montant décroissant
     * (voir {@link #agreger}). Ni plafond ni regroupement « Autres » (décision du 2026-10-03) : quand ils sont
     * nombreux, c'est {@link RapportPageModelBuilder} qui répartit le graphique sur plusieurs pages.
     *
     * <p>Chaque barre porte le <b>nom</b> du chantier ({@code Chantier.nom}), jamais son code, quand il est renseigné ;
     * le code reste le libellé de repli (demande de direction, 2026-10-05). {@code agregats} reste indexé par code (il
     * sert au filtrage des sections) : seul le libellé du graphique est substitué, ici. */
    private List<RepartitionBean> repartitionChantiers(List<Agregat> agregats, List<Paie> lignes) {
        return agregats.stream()
                .map(a -> new RepartitionBean(libelleGraphiqueChantier(a.cle(), lignes), a.effectif(), a.montant(), a.stc(), a.stcMontant()))
                .toList();
    }

    /** Le nom du chantier, ou son code quand le nom est vide : toutes les lignes d'un même {@code code} partagent la
     * même entité {@code Chantier}, la première suffit. */
    private String libelleGraphiqueChantier(String code, List<Paie> lignes) {
        String nom = lignes.stream()
                .filter(p -> codeChantier(p).equals(code))
                .findFirst()
                .map(p -> p.getChantier().getNom())
                .orElse(null);
        return nom != null && !nom.isBlank() ? nom.strip() : code;
    }

    /** Plafonne un graphique de la synthèse globale aux {@value #MAX_BARRES_GRAPHIQUE} plus grosses
     * valeurs (le reste regroupé sous "Autres", masse, effectif ET STC cumulés) — demande explicite de
     * direction (Top 20, un graphique complet à 25+ catégories devient trop dense pour rester
     * lisible imprimé), voir {@code docs/report/README.md}. Le résultat est retrié par montant
     * décroissant (y compris "Autres" à sa vraie place) : un graphique BI doit rester visuellement
     * monotone, jamais un bloc "Autres" plus grand que plusieurs barres qui le précèdent. Déjà trié
     * par montant décroissant en entrée (voir {@link #agreger}). La même liste alimente le graphique
     * à barres groupées (masse/effectif/STC, 3 séries) de la dimension (chantier, équipe ou fonction),
     * voir {@code RapportChartSvgBuilder}. */
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

    /** Comme {@link #versRepartition}, pour la distribution "Répartition par équipe" spécifiquement :
     * remplace le code de chaque {@code Agregat} par le libellé de l'équipe avant le plafonnage/tri
     * — jamais sur {@code agregatEquipe} lui-même, qui doit rester indexé par code pour
     * {@code equipesSelectionnees.contains(...)} et {@link #filtrerParEquipe}. */
    private List<RepartitionBean> versRepartitionEquipe(List<Agregat> agregatEquipe, Map<String, String> libellesEquipes) {
        List<Agregat> avecLibelleAffiche = agregatEquipe.stream()
                .map(a -> new Agregat(libellesEquipes.getOrDefault(a.cle(), a.cle()), a.effectif(), a.montant(), a.stc(), a.stcMontant()))
                .toList();
        return versRepartition(avecLibelleAffiche);
    }

    /** Historique mensuel — une seule requête groupée au niveau le
     * plus fin (voir {@code PaieRepository.sommerParChantierEquipePeriode} pour la justification
     * performance), le global en est dérivé par simple somme des lignes déjà en mémoire, jamais une
     * requête supplémentaire par chantier. Fenêtre glissante d'au plus {@value #MOIS_EVOLUTION} mois,
     * finissant à la période du rapport. Les périodes sans bulletin ne sont pas ajoutées
     * artificiellement au graphique.
     *
     * Le filtre des marchés du wizard est appliqué aux agrégats historiques avant leur cumul. */
    private EvolutionParNiveau evolutionParNiveau(YearMonth periode, List<Long> chantierIds) {
        YearMonth debut = periode.minusMonths(MOIS_EVOLUTION - 1);
        List<EvolutionChantierEquipeProjection> lignes = repository.sommerParChantierEquipePeriode(debut, periode);

        Map<YearMonth, Cumul> global = new LinkedHashMap<>();
        Map<String, Map<YearMonth, Cumul>> parChantier = new LinkedHashMap<>();

        for (EvolutionChantierEquipeProjection ligne : lignes) {
            if (chantierIds != null && !chantierIds.isEmpty() && !chantierIds.contains(ligne.getChantierId())) {
                continue;
            }
            YearMonth mois = ligne.getPeriode();
            BigDecimal masse = ligne.getMasse() == null ? BigDecimal.ZERO : ligne.getMasse();
            long effectif = ligne.getEffectif() == null ? 0 : ligne.getEffectif();
            long stc = ligne.getStc() == null ? 0 : ligne.getStc();
            BigDecimal stcMontant = ligne.getStcMontant() == null ? BigDecimal.ZERO : ligne.getStcMontant();
            String chantier = ligne.getChantierCode();

            cumuler(global, mois, masse, effectif, stc, stcMontant);
            cumuler(parChantier.computeIfAbsent(chantier, c -> new LinkedHashMap<>()), mois, masse, effectif, stc, stcMontant);
        }

        return new EvolutionParNiveau(
                pointsMensuels(debut, periode, global),
                versPointsParCle(debut, periode, parChantier));
    }

    private void cumuler(Map<YearMonth, Cumul> parMois, YearMonth mois, BigDecimal masse, long effectif, long stc,
                          BigDecimal stcMontant) {
        Cumul cumul = parMois.computeIfAbsent(mois, m -> new Cumul());
        cumul.masse = cumul.masse.add(masse);
        cumul.effectif += effectif;
        cumul.stc += stc;
        cumul.stcMontant = cumul.stcMontant.add(stcMontant);
    }

    private Map<String, List<RepartitionBean>> versPointsParCle(YearMonth debut, YearMonth periode, Map<String, Map<YearMonth, Cumul>> parCle) {
        Map<String, List<RepartitionBean>> resultat = new LinkedHashMap<>();
        parCle.forEach((cle, parMois) -> resultat.put(cle, pointsMensuels(debut, periode, parMois)));
        return resultat;
    }

    /** Un point par mois disponible dans la fenêtre glissante de {@value #MOIS_EVOLUTION} mois.
     * Les périodes sans bulletin ne sont pas inventées ni représentées par zéro. */
    private List<RepartitionBean> pointsMensuels(YearMonth debut, YearMonth periode, Map<YearMonth, Cumul> parMois) {
        List<RepartitionBean> points = new ArrayList<>();
        for (Map.Entry<YearMonth, Cumul> entree : parMois.entrySet().stream()
                .sorted(Map.Entry.comparingByKey()).toList()) {
            YearMonth mois = entree.getKey();
            if (mois.isBefore(debut) || mois.isAfter(periode)) {
                continue;
            }
            Cumul cumul = entree.getValue();
            points.add(new RepartitionBean(mois.format(FORMAT_MOIS_COURT), (int) cumul.effectif,
                    cumul.masse, (int) cumul.stc, cumul.stcMontant));
        }
        return points;
    }

    private List<String> filtresActifs(PaieReportPdfRequestDto requete, List<Paie> courant) {
        List<String> filtres = new ArrayList<>();
        List<Long> chantierIds = requete.chantiersEffectifs();
        if (chantierIds != null && !chantierIds.isEmpty()) {
            List<String> codes = courant.stream().filter(p -> chantierIds.contains(p.getChantier().getId()))
                    .map(p -> p.getChantier().getCode()).distinct().toList();
            if (!codes.isEmpty()) {
                filtres.add("Marchés : " + String.join(", ", codes));
            }
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
                PaieReportNumberFormat.masse(actuel),
                PaieReportNumberFormat.masseOuNull(precedent),
                libelleEcartMasse(actuel, precedent));
    }

    private String libelleEcartMasse(BigDecimal actuel, BigDecimal precedent) {
        if (precedent == null) {
            return "Écart indisponible";
        }
        BigDecimal ecart = actuel.subtract(precedent);
        String signe = ecart.signum() > 0 ? "+" : ecart.signum() < 0 ? "−" : "";
        String montant = signe + PaieReportNumberFormat.masse(ecart.abs()) + " DH";
        if (precedent.signum() == 0) {
            return "Écart : " + montant + " (base à 0)";
        }
        BigDecimal pourcentage = ecart.multiply(BigDecimal.valueOf(100))
                .divide(precedent, 1, java.math.RoundingMode.HALF_UP);
        String signePourcentage = pourcentage.signum() > 0 ? "+" : pourcentage.signum() < 0 ? "−" : "";
        return "Écart : " + montant + " (" + signePourcentage
                + PaieReportNumberFormat.pourcentage(pourcentage.abs()) + " %)";
    }

    private KpiEffectifVue kpiEffectif(int actuel, int precedent, boolean comparaisonDisponible) {
        int variation = actuel - precedent;
        return new KpiEffectifVue(actuel, precedent, comparaisonDisponible ? variation : 0, comparaisonDisponible);
    }

    private String codeChantier(Paie paie) {
        return paie.getChantier().getCode();
    }

    private String libelleFonction(Paie paie) {
        return paie.getFonction().getLibelle();
    }

    /** "Sans équipe" pour un bulletin sans équipe renseignée — jamais exclu des distributions. */
    private String libelleEquipe(Paie paie) {
        return paie.getEquipe() == null ? SANS_EQUIPE : paie.getEquipe().getCode();
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
                requete.chantiersEffectifs(),
                null);
        return repository.findAll(PaieSpecification.searchByCriteria(criteria));
    }

    private static String libellePeriode(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1) + " " + periode.getYear();
    }
}
