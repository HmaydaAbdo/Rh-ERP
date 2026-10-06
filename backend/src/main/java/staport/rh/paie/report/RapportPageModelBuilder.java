package staport.rh.paie.report;

import org.springframework.stereotype.Component;
import staport.rh.paie.reporting.MaterielChantierCatalogue;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

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

    /** Largeur utile d'une page (rapport.css {@code .page}) et titres : un titre de section équipe (12pt + padding +
     * filet, 4 pt de marge à gauche) et un titre de chapitre (16pt + padding + filet) font 20 et 24 pt sur une ligne ;
     * chaque ligne de plus ajoute son interligne (rapport.css {@code line-height}). */
    private static final double LARGEUR_PAGE = 802;
    private static final double EQUIPE_TITRE_HAUTEUR = 20;
    private static final double INTERLIGNE_TITRE_EQUIPE = 15;
    private static final double LARGEUR_TITRE_EQUIPE = LARGEUR_PAGE - 4;
    private static final double TITRE_CHAPITRE_HAUTEUR = 24;
    private static final double INTERLIGNE_TITRE_CHAPITRE = 20;

    /** Rangée de cartes KPI : rubrique « Indicateurs clés » + marge (16), puis des cartes toutes de même taille à
     * tous les niveaux (jusqu'à 7 par rangée) : au moins 66 pt de haut — plus hautes si un texte passe sur plus de
     * lignes (voir {@link #blocKpi}). */
    private static final double KPI_TITRE_HAUTEUR = 16;
    private static final double KPI_CARTE_HAUTEUR = 66;

    /** Hauteur des cartes pour laquelle {@code RapportChartSvgBuilder.HAUTEUR_TOTALE_CHART} a été dimensionnée, au niveau
     * global puis chantier : le graphique cède la place que des cartes plus hautes prennent au-dessus de lui. */
    private static final double KPI_CARTE_REFERENCE_GLOBALE = 50;
    private static final double KPI_CARTE_REFERENCE_CHANTIER = 36;

    /** Cartes KPI (rapport.css {@code .kpi-carte}) : largeur de la carte, marges intérieures + filets (16 + 1),
     * corps/interligne du libellé, espaces entre les lignes et marges haute + basse de la carte. */
    private static final double KPI_LARGEUR_CARTE = 107;
    private static final double KPI_MARGES_HORIZONTALES = 17;
    private static final double KPI_MARGES_VERTICALES = 10;
    private static final double KPI_CORPS_LIBELLE = 7.5;
    private static final double KPI_INTERLIGNE_LIBELLE = 8.5;
    private static final double KPI_ESPACE_VALEUR = 4;
    private static final double KPI_ESPACE_ENTRE_VALEURS = 1;

    /** Titre « Détails » (marge 8 + 12pt). */
    private static final double DETAILS_TITRE_HAUTEUR = 24;

    /** Marge du tableau (8) + en-tête à deux lignes (2 × 16). */
    private static final double TABLEAU_ENTETE_HAUTEUR = 40;

    /** Si moins de lignes que ça tiennent sous le récap, « Détails » démarre sur la page suivante. */
    private static final int MIN_LIGNES_PREMIERE_PAGE = 3;

    /** Hauteur minimale d'une ligne du tableau employé (voir {@code table.employes td/th} dans rapport.css) : une
     * cellule dont le texte passe à la ligne agrandit sa ligne (voir {@link #hauteurLigneEmploye}). */
    private static final double LIGNE_HAUTEUR = 16;

    /** Interlignes des cellules du tableau employé et des récaps — à garder synchronisés avec {@code line-height}
     * dans rapport.css. {@code BORDURES_LIGNE} : épaisseur des filets (0,5 pt de part et d'autre) ajoutée au texte. */
    private static final double INTERLIGNE_EMPLOYE = 12;
    private static final double INTERLIGNE_EMPLOYE_FONCTION = 9.5;
    private static final double INTERLIGNE_EMPLOYE_EQUIPE = 10.5;
    private static final double INTERLIGNE_RECAP = 11;
    private static final double BORDURES_LIGNE = 1;

    /** Marge intérieure horizontale d'une cellule (3 pt de chaque côté pour le tableau employé, 4 pt pour les
     * récaps) + filets : la largeur disponible pour le texte est celle de la colonne moins ces valeurs. */
    private static final double MARGES_CELLULE_EMPLOYE = 7;
    private static final double MARGES_CELLULE_RECAP = 9;

    /** Colonnes du tableau employé : largeur (CSS {@code table.employes col.*}), corps de police, interligne,
     * graisse et valeur affichée. Même ordre que dans {@code PaieReportHtmlBuilder.ajouterTableauEmployes}. */
    private record ColonneEmploye(double largeur, double taille, double interligne, boolean gras,
                                  Function<LigneEmployeVue, String> valeur) {
    }

    private static List<ColonneEmploye> colonnesEmploye(boolean avecColonneEquipe) {
        List<ColonneEmploye> colonnes = new ArrayList<>(List.of(
                new ColonneEmploye(avecColonneEquipe ? 120 : 192, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::nomPrenom),
                new ColonneEmploye(100, 8, INTERLIGNE_EMPLOYE_FONCTION, false, LigneEmployeVue::fonction),
                new ColonneEmploye(65, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::cin),
                new ColonneEmploye(35, 10.5, INTERLIGNE_EMPLOYE, false, l -> String.valueOf(l.joursTravailles())),
                new ColonneEmploye(40, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::joursRecuperationOuvrable),
                new ColonneEmploye(40, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::joursRecuperationDimanche),
                new ColonneEmploye(65, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::salaireMensuel),
                new ColonneEmploye(55, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::primeRoulageOrdinaire),
                new ColonneEmploye(55, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::primeRoulageDimanche),
                new ColonneEmploye(65, 10.5, INTERLIGNE_EMPLOYE, true, LigneEmployeVue::salaireTotal),
                new ColonneEmploye(90, 10.5, INTERLIGNE_EMPLOYE, false, LigneEmployeVue::observation)));
        if (avecColonneEquipe) {
            colonnes.add(new ColonneEmploye(72, 9, INTERLIGNE_EMPLOYE_EQUIPE, false, LigneEmployeVue::equipeReelle));
        }
        return colonnes;
    }

    private static final List<ColonneEmploye> COLONNES_AVEC_EQUIPE = colonnesEmploye(true);
    private static final List<ColonneEmploye> COLONNES_SANS_EQUIPE = colonnesEmploye(false);

    /** Colonne « Fonction » du récap (CSS {@code table.recap.fonction col.libelle}) et colonne libellé du parc
     * matériel ({@code table.recap.materiel col.libelle}), corps 9 pt. */
    private static final double LARGEUR_LIBELLE_FONCTION = 160;
    private static final double LARGEUR_LIBELLE_MATERIEL = 180;
    private static final double CORPS_RECAP = 9;

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

    /** Nombre maximal de chantiers par page dans le graphique « Répartition par chantier » : au-delà, il est
     * réparti sur plusieurs pages, à parts égales. Avec 16 lignes, chacune garde environ 20 pt de hauteur (voir
     * {@code RapportChartSvgBuilder}) : des barres encore lisibles et des valeurs jamais serrées. */
    private static final int MAX_CHANTIERS_PAR_PAGE_GRAPHIQUE = 16;

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
            List<PageModel.Bloc> enteteChantier = blocsChantier(chantier, index);
            List<EquipeBiVue> equipes = chantier.equipes();
            int premiereEquipeSeule = 0;
            if (!chantier.avecDetailEquipe() && !equipes.isEmpty()) {
                // Pas de graphique par équipe : la section « reste » est le chantier entier. Elle suit directement les
                // cartes KPI du chantier, sur la même page, sans répéter son titre ni ses indicateurs.
                ajouterPagesEquipe(pages, chantier, equipes.get(0), enteteChantier, hauteurEnteteChantier(enteteChantier), true);
                premiereEquipeSeule = 1;
            } else {
                pages.add(new PageEnConstruction(niveauTexteChantier(chantier), enteteChantier));
            }
            for (EquipeBiVue equipe : equipes.subList(premiereEquipeSeule, equipes.size())) {
                ajouterPagesEquipe(pages, chantier, equipe, List.of(), 0, false);
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
        PageModel.BlocKpi kpi = blocKpi(cartesKpi(synthese.masse(), synthese.effectif(),
                synthese.masseMoyenneParEmploye(), synthese.stc(), synthese.nombreChantiers()));
        blocs.add(kpi);
        // Le graphique cède la place que des cartes plus hautes que prévu prennent au-dessus de lui
        double hauteurMaxGraphique = RapportChartSvgBuilder.HAUTEUR_TOTALE_CHART
                - (kpi.hauteurCarte() - KPI_CARTE_REFERENCE_GLOBALE);
        List<RepartitionBean> tous = synthese.repartitionChantier();
        List<List<RepartitionBean>> tranches = repartirParPages(tous, hauteurMaxGraphique);
        blocs.add(new PageModel.BlocTitreSection("Répartition par chantier"));
        blocs.add(new PageModel.BlocGraphique(tranches.get(0), tous, hauteurMaxGraphique));
        pages.add(new PageEnConstruction("GLOBAL", blocs));

        for (List<RepartitionBean> suite : tranches.subList(1, tranches.size())) {
            List<PageModel.Bloc> blocsSuite = new ArrayList<>();
            blocsSuite.add(new PageModel.BlocTitreSection("Répartition par chantier (suite)"));
            blocsSuite.add(new PageModel.BlocGraphique(suite, tous, hauteurMaxGraphique));
            pages.add(new PageEnConstruction("GLOBAL", blocsSuite));
        }
    }

    /** Répartit les chantiers (déjà triés par masse décroissante) en tranches de taille presque égale — au plus
     * {@value #MAX_CHANTIERS_PAR_PAGE_GRAPHIQUE} chacune, et dont les lignes (plus hautes quand un nom passe sur
     * plusieurs lignes) tiennent dans {@code hauteurMax} — jamais une page presque vide à la fin. Toujours au moins
     * une tranche. */
    private List<List<RepartitionBean>> repartirParPages(List<RepartitionBean> chantiers, double hauteurMax) {
        double disponible = hauteurMax - RapportChartSvgBuilder.HAUTEUR_ENTETE - RapportChartSvgBuilder.HAUTEUR_LEGENDE;

        // Tranches pleines, remplies dans l'ordre : donnent le nombre minimal de pages
        List<List<RepartitionBean>> remplies = new ArrayList<>();
        int debut = 0;
        do {
            double cumul = 0;
            int fin = debut;
            while (fin < chantiers.size() && fin - debut < MAX_CHANTIERS_PAR_PAGE_GRAPHIQUE) {
                cumul += RapportChartSvgBuilder.hauteurMinimaleLigne(chantiers.get(fin).getLibelle());
                if (cumul > disponible && fin > debut) {
                    break;
                }
                fin++;
            }
            remplies.add(chantiers.subList(debut, fin));
            debut = fin;
        } while (debut < chantiers.size());

        // Même nombre de pages, à parts presque égales, si chacune tient
        int nombrePages = remplies.size();
        List<List<RepartitionBean>> egales = new ArrayList<>();
        debut = 0;
        for (int page = 0; page < nombrePages; page++) {
            int taille = chantiers.size() / nombrePages + (page < chantiers.size() % nombrePages ? 1 : 0);
            List<RepartitionBean> tranche = chantiers.subList(debut, debut + taille);
            double cumul = tranche.stream()
                    .mapToDouble(c -> RapportChartSvgBuilder.hauteurMinimaleLigne(c.getLibelle())).sum();
            if (cumul > disponible && tranche.size() > 1) {
                return remplies;
            }
            egales.add(tranche);
            debut += taille;
        }
        return egales;
    }

    /** Titre de chapitre, cartes KPI et — seulement si le détail par équipe est demandé — graphique de répartition
     * par équipe : le contenu de tête d'un chantier. */
    private List<PageModel.Bloc> blocsChantier(ChantierBiVue chantier, int index) {
        List<PageModel.Bloc> blocs = new ArrayList<>();
        String chapitre = chapitreChantier(index, chantier);
        blocs.add(new PageModel.BlocTitreChapitre(chapitre));
        PageModel.BlocKpi kpi = blocKpi(cartesKpi(chantier.masse(), chantier.effectif(),
                chantier.masseMoyenneParEmploye(), chantier.stc(), null));
        blocs.add(kpi);
        if (chantier.avecDetailEquipe()) {
            // Le graphique cède la place que le titre ou les cartes prennent en plus au-dessus de lui
            double hauteurMaxGraphique = RapportChartSvgBuilder.HAUTEUR_TOTALE_CHART
                    - (hauteurTitreChapitre(chapitre) - TITRE_CHAPITRE_HAUTEUR)
                    - (kpi.hauteurCarte() - KPI_CARTE_REFERENCE_CHANTIER);
            blocs.add(new PageModel.BlocTitreSection("Répartition par équipe"));
            blocs.add(new PageModel.BlocGraphique(chantier.repartitionEquipe(), hauteurMaxGraphique));
        }
        return blocs;
    }

    /** Hauteur des blocs de tête d'un chantier (titre de chapitre + cartes KPI) posés avant la section « reste ». */
    private double hauteurEnteteChantier(List<PageModel.Bloc> blocs) {
        double hauteur = 0;
        for (PageModel.Bloc bloc : blocs) {
            if (bloc instanceof PageModel.BlocTitreChapitre titre) {
                hauteur += hauteurTitreChapitre(titre.texte());
            } else if (bloc instanceof PageModel.BlocKpi kpi) {
                hauteur += hauteurKpi(kpi);
            }
        }
        return hauteur;
    }

    private double hauteurTitreChapitre(String texte) {
        return TITRE_CHAPITRE_HAUTEUR
                + (RapportMesureTexte.lignes(texte, LARGEUR_PAGE, 16, true) - 1) * INTERLIGNE_TITRE_CHAPITRE;
    }

    private double hauteurTitreEquipe(String texte) {
        return EQUIPE_TITRE_HAUTEUR
                + (RapportMesureTexte.lignes(texte, LARGEUR_TITRE_EQUIPE, 12, true) - 1) * INTERLIGNE_TITRE_EQUIPE;
    }

    private double hauteurKpi(PageModel.BlocKpi kpi) {
        return KPI_TITRE_HAUTEUR + kpi.hauteurCarte();
    }

    /** Rangée de cartes KPI dont la hauteur commune est celle de la carte la plus haute (au moins
     * {@value #KPI_CARTE_HAUTEUR} pt) : le texte d'une carte qui dépasse sa largeur passe à la ligne, il n'est jamais
     * tronqué ni ne déborde sur la carte voisine. */
    PageModel.BlocKpi blocKpi(List<CarteKpi> cartes) {
        double largeurTexte = KPI_LARGEUR_CARTE - KPI_MARGES_HORIZONTALES;
        double hauteur = KPI_CARTE_HAUTEUR;
        for (CarteKpi carte : cartes) {
            boolean montant = "montant".equals(carte.classeValeur());
            double corpsValeur = montant ? 10 : 12;
            double interligneValeur = montant ? 11.5 : 13.5;
            double besoin = KPI_MARGES_VERTICALES
                    + KPI_INTERLIGNE_LIBELLE * RapportMesureTexte.lignes(
                            carte.label().toUpperCase(java.util.Locale.ROOT), largeurTexte, KPI_CORPS_LIBELLE, true)
                    + KPI_ESPACE_VALEUR + KPI_ESPACE_ENTRE_VALEURS * (carte.valeurs().size() - 1);
            for (String valeur : carte.valeurs()) {
                besoin += interligneValeur * RapportMesureTexte.lignes(valeur, largeurTexte, corpsValeur, true);
            }
            hauteur = Math.max(hauteur, Math.ceil(besoin));
        }
        return new PageModel.BlocKpi(cartes, hauteur);
    }

    /** Les cartes d'un niveau — les mêmes à tous les niveaux, chacune avec son propre indicateur : masse salariale,
     * masse du mois précédent, évolution (masse en DH et en %, effectif en personnes), effectif, masse moyenne par
     * employé, nombre de chantiers (niveau global seulement : {@code nombreChantiers} non {@code null}) et STC. */
    private List<CarteKpi> cartesKpi(KpiMontantVue masse, KpiEffectifVue effectif, String masseMoyenne, int stc,
                                      Integer nombreChantiers) {
        List<CarteKpi> cartes = new ArrayList<>();
        cartes.add(new CarteKpi("MASSE SALARIALE", masse.valeurCourante() + " DH", "montant"));
        cartes.add(new CarteKpi("MASSE MOIS PRECEDENT", montantAvecDevise(masse.valeurPrecedente()).strip(), "montant"));
        cartes.add(new CarteKpi("ÉVOLUTION", evolution(masse, effectif), "montant"));
        cartes.add(new CarteKpi("EFFECTIF", String.valueOf(effectif.effectifCourant()), "compte"));
        cartes.add(new CarteKpi("MASSE MOYENNE / EMPLOYÉ", masseMoyenne + " DH", "montant"));
        if (nombreChantiers != null) {
            cartes.add(new CarteKpi("CHANTIERS", String.valueOf(nombreChantiers), "compte"));
        }
        cartes.add(new CarteKpi("STC / SORTIES", String.valueOf(stc), "compte"));
        return cartes;
    }

    /** Évolution par rapport au mois précédent : la masse en DH et en %, puis l'effectif en personnes — une seule ligne
     * vide quand il n'y a pas de mois précédent (le libellé de la carte reste). Le pourcentage manque si le montant
     * précédent est nul. */
    private List<String> evolution(KpiMontantVue masse, KpiEffectifVue effectif) {
        if (masse.valeurPrecedente() == null) {
            return List.of("");
        }
        String montant = masse.variationAbsolue() + " DH"
                + (masse.variationPourcent() == null ? "" : " (" + insecable(masse.variationPourcent()) + ")");
        int ecart = effectif.effectifCourant() - effectif.effectifPrecedent();
        String personnes = (ecart > 0 ? "+" : "") + ecart + (Math.abs(ecart) > 1 ? " personnes" : " personne");
        return List.of(montant, personnes);
    }

    /** Remplace les espaces par des espaces insécables : une variation « (-17,9 %) » reste d'un seul tenant, le retour
     * à la ligne se fait avant elle (voir {@link RapportMesureTexte}). */
    private String insecable(String texte) {
        return texte.replace(' ', '\u00A0');
    }

    /** @param blocsEnTete blocs déjà posés en haut de la 1re page de la section (vide en général ; l'en-tête du
     * chantier quand la section « reste » le suit sur la même page), de hauteur {@code hauteurEnTete}
     * @param fusionneeAuChantier vrai pour la section « reste » d'un chantier sans détail par équipe : elle couvre tout
     * le chantier, dont le titre et les cartes KPI sont déjà dans {@code blocsEnTete} — elle ne répète ni son titre ni
     * ses indicateurs et commence directement par le récap.
     *
     * <p>Les lignes des tableaux n'ont pas une hauteur fixe (un texte trop long passe à la ligne, voir
     * {@link #hauteurLigneEmploye}) : tout est découpé d'après la hauteur cumulée des lignes. Le récap par fonction
     * est coupé en tranches quand il ne tient pas sous les cartes KPI : la 1re tranche (avec le parc matériel)
     * remplit la 1re page, les suivantes (« suite ») les pages suivantes. Le tableau « Détails » démarre sous la
     * dernière tranche si assez de lignes y tiennent, sinon sur la page suivante. */
    private void ajouterPagesEquipe(List<PageEnConstruction> pages, ChantierBiVue chantier, EquipeBiVue equipe,
                                    List<PageModel.Bloc> blocsEnTete, double hauteurEnTete, boolean fusionneeAuChantier) {
        String niveau = niveauTexteEquipe(chantier, equipe);
        List<LigneEmployeVue> employes = equipe.employes();
        int total = employes.size();
        boolean avecColonneEquipe = equipe.nom().equals(chantier.code());
        String titreMateriel = MaterielChantierCatalogue.titre(chantier.code(), equipe.nom());

        double utile = PAGE_BODY_HAUTEUR - MARGE_SECURITE;
        double enteteDetails = DETAILS_TITRE_HAUTEUR + TABLEAU_ENTETE_HAUTEUR;

        PageModel.BlocKpi kpiEquipe = fusionneeAuChantier ? null : cartesKpiEquipe(equipe);
        double hauteurTetePremierePage = hauteurEnTete
                + (fusionneeAuChantier ? 0 : hauteurTitreEquipe(equipe.titre()) + hauteurKpi(kpiEquipe));
        List<List<RepartitionBean>> tranchesRecap = decouperRecap(
                equipe.repartitionFonction(),
                utile - hauteurTetePremierePage - RECAP_BASE_HAUTEUR,
                utile - RECAP_BASE_HAUTEUR);

        for (int i = 0; i < tranchesRecap.size(); i++) {
            boolean premiere = i == 0;
            List<PageModel.Bloc> blocs = new ArrayList<>();
            if (premiere) {
                blocs.addAll(blocsEnTete);
                if (!fusionneeAuChantier) {
                    blocs.add(new PageModel.BlocTitreEquipe(equipe.titre()));
                    blocs.add(kpiEquipe);
                }
            }
            List<RepartitionBean> tranche = tranchesRecap.get(i);
            List<MaterielLigneVue> materiel = premiere ? equipe.materiel() : List.of();
            blocs.add(new PageModel.BlocRecap(tranche, materiel, premiere ? titreMateriel : null, !premiere));

            if (i < tranchesRecap.size() - 1) {
                pages.add(new PageEnConstruction(niveau, blocs));
                continue;
            }

            // Dernière page du récap : « Détails » la suit si assez de lignes y tiennent
            double utilise = (premiere ? hauteurTetePremierePage : 0) + hauteurRecap(tranche, materiel);
            int position = lignesQuiTiennent(employes, 0, utile - utilise - enteteDetails, avecColonneEquipe);
            if (position < Math.min(MIN_LIGNES_PREMIERE_PAGE, total)) {
                position = 0;
            }
            if (position > 0) {
                blocs.add(new PageModel.BlocTitreSection("Détails"));
                blocs.add(new PageModel.BlocTableauEmployes(employes.subList(0, position), true, avecColonneEquipe));
            }
            pages.add(new PageEnConstruction(niveau, blocs));

            boolean detailsAFaire = position == 0;
            while (position < total) {
                List<PageModel.Bloc> blocsSuite = new ArrayList<>();
                double disponible = detailsAFaire ? utile - enteteDetails : utile;   // « Détails » ouvre la page, ou suite
                if (detailsAFaire) {
                    blocsSuite.add(new PageModel.BlocTitreSection("Détails"));
                }
                int fin = position + Math.max(1, lignesQuiTiennent(employes, position, disponible, avecColonneEquipe));
                blocsSuite.add(new PageModel.BlocTableauEmployes(employes.subList(position, fin), detailsAFaire, avecColonneEquipe));
                position = fin;
                detailsAFaire = false;
                pages.add(new PageEnConstruction(niveau, blocsSuite));
            }
        }
    }

    /** Nombre de lignes employé, à partir de {@code debut}, qui tiennent dans {@code hauteurDisponible} (0 si la
     * 1re ne tient pas). */
    private int lignesQuiTiennent(List<LigneEmployeVue> employes, int debut, double hauteurDisponible,
                                  boolean avecColonneEquipe) {
        double cumul = 0;
        int nombre = 0;
        for (int i = debut; i < employes.size(); i++) {
            cumul += hauteurLigneEmploye(employes.get(i), avecColonneEquipe);
            if (cumul > hauteurDisponible) {
                break;
            }
            nombre++;
        }
        return nombre;
    }

    /** Hauteur d'une ligne du tableau employé : celle de sa cellule la plus haute (au moins {@value #LIGNE_HAUTEUR}). */
    private double hauteurLigneEmploye(LigneEmployeVue ligne, boolean avecColonneEquipe) {
        double hauteur = LIGNE_HAUTEUR;
        for (ColonneEmploye colonne : avecColonneEquipe ? COLONNES_AVEC_EQUIPE : COLONNES_SANS_EQUIPE) {
            int lignes = RapportMesureTexte.lignes(colonne.valeur().apply(ligne),
                    colonne.largeur() - MARGES_CELLULE_EMPLOYE, colonne.taille(), colonne.gras());
            hauteur = Math.max(hauteur, lignes * colonne.interligne() + BORDURES_LIGNE);
        }
        return hauteur;
    }

    /** Hauteur d'une ligne de récap (fonction ou parc matériel) d'après son libellé. */
    private double hauteurLigneRecap(String libelle, double largeurColonne) {
        int lignes = RapportMesureTexte.lignes(libelle, largeurColonne - MARGES_CELLULE_RECAP, CORPS_RECAP, false);
        return Math.max(RECAP_LIGNE_HAUTEUR, lignes * INTERLIGNE_RECAP + BORDURES_LIGNE);
    }

    /** Hauteur du bloc récap : titre + en-tête, puis le plus haut des deux tableaux côte à côte. */
    private double hauteurRecap(List<RepartitionBean> fonctions, List<MaterielLigneVue> materiel) {
        double hauteurFonctions = fonctions.stream()
                .mapToDouble(f -> hauteurLigneRecap(f.getLibelle(), LARGEUR_LIBELLE_FONCTION)).sum();
        double hauteurMateriel = materiel.stream()
                .mapToDouble(m -> hauteurLigneRecap(m.getLibelle(), LARGEUR_LIBELLE_MATERIEL)).sum();
        return RECAP_BASE_HAUTEUR + Math.max(hauteurFonctions, hauteurMateriel);
    }

    /** Découpe le récap par fonction : la 1re tranche tient sous les cartes KPI ({@code hauteurPremiere}), les
     * suivantes remplissent une page chacune ({@code hauteurSuite}) ; au moins une ligne par tranche. Toujours au
     * moins une tranche (éventuellement vide : le tableau garde alors son en-tête). */
    private List<List<RepartitionBean>> decouperRecap(List<RepartitionBean> lignes, double hauteurPremiere, double hauteurSuite) {
        List<List<RepartitionBean>> tranches = new ArrayList<>();
        int debut = 0;
        double disponible = hauteurPremiere;
        do {
            double cumul = 0;
            int fin = debut;
            while (fin < lignes.size()) {
                cumul += hauteurLigneRecap(lignes.get(fin).getLibelle(), LARGEUR_LIBELLE_FONCTION);
                if (cumul > disponible && fin > debut) {
                    break;
                }
                fin++;
            }
            tranches.add(lignes.subList(debut, fin));
            debut = fin;
            disponible = hauteurSuite;
        } while (debut < lignes.size());
        return tranches;
    }

    private PageModel.BlocKpi cartesKpiEquipe(EquipeBiVue equipe) {
        return blocKpi(cartesKpi(equipe.masse(), equipe.effectif(), equipe.masseMoyenneParEmploye(), equipe.stc(), null));
    }

    /** {@code " <montant> DH"} (espace de tête inclus, pour la concaténation après un libellé), ou chaîne vide
     * quand le montant du mois précédent est introuvable — le libellé reste affiché, sans valeur. */
    private String montantAvecDevise(String montant) {
        return montant == null ? "" : " " + montant + " DH";
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
}
