package staport.rh.paie.report;

import java.util.List;

/** Une page physique du rapport, déjà ENTIÈREMENT résolue par {@link RapportPageModelBuilder} —
 * texte d'en-tête/pied, numéro de page, contenu exact — avant toute construction HTML. {@link
 * PaieReportHtmlBuilder} se contente de traduire chaque {@link Bloc} en éléments jsoup, aucune
 * décision de mise en page (pagination, découpage) n'est prise à ce stade : voir le Javadoc de
 * {@link RapportPageModelBuilder} pour pourquoi ce découpage est fait entièrement en amont, en Java
 * pur, plutôt que délégué au moteur de rendu. */
record PageModel(String niveauTexte, int numeroPage, int totalPages, List<Bloc> blocs) {

    sealed interface Bloc {
    }

    /** Titre de chapitre (16pt, filet — "I — Vue d'ensemble" ou "II — CHANTIER : ..."). */
    record BlocTitreChapitre(String texte) implements Bloc {
    }

    /** Titre de sous-section (12pt, sans filet — "Répartition par équipe"). */
    record BlocTitreSection(String texte) implements Bloc {
    }

    /** Rubrique numérotée à chaque niveau, destinée à alimenter le futur sommaire avec son numéro de page. */
    record BlocTitreRubrique(int numero, String texte) implements Bloc {
    }

    /** Titre de section équipe (12pt, filet — "ÉQUIPE : CHAUFFEURS"), toujours suivi d'un
     * {@link BlocKpi} : présent UNIQUEMENT sur la 1re page d'une section équipe/reste. */
    record BlocTitreEquipe(String texte) implements Bloc {
    }

    /** Une rangée de cartes KPI, toutes de même largeur et de même hauteur à tous les niveaux du rapport.
     * {@code hauteurCarte} (pt) : hauteur commune des cartes de la rangée, celle de la carte dont le texte passe sur
     * le plus de lignes (voir {@link RapportPageModelBuilder#blocKpi}). */
    record BlocKpi(List<CarteKpi> cartes, double hauteurCarte) implements Bloc {
    }

    /** Graphique en barres groupées (voir {@link RapportChartSvgBuilder}). {@code echelle} est l'ensemble des
     * lignes qui servent à calculer la longueur des barres : quand un même graphique est réparti sur plusieurs
     * pages, chaque page ne porte que ses {@code donnees} mais toutes partagent l'échelle de l'ensemble, pour que
     * les barres restent comparables d'une page à l'autre. {@code hauteurMax} (pt) : hauteur totale que le
     * graphique ne doit pas dépasser — réduite quand les blocs au-dessus (titre, cartes KPI) occupent plus de place
     * que prévu parce que leur texte passe à la ligne. */
    record BlocGraphique(List<RepartitionBean> donnees, List<RepartitionBean> echelle, double hauteurMax,
                         boolean partDuTotal) implements Bloc {

        BlocGraphique(List<RepartitionBean> donnees, List<RepartitionBean> echelle, double hauteurMax) {
            this(donnees, echelle, hauteurMax, false);
        }

        BlocGraphique(List<RepartitionBean> donnees, double hauteurMax) {
            this(donnees, donnees, hauteurMax, false);
        }
    }

    enum GroupeEvolution {
        MASSE_EFFECTIF, STC
    }

    /** Graphique mensuel à deux séries et deux axes Y explicitement associés à leurs unités. */
    record BlocGraphiqueEvolution(List<RepartitionBean> donnees, GroupeEvolution groupe,
                                  double hauteur) implements Bloc {
    }

    /** Graphique horizontal du parc matériel : une série de quantités et les nombres alignés à droite. */
    record BlocGraphiqueMateriel(String titre, List<MaterielLigneVue> donnees,
                                 double hauteurMax) implements Bloc {
    }

    /** Tranche du tableau employé d'une section — {@code avecEnTeteColonnes} vrai uniquement sur la
     * 1re page de la section (voir {@code isReprintHeaderOnEachPage=false} de l'ancien gabarit,
     * comportement délibérément reconduit : une page de continuation ne réaffiche jamais les
     * en-têtes de colonnes). */
    record BlocTableauEmployes(List<LigneEmployeVue> lignes, boolean avecEnTeteColonnes,
                               boolean avecColonneEquipe) implements Bloc {
    }

    /** Récap des sections fusionnées (sans équipe sélectionnée) : fonction et matériel éventuel en tableaux.
     * Les équipes sélectionnées ont leurs graphiques dédiés. Quand le récap est trop long, {@code suite} est vrai
     * pour les tranches reprises sur les pages suivantes. Voir {@link RapportPageModelBuilder#ajouterPagesEquipe}. */
    record BlocRecap(List<RepartitionBean> repartitionFonction, List<MaterielLigneVue> materiel, String titreMateriel,
                     boolean suite) implements Bloc {
    }
}
