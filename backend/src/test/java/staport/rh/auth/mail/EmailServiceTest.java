package staport.rh.auth.mail;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class EmailServiceTest {

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final EmailService service = new EmailService(mailSender, "noreply@staport.test", "https://rh.staport.test");

    @Test
    void le_lien_part_au_proprietaire_du_compte_avec_le_jeton() {
        service.envoyerLienReinitialisation("ali@staport.test", "jeton-brut", Duration.ofMinutes(45));

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly("ali@staport.test");
        assertThat(message.getValue().getFrom()).isEqualTo("noreply@staport.test");
        assertThat(message.getValue().getText())
                .contains("https://rh.staport.test/reset-password#token=jeton-brut")
                .as("la validité vient du paramètre, pas du texte").contains("valable 45 minutes");
    }

    @Test
    void un_echec_d_envoi_n_est_jamais_renvoye_a_l_appelant() {
        doThrow(new MailSendException("serveur injoignable")).when(mailSender).send(any(SimpleMailMessage.class));

        assertThatCode(() -> service.envoyerLienReinitialisation("ali@staport.test", "jeton-brut", Duration.ofHours(1))).doesNotThrowAnyException();
    }

    @Test
    void la_duree_s_ecrit_comme_un_lecteur_la_dirait() {
        assertThat(EmailService.libelleDuree(Duration.ofHours(1))).isEqualTo("1 heure");
        assertThat(EmailService.libelleDuree(Duration.ofHours(2))).isEqualTo("2 heures");
        assertThat(EmailService.libelleDuree(Duration.ofMinutes(90))).isEqualTo("90 minutes");
        assertThat(EmailService.libelleDuree(Duration.ofMinutes(5))).isEqualTo("5 minutes");
    }

    @Test
    void l_envoi_est_asynchrone() throws NoSuchMethodException {
        Async annotation = EmailService.class.getMethod("envoyerLienReinitialisation", String.class, String.class, Duration.class)
                .getAnnotation(Async.class);
        assertThat(annotation).isNotNull();
        assertThat(annotation.value()).isEqualTo("mailTaskExecutor");
    }
}
