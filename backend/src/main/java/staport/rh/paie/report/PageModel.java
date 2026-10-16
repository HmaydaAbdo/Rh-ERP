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

    /** Rubrique globale numérotée et destinée à alimenter le futur sommaire avec son numéro de page. */
    record BlocTitreRubrique(int numero, String texte) implements Bloc {
    }

    /** Périmètre des marchés utilisé par la synthèse globale. */
    record BlocPerimetre(String texte) implements Bloc {
    }

    /** Nombre de mois réellement présents dans l'historique, comparé à la fenêtre maximale affichée. */
    record BlocCouvertureHistorique(int moisDisponibles, int fenetreMois) implements Bloc {
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

    enum MesureEvolution {
        MASSE, EFFECTIF, STC_PERSONNES, STC_DH
    }

    /** Graphique d'évolution globale ; sa rubrique numérotée précédente est collectable pour le sommaire. */
    record BlocGraphiqueEvolution(List<RepartitionBean> donnees, MesureEvolution mesure) implements Bloc {
    }

    /** Tranche du tableau employé d'une section — {@code avecEnTeteColonnes} vrai uniquement sur la
     * 1re page de la section (voir {@code isReprintHeaderOnEachPage=false} de l'ancien gabarit,
     * comportement délibérément reconduit : une page de continuation ne réaffiche jamais les
     * en-têtes de colonnes). */
    record BlocTableauEmployes(List<LigneEmployeVue> lignes, boolean avecEnTeteColonnes,
                               boolean avecColonneEquipe) implements Bloc {
    }

    /** Récap de section équipe — tableau Fonction/Effectif/STC personnes/DH (toujours) + squelette parc matériel
     * (uniquement si {@code titreMateriel} non {@code null}, voir {@code MaterielChantierCatalogue}). Quand la
     * section compte trop de fonctions pour tenir sur la page, le tableau est découpé : {@code suite} est vrai
     * pour les tranches reprises sur les pages suivantes (titre « (suite) », sans parc matériel). Voir
     * {@link RapportPageModelBuilder#ajouterPagesEquipe}. */
    record BlocRecap(List<RepartitionBean> repartitionFonction, List<MaterielLigneVue> materiel, String titreMateriel,
                     boolean suite) implements Bloc {
    }
}
