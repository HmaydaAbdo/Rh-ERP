package staport.rh.paie.imports;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import staport.rh.employee.entities.TypeSalaire;

import java.time.LocalDate;
import java.util.List;

/**
 * Les corrections que l'utilisateur fait sur les fiches depuis l'assistant, à partir des valeurs du fichier : aligner des
 * fiches en écart, créer les employés des CIN inconnus (avec ce que le fichier n'a pas : les deux dates). Le type de salaire
 * n'est pas dans le fichier : il est choisi ici quand la fiche n'en a pas encore, ou change.
 */
public record PaieImportCorrectionsDto(
        @Valid List<Alignement> aligner,
        @Valid List<Creation> creer
) {

    public PaieImportCorrectionsDto {
        aligner = aligner == null ? List.of() : List.copyOf(aligner);
        creer = creer == null ? List.of() : List.copyOf(creer);
    }

    /** La fiche reprend les valeurs de sa ligne ; {@code typeSalaire} null garde celui de la fiche. */
    public record Alignement(@NotNull Long employeId, TypeSalaire typeSalaire) {
    }

    /** L'employé de la ligne {@code numeroLigne} est créé avec les valeurs du fichier et ces deux dates. */
    public record Creation(int numeroLigne, @NotNull LocalDate dateNaissance, @NotNull LocalDate dateEmbauche,
                           @NotNull TypeSalaire typeSalaire) {
    }
}
