package staport.rh.common.config;

import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Bornes validées du pool réservé aux courriels de réinitialisation. */
@Validated
@ConfigurationProperties(prefix = "staport.auth.mail.executor")
public class MailExecutorProperties {

    private int coreSize;
    private int maxSize;
    private int queueCapacity;

    @NotNull
    private Duration keepAlive;

    @NotNull
    private Duration awaitTermination;

    @PostConstruct
    void valider() {
        if (coreSize < 1 || maxSize < coreSize || queueCapacity < 1
                || keepAlive == null || awaitTermination == null
                || keepAlive.isZero() || keepAlive.isNegative()
                || awaitTermination.isZero() || awaitTermination.isNegative()) {
            throw new IllegalArgumentException("Les bornes du pool courriel doivent être positives et cohérentes");
        }
        if (keepAlive.toSeconds() < 1 || keepAlive.toSeconds() > Integer.MAX_VALUE
                || awaitTermination.toSeconds() < 1 || awaitTermination.toSeconds() > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Les durées du pool courriel dépassent la limite supportée");
        }
    }

    public int getCoreSize() {
        return coreSize;
    }

    public void setCoreSize(int coreSize) {
        this.coreSize = coreSize;
    }

    public int getMaxSize() {
        return maxSize;
    }

    public void setMaxSize(int maxSize) {
        this.maxSize = maxSize;
    }

    public int getQueueCapacity() {
        return queueCapacity;
    }

    public void setQueueCapacity(int queueCapacity) {
        this.queueCapacity = queueCapacity;
    }

    public Duration getKeepAlive() {
        return keepAlive;
    }

    public void setKeepAlive(Duration keepAlive) {
        this.keepAlive = keepAlive;
    }

    public Duration getAwaitTermination() {
        return awaitTermination;
    }

    public void setAwaitTermination(Duration awaitTermination) {
        this.awaitTermination = awaitTermination;
    }
}
