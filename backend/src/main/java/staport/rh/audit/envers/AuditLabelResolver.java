package staport.rh.audit.envers;

import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.stereotype.Component;

import java.beans.PropertyDescriptor;
import java.util.List;

/**
 * Rend la cible d'une relation sous la forme {@code "<id> — <libellé>"} (conventions/audit.md). L'identifiant est
 * toujours en tête : c'est la seule valeur exacte et toujours disponible ; le libellé peut avoir changé ou concerner une
 * cible supprimée depuis. Le libellé se lit par les accesseurs (jamais par les champs : sur un proxy Hibernate les
 * champs déclarés sont ceux de la sous-classe générée et sont vides), dans l'ordre {@link #PROPRIETES_LIBELLE}, puis par
 * tout accesseur {@code getNumeroXxx} qui renvoie une chaîne. Une erreur de lecture ne fait jamais échouer la consultation.
 */
@Component
public class AuditLabelResolver {

    static final List<String> PROPRIETES_LIBELLE =
            List.of("nom", "nomPrenom", "libelle", "designation", "intitule", "reference", "numero", "code", "username");

    public String rendre(Object cible) {
        if (cible == null) {
            return null;
        }
        BeanWrapper bean = new BeanWrapperImpl(cible);
        String id = lire(bean, "id");
        if (id == null) {
            return null;
        }
        String libelle = libelle(bean);
        return libelle == null ? id : id + " — " + libelle;
    }

    /** Le libellé seul, sans l'identifiant (titre d'un enregistrement dans la liste des modifications). */
    public String libelleSeul(Object cible) {
        return cible == null ? null : libelle(new BeanWrapperImpl(cible));
    }

    private String libelle(BeanWrapper bean) {
        for (String propriete : PROPRIETES_LIBELLE) {
            String valeur = lire(bean, propriete);
            if (valeur != null && !valeur.isBlank()) {
                return valeur;
            }
        }
        for (PropertyDescriptor descripteur : bean.getPropertyDescriptors()) {
            if (descripteur.getName().startsWith("numero") && descripteur.getName().length() > "numero".length()
                    && descripteur.getPropertyType() == String.class) {
                String valeur = lire(bean, descripteur.getName());
                if (valeur != null && !valeur.isBlank()) {
                    return valeur;
                }
            }
        }
        return null;
    }

    private String lire(BeanWrapper bean, String propriete) {
        try {
            if (!bean.isReadableProperty(propriete)) {
                return null;
            }
            Object valeur = bean.getPropertyValue(propriete);
            return valeur == null ? null : valeur.toString();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
