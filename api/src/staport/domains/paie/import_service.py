from io import BytesIO

from openpyxl import load_workbook

from .schemas import PaieImportAnalyse, PaieImportErreur


class ServiceImportPaie:
    async def analyser(self, contenu: bytes, periode: int) -> PaieImportAnalyse:
        feuille = load_workbook(BytesIO(contenu), read_only=True, data_only=True).active
        erreurs: list[PaieImportErreur] = []
        avertissements: list[PaieImportErreur] = []
        lignes = list(feuille.iter_rows(values_only=True)) if feuille else []
        for numero, ligne in enumerate(lignes[3:], start=4):
            cin = str(ligne[2]).strip() if len(ligne) > 2 and ligne[2] is not None else None
            nom = str(ligne[1]).strip() if len(ligne) > 1 and ligne[1] is not None else None
            for index, champ in (
                (9, "salaireMensuel"),
                (10, "primeRoulageOrdinaire"),
                (11, "primeRoulageDimanche"),
                (12, "salaireTotal"),
            ):
                valeur = ligne[index] if len(ligne) > index else None
                if valeur is None:
                    continue
                try:
                    nombre = float(str(valeur))
                except TypeError, ValueError:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="valeur non numérique",
                        )
                    )
                    continue
                if nombre < 0 or nombre > 99_999_999.99 or round(nombre, 2) != nombre:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="valeur hors limites ou plus de deux décimales",
                        )
                    )
                elif champ == "salaireMensuel" and nombre == 0:
                    avertissements.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur="0",
                            raison="salaire nul : cliquer sur « Ignorer et conserver 0 »",
                            avertissement=True,
                        )
                    )
        return PaieImportAnalyse(
            periode=periode,
            total_lignes=max(0, len(lignes) - 3),
            erreurs=erreurs,
            avertissements=avertissements,
            pret=not erreurs and not avertissements,
        )
