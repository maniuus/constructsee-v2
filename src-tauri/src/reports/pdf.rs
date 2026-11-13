use std::path::{Path, PathBuf};

use comemo::Prehashed;
use ecow::EcoString;
use typst::{
    compile, Library, World, eval::Tracer,
    foundations::{Bytes, Datetime, Smart},
    text::{Font, FontBook},
    syntax::{FileId, package::PackageSpec},
    diag::FileError,
};
use typst_pdf::pdf;

use crate::reports::templates::build_typst_rab_template;
use crate::engine::models::{EngineSnapshot, WbsNode};

/// World implementasi untuk typst-0.11.
struct TypstWorld {
    library: Prehashed<Library>,
    book: Prehashed<FontBook>,
    fonts: Vec<Font>,
    source: typst::syntax::Source,
}

impl TypstWorld {
    fn new(typst_source: &str) -> Result<Self, String> {
        let library = Library::default();
        let prehashed_lib = Prehashed::new(library);

        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        // Muat seluruh font sistem ke typst FontBook + simpan untuk lookup index.
        let mut book = FontBook::new();
        let mut fonts: Vec<Font> = Vec::new();
        for face in db.faces() {
            let font = db.with_face_data(face.id, |data, face_index| {
                Font::new(Bytes::from(data.to_vec()), face_index)
            });
            if let Some(Some(font)) = font {
                book.push(font.info().clone());
                fonts.push(font);
            }
        }

        if fonts.is_empty() {
            return Err("tidak ada font sistem yang dapat dimuat".to_string());
        }

        let prehashed_book = Prehashed::new(book);
        let source = typst::syntax::Source::detached(typst_source);

        Ok(Self {
            library: prehashed_lib,
            book: prehashed_book,
            fonts,
            source,
        })
    }
}

impl World for TypstWorld {
    fn library(&self) -> &Prehashed<Library> {
        &self.library
    }

    fn book(&self) -> &Prehashed<FontBook> {
        &self.book
    }

    fn main(&self) -> typst::syntax::Source {
        self.source.clone()
    }

    fn source(&self, _id: FileId) -> Result<typst::syntax::Source, FileError> {
        Err(FileError::NotFound(PathBuf::new()))
    }

    fn file(&self, _id: FileId) -> Result<Bytes, FileError> {
        Err(FileError::NotFound(PathBuf::new()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        Datetime::from_ymd(2026, 11, 1)
    }

    fn packages(&self) -> &[(PackageSpec, Option<EcoString>)] {
        &[]
    }
}

/// Render template typst RAB menjadi bytes PDF (untuk preview in-app).
pub fn render_rab_pdf_bytes(
    snapshot: &EngineSnapshot,
    nodes: &[WbsNode],
) -> Result<Vec<u8>, String> {
    let source = build_typst_rab_template(snapshot, nodes);
    let world = TypstWorld::new(&source).map_err(|e| format!("gagal buat world typst: {e}"))?;
    let mut tracer = Tracer::new();

    let doc = compile(&world, &mut tracer)
        .map_err(|e| format!("gagal kompilasi typst: {e:?}"))?;

    Ok(pdf(&doc, Smart::Auto, None))
}

/// Render template typst RAB ke berkas PDF.
pub fn render_rab_pdf(
    path: &Path,
    snapshot: &EngineSnapshot,
    nodes: &[WbsNode],
) -> Result<u32, String> {
    let pdf_bytes = render_rab_pdf_bytes(snapshot, nodes)?;
    std::fs::write(path, &pdf_bytes).map_err(|e| format!("gagal tulis berkas PDF: {e}"))?;
    Ok(pdf_bytes.len() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::calc;

    fn sample_nodes() -> (EngineSnapshot, Vec<WbsNode>) {
        let _conn = crate::engine::db::open(std::path::Path::new(":memory:")).unwrap();
        let (nodes, roots) = crate::engine::seed::sample();
        let mut map: std::collections::HashMap<String, WbsNode> = nodes
            .iter()
            .cloned()
            .map(|node| (node.id.clone(), node))
            .collect();
        calc::rollup_all(&mut map);
        let ordered: Vec<WbsNode> = calc::ordered_nodes(&map, &roots)
            .into_iter()
            .map(|(node, _)| node)
            .collect();
        let snapshot = EngineSnapshot {
            nodes: ordered.clone(),
            roots,
            total_cost: ordered.iter().map(|n| n.total_price).sum::<f64>(),
            overhead_percent: 10.0,
            ppn_percent: 11.0,
            can_undo: false,
            can_redo: false,
        };
        (snapshot, ordered)
    }

    #[test]
    fn render_rab_pdf_roundtrip() {
        let (snapshot, nodes) = sample_nodes();
        let tmp = std::env::temp_dir().join("constructsee_rab_test.pdf");
        let bytes = render_rab_pdf(&tmp, &snapshot, &nodes).expect("render gagal");
        assert!(bytes > 0);

        // PDF RAB lengkap (tabel + header/footer + teks) harus jauh lebih besar
        // dari sekadar beberapa garis. ini menangkap regresi "PDF kosong".
        assert!(
            bytes > 8_000,
            "PDF terlalu kecil ({bytes} byte) — kemungkinan teks tidak ter-render"
        );

        // PDF valid diawali magic %PDF- dan berakhir %%EOF.
        let data = std::fs::read(&tmp).expect("baca pdf");
        assert!(data.starts_with(b"%PDF-"), "bukan berkas PDF yang valid");
        assert!(
            data.windows(5).any(|w| w == b"%%EOF"),
            "PDF tidak memiliki penutup %%EOF"
        );

        let _ = std::fs::remove_file(&tmp);
    }
}
