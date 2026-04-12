const getApproxPayloadBytes = (value) => {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const compressCanvasToDataUrl = (canvas, maxBytes, initialQuality = 0.82, minQuality = 0.45) => {
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (getApproxPayloadBytes(dataUrl) > maxBytes && quality > minQuality) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
};

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`Unable to read file ${file.name}`));
    };
    image.src = imageUrl;
  });

export async function prepareProfilePhotoUpload(
  file,
  {
    maxBytes = 180 * 1024,
    maxDimension = 160,
    recommendedBytes = 900 * 1024,
    recommendedDimension = 1800,
  } = {}
) {
  const image = await loadImageFromFile(file);
  const largestSide = Math.max(image.width, image.height);
  const shouldOfferResize =
    file.size > recommendedBytes || largestSide > recommendedDimension;

  if (shouldOfferResize) {
    const confirmed = window.confirm(
      `"${file.name}" is ${formatFileSize(file.size)} and larger than the recommended profile photo size. Resize it automatically for a faster, safer upload?`
    );

    if (!confirmed) {
      throw new Error(`Upload cancelled for ${file.name}. Please resize the image and try again.`);
    }
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process the selected image.");

  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let dataUrl = compressCanvasToDataUrl(canvas, maxBytes, 0.82, 0.45);

  if (getApproxPayloadBytes(dataUrl) > maxBytes) {
    const retryCanvas = document.createElement("canvas");
    const retryContext = retryCanvas.getContext("2d");
    if (!retryContext) throw new Error("Unable to process the selected image.");

    const retryScale = Math.min(1, Math.max(1, maxDimension - 32) / Math.max(image.width, image.height));
    retryCanvas.width = Math.max(1, Math.round(image.width * retryScale));
    retryCanvas.height = Math.max(1, Math.round(image.height * retryScale));
    retryContext.drawImage(image, 0, 0, retryCanvas.width, retryCanvas.height);
    dataUrl = compressCanvasToDataUrl(retryCanvas, maxBytes, 0.72, 0.4);
  }

  if (getApproxPayloadBytes(dataUrl) > maxBytes) {
    throw new Error("Profile photo is too large even after resizing. Please choose a smaller image.");
  }

  return {
    dataUrl,
    wasResized: shouldOfferResize,
  };
}
