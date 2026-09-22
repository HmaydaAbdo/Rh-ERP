package staport.rh.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.response.ChantierSummaryDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.exceptions.EmployeeNotFoundException;
import staport.rh.employee.services.interfaces.IEmployeeService;

import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EmployeeController.class)
class EmployeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @MockitoBean
    private IEmployeeService employeeService;

    @Test
    void creer_devraitRetourner400QuandLeNomPrenomEstManquant() throws Exception {
        EmployeeCreateRequestDto invalide = new EmployeeCreateRequestDto(
                "", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L);

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalide)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void creer_devraitRetourner201QuandLaRequeteEstValide() throws Exception {
        EmployeeCreateRequestDto valide = new EmployeeCreateRequestDto(
                "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L);

        EmployeeResponseDto response = new EmployeeResponseDto(
                1L, "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                new FunctionSummaryDto(10L, "OPERATEUR"), new ChantierSummaryDto(20L, "C059", "Travaux de voirie"), EmployeeStatut.ACTIF);

        when(employeeService.create(any())).thenReturn(response);

        mockMvc.perform(post("/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(valide)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.cin").value("PB85747"));
    }

    @Test
    void lireParId_devraitRetourner404QuandLEmployeEstIntrouvable() throws Exception {
        when(employeeService.findById(eq(99L))).thenThrow(new EmployeeNotFoundException(99L));

        mockMvc.perform(get("/employees/99"))
                .andExpect(status().isNotFound());
    }
}
