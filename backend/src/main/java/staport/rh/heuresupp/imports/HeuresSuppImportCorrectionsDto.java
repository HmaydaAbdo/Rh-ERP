package staport.rh.heuresupp.imports;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Création explicite des fiches absentes, depuis l'étape de correction de l'assistant. */
public record HeuresSuppImportCorrectionsDto(
        @Valid @Size(max = 500) List<Alignement> aligner,
        @Valid @Size(max = 500) List<Creation> creer
) {

    public HeuresSuppImportCorrectionsDto {
        aligner = aligner == null ? List.of() : List.copyOf(aligner);
        creer = creer == null ? List.of() : List.copyOf(creer);
    }

    public record Alignement(@NotNull Long employeId) { }

    public record Creation(
            @NotNull int numeroLigne,
            @NotNull @Past LocalDate dateNaissance,
            @NotNull LocalDate dateEmbauche,
            @NotNull Long fonctionId,
            @NotNull @DecimalMin("0.00") @Digits(integer = 8, fraction = 2) BigDecimal salaire,
            @NotNull TypeSalaire typeSalaire
    ) {
    }
}
