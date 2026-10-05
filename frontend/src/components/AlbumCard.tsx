import type { ReactElement } from "react";
import type { PhotoItem } from "../types/photos";

interface AlbumCardProps {
  title: string;
  description: string;
  icon: string;
  photos: PhotoItem[];
  onClick: () => void;
}

export function AlbumCard({
  title,
  description,
  icon,
  photos,
  onClick,
}: AlbumCardProps): ReactElement {
  const previewPhotos = photos.slice(0, 1);

  return (
    <button
      type="button"
      className="album-card"
      onClick={onClick}
      aria-label={`Open ${title} album with ${photos.length} ${
        photos.length === 1 ? "photo" : "photos"
      }`}
    >
      <div className="album-preview">
        {previewPhotos.length > 0 ? (
          previewPhotos.map((photo: PhotoItem) => (
            <img
              key={photo.path}
              src={photo.src}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ))
        ) : (
          <div className="album-empty-preview">
            <span>{icon}</span>
          </div>
        )}

        <div className="album-icon" aria-hidden="true">
          {icon}
        </div>
      </div>

      <div className="album-card-content">
        <h3>{title}</h3>

        <p>{description}</p>

        <span className="album-count">
          {photos.length}{" "}
          {photos.length === 1 ? "photo" : "photos"}
        </span>
      </div>
    </button>
  );
}