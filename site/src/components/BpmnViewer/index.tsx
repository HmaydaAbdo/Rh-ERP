import React, {useEffect, useRef, useState} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';

type Props = {
  /** Chemin du fichier .bpmn sous static/, par exemple « bpmn/import-hs.bpmn ». */
  src: string;
  height?: number;
};

function Viewer({src, height = 360}: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const url = useBaseUrl(src);

  useEffect(() => {
    let viewer: {destroy(): void} | undefined;
    let annule = false;
    (async () => {
      try {
        const [{default: NavigatedViewer}, xml] = await Promise.all([
          import('bpmn-js/lib/NavigatedViewer'),
          fetch(url).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }),
        ]);
        if (annule || !conteneur.current) return;
        const v = new NavigatedViewer({container: conteneur.current});
        viewer = v;
        await v.importXML(xml);
        v.get<{zoom(mode: string): void}>('canvas').zoom('fit-viewport');
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      annule = true;
      viewer?.destroy();
    };
  }, [url]);

  return (
    <>
      <div ref={conteneur} style={{height, border: '1px solid var(--ifm-color-emphasis-300)', background: '#fff'}} />
      {erreur && <p role="alert">Diagramme BPMN illisible : {erreur}</p>}
    </>
  );
}

/** Affiche un fichier BPMN 2.0 versionné dans Git. Le filigrane bpmn.io est exigé par la licence : ne pas le masquer. */
export default function BpmnViewer(props: Props) {
  return <BrowserOnly fallback={<p>Chargement du diagramme…</p>}>{() => <Viewer {...props} />}</BrowserOnly>;
}
