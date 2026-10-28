package staport.rh.heuresupp.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.equipe.entities.Equipe;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeuresSuppAnalytiqueDto;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.heuresupp.specifications.HeuresSuppSpecification;
import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

@Service
public class HeuresSuppAnalytiqueService {

    private static final BigDecimal ZERO = new BigDecimal("0.00");
    private static final HeuresSuppAnalytiqueDto.Definitions DEFINITIONS = new HeuresSuppAnalytiqueDto.Definitions(
            "Somme des P/H du mois, en heures décimales.",
            "Somme de S/H × P/H, chaque ligne arrondie à deux décimales en DH.",
            "Somme du Montant pour les bulletins du même mois marqués exactement STC ou sortie.",
            "Somme des forfaits saisis séparément des heures ; interdit pour un employé STC/sortie.",
            "Somme de Montant − STC (DH) + Forfait.");

    private final HeuresSuppRepository repository;

    public HeuresSuppAnalytiqueService(HeuresSuppRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public HeuresSuppAnalytiqueDto analyser(HeuresSuppSearchCriteria criteres) {
        List<HeureSupp> lignes = repository.findAll(HeuresSuppSpecification.rechercher(criteres));
        YearMonth periode = criteres == null ? null : criteres.periode();
        long employes = lignes.stream().map(ligne -> ligne.getEmployee().getId()).distinct().count();
        long lignesHeures = lignes.stream().filter(ligne -> ligne.getHeures() != null).count();
        BigDecimal heures = somme(lignes, HeureSupp::getHeures);
        BigDecimal montant = somme(lignes, HeureSupp::getMontant);
        BigDecimal stc = somme(lignes, HeureSupp::getStcDh);
        BigDecimal forfait = somme(lignes, HeureSupp::getForfait);
        BigDecimal net = somme(lignes, HeureSupp::getNetAPayer);
        HeuresSuppAnalytiqueDto.Indicateurs indicateurs = new HeuresSuppAnalytiqueDto.Indicateurs(
                employes, lignesHeures, heures, montant, stc, forfait, net);
        return new HeuresSuppAnalytiqueDto(periode, indicateurs,
                groupes(lignes, Dimension.CHANTIER), groupes(lignes, Dimension.FONCTION), groupes(lignes, Dimension.EQUIPE), DEFINITIONS);
    }

    @Transactional(readOnly = true)
    public List<YearMonth> periodes() {
        return repository.findDistinctPeriodeByOrderByPeriodeDesc();
    }

    private enum Dimension { CHANTIER, FONCTION, EQUIPE }

    private static List<HeuresSuppAnalytiqueDto.Groupe> groupes(List<HeureSupp> lignes, Dimension dimension) {
        Map<Long, GroupeMutable> groupes = new LinkedHashMap<>();
        for (HeureSupp ligne : lignes) {
            Long id;
            String code;
            String libelle;
            if (dimension == Dimension.CHANTIER) {
                id = ligne.getChantier().getId(); code = ligne.getChantier().getCode();
                libelle = ligne.getChantier().getNom() == null ? ligne.getChantier().getDesignation() : ligne.getChantier().getNom();
            } else if (dimension == Dimension.FONCTION) {
                id = ligne.getFonction().getId(); code = ligne.getFonction().getLibelle(); libelle = code;
            } else {
                Paie bulletin = ligne.getPaie();
                Equipe equipe = bulletin.getEquipe();
                id = equipe == null ? 0L : equipe.getId();
                code = equipe == null ? null : equipe.getCode();
                libelle = equipe == null ? "Sans équipe" : equipe.getLibelle();
            }
            groupes.computeIfAbsent(id, cle -> new GroupeMutable(id, code, libelle)).ajouter(ligne);
        }
        return groupes.values().stream().map(GroupeMutable::dto)
                .sorted((a, b) -> b.netAPayerDh().compareTo(a.netAPayerDh())).toList();
    }

    private static BigDecimal somme(List<HeureSupp> lignes, java.util.function.Function<HeureSupp, BigDecimal> valeur) {
        return lignes.stream().map(valeur).filter(java.util.Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static final class GroupeMutable {
        private final Long id; private final String code; private final String libelle;
        private long lignesHeures; private long effectif; private BigDecimal heures = BigDecimal.ZERO;
        private BigDecimal montant = BigDecimal.ZERO; private BigDecimal stc = BigDecimal.ZERO;
        private BigDecimal forfait = BigDecimal.ZERO; private BigDecimal net = BigDecimal.ZERO;
        private final Set<Long> employes = new HashSet<>();
        private GroupeMutable(Long id, String code, String libelle) { this.id = id; this.code = code; this.libelle = libelle == null ? code : libelle; }
        private void ajouter(HeureSupp ligne) {
            employes.add(ligne.getEmployee().getId());
            if (ligne.getHeures() != null) { lignesHeures++; heures = heures.add(ligne.getHeures()); }
            montant = montant.add(ligne.getMontant()); stc = stc.add(ligne.getStcDh());
            if (ligne.getForfait() != null) forfait = forfait.add(ligne.getForfait());
            net = net.add(ligne.getNetAPayer()); effectif = employes.size();
        }
        private HeuresSuppAnalytiqueDto.Groupe dto() {
            return new HeuresSuppAnalytiqueDto.Groupe(id, code, libelle, lignesHeures, effectif, heures, montant, stc, forfait, net);
        }
    }
}
