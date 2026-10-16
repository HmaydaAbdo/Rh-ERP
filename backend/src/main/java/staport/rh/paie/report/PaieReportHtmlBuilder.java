package staport.rh.paie.report;

import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Construit le DOM du rapport PDF de paie — exclusivement par programmation via l'API
 * {@code Element}/{@code Document} de jsoup, JAMAIS par concaténation de chaîne ni template
 * (Thymeleaf ou autre). C'est le choix qui neutralise STRUCTURELLEMENT (pas seulement par
 * discipline) l'incident de production qui avait fait abandonner un premier pipeline HTML pour ce
 * même rapport (2026-09-25, voir {@code docs/report/README.md}) : un commentaire CSS contenant
 * littéralement {@code <tr>}, injecté sans échappement via Thymeleaf {@code th:utext} dans une
 * balise {@code <style>}, avait fait planter le parseur XML strict d'openhtmltopdf
 * ({@code SAXParseException}, "PDF illisible" en production).
 *
 * <p><b>Règle absolue de cette classe, jamais d'exception</b> : toute donnée métier (nom, CIN,
 * observation, identifiants, valeurs formatées...) passe EXCLUSIVEMENT par {@link Element#text}/
 * {@link Element#attr} — jamais par {@code Element.html(String)} (l'équivalent jsoup de
 * {@code th:utext}, qui contourne l'échappement). {@code Element.text(...)} échappe TOUJOURS son
 * argument ; il n'existe aucun chemin dans cette classe où une chaîne provenant d'un enregistrement
 * {@code Paie} atteint le document sans passer par cet échappement. Le CSS lui-même
 * ({@code rapport.css}) est un fichier STATIQUE, jamais interpolé — seul contenu jamais échappé de
 * ce document, via {@link DataNode} (mécanisme jsoup prévu pour le contenu littéral d'une balise
 * {@code <style>}/{@code <script>}), et seulement parce qu'aucune donnée métier ne transite JAMAIS
 * par ce chemin (voir le Javadoc de {@code PaieReportHtmlPdfService}).
 *
 * <p>Ne construit qu'un DOM — aucune décision de pagination ici (voir
 * {@link RapportPageModelBuilder}) : cette classe reçoit des pages déjà entièrement découpées
 * ({@link PageModel}) et se contente de traduire chaque {@link PageModel.Bloc} en éléments
 * HTML/CSS, dans l'ordre où ils apparaissent.
 */
@Component
final class PaieReportHtmlBuilder {

    private final String css;
    private final String logoDataUri;
    private final RapportChartSvgBuilder chartSvgBuilder;
    private final RapportEvolutionSvgBuilder evolutionSvgBuilder;

    PaieReportHtmlBuilder(RapportRessourcesStatiques ressources, RapportChartSvgBuilder chartSvgBuilder,
                          RapportEvolutionSvgBuilder evolutionSvgBuilder) {
        this.css = ressources.css;
        this.logoDataUri = ressources.logoDataUri();
        this.chartSvgBuilder = chartSvgBuilder;
        this.evolutionSvgBuilder = evolutionSvgBuilder;
    }

    /** Largeur (pt) du bloc « niveau » du bandeau, voir rapport.css {@code .page-header .bloc.bloc-niveau}. */
    private static final double LARGEUR_NIVEAU_ENTETE = 436;

    /** Construit le document complet : page de garde puis une page par {@link PageModel}. */
    Document construireDocument(String moisLibelle, String anneeLibelle, String periodeLibelle, List<PageModel> pages) {
        Document doc = documentVide();
        ajouterPageDeGarde(doc, moisLibelle, anneeLibelle);
        for (PageModel page : pages) {
            Element corps = ajouterPageContenu(doc, periodeLibelle, page.niveauTexte(), page.numeroPage(), page.totalPages());
            for (PageModel.Bloc bloc : page.blocs()) {
                ajouterBloc(corps, bloc);
            }
        }
        return doc;
    }

    private void ajouterBloc(Element corps, PageModel.Bloc bloc) {
        if (bloc instanceof PageModel.BlocTitreChapitre b) {
            corps.appendElement("div").addClass("titre-chapitre").text(b.texte());
        } else if (bloc instanceof PageModel.BlocTitreSection b) {
            corps.appendElement("div").addClass("titre-section").text(b.texte());
        } else if (bloc instanceof PageModel.BlocTitreRubrique b) {
            corps.appendElement("div").addClass("titre-section").addClass("rubrique-titre")
                    .text(b.numero() + ". " + b.texte());
        } else if (bloc instanceof PageModel.BlocTitreEquipe b) {
            corps.appendElement("div").addClass("titre-equipe").text(b.texte());
        } else if (bloc instanceof PageModel.BlocKpi b) {
            ajouterCartesKpi(corps, b.cartes(), b.hauteurCarte());
        } else if (bloc instanceof PageModel.BlocGraphique b) {
            chartSvgBuilder.ajouterGraphique(corps, b.donnees(), b.echelle(), b.hauteurMax(), b.partDuTotal());
        } else if (bloc instanceof PageModel.BlocGraphiqueEvolution b) {
            evolutionSvgBuilder.ajouterGraphique(corps, b.donnees(), b.groupe());
        } else if (bloc instanceof PageModel.BlocGraphiqueMateriel b) {
            chartSvgBuilder.ajouterGraphiqueMateriel(corps, b.titre(), b.donnees());
        } else if (bloc instanceof PageModel.BlocTableauEmployes b) {
            ajouterTableauEmployes(corps, b.lignes(), b.avecEnTeteColonnes(), b.avecColonneEquipe());
        } else if (bloc instanceof PageModel.BlocRecap b) {
            ajouterRecap(corps, b.repartitionFonction(), b.materiel(), b.titreMateriel(), b.suite());
        } else {
            throw new IllegalStateException("Type de bloc de page non géré : " + bloc.getClass());
        }
    }

    /** Document vide avec le CSS déjà injecté — jamais de doctype/balises manuelles en chaîne, la
     * structure {@code <html><head><style>...</style></head><body></body></html>} vient de l'API
     * jsoup elle-même ({@link Document#createShell}). */
    private Document documentVide() {
        Document doc = Document.createShell("");
        Element style = doc.head().appendElement("style");
        style.appendChild(new DataNode(css));
        return doc;
    }

    /** Page de garde — aucun bandeau/pied récurrent (comportement JasperReports
     * {@code isTitleNewPage} délibérément reproduit, voir rapport.css {@code .page.cover}). */
    private Element ajouterPageDeGarde(Document doc, String moisLibelle, String anneeLibelle) {
        Element page = nouvellePage(doc, "cover");
        page.appendElement("img").addClass("logo-couverture").attr("src", logoDataUri);
        page.appendElement("div").addClass("titre").text("RAPPORT DE PAIE");
        page.appendElement("div").addClass("filet-titre");
        ajouterBlocIdentite(page, "DÉPARTEMENT", "Ressources Humaines");
        ajouterBlocIdentite(page, "MOIS", moisLibelle);
        ajouterBlocIdentite(page, "ANNÉE", anneeLibelle);
        Element signatures = page.appendElement("div").addClass("signatures");
        ajouterSignature(signatures, "PRÉSIDENT DIRECTEUR GÉNÉRAL", "BARHICH MOHAMED", false);
        ajouterSignature(signatures, "DIRECTEUR GÉNÉRAL ADJOINT", "TROUSSI MOHAMED EL MEHDI", false);
        ajouterSignature(signatures, "DIRECTEUR DES RESSOURCES HUMAINES", "MOUSTAJID ISMAIL", false);
        ajouterSignature(signatures, "DIRECTEUR DES TRAVAUX", "BRAHIM SOUKRAT", true);

        page.appendElement("div").addClass("tagline")
                .text("STAPORT S.A — Société de travaux d'assainissement, ponts et routes");
        return page;
    }

    private void ajouterBlocIdentite(Element parent, String label, String valeur) {
        Element bloc = parent.appendElement("div").addClass("bloc-identite");
        bloc.appendElement("div").addClass("label").text(label);
        bloc.appendElement("div").addClass("valeur").text(valeur);
    }

    private void ajouterSignature(Element parent, String role, String nom, boolean derniere) {
        Element signature = parent.appendElement("div").addClass("signature");
        if (derniere) {
            signature.addClass("derniere");
        }
        signature.appendElement("div").addClass("role").text(role);
        signature.appendElement("div").addClass("nom").text(nom);
        signature.appendElement("div").addClass("filet");
        signature.appendElement("div").addClass("legende").text("Signature");
    }

    /** Page de contenu (bandeau + pied récurrents déjà posés) — retourne le conteneur
     * {@code .page-body} vide, à remplir bloc par bloc (voir {@link #ajouterBloc}). */
    private Element ajouterPageContenu(Document doc, String periodeLibelle, String niveauTexte, int numeroPage, int totalPages) {
        Element page = nouvellePage(doc, null);
        ajouterEntete(page, periodeLibelle, niveauTexte);
        Element corps = page.appendElement("div").addClass("page-body");
        ajouterPied(page, niveauTexte, numeroPage, totalPages);
        return corps;
    }

    private Element nouvellePage(Document doc, String classeSupplementaire) {
        Element page = doc.body().appendElement("div").addClass("page");
        if (classeSupplementaire != null) {
            page.addClass(classeSupplementaire);
        }
        return page;
    }

    private void ajouterEntete(Element page, String periodeLibelle, String niveauTexte) {
        Element entete = page.appendElement("div").addClass("page-header");
        entete.appendElement("img").addClass("logo").attr("src", logoDataUri);
        entete.appendElement("div").addClass("separateur").addClass("s1");
        entete.appendElement("div").addClass("bloc").addClass("b1").text("Ressources Humaines");
        entete.appendElement("div").addClass("separateur").addClass("s2");
        entete.appendElement("div").addClass("bloc").addClass("b2").text("Paie " + periodeLibelle);
        entete.appendElement("div").addClass("separateur").addClass("s3");
        int lignesNiveau = RapportMesureTexte.lignes(niveauTexte, LARGEUR_NIVEAU_ENTETE, 9, true);
        entete.appendElement("div").addClass("bloc").addClass("bloc-niveau")
                .addClass("lignes-" + Math.min(lignesNiveau, 4)).text(niveauTexte);
        entete.appendElement("div").addClass("filet");
    }

    private void ajouterPied(Element page, String niveauTexte, int numeroPage, int totalPages) {
        Element pied = page.appendElement("div").addClass("page-footer");
        pied.appendElement("div").addClass("niveau").text(niveauTexte);
        pied.appendElement("div").addClass("pagination").text("Page " + numeroPage + " / " + totalPages);
    }

    /** Une rangée de cartes KPI — {@code niveauClasse} pilote la taille/l'écart CSS ("global",
     * "chantier" ou "equipe", voir rapport.css) ; {@code classeValeur} de chaque carte pilote la
     * taille de police de sa valeur ("compte" ou "montant", voir rapport.css) ; {@code hauteurCarte} est la hauteur
     * commune des cartes de la rangée (voir {@link PageModel.BlocKpi}). */
    private void ajouterCartesKpi(Element pageBody, List<CarteKpi> cartes, double hauteurCarte) {
        pageBody.appendElement("div").addClass("titre-indicateurs").text("Indicateurs clés");
        Element ligne = pageBody.appendElement("div").addClass("kpi-row");
        for (int i = 0; i < cartes.size(); i++) {
            CarteKpi carte = cartes.get(i);
            Element carteEl = ligne.appendElement("div").addClass("kpi-carte")
                    .attr("style", "height: " + hauteurCarte + "pt");
            if (i == cartes.size() - 1) {
                carteEl.addClass("derniere");
            }
            carteEl.appendElement("div").addClass("label").text(carte.label());
            carteEl.appendElement("div").addClass("valeur").addClass(carte.classeValeur()).text(carte.valeur());
            if (carte.sousTexte() != null) {
                carteEl.appendElement("div").addClass("sous-texte").text(carte.sousTexte());
            }
        }
    }

    /** Tableau employé (12 colonnes fixes, voir rapport.css {@code table.employes}) —
     * {@code avecEnTeteColonnes} vrai uniquement sur la 1re page d'une section (voir
     * {@link PageModel.BlocTableauEmployes}). Chaque cellule passe par {@code .text(...)},
     * jamais {@code .html(...)} — voir le Javadoc de la classe. */
    private void ajouterTableauEmployes(Element corps, List<LigneEmployeVue> lignes,
                                        boolean avecEnTeteColonnes, boolean avecColonneEquipe) {
        Element table = corps.appendElement("table").addClass("employes");
        if (!avecColonneEquipe) {
            table.addClass("sans-equipe");
        }
        List<String> classesColonnes = new java.util.ArrayList<>(List.of("nom-prenom", "fonction", "cin", "jours-p", "jours-jro", "jours-jrd",
                "salaire", "salaire-ro", "salaire-rd", "total", "obs"));
        if (avecColonneEquipe) {
            classesColonnes.add("equipe");
        }
        for (String classeColonne : classesColonnes) {
            table.appendElement("col").addClass(classeColonne);
        }
        if (avecEnTeteColonnes) {
            ajouterEnTeteTableauEmployes(table, avecColonneEquipe);
        }
        Element corpsTable = table.appendElement("tbody");
        for (LigneEmployeVue ligne : lignes) {
            Element tr = corpsTable.appendElement("tr");
            tr.appendElement("td").addClass("nom-prenom").text(ligne.nomPrenom());
            tr.appendElement("td").addClass("fonction").text(ligne.fonction());
            tr.appendElement("td").addClass("cin").text(ligne.cin());
            tr.appendElement("td").addClass("jours-p").text(PaieReportNumberFormat.quantite(ligne.joursTravailles()));
            tr.appendElement("td").addClass("jours-jro").text(ligne.joursRecuperationOuvrable());
            tr.appendElement("td").addClass("jours-jrd").text(ligne.joursRecuperationDimanche());
            tr.appendElement("td").addClass("salaire").text(ligne.salaireMensuel());
            tr.appendElement("td").addClass("salaire-ro").text(ligne.primeRoulageOrdinaire());
            tr.appendElement("td").addClass("salaire-rd").text(ligne.primeRoulageDimanche());
            tr.appendElement("td").addClass("total").text(ligne.salaireTotal());
            tr.appendElement("td").addClass("obs").text(ligne.observation());
            if (avecColonneEquipe) {
                tr.appendElement("td").addClass("equipe").text(ligne.equipeReelle());
            }
        }
    }

    private void ajouterEnTeteTableauEmployes(Element table, boolean avecColonneEquipe) {
        Element thead = table.appendElement("thead");
        Element ligne1 = thead.appendElement("tr");
        ligne1.appendElement("th").attr("rowspan", "2").text("Nom et prénom");
        ligne1.appendElement("th").attr("rowspan", "2").text("Fonction");
        ligne1.appendElement("th").attr("rowspan", "2").text("CIN");
        ligne1.appendElement("th").attr("colspan", "3").text("Nbre jrs");
        ligne1.appendElement("th").attr("colspan", "3").text("Salaire");
        ligne1.appendElement("th").attr("rowspan", "2").text("Total");
        ligne1.appendElement("th").attr("rowspan", "2").text("Obs");
        if (avecColonneEquipe) {
            ligne1.appendElement("th").attr("rowspan", "2").text("Équipe");
        }
        Element ligne2 = thead.appendElement("tr");
        ligne2.appendElement("th").text("P");
        ligne2.appendElement("th").text("J.R.O");
        ligne2.appendElement("th").text("J.R.D");
        ligne2.appendElement("th").text("Salaire");
        ligne2.appendElement("th").text("RO");
        ligne2.appendElement("th").text("RD");
    }

    /** Tableau récap des sections fusionnées ; les équipes sélectionnées utilisent des graphiques dédiés. */
    private void ajouterRecap(Element corps, List<RepartitionBean> repartitionFonction, List<MaterielLigneVue> materiel,
                              String titreMateriel, boolean suite) {
        Element ligne = corps.appendElement("div").addClass("recap-row");

        Element blocFonction = ligne.appendElement("div").addClass("recap-bloc");
        if (titreMateriel == null) {
            blocFonction.addClass("derniere");
        }
        blocFonction.appendElement("div").addClass("titre-recap").text(suite ? "Répartition par fonction (suite)" : "Répartition par fonction");
        Element tableFonction = blocFonction.appendElement("table").addClass("recap").addClass("fonction");
        tableFonction.appendElement("col").addClass("libelle");
        tableFonction.appendElement("col").addClass("effectif");
        tableFonction.appendElement("col").addClass("stc-personnes");
        tableFonction.appendElement("col").addClass("stc-montant");
        Element theadFonction = tableFonction.appendElement("thead").appendElement("tr");
        theadFonction.appendElement("th").text("FONCTION");
        theadFonction.appendElement("th").text("EFFECTIF");
        theadFonction.appendElement("th").text("STC (PERS.)");
        theadFonction.appendElement("th").text("STC (DH)");
        Element tbodyFonction = tableFonction.appendElement("tbody");
        for (RepartitionBean ligneRecap : repartitionFonction) {
            Element tr = tbodyFonction.appendElement("tr");
            tr.appendElement("td").addClass("libelle").text(ligneRecap.getLibelle());
            tr.appendElement("td").addClass("effectif").text(String.valueOf(ligneRecap.getEffectif()));
            tr.appendElement("td").addClass("stc-personnes").text(String.valueOf(ligneRecap.getStc()));
            tr.appendElement("td").addClass("stc-montant").text(PaieReportNumberFormat.montant(ligneRecap.getStcMontant()));
        }

        if (titreMateriel != null) {
            Element blocMateriel = ligne.appendElement("div").addClass("recap-bloc").addClass("derniere");
            blocMateriel.appendElement("div").addClass("titre-recap").text("Parc matériel");
            Element tableMateriel = blocMateriel.appendElement("table").addClass("recap").addClass("materiel");
            tableMateriel.appendElement("col").addClass("libelle");
            tableMateriel.appendElement("col").addClass("nbre");
            Element theadMateriel = tableMateriel.appendElement("thead").appendElement("tr");
            theadMateriel.appendElement("th").text(titreMateriel);
            theadMateriel.appendElement("th").text("Nbre");
            Element tbodyMateriel = tableMateriel.appendElement("tbody");
            for (MaterielLigneVue ligneMateriel : materiel) {
                Element tr = tbodyMateriel.appendElement("tr");
                tr.appendElement("td").addClass("libelle").text(ligneMateriel.getLibelle());
                tr.appendElement("td").addClass("nbre").text(ligneMateriel.getNombre() == null ? "" : String.valueOf(ligneMateriel.getNombre()));
            }
        }
    }
}
