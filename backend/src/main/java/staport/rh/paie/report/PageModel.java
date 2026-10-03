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

    /** Titre de section équipe (12pt, filet — "ÉQUIPE : CHAUFFEURS"), toujours suivi d'un
     * {@link BlocKpi} : présent UNIQUEMENT sur la 1re page d'une section équipe/reste. */
    record BlocTitreEquipe(String texte) implements Bloc {
    }

    /** Une rangée de cartes KPI — {@code niveauClasse} = "global"/"chantier"/"equipe" (voir
     * rapport.css pour la taille/l'écart associés). */
    record BlocKpi(String niveauClasse, List<CarteKpi> cartes) implements Bloc {
    }

    /** Graphique en barres groupées (voir {@link RapportChartSvgBuilder}). {@code echelle} est l'ensemble des
     * lignes qui servent à calculer la longueur des barres : quand un même graphique est réparti sur plusieurs
     * pages, chaque page ne porte que ses {@code donnees} mais toutes partagent l'échelle de l'ensemble, pour que
     * les barres restent comparables d'une page à l'autre. */
    record BlocGraphique(List<RepartitionBean> donnees, List<RepartitionBean> echelle) implements Bloc {

        BlocGraphique(List<RepartitionBean> donnees) {
            this(donnees, donnees);
        }
    }

    /** Tranche du tableau employé d'une section — {@code avecEnTeteColonnes} vrai uniquement sur la
     * 1re page de la section (voir {@code isReprintHeaderOnEachPage=false} de l'ancien gabarit,
     * comportement délibérément reconduit : une page de continuation ne réaffiche jamais les
     * en-têtes de colonnes). */
    record BlocTableauEmployes(List<LigneEmployeVue> lignes, boolean avecEnTeteColonnes,
                               boolean avecColonneEquipe) implements Bloc {
    }

    /** Pied de section équipe — tableau récap Fonction/Effectif/STC (toujours) + squelette parc
     * matériel (uniquement si {@code titreMateriel} non {@code null}, voir
     * {@code MaterielChantierCatalogue}). Toujours seul sur sa page OU précédé d'au moins 1 ligne
     * employé — jamais orphelin en haut d'une page vide au-dessus (voir
     * {@link RapportPageModelBuilder#ajouterPagesEquipe}). */
    record BlocRecap(List<RepartitionBean> repartitionFonction, List<MaterielLigneVue> materiel, String titreMateriel) implements Bloc {
    }
}
