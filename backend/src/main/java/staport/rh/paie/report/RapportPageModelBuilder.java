package staport.rh.paie.report;

import org.springframework.stereotype.Component;
import staport.rh.paie.reporting.MaterielChantierCatalogue;

import java.util.ArrayList;
import java.util.List;

/**
 * Découpe la vue-modèle du rapport ({@link RapportBiVue}, construite par {@link PaieBiReportBuilder},
 * INCHANGÉE) en une liste de {@link PageModel} — une par page physique, chacune déjà entièrement
 * résolue (texte d'en-tête/pied, tranche exacte de contenu). Aucune dépendance HTML/PDF ici :
 * uniquement de l'arithmétique pure sur des hauteurs de page en points, calculable et testable sans
 * aucun rendu (voir {@code RapportPageModelBuilderTest}).
 *
 * <p><b>Pourquoi tout calculer ici plutôt que de laisser le moteur de rendu déborder
 * naturellement</b> (demande explicite de direction, 2026-09-29 — voir {@code docs/report/README.md})
 * : l'ancien pipeline JasperReports laissait le moteur décider où déborder, et son comportement
 * exact près de certaines limites internes non documentées s'est révélé imprévisible (pages
 * blanches). Le tableau employé a des colonnes de largeur FIXE et une hauteur de ligne FIXE (voir
 * rapport.css) — sa pagination est de l'arithmétique, pas de la composition typographique ouverte :
 * cette classe DÉCIDE donc elle-même, avant tout rendu, exactement quelles lignes vont sur quelle
 * page, avec une seule règle à garantir : le pied récapitulatif d'une section (tableau récap
 * Fonction/Effectif/STC + squelette matériel) ne doit jamais se retrouver seul en haut d'une page
 * sans aucune ligne employé au-dessus (voir {@link #ajouterPagesEquipe}) — soit il tient après les
 * dernières lignes de la page, soit il part seul sur une page dédiée (jamais orphelin en train de
 * partager une page "presque vide").
 *
 * <p>Contrairement à l'ancien {@code PaieReportPdfService.calculerSautPage}, aucun seuil empirique
 * en pixels n'est nécessaire ici : cette classe ne contourne aucun bug de moteur, elle DÉCIDE la
 * mise en page (chaque page est ensuite rendue comme un bloc HTML à taille fixe,
 * {@code overflow:hidden} — voir rapport.css), donc la seule contrainte réelle est de ne jamais
 * dépasser {@value #PAGE_BODY_HAUTEUR}pt de contenu utile par page, avec une marge de sécurité
 * (voir {@link #MARGE_SECURITE}) absorbant d'éventuels écarts d'arrondi entre cette arithmétique et
 * le rendu CSS réel.
 *
 * <p>Autre simplification par rapport à l'ancien service : plus besoin d'un double passage de
 * rendu pour connaître le numéro de page où démarre le premier chantier (l'ancien mécanisme
 * "GLOBAL vs CHANTIER" reposait sur une découverte après coup, JasperReports ne révélant les
 * numéros de page qu'après mise en page complète) — ici, {@code niveauTexte} est connu
 * IMMÉDIATEMENT pour chaque page, puisque c'est cette classe elle-même qui décide dans quelle
 * section (globale ou tel chantier/équipe) chaque page se trouve.
 */
@Component
final class RapportPageModelBuilder {

    /** Hauteur utile de {@code .page-body} (voir rapport.css) : 595 (page) - 20 - 20 (marges,
     * padding de {@code .page}) - 40 (bandeau) - 20 (pied) = 495. */
    private static final double PAGE_BODY_HAUTEUR = 495;

    /** Hauteur du bloc titre+cartes KPI+en-têtes de colonnes d'une section équipe — 1re page
     * uniquement (voir {@code BlocTitreEquipe}+{@code BlocKpi}+en-tête de {@code table.employes}
     * dans rapport.css). */
    private static final double EQUIPE_ENTETE_HAUTEUR = 100;

    /** Hauteur d'une ligne du tableau employé (voir {@code table.employes td/th} dans rapport.css). */
    private static final double LIGNE_HAUTEUR = 16;

    /** Hauteur fixe du pied de section AVANT la 1re ligne de récap (titre "Répartition par
     * fonction" + en-tête du tableau récap — voir {@code .recap-bloc}/{@code table.recap} dans
     * rapport.css), puis hauteur par ligne de récap. */
    private static final double RECAP_BASE_HAUTEUR = 34;
    private static final double RECAP_LIGNE_HAUTEUR = 15;

    /** Marge de sécurité (pt) soustraite de la hauteur utile de page avant tout calcul de capacité
     * — absorbe un éventuel écart d'arrondi entre cette arithmétique et le rendu CSS réel (voir le
     * Javadoc de la classe). Jamais nécessaire pour contourner un bug de moteur (il n'y en a pas
     * ici) : uniquement une précaution, vérifiée empiriquement lors de la reproduction locale (voir
     * {@code docs/report/README.md}). */
    private static final double MARGE_SECURITE = 8;

    private static final int CHAPITRES_FIXES = 1;

    /** Une page en cours de construction — {@code niveauTexte} et {@code blocs} déjà connus,
     * {@code numeroPage}/{@code totalPages} résolus seulement à la fin (voir {@link #construire}),
     * une fois le nombre total de pages connu. */
    private record PageEnConstruction(String niveauTexte, List<PageModel.Bloc> blocs) {
    }

    List<PageModel> construire(RapportBiVue vue) {
        List<PageEnConstruction> pages = new ArrayList<>();

        ajouterPageGlobale(pages, vue.synthese());

        List<ChantierBiVue> chantiers = vue.chantiers();
        for (int index = 0; index < chantiers.size(); index++) {
            ChantierBiVue chantier = chantiers.get(index);
            ajouterPageChantier(pages, chantier, index);
            for (EquipeBiVue equipe : chantier.equipes()) {
                ajouterPagesEquipe(pages, chantier, equipe);
            }
        }

        int total = pages.size();
        List<PageModel> resultat = new ArrayList<>(total);
        for (int i = 0; i < total; i++) {
            PageEnConstruction brut = pages.get(i);
            resultat.add(new PageModel(brut.niveauTexte(), i + 1, total, brut.blocs()));
        }
        return resultat;
    }

    private void ajouterPageGlobale(List<PageEnConstruction> pages, SyntheseGlobaleVue synthese) {
        List<PageModel.Bloc> blocs = new ArrayList<>();
        blocs.add(new PageModel.BlocTitreChapitre("I — Vue d'ensemble"));
        blocs.add(new PageModel.BlocKpi("global", List.of(
                CarteKpi.de("MASSE", synthese.masse().valeurCourante() + " DH"),
                CarteKpi.de("EFFECTIF", String.valueOf(synthese.effectif().effectifCourant())),
                CarteKpi.de("MASSE MOYENNE / EMPLOYÉ", synthese.masseMoyenneParEmploye() + " DH"),
                CarteKpi.de("CHANTIERS", String.valueOf(synthese.nombreChantiers())),
                CarteKpi.de("STC / SORTIES", String.valueOf(synthese.stc()))
        )));
        blocs.add(new PageModel.BlocGraphique(synthese.repartitionChantier(), true));
        pages.add(new PageEnConstruction("GLOBAL", blocs));
    }

    private void ajouterPageChantier(List<PageEnConstruction> pages, ChantierBiVue chantier, int index) {
        List<PageModel.Bloc> blocs = new ArrayList<>();
        blocs.add(new PageModel.BlocTitreChapitre(chapitreChantier(index, chantier)));
        blocs.add(new PageModel.BlocKpi("chantier", List.of(
                new CarteKpi("MASSE SALARIALE", masseLigne(chantier.masse()), "montant"),
                new CarteKpi("EFFECTIF", String.valueOf(chantier.effectif().effectifCourant()), "compte"),
                new CarteKpi("COÛT MOYEN / EMPLOYÉ", chantier.masseMoyenneParEmploye() + " DH", "compte"),
                new CarteKpi("STC / SORTIES", String.valueOf(chantier.stc()), "compte")
        )));
        if (chantier.avecDetailEquipe()) {
            blocs.add(new PageModel.BlocTitreSection("Répartition par équipe"));
            blocs.add(new PageModel.BlocGraphique(chantier.repartitionEquipe(), false));
        }
        pages.add(new PageEnConstruction(niveauTexteChantier(chantier), blocs));
    }

    /** Découpe le tableau employé d'une section équipe/reste en autant de pages que nécessaire, et
     * place le pied récap (voir {@link PageModel.BlocRecap}) soit à la suite des dernières lignes de
     * la dernière page (s'il y tient), soit seul sur une page neuve — jamais recalculé pour les
     * pages précédentes, qui reçoivent toujours leur capacité naturelle pleine. */
    private void ajouterPagesEquipe(List<PageEnConstruction> pages, ChantierBiVue chantier, EquipeBiVue equipe) {
        String niveau = niveauTexteEquipe(chantier, equipe);
        List<LigneEmployeVue> employes = equipe.employes();
        int total = employes.size();

        int capPremiere = (int) ((PAGE_BODY_HAUTEUR - MARGE_SECURITE - EQUIPE_ENTETE_HAUTEUR) / LIGNE_HAUTEUR);
        int capContinuation = (int) ((PAGE_BODY_HAUTEUR - MARGE_SECURITE) / LIGNE_HAUTEUR);

        List<int[]> tranches = new ArrayList<>();
        int position = 0;
        boolean premierePage = true;
        while (position < total) {
            int capacite = premierePage ? capPremiere : capContinuation;
            int fin = Math.min(position + capacite, total);
            tranches.add(new int[]{position, fin});
            position = fin;
            premierePage = false;
        }

        int lignesRecapMax = Math.max(equipe.repartitionFonction().size(), equipe.materiel().size());
        double hauteurRecap = RECAP_BASE_HAUTEUR + RECAP_LIGNE_HAUTEUR * lignesRecapMax;
        String titreMateriel = MaterielChantierCatalogue.titre(chantier.code(), equipe.nom());

        for (int t = 0; t < tranches.size(); t++) {
            int[] tranche = tranches.get(t);
            boolean estPremiere = t == 0;
            boolean estDerniere = t == tranches.size() - 1;
            List<LigneEmployeVue> ligneSlice = employes.subList(tranche[0], tranche[1]);

            List<PageModel.Bloc> blocs = new ArrayList<>();
            if (estPremiere) {
                blocs.add(new PageModel.BlocTitreEquipe(equipe.titre()));
                blocs.add(cartesKpiEquipe(equipe));
            }
            blocs.add(new PageModel.BlocTableauEmployes(ligneSlice, estPremiere));

            double hauteurUtilisee = (estPremiere ? EQUIPE_ENTETE_HAUTEUR : 0) + ligneSlice.size() * LIGNE_HAUTEUR;
            double hauteurRestante = PAGE_BODY_HAUTEUR - MARGE_SECURITE - hauteurUtilisee;
            boolean recapSurCettePage = estDerniere && hauteurRestante >= hauteurRecap;
            if (recapSurCettePage) {
                blocs.add(new PageModel.BlocRecap(equipe.repartitionFonction(), equipe.materiel(), titreMateriel));
            }
            pages.add(new PageEnConstruction(niveau, blocs));

            if (estDerniere && !recapSurCettePage) {
                pages.add(new PageEnConstruction(niveau, List.of(
                        new PageModel.BlocRecap(equipe.repartitionFonction(), equipe.materiel(), titreMateriel))));
            }
        }
    }

    private PageModel.BlocKpi cartesKpiEquipe(EquipeBiVue equipe) {
        String masseMoisPrecedent = "INTROUVABLE".equals(equipe.montantMoisPrecedentOuIntrouvable())
                ? "INTROUVABLE"
                : equipe.montantMoisPrecedentOuIntrouvable() + " DH";
        return new PageModel.BlocKpi("equipe", List.of(
                new CarteKpi("EFFECTIF", String.valueOf(equipe.effectif()), "compte"),
                new CarteKpi("STC / SORTIES", String.valueOf(equipe.stc()), "compte"),
                new CarteKpi("MASSE", equipe.masse() + " DH (" + equipe.partChantierPourcent() + ")", "montant"),
                new CarteKpi("MASSE MOIS PRECEDENT", masseMoisPrecedent, "montant")
        ));
    }

    /** "&lt;identifiant&gt;" seul si la section est le "reste" du chantier (sentinel :
     * {@code equipe.nom()} vaut alors le CODE chantier — voir le Javadoc de {@link EquipeBiVue}),
     * sinon "&lt;identifiant&gt;  ·  ÉQUIPE : &lt;nom complet&gt;" — même logique que l'ancien
     * bandeau JasperReports, reconduite à l'identique. */
    private String niveauTexteEquipe(ChantierBiVue chantier, EquipeBiVue equipe) {
        return equipe.nom().equals(chantier.code())
                ? niveauTexteChantier(chantier)
                : "CHANTIER : " + chantier.identifiant() + "  ·  ÉQUIPE : " + equipe.libelleAffiche();
    }

    private String niveauTexteChantier(ChantierBiVue chantier) {
        return "CHANTIER : " + chantier.identifiant();
    }

    private String chapitreChantier(int index, ChantierBiVue chantier) {
        return PaieReportNumberFormat.romain(CHAPITRES_FIXES + index + 1) + " — " + chantier.titre();
    }

    /** {@code null} (aucune comparaison) quand la tendance est NON_DISPONIBLE — jamais affiché dans
     * ce cas. Reconduit à l'identique depuis l'ancien {@code PaieReportPdfService}. */
    private String variationLibelle(KpiMontantVue masse) {
        if (masse.tendance() == PaieReportNumberFormat.Tendance.NON_DISPONIBLE) {
            return null;
        }
        String pourcent = masse.variationPourcent() != null ? " (" + masse.variationPourcent() + ")" : " (% non calculable)";
        return masse.variationAbsolue() + " DH" + pourcent;
    }

    /** Ligne compacte masse + comparaison pour la carte KPI "MASSE SALARIALE" d'un chantier —
     * reconduit à l'identique depuis l'ancien {@code PaieReportPdfService}. */
    private String masseLigne(KpiMontantVue masse) {
        String variation = variationLibelle(masse);
        return variation == null
                ? masse.valeurCourante() + " DH  (aucune donnée mois précédent)"
                : masse.valeurCourante() + " DH  (" + variation + ")";
    }
}
