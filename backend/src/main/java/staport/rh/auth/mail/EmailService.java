package staport.rh.auth.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

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

    public void envoyerLienReinitialisation(String email, String token) {
        String lien = frontendUrl + "/reset-password?token=" + token;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Staport RH — Réinitialisation de votre mot de passe");
        message.setText("""
                Une demande de réinitialisation de mot de passe a été effectuée pour ce compte.

                Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois :
                %s

                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
                """.formatted(lien));

        mailSender.send(message);
        log.info("Email de réinitialisation envoyé");
    }
}
