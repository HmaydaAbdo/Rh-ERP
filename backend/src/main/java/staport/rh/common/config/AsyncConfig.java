package staport.rh.common.config;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import staport.rh.audit.context.ResolveurContexteAudit;

import java.util.concurrent.ThreadPoolExecutor;

/** Active {@code @Async} et propage uniquement le requestId aux tâches asynchrones. */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean("mailTaskExecutor")
    public ThreadPoolTaskExecutor mailTaskExecutor(MailExecutorProperties properties, TaskDecorator decorator) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getCoreSize());
        executor.setMaxPoolSize(properties.getMaxSize());
        executor.setQueueCapacity(properties.getQueueCapacity());
        executor.setKeepAliveSeconds(Math.toIntExact(properties.getKeepAlive().toSeconds()));
        executor.setThreadNamePrefix("rh-mail-");
        executor.setTaskDecorator(decorator);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(Math.toIntExact(properties.getAwaitTermination().toSeconds()));
        return executor;
    }

    @Bean
    public TaskDecorator mdcRequestIdTaskDecorator() {
        return delegate -> {
            String requestId = MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID);
            return () -> {
                String precedent = MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID);
                try {
                    if (requestId == null) {
                        MDC.remove(ResolveurContexteAudit.MDC_REQUEST_ID);
                    } else {
                        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, requestId);
                    }
                    delegate.run();
                } finally {
                    if (precedent == null) {
                        MDC.remove(ResolveurContexteAudit.MDC_REQUEST_ID);
                    } else {
                        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, precedent);
                    }
                }
            };
        };
    }
}
