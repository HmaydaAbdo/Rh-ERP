"""Le juge s'appuie sur l'évaluateur ``openevals`` : verdict structuré rendu tel quel, panne capturée."""

from typing import Any

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from staport_ia.juge import Verdict, juger


class ModeleSimule(GenericFakeChatModel):
    """Faux modèle dont ``with_structured_output`` rend un exécutable fixe, comme un vrai modèle le ferait."""

    verdict: Any = None
    panne: Exception | None = None

    def with_structured_output(self, schema: Any, **kwargs: Any) -> Any:  # pyright: ignore[reportIncompatibleMethodOverride]
        from langchain_core.runnables import RunnableLambda

        def rendre(_: Any) -> Any:
            if self.panne is not None:
                raise self.panne
            return self.verdict

        return RunnableLambda(rendre)


def _modele(**champs: Any) -> ModeleSimule:
    return ModeleSimule(messages=iter([AIMessage(content="")]), **champs)


async def test_le_juge_rend_le_verdict_structure() -> None:
    attendu = Verdict(raisonnement="ok", correcte=True, complete=True, contradiction=False, francais_clair=True)
    verdict, cause = await juger(_modele(verdict=attendu), "Combien ?", "3000", "répond", "3000 salariés")
    assert cause is None
    assert verdict == attendu


async def test_une_panne_du_juge_est_rapportee_sans_lever() -> None:
    verdict, cause = await juger(_modele(panne=RuntimeError("quota")), "Q", "V", "A", "R")
    assert verdict is None
    assert cause is not None and cause.startswith("RuntimeError")
