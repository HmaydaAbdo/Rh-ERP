package staport.rh.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadPoolExecutor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AsyncConfigTest {

    @Test
    void le_pool_mail_est_borne_et_applique_le_decorateur_de_correlation() {
        MailExecutorProperties properties = properties(2, 4, 100);
        TaskDecorator decorator = runnable -> runnable;
        ThreadPoolTaskExecutor executor = new AsyncConfig().mailTaskExecutor(properties, decorator);
        executor.initialize();

        try {
            ThreadPoolExecutor pool = executor.getThreadPoolExecutor();
            assertThat(pool.getCorePoolSize()).isEqualTo(2);
            assertThat(pool.getMaximumPoolSize()).isEqualTo(4);
            assertThat(pool.getQueue().remainingCapacity()).isEqualTo(100);
            assertThat(pool.getRejectedExecutionHandler()).isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
            assertThat(executor.getThreadNamePrefix()).isEqualTo("rh-mail-");
        } finally {
            executor.shutdown();
        }
    }

    @Test
    void la_saturation_du_pool_et_de_la_file_rejette_immediatement_la_tache_suivante() throws InterruptedException {
        MailExecutorProperties properties = properties(2, 4, 100);
        properties.setAwaitTermination(Duration.ofSeconds(2));
        ThreadPoolTaskExecutor executor = new AsyncConfig().mailTaskExecutor(properties, runnable -> runnable);
        CountDownLatch liberation = new CountDownLatch(1);
        CountDownLatch travailleursLances = new CountDownLatch(4);
        executor.initialize();

        try {
            Runnable bloquer = () -> {
                travailleursLances.countDown();
                try {
                    liberation.await(2, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            };
            // 4 tâches occupent les travailleurs et 100 remplissent la file bornée.
            for (int i = 0; i < 104; i++) {
                executor.execute(bloquer);
            }

            assertThat(travailleursLances.await(1, TimeUnit.SECONDS)).isTrue();
            assertThat(executor.getThreadPoolExecutor().getQueue().remainingCapacity()).isZero();
            assertThatThrownBy(() -> executor.execute(() -> { }))
                    .isInstanceOf(org.springframework.core.task.TaskRejectedException.class);
        } finally {
            liberation.countDown();
            executor.shutdown();
        }
    }

    @Test
    void les_bornes_incoherentes_sont_refusees() {
        MailExecutorProperties properties = properties(4, 2, 100);

        assertThatThrownBy(properties::valider)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positives et cohérentes");
    }

    @Test
    void le_pool_peutEtreConstruitAvecLesValeursValidees() {
        MailExecutorProperties properties = properties(2, 4, 100);

        assertThatCode(properties::valider).doesNotThrowAnyException();
    }

    private static MailExecutorProperties properties(int coreSize, int maxSize, int queueCapacity) {
        MailExecutorProperties properties = new MailExecutorProperties();
        properties.setCoreSize(coreSize);
        properties.setMaxSize(maxSize);
        properties.setQueueCapacity(queueCapacity);
        properties.setKeepAlive(Duration.ofSeconds(30));
        properties.setAwaitTermination(Duration.ofSeconds(30));
        return properties;
    }
}
