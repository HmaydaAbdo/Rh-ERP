package staport.rh.mcp.outils;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Lecture typée des arguments d'un outil. Le schéma d'entrée est déjà validé par le SDK ; ces conversions restent
 * défensives et leurs messages ne recopient jamais une valeur saisie.
 */
public final class Arguments {

    private final Map<String, Object> valeurs;

    Arguments(Map<String, Object> valeurs) {
        this.valeurs = valeurs == null ? Map.of() : valeurs;
    }

    public Optional<YearMonth> periode(String nom) {
        Object valeur = valeurs.get(nom);
        if (valeur == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(YearMonth.parse(valeur.toString()));
        } catch (DateTimeParseException e) {
            throw OutilLecture.invalide("« " + nom + " » doit être un mois au format aaaa-MM.");
        }
    }

    /** Identifiants d'une dimension ; {@code null} quand l'argument est absent ou vide (pas de filtre). */
    public List<Long> identifiants(String nom) {
        if (!(valeurs.get(nom) instanceof List<?> liste) || liste.isEmpty()) {
            return null;
        }
        return liste.stream().map(element -> {
            if (element instanceof Number nombre && nombre.longValue() >= 0 && nombre.doubleValue() == nombre.longValue()) {
                return nombre.longValue();
            }
            throw OutilLecture.invalide("« " + nom + " » doit contenir des identifiants entiers positifs.");
        }).distinct().toList();
    }

    public Optional<String> texte(String nom) {
        Object valeur = valeurs.get(nom);
        return valeur == null || valeur.toString().isBlank() ? Optional.empty() : Optional.of(valeur.toString().trim());
    }

    public int entier(String nom, int defaut, int minimum, int maximum) {
        Object valeur = valeurs.get(nom);
        if (valeur == null) {
            return defaut;
        }
        if (!(valeur instanceof Number nombre) || nombre.intValue() < minimum || nombre.intValue() > maximum) {
            throw OutilLecture.invalide("« " + nom + " » doit être un entier entre " + minimum + " et " + maximum + ".");
        }
        return nombre.intValue();
    }
}
