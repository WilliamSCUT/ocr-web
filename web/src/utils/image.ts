/**
 * Compress image if dimensions exceed threshold
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.92): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      const { width, height } = img;
      
      // Check if compression is needed
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }

      // Calculate new dimensions
      let newWidth = width;
      let newHeight = height;
      
      if (width > height) {
        if (width > maxDimension) {
          newWidth = maxDimension;
          newHeight = (height * maxDimension) / width;
        }
      } else {
        if (height > maxDimension) {
          newHeight = maxDimension;
          newWidth = (width * maxDimension) / height;
        }
      }

      // Create canvas and compress
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: file.type || 'image/jpeg',
            lastModified: Date.now(),
          });

          console.log(`Image compressed: ${width}x${height} -> ${newWidth}x${newHeight}, ${(file.size / 1024).toFixed(1)}KB -> ${(compressedFile.size / 1024).toFixed(1)}KB`);
          
          resolve(compressedFile);
        },
        file.type || 'image/jpeg',
        quality
      );
    };

    img.onerror = reject;

    reader.readAsDataURL(file);
  });
}

/**
 * Get image from clipboard
 */
export async function getImageFromClipboard(event: ClipboardEvent): Promise<File | null> {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      if (blob) {
        return new File([blob], `pasted-${Date.now()}.png`, { type: blob.type });
      }
    }
  }

  return null;
}

/**
 * Validate image file
 */
export function validateImageFile(file: File, maxSizeMB = 8): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file type. Only JPEG, PNG, and WebP are allowed.',
    };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit.`,
    };
  }

  return { valid: true };
}

