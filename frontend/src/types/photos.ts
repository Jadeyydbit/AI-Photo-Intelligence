export interface PhotoMetadata {
  dateTaken: string | null;

  latitude: number | null;
  longitude: number | null;

  cameraMake: string | null;
  cameraModel: string | null;

  width: number | null;
  height: number | null;

  fileSize: number | null;
}


export interface ScanResult {
  images: string[];

  skipped_files: number;
  read_errors: number;

  metadata: PhotoMetadata[];
}


export interface PhotoItem {
  path: string;
  src: string;
  name: string;

  dateTaken: string | null;

  latitude: number | null;
  longitude: number | null;

  cameraMake: string | null;
  cameraModel: string | null;

  width: number | null;
  height: number | null;

  fileSize: number | null;
}