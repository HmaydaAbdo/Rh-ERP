package staport.rh.employee.dtos.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.time.LocalDate;

/** {@code equipeId}, {@code salaire} et {@code typeSalaire} sont facultatifs ; le salaire et son type vont ensemble. */
public record EmployeeUpdateRequestDto(
        @NotNull
        Long version,

        @NotBlank
        @Size(max = 150)
        String nomPrenom,

        @NotBlank
        @Size(max = 30)
        String cin,

        @NotNull
        @Past
        LocalDate dateNaissance,

        @NotNull
        LocalDate dateEmbauche,

        @NotNull
        Long fonctionId,

        Long chantierId,

        Long equipeId,

        @DecimalMin(value = "0", inclusive = true)
        @Digits(integer = 8, fraction = 2)
        BigDecimal salaire,

        TypeSalaire typeSalaire,

        @NotNull
        EmployeeStatut statut
) {

    @AssertTrue(message = "le salaire et son type se renseignent ensemble")
    public boolean isSalaireEtTypeEnsemble() {
        return (salaire == null) == (typeSalaire == null);
    }

    @AssertTrue(message = "un employé actif doit avoir un chantier; un employé inactif ne garde ni chantier ni équipe")
    public boolean isAffectationsCoherentesAvecStatut() {
        return statut == EmployeeStatut.INACTIF
                ? chantierId == null && equipeId == null
                : chantierId != null;
    }
}
