package staport.rh.chantier.services;

import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.exceptions.ChantierLocalisationException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Qualification géographique du domaine : Spring lit les URI, aucun appel réseau n'est nécessaire. */
@Service
public class LocalisationChantierService {

    public void appliquer(Chantier chantier, String lien, BigDecimal latitude, BigDecimal longitude, boolean afficher) {
        String localisation = lien == null || lien.isBlank() ? null : lien.strip();
        if (localisation != null) {
            UriComponents uri;
            try {
                uri = UriComponentsBuilder.fromUriString(localisation.contains("://") ? localisation : "https://" + localisation).build();
                if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || !List.of("google.com", "www.google.com").contains(uri.getHost())
                    || !("/maps".equals(uri.getPath()) || "/maps/".equals(uri.getPath()) || "/maps/search/".equals(uri.getPath()))
                    || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getFragment() != null) {
                    throw invalide();
                }
            } catch (IllegalArgumentException ex) {
                throw invalide();
            }
            List<String> valeurs = uri.getQueryParams().get("q");
            List<String> requete = uri.getQueryParams().get("query");
            if (valeurs != null && requete != null) {
                throw invalide();
            }
            valeurs = valeurs != null ? valeurs : requete;
            if (valeurs == null || valeurs.size() != 1 || valeurs.getFirst() == null) {
                throw invalide();
            }
            BigDecimal latLien;
            BigDecimal lonLien;
            try {
                String[] point = UriUtils.decode(valeurs.getFirst(), StandardCharsets.UTF_8).split(",", -1);
                if (point.length != 2) {
                    throw invalide();
                }
                latLien = new BigDecimal(point[0].strip());
                lonLien = new BigDecimal(point[1].strip());
            } catch (IllegalArgumentException ex) {
                throw invalide();
            }
            if ((latitude != null && latitude.compareTo(latLien) != 0) || (longitude != null && longitude.compareTo(lonLien) != 0)) {
                throw new ChantierLocalisationException("La latitude et la longitude saisies ne correspondent pas au lien de localisation.");
            }
            latitude = latLien;
            longitude = lonLien;
        }
        if ((latitude == null) != (longitude == null)) {
            throw new ChantierLocalisationException("Renseignez ensemble la latitude et la longitude.");
        }
        if (latitude != null) {
            if (latitude.abs().compareTo(BigDecimal.valueOf(90)) > 0 || longitude.abs().compareTo(BigDecimal.valueOf(180)) > 0) {
                throw new ChantierLocalisationException("Latitude : de -90 à 90 ; longitude : de -180 à 180.");
            }
            try {
                latitude = latitude.setScale(8, RoundingMode.UNNECESSARY);
                longitude = longitude.setScale(8, RoundingMode.UNNECESSARY);
            } catch (ArithmeticException ex) {
                throw new ChantierLocalisationException("La latitude et la longitude acceptent au maximum 8 décimales.");
            }
            localisation = UriComponentsBuilder.fromUriString("https://www.google.com/maps/search/")
                    .queryParam("api", 1)
                    .queryParam("query", latitude.stripTrailingZeros().toPlainString() + "," + longitude.stripTrailingZeros().toPlainString())
                    .build().encode().toUriString();
        }
        if (afficher && (chantier.getNature() == null || localisation == null || latitude == null)) {
            throw new ChantierLocalisationException("Pour afficher le chantier sur la carte, renseignez sa nature et sa localisation : un lien Google Maps contenant les coordonnées, ou sa latitude et sa longitude.");
        }
        chantier.setLocalisation(localisation);
        chantier.setLatitude(latitude);
        chantier.setLongitude(longitude);
        chantier.setAfficherSurCarte(afficher);
    }

    private ChantierLocalisationException invalide() {
        return new ChantierLocalisationException("La localisation doit être un lien Google Maps contenant les coordonnées, par exemple https://www.google.com/maps?q=31.7243258,-8.1033938. Les liens courts et les adresses seules ne sont pas acceptés.");
    }
}
