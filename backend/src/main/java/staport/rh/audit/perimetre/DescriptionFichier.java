package staport.rh.audit.perimetre;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Décrit un fichier importé pour le journal : nom, taille et empreinte SHA-256 — jamais son contenu
 * (conventions/audit.md, minimisation des données personnelles). L'empreinte prouve qu'un fichier donné est bien celui
 * qui a été importé, sans le conserver.
 */
public final class DescriptionFichier {

    private static final int NOM_LONGUEUR_MAX = 100;

    private DescriptionFichier() {
    }

    public static Map<String, Object> decrire(MultipartFile fichier) {
        Map<String, Object> description = new LinkedHashMap<>();
        String nom = fichier.getOriginalFilename();
        description.put("fichierNom", nom == null || nom.length() <= NOM_LONGUEUR_MAX ? nom : nom.substring(0, NOM_LONGUEUR_MAX));
        description.put("fichierTaille", fichier.getSize());
        description.put("fichierSha256", sha256(fichier));
        return description;
    }

    private static String sha256(MultipartFile fichier) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(fichier.getBytes()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 est garanti par toute JVM", e);
        }
    }
}
