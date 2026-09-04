/** Interfaz pública del servicio de archivos. */
export {
  uploadFile,
  authorizeDownload,
  redeemDownload,
  deleteFile,
  detectsAs,
  type UploadInput,
  type UploadedFile,
  type DownloadTicket,
  type RedeemedFile,
} from './file-service';
export { applyRetention, type RetentionResult } from './retention';
export { blobStore, blobStoreCapability, setBlobStoreForTests, type BlobStorePort } from './blob-store';
