"""Envoi asynchrone du courriel de réinitialisation (parité avec `EmailService` et son exécuteur borné).

L'envoi ne bloque pas la réponse : la requête reste identique et immédiate que le compte existe ou non. Comme
l'exécuteur de Spring (4 envois simultanés, file de 100), une saturation est signalée à l'appelant, qui la journalise
sans changer la réponse. Aucun jeton ni adresse n'est écrit dans le journal.
"""

import asyncio
import logging
from datetime import timedelta
from email.message import EmailMessage

import aiosmtplib

from staport.platform.configuration import Configuration

journal = logging.getLogger(__name__)

ENVOIS_SIMULTANES = 4
FILE_ATTENTE = 100
DELAI_CONNEXION = 5.0


class FileSaturee(Exception):
    """Trop d'envois en attente : le courriel n'est pas planifié."""


def libelle_duree(duree: timedelta) -> str:
    minutes = int(duree.total_seconds() // 60)
    if minutes >= 60 and minutes % 60 == 0:
        heures = minutes // 60
        return f"{heures} heure" if heures == 1 else f"{heures} heures"
    return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"


def composer_lien_reinitialisation(
    expediteur: str, destinataire: str, url_frontend: str, jeton: str, validite: timedelta
) -> EmailMessage:
    # Le fragment n'est pas transmis au serveur ni inscrit dans les journaux HTTP du frontend.
    lien = f"{url_frontend}/reset-password#token={jeton}"
    message = EmailMessage()
    message["From"] = expediteur
    message["To"] = destinataire
    message["Subject"] = "Staport RH — Réinitialisation de votre mot de passe"
    message.set_content(
        "Une demande de réinitialisation de mot de passe a été effectuée pour ce compte.\n\n"
        f"Ce lien est valable {libelle_duree(validite)} et ne peut être utilisé qu'une seule fois :\n"
        f"{lien}\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n"
    )
    return message


class ServiceCourriel:
    def __init__(self, configuration: Configuration) -> None:
        self._configuration = configuration
        self._places = asyncio.Semaphore(ENVOIS_SIMULTANES)
        self._en_cours: set[asyncio.Task[None]] = set()

    def envoyer_lien_reinitialisation(self, destinataire: str, jeton: str, validite: timedelta) -> None:
        """Planifie l'envoi. @raise FileSaturee si la file de l'exécuteur est pleine."""
        if len(self._en_cours) >= ENVOIS_SIMULTANES + FILE_ATTENTE:
            raise FileSaturee
        c = self._configuration
        message = composer_lien_reinitialisation(c.mail_from, destinataire, c.frontend_url, jeton, validite)
        tache = asyncio.get_running_loop().create_task(self._envoyer(message))
        self._en_cours.add(tache)
        tache.add_done_callback(self._en_cours.discard)

    async def _envoyer(self, message: EmailMessage) -> None:
        c = self._configuration
        async with self._places:
            try:
                await aiosmtplib.send(
                    message,
                    hostname=c.smtp_host,
                    port=c.smtp_port,
                    username=c.smtp_username if c.smtp_auth else None,
                    password=c.smtp_password.get_secret_value() if c.smtp_auth else None,
                    start_tls=c.smtp_starttls,
                    timeout=DELAI_CONNEXION,
                )
                journal.info("Email de réinitialisation envoyé")
            except aiosmtplib.SMTPException, OSError, TimeoutError:
                journal.warning("Échec de l'envoi de l'email de réinitialisation", exc_info=True)

    async def attendre_envois(self) -> None:
        """À l'arrêt de l'application : laisse les envois en cours se terminer (comme `waitForTasksToComplete`)."""
        if self._en_cours:
            await asyncio.gather(*self._en_cours, return_exceptions=True)
