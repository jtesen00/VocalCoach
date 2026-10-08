import { useEffect, useState } from 'react';
import { deleteModel, isModelDownloaded, modelSizeLabel, SEPARATION_MODEL } from '../../audio/separation-model';

/** Fase 8c: estado del modelo de separación de voz y opción de liberar espacio. */
export function SeparationModelPanel({ detailed }: { detailed: boolean }) {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    isModelDownloaded().then(setReady);
  }, []);

  return (
    <fieldset>
      <legend>Separador de voz con IA</legend>
      <p className="hint">
        Al importar una canción desde audio, puedes separar la voz de los instrumentos antes de analizar la melodía. Funciona en tu
        dispositivo: el audio no sale de él.
      </p>
      {ready === null ? null : ready ? (
        <p>
          Descargado ({modelSizeLabel}).{' '}
          <button
            className="link"
            onClick={async () => {
              await deleteModel();
              setReady(false);
            }}
          >
            Borrar para liberar espacio
          </button>
        </p>
      ) : (
        <p>No descargado. Se descarga ({modelSizeLabel}) la primera vez que lo uses en Canciones → Importar.</p>
      )}
      <p className="hint">
        Modelo {SEPARATION_MODEL.name}: Demucs de Meta, licencia {SEPARATION_MODEL.license}; exportación a ONNX de StemSplit.
        {detailed && ` Se ejecuta con ONNX Runtime Web: WebGPU si el navegador lo ofrece${'gpu' in navigator ? ' (este sí)' : ' (este no: usa la CPU)'}.`}
      </p>
    </fieldset>
  );
}
