package staport.rh.paie.performance;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.audit.support.AuthentificationDeTest;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.export.PaieExportRequestDto;
import staport.rh.paie.export.PaieExportService;
import staport.rh.paie.imports.PaieImportService;
import staport.rh.paie.report.PaieReportHtmlPdfService;
import staport.rh.paie.report.PaieReportPdfRequestDto;
import staport.rh.paie.reporting.FeuillesEquipeMode;
import staport.rh.paie.services.PaieService;

import java.io.ByteArrayOutputStream;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.springframework.data.domain.PageRequest.of;

/**
 * Mesure opt-in du profil accepté dans docs/conformite/performance-2026-10-12.md.
 * Exécution : ./mvnw -Dperformance.profile=true -Dtest=PerformanceProfileTest test.
 * Le test utilise PostgreSQL réel via PostgresPartageExtension et uniquement des données synthétiques.
 */
@SpringBootTest
@EnabledIfSystemProperty(named = "performance.profile", matches = "true")
class PerformanceProfileTest {

    private static final int EMPLOYES = 1_000;
    private static final int PERIODES = 60;
    private static final int REQUETES = 600;
    private static final int ECHANTILLONS_LOURDS = 20;
    private static final YearMonth PERIODE_COURANTE = YearMonth.of(2026, 8);

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PaieService paieService;
    @Autowired
    private PaieImportService paieImportService;
    @Autowired
    private PaieExportService paieExportService;
    @Autowired
    private PaieReportHtmlPdfService rapportPdf;

    private String prefixe;
    private Long fonctionId;
    private Long chantierId;
    private List<Long> employeIds;
    private List<String> codesChantiers;

    @BeforeEach
    void preparerDonneesSynthétiques() {
        prefixe = "PF" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        jdbc.update("INSERT INTO fonction(libelle) VALUES (?)", prefixe + "-OUVRIER");
        fonctionId = jdbc.queryForObject("SELECT id FROM fonction WHERE libelle = ?", Long.class, prefixe + "-OUVRIER");
        jdbc.update("INSERT INTO chantier(code, designation, actif, source_erp) VALUES (?, ?, true, false)",
                prefixe + "-C000", "Jeu synthétique performance");
        chantierId = jdbc.queryForObject("SELECT id FROM chantier WHERE code = ?", Long.class, prefixe + "-C000");

        List<Object[]> employes = new ArrayList<>(EMPLOYES);
        for (int i = 0; i < EMPLOYES; i++) {
            employes.add(new Object[]{prefixe + String.format("%04d", i), "Employé synthétique " + i,
                    LocalDate.of(1980, 1, 1), LocalDate.of(2020, 1, 1), fonctionId, chantierId, "ACTIF"});
        }
        jdbc.batchUpdate("INSERT INTO employe(cin, nom_prenom, date_naissance, date_embauche, fonction_id, chantier_id, statut) VALUES (?, ?, ?, ?, ?, ?, ?)", employes);
        employeIds = jdbc.queryForList("SELECT id FROM employe WHERE cin LIKE ? ORDER BY cin", Long.class, prefixe + "%");
        assertThat(employeIds).hasSize(EMPLOYES);

        List<Object[]> bulletins = new ArrayList<>(EMPLOYES * PERIODES);
        for (int mois = 0; mois < PERIODES; mois++) {
            int periode = PERIODE_COURANTE.minusMonths(mois).getYear() * 100
                    + PERIODE_COURANTE.minusMonths(mois).getMonthValue();
            for (Long employeeId : employeIds) {
                bulletins.add(new Object[]{employeeId, periode, fonctionId, chantierId, 26,
                        new BigDecimal("10000.00"), new BigDecimal("10000.00")});
            }
        }
        jdbc.batchUpdate("INSERT INTO paie(employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, salaire_mensuel, salaire_total) VALUES (?, ?, ?, ?, ?, ?, ?)", bulletins);
        jdbc.execute("ANALYZE paie");
        jdbc.execute("ANALYZE employe");
        codesChantiers = List.of(prefixe + "-C000");
    }

    @AfterEach
    void nettoyerDonneesSynthétiques() {
        if (prefixe == null) {
            return;
        }
        jdbc.update("DELETE FROM paie WHERE employee_id IN (SELECT id FROM employe WHERE cin LIKE ?)", prefixe + "%");
        jdbc.update("DELETE FROM employe WHERE cin LIKE ?", prefixe + "%");
        jdbc.update("DELETE FROM chantier WHERE code = ?", prefixe + "-C000");
        jdbc.update("DELETE FROM fonction WHERE libelle = ?", prefixe + "-OUVRIER");
        AuthentificationDeTest.deconnecter();
    }

    @Test
    void mesurerProfilChargeEtOperationsLourdes() throws Exception {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM paie WHERE employee_id IN (SELECT id FROM employe WHERE cin LIKE ?)",
                Long.class, prefixe + "%")).isEqualTo((long) EMPLOYES * PERIODES);

        PaieSearchCriteria criteres = new PaieSearchCriteria(null, null, PERIODE_COURANTE,
                null, null, null);
        for (int i = 0; i < 20; i++) {
            paieService.search(criteres, of(0, 20));
        }

        MockMultipartFile fichierImport = fichierExcel();
        jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) SELECT p.id FROM paie p " +
                        "JOIN employe e ON e.id = p.employee_id WHERE p.periode = ? LIMIT 20",
                String.class, PERIODE_COURANTE.getYear() * 100 + PERIODE_COURANTE.getMonthValue())
                .forEach(ligne -> System.out.println("PERFORMANCE_EXPLAIN " + ligne));
        MesureRessources ressources = new MesureRessources(jdbc);
        ressources.demarrer();
        List<Long> latencesRecherche;
        List<Long> imports = new ArrayList<>();
        List<Long> excels = new ArrayList<>();
        List<Long> pdfs = new ArrayList<>();
        LongAdder erreurs = new LongAdder();
        ExecutorService lourds = Executors.newFixedThreadPool(3);
        try {
            Future<List<Long>> recherches = lancerRecherches(criteres, erreurs);
            Future<List<Long>> importations = lourds.submit(() -> mesurerEnSerie(ECHANTILLONS_LOURDS, index -> {
                AuthentificationDeTest.connecter(4242L, "testeur");
                YearMonth periode = PERIODE_COURANTE.plusMonths(index + 1L);
                return mesurer(() -> paieImportService.importer(fichierImport, periode).crees());
            }, imports, erreurs));
            Future<List<Long>> exports = lourds.submit(() -> mesurerEnSerie(ECHANTILLONS_LOURDS, index -> {
                AuthentificationDeTest.connecter(4242L, "testeur");
                return mesurer(() -> paieExportService.exporter(PERIODE_COURANTE,
                        new PaieExportRequestDto(PERIODE_COURANTE.toString(), FeuillesEquipeMode.AUCUNE,
                                null, null, codesChantiers, null)).available());
            }, excels, erreurs));
            Future<List<Long>> rapports = lourds.submit(() -> mesurerEnSerie(ECHANTILLONS_LOURDS, index -> {
                AuthentificationDeTest.connecter(4242L, "testeur");
                return mesurer(() -> rapportPdf.generer(PERIODE_COURANTE,
                        new PaieReportPdfRequestDto(PERIODE_COURANTE.toString(), null, null, null,
                                chantierId, null, null, true)).length);
            }, pdfs, erreurs));

            latencesRecherche = recherches.get(3, TimeUnit.MINUTES);
            importations.get(5, TimeUnit.MINUTES);
            exports.get(5, TimeUnit.MINUTES);
            rapports.get(5, TimeUnit.MINUTES);
        } finally {
            ressources.arreter();
            lourds.shutdownNow();
        }

        assertThat(latencesRecherche).hasSize(REQUETES);
        assertThat(erreurs.sum()).isZero();
        List<Long> recherchesTriees = latencesRecherche.stream().sorted().toList();
        long p95Recherche = percentile(recherchesTriees, 0.95);
        long p99Recherche = percentile(recherchesTriees, 0.99);
        long p95Import = percentile(imports.stream().sorted().toList(), 0.95);
        long p95Excel = percentile(excels.stream().sorted().toList(), 0.95);
        long p99Excel = percentile(excels.stream().sorted().toList(), 0.99);
        long p95Pdf = percentile(pdfs.stream().sorted().toList(), 0.95);
        long p99Pdf = percentile(pdfs.stream().sorted().toList(), 0.99);
        System.out.printf("PERFORMANCE_PROFILE employees=%d periods=%d bulletins=%d reads=%d readsPerSecond=10 " +
                        "searchP95Ms=%d searchP99Ms=%d importSamples=%d importP95Ms=%d excelSamples=%d excelP95Ms=%d excelP99Ms=%d " +
                        "pdfSamples=%d pdfP95Ms=%d pdfP99Ms=%d errors=%d peakHeapMiB=%d peakDbConnections=%d peakJvmThreads=%d maxCpuPercent=%.1f%n",
                EMPLOYES, PERIODES, EMPLOYES * PERIODES, REQUETES, p95Recherche, p99Recherche,
                imports.size(), p95Import, excels.size(), p95Excel, p99Excel, pdfs.size(), p95Pdf, p99Pdf,
                erreurs.sum(), ressources.picHeapOctets.get() / (1024 * 1024), ressources.picConnexionsDb.get(),
                ressources.picThreadsJvm.get(), ressources.cpuMaximumPourcent());

        assertThat(p95Recherche).as("recherche p95, ms").isLessThanOrEqualTo(750);
        assertThat(p99Recherche).as("recherche p99, ms").isLessThanOrEqualTo(1_500);
        assertThat(p95Import).as("import 1 000 lignes p95, ms").isLessThanOrEqualTo(10_000);
        assertThat(p95Excel).as("export Excel 1 000 lignes p95, ms").isLessThanOrEqualTo(30_000);
        assertThat(p99Excel).as("export Excel 1 000 lignes p99, ms").isLessThanOrEqualTo(60_000);
        assertThat(p95Pdf).as("rapport PDF 1 000 lignes p95, ms").isLessThanOrEqualTo(30_000);
        assertThat(p99Pdf).as("rapport PDF 1 000 lignes p99, ms").isLessThanOrEqualTo(60_000);
    }

    private Future<List<Long>> lancerRecherches(PaieSearchCriteria criteres, LongAdder erreurs) {
        ExecutorService utilisateurs = Executors.newFixedThreadPool(20);
        ExecutorService coordinateur = Executors.newSingleThreadExecutor();
        CountDownLatch depart = new CountDownLatch(1);
        List<Long> resultats = java.util.Collections.synchronizedList(new ArrayList<>());
        AtomicInteger numero = new AtomicInteger();
        ScheduledExecutorService cadenceur = Executors.newSingleThreadScheduledExecutor();
        CountDownLatch termine = new CountDownLatch(REQUETES);
        cadenceur.scheduleAtFixedRate(() -> {
            int index = numero.getAndIncrement();
            if (index >= REQUETES) {
                return;
            }
            utilisateurs.submit(() -> {
                try {
                    depart.await();
                    resultats.add(mesurer(() -> paieService.search(criteres, of(0, 20)).getTotalElements()));
                } catch (Exception e) {
                    erreurs.increment();
                } finally {
                    termine.countDown();
                }
            });
        }, 0, 100, TimeUnit.MILLISECONDS);
        depart.countDown();
        return coordinateur.submit(() -> {
            try {
                if (!termine.await(3, TimeUnit.MINUTES)) {
                    fail("Les 600 recherches n'ont pas fini dans les 3 minutes");
                }
                return List.copyOf(resultats);
            } finally {
                cadenceur.shutdownNow();
                utilisateurs.shutdownNow();
                coordinateur.shutdown();
            }
        });
    }

    private List<Long> mesurerEnSerie(int nombre, java.util.function.IntFunction<Long> operation,
                                      List<Long> durees, LongAdder erreurs) {
        for (int i = 0; i < nombre; i++) {
            try {
                durees.add(operation.apply(i));
            } catch (RuntimeException e) {
                erreurs.increment();
                throw e;
            } finally {
                AuthentificationDeTest.deconnecter();
            }
        }
        return durees;
    }

    private long mesurer(Supplier<? extends Number> operation) {
        long debut = System.nanoTime();
        operation.get();
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - debut);
    }

    private MockMultipartFile fichierExcel() {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            var feuille = classeur.createSheet("Paie");
            for (int i = 0; i < 3; i++) {
                feuille.createRow(i);
            }
            for (int i = 0; i < EMPLOYES; i++) {
                Row ligne = feuille.createRow(i + 3);
                ligne.createCell(0).setCellValue("Employé synthétique " + i);
                ligne.createCell(1).setCellValue(prefixe + "-OUVRIER");
                ligne.createCell(2).setCellValue(prefixe + String.format("%04d", i));
                ligne.createCell(3).setCellValue(26);
                ligne.createCell(4).setCellValue(0);
                ligne.createCell(5).setCellValue(0);
                ligne.createCell(6).setCellValue(10000);
                ligne.createCell(7).setCellValue(0);
                ligne.createCell(8).setCellValue(0);
                ligne.createCell(9).setCellValue(10000);
                ligne.createCell(11).setCellValue(prefixe + "-C000");
            }
            classeur.write(sortie);
            return new MockMultipartFile("file", "performance.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException("Impossible de construire le fichier synthétique", e);
        }
    }

    private long percentile(List<Long> valeursTriees, double percentile) {
        assertThat(valeursTriees).isNotEmpty();
        int index = (int) Math.ceil(percentile * valeursTriees.size()) - 1;
        return valeursTriees.get(Math.max(0, index));
    }

    private static final class MesureRessources {
        private final JdbcTemplate jdbc;
        private final ScheduledExecutorService sondeur = Executors.newSingleThreadScheduledExecutor();
        private final AtomicLong picHeapOctets = new AtomicLong();
        private final AtomicInteger picConnexionsDb = new AtomicInteger();
        private final AtomicInteger picThreadsJvm = new AtomicInteger();
        private final AtomicLong cpuDernier = new AtomicLong();
        private final AtomicLong tempsDernier = new AtomicLong();
        private final AtomicLong cpuMaxMilliPourcent = new AtomicLong();
        private final int processeurs = Runtime.getRuntime().availableProcessors();
        private final com.sun.management.OperatingSystemMXBean os = (com.sun.management.OperatingSystemMXBean)
                ManagementFactory.getOperatingSystemMXBean();

        private MesureRessources(JdbcTemplate jdbc) {
            this.jdbc = jdbc;
        }

        private void demarrer() {
            sondeur.scheduleAtFixedRate(this::echantillonner, 0, 500, TimeUnit.MILLISECONDS);
        }

        private void echantillonner() {
            try {
                picHeapOctets.accumulateAndGet(ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed(), Math::max);
                picThreadsJvm.accumulateAndGet(ManagementFactory.getThreadMXBean().getThreadCount(), Math::max);
                picConnexionsDb.accumulateAndGet(jdbc.queryForObject(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()", Integer.class), Math::max);
                long maintenant = System.nanoTime();
                long cpu = os.getProcessCpuTime();
                long cpuPrecedent = cpuDernier.getAndSet(cpu);
                long tempsPrecedent = tempsDernier.getAndSet(maintenant);
                if (tempsPrecedent != 0 && maintenant > tempsPrecedent) {
                    long milliPourcent = (cpu - cpuPrecedent) * 100_000L / (maintenant - tempsPrecedent) / Math.max(1, processeurs);
                    cpuMaxMilliPourcent.accumulateAndGet(milliPourcent, Math::max);
                }
            } catch (RuntimeException ignore) {
                // Le sondeur ne doit pas interrompre le scénario mesuré si une lecture métrique échoue.
            }
        }

        private double cpuMaximumPourcent() {
            return cpuMaxMilliPourcent.get() / 1_000.0;
        }

        private void arreter() {
            sondeur.shutdownNow();
        }
    }
}
