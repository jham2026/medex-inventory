import { useEffect, useRef, useState } from 'react';

// Dynamically load QuaggaJS from CDN
function loadQuagga() {
  return new Promise((resolve, reject) => {
    if (window.Quagga) { resolve(window.Quagga); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
    s.onload = () => resolve(window.Quagga);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef   = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    loadQuagga().then(Quagga => {
      if (!active) return;
      Quagga.init({
        inputStream: {
          name: 'Live',
          type: 'LiveStream',
          target: videoRef.current,
          constraints: { facingMode: 'environment', width: 640, height: 480 },
        },
        decoder: {
          readers: ['code_128_reader','ean_reader','ean_8_reader','code_39_reader','upc_reader','upc_e_reader'],
        },
        locate: true,
      }, err => {
        if (err) { setError('Camera not available: ' + err.message); return; }
        Quagga.start();
        setReady(true);
      });

      Quagga.onDetected(result => {
        const code = result?.codeResult?.code;
        if (code) {
          Quagga.stop();
          onDetected(code);
        }
      });
    }).catch(() => setError('Could not load barcode scanner.'));

    return () => {
      active = false;
      if (window.Quagga) { try { window.Quagga.stop(); } catch(e) {} }
    };
  }, [onDetected]);

  return (
    <div className="scan-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
        📷 Scan Barcode
      </div>

      {error ? (
        <div style={{ color: '#ff8080', textAlign: 'center', maxWidth: 320 }}>{error}</div>
      ) : (
        <div className="scan-viewport">
          <div ref={videoRef} style={{ width: '100%', height: '100%' }} />
          {ready && <div className="scan-line" />}
        </div>
      )}

      <div className="scan-hint">Point camera at barcode — auto-detects</div>
      <button className="btn btn-utility" onClick={onClose}>Cancel</button>
    </div>
  );
}
