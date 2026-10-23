import { Injectable } from '@angular/core';

export interface PdfImpressionDocument {
  titre: string;
  contexte?: string;
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
    fenetre.document.open();
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(document.titre)}</title>
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        * { box-sizing: border-box; }
        body { color: #182230; font: 10pt Arial, sans-serif; margin: 0; }
        header { border-bottom: 2px solid #1d4ed8; margin-bottom: 18px; padding-bottom: 10px; }
        h1 { font-size: 19pt; margin: 0; }
        .contexte { color: #475467; font-size: 10pt; margin: 7px 0 0; }
        .meta { color: #667085; font-size: 8pt; margin-top: 8px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #eef3fb; color: #182230; font-weight: 700; text-align: left; }
        th, td { border: 1px solid #d0d5dd; padding: 6px 8px; vertical-align: top; }
        tr { break-inside: avoid; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        footer { color: #667085; font-size: 8pt; margin-top: 12px; }
      </style></head><body><header><h1>${echapper(document.titre)}</h1>${contexte}<p class="meta">Généré le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())} · ${document.lignes.length} ligne(s)</p></header>
      <table><thead><tr>${entetes}</tr></thead><tbody>${lignes}</tbody></table><footer>Document produit depuis les données affichées dans ERP-RH.</footer>
      <script>window.addEventListener('load', () => window.print());</script></body></html>`);
    fenetre.document.close();
  }
}

function echapper(valeur: string): string {
  return valeur.replace(/[&<>"']/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]!);
}
