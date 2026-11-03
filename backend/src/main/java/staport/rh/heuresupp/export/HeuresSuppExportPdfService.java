package staport.rh.heuresupp.export;

import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.heuresupp.audit.PerimetreExportPdfHeuresSupp;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.imports.HeuresSuppImportException;
import staport.rh.heuresupp.mappers.HeuresSuppMapper;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.heuresupp.specifications.HeuresSuppSpecification;
import staport.rh.paie.report.PaieReportHtmlPdfService;
import staport.rh.paie.report.RapportRessourcesStatiques;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Rapport PDF des heures supplémentaires : mêmes filtres, même recherche et même tri que la vue Tabulaire, sur toutes
 * les lignes du périmètre. Même moteur (openhtmltopdf), même police et même bandeau que le rapport de paie ; les
 * pagination est faite par le moteur (le tableau s'écoule, sans nombre de lignes fixé) et le DOM est construit par jsoup, sans jamais interpréter de HTML
 * issu des données (tout passe par {@code text(...)}).
 */
@Service
public class HeuresSuppExportPdfService {

    static final int LIGNES_MAX = 5000;
    private static final String CHEMIN_CSS = "report/heures-supp/rapport.css";

    /** Colonnes de la vue Tabulaire (propriété triable) : seul ce tri est accepté, comme à l'écran. */
    private static final Map<String, String> TRIS = Map.ofEntries(
            Map.entry("periode", "Mois"), Map.entry("chantier.code", "Chantier"), Map.entry("employee.nomPrenom", "Employé"),
            Map.entry("employee.cin", "CIN"), Map.entry("fonction.libelle", "Fonction"), Map.entry("salaireReference", "Salaire référence"),
            Map.entry("salaireHoraire", "S/H"), Map.entry("heures", "P/H"), Map.entry("montant", "Montant"), Map.entry("stcDh", "STC"),
            Map.entry("forfait", "Forfait"), Map.entry("netAPayer", "Net à payer"));

    private final HeuresSuppRepository repository;
    private final HeuresSuppMapper mapper;
    private final RapportRessourcesStatiques ressources;
    private final PaieReportHtmlPdfService rendu;
    private final String css;

    public HeuresSuppExportPdfService(HeuresSuppRepository repository, HeuresSuppMapper mapper,
                                      RapportRessourcesStatiques ressources, PaieReportHtmlPdfService rendu) {
        this.repository = repository;
        this.mapper = mapper;
        this.ressources = ressources;
        this.rendu = rendu;
        try {
            this.css = new String(new ClassPathResource(CHEMIN_CSS).getContentAsByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Feuille de style du rapport des heures supplémentaires introuvable.", e);
        }
    }

    @Transactional(readOnly = true)
    @AuditableAction(action = "HEURES_SUP_EXPORT_PDF", categorie = CategorieAudit.ACCES, perimetre = PerimetreExportPdfHeuresSupp.class)
    public byte[] generer(HeuresSuppExportRequestDto requete) {
        Sort tri = trier(requete.tri());
        List<HeureSuppResponseDto> lignes = repository.findAll(HeuresSuppSpecification.rechercher(requete.criteres()), tri)
                .stream().map(mapper::toDto).toList();
        if (lignes.size() > LIGNES_MAX) {
            throw new HeuresSuppImportException("L'export dépasse " + LIGNES_MAX + " lignes. Affinez les filtres (mois, chantier, employé) avant d'exporter.");
        }
        return rendu.rendre(construire(requete, lignes));
    }

    static Sort trier(String tri) {
        Sort.Order parNom = Sort.Order.asc("employee.nomPrenom");
        Sort.Order parId = Sort.Order.asc("id");
        if (tri == null || tri.isBlank()) {
            return Sort.by(Sort.Order.desc("periode"), parNom, parId);
        }
        String[] parties = tri.split(",", -1);
        String propriete = parties[0].trim();
        boolean sensValide = parties.length == 1 || (parties.length == 2 && parties[1].trim().matches("(?i)asc|desc"));
        if (!TRIS.containsKey(propriete) || !sensValide) {
            throw new HeuresSuppImportException("Tri non pris en charge pour l'export : " + tri);
        }
        boolean decroissant = parties.length == 2 && parties[1].trim().equalsIgnoreCase("desc");
        return Sort.by(new Sort.Order(decroissant ? Sort.Direction.DESC : Sort.Direction.ASC, propriete), parNom, parId);
    }

    private Document construire(HeuresSuppExportRequestDto requete, List<HeureSuppResponseDto> lignes) {
        Document doc = Document.createShell("");
        doc.head().appendElement("style").appendChild(new DataNode(css));
        String titre = "Heures supplémentaires" + (requete.moisDemandes().isEmpty() ? "" : " — " + requete.moisDemandes().stream().map(HeuresSuppExportPdfService::moisEnToutesLettres).collect(java.util.stream.Collectors.joining(", ")));
        String contexte = contexte(requete, lignes);
        List<String[]> filtres = filtres(requete, lignes);

        // Bandeau et pied sont des éléments « running » repris sur chaque page par les marges de @page ; le tableau, lui, s'écoule
        // naturellement : chaque ligne prend la place dont elle a besoin et le moteur coupe les pages (en-tête de colonnes répété).
        entete(doc.body(), titre, contexte, filtres);
        doc.body().appendElement("div").addClass("pied")
                .text("Édité le " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE)));
        Element table = doc.body().appendElement("table").addClass("heures");
        enteteTableau(table);
        Element corps = table.appendElement("tbody");
        for (HeureSuppResponseDto ligne : lignes) {
            ligne(corps.appendElement("tr"), ligne);
        }
        // La dernière ligne du tableau porte les totaux du périmètre.
        ligneTotaux(corps.appendElement("tr"), totaux(lignes));
        return doc;
    }

    private void entete(Element parent, String titre, String contexte, List<String[]> filtres) {
        Element entete = parent.appendElement("div").addClass("page-header");
        entete.appendElement("img").addClass("logo").attr("src", ressources.logoDataUri());
        entete.appendElement("div").addClass("sep").addClass("s1");
        entete.appendElement("div").addClass("bloc").addClass("b1").text("Ressources Humaines");
        entete.appendElement("div").addClass("sep").addClass("s2");
        Element bloc = entete.appendElement("div").addClass("bloc").addClass("b2");
        bloc.appendElement("span").text(titre);
        bloc.appendElement("span").addClass("contexte").text(contexte);
        if (!filtres.isEmpty()) {
            entete.appendElement("div").addClass("sep").addClass("s3");
            Element zone = entete.appendElement("div").addClass("filtres");
            for (String[] filtre : filtres) {
                Element ligne = zone.appendElement("div");
                ligne.appendElement("span").addClass("lib").text(filtre[0]);
                ligne.appendElement("span").text(filtre[1]);
            }
        }
        entete.appendElement("div").addClass("filet");
    }

    private void enteteTableau(Element table) {
        String[][] colonnes = {{"Mois", ""}, {"Chantier", ""}, {"Employé", ""}, {"CIN", ""}, {"Fonction", ""}, {"Salaire réf.", "num"},
                {"S/H", "num"}, {"P/H", "num"}, {"Montant", "num"}, {"STC", "num"}, {"Forfait", "num"}, {"Net à payer", "num"}, {"Émargement", ""}};
        Element tr = table.appendElement("thead").appendElement("tr");
        for (String[] colonne : colonnes) {
            Element th = tr.appendElement("th").text(colonne[0]);
            if (!colonne[1].isEmpty()) {
                th.addClass(colonne[1]);
            }
        }
    }

    private void ligne(Element tr, HeureSuppResponseDto l) {
        tr.appendElement("td").text(String.valueOf(l.periode()));
        tr.appendElement("td").text(l.codeChantier() + " · " + l.chantier());
        tr.appendElement("td").text(l.nomPrenom());
        tr.appendElement("td").text(l.cin());
        tr.appendElement("td").text(l.fonction());
        nombre(tr, l.salaireReferenceDh(), 2);
        nombre(tr, l.salaireHoraireDh(), 0);
        nombre(tr, l.heuresSupplementaires(), 1);
        nombre(tr, l.montantDh(), 0);
        nombre(tr, l.stcDh(), 0);
        nombre(tr, l.forfaitDh(), 0);
        nombre(tr, l.netAPayerDh(), 0);
        tr.appendElement("td").addClass("emargement");
    }

    private void ligneTotaux(Element tr, Totaux t) {
        tr.addClass("total");
        tr.appendElement("td").attr("colspan", "5").text("Total · " + t.lignes() + (t.lignes() > 1 ? " lignes" : " ligne"));
        tr.appendElement("td").addClass("num");
        tr.appendElement("td").addClass("num");
        nombre(tr, t.heures(), 1);
        nombre(tr, t.montant(), 0);
        nombre(tr, t.stc(), 0);
        nombre(tr, t.forfait(), 0);
        nombre(tr, t.net(), 0);
        tr.appendElement("td");
    }

    private record Totaux(int lignes, BigDecimal heures, BigDecimal montant, BigDecimal stc, BigDecimal forfait, BigDecimal net) {
    }

    private Totaux totaux(List<HeureSuppResponseDto> lignes) {
        BigDecimal heures = BigDecimal.ZERO;
        BigDecimal montant = BigDecimal.ZERO;
        BigDecimal stc = BigDecimal.ZERO;
        BigDecimal forfait = BigDecimal.ZERO;
        BigDecimal net = BigDecimal.ZERO;
        for (HeureSuppResponseDto l : lignes) {
            heures = heures.add(l.heuresSupplementaires() == null ? BigDecimal.ZERO : l.heuresSupplementaires());
            montant = montant.add(l.montantDh());
            stc = stc.add(l.stcDh());
            forfait = forfait.add(l.forfaitDh() == null ? BigDecimal.ZERO : l.forfaitDh());
            net = net.add(l.netAPayerDh());
        }
        return new Totaux(lignes.size(), heures, montant, stc, forfait, net);
    }

    private static String moisEnToutesLettres(YearMonth mois) {
        return mois.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.FRANCE));
    }

    /** Sous le titre : le contenu du document et son ordre de lecture (le mois est dans le titre, les montants dans les totaux). */
    private String contexte(HeuresSuppExportRequestDto r, List<HeureSuppResponseDto> lignes) {
        if (lignes.isEmpty()) {
            return "Aucune ligne pour ce périmètre.";
        }
        long employes = lignes.stream().map(HeureSuppResponseDto::employeeId).distinct().count();
        boolean trie = r.tri() != null && !r.tri().isBlank();
        String propriete = trie ? r.tri().split(",")[0].trim() : "periode";
        boolean decroissant = !trie || r.tri().toLowerCase(Locale.ROOT).endsWith(",desc");
        return lignes.size() + (lignes.size() > 1 ? " lignes" : " ligne") + " · " + employes + (employes > 1 ? " employés" : " employé")
                + " · classées par " + TRIS.getOrDefault(propriete, "Mois").toLowerCase(Locale.FRANCE) + (decroissant ? " décroissant" : " croissant");
    }

    /** Zone de droite : uniquement les filtres réellement appliqués, un par ligne ; un filtre absent n'est pas mentionné. */
    private List<String[]> filtres(HeuresSuppExportRequestDto r, List<HeureSuppResponseDto> lignes) {
        List<String[]> filtres = new ArrayList<>();
        if (r.nomPrenom() != null && !r.nomPrenom().isBlank()) {
            filtres.add(new String[] {"Nom", r.nomPrenom().trim()});
        }
        if (r.cin() != null && !r.cin().isBlank()) {
            filtres.add(new String[] {"CIN", r.cin().trim()});
        }
        if (r.chantierIds() != null && !r.chantierIds().isEmpty()) {
            filtres.add(new String[] {"Chantiers", liste(lignes.stream().map(HeureSuppResponseDto::codeChantier).distinct().sorted().toList(), "chantiers")});
        }
        if (r.equipeIds() != null && !r.equipeIds().isEmpty()) {
            filtres.add(new String[] {"Équipes", r.equipeIds().size() + (r.equipeIds().size() > 1 ? " équipes" : " équipe")});
        }
        if (r.fonctionIds() != null && !r.fonctionIds().isEmpty()) {
            filtres.add(new String[] {"Fonctions", liste(lignes.stream().map(HeureSuppResponseDto::fonction).distinct().sorted().toList(), "fonctions")});
        }
        return filtres;
    }

    private static String liste(List<String> valeurs, String pluriel) {
        return valeurs.size() <= 3 ? String.join(", ", valeurs) : valeurs.size() + " " + pluriel;
    }

    private static void nombre(Element tr, BigDecimal valeur, int decimales) {
        Element td = tr.appendElement("td").addClass("num");
        if (valeur == null) {
            td.text("—");
            return;
        }
        DecimalFormatSymbols symboles = new DecimalFormatSymbols(Locale.FRANCE);
        symboles.setGroupingSeparator(' ');
        symboles.setDecimalSeparator(',');
        String motif = decimales == 0 ? "#,##0" : "#,##0." + "0".repeat(decimales);
        td.text(new DecimalFormat(motif, symboles).format(valeur));
    }
}
