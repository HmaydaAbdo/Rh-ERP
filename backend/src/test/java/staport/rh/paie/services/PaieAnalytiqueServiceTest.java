package staport.rh.paie.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.parametre.services.interfaces.IParametreService;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Tranche;
import staport.rh.paie.repositories.ChantierMasseProjection;
import staport.rh.paie.repositories.EvolutionMasseProjection;
import staport.rh.paie.repositories.FiltresPaie;
import staport.rh.paie.repositories.FonctionMasseProjection;
import staport.rh.paie.repositories.PaieKpiProjection;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieAnalytiqueServiceTest {

    private static final YearMonth AOUT = YearMonth.of(2026, 8);
    private static final YearMonth JUILLET = YearMonth.of(2026, 7);

    @Mock
    private PaieRepository repository;

    @Mock
    private IParametreService parametres;

    @InjectMocks
    private PaieAnalytiqueService service;

    @BeforeEach
    void pasDeDepart() {
        lenient().when(parametres.pasTrancheAnalytique()).thenReturn(new BigDecimal("500"));
    }

    @Test
    void analyser_devraitRenvoyerUnTableauVideSansInterrogerLeResteQuandLeMoisNaAucunBulletin() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(0, "0", 0, 0, 0, 0));

        PaieAnalytiqueDto resultat = service.analyser(criteres(AOUT, null, null, null));

        assertThat(resultat.kpis().effectif()).isZero();
        assertThat(resultat.kpis().coutMoyen()).isNull();
        assertThat(resultat.moisPrecedent()).isNull();
        assertThat(resultat.parChantier()).isEmpty();
        assertThat(resultat.tranches()).isEmpty();
        verify(repository, never()).sommerParChantier(any(), any());
    }

    @Test
    void analyser_devraitCalculerLeCoutMoyenEtLaQualiteDuMois() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(4, "10000", 2, 1, 3, 2));
        lenient().when(repository.listerTotaux(any(), any())).thenReturn(List.of());

        PaieAnalytiqueDto resultat = service.analyser(criteres(AOUT, null, null, null));

        assertThat(resultat.kpis().coutMoyen()).isEqualByComparingTo("2500.00");
        assertThat(resultat.kpis().nombreChantiers()).isEqualTo(2);
        assertThat(resultat.kpis().stc()).isEqualTo(1);
        assertThat(resultat.qualite().sansEquipe()).isEqualTo(3);
        assertThat(resultat.qualite().sansObservation()).isEqualTo(2);
    }

    @Test
    void analyser_devraitRenvoyerLeMoisPrecedentSeulementSiIlADesBulletinsSurLePerimetre() {
        when(repository.resumerKpi(eq(AOUT), any())).thenReturn(kpi(4, "10000", 2, 1, 0, 0));
        when(repository.resumerKpi(eq(JUILLET), any())).thenReturn(kpi(0, "0", 0, 0, 0, 0));

        assertThat(service.analyser(criteres(AOUT, null, null, null)).moisPrecedent()).isNull();

        when(repository.resumerKpi(eq(JUILLET), any())).thenReturn(kpi(5, "9000", 2, 0, 0, 0));

        PaieAnalytiqueDto.Kpi precedent = service.analyser(criteres(AOUT, null, null, null)).moisPrecedent();
        assertThat(precedent.masse()).isEqualByComparingTo("9000");
        assertThat(precedent.effectif()).isEqualTo(5);
    }

    @Test
    void analyser_devraitIgnorerUnFiltreAbsentOuVideEtTransmettreLesAutres() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(1, "100", 1, 0, 0, 0));
        ArgumentCaptor<FiltresPaie> filtres = ArgumentCaptor.forClass(FiltresPaie.class);

        service.analyser(criteres(AOUT, List.of(3L, 4L), List.of(), null));

        verify(repository, atLeastOnce()).resumerKpi(any(), filtres.capture());
        FiltresPaie f = filtres.getValue();
        assertThat(f.isTousChantiers()).isFalse();
        assertThat(f.getChantierIds()).containsExactly(3L, 4L);
        assertThat(f.isToutesFonctions()).isTrue();
        assertThat(f.isToutesEquipes()).isTrue();
        // Une liste vide n'est jamais transmise telle quelle : « IN () » n'est pas du SQL valide.
        assertThat(f.getFonctionIds()).isNotEmpty();
    }

    @Test
    void analyser_devraitTransmettreLeNomEtLeCinEnMotifsSansCasse() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(1, "100", 1, 0, 0, 0));
        ArgumentCaptor<FiltresPaie> filtres = ArgumentCaptor.forClass(FiltresPaie.class);

        service.analyser(new PaieSearchCriteria(" ab12 ", "Ali", AOUT, null, null, null));

        verify(repository, atLeastOnce()).resumerKpi(any(), filtres.capture());
        assertThat(filtres.getValue().isTousNoms()).isFalse();
        assertThat(filtres.getValue().getMotifNom()).isEqualTo("%ali%");
        assertThat(filtres.getValue().isTousCin()).isFalse();
        assertThat(filtres.getValue().getMotifCin()).isEqualTo("% ab12 %");
    }

    @Test
    void analyser_devraitRepartirLesTotauxEnTranchesEgalesAvecUneDerniereOuverte() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(4, "10200", 1, 0, 0, 0));
        // Plus gros total 3 600 : 3 600 / 6 = 600, arrondi au pas de 500 supérieur = tranches de 1 000.
        when(repository.listerTotaux(any(), any())).thenReturn(
                List.of(new BigDecimal("1000"), new BigDecimal("2500"), new BigDecimal("3100"), new BigDecimal("3600")));

        List<Tranche> tranches = service.analyser(criteres(AOUT, null, null, null)).tranches();

        assertThat(tranches).hasSize(6);
        assertThat(tranches).extracting(Tranche::effectif).containsExactly(0L, 1L, 1L, 2L, 0L, 0L);
        assertThat(tranches.get(1).min()).isEqualByComparingTo("1000");
        assertThat(tranches.get(1).max()).isEqualByComparingTo("2000");
        assertThat(tranches.get(5).max()).isNull();
    }

    @Test
    void analyser_devraitArrondirLaLargeurDesTranchesAuPasDuParametre() {
        when(parametres.pasTrancheAnalytique()).thenReturn(new BigDecimal("2000"));
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(4, "10200", 1, 0, 0, 0));
        // Plus gros total 3 600 : 3 600 / 6 = 600, arrondi au pas de 2 000 supérieur (et jamais moins que le pas) = tranches de 2 000.
        when(repository.listerTotaux(any(), any())).thenReturn(
                List.of(new BigDecimal("1000"), new BigDecimal("2500"), new BigDecimal("3100"), new BigDecimal("3600")));

        List<Tranche> tranches = service.analyser(criteres(AOUT, null, null, null)).tranches();

        assertThat(tranches).extracting(Tranche::effectif).containsExactly(1L, 3L, 0L, 0L, 0L, 0L);
        assertThat(tranches.get(1).min()).isEqualByComparingTo("2000");
        assertThat(tranches.get(1).max()).isEqualByComparingTo("4000");
    }

    @Test
    void analyser_devraitNommerLeChantierParSonNomADefautParSaDesignation() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(1, "100", 2, 0, 0, 0));
        when(repository.sommerParChantier(any(), any())).thenReturn(List.of(
                chantier(1L, "C168", "NADOR", "Désignation ERP", "70"),
                chantier(2L, "C196", " ", "Désignation 196", "30")));
        lenient().when(repository.listerTotaux(any(), any())).thenReturn(List.of());

        PaieAnalytiqueDto resultat = service.analyser(criteres(AOUT, null, null, null));

        assertThat(resultat.parChantier()).extracting(PaieAnalytiqueDto.ChantierMasse::libelle)
                .containsExactly("NADOR", "Désignation 196");
    }

    @Test
    void analyser_devraitRenvoyerToutLHistoriqueDuPerimetreSansFenetre() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(1, "100", 1, 0, 0, 0));
        lenient().when(repository.listerTotaux(any(), any())).thenReturn(List.of());
        when(repository.sommerParPeriode(any())).thenReturn(List.of(
                evolution(YearMonth.of(2024, 1), "700", 4),
                evolution(JUILLET, "900", 5),
                evolution(YearMonth.of(2026, 9), "1100", 6)));

        PaieAnalytiqueDto resultat = service.analyser(criteres(AOUT, null, null, null));

        // Aucun mois n'est écarté, y compris plus de 12 mois avant et un mois après le mois analysé.
        assertThat(resultat.evolution()).extracting(PaieAnalytiqueDto.Evolution::periode).containsExactly("2024-01", "2026-07", "2026-09");
    }

    @Test
    void analyser_devraitRenvoyerTousLesChantiersEtToutesLesFonctionsSansPlafond() {
        when(repository.resumerKpi(any(), any())).thenReturn(kpi(60, "6000", 40, 0, 0, 0));
        lenient().when(repository.listerTotaux(any(), any())).thenReturn(List.of());
        List<ChantierMasseProjection> chantiers = java.util.stream.IntStream.rangeClosed(1, 40)
                .mapToObj(i -> chantier((long) i, "C" + i, "Chantier " + i, null, "100")).toList();
        when(repository.sommerParChantier(any(), any())).thenReturn(chantiers);
        when(repository.sommerParFonction(any(), any())).thenReturn(java.util.stream.IntStream.rangeClosed(1, 114)
                .mapToObj(i -> fonction((long) i, "FONCTION " + i)).toList());

        PaieAnalytiqueDto resultat = service.analyser(criteres(AOUT, null, null, null));

        assertThat(resultat.parChantier()).hasSize(40);
        assertThat(resultat.parFonction()).hasSize(114);
    }

    private static PaieSearchCriteria criteres(YearMonth periode, List<Long> chantierIds, List<Long> fonctionIds, List<Long> equipeIds) {
        return new PaieSearchCriteria(null, null, periode, fonctionIds, chantierIds, equipeIds);
    }

    private static PaieKpiProjection kpi(long effectif, String masse, long chantiers, long stc, long sansEquipe, long sansObservation) {
        return new PaieKpiProjection() {
            public Long getEffectif() { return effectif; }
            public BigDecimal getMasse() { return new BigDecimal(masse); }
            public Long getChantiers() { return chantiers; }
            public Long getStc() { return stc; }
            public BigDecimal getStcMontant() { return BigDecimal.ZERO; }
            public Long getSansEquipe() { return sansEquipe; }
            public Long getSansObservation() { return sansObservation; }
        };
    }

    private static ChantierMasseProjection chantier(Long id, String code, String nom, String designation, String masse) {
        return new ChantierMasseProjection() {
            public Long getId() { return id; }
            public String getCode() { return code; }
            public String getNom() { return nom; }
            public String getDesignation() { return designation; }
            public BigDecimal getMasse() { return new BigDecimal(masse); }
            public Long getEffectif() { return 1L; }
            public Long getStc() { return 0L; }
            public BigDecimal getStcMontant() { return BigDecimal.ZERO; }
        };
    }

    private static FonctionMasseProjection fonction(Long id, String libelle) {
        return new FonctionMasseProjection() {
            public Long getId() { return id; }
            public String getLibelle() { return libelle; }
            public BigDecimal getMasse() { return new BigDecimal("10"); }
            public Long getEffectif() { return 1L; }
        };
    }

    private static EvolutionMasseProjection evolution(YearMonth periode, String masse, long effectif) {
        return new EvolutionMasseProjection() {
            public YearMonth getPeriode() { return periode; }
            public BigDecimal getMasse() { return new BigDecimal(masse); }
            public Long getEffectif() { return effectif; }
            public Long getStc() { return 0L; }
            public BigDecimal getStcMontant() { return BigDecimal.ZERO; }
        };
    }
}
