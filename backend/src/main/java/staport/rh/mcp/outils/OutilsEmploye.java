package staport.rh.mcp.outils;

import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.projection.ProjectionPaieEmployee;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.parcours.ParcoursEmployeDto;
import staport.rh.paie.services.interfaces.IPaieParcoursService;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static staport.rh.mcp.outils.OutilDefini.enumeration;
import static staport.rh.mcp.outils.OutilDefini.identifiant;
import static staport.rh.mcp.outils.OutilDefini.limite;
import static staport.rh.mcp.outils.OutilDefini.liste;
import static staport.rh.mcp.outils.OutilDefini.nombre;
import static staport.rh.mcp.outils.OutilDefini.objetLibre;
import static staport.rh.mcp.outils.OutilDefini.outil;

/** Outils Employé en plus de la recherche, du comptage et des départs : fiche, regroupement et parcours. */
public final class OutilsEmploye {

    private static final int GROUPES = 50;
    private static final int MOIS_DE_PARCOURS = 36;

    private OutilsEmploye() {
    }

    public static List<OutilLecture> catalogue(IEmployeeService employes, IEmployeeAnalytiqueService analytique,
                                               IPaieParcoursService parcours, IAuditOutilsAgent audit) {
        return List.of(
                outil("employe_fiche")
                        .description("Fiche complète d'un employé par son identifiant (CIN, dates de naissance et "
                                + "d'embauche, fonction, chantier, équipe, statut) et ses départs ; salaire avec le droit paie.")
                        .permissions("EMPLOYEE_READ")
                        .entree(Map.of("id", identifiant("Identifiant de l'employé")))
                        .sortie(Map.of("employe", objetLibre(), "departs", liste(), "vue", OutilLecture.vueProposee()),
                                "employe", "departs", "vue")
                        .execution((lecteur, arguments) -> {
                            long id = OutilsReferentiels.obligatoire(arguments);
                            boolean voitLaPaie = ProjectionPaieEmployee.voitLaPaie(lecteur);
                            EmployeeResponseDto employe = ProjectionPaieEmployee.pourLeLecteur(employes.findById(id), voitLaPaie);
                            List<Map<String, Object>> departs = employes.listerSorties(id).stream()
                                    .map(s -> Map.<String, Object>of("periode", s.periode().toString(),
                                            "motif", s.motif() == null ? "NON_PRECISE" : s.motif()))
                                    .toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("employe", OutilEmployesRechercher.fiche(employe, voitLaPaie));
                            donnees.put("departs", departs);
                            donnees.put("vue", new VueProposeeDto("employees", "fiche", Map.of("id", String.valueOf(id))).enJson());
                            return new OutilLecture.Resultat(donnees, employe.nomPrenom() + ", "
                                    + Statuts.libelle(employe.statut()) + ".", 1, Map.of("id", id));
                        })
                        .construire(audit),
                outil("employes_regrouper")
                        .description("Effectif des employés regroupé par chantier, équipe ou fonction (total et en poste), "
                                + "du plus grand groupe au plus petit, sur un périmètre ; " + GROUPES + " groupes au plus.")
                        .permissions("EMPLOYEE_READ")
                        .entree(Map.of(
                                "dimension", enumeration("Regroupement", "CHANTIER", "EQUIPE", "FONCTION"),
                                "chantierIds", OutilLecture.identifiants("Chantiers ; absent = tous"),
                                "equipeIds", OutilLecture.identifiants("Équipes ; 0 = sans équipe ; absent = toutes"),
                                "fonctionIds", OutilLecture.identifiants("Fonctions ; absent = toutes"),
                                "statut", Statuts.schema(),
                                "limite", limite(GROUPES, GROUPES)))
                        .sortie(Map.of("dimension", Map.of("type", "string"), "nombreGroupes", nombre(), "groupes", liste(),
                                "vue", OutilLecture.vueProposee()), "dimension", "nombreGroupes", "groupes", "vue")
                        .execution((lecteur, arguments) -> {
                            DimensionEmployes dimension = DimensionEmployes.valueOf(arguments.texte("dimension")
                                    .orElseThrow(() -> OutilLecture.invalide("« dimension » est obligatoire.")));
                            List<Long> chantiers = arguments.identifiants("chantierIds");
                            List<Long> equipes = arguments.identifiants("equipeIds");
                            List<Long> fonctions = arguments.identifiants("fonctionIds");
                            EmployeeStatut statut = Statuts.lire(arguments);
                            List<EmployeeRegroupementDto> groupes = analytique.regrouper(
                                    new EmployeeSearchCriteria(null, null, fonctions, chantiers, equipes, statut), dimension);
                            int limite = arguments.entier("limite", GROUPES, 1, GROUPES);
                            List<Map<String, Object>> rendus = groupes.stream().limit(limite).map(g -> {
                                Map<String, Object> groupe = new LinkedHashMap<>();
                                groupe.put("id", g.id());
                                groupe.put("code", g.code());
                                groupe.put("libelle", g.libelle());
                                groupe.put("effectif", g.effectif());
                                groupe.put("enPoste", g.actifs());
                                return groupe;
                            }).toList();
                            Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
                            Statuts.versUrl(statut, parametres);
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("dimension", dimension.name());
                            donnees.put("nombreGroupes", groupes.size());
                            donnees.put("groupes", rendus);
                            donnees.put("vue", new VueProposeeDto("employees", "cartes", parametres).enJson());
                            Map<String, Object> perimetre = Perimetres.de(null, chantiers, equipes, fonctions);
                            perimetre.put("dimension", dimension.name());
                            return new OutilLecture.Resultat(donnees, groupes.size() + " groupe(s) par " + dimension.name()
                                    .toLowerCase() + ".", rendus.size(), perimetre);
                        })
                        .construire(audit),
                outil("employe_parcours")
                        .description("Parcours d'un employé reconstitué depuis ses bulletins : indicateurs (mois payés, total "
                                + "perçu, jours travaillés), " + MOIS_DE_PARCOURS + " derniers mois (chantier, équipe, fonction, "
                                + "jours, salaires) et événements (entrée, mutations, changement de salaire, départ, retour).")
                        .permissions("PAIE_READ")
                        .entree(Map.of("id", identifiant("Identifiant de l'employé")))
                        .sortie(Map.of("indicateurs", objetLibre(), "mois", liste(), "evenements", liste(),
                                "vue", OutilLecture.vueProposee()), "indicateurs", "mois", "evenements", "vue")
                        .execution((lecteur, arguments) -> {
                            long id = OutilsReferentiels.obligatoire(arguments);
                            ParcoursEmployeDto resultat = parcours.parcours(id);
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("indicateurs", indicateurs(resultat.indicateurs()));
                            List<ParcoursEmployeDto.MoisDto> mois = resultat.mois();
                            donnees.put("mois", mois.subList(Math.max(0, mois.size() - MOIS_DE_PARCOURS), mois.size())
                                    .stream().map(OutilsEmploye::mois).toList());
                            donnees.put("evenements", resultat.evenements().stream().map(OutilsEmploye::evenement).toList());
                            donnees.put("vue", new VueProposeeDto("employees", "fiche", Map.of("id", String.valueOf(id))).enJson());
                            return new OutilLecture.Resultat(donnees, resultat.indicateurs().moisPayes() + " mois payés, "
                                    + resultat.evenements().size() + " événement(s).", mois.size(), Map.of("id", id));
                        })
                        .construire(audit));
    }

    private static Map<String, Object> indicateurs(ParcoursEmployeDto.Indicateurs i) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("moisPayes", i.moisPayes());
        valeurs.put("totalPercu", i.totalPercu());
        valeurs.put("joursTravailles", i.joursTravailles());
        valeurs.put("premierMois", i.premierMois() == null ? null : i.premierMois().toString());
        valeurs.put("dernierMois", i.dernierMois() == null ? null : i.dernierMois().toString());
        return valeurs;
    }

    private static Map<String, Object> mois(ParcoursEmployeDto.MoisDto m) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("bulletinId", m.bulletinId());
        valeurs.put("periode", m.periode().toString());
        valeurs.put("fonction", m.fonction());
        valeurs.put("chantier", m.chantier());
        valeurs.put("equipe", m.equipe());
        valeurs.put("joursTravailles", m.nombreJoursTravailles());
        valeurs.put("salaireMensuel", m.salaireMensuel());
        valeurs.put("salaireTotal", m.salaireTotal());
        valeurs.put("observation", m.observation());
        return valeurs;
    }

    private static Map<String, Object> evenement(ParcoursEmployeDto.EvenementDto e) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("periode", e.periode().toString());
        valeurs.put("type", e.type().name());
        valeurs.put("avant", e.avant());
        valeurs.put("apres", e.apres());
        valeurs.put("motif", e.motif());
        return valeurs;
    }
}
