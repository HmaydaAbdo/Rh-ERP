package staport.rh.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.ChantierSummaryDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.employee.exceptions.EmployeeNotFoundException;
import staport.rh.employee.services.interfaces.IEmployeeService;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EmployeeController.class)
class EmployeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @MockitoBean
    private IEmployeeService employeeService;

    @MockitoBean
    private IAuditJournalWriter auditJournalWriter;

    @MockitoBean
    private AuditMetrics auditMetrics;

    @Test
    void creer_devraitRetourner400QuandLeNomPrenomEstManquant() throws Exception {
        EmployeeCreateRequestDto invalide = new EmployeeCreateRequestDto(
                "", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, null, null, null);

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalide)))
                .andExpect(status().isBadRequest());
    }

    private static EmployeeResponseDto ficheAvecSalaire() {
        return new EmployeeResponseDto(1L, 3L, "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                new FunctionSummaryDto(10L, "OPERATEUR"), new ChantierSummaryDto(20L, "C059", "Travaux de voirie"), null,
                new BigDecimal("120.00"), TypeSalaire.JOURNALIER, EmployeeStatut.ACTIF);
    }

    private static UsernamePasswordAuthenticationToken connecte(String... permissions) {
        return new UsernamePasswordAuthenticationToken("rh", null,
                Arrays.stream(permissions).map(SimpleGrantedAuthority::new).toList());
    }

    @Test
    void lireParId_devraitMontrerLeSalaireAQuiPeutLireLaPaie() throws Exception {
        when(employeeService.findById(1L)).thenReturn(ficheAvecSalaire());

        mockMvc.perform(get("/employees/1").principal(connecte("EMPLOYEE_READ", "PAIE_READ")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salaire").value(120.0))
                .andExpect(jsonPath("$.typeSalaire").value("JOURNALIER"));
    }

    @Test
    void lireParId_devraitMasquerLeSalaireAQuiNePeutPasLireLaPaie() throws Exception {
        when(employeeService.findById(1L)).thenReturn(ficheAvecSalaire());

        mockMvc.perform(get("/employees/1").principal(connecte("EMPLOYEE_READ")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salaire").isEmpty())
                .andExpect(jsonPath("$.typeSalaire").isEmpty())
                .andExpect(jsonPath("$.cin").value("PB85747"));
    }

    @Test
    void rechercher_devraitIgnorerLeTriParSalaireAQuiNePeutPasLireLaPaie() throws Exception {
        when(employeeService.search(any(), any())).thenReturn(new PageImpl<>(List.of(ficheAvecSalaire())));

        mockMvc.perform(post("/employees/search?sort=salaire,desc&sort=nomPrenom,asc").principal(connecte("EMPLOYEE_READ"))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].salaire").isEmpty());

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(employeeService).search(any(), page.capture());
        assertThat(page.getValue().getSort().stream().map(Sort.Order::getProperty)).containsExactly("nomPrenom");
    }

    @Test
    void modifier_devraitConserverLeSalaireQuandLAuteurNePeutPasLireLaPaie() throws Exception {
        when(employeeService.findById(1L)).thenReturn(ficheAvecSalaire());
        when(employeeService.update(eq(1L), any())).thenReturn(ficheAvecSalaire());
        EmployeeUpdateRequestDto saisie = new EmployeeUpdateRequestDto(3L, "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1),
                LocalDate.of(2018, 7, 14), 10L, 20L, null, new BigDecimal("9999"), TypeSalaire.MENSUEL, EmployeeStatut.ACTIF);

        mockMvc.perform(put("/employees/1").principal(connecte("EMPLOYEE_WRITE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(saisie)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salaire").isEmpty());

        ArgumentCaptor<EmployeeUpdateRequestDto> envoye = ArgumentCaptor.forClass(EmployeeUpdateRequestDto.class);
        verify(employeeService).update(eq(1L), envoye.capture());
        assertThat(envoye.getValue().salaire()).isEqualByComparingTo("120.00");
        assertThat(envoye.getValue().typeSalaire()).isEqualTo(TypeSalaire.JOURNALIER);
    }

    @Test
    void creer_devraitRetourner400QuandLeSalaireEstDonneSansSonType() throws Exception {
        EmployeeCreateRequestDto invalide = new EmployeeCreateRequestDto(
                "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, null,
                new BigDecimal("4000"), null);

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalide)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("salaireEtTypeEnsemble : le salaire et son type se renseignent ensemble"));
    }

    @Test
    void creer_devraitRetourner201QuandLaRequeteEstValide() throws Exception {
        EmployeeCreateRequestDto valide = new EmployeeCreateRequestDto(
                "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, null, null, null);

        EmployeeResponseDto response = new EmployeeResponseDto(
                1L, 0L, "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                new FunctionSummaryDto(10L, "OPERATEUR"), new ChantierSummaryDto(20L, "C059", "Travaux de voirie"), null, null, null, EmployeeStatut.ACTIF);

        when(employeeService.create(any())).thenReturn(response);

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(valide)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.cin").value("PB85747"));
    }

    @Test
    void creer_devraitRetournerUnConflitGeneriqueQuandLaBaseRefuseUneEcriture() throws Exception {
        EmployeeCreateRequestDto valide = new EmployeeCreateRequestDto(
                "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, null, null, null);
        when(employeeService.create(any())).thenThrow(new DataIntegrityViolationException("contrainte unique"));

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(valide)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Une contrainte d'intégrité empêche cette opération."));
    }

    @Test
    void lireParId_devraitRetourner404QuandLEmployeEstIntrouvable() throws Exception {
        when(employeeService.findById(eq(99L))).thenThrow(new EmployeeNotFoundException(99L));

        mockMvc.perform(get("/employees/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    void rechercher_devraitRetourner400QuandUnCritereDepasseSaLongueurMaximale() throws Exception {
        String corps = "{\"nomPrenom\":\"" + "x".repeat(151) + "\"}";

        mockMvc.perform(post("/employees/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corps))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rechercher_devraitRetourner400QuandUneListeDeFiltresEstDemesuree() throws Exception {
        String ids = java.util.stream.LongStream.rangeClosed(1, 501).mapToObj(Long::toString)
                .collect(java.util.stream.Collectors.joining(","));

        mockMvc.perform(post("/employees/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fonctionIds\":[" + ids + "]}"))
                .andExpect(status().isBadRequest());
    }
}
