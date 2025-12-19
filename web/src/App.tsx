import { useState, useRef, useEffect } from 'react';
import { recognizeFormula, OCRResponse } from './api';
import { compressImage, getImageFromClipboard, validateImageFile } from './utils/image';

// Declare MathJax global
declare global {
  interface Window {
    MathJax: any;
  }
}

function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<OCRResponse | null>(null);
  const [mathmlFallback, setMathmlFallback] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const resolvedMathML = result?.mathml || mathmlFallback;

  // Handle paste event
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const file = await getImageFromClipboard(e);
      if (file) {
        e.preventDefault();
        await handleFileSelect(file);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Re-render MathJax when result changes
  useEffect(() => {
    if (result && renderRef.current && window.MathJax) {
      window.MathJax.typesetClear([renderRef.current]);
      window.MathJax.typesetPromise([renderRef.current]).catch((err: any) => {
        console.error('MathJax rendering error:', err);
      });
    }
  }, [result]);

  // Convert LaTeX to MathML on the client as a fallback when server did not respond with MathML
  useEffect(() => {
    setMathmlFallback('');

    if (!result?.latex || result.mathml) {
      return;
    }

    let cancelled = false;
    const convert = async () => {
      const mathJax = window.MathJax;
      if (!mathJax?.tex2mmlPromise) {
        return;
      }

      try {
        const isDisplay = result.latex.includes('\\begin') || result.latex.includes('\\\\') || result.latex.includes('\n');
        const mathml = await mathJax.tex2mmlPromise(result.latex, { display: isDisplay });
        if (!cancelled) {
          setMathmlFallback(mathml);
        }
      } catch (conversionError) {
        console.error('MathML conversion error:', conversionError);
      }
    };

    convert();

    return () => {
      cancelled = true;
    };
  }, [result]);

  const handleFileSelect = async (file: File) => {
    setError('');
    setResult(null);

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    // Compress if needed
    const processedFile = await compressImage(file);
    setImageFile(processedFile);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(processedFile);

    // Auto-recognize
    await recognizeImage(processedFile);
  };

  const recognizeImage = async (file: File) => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await recognizeFormula(file);
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'Recognition failed');
      console.error('OCR error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleCopyLatex = () => {
    if (result?.latex) {
      navigator.clipboard.writeText(result.latex);
      alert('LaTeX copied to clipboard!');
    }
  };

  const handleCopyMathML = () => {
    if (resolvedMathML) {
      navigator.clipboard.writeText(resolvedMathML);
      alert('MathML copied to clipboard!');
    }
  };

  const handleRetry = () => {
    if (imageFile) {
      recognizeImage(imageFile);
    }
  };

  const handleClear = () => {
    setImageFile(null);
    setImagePreview('');
    setResult(null);
    setMathmlFallback('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container">
      <header>
        <h1>📐 Formula OCR</h1>
        <p>基于 PaddleOCR-VL 的公式识别服务</p>
      </header>

      <main>
        {/* Upload Area */}
        <div className="upload-section">
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
            
            {imagePreview ? (
              <div className="preview">
                <img src={imagePreview} alt="Preview" />
              </div>
            ) : (
              <div className="upload-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="17 8 12 3 7 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="3" x2="12" y2="15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p>拖拽图片到此处，或点击上传</p>
                <p className="hint">支持粘贴（Ctrl+V）· JPEG/PNG/WebP · 最大 8MB</p>
              </div>
            )}
          </div>
          
          {/* Clear Button */}
          {imagePreview && (
            <button onClick={handleClear} className="btn-clear">
              清空
            </button>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="status loading">
            <div className="spinner"></div>
            <p>识别中...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="status error">
            <p>❌ {error}</p>
            {imageFile && (
              <button onClick={handleRetry} className="btn-secondary">
                重试
              </button>
            )}
          </div>
        )}

        {/* Results - Always show */}
        <div className="results">
          <div className="result-section">
            <div className="section-header">
              <h2>LaTeX 代码</h2>
              {result?.latex && (
                <button onClick={handleCopyLatex} className="btn-copy">
                  复制
                </button>
              )}
            </div>
            <textarea
              className="latex-output"
              value={result?.latex || ''}
              placeholder="LaTeX 代码将显示在这里..."
              readOnly
              rows={4}
            />
          </div>
          
          <div className="result-section">
            <div className="section-header">
              <h2>MathML 代码</h2>
              {resolvedMathML && (
                <button onClick={handleCopyMathML} className="btn-copy">
                  复制
                </button>
              )}
            </div>
            <textarea
              className="latex-output"
              value={resolvedMathML || ''}
              placeholder="MathML 代码将显示在这里..."
              readOnly
              rows={4}
            />
            <p className="hint">可直接复制粘贴到 Word、WPS 等文档编辑器。</p>
          </div>

          <div className="result-section">
            <h2>渲染结果</h2>
            <div className="render-output" ref={renderRef}>
              {result?.latex ? (
                result.latex.includes('\\begin') || result.latex.includes('\\\\') ? (
                  <div>{'\\[' + result.latex + '\\]'}</div>
                ) : (
                  <div>{'$$' + result.latex + '$$'}</div>
                )
              ) : (
                <div className="placeholder-text">渲染结果将显示在这里...</div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer>
        <p>
          支持拖拽、粘贴、点击上传 · 
          <a href="https://github.com/PaddlePaddle/PaddleOCR" target="_blank" rel="noopener noreferrer">
            PaddleOCR
          </a>
          {' · '}
          <span className="zellin-logo">Powered by Zellin</span>
        </p>
      </footer>
    </div>
  );
}

export default App;

