package staport.rh.paie.report;

import org.springframework.stereotype.Service;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.repositories.EvolutionChantierEquipeProjection;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.reporting.EquipeLibelleCatalogue;
import staport.rh.paie.reporting.MaterielChantierCatalogue;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.specifications.PaieSpecification;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
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
 * 2026-09-29 — voir {@code docs/report/rapport-v2.md}), {@code PaieReportPdfRequestDto.equipesParChantier}
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
    private static final DateTimeFormatter FORMAT_MOIS_COURT = DateTimeFormatter.ofPattern("MMM yy", Locale.FRENCH);

    /** Agrégat brut (avant formatage) d'un groupe de lignes — évite tout aller-retour par une
     * chaîne déjà formatée pour trier ou construire un graphique. {@code stc}/{@code stcMontant} :
     * nombre et masse salariale des STC/sorties dans ce groupe (même définition qu'aux autres
     * niveaux, voir {@code ObservationStc}) — les 2 représentations sont portées côte à côte, jamais
     * l'une déduite de l'autre. */
    private record Agregat(String cle, int effectif, BigDecimal montant, int stc, BigDecimal stcMontant) {
    }

    /** Historique mensuel aux 2 niveaux du rapport (global, chantier) — dérivés en Java d'un seul jeu
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
        EvolutionParNiveau evolutions = evolutionParNiveau(periode);
        return construireDepuis(periode, requete, courant, precedent, evolutions);
    }

    /** Surcharge sans historique d'évolution (utilisée par les tests de {@link PaieBiReportBuilder},
     * qui ne dépendent jamais du repository — voir {@code PaieBiReportBuilderTest}) : les données
     * d'évolution restent alors simplement vides, sans incidence sur le reste du calcul (aucun
     * graphique du rapport ne les consomme de toute façon, voir {@code docs/report/rapport-v2.md}). */
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
        // plus gros chantier en premier, jamais un ré-tri alphabétique qui l'annulerait. Cet ordre de
        // liste, lu tel quel par PaieReportPdfService/rapport.jrxml, détermine entièrement la
        // numérotation des chapitres : chaque chantier a désormais sa propre section, qu'il ait ou non
        // une équipe détaillée (voir ChantierBiVue.avecDetailEquipe, plus de chapitre final consolidé —
        // voir docs/report/rapport-v2.md).
        List<ChantierBiVue> chantiers = agregatChantier.stream()
                .map(Agregat::cle)
                .map(code -> chantierVue(code, filtrerParChantier(courant, code), filtrerParChantier(precedent, code),
                        evolutions, equipesSelectionneesPour(requete, code)))
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
                                       EvolutionParNiveau evolutions, Set<String> equipesSelectionnees) {
        BigDecimal masseChantier = sommer(lignesChantier);
        BigDecimal masseChantierPrecedente = lignesChantierPrecedent.isEmpty() ? null : sommer(lignesChantierPrecedent);
        List<Agregat> agregatEquipe = agreger(lignesChantier, this::libelleEquipe);
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
                            nom, titreEquipe(nom),
                            filtrerParEquipe(lignesChantier, nom), filtrerParEquipe(lignesChantierPrecedent, nom),
                            masseChantier, MaterielChantierCatalogue.libelles(code, nom), false)));
            List<Paie> reste = filtrerHorsEquipes(lignesChantier, equipesSelectionnees);
            if (!reste.isEmpty()) {
                List<Paie> restePrecedent = filtrerHorsEquipes(lignesChantierPrecedent, equipesSelectionnees);
                equipes.add(equipeVue(code, titreChantier, reste, restePrecedent, masseChantier, List.of(), true));
            }
        } else {
            // Aucune équipe sélectionnée pour ce chantier : une seule section réunissant tous ses
            // employés, sans graphique de répartition par équipe (voir rapport.jrxml, GroupChantier).
            equipes.add(equipeVue(code, titreChantier, lignesChantier, lignesChantierPrecedent, masseChantier, List.of(), true));
        }

        return new ChantierBiVue(
                code,
                identifiantChantier,
                titreChantier,
                kpiMontant(masseChantier, masseChantierPrecedente),
                kpiEffectif(lignesChantier.size(), lignesChantierPrecedent.size()),
                PaieReportNumberFormat.montant(masseChantier.divide(BigDecimal.valueOf(lignesChantier.size()), 2, RoundingMode.HALF_UP)),
                stc,
                versRepartitionEquipe(agregatEquipe),
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

    private String titreEquipe(String nom) {
        return nom.equals(SANS_EQUIPE)
                ? SANS_EQUIPE.toUpperCase(Locale.FRANCE)
                : "ÉQUIPE : " + EquipeLibelleCatalogue.libelle(nom).toUpperCase(Locale.FRANCE);
    }

    private List<Paie> filtrerHorsEquipes(List<Paie> lignes, Set<String> equipesSelectionnees) {
        return lignes.stream().filter(p -> !equipesSelectionnees.contains(libelleEquipe(p))).toList();
    }

    private EquipeBiVue equipeVue(String nom, String titre, List<Paie> lignesEquipe, List<Paie> lignesEquipePrecedent,
                                   BigDecimal masseChantier, List<String> materielLibelles, boolean afficherEquipeReelle) {
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
                EquipeLibelleCatalogue.libelle(nom),
                lignesEquipe.size(),
                PaieReportNumberFormat.montant(masseEquipe),
                PaieReportNumberFormat.part(masseEquipe, masseChantier),
                (int) lignesEquipe.stream().filter(ObservationStc::estStcOuSortie).count(),
                PaieReportNumberFormat.montantOuIntrouvable(masseEquipePrecedente),
                repartitionFonctionSimple(agregatFonctionEquipe),
                materielLibelles.stream().map(MaterielLigneVue::new).toList(),
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
                paie.getNombreJoursTravailles() != null ? paie.getNombreJoursTravailles() : 0,
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationOuvrable()),
                PaieReportNumberFormat.quantite(paie.getJoursRecuperationDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireMensuel()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageOrdinaire()),
                PaieReportNumberFormat.montant(paie.getPrimeRoulageDimanche()),
                PaieReportNumberFormat.montant(paie.getSalaireTotal()),
                paie.getObservation() != null ? paie.getObservation() : "",
                afficherEquipeReelle ? libelleAfficheEquipe(paie) : "");
    }

    /** Nom complet de l'équipe pour la colonne "Équipe" ("CHAUFFEURS" pour {@code "CH"}), ou {@code ""}
     * (jamais "Sans équipe" — demande explicite de direction, 2026-09-29) quand l'employé n'a aucune
     * équipe renseignée. */
    private String libelleAfficheEquipe(Paie paie) {
        String brut = paie.getEquipe();
        return brut == null || brut.isBlank() ? "" : EquipeLibelleCatalogue.libelle(brut);
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

    /** Comme {@link #versRepartition}, pour la distribution "Répartition par équipe" spécifiquement :
     * remplace le code brut de chaque {@code Agregat} par son nom complet d'affichage (voir
     * {@code EquipeLibelleCatalogue}) avant le plafonnage/tri — jamais sur {@code agregatEquipe}
     * lui-même, qui doit rester indexé par code brut pour {@code equipesSelectionnees.contains(...)}
     * et {@link #filtrerParEquipe}. */
    private List<RepartitionBean> versRepartitionEquipe(List<Agregat> agregatEquipe) {
        List<Agregat> avecLibelleAffiche = agregatEquipe.stream()
                .map(a -> new Agregat(EquipeLibelleCatalogue.libelle(a.cle()), a.effectif(), a.montant(), a.stc(), a.stcMontant()))
                .toList();
        return versRepartition(avecLibelleAffiche);
    }

    /** Historique mensuel aux 2 niveaux (global, chantier) — une seule requête groupée au niveau le
     * plus fin (voir {@code PaieRepository.sommerParChantierEquipePeriode} pour la justification
     * performance), le global en est dérivé par simple somme des lignes déjà en mémoire, jamais une
     * requête supplémentaire par chantier. Fenêtre glissante d'AU PLUS {@value #MOIS_EVOLUTION} mois,
     * mais jamais avant le premier mois où une paie existe réellement en base (voir
     * {@link PaieRepository#premierePeriode()}) — sans ce plancher, un système mis en place il y a 2
     * mois afficherait 10 mois "fantômes" à zéro avant la donnée réelle.
     *
     * <p><b>Retiré de tout graphique du rapport</b> (demande explicite de direction, 2026-09-28 :
     * manque d'historique suffisant pour qu'une tendance mensuelle soit significative — voir
     * {@code docs/report/rapport-v2.md}), mais volontairement conservé ici, calculé sans être
     * consommé : même principe que {@code PaieBiReportBuilder.versRepartition} pour la fonction
     * (voir {@code SyntheseGlobaleVue.repartitionFonction}) — éviter de tout redévelopper si
     * l'historique disponible devient un jour suffisant pour justifier de le réafficher. */
    private EvolutionParNiveau evolutionParNiveau(YearMonth periode) {
        YearMonth premierePeriode = repository.premierePeriode().orElse(periode);
        YearMonth debut = premierePeriode.isAfter(periode.minusMonths(MOIS_EVOLUTION - 1))
                ? premierePeriode
                : periode.minusMonths(MOIS_EVOLUTION - 1);
        List<EvolutionChantierEquipeProjection> lignes = repository.sommerParChantierEquipePeriode(debut, periode);

        Map<YearMonth, Cumul> global = new LinkedHashMap<>();
        Map<String, Map<YearMonth, Cumul>> parChantier = new LinkedHashMap<>();

        for (EvolutionChantierEquipeProjection ligne : lignes) {
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

    /** Un point par mois entre {@code debut} et {@code periode} (bornes incluses — voir
     * {@link #evolutionParNiveau} pour le calcul de {@code debut}, jamais fixé à
     * {@value #MOIS_EVOLUTION} mois de façon rigide), y compris les mois sans aucun bulletin pour ce
     * périmètre (masse, effectif et STC à 0 — une absence réelle de paie ce mois-là, pas une valeur
     * inconnue à distinguer comme le fait la comparaison mois précédent). */
    private List<RepartitionBean> pointsMensuels(YearMonth debut, YearMonth periode, Map<YearMonth, Cumul> parMois) {
        List<RepartitionBean> points = new ArrayList<>();
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
