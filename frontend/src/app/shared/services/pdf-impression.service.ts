import { Injectable } from '@angular/core';

export interface PdfImpressionDocument {
  titre: string;
  contexte?: string;
  graphiqueDataUrl?: string;
  graphiqueAlt?: string;
  colonnes: string[];
  lignes: (string | number)[][];
}

@Injectable({ providedIn: 'root' })
export class PdfImpressionService {
  ouvrir(): Window | null {
    const fenetre = window.open('', '_blank');
    if (fenetre) {
      fenetre.opener = null;
    }
    return fenetre;
  }

  imprimer(fenetre: Window, document: PdfImpressionDocument): void {
    const entetes = document.colonnes.map((colonne) => `<th scope="col">${echapper(colonne)}</th>`).join('');
    const lignes = document.lignes.map((ligne) => `<tr>${document.colonnes.map((_, index) => `<td>${echapper(String(ligne[index] ?? ''))}</td>`).join('')}</tr>`).join('');
    const contexte = document.contexte ? `<p class="contexte">${echapper(document.contexte)}</p>` : '';
    const graphique = document.graphiqueDataUrl?.startsWith('data:image/png;base64,')
      ? `<figure><img src="${document.graphiqueDataUrl}" alt="${echapper(document.graphiqueAlt ?? 'Graphique exporté avec ses données')}" /></figure>`
      : '';
    fenetre.document.open();
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${echapper(document.titre)}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm 14mm; }
        * { box-sizing: border-box; }
        body { color: #172033; font: 10pt Arial, sans-serif; margin: 0; }
        header { border-bottom: 2px solid #17365d; margin-bottom: 18px; padding-bottom: 12px; }
        .identite { color: #17365d; font-size: 9pt; font-weight: 700; letter-spacing: .08em; margin: 0 0 7px; text-transform: uppercase; }
        h1 { color: #14243a; font-size: 19pt; line-height: 1.25; margin: 0; }
        .contexte { color: #344054; font-size: 10pt; line-height: 1.5; margin: 8px 0 0; }
        .meta { color: #667085; font-size: 8pt; margin: 8px 0 0; }
        figure { margin: 0 0 16px; page-break-inside: avoid; text-align: center; }
        figure img { max-height: 115mm; max-width: 100%; object-fit: contain; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #e9eff7; color: #172033; font-weight: 700; text-align: left; }
        th, td { border: 1px solid #c8d0dc; padding: 7px 9px; vertical-align: top; }
        tr { break-inside: avoid; }
        tbody tr:nth-child(even) { background: #f5f7fa; }
        footer { border-top: 1px solid #c8d0dc; color: #667085; font-size: 8pt; margin-top: 16px; padding-top: 7px; }
        @media screen { body { margin: 24px auto; max-width: 1100px; padding: 0 24px; } }
      </style></head><body><header><p class="identite">Staport · Ressources humaines</p><h1>${echapper(document.titre)}</h1>${contexte}<p class="meta">Édité le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())} · ${document.lignes.length} ligne(s)</p></header>
      ${graphique}<table><thead><tr>${entetes}</tr></thead><tbody>${lignes}</tbody></table><footer>ERP-RH · Document de gestion des ressources humaines</footer>
      <script>window.addEventListener('load', () => window.print());</script></body></html>`);
    fenetre.document.close();
  }
}

function echapper(valeur: string): string {
  return valeur.replace(/[&<>"']/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]!);
}
