declare global {
  namespace NodeJS {
    interface ProcessEnv {
      OCR_BASE: string;
      OCR_MODEL: string;
      OCR_API_KEY?: string;
      PORT?: string;
      UPSTREAM_TIMEOUT?: string;
      MAX_FILE_MB?: string;
    }
  }
}

export {};

