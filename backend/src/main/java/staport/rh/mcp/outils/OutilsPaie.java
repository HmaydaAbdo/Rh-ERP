package staport.rh.mcp.outils;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static staport.rh.mcp.outils.OutilDefini.enumeration;
import static staport.rh.mcp.outils.OutilDefini.limite;
import static staport.rh.mcp.outils.OutilDefini.liste;
import static staport.rh.mcp.outils.OutilDefini.nombre;
import static staport.rh.mcp.outils.OutilDefini.objetLibre;
import static staport.rh.mcp.outils.OutilDefini.outil;
import static staport.rh.mcp.outils.OutilDefini.texte;

/**
 * Outils Paie en plus de {@code paie_indicateurs} : mois importés, répartition, évolution, mouvements d'effectif,
 * qualité des données, recherche de bulletins et préparation du rapport. Chiffres issus des façades de la Paie.
 */
public final class OutilsPaie {

    private static final int MOIS = 36;
    private static final int GROUPES = 50;
    private static final int BULLETINS = 20;
    /** Sens de chaque chiffre de {@code paie_mouvements}, rendu avec lui pour que la réponse le cite (docs/ia.md, T2.7). */
    private static final Map<String, String> DEFINITIONS_MOUVEMENTS = Map.of(
            "effectif", "Employés payés dans le mois (un bulletin)",
            "effectifMoisPrecedent", "Employés payés le mois précédent ; absent si ce mois n'a pas de paie",
            "variation", "Effectif du mois moins effectif du mois précédent (écart net)",
            "entrees", "Employés payés ce mois-ci et absents de la paie du mois précédent",
            "plusPayes", "Employés payés le mois précédent et absents de la paie de ce mois",
            "sorties", "Départs enregistrés sur la fiche employé dans le mois, parmi les payés du mois ou du précédent",
            "mutations", "Employés payés les deux mois, sur un chantier différent");

    private OutilsPaie() {
    }

    public static List<OutilLecture> catalogue(IPaieService paie, IPaieAnalytiqueService analytique,
                                               IPaieEffectifsService effectifs, IAuditOutilsAgent audit) {
        return List.of(
                outil("paie_periodes")
                        .description("Mois de paie importés, du plus récent au plus ancien (" + MOIS + " au plus), avec "
                                + "bulletins, chantiers, masse et STC de chacun, sur un périmètre.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of("limite", limite(12, MOIS))))
                        .sortie(Map.of("nombreMois", nombre(), "periodes", liste(), "vue", OutilLecture.vueProposee()),
                                "nombreMois", "periodes", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            List<PaiePeriodeResumeDto> periodes = paie.findPeriodes(p.criteres(null));
                            List<Map<String, Object>> rendues = periodes.stream()
                                    .limit(arguments.entier("limite", 12, 1, MOIS)).map(OutilsPaie::periode).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("nombreMois", periodes.size());
                            donnees.put("periodes", rendues);
                            donnees.put("vue", new VueProposeeDto("paie", "cartes", p.parametres(null)).enJson());
                            return new OutilLecture.Resultat(donnees, periodes.size() + " mois de paie importés.",
                                    rendues.size(), p.audit(null));
                        })
                        .construire(audit),
                outil("paie_repartition")
                        .description("Répartition de la paie d'un mois par chantier, équipe ou fonction (masse, effectif, "
                                + "STC), de la plus grosse masse à la plus petite ; " + GROUPES + " groupes au plus.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of(
                                "periode", OutilLecture.periode(),
                                "dimension", enumeration("Regroupement", "CHANTIER", "EQUIPE", "FONCTION"),
                                "limite", limite(GROUPES, GROUPES))))
                        .sortie(Map.of("periode", Map.of("type", "string"), "dimension", Map.of("type", "string"),
                                "nombreGroupes", nombre(), "groupes", liste(), "vue", OutilLecture.vueProposee()),
                                "periode", "dimension", "nombreGroupes", "groupes", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            YearMonth periode = periodeOuDerniere(paie, arguments);
                            String dimension = arguments.texte("dimension")
                                    .orElseThrow(() -> OutilLecture.invalide("« dimension » est obligatoire."));
                            PaieAnalytiqueDto resultat = analytique.analyser(p.criteres(periode));
                            List<Map<String, Object>> groupes = switch (dimension) {
                                case "CHANTIER" -> resultat.parChantier().stream()
                                        .map(c -> groupe(c.id(), c.code(), c.libelle(), c.masse(), c.effectif(), c.stc(), c.stcMontant())).toList();
                                case "EQUIPE" -> resultat.parEquipe().stream()
                                        .map(e -> groupe(e.id(), e.code(), e.libelle(), e.masse(), e.effectif(), e.stc(), e.stcMontant())).toList();
                                default -> resultat.parFonction().stream()
                                        .map(f -> groupe(f.id(), null, f.libelle(), f.masse(), f.effectif(), f.stc(), f.stcMontant())).toList();
                            };
                            List<Map<String, Object>> rendus = groupes.stream().limit(arguments.entier("limite", GROUPES, 1, GROUPES)).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("periode", periode.toString());
                            donnees.put("dimension", dimension);
                            donnees.put("nombreGroupes", groupes.size());
                            donnees.put("groupes", rendus);
                            donnees.put("vue", new VueProposeeDto("paie", "analytique", p.parametres(periode)).enJson());
                            Map<String, Object> journal = p.audit(periode);
                            journal.put("dimension", dimension);
                            return new OutilLecture.Resultat(donnees, groupes.size() + " groupe(s) en " + periode + ".",
                                    rendus.size(), journal);
                        })
                        .construire(audit),
                outil("paie_evolution")
                        .description("Évolution mensuelle de la paie d'un périmètre (masse, effectif payé, STC), du mois le "
                                + "plus ancien au plus récent, jusqu'au mois donné ; " + MOIS + " mois au plus.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of("periode", OutilLecture.periode(), "limite", limite(12, MOIS))))
                        .sortie(Map.of("mois", liste(), "vue", OutilLecture.vueProposee()), "mois", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            YearMonth derniere = periodeOuDerniere(paie, arguments);
                            // L'évolution couvre tout l'historique du périmètre : on la borne au mois demandé (aaaa-MM se compare en texte).
                            List<PaieAnalytiqueDto.Evolution> evolution = analytique.analyser(p.criteres(derniere)).evolution().stream()
                                    .filter(e -> e.periode().compareTo(derniere.toString()) <= 0).toList();
                            int limite = arguments.entier("limite", 12, 1, MOIS);
                            List<Map<String, Object>> mois = evolution.subList(Math.max(0, evolution.size() - limite), evolution.size())
                                    .stream().map(e -> {
                                        Map<String, Object> valeurs = new LinkedHashMap<>();
                                        valeurs.put("periode", e.periode());
                                        valeurs.put("masse", e.masse());
                                        valeurs.put("effectif", e.effectif());
                                        valeurs.put("stc", e.stc());
                                        valeurs.put("stcMontant", e.stcMontant());
                                        return valeurs;
                                    }).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("mois", mois);
                            donnees.put("vue", new VueProposeeDto("paie", "analytique", p.parametres(derniere)).enJson());
                            return new OutilLecture.Resultat(donnees, mois.size() + " mois d'évolution.", mois.size(), p.audit(null));
                        })
                        .construire(audit),
                outil("paie_mouvements")
                        .description("Mouvements d'effectif mois par mois selon la paie : employés payés, effectif du mois "
                                + "précédent et écart net, entrées (payés ce mois-ci, absents du mois précédent), employés "
                                + "plus payés, départs enregistrés, mutations, sur un périmètre (chantier, équipe, fonction "
                                + "du bulletin du mois). Chaque chiffre a sa définition dans « definitions ». Un mois précis, "
                                + "ou les " + MOIS + " derniers au plus.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of("periode", OutilLecture.periode(), "limite", limite(12, MOIS))))
                        .sortie(Map.of("mois", liste(), "definitions", objetLibre(), "vue", OutilLecture.vueProposee()),
                                "mois", "definitions", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            List<EffectifMoisDto> tendances = effectifs.tendances(
                                    new EffectifsCriteria(p.chantiers(), p.fonctions(), p.equipes()));
                            YearMonth periode = arguments.periode("periode").orElse(null);
                            List<EffectifMoisDto> retenus = periode != null
                                    ? tendances.stream().filter(m -> m.periode().equals(periode)).toList()
                                    : tendances.subList(Math.max(0, tendances.size() - arguments.entier("limite", 12, 1, MOIS)), tendances.size());
                            // Effectif payé de chaque mois, pour donner au modèle l'écart net sans qu'il le calcule.
                            Map<YearMonth, Long> payesParMois = new HashMap<>();
                            tendances.forEach(m -> payesParMois.put(m.periode(), m.effectif()));
                            List<Map<String, Object>> mois = retenus.stream().map(m -> {
                                Long precedent = payesParMois.get(m.periode().minusMonths(1));
                                Map<String, Object> valeurs = new LinkedHashMap<>();
                                valeurs.put("periode", m.periode().toString());
                                valeurs.put("effectif", m.effectif());
                                valeurs.put("effectifMoisPrecedent", precedent);
                                valeurs.put("variation", precedent == null ? null : m.effectif() - precedent);
                                valeurs.put("entrees", m.entrees());
                                // Payés le mois précédent, absents de ce mois : précédent + entrées − effectif.
                                valeurs.put("plusPayes", precedent == null || m.entrees() == null
                                        ? null : precedent + m.entrees() - m.effectif());
                                valeurs.put("sorties", m.sorties());
                                valeurs.put("mutations", m.mutations());
                                return valeurs;
                            }).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("mois", mois);
                            donnees.put("definitions", DEFINITIONS_MOUVEMENTS);
                            donnees.put("vue", new VueProposeeDto("employees", "analytique", p.parametres(periode)).enJson());
                            return new OutilLecture.Resultat(donnees, mois.size() + " mois de mouvements.", mois.size(), p.audit(periode));
                        })
                        .construire(audit),
                outil("paie_qualite")
                        .description("Qualité des données de la paie d'un mois sur un périmètre : bulletins sans équipe et "
                                + "sans observation, et tranches de salaire total.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of("periode", OutilLecture.periode())))
                        .sortie(Map.of("periode", Map.of("type", "string"), "sansEquipe", nombre(), "sansObservation", nombre(),
                                "tranches", liste(), "vue", OutilLecture.vueProposee()),
                                "periode", "sansEquipe", "sansObservation", "tranches", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            YearMonth periode = periodeOuDerniere(paie, arguments);
                            PaieAnalytiqueDto resultat = analytique.analyser(p.criteres(periode));
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("periode", periode.toString());
                            donnees.put("sansEquipe", resultat.qualite().sansEquipe());
                            donnees.put("sansObservation", resultat.qualite().sansObservation());
                            donnees.put("tranches", resultat.tranches().stream().map(t -> {
                                Map<String, Object> tranche = new LinkedHashMap<>();
                                tranche.put("min", t.min());
                                tranche.put("max", t.max());
                                tranche.put("effectif", t.effectif());
                                return tranche;
                            }).toList());
                            Map<String, String> parametres = p.parametres(periode);
                            parametres.put("equipeIds", "0");
                            donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
                            return new OutilLecture.Resultat(donnees, resultat.qualite().sansEquipe() + " bulletin(s) sans équipe en "
                                    + periode + ".", 1, p.audit(periode));
                        })
                        .construire(audit),
                outil("paie_bulletins_rechercher")
                        .description("Bulletins de paie d'un mois (dernier mois importé par défaut) par nom, CIN et/ou "
                                + "périmètre : employé, chantier, équipe, fonction, jours, salaires, primes, total, observation. "
                                + BULLETINS + " au plus, avec le nombre total.")
                        .permissions("PAIE_READ")
                        .entree(perimetre(Map.of(
                                "periode", OutilLecture.periode(),
                                "nom", texte("Nom et/ou prénom, partiel", 150),
                                "cin", texte("CIN, partiel", 30),
                                "limite", limite(10, BULLETINS))))
                        .sortie(Map.of("periode", Map.of("type", "string"), "total", nombre(), "bulletins", liste(),
                                "vue", OutilLecture.vueProposee()), "periode", "total", "bulletins", "vue")
                        .execution((lecteur, arguments) -> {
                            Perimetre p = Perimetre.de(arguments);
                            YearMonth periode = periodeOuDerniere(paie, arguments);
                            String nom = arguments.texte("nom").orElse(null);
                            String cin = arguments.texte("cin").orElse(null);
                            Page<PaieResponseDto> page = paie.search(
                                    new PaieSearchCriteria(cin, nom, periode, p.fonctions(), p.chantiers(), p.equipes()),
                                    PageRequest.of(0, arguments.entier("limite", 10, 1, BULLETINS), Sort.by("employee.nomPrenom")));
                            List<Map<String, Object>> bulletins = page.getContent().stream().map(OutilsPaie::bulletin).toList();
                            Map<String, String> parametres = p.parametres(periode);
                            if (nom != null) {
                                parametres.put("nom", nom);
                            }
                            if (cin != null) {
                                parametres.put("cin", cin);
                            }
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("periode", periode.toString());
                            donnees.put("total", page.getTotalElements());
                            donnees.put("bulletins", bulletins);
                            donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
                            Map<String, Object> journal = p.audit(periode);
                            journal.put("rechercheParNom", nom != null);
                            journal.put("rechercheParCin", cin != null);
                            return new OutilLecture.Resultat(donnees, page.getTotalElements() + " bulletin(s) en " + periode + ".",
                                    bulletins.size(), journal);
                        })
                        .construire(audit),
                outil("rapport_preparer")
                        .description("Prépare le rapport de paie d'un mois (PDF) : vérifie les chantiers concernés et "
                                + "propose d'ouvrir l'assistant d'export déjà réglé. Ne génère aucun fichier.")
                        .permissions("PAIE_EXPORT", "PAIE_READ")
                        .entree(Map.of("periode", OutilLecture.periode(),
                                "chantierIds", OutilLecture.identifiants("Marchés du rapport ; absent = rapport complet")))
                        .sortie(Map.of("periode", Map.of("type", "string"), "nombreChantiers", nombre(), "chantiers", liste(),
                                "vue", OutilLecture.vueProposee()), "periode", "nombreChantiers", "chantiers", "vue")
                        .execution((lecteur, arguments) -> {
                            YearMonth periode = periodeOuDerniere(paie, arguments);
                            List<Long> chantiers = arguments.identifiants("chantierIds");
                            List<PaieChantierPeriodeDto> concernes = paie.findChantiersDeLaPeriode(periode,
                                    chantiers == null ? null : new PaieSearchCriteria(null, null, periode, null, chantiers, null));
                            List<Map<String, Object>> rendus = concernes.stream().limit(GROUPES).map(c -> {
                                Map<String, Object> chantier = new LinkedHashMap<>();
                                chantier.put("id", c.id());
                                chantier.put("code", c.code());
                                chantier.put("libelle", c.libelle());
                                chantier.put("effectif", c.effectif());
                                chantier.put("masse", c.masse());
                                return chantier;
                            }).toList();
                            Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, null, null));
                            parametres.put("periode", periode.toString());
                            parametres.put("action", "export");
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("periode", periode.toString());
                            donnees.put("nombreChantiers", concernes.size());
                            donnees.put("chantiers", rendus);
                            donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
                            return new OutilLecture.Resultat(donnees, "Rapport " + periode + " : " + concernes.size()
                                    + " chantier(s).", rendus.size(), Perimetres.de(periode, chantiers, null, null));
                        })
                        .construire(audit));
    }

    /** Ajoute aux propriétés d'entrée le périmètre commun chantier/équipe/fonction. */
    private static Map<String, Object> perimetre(Map<String, Object> proprietes) {
        Map<String, Object> entree = new LinkedHashMap<>(proprietes);
        entree.put("chantierIds", OutilLecture.identifiants("Chantiers ; absent = tous"));
        entree.put("equipeIds", OutilLecture.identifiants("Équipes ; 0 = sans équipe ; absent = toutes"));
        entree.put("fonctionIds", OutilLecture.identifiants("Fonctions ; absent = toutes"));
        return entree;
    }

    private static YearMonth periodeOuDerniere(IPaieService paie, Arguments arguments) {
        return arguments.periode("periode").orElseGet(() -> paie.findPeriodes(null).stream().findFirst()
                .map(resume -> YearMonth.parse(resume.periode()))
                .orElseThrow(() -> OutilLecture.invalide("Aucune paie n'est encore importée.")));
    }

    private static Map<String, Object> periode(PaiePeriodeResumeDto p) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("periode", p.periode());
        valeurs.put("bulletins", p.nombreBulletins());
        valeurs.put("chantiers", p.nombreChantiers());
        valeurs.put("masse", p.masse());
        valeurs.put("stc", p.stc());
        valeurs.put("stcMontant", p.stcMontant());
        return valeurs;
    }

    private static Map<String, Object> groupe(Long id, String code, String libelle, Object masse, long effectif, long stc,
                                              Object stcMontant) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", id);
        valeurs.put("code", code);
        valeurs.put("libelle", libelle);
        valeurs.put("masse", masse);
        valeurs.put("effectif", effectif);
        valeurs.put("stc", stc);
        valeurs.put("stcMontant", stcMontant);
        return valeurs;
    }

    private static Map<String, Object> bulletin(PaieResponseDto b) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", b.id());
        valeurs.put("periode", b.periode().toString());
        if (b.employee() == null) {
            valeurs.put("employe", null);
        } else {
            Map<String, Object> employe = new LinkedHashMap<>();
            employe.put("id", b.employee().id());
            employe.put("nomPrenom", b.employee().nomPrenom());
            employe.put("cin", b.employee().cin());
            valeurs.put("employe", employe);
        }
        valeurs.put("fonction", b.fonction() == null ? null : b.fonction().libelle());
        valeurs.put("chantier", b.chantier() == null ? null : b.chantier().code());
        valeurs.put("equipe", b.equipe() == null ? null : b.equipe().code());
        valeurs.put("joursTravailles", b.nombreJoursTravailles());
        valeurs.put("joursRecuperationOuvrable", b.joursRecuperationOuvrable());
        valeurs.put("joursRecuperationDimanche", b.joursRecuperationDimanche());
        valeurs.put("salaireMensuel", b.salaireMensuel());
        valeurs.put("primeRoulageOrdinaire", b.primeRoulageOrdinaire());
        valeurs.put("primeRoulageDimanche", b.primeRoulageDimanche());
        valeurs.put("salaireTotal", b.salaireTotal());
        valeurs.put("observation", b.observation());
        return valeurs;
    }

    /** Périmètre chantier/équipe/fonction d'un appel, avec ses formes critère, URL et journal. */
    private record Perimetre(List<Long> chantiers, List<Long> equipes, List<Long> fonctions) {

        static Perimetre de(Arguments arguments) {
            return new Perimetre(arguments.identifiants("chantierIds"), arguments.identifiants("equipeIds"),
                    arguments.identifiants("fonctionIds"));
        }

        PaieSearchCriteria criteres(YearMonth periode) {
            return new PaieSearchCriteria(null, null, periode, fonctions, chantiers, equipes);
        }

        Map<String, String> parametres(YearMonth periode) {
            Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
            if (periode != null) {
                parametres.put("periode", periode.toString());
            }
            return parametres;
        }

        Map<String, Object> audit(YearMonth periode) {
            return Perimetres.de(periode, chantiers, equipes, fonctions);
        }
    }
}
