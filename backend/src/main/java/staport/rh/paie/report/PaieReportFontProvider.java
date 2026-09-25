package staport.rh.paie.report;

import org.springframework.stereotype.Component;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * openhtmltopdf ne sait rendre les caractères accentués français que si une police Unicode est
 * explicitement enregistrée (voir {@code PaieReportPdfService}) — fontes système résolues au
 * runtime : "fonts-dejavu-core" sur l'image Docker de production, ou une police Windows standard
 * en développement local.
 */
@Component
class PaieReportFontProvider {

    private static final List<String> CHEMINS_CANDIDATS = List.of(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf"
    );

    private static final Map<String, String> VARIANTES_GRASSES = Map.of(
            "DejaVuSans.ttf", "DejaVuSans-Bold.ttf",
            "arial.ttf", "arialbd.ttf",
            "calibri.ttf", "calibrib.ttf"
    );

    File resoudre() {
        return CHEMINS_CANDIDATS.stream()
                .map(File::new)
                .filter(File::isFile)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Aucune police disponible pour générer le rapport PDF (candidats testés : " + CHEMINS_CANDIDATS + ")"));
    }

    Optional<File> resoudreGras() {
        File normale = resoudre();
        String nomGras = VARIANTES_GRASSES.get(normale.getName());
        if (nomGras == null) {
            return Optional.empty();
        }
        File gras = new File(normale.getParentFile(), nomGras);
        return gras.isFile() ? Optional.of(gras) : Optional.empty();
    }
}