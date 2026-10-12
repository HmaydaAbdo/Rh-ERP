package staport.rh.auth.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final String frontendUrl;

    public EmailService(JavaMailSender mailSender,
                         @Value("${security.mail.from}") String from,
                         @Value("${security.cors.frontend-url}") String frontendUrl) {
        this.mailSender = mailSender;
        this.from = from;
        this.frontendUrl = frontendUrl;
    }

    /**
     * Envoie le lien de réinitialisation sans bloquer l'appelant : la demande répond aussi vite que le compte existe ou non
     * (conventions/security.md, « Mot de passe oublié »). Un échec d'envoi est journalisé, jamais renvoyé à l'appelant — il
     * révélerait que l'adresse correspond à un compte.
     */
    @Async("mailTaskExecutor")
    public void envoyerLienReinitialisation(String email, String token, Duration validite) {
        String lien = frontendUrl + "/reset-password?token=" + token;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Staport RH — Réinitialisation de votre mot de passe");
        message.setText("""
                Une demande de réinitialisation de mot de passe a été effectuée pour ce compte.

                Ce lien est valable %s et ne peut être utilisé qu'une seule fois :
                %s

                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
                """.formatted(libelleDuree(validite), lien));

        try {
            mailSender.send(message);
            log.info("Email de réinitialisation envoyé");
        } catch (MailException e) {
            log.warn("Échec de l'envoi de l'email de réinitialisation", e);
        }
    }

    /** « 1 heure », « 2 heures » ou « 45 minutes » : la durée telle qu'un lecteur la dirait. */
    static String libelleDuree(Duration duree) {
        long minutes = duree.toMinutes();
        if (minutes >= 60 && minutes % 60 == 0) {
            long heures = minutes / 60;
            return heures + (heures == 1 ? " heure" : " heures");
        }
        return minutes + (minutes == 1 ? " minute" : " minutes");
    }
}
