export interface OCRResponse {
  latex: string;
  raw: string;
  request_id?: string;
}

export interface OCRError {
  error: string;
  detail?: string;
  request_id?: string;
}

/**
 * Call OCR API to recognize formula from image
 */
export async function recognizeFormula(imageFile: File): Promise<OCRResponse> {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as OCRError;
    throw new Error(error.detail || error.error || 'OCR request failed');
  }

  return data as OCRResponse;
}

