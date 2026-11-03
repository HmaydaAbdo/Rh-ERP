"""Connexion, session, mot de passe oublié (parité avec `AuthService` de Spring).

Chaque méthode publique ouvre sa transaction (`session.begin()`). Quand un refus doit laisser une trace en base
(compteur d'échecs, famille de jetons révoquée), la méthode retourne l'erreur au lieu de la lever dans la transaction,
puis la lève après le commit : c'est le `noRollbackFor` de Spring.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository
from staport.domains.auth.courriel import FileSaturee, ServiceCourriel
from staport.domains.auth.exceptions import (
    IdentifiantsInvalides,
    LienReinitialisationInvalide,
    MotDePasseNonConforme,
    RefreshTokenInvalide,
)
from staport.domains.auth.mappage import noms_des_roles, permissions_effectives, utilisateur_reponse
from staport.domains.auth.models import RefreshToken, ResetPasswordToken, Utilisateur, maintenant
from staport.domains.auth.parametres import ParametresSecurite
from staport.domains.auth.schemas import ConnexionReponse
from staport.domains.auth.securite import EmetteurJetons, Hacheur, generer_jeton_brut, hasher_jeton
from staport.domains.common.securite import ActionSecurite as Action
from staport.domains.common.securite import EvenementSecurite, PublicationEvenements

journal = logging.getLogger(__name__)

SEUIL_ECHECS_CONNEXION = 5
FENETRE_ECHECS_CONNEXION = timedelta(minutes=15)
DUREE_VERROUILLAGE_CONNEXION = timedelta(minutes=15)


@dataclass(frozen=True)
class Connexion:
    reponse: ConnexionReponse
    refresh_brut: str
    duree_session: timedelta


def exiger_mot_de_passe_conforme(mot_de_passe: str, identifiant: str, longueur_min: int) -> None:
    """Règle unique : longueur minimale réglable et différent de l'identifiant (sans tenir compte de la casse)."""
    if len(mot_de_passe) < longueur_min or mot_de_passe.lower() == identifiant.lower():
        raise MotDePasseNonConforme(longueur_min)


def _reinitialiser_echecs(utilisateur: Utilisateur) -> None:
    utilisateur.nombre_echecs_connexion = 0
    utilisateur.derniere_echec_connexion = None
    utilisateur.verrouillage_jusqua = None


class ServiceAuth:
    def __init__(
        self,
        hacheur: Hacheur,
        emetteur: EmetteurJetons,
        parametres: ParametresSecurite,
        evenements: PublicationEvenements,
        courriel: ServiceCourriel,
    ) -> None:
        self._hacheur = hacheur
        self._emetteur = emetteur
        self._parametres = parametres
        self._evenements = evenements
        self._courriel = courriel

    # --- Connexion --------------------------------------------------------------------------------------------------

    async def login(self, session: AsyncSession, username: str, mot_de_passe: str) -> Connexion:
        async with session.begin():
            resultat = await self._login(session, username, mot_de_passe)
        if isinstance(resultat, IdentifiantsInvalides):
            raise resultat
        return resultat

    async def _login(
        self, session: AsyncSession, username: str, mot_de_passe: str
    ) -> Connexion | IdentifiantsInvalides:
        utilisateur = await repository.utilisateur_par_username_verrou(session, username.strip())
        if utilisateur is None:
            # Même travail de hachage que pour un compte existant : sans lui, la rapidité de la réponse révélerait
            # qu'un identifiant n'existe pas. L'identifiant saisi n'est pas conservé : ce peut être un mot de passe.
            await self._hacheur.verifier_et_mettre_a_jour(mot_de_passe, self._hacheur.empreinte_factice)
            self._evenements.publier(EvenementSecurite(Action.CONNEXION_ECHOUEE, motif="COMPTE_INCONNU"))
            return IdentifiantsInvalides()
        # Le mot de passe est toujours vérifié, même pour un compte inactif : la durée ne distingue pas les cas.
        valide, nouvelle_empreinte = await self._hacheur.verifier_et_mettre_a_jour(
            mot_de_passe, utilisateur.mot_de_passe_hash
        )
        if not utilisateur.actif:
            return self._refuser(utilisateur, "COMPTE_INACTIF")
        maintenant_utc = datetime.now(UTC)
        verrou = utilisateur.verrouillage_jusqua
        if verrou is not None and verrou > maintenant_utc:
            return self._refuser(utilisateur, "COMPTE_TEMPORAIREMENT_BLOQUE")
        if verrou is not None:
            _reinitialiser_echecs(utilisateur)
        if not valide:
            self._enregistrer_echec(utilisateur, maintenant_utc)
            return IdentifiantsInvalides()
        _reinitialiser_echecs(utilisateur)
        if nouvelle_empreinte is not None:  # empreinte BCrypt de Spring remplacée par Argon2
            utilisateur.mot_de_passe_hash = nouvelle_empreinte
        connexion = await self._emettre_connexion(session, utilisateur, str(uuid.uuid4()))
        self._evenements.publier(EvenementSecurite(Action.CONNEXION_REUSSIE, utilisateur.id, utilisateur.username))
        return connexion

    def _refuser(self, utilisateur: Utilisateur, motif: str) -> IdentifiantsInvalides:
        """La réponse reste identique quel que soit le motif ; seul le journal le connaît."""
        self._evenements.publier(
            EvenementSecurite(Action.CONNEXION_ECHOUEE, utilisateur.id, utilisateur.username, motif)
        )
        return IdentifiantsInvalides()

    def _enregistrer_echec(self, utilisateur: Utilisateur, maintenant_utc: datetime) -> None:
        derniere = utilisateur.derniere_echec_connexion
        dans_la_fenetre = derniere is not None and derniere + FENETRE_ECHECS_CONNEXION > maintenant_utc
        echecs = utilisateur.nombre_echecs_connexion + 1 if dans_la_fenetre else 1
        utilisateur.nombre_echecs_connexion = echecs
        utilisateur.derniere_echec_connexion = maintenant_utc
        self._evenements.publier(
            EvenementSecurite(Action.CONNEXION_ECHOUEE, utilisateur.id, utilisateur.username, "IDENTIFIANTS_INVALIDES")
        )
        if echecs >= SEUIL_ECHECS_CONNEXION:
            utilisateur.verrouillage_jusqua = maintenant_utc + DUREE_VERROUILLAGE_CONNEXION
            self._evenements.publier(
                EvenementSecurite(
                    Action.COMPTE_BLOQUE_TEMPORAIREMENT,
                    utilisateur.id,
                    utilisateur.username,
                    details={
                        "tentatives": SEUIL_ECHECS_CONNEXION,
                        "fenetreMinutes": int(FENETRE_ECHECS_CONNEXION.total_seconds() // 60),
                        "dureeMinutes": int(DUREE_VERROUILLAGE_CONNEXION.total_seconds() // 60),
                    },
                )
            )

    # --- Renouvellement ---------------------------------------------------------------------------------------------

    async def refresh(self, session: AsyncSession, refresh_brut: str) -> Connexion:
        """Rotation à usage unique. Un jeton déjà consommé présenté de nouveau signale un vol possible : toute la
        famille est révoquée (reconnexion complète), et cette révocation reste enregistrée malgré le refus."""
        async with session.begin():
            resultat = await self._refresh(session, refresh_brut)
        if isinstance(resultat, RefreshTokenInvalide):
            raise resultat
        return resultat

    async def _refresh(self, session: AsyncSession, refresh_brut: str) -> Connexion | RefreshTokenInvalide:
        existant = await repository.refresh_par_empreinte(session, hasher_jeton(refresh_brut))
        if existant is None:
            self._evenements.publier(EvenementSecurite(Action.SESSION_RENOUVELLEMENT_REFUSE, motif="JETON_INCONNU"))
            return RefreshTokenInvalide()
        proprietaire = await repository.utilisateur_par_id(session, existant.utilisateur_id)
        if proprietaire is None:  # impossible : clé étrangère
            return RefreshTokenInvalide()
        if existant.revoque:
            famille = await repository.refresh_actifs_de_la_famille(session, existant.famille)
            for jeton in famille:
                jeton.revoque = True
            journal.warning(
                "Refresh token déjà consommé réutilisé : famille révoquée, sessions coupées=%d", len(famille)
            )
            self._evenements.publier(
                EvenementSecurite(
                    Action.JETON_REUTILISE,
                    proprietaire.id,
                    proprietaire.username,
                    details={"sessionsRevoquees": len(famille)},
                )
            )
            return RefreshTokenInvalide()
        if existant.expire_le < maintenant():
            self._evenements.publier(
                EvenementSecurite(
                    Action.SESSION_RENOUVELLEMENT_REFUSE, proprietaire.id, proprietaire.username, "JETON_EXPIRE"
                )
            )
            return RefreshTokenInvalide()
        existant.revoque = True
        # Une session ne survit pas à la désactivation du compte, quelle que soit la façon dont il a été désactivé.
        if not proprietaire.actif:
            self._evenements.publier(
                EvenementSecurite(
                    Action.SESSION_RENOUVELLEMENT_REFUSE, proprietaire.id, proprietaire.username, "COMPTE_INACTIF"
                )
            )
            return RefreshTokenInvalide()
        connexion = await self._emettre_connexion(session, proprietaire, existant.famille)
        self._evenements.publier(EvenementSecurite(Action.SESSION_RENOUVELEE, proprietaire.id, proprietaire.username))
        return connexion

    # --- Déconnexion ------------------------------------------------------------------------------------------------

    async def logout(self, session: AsyncSession, refresh_brut: str | None) -> None:
        async with session.begin():
            if refresh_brut is None or not refresh_brut.strip():
                self._evenements.publier(EvenementSecurite(Action.DECONNEXION))
                return
            jeton = await repository.refresh_par_empreinte(session, hasher_jeton(refresh_brut))
            if jeton is None:
                self._evenements.publier(EvenementSecurite(Action.DECONNEXION, motif="SESSION_INCONNUE"))
                return
            jeton.revoque = True
            proprietaire = await repository.utilisateur_par_id(session, jeton.utilisateur_id)
            if proprietaire is not None:
                self._evenements.publier(EvenementSecurite(Action.DECONNEXION, proprietaire.id, proprietaire.username))

    # --- Mot de passe oublié ----------------------------------------------------------------------------------------

    async def demander_reinitialisation(self, session: AsyncSession, email: str) -> None:
        """Réponse identique que l'adresse corresponde ou non à un compte : jamais révéler si un compte existe."""
        async with session.begin():
            compte = await repository.utilisateur_par_email(session, email.strip())
            # Un événement à chaque demande (repère les demandes en rafale) : le compte s'il existe, jamais l'adresse.
            if compte is None:
                self._evenements.publier(EvenementSecurite(Action.MOT_DE_PASSE_OUBLIE))
                return
            self._evenements.publier(EvenementSecurite(Action.MOT_DE_PASSE_OUBLIE, compte.id, compte.username))
            validite = await self._parametres.duree_lien_reinitialisation(session)
            brut = generer_jeton_brut()
            session.add(
                ResetPasswordToken(
                    utilisateur_id=compte.id, token_hash=hasher_jeton(brut), expire_le=maintenant() + validite
                )
            )
            destinataire = compte.email
        try:
            self._courriel.envoyer_lien_reinitialisation(destinataire, brut, validite)
        except FileSaturee:
            # La réponse reste identique et immédiate ; le journal signale le rejet sans PII ni jeton.
            journal.warning("Courriel de réinitialisation non planifié : file asynchrone saturée")

    async def reinitialiser_mot_de_passe(self, session: AsyncSession, jeton_brut: str, nouveau: str) -> None:
        async with session.begin():
            jeton = await repository.reinitialisation_par_empreinte(session, hasher_jeton(jeton_brut))
            if jeton is None or jeton.utilise or jeton.expire_le < maintenant():
                raise LienReinitialisationInvalide
            utilisateur = await repository.utilisateur_par_id(session, jeton.utilisateur_id)
            if utilisateur is None:
                raise LienReinitialisationInvalide
            # Avant de consommer le lien : un mot de passe refusé ne brûle pas le lien, l'utilisateur peut resaisir.
            longueur = await self._parametres.longueur_minimale_mot_de_passe(session)
            exiger_mot_de_passe_conforme(nouveau, utilisateur.username, longueur)
            utilisateur.mot_de_passe_hash = await self._hacheur.hacher(nouveau)
            jeton.utilise = True
            await self.revoquer_sessions_sans_transaction(session, utilisateur.id)
            self._evenements.publier(
                EvenementSecurite(Action.MOT_DE_PASSE_REINITIALISE, utilisateur.id, utilisateur.username)
            )

    async def politique_longueur_minimale(self, session: AsyncSession) -> int:
        return await self._parametres.longueur_minimale_mot_de_passe(session)

    # --- Sessions ---------------------------------------------------------------------------------------------------

    async def revoquer_sessions(self, session: AsyncSession, utilisateur_id: int) -> int:
        async with session.begin():
            return await self.revoquer_sessions_sans_transaction(session, utilisateur_id)

    async def revoquer_sessions_sans_transaction(self, session: AsyncSession, utilisateur_id: int) -> int:
        """À appeler dans une transaction déjà ouverte (désactivation de compte, réinitialisations)."""
        actifs = await repository.refresh_actifs_de_l_utilisateur(session, utilisateur_id)
        for jeton in actifs:
            jeton.revoque = True
        if actifs:
            self._evenements.publier(
                EvenementSecurite(
                    Action.SESSIONS_REVOQUEES,
                    details={"utilisateurCibleId": utilisateur_id, "nombre": len(actifs)},
                )
            )
        return len(actifs)

    async def _emettre_connexion(self, session: AsyncSession, utilisateur: Utilisateur, famille: str) -> Connexion:
        permissions = permissions_effectives(utilisateur)
        roles = noms_des_roles(utilisateur)
        duree_acces = await self._parametres.duree_jeton_acces(session)
        acces = self._emetteur.emettre_acces(utilisateur.id, utilisateur.username, permissions, roles, duree_acces)
        refresh_brut = generer_jeton_brut()
        duree_session = await self._parametres.duree_jeton_session(session)
        session.add(
            RefreshToken(
                utilisateur_id=utilisateur.id,
                famille=famille,
                token_hash=hasher_jeton(refresh_brut),
                expire_le=maintenant() + duree_session,
            )
        )
        reponse = ConnexionReponse(access_token=acces, utilisateur=await utilisateur_reponse(session, utilisateur))
        return Connexion(reponse, refresh_brut, duree_session)
