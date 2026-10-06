use serde::Serialize;

use std::fs;
use std::fs::File;
use std::io::BufReader;
use std::net::TcpStream;
use std::process::Command;
use std::thread;
use std::time::Duration;
use std::path::{
    Path,
    PathBuf,
};

use exif::{
    In,
    Reader,
    Tag,
    Value,
};

use image::GenericImageView;
use tauri::{
    Manager,
};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMetadata {
    pub date_taken: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub images: Vec<String>,

    pub skipped_files: usize,

    pub read_errors: usize,

    pub metadata: Vec<PhotoMetadata>,
}

fn is_supported_image(
    path: &Path,
) -> bool {
    let extension =
        match path
            .extension()
            .and_then(|value| value.to_str())
        {
            Some(value) =>
                value.to_ascii_lowercase(),

            None => return false,
        };

    matches!(
        extension.as_str(),

        "jpg"
            | "jpeg"
            | "png"
            | "webp"
            | "bmp"
            | "gif"
            | "tif"
            | "tiff"
    )
}

fn read_exif_string(
    exif: &exif::Exif,
    tag: Tag,
) -> Option<String> {
    exif.get_field(
        tag,
        In::PRIMARY,
    )
    .map(|field| {
        field
            .display_value()
            .with_unit(exif)
            .to_string()
            .trim_matches('"')
            .trim()
            .to_string()
    })
    .filter(|value| !value.is_empty())
}

fn read_gps_coordinate(
    exif: &exif::Exif,
    value_tag: Tag,
    ref_tag: Tag,
) -> Option<f64> {
    let value_field =
        exif.get_field(
            value_tag,
            In::PRIMARY,
        )?;

    let values =
        match &value_field.value {
            Value::Rational(values)
                if values.len() >= 3 =>
            {
                values
            }

            _ => return None,
        };

    let degrees =
        values[0].to_f64();

    let minutes =
        values[1].to_f64();

    let seconds =
        values[2].to_f64();

    let mut coordinate =
        degrees
            + minutes / 60.0
            + seconds / 3600.0;

    if let Some(reference_field) =
        exif.get_field(
            ref_tag,
            In::PRIMARY,
        )
    {
        let reference =
            reference_field
                .display_value()
                .to_string()
                .to_uppercase();

        if reference.contains('S')
            || reference.contains('W')
        {
            coordinate *= -1.0;
        }
    }

    Some(coordinate)
}

fn read_exif_date(
    exif: &exif::Exif,
) -> Option<String> {
    let date_tags = [
        Tag::DateTimeOriginal,
        Tag::DateTimeDigitized,
        Tag::DateTime,
    ];

    for tag in date_tags {
        if let Some(field) =
            exif.get_field(
                tag,
                In::PRIMARY,
            )
        {
            let value =
                field
                    .display_value()
                    .to_string()
                    .trim_matches('"')
                    .trim()
                    .to_string();

            if !value.is_empty() {
                return Some(value);
            }
        }
    }

    None
}

fn extract_metadata(
    path: &Path,
) -> PhotoMetadata {
    let file_size =
        fs::metadata(path)
            .ok()
            .map(|metadata| metadata.len());

    let dimensions =
        image::open(path)
            .ok()
            .map(|image| image.dimensions());

    let mut metadata =
        PhotoMetadata {
            date_taken: None,
            latitude: None,
            longitude: None,
            camera_make: None,
            camera_model: None,

            width:
                dimensions
                    .map(|value| value.0),

            height:
                dimensions
                    .map(|value| value.1),

            file_size,
        };

    let file =
        match File::open(path) {
            Ok(file) => file,

            Err(_) => {
                return metadata;
            }
        };

    let mut reader =
        BufReader::new(file);

    let exif_reader =
        match Reader::new()
            .read_from_container(
                &mut reader,
            )
        {
            Ok(exif) => exif,

            Err(_) => {
                return metadata;
            }
        };

    metadata.date_taken =
        read_exif_date(
            &exif_reader,
        );

    metadata.camera_make =
        read_exif_string(
            &exif_reader,
            Tag::Make,
        );

    metadata.camera_model =
        read_exif_string(
            &exif_reader,
            Tag::Model,
        );

    metadata.latitude =
        read_gps_coordinate(
            &exif_reader,
            Tag::GPSLatitude,
            Tag::GPSLatitudeRef,
        );

    metadata.longitude =
        read_gps_coordinate(
            &exif_reader,
            Tag::GPSLongitude,
            Tag::GPSLongitudeRef,
        );

    metadata
}

fn collect_images(
    directory: &Path,

    images: &mut Vec<String>,

    metadata: &mut Vec<PhotoMetadata>,

    skipped_files: &mut usize,

    read_errors: &mut usize,
) {
    let entries =
        match fs::read_dir(directory) {
            Ok(entries) => entries,

            Err(error) => {
                eprintln!(
                    "[SCAN] Cannot read directory {:?}: {}",
                    directory,
                    error,
                );

                *read_errors += 1;

                return;
            }
        };

    for entry in entries {
        let entry =
            match entry {
                Ok(entry) => entry,

                Err(error) => {
                    eprintln!(
                        "[SCAN] Failed to read directory entry: {}",
                        error,
                    );

                    *read_errors += 1;

                    continue;
                }
            };

        let path: PathBuf =
            entry.path();

        if path.is_dir() {
            collect_images(
                &path,
                images,
                metadata,
                skipped_files,
                read_errors,
            );

            continue;
        }

        if !path.is_file() {
            continue;
        }

        if !is_supported_image(&path) {
            *skipped_files += 1;

            continue;
        }

        let photo_metadata =
            extract_metadata(&path);

        let final_path =
            fs::canonicalize(&path)
                .unwrap_or(path.clone());

        images.push(
            final_path
                .to_string_lossy()
                .to_string(),
        );

        metadata.push(
            photo_metadata,
        );
    }
}

#[tauri::command]
fn scan_photo_folder(
    folder_path: String,
) -> Result<ScanResult, String> {
    let folder =
        PathBuf::from(folder_path);

    if !folder.exists() {
        return Err(
            "Selected folder does not exist."
                .to_string(),
        );
    }

    if !folder.is_dir() {
        return Err(
            "Selected path is not a folder."
                .to_string(),
        );
    }

    println!(
        "[SCAN] Starting scan: {:?}",
        folder,
    );

    let mut images: Vec<String> =
        Vec::new();

    let mut metadata:
        Vec<PhotoMetadata> =
        Vec::new();

    let mut skipped_files =
        0usize;

    let mut read_errors =
        0usize;

    collect_images(
        &folder,
        &mut images,
        &mut metadata,
        &mut skipped_files,
        &mut read_errors,
    );

    let mut combined:
        Vec<(
            String,
            PhotoMetadata,
        )> =
        images
            .into_iter()
            .zip(
                metadata.into_iter(),
            )
            .collect();

    combined.sort_by(
        |left, right| {
            left.0.cmp(&right.0)
        },
    );

    let (
        sorted_images,
        sorted_metadata,
    ): (
        Vec<String>,
        Vec<PhotoMetadata>,
    ) =
        combined
            .into_iter()
            .unzip();

    println!(
        "[SCAN] Complete. Images: {}, Skipped: {}, Errors: {}",
        sorted_images.len(),
        skipped_files,
        read_errors,
    );

    Ok(
        ScanResult {
            images:
                sorted_images,

            skipped_files,

            read_errors,

            metadata:
                sorted_metadata,
        },
    )
}

#[cfg_attr(
    mobile,
    tauri::mobile_entry_point
)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_dialog::init(),
        )
        .plugin(
            tauri_plugin_opener::init(),
        )
        .invoke_handler(
            tauri::generate_handler![
                scan_photo_folder
            ],
        )
        .setup(|app| {
            let resource_directory =
                app.path().resource_dir()?;
            let backend_executable =
                resource_directory
                    .join("backend-dist")
                    .join("ai-photo-backend.exe");

            if !backend_executable.exists() {
                return Ok(());
            }

            let data_directory =
                app.path().app_data_dir()?;
            fs::create_dir_all(
                &data_directory,
            )?;

            let mut backend_command =
                Command::new(
                    &backend_executable,
                );
            backend_command
                .args([
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                ])
                .env(
                    "AI_PHOTO_DATA_DIR",
                    &data_directory,
                )
                .current_dir(
                    &resource_directory,
                );

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;

                backend_command
                    .creation_flags(0x08000000);
            }

            backend_command.spawn()?;

            for _ in 0..100 {
                if TcpStream::connect(
                    "127.0.0.1:8000",
                )
                .is_ok()
                {
                    break;
                }

                thread::sleep(
                    Duration::from_millis(100),
                );
            }

            Ok(())
        })
        .run(
            tauri::generate_context!(),
        )
        .expect(
            "error while running Tauri application",
        );
}