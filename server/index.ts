import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { unlink } from 'fs/promises';
import path from 'path';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const OCR_BASE = process.env.OCR_BASE || 'http://127.0.0.1:8118/v1';
const OCR_MODEL = process.env.OCR_MODEL || 'PaddleOCR-VL-0.9B';
const OCR_API_KEY = process.env.OCR_API_KEY || '';
const UPSTREAM_TIMEOUT = parseInt(process.env.UPSTREAM_TIMEOUT || '120000', 10);
const MAX_FILE_MB = parseInt(process.env.MAX_FILE_MB || '8', 10);
const STATIC_DIR = path.resolve(__dirname, '../public');
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';
const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || '60000', 10); // 60s
const RATE_MAX = parseInt(process.env.RATE_MAX || '20', 10); // 20 req/min/IP default
const RATE_MESSAGE = process.env.RATE_MESSAGE || 'Too many requests, please try again later.';

// Middleware
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Rate limiter (API only)
const apiLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', detail: RATE_MESSAGE }
});
app.use('/api/', apiLimiter);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: '/tmp',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'ocr-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

/**
 * Extract LaTeX from model response content
 * Priority: $$...$$ > \[...\] > raw content
 */
export function extractLatex(content: string): string {
  if (!content) return '';

  // Remove markdown code fences
  let cleaned = content.replace(/```latex\s*\n?/g, '').replace(/```\s*$/g, '');
  
  // Remove inline markdown code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  
  // Try to extract $$...$$
  const dollarMatch = cleaned.match(/\$\$([\s\S]*?)\$\$/);
  if (dollarMatch) {
    return dollarMatch[1].trim();
  }
  
  // Try to extract \[...\]
  const bracketMatch = cleaned.match(/\\\[([\s\S]*?)\\\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }
  
  // Return cleaned content as-is
  return cleaned.trim();
}

/**
 * Convert file to base64 data URL
 */
async function fileToDataURL(filePath: string, mimeType: string): Promise<string> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Build payload for PaddleOCR service
 * Aligned with official example format
 */
export function buildPayload(dataURL: string, model: string, preferredFormat: boolean) {
  // Use official task prompt format
  const taskPrompt = "Formula Recognition:";

  // Official format: image_url first, then text prompt
  return {
    model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: dataURL
            }
          },
          {
            type: "text",
            text: taskPrompt
          }
        ]
      }
    ]
  };
}

/**
 * Call upstream OCR service
 */
async function callUpstreamOCR(dataURL: string): Promise<{ latex: string; raw: string }> {
  const payload = buildPayload(dataURL, OCR_MODEL, false);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (OCR_API_KEY) {
    headers['Authorization'] = `Bearer ${OCR_API_KEY}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);

  try {
    const startTime = Date.now();
    const response = await fetch(`${OCR_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OCR] Upstream error (${response.status}): ${errorText.substring(0, 200)}`);
      throw new Error(`Upstream returned ${response.status}: ${errorText.substring(0, 100)}`);
    }

    interface ChatCompletionResponse {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    console.log(`[OCR] Success in ${duration}ms`);

    // Extract content from response
    const rawContent = data.choices?.[0]?.message?.content || '';
    const latex = extractLatex(rawContent);

    return { latex, raw: rawContent };
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error('[OCR] Request timeout');
      throw new Error('Upstream request timeout');
    }
    
    throw error;
  }
}

// POST /api/ocr - Main OCR endpoint
app.post('/api/ocr', upload.single('image'), async (req: Request, res: Response) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  console.log(`[${requestId}] OCR request received`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { path: filePath, mimetype } = req.file;
    console.log(`[${requestId}] Processing ${mimetype} file`);

    try {
      // Convert to data URL
      const dataURL = await fileToDataURL(filePath, mimetype);
      
      // Call upstream service
      const result = await callUpstreamOCR(dataURL);
      
      console.log(`[${requestId}] Success - LaTeX length: ${result.latex.length}`);
      
      res.json({
        latex: result.latex,
        raw: result.raw,
        request_id: requestId
      });
    } finally {
      // Clean up temp file
      try {
        await unlink(filePath);
      } catch (e) {
        console.warn(`[${requestId}] Failed to delete temp file: ${filePath}`);
      }
    }
  } catch (error: any) {
    console.error(`[${requestId}] Error:`, error.message);
    
    if (error.message.includes('timeout')) {
      return res.status(504).json({
        error: 'Request timeout',
        detail: 'The OCR service took too long to respond',
        request_id: requestId
      });
    }
    
    if (error.message.includes('Upstream returned')) {
      return res.status(502).json({
        error: 'Upstream service error',
        detail: error.message,
        request_id: requestId
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      detail: error.message,
      request_id: requestId
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (SERVE_STATIC) {
  app.use(express.static(STATIC_DIR));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    const indexPath = path.join(STATIC_DIR, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

// Handle multer errors
app.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        detail: `Maximum file size is ${MAX_FILE_MB}MB`
      });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error.message && error.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: error.message });
  }
  
  next(error);
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Running on http://127.0.0.1:${PORT}`);
  console.log(`[Server] OCR Base: ${OCR_BASE}`);
  console.log(`[Server] Model: ${OCR_MODEL}`);
  console.log(`[Server] Max file size: ${MAX_FILE_MB}MB`);
});

export default app;

